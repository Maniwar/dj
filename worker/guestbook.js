// Guestbook intake — Cloudflare Worker.
//
// Receives a submission from club-humidity.com, screens it, and opens an issue in a PRIVATE
// GitHub repo. Nothing is stored here and nothing is published: the public wall stays a static
// file in the site build, so an approved entry only appears when it is committed. That is the
// whole design — spam cannot reach the site because publishing requires a human and a git push.
//
// WHY A WORKER AT ALL, when the form could POST to GitHub directly?
//
// Because a GitHub token that can open issues must never be in the browser. This is the one place
// a secret can live that the visitor cannot read. It is also the only place limits can be
// enforced: anything checked in the page is checked by code the submitter controls.
//
// DEPLOY
//   cd worker
//   npx wrangler secret put GITHUB_TOKEN      # fine-grained PAT, Issues:write on the queue repo ONLY
//   npx wrangler secret put TURNSTILE_SECRET  # from the Cloudflare Turnstile dashboard
//   npx wrangler deploy

const MAX_NAME = 40
const MAX_BODY = 280

// Spam that bothers with a guestbook is nearly always after a link. Rejecting anything that looks
// like a URL removes the motive rather than the symptom, and costs a real visitor nothing — there
// is no reason to put a link in a message to a fictional Eurodance duo.
const LOOKS_LIKE_URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|cn|io|xyz|top|shop|info|biz)\b)/i

const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'cache-control': 'no-store',
    },
  })

// ---- LIKE COUNTS: WHY THIS IS ONE get() AND NOT ONE list() -------------------------------------
//
// The first version stored each post's count in the METADATA of its own `like:<id>` key and read
// the whole map with a single `list({ prefix: 'like:' })`, on the grounds that list() returns names
// AND metadata together, so one call replaces N reads. That is true, and it was still the wrong
// trade, because the two quotas are not the same size. Workers free plan, per day:
//
//     reads 100,000   ·   writes 1,000   ·   deletes 1,000   ·   LIST REQUESTS 1,000
//
// GET /likes runs on every page view, so the site had a hard ceiling of roughly 1,000 views a day,
// and then Cloudflare cut the namespace off:
//   "You have exceeded the daily Workers KV free tier limit of 1000 list operations."
// It saved ~10 reads out of a budget of 100,000 by spending 1 list out of a budget of 1,000 — a
// hundred times worse per call, on the hottest path on the site. The `cache-control: max-age=30`
// on the response did not soften it either: max-age is BROWSER-only, so every new visitor was a
// fresh list.
//
// So the whole map now lives in ONE key, `likes:all`, as a JSON {postId: count} object, and
// GET /likes is a single get(). One operation per uncached view either way — but drawn on the
// quota with a hundred times the room. Measured on the harness (worker/test/likes-ops.mjs):
// 10 sequential cold GETs went from 10 list + 0 get to 1 list + 1 get, and then 0 + 0.
//
// THE PER-POST `like:<id>` KEYS ARE KEPT and are still the source of truth. They are what makes
// the aggregate rebuildable: if `likes:all` is missing or unparseable, ONE list() reassembles it
// and stores it. That list is the only one left in the system and it runs approximately never.
// (`likes:all` is deliberately not matched by prefix `like:` — its fifth character is `s`, not `:`
// — so the rebuild can never read its own output back in as if it were a post.)
//
// THE TRADE, stated plainly, because it is a real regression and not a free win: the aggregate is
// one value read-modify-written, so two people liking DIFFERENT posts inside the propagation
// window can now lose one increment, where a key per post could not. That is the same reasoning
// this file already records about KV having no atomic counter — hearts on a joke guestbook are not
// worth the complexity of a Durable Object — and it is bounded twice over: the per-post key never
// loses an increment, and the aggregate entry for a post is recomputed FROM that key on its next
// like, so a lost update self-heals as soon as anyone likes the same post again.
//
// The other half of the trade is writes. POST /like now costs 3 writes (rate key, post key,
// aggregate) instead of 2, so the write quota allows ~333 likes/day instead of ~500. Writes were
// already the binding constraint on that path; reads and lists were the ones being burned by
// people who were only LOOKING.
const LIKES_KEY = 'likes:all'
const LIKES_PREFIX = 'like:'
const LIKES_BROWSER_TTL = 30 // seconds — unchanged; only ever helped a returning visitor
const LIKES_EDGE_TTL = 60 // seconds — caps origin reads near 1,440/day however much traffic arrives
const LIKES_MEMO_TTL = 60_000 // ms; matches the edge TTL, and KV's own read cache is 60s anyway
const LIKES_REBUILD_COOLDOWN = 300_000 // ms — see rebuildLikes()

