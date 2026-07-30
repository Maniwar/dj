// ============================================================================================
// VERIFY THE PROFILE SYSTEM — the ladder, the precedence and the classifier
// ============================================================================================
// Three things can go wrong here and none of them is visible by looking at the page:
//
//   1. A profile resolves to the wrong SET. `lean` claiming thirteen ids and applying eleven is
//      a benchmark row that measures something other than what it is labelled, which is the
//      exact failure mode the whole harness was built to stop.
//   2. PRECEDENCE inverts. The requirement is that an explicit choice is never overridden by a
//      later measurement, and the only way to know that holds is to store a choice, let the
//      detector run to completion, and look again.
//   3. The CLASSIFIER regresses to a mean. calmMode never fired on either problem device because
//      it decided on an average, and an average of 16.7ms is exactly what the bug looked like.
//      The synthetic-stats block below is the guard: a page at a flawless 60fps average with one
//      frame in twenty at 90ms MUST NOT classify as `full`.
//
//   node scripts/verify-profiles.mjs           (expects `npm run preview` on :4173)
//   FX_URL=http://localhost:5173/ node scripts/verify-profiles.mjs

import { chromium } from 'playwright-core'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const URL = process.env.FX_URL || 'http://localhost:4173/'

const CANDIDATES = [
  process.env.SMOKE_BROWSER,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

let failed = 0
const ok = (label, detail = '') => console.log(`ok      ${label}${detail ? `\n          ${detail}` : ''}`)
const bad = (label, detail) => {
  console.log(`FAIL    ${label}\n          ${detail}`)
  failed++
}
const eq = (label, actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected)
    ? ok(label, JSON.stringify(actual))
    : bad(label, `expected ${JSON.stringify(expected)}\n          got      ${JSON.stringify(actual)}`)

// ============================================================================================
// PART 1 — the classifier, as a pure function, in node
// ============================================================================================
// Bundled with esbuild rather than exercised through the page: classify() takes a FrameStats and
// returns a profile, and the interesting inputs are ones a real browser will not produce on
// demand. Feeding it the exact shape of the reported bug is the only way to assert that the shape
// is caught.

const tmp = mkdtempSync(join(tmpdir(), 'ch-profiles-'))
const bundle = join(tmp, 'profiles.mjs')
await build({
  entryPoints: ['src/perf/profiles.ts'],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
})
const { classify, PROFILE_BY_ID, PROFILES, P95_BOUNDS } = await import(`file://${bundle}`)

// THE ESSENTIALS FLOOR, READ FROM THE REGISTRY. resolveOff() deletes every `essential` id before it
// applies the overrides, so a profile's declared `off` set is NOT what lands on the page: `minimal`
// declares all 28 ids and resolves to 21. This script used to compare against the declared sets and
// against a literal 27, so it reported six failures for behaviour that is the stated requirement --
// "the very minimum must be ken burns and beats and the scrolling text; the site being completely
// static is not acceptable". Derived here rather than restated so the two cannot drift.
const regBundle = join(tmp, 'registry.mjs')
await build({
  entryPoints: ['src/perf/registry.ts'],
  outfile: regBundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
})
const { FX } = await import(`file://${regBundle}`)
const ESSENTIAL = new Set(FX.filter((f) => f.essential).map((f) => f.id))
/** What a declared profile set actually RESOLVES to once the essentials floor is applied. */
const resolved = (ids) => ids.filter((id) => !ESSENTIAL.has(id)).slice().sort()

/** A window with the given percentiles and nothing else wrong. */
const stats = (o) => ({
  frames: 180,
  durationMs: 3000,
  fps: 60,
  mean: 16.7,
  p50: 16.7,
  p75: 17,
  p90: 18,
  p95: 18,
  p99: 20,
  max: 22,
  jankPct: 0,
  badPct: 0,
  droppedApprox: 0,
  longTasks: 0,
  longTaskMs: 0,
  layoutShift: 0,
  heapMB: null,
  scrollY: 0,
  valid: true,
  ...o,
})

console.log('--- classifier ---')
eq('a clean 60Hz page is `full`', classify(stats({})).profile, 'full')

// THE REGRESSION GUARD. This is the reported bug, as numbers: mean 16.7ms, p50 16.7ms — a
// flawless average — with one frame in twenty at 90ms. calmMode's 40%-of-frames-over-26ms test
// scores this at 5% and does nothing.
const theBug = stats({ mean: 16.7, p50: 16.7, p90: 17, p95: 90, p99: 140, max: 160, jankPct: 0.05 })
const bugVerdict = classify(theBug)
bugVerdict.profile === 'minimal'
  ? ok('the reported bug (mean 16.7ms, p95 90ms) is caught', `${bugVerdict.profile} — ${bugVerdict.reason}`)
  : bad('the reported bug is caught', `classified as ${bugVerdict.profile}; a tail of 90ms must not read as healthy`)

eq('p95 just inside `full`', classify(stats({ p95: P95_BOUNDS.full })).profile, 'full')
eq('p95 just outside `full`', classify(stats({ p95: P95_BOUNDS.full + 1 })).profile, 'balanced')
eq('p95 just outside `balanced`', classify(stats({ p95: P95_BOUNDS.balanced + 1 })).profile, 'lean')
eq('p95 just outside `lean`', classify(stats({ p95: P95_BOUNDS.lean + 1 })).profile, 'minimal')

// Each corroborating signal must be able to worsen a verdict that p95 alone would call healthy.
eq('a clean p95 with a 140ms p99 is downgraded', classify(stats({ p99: 140 })).profile, 'lean')
eq('a clean p95 with 40% long-task time is downgraded', classify(stats({ longTaskMs: 1200 })).profile, 'lean')
eq(
  'a clean p95 dropping 60% of frames is downgraded',
  classify(stats({ droppedApprox: 110 })).profile,
  'lean',
)
// ...and must never IMPROVE one.
eq(
  'corroboration never upgrades',
  classify(stats({ p95: 200, p99: 16, longTaskMs: 0, droppedApprox: 0 })).profile,
  'minimal',
)

// The ladder has to be monotone or "one step lighter" in autoProfile is meaningless.
let monotone = true
for (let i = 1; i < PROFILES.length; i++) {
  const prev = new Set(PROFILE_BY_ID[PROFILES[i - 1]].off)
  for (const id of prev) if (!PROFILE_BY_ID[PROFILES[i]].off.includes(id)) monotone = false
}
monotone
  ? ok('the ladder is monotone', PROFILES.map((p) => `${p}:${PROFILE_BY_ID[p].off.length}`).join(' ⊆ '))
  : bad('the ladder is monotone', 'a lighter profile leaves an effect on that a heavier one switches off')

rmSync(tmp, { recursive: true, force: true })

// ============================================================================================
// PART 2 — resolution and precedence, in a real browser
// ============================================================================================

const exe = CANDIDATES.find((p) => existsSync(p))
const launchOpts = { headless: true, args: ['--headless=new', '--no-sandbox'] }
if (exe) launchOpts.executablePath = exe
else launchOpts.channel = 'chrome'

const browser = await chromium.launch(launchOpts)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const LEAN = resolved(PROFILE_BY_ID.lean.off)
const BALANCED = resolved(PROFILE_BY_ID.balanced.off)
const ALL = resolved(PROFILE_BY_ID.minimal.off)

/** Load, get past the boot gate, and report what the page resolved to. */
async function load(query, { storage = null, settleMs = 700 } = {}) {
  if (storage !== null) {
    // Seeded on the ORIGIN before the app runs, which is the only way to test the "before the
    // first paint" guarantee: an override written after load would prove nothing about boot.
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate((s) => {
      localStorage.clear()
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
    }, storage)
  } else {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
  }
  await page.goto(`${URL}${query ? (URL.includes('?') ? '&' : '?') + query : ''}`, {
    waitUntil: 'domcontentloaded',
  })
  const gate = page.locator('.logon-btn')
  await gate.waitFor({ state: 'visible', timeout: 15_000 })
  await gate.click()
  await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 30_000 })
  await page.waitForTimeout(settleMs)
  return page.evaluate(() => {
    const root = document.documentElement
    return {
      off: [...root.classList].filter((c) => c.startsWith('fx-off-')).map((c) => c.slice(7)).sort(),
      calm: root.classList.contains('calm'),
      // .thermal-canvas, not any <canvas>: the player's visualiser is also a canvas and is not
      // part of this question. Counting all of them made "minimal unmounts the shader" pass on a
      // page where the shader was still running.
      canvases: document.querySelectorAll('.thermal-canvas canvas').length,
      shaderFallback: document.querySelectorAll('.thermal-fallback').length,
      bcVideo: document.querySelectorAll('video.bc-video').length,
      sectionVideos: document.querySelectorAll('video.lore-video, video.journey-video').length,
      storedProfile: localStorage.getItem('so.perfProfile'),
      // Present only under ?diag. The selected segment is the honest read of "which profile is
      // REQUESTED" — 'auto' there means the detector is armed, whatever it has decided so far,
      // which is the thing these checks are actually about.
      requested: document.getElementById('so-diag-host')?.shadowRoot?.querySelector('.segbtn.on')?.textContent ?? null,
      storedOverrides: localStorage.getItem('so.perfOverrides'),
    }
  })
}

