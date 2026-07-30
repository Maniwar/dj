// KV OPERATION COUNTER for the guestbook Worker's like counts.
//
// WHY THIS EXISTS. The like counts burned the Workers KV free tier's 1,000-list-per-day quota and
// Cloudflare cut the namespace off mid-day. The bug was invisible to reading the code — the list()
// looked like an optimisation, and it was, against the wrong quota. So the fix is verified by
// COUNTING OPERATIONS against a stubbed binding rather than by inspection, and the baseline is the
// real previous version of the file, pulled straight out of git.
//
// Run:  node worker/test/likes-ops.mjs
// No deploy, no wrangler, no network, no secrets. Every KV call and every Cache API call is
// intercepted and tallied.
//
// WHAT IS STUBBED, and how faithfully:
//   KV        get / getWithMetadata / put / list / delete, with per-op counters. list() paginates
//             at a configurable page size so the rebuild's cursor loop is actually exercised.
//   caches    default.match / put / delete, honouring the cache key URL and s-maxage. Runs in two
//             modes: `edge` (Worker on a custom domain) and `inert` (a *.workers.dev deployment,
//             where Cloudflare documents Cache API operations as having no effect). Production is
//             on workers.dev today, so `inert` is the mode that describes the live site.
//   fetch     stubbed only for the submission path, so the audit can count KV ops on POST / without
//             calling GitHub. GITHUB_TOKEN and TURNSTILE_SECRET are never read: no secret is
//             needed to count operations, and the harness must be runnable by anyone.
//
// A FRESH ISOLATE is simulated by re-importing the module with a unique query string, which resets
// its module-level memo. That distinction is the whole point of several of these cases: an isolate
// that stays warm hides exactly the cost this test is meant to measure.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = new URL('.', import.meta.url)
const WORKER = new URL('../guestbook.js', HERE)
const PROD = 'https://club-humidity.com'
const DEV = 'http://localhost:5173'
const ALLOWED_ORIGIN = `${PROD},http://localhost:4173,${DEV}`
const BASE = 'https://club-humidity-guestbook.example.workers.dev'