// THREE LAYERS IN FRONT OF THAT get(), because one is not enough here:
//
//   1. ISOLATE MEMORY (below). A copy of the map held for 60s. This is the layer that actually
//      works TODAY: the Worker is deployed on *.workers.dev, and Cache API operations are
//      documented as having no effect on workers.dev deployments — only Workers on a custom domain
//      get a functional edge cache. Without this layer, part 2 would be a no-op in production.
//   2. CACHE API (caches.default) at s-maxage=60. Inert on workers.dev, live the moment this
//      Worker is put on a route under club-humidity.com — worth doing, because it is the only
//      layer that absorbs the REQUEST as well as the KV read.
//   3. The browser, max-age=30.
//
// Module-level mutable state is normally a Workers anti-pattern, because request-scoped data can
// leak between requests. It is safe HERE, and only here, because the value is public, identical
// for every visitor, and derived from nothing in the request.
//
// `map` is kept even after it goes stale so that a KV failure can be served from it — stale hearts
// beat no hearts, and a 429 from KV must never reach the page as a broken counter.
let likesMemo = { at: 0, map: null }
let likesRebuiltAt = 0

/** The only list() left. Reassembles the aggregate from the per-post keys and stores it.
 *
 *  Cooldowned per isolate because a MISSING key is negatively cached by KV for its 60s read TTL:
 *  without the latch, every request in that colo for a minute would list again and we would be
 *  straight back to the quota block that caused all this. One list per isolate per 5 minutes is
 *  the ceiling, and the normal case is one list ever — on the first like after a deploy. */
async function rebuildLikes(env) {
  const map = {}
  let cursor
  // Paginated on purpose: list() returns at most 1,000 keys. A truncated rebuild would silently
  // zero every post past the first page, which is worse than the missing aggregate it repairs.
  for (let page = 0; page < 10; page++) {
    const res = await env.RATE.list({ prefix: LIKES_PREFIX, cursor })
    for (const k of res.keys) map[k.name.slice(LIKES_PREFIX.length)] = k.metadata?.n ?? 0
    if (res.list_complete !== false) break
    cursor = res.cursor
    if (!cursor) break
    if (page === 9) console.error('likes rebuild truncated at 10 pages — aggregate may be short')
  }
  // Failing to store it is survivable: the map is still correct for this request, and the next
  // read tries again. Not letting it throw is the point — the caller must not lose a good map.
  try {
    await env.RATE.put(LIKES_KEY, JSON.stringify(map))
  } catch (err) {
    console.error('likes rebuild could not be stored:', err?.message ?? err)
  }
  return map
}

/** Reads the aggregate: isolate memory, then ONE get(), then a rebuild if it is missing.
 *
 *  Returns `degraded: true` when the map could not be established from storage. Callers must not
 *  write a degraded map back — an empty map written over a real one would zero every count. */
async function readLikes(env) {
  const now = Date.now()
  if (likesMemo.map && now - likesMemo.at < LIKES_MEMO_TTL) return { map: likesMemo.map, degraded: false }
  try {
    // Read as TEXT, not `'json'`: get(key,'json') throws on a corrupt value, which would land in
    // the catch below and be served as a degraded response forever. Parsing here means a corrupt
    // aggregate falls into the rebuild path instead, which is the thing that can actually fix it.
    const raw = await env.RATE.get(LIKES_KEY)
    let map = null
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed
      } catch {
        console.error('likes aggregate is not JSON — rebuilding from per-post keys')
      }
    }
    if (map) {
      likesMemo = { at: now, map }
      return { map, degraded: false }
    }
    if (now - likesRebuiltAt < LIKES_REBUILD_COOLDOWN)
      return { map: likesMemo.map ?? {}, degraded: true }
    likesRebuiltAt = now
    const rebuilt = await rebuildLikes(env)
    likesMemo = { at: now, map: rebuilt }
    return { map: rebuilt, degraded: false }
  } catch (err) {
    // FAIL SOFT. Quota exhaustion, a 429, a namespace that is briefly unreachable — none of these
    // may surface as a 5xx or a thrown exception, because the guestbook still has to render.
    console.error('likes read failed:', err?.message ?? err)
    return { map: likesMemo.map ?? {}, degraded: true }
  }
}