console.log('\n--- resolution ---')

let s = await load('')
eq('no flags → nothing switched off', s.off, [])
s.calm ? bad('no flags → no .calm', 'calm was set') : ok('no flags → no .calm')
s.canvases >= 1 ? ok('no flags → the shader canvas exists', `${s.canvases} canvas`) : bad('no flags → shader canvas', 'none found')

s = await load('profile=balanced')
eq('?profile=balanced resolves to the balanced set', s.off, BALANCED)
s.calm ? bad('balanced does not set .calm', 'calm was set') : ok('balanced does not set .calm')

s = await load('profile=lean')
eq('?profile=lean resolves to the lean set', s.off, LEAN)
s.calm ? ok('lean sets .calm') : bad('lean sets .calm', 'calm was absent')
s.sectionVideos === 0
  ? ok('lean unmounts the section videos', 'sectionVideo is honoured live, not just classed')
  : bad('lean unmounts the section videos', `${s.sectionVideos} still in the DOM`)
s.canvases >= 1
  ? ok('lean KEEPS the shader', 'the bisect showed the rig alone is smooth; lean must not remove it')
  : bad('lean keeps the shader', 'the canvas was unmounted')

s = await load('profile=minimal')
eq('?profile=minimal switches off every non-essential effect', s.off, ALL)
// INVERTED DELIBERATELY. `shader` is an essential id, so the floor keeps it at every profile --
// minimal included. The old assertion here predates that requirement and asserted its opposite.
s.canvases >= 1
  ? ok('minimal KEEPS the shader', 'essential: the light rig survives the floor, so the page is never static')
  : bad('minimal keeps the shader', `${s.canvases} shader canvas / ${s.shaderFallback} fallback`)
