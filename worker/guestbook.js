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

export default {
  async fetch(request, env) {
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

    return json({ ok: true }, 200, cors)
  },
}