/** Edge cache key. The ORIGIN is part of it because the response carries a per-origin
 *  `access-control-allow-origin`: share one entry across origins and a single localhost dev
 *  request poisons it with `http://localhost:5173`, after which every real visitor fails CORS and
 *  sees no hearts at all. Query and everything else are normalised away so that a cache-busting
 *  parameter cannot be used to force origin reads. */
const likesCacheKey = (request, origin) =>
  new Request(new URL(`/likes?o=${encodeURIComponent(origin)}`, request.url), { method: 'GET' })

const likesResponse = (map, cors, degraded) =>
  new Response(JSON.stringify(map), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': cors,
      vary: 'origin',
      // A degraded answer is cached only briefly: long enough to stop a KV outage being hammered,
      // short enough that recovery is not held back by our own cache.
      'cache-control': degraded
        ? 'public, max-age=5, s-maxage=10'
        : `public, max-age=${LIKES_BROWSER_TTL}, s-maxage=${LIKES_EDGE_TTL}`,
    },
  })

export default {
  async fetch(request, env, ctx) {
    // Only the site may call this. Not a security boundary on its own — a script can send any
    // Origin it likes — but it stops the endpoint being casually embedded in someone else's page.
    const allowed = (env.ALLOWED_ORIGIN || 'https://club-humidity.com').split(',').map((s) => s.trim())
    const origin = request.headers.get('Origin') || ''
    const cors = allowed.includes(origin) ? origin : allowed[0]

    // 204 must have NO body — constructing a Response with one throws, and the Worker then
    // returns 500 to the preflight, which the browser reports only as a generic network failure.
    // That is why a broken preflight is so easy to misread as "the endpoint is unreachable".
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': cors,
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-max-age': '86400',
        },
      })
    const path = new URL(request.url).pathname

    // ---- LIKES ---------------------------------------------------------------------------------
    // Read path: edge cache → isolate memory → ONE KV get(). See the block above LIKES_KEY for why
    // this used to be a list() and what that cost.
    if (path === '/likes' && request.method === 'GET') {
      if (!env.RATE) return json({}, 200, cors)
      const cacheKey = likesCacheKey(request, cors)
      // Every cache call is wrapped: on workers.dev these are no-ops rather than errors, but a
      // cache that throws must not be the reason a visitor sees no hearts.
      try {
        const hit = await caches.default.match(cacheKey)
        if (hit) return hit
      } catch (err) {
        console.error('likes cache read failed:', err?.message ?? err)
      }
      const { map, degraded } = await readLikes(env)
      const res = likesResponse(map, cors, degraded)
      try {
        // clone() because put() consumes the body — returning the same Response after putting it
        // would send an empty one. waitUntil so the store never delays the answer.
        const stored = caches.default.put(cacheKey, res.clone())
        if (ctx?.waitUntil) ctx.waitUntil(stored)
        else await stored
      } catch (err) {
        console.error('likes cache write failed:', err?.message ?? err)
      }
      return res
    }

    if (path === '/like' && request.method === 'POST') {
      if (!env.RATE) return json({ ok: true, n: 0 }, 200, cors)
      let id
      try {
        id = String((await request.json()).id || '')
      } catch {
        return json({ error: 'bad json' }, 400, cors)
      }
      // Only ids that look like published posts. Local-only entries are invisible to everyone
      // else, so a shared counter on one would be counting an audience of one.
      if (!/^[a-z0-9][a-z0-9-]{1,60}$/i.test(id) || id.startsWith('me-'))
        return json({ error: 'unknown post' }, 400, cors)

      // No Turnstile here on purpose — a challenge per heart would be a worse experience than the
      // feature is worth. A per-IP hourly cap is the proportionate control for a number.
      //
      // The cap FAILS OPEN. If KV cannot be reached the limit cannot be enforced, and refusing the
      // like instead would trade a number nobody can abuse for a visibly broken button.
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const lk = `lrate:${ip}`
      try {
        const used = Number((await env.RATE.get(lk)) || 0)
        if (used >= 60) return json({ error: 'slow down' }, 429, cors)
        await env.RATE.put(lk, String(used + 1), { expirationTtl: 3600 })
      } catch (err) {
        console.error('like rate limit unavailable, allowing:', err?.message ?? err)
      }

      // The per-post key stays the source of truth and is written FIRST. If everything after this
      // fails, the increment still exists and a rebuild can still find it.
      const key = `${LIKES_PREFIX}${id}`
      let n = 0
      try {
        const cur = await env.RATE.getWithMetadata(key)
        n = (cur.metadata?.n ?? 0) + 1
        await env.RATE.put(key, '', { metadata: { n } })
      } catch (err) {
        // Never a 5xx for a heart. The page keeps its optimistic +1 and the count settles on the
        // next successful read.
        console.error('like write failed:', err?.message ?? err)
        return json({ ok: true, n }, 200, cors)
      }

      const { map, degraded } = await readLikes(env)
      if (degraded) {
        // CRITICAL: do not write a map we could not read. Writing {} over a live aggregate would
        // zero every post's count, turning a transient KV failure into permanent data loss. The
        // per-post keys survive, so leaving the aggregate alone loses nothing that a later rebuild
        // cannot recover.
        console.error('likes aggregate not readable — skipping rewrite to avoid zeroing counts')
      } else {
        // Recomputed FROM the per-post key, not incremented in place: that is what makes a lost
        // update self-heal, because whatever the aggregate said about this post is now overwritten
        // with the truth.
        const next = { ...map, [id]: n }
        // Memory first, so a failed put still leaves THIS isolate answering correctly.
        likesMemo = { at: Date.now(), map: next }
        try {
          await env.RATE.put(LIKES_KEY, JSON.stringify(next))
        } catch (err) {
          // Same-key writes are capped at 1/second by KV, so a burst of hearts will land here.
          // Survivable by design: the per-post key already holds the truth and the next like of
          // this post writes it again.
          console.error('likes aggregate rewrite failed:', err?.message ?? err)
        }
      }

      // PURGE THE EDGE, or a new heart takes up to a minute to appear and gets reported as broken.
      // Every allowed origin is purged because the origin is part of the cache key. cache.delete()
      // only affects the data centre this Worker ran in — which is the one that will serve this
      // visitor's next GET, so it is exactly the case that matters. Other colos hold their entry
      // for up to s-maxage, the same order as KV's own 60s read cache; there is no way to beat that
      // without a Durable Object.
      for (const o of allowed) {
        try {
          await caches.default.delete(likesCacheKey(request, o))
        } catch (err) {
          console.error('likes cache purge failed:', err?.message ?? err)
        }
      }
      return json({ ok: true, n }, 200, cors)
    }

    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors)
    if (origin && !allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403, cors)

    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ error: 'bad json' }, 400, cors)
    }

    const { name = '', body = '', website = '', token = '' } = payload

    // HONEYPOT. `website` is rendered but hidden from people; a bot filling every field trips it.
    // Answer 200 with ok:true deliberately — telling a bot it failed teaches it to retry. Letting
    // it believe it succeeded means it stops, and the entry simply goes nowhere.
    if (website) return json({ ok: true }, 200, cors)

    const clean = String(body).trim()
    const who = String(name).trim().slice(0, MAX_NAME)
    if (!clean) return json({ error: 'empty' }, 400, cors)
    if (clean.length > MAX_BODY) return json({ error: `max ${MAX_BODY} characters` }, 400, cors)
    if (LOOKS_LIKE_URL.test(clean) || LOOKS_LIKE_URL.test(who))
      return json({ error: 'links are not allowed' }, 400, cors)

    // TURNSTILE. The real defence — everything above is cheap screening for what gets past it.
    // Required whenever the secret is configured; a missing secret means a local dev run, not an
    // invitation to skip verification in production.
    if (env.TURNSTILE_SECRET) {
      const form = new FormData()
      form.append('secret', env.TURNSTILE_SECRET)
      form.append('response', token)
      const ip = request.headers.get('CF-Connecting-IP')
      if (ip) form.append('remoteip', ip)
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
      }).then((r) => r.json())
      if (!verify.success) {
        // siteverify names its own cause in error-codes, and the distinctions matter:
        //   invalid-input-secret   → TURNSTILE_SECRET is wrong, or belongs to another widget
        //   invalid-input-response → the token is malformed or empty
        //   timeout-or-duplicate   → token already spent, or older than ~5 minutes
        // Logged rather than returned: the browser gets a generic message, the operator gets
        // the actual reason. Guessing between these three costs a deploy cycle each time.
        const codes = (verify['error-codes'] || []).join(', ')
        console.error('turnstile rejected:', codes || JSON.stringify(verify))
        // The code is surfaced to the browser deliberately. It names nothing sensitive — it says
        // which of secret/token/expiry is wrong, never their values — and without it every failure
        // looks identical from the outside, which is what turned this into several blind rounds.
        return json({ error: `verification failed${codes ? ` (${codes})` : ''}` }, 403, cors)
      }
    }

    // ---- FLOOD CONTROL -----------------------------------------------------------------------
    // Turnstile stops automation, so anything reaching here is either a person or someone paying
    // to solve challenges. Neither should be able to file an unbounded number of issues.
    //
    // Two limits, because they fail differently. PER-IP catches one person hammering the form and
    // is trivially evaded by rotating addresses. The GLOBAL DAILY CAP is the one that actually
    // holds: whatever the source, the queue cannot receive more than a fixed number of issues in a
    // day. Losing a few genuine entries during an attack is a far better outcome than ten thousand
    // issues to bulk-close, and a guestbook on a joke site does not legitimately see 200 signatures
    // in a day.
    if (env.RATE) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const perIp = Number((await env.RATE.get(`gb:ip:${ip}`)) || 0)
      if (perIp >= 5) return json({ error: 'slow down — try again later' }, 429, cors)

      const day = new Date().toISOString().slice(0, 10)
      const cap = Number(env.DAILY_CAP || 200)
      const today = Number((await env.RATE.get(`gb:day:${day}`)) || 0)
      if (today >= cap) {
        // Answer as though it worked, for the same reason the honeypot does: an attacker who sees
        // failure adapts, one who sees success moves on. The entry is simply dropped.
        console.warn(`daily cap ${cap} reached — dropping submissions`)
        return json({ ok: true }, 200, cors)
      }

      await env.RATE.put(`gb:ip:${ip}`, String(perIp + 1), { expirationTtl: 3600 })
      await env.RATE.put(`gb:day:${day}`, String(today + 1), { expirationTtl: 172800 })
    }

    const repo = env.QUEUE_REPO || 'Maniwar/club-humidity-guestbook'
    const country = request.cf?.country || '??'

    const issue = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'club-humidity-guestbook',
      },
      body: JSON.stringify({
        title: `${who || 'anonymous'}: ${clean.slice(0, 60)}${clean.length > 60 ? '…' : ''}`,
        // The body is fenced so that whatever someone types renders as text — a submission full of
        // markdown, or an @mention that would notify a real person, stays inert in the issue.
        body: [
          '**Name**',
          '```',
          who || '(none)',
          '```',
          '**Message**',
          '```',
          clean,
          '```',
          `\n_${country} · via club-humidity.com_`,
          '\nApprove by adding it to `src/data/guestbook.seed.ts` and deploying, then close this issue.',
        ].join('\n'),
        labels: ['submission'],
      }),
    })

    if (!issue.ok) {
      // Never leak GitHub's response to the browser — it can include repo and token detail.
      console.error('github issue failed', issue.status, await issue.text())
      return json({ error: 'could not submit, try later' }, 502, cors)
    }

    // The country comes back so the site can flag the post with where it was signed from.
    // Cloudflare resolves it at the edge, which is the only place it is knowable — the browser
    // cannot tell you this without a third-party geo lookup, and that would be a request to
    // somebody else's server on every page view.
    return json({ ok: true, country }, 200, cors)
  },
}