s.bcVideo === 0
  ? ok('minimal unmounts the mainstage video', 'falls back to the stills, so no decoder is running')
  : bad('minimal unmounts the mainstage video', 'the <video> is still in the DOM')

console.log('\n--- precedence ---')

s = await load('profile=lean&fxon=cardGlass')
s.off.includes('cardGlass')
  ? bad('?fxon overrules the profile', 'cardGlass is still off')
  : ok('?fxon overrules the profile', 'cardGlass survived a lean load')

s = await load('fxoff=bcStrobe')
eq('?fxoff alone still works with no profile', s.off, ['bcStrobe'])

s = await load('', { storage: { 'so.perfProfile': 'lean' } })
eq('a stored profile applies on load', s.off, LEAN)

s = await load('profile=full', { storage: { 'so.perfProfile': 'minimal' } })
eq('?profile beats the stored profile', s.off, [])

s = await load('profile=lean', { storage: { 'so.perfOverrides': '{"cardGlass":true}' } })
s.off.includes('cardGlass')
  ? bad('a stored switch beats the profile', 'cardGlass was switched off by the profile anyway')
  : ok('a stored switch beats the profile', 'the hand-made choice survived')

s = await load('', { storage: { 'so.perfOverrides': '{"bcGrain":false,"nonsense":true}' } })
eq('a corrupt stored id is dropped rather than classed', s.off, ['bcGrain'])

// THE REQUIREMENT, MEASURED. The detector's first decision lands at T+3.5s and its second at
// T+15s+; this waits past the first and asserts the stored choice is untouched. A headless
// Chromium is fast enough to classify as `full` anyway, so the assertion that matters is that
// `full` was not APPLIED over the stored `minimal` — i.e. the ladder, not the verdict.
s = await load('', { storage: { 'so.perfProfile': 'minimal' }, settleMs: 6000 })
eq('auto-detection does not overrule a stored choice', s.off, ALL)

// ?profile=auto has to ARM detection, not count as "the URL decided" — the flag exists to say
// "measure this device", and reading it as an explicit choice would make it mean its opposite.
// Asserted through the panel's selected segment rather than through the resulting class set: the
// detector runs for real here, so which profile it lands on is a property of the machine running
// this script and is not something to assert on.
s = await load('profile=auto&diag', { storage: { 'so.perfProfile': 'minimal' }, settleMs: 5000 })
s.requested?.startsWith('auto')
  ? ok('?profile=auto re-arms detection over a stored profile', `requested: ${s.requested}`)
  : bad('?profile=auto re-arms detection over a stored profile', `requested: ${s.requested}`)