let failures = 0
let checks = 0
const ok = (cond, label, detail = '') => {
  checks++
  if (!cond) failures++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
const eq = (actual, expected, label) =>
  ok(actual === expected, label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

// ---- STUB KV -----------------------------------------------------------------------------------

function makeKV({ store = new Map(), pageSize = 1000, fail = null } = {}) {
  const ops = { get: 0, getWithMetadata: 0, put: 0, list: 0, delete: 0 }
  // `fail` is read off the object, not off the closed-over argument, so a test can start failing KV
  // part-way through. Reading the argument instead made one assertion pass for the wrong reason:
  // it never reached KV at all because the memo was still fresh.
  const boom = (op) => {
    const f = api.fail
    if (f && (f === true || f.includes(op)))
      throw new Error('KV op failed: 429 Too Many Requests — daily free tier limit exceeded')
  }
  const api = {
    ops,
    store,
    fail,
    async get(key) {
      ops.get++
      boom('get')
      return store.has(key) ? store.get(key).value : null
    },
    async getWithMetadata(key) {
      ops.getWithMetadata++
      boom('getWithMetadata')
      const e = store.get(key)
      return { value: e ? e.value : null, metadata: e ? (e.metadata ?? null) : null }
    },
    async put(key, value, opts = {}) {
      ops.put++
      boom('put')
      store.set(key, { value: String(value), metadata: opts.metadata ?? null })
    },
    async delete(key) {
      ops.delete++
      boom('delete')
      store.delete(key)
    },
    async list({ prefix = '', cursor } = {}) {
      ops.list++
      boom('list')
      const names = [...store.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? names.indexOf(cursor) : 0
      const page = names.slice(start, start + pageSize)
      const next = names[start + pageSize]
      return {
        keys: page.map((name) => ({ name, metadata: store.get(name).metadata ?? undefined })),
        list_complete: next === undefined,
        cursor: next,
      }
    },
  }
  return api
}

// Lets a test walk past the 60s isolate-memo TTL without sleeping. The memo is module-private by
// design — nothing here reaches into the Worker's internals, it just moves the clock the Worker
// reads.
const realNow = Date.now
let clockOffset = 0
Date.now = () => realNow() + clockOffset
const advance = (ms) => {
  clockOffset += ms
}

// ---- STUB CACHE API ----------------------------------------------------------------------------

function installCaches(mode) {
  const entries = new Map()
  const stats = { match: 0, hit: 0, put: 0, delete: 0, purged: 0 }
  const sMaxAge = (cc) => {
    const m = /s-maxage=(\d+)/.exec(cc || '')
    return m ? Number(m[1]) * 1000 : 0
  }
  const impl = {
    async match(req) {
      stats.match++
      if (mode === 'inert') return undefined
      const e = entries.get(req.url)
      if (!e) return undefined
      if (Date.now() > e.expires) {
        entries.delete(req.url)
        return undefined
      }
      stats.hit++
      return new Response(e.body, { status: e.status, headers: e.headers })
    },
    async put(req, res) {
      stats.put++
      if (mode === 'inert') return undefined // documented behaviour on *.workers.dev
      const cc = res.headers.get('cache-control') || ''
      const body = await res.text()
      entries.set(req.url, {
        body,
        status: res.status,
        headers: [...res.headers],
        expires: Date.now() + sMaxAge(cc),
      })
      return undefined
    },
    async delete(req) {
      stats.delete++
      if (mode === 'inert') return false
      const had = entries.delete(req.url)
      if (had) stats.purged++
      return had
    },
  }
  globalThis.caches = { default: impl, open: async () => impl }
  return { stats, entries }
}

// ---- LOADING THE WORKER ------------------------------------------------------------------------

let isolateSeq = 0
/** A cold isolate: module-level state (the memo, the rebuild latch) starts empty. */
const coldWorker = async (url = WORKER) => (await import(`${url}?isolate=${++isolateSeq}`)).default

const env = (kv, extra = {}) => ({ RATE: kv, ALLOWED_ORIGIN, ...extra })

// waitUntil work is GUARANTEED to run by the runtime, so the harness must wait for it before it
// inspects the cache. Without this the edge-cache assertions race the cache.put() and fail
// intermittently — which is a bug in the test, not in the Worker, and exactly the kind of flake
// that gets a real finding dismissed.
const pending = []
const ctx = { waitUntil: (p) => void pending.push(Promise.resolve(p).catch(() => {})) }
const settle = async () => {
  while (pending.length) await pending.shift()
}

const send = async (worker, req, e) => {
  const res = await worker.fetch(req, e, ctx)
  await settle()
  return res
}

const getLikes = (worker, e, origin = PROD) =>
  send(worker, new Request(`${BASE}/likes`, { headers: { Origin: origin } }), e)

const postLike = (worker, e, id, { ip = '1.2.3.4', origin = PROD } = {}) =>
  send(
    worker,
    new Request(`${BASE}/like`, {
      method: 'POST',
      headers: { Origin: origin, 'content-type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ id }),
    }),
    e,
  )

/** Seeded namespace: three published posts with counts, exactly as the old design left it — the
 *  per-post keys carry the count in metadata and there is no aggregate. */
const seeded = () =>
  new Map([
    ['like:sub-woofer-stan', { value: '', metadata: { n: 7 } }],
    ['like:dialup-deb', { value: '', metadata: { n: 3 } }],
    ['like:euro-trash-420', { value: '', metadata: { n: 11 } }],
  ])

const withAggregate = () => {
  const s = seeded()
  s.set('likes:all', {
    value: JSON.stringify({ 'sub-woofer-stan': 7, 'dialup-deb': 3, 'euro-trash-420': 11 }),
    metadata: null,
  })
  return s
}

// ---- BASELINE: the version that was blocked ----------------------------------------------------

const baselinePath = join(tmpdir(), 'club-humidity-likes-baseline')
mkdirSync(baselinePath, { recursive: true })
const baselineFile = join(baselinePath, 'guestbook.head.mjs')
writeFileSync(
  baselineFile,
  execFileSync('git', ['show', 'HEAD:worker/guestbook.js'], {
    cwd: new URL('../..', HERE).pathname,
    encoding: 'utf8',
  }),
)
const BASELINE = pathToFileURL(baselineFile).href

const N = 10

async function measureBaseline() {
  console.log(`\nBEFORE — HEAD:worker/guestbook.js, ${N} sequential GET /likes`)
  installCaches('inert')
  const kv = makeKV({ store: seeded() })
  const e = env(kv)
  const worker = await coldWorker(BASELINE)
  let body
  for (let i = 0; i < N; i++) body = await (await getLikes(worker, e)).json()
  console.log(`  ops: ${JSON.stringify(kv.ops)}`)
  eq(kv.ops.list, N, `baseline spends one list PER REQUEST (${N} views = ${N} lists)`)
  eq(body['euro-trash-420'], 11, 'baseline returns the counts')
  console.log(
    `  → 1,000 lists/day free tier ÷ ${kv.ops.list / N} list per view = ${1000 / (kv.ops.list / N)} views/day before the namespace is cut off`,
  )
  return kv.ops
}

// ---- AFTER -------------------------------------------------------------------------------------

async function warmIsolate() {
  console.log(`\nAFTER — one warm isolate, ${N} sequential GET /likes (cache inert, i.e. workers.dev)`)
  installCaches('inert')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  const worker = await coldWorker()
  let body
  for (let i = 0; i < N; i++) body = await (await getLikes(worker, e)).json()
  console.log(`  ops: ${JSON.stringify(kv.ops)}`)
  eq(kv.ops.list, 0, 'zero lists')
  eq(kv.ops.get, 1, `one get for ${N} requests — the rest come from isolate memory`)
  eq(body['euro-trash-420'], 11, 'still returns the counts')
  return kv.ops
}

async function coldIsolatesInert() {
  console.log(`\nAFTER — ${N} COLD isolates (worst case on workers.dev: no edge cache, no memo)`)
  installCaches('inert')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  for (let i = 0; i < N; i++) await getLikes(await coldWorker(), e)
  console.log(`  ops: ${JSON.stringify(kv.ops)}`)
  eq(kv.ops.list, 0, 'zero lists even with nothing cached anywhere')
  eq(kv.ops.get, N, `${N} reads — drawn on the 100,000/day quota, not the 1,000/day one`)
  console.log(`  → 100,000 reads/day ÷ 1 read per cold view = 100,000 views/day (was 1,000)`)
  return kv.ops
}

async function coldIsolatesEdge() {
  console.log(`\nAFTER — ${N} cold isolates WITH a functional edge cache (Worker on a custom domain)`)
  const { stats } = installCaches('edge')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  for (let i = 0; i < N; i++) await getLikes(await coldWorker(), e)
  console.log(`  ops: ${JSON.stringify(kv.ops)}  cache: ${JSON.stringify(stats)}`)
  eq(kv.ops.get, 1, `one KV read for ${N} cold isolates — ${N - 1} served by the edge`)
  eq(stats.hit, N - 1, 'edge served the rest')
  console.log(`  → s-maxage=60 caps origin reads near 1,440/day however much traffic arrives`)
  return kv.ops
}

async function coldRebuild() {
  console.log('\nAFTER — aggregate MISSING (first run, or someone deleted it): exactly one list')
  installCaches('inert')
  const kv = makeKV({ store: seeded() }) // per-post keys only, no aggregate
  const e = env(kv)
  const worker = await coldWorker()
  const first = await (await getLikes(worker, e)).json()
  const afterFirst = { ...kv.ops }
  for (let i = 1; i < N; i++) await getLikes(worker, e)
  console.log(`  ops after 1st: ${JSON.stringify(afterFirst)}   after ${N}: ${JSON.stringify(kv.ops)}`)
  eq(afterFirst.list, 1, 'the cold rebuild costs ONE list')
  eq(kv.ops.list, 1, `still one list after ${N} requests — never repeated`)
  eq(afterFirst.put, 1, 'the rebuilt aggregate is stored so the list is not needed again')
  eq(first['euro-trash-420'], 11, 'rebuilt map matches the per-post keys')
  eq(
    kv.store.get('likes:all').value,
    JSON.stringify({ 'dialup-deb': 3, 'euro-trash-420': 11, 'sub-woofer-stan': 7 }),
    'aggregate persisted',
  )
  ok(kv.store.has('like:euro-trash-420'), 'per-post keys are NOT deleted — they stay the source of truth')
  return kv.ops
}

async function rebuildPaginates() {
  console.log('\nAFTER — rebuild pages through a namespace bigger than one list() page')
  installCaches('inert')
  const store = new Map()
  for (let i = 0; i < 25; i++) store.set(`like:post-${String(i).padStart(2, '0')}`, { value: '', metadata: { n: i } })
  const kv = makeKV({ store, pageSize: 10 })
  const body = await (await getLikes(await coldWorker(), env(kv))).json()
  console.log(`  ops: ${JSON.stringify(kv.ops)}  keys returned: ${Object.keys(body).length}`)
  eq(Object.keys(body).length, 25, 'every post is in the rebuilt map, not just the first page')
  eq(body['post-24'], 24, 'last page included')
  eq(kv.ops.list, 3, '25 keys at 10 per page = 3 list calls, then never again')
}

async function rebuildCooldown() {
  console.log('\nAFTER — aggregate permanently missing: the rebuild latch stops a list storm')
  installCaches('inert')
  const kv = makeKV({ store: seeded() })
  const e = env(kv)
  const worker = await coldWorker()
  // Wipe the aggregate after every request, so every request finds it missing — the exact shape of
  // KV negatively caching a missing key for 60s while traffic keeps arriving.
  for (let i = 0; i < 20; i++) {
    await getLikes(worker, e)
    kv.store.delete('likes:all')
  }
  console.log(`  ops: ${JSON.stringify(kv.ops)}`)
  eq(kv.ops.list, 1, '20 requests against a missing aggregate cost ONE list, not 20')
}

async function likeIsImmediate() {
  console.log('\nAFTER — POST /like then GET /likes: the new count is visible immediately')
  const { stats } = installCaches('edge')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  const worker = await coldWorker()

  const before = await (await getLikes(worker, e)).json()
  eq(before['dialup-deb'], 3, 'starting count')
  const opsBeforeLike = { ...kv.ops }

  const liked = await (await postLike(worker, e, 'dialup-deb')).json()
  eq(liked.n, 4, 'POST /like returns the incremented count')
  const likeOps = {
    get: kv.ops.get - opsBeforeLike.get,
    getWithMetadata: kv.ops.getWithMetadata - opsBeforeLike.getWithMetadata,
    put: kv.ops.put - opsBeforeLike.put,
    list: kv.ops.list - opsBeforeLike.list,
  }
  console.log(`  cost of one like: ${JSON.stringify(likeOps)}`)
  eq(likeOps.list, 0, 'a like costs no lists')
  eq(likeOps.put, 3, 'a like costs 3 writes: rate key, post key, aggregate')

  const after = await (await getLikes(worker, e)).json()
  eq(after['dialup-deb'], 4, 'GET /likes shows 4 straight away, NOT after the 60s TTL')
  eq(after['euro-trash-420'], 11, 'other posts are untouched')
  ok(stats.purged > 0, 'the edge entry was purged rather than left to expire')
  eq(kv.store.get('like:dialup-deb').metadata.n, 4, 'per-post key still carries the truth')
  eq(JSON.parse(kv.store.get('likes:all').value)['dialup-deb'], 4, 'aggregate rewritten')

  // Same thing from a cold isolate, so the answer cannot be coming from the memo alone.
  const cold = await (await getLikes(await coldWorker(), e)).json()
  eq(cold['dialup-deb'], 4, 'a cold isolate reads 4 from KV too')
}

async function likeSurvivesLostAggregateWrite() {
  console.log('\nAFTER — the aggregate write is lost (KV same-key 1/s cap): count self-heals')
  installCaches('inert')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  const worker = await coldWorker()
  const realPut = kv.put.bind(kv)
  kv.put = async (key, value, opts) => {
    if (key === 'likes:all') {
      kv.ops.put++
      throw new Error('KV PUT failed: 429 rate limited (1 write/second to the same key)')
    }
    return realPut(key, value, opts)
  }
  const r1 = await (await postLike(worker, e, 'dialup-deb')).json()
  eq(r1.n, 4, 'the like still succeeds — no 5xx, no exception')
  eq(kv.store.get('like:dialup-deb').metadata.n, 4, 'per-post key holds the truth regardless')
  eq(JSON.parse(kv.store.get('likes:all').value)['dialup-deb'], 3, 'aggregate is stale, as expected')

  kv.put = realPut
  const r2 = await (await postLike(worker, e, 'dialup-deb', { ip: '9.9.9.9' })).json()
  eq(r2.n, 5, 'next like reads the per-post key, so it does not compound the error')
  eq(
    JSON.parse(kv.store.get('likes:all').value)['dialup-deb'],
    5,
    'aggregate SELF-HEALS from the per-post key on the next like',
  )
}

async function failSoftOnRead() {
  console.log('\nAFTER — KV throws on every op: GET /likes must still answer 200 with usable JSON')
  installCaches('inert')
  const kv = makeKV({ store: withAggregate(), fail: true })
  const res = await getLikes(await coldWorker(), env(kv))
  const text = await res.text()
  eq(res.status, 200, 'status is 200, not 5xx')
  eq(res.headers.get('content-type'), 'application/json', 'content type is still JSON')
  let parsed
  ok(
    (() => {
      try {
        parsed = JSON.parse(text)
        return parsed && typeof parsed === 'object'
      } catch {
        return false
      }
    })(),
    'body parses as a JSON object',
    `body was ${text}`,
  )
  eq(res.headers.get('access-control-allow-origin'), PROD, 'CORS header still present, so the page can read it')
  ok(!/max-age=30/.test(res.headers.get('cache-control') || ''), 'degraded answers are cached briefly, not for 30s')
}

async function failSoftServesStale() {
  console.log('\nAFTER — KV starts failing AFTER a good read: the last known map is served')
  installCaches('inert')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  const worker = await coldWorker()
  eq((await (await getLikes(worker, e)).json())['euro-trash-420'], 11, 'good read first')
  const opsAfterGood = { ...kv.ops }
  // Past the 60s memo TTL, so the next request MUST go to KV and MUST fail. Without this the
  // request would be answered from fresh memory and the assertion would prove nothing.
  advance(61_000)
  kv.fail = true
  const stale = await (await getLikes(worker, e)).json()
  ok(kv.ops.get > opsAfterGood.get, 'the failing read really was attempted (memo had expired)')
  eq(stale['euro-trash-420'], 11, 'stale-if-error: the last good map is served, not {}')
  kv.fail = null
}

async function degradedLikeDoesNotZeroTheAggregate() {
  console.log('\nAFTER — a like while the aggregate is unreadable must NOT zero every count')
  installCaches('inert')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  const worker = await coldWorker()
  // getWithMetadata + put still work; only the aggregate read fails. This is the shape that would
  // have written {} over three live counts.
  const realGet = kv.get.bind(kv)
  kv.get = async (key) => {
    if (key === 'likes:all') {
      kv.ops.get++
      throw new Error('KV GET failed: 429 Too Many Requests')
    }
    return realGet(key)
  }
  const r = await (await postLike(worker, e, 'dialup-deb')).json()
  eq(r.n, 4, 'the like is accepted')
  const agg = JSON.parse(kv.store.get('likes:all').value)
  eq(agg['euro-trash-420'], 11, 'other counts survive')
  eq(Object.keys(agg).length, 3, 'the aggregate was left alone rather than replaced with one entry')
}

async function corsCacheKeyIsolation() {
  console.log('\nAFTER — the edge cache cannot be poisoned with another origin\'s CORS header')
  const { stats, entries } = installCaches('edge')
  const kv = makeKV({ store: withAggregate() })
  const e = env(kv)
  const dev = await getLikes(await coldWorker(), e, DEV)
  eq(dev.headers.get('access-control-allow-origin'), DEV, 'dev request gets the dev origin')
  const prod = await getLikes(await coldWorker(), e, PROD)
  eq(prod.headers.get('access-control-allow-origin'), PROD, 'production visitor is NOT served the dev header')
  eq(entries.size, 2, 'one edge entry per origin')
  eq(stats.hit, 0, 'neither request was served the other one')
  const again = await getLikes(await coldWorker(), e, PROD)
  eq(again.headers.get('access-control-allow-origin'), PROD, 'and the production entry is reused correctly')
  eq(stats.hit, 1, 'second production request hit the edge')
}

async function bodySurvivesCachePut() {
  console.log('\nAFTER — cache.put() consumes the body it is given, so the answer must be a clone')
  installCaches('edge')
  const kv = makeKV({ store: withAggregate() })
  const text = await (await getLikes(await coldWorker(), env(kv))).text()
  ok(text.length > 2, 'the response the visitor gets is not an empty body', `body was ${JSON.stringify(text)}`)
  eq(JSON.parse(text)['euro-trash-420'], 11, 'and it still contains the counts')
}

async function noBindingIsNotAnError() {
  console.log('\nAFTER — no KV binding at all (local dev): still a working, empty guestbook')
  installCaches('inert')
  const worker = await coldWorker()
  const res = await worker.fetch(new Request(`${BASE}/likes`, { headers: { Origin: PROD } }), { ALLOWED_ORIGIN }, ctx)
  eq(res.status, 200, 'still 200')
  eq(await res.text(), '{}', 'empty map')
}

// ---- AUDIT: every other KV op in the file ------------------------------------------------------

async function auditSubmissionPath() {
  console.log('\nAUDIT — POST / (a guestbook submission): which quotas does it draw on?')
  installCaches('inert')
  const kv = makeKV({ store: new Map() })
  const realFetch = globalThis.fetch
  let githubCalls = 0
  globalThis.fetch = async () => {
    githubCalls++
    return new Response(JSON.stringify({ number: 1 }), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  try {
    // No TURNSTILE_SECRET in env, so verification is skipped — the harness never needs a secret.
    const e = env(kv, { QUEUE_REPO: 'example/queue' })
    const worker = await coldWorker()
    for (let i = 0; i < 3; i++) {
      const req = new Request(BASE, {
        method: 'POST',
        headers: { Origin: PROD, 'content-type': 'application/json', 'CF-Connecting-IP': '5.5.5.5' },
        body: JSON.stringify({ name: 'deb', body: 'bass too loud' }),
      })
      const res = await send(worker, req, e)
      eq(res.status, 200, `submission ${i + 1} accepted`)
    }
    console.log(`  ops for 3 submissions: ${JSON.stringify(kv.ops)}  (github calls: ${githubCalls})`)
    eq(kv.ops.list, 0, 'the submission path performs ZERO lists — this is why signing kept working during the block')
    eq(kv.ops.get, 6, '2 reads per submission: per-IP counter and daily counter')
    eq(kv.ops.put, 6, '2 writes per submission: per-IP counter and daily counter')
    eq(kv.ops.delete, 0, 'no deletes anywhere in the file')
  } finally {
    globalThis.fetch = realFetch
  }
}

// ---- RUN ---------------------------------------------------------------------------------------

const before = await measureBaseline()
const warm = await warmIsolate()
const cold = await coldIsolatesInert()
const edge = await coldIsolatesEdge()
await coldRebuild()
await rebuildPaginates()
await rebuildCooldown()
await likeIsImmediate()
await likeSurvivesLostAggregateWrite()
await failSoftOnRead()
await failSoftServesStale()
await degradedLikeDoesNotZeroTheAggregate()
await corsCacheKeyIsolation()
await bodySurvivesCachePut()
await noBindingIsNotAnError()
await auditSubmissionPath()

const row = (label, ops) =>
  `  ${label.padEnd(46)} list ${String(ops.list).padStart(3)}   get ${String(ops.get).padStart(3)}`
console.log(`\n${'='.repeat(78)}\nGET /likes × ${N} — operations charged to KV`)
console.log(row('BEFORE (HEAD)  every view lists', before))
console.log(row('AFTER  warm isolate, no edge cache', warm))
console.log(row('AFTER  10 cold isolates, no edge cache', cold))
console.log(row('AFTER  10 cold isolates, edge cache live', edge))
console.log(
  `\n  Daily ceiling at 1 GET /likes per page view:\n` +
    `    BEFORE  1,000 lists/day  ÷ 1 list per view  =     1,000 views/day, then KV is cut off\n` +
    `    AFTER   100,000 reads/day ÷ 1 read per cold view = 100,000 views/day worst case\n` +
    `            with the edge cache live: ~1,440 reads/day regardless of traffic`,
)
console.log(`${'='.repeat(78)}\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`} — ${checks} checks\n`)
process.exit(failures === 0 ? 0 : 1)