// A hand-made switch must not opt the device out of ever being measured: it already outranks
// whatever the detector picks, so there is nothing to protect it from.
s = await load('fxoff=bcGrain&diag', { settleMs: 5000 })
s.requested?.startsWith('auto') && s.off.includes('bcGrain')
  ? ok('a per-effect flag leaves detection armed and still wins', `requested: ${s.requested}, off: ${s.off}`)
  : bad('a per-effect flag leaves detection armed and still wins', `requested: ${s.requested}, off: ${s.off}`)

// ============================================================================================
// PART 3 — the panel is wired to the same state, not to a copy of it
// ============================================================================================
// The panel is the only way most of this is ever operated, and it renders into a shadow root, so
// nothing above would have noticed if its controls wrote somewhere else entirely.

console.log('\n--- diag panel ---')
await load('diag', { settleMs: 1200 })

const sr = () => page.evaluate.bind(page)

const pickProfile = async (label) =>
  page.evaluate((l) => {
    const root = document.getElementById('so-diag-host').shadowRoot
    const btn = [...root.querySelectorAll('.segbtn')].find((b) => b.textContent.startsWith(l))
    btn.click()
  }, label)

// The panel opens collapsed; expand it before touching anything.
await page.evaluate(() => document.getElementById('so-diag-host').shadowRoot.querySelector('.iconbtn').click())
await page.waitForTimeout(200)

await pickProfile('Lean')
await page.waitForTimeout(300)
let after = await page.evaluate(() => ({
  off: [...document.documentElement.classList].filter((c) => c.startsWith('fx-off-')).map((c) => c.slice(7)).sort(),
  stored: localStorage.getItem('so.perfProfile'),
  calm: document.documentElement.classList.contains('calm'),
}))
eq('picking Lean in the panel applies the lean set', after.off, LEAN)
eq('...and persists it', after.stored, 'lean')
after.calm ? ok('...and sets .calm') : bad('picking Lean sets .calm', 'calm absent')

// A switch flip has to become a persisted OVERRIDE, not a bare class — that is the whole
// "never overridden by a later measurement" requirement, and it is invisible from the DOM alone.
await page.evaluate(() => {
  const root = document.getElementById('so-diag-host').shadowRoot
  const rows = [...root.querySelectorAll('.row')]
  const row = rows.find((r) => r.querySelector('.meta').textContent.startsWith('cardGlass'))
  row.querySelector('input[type=checkbox]').click()
})
await page.waitForTimeout(300)
after = await page.evaluate(() => ({
  overrides: localStorage.getItem('so.perfOverrides'),
  cardGlassOff: document.documentElement.classList.contains('fx-off-cardGlass'),
  marked: !!document.getElementById('so-diag-host').shadowRoot.querySelector('.row.over'),
}))
eq('flipping a switch writes a persisted override', JSON.parse(after.overrides || '{}'), { cardGlass: true })
after.cardGlassOff
  ? bad('the override takes effect', 'cardGlass is still switched off by the profile')
  : ok('the override takes effect', 'cardGlass came back on under lean')
after.marked ? ok('the row is marked as overridden') : bad('the row is marked as overridden', 'no .row.over')

// ...and the way back to inherited has to exist, or a switch flipped once is a switch flipped
// for good and the profile control silently stops meaning anything.
await page.evaluate(() => document.getElementById('so-diag-host').shadowRoot.querySelector('.row.over .clearbtn').click())
await page.waitForTimeout(300)
after = await page.evaluate(() => ({
  overrides: localStorage.getItem('so.perfOverrides'),
  cardGlassOff: document.documentElement.classList.contains('fx-off-cardGlass'),
}))
after.overrides === null && after.cardGlassOff
  ? ok('reverting hands the row back to the profile', 'the stored override is gone and lean applies again')
  : bad('reverting hands the row back to the profile', `overrides=${after.overrides} off=${after.cardGlassOff}`)

// Reset has to clear all three keys, or "I switched something off and cannot remember what" has
// no way out on a tablet.
await page.evaluate(() => {
  const root = document.getElementById('so-diag-host').shadowRoot
  ;[...root.querySelectorAll('button.act')].find((b) => b.textContent.startsWith('Reset')).click()
})
await page.waitForTimeout(300)
after = await page.evaluate(() => ({
  keys: ['so.perfProfile', 'so.perfOverrides', 'so.intensity'].filter((k) => localStorage.getItem(k) !== null),
  off: [...document.documentElement.classList].filter((c) => c.startsWith('fx-off-')),
}))
eq('Reset clears every stored choice', after.keys, [])
eq('...and the page returns to the detected profile', after.off, [])

console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}`)
await browser.close()
process.exit(failed ? 1 : 0)
