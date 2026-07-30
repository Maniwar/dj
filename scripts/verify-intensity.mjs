// ============================================================================================
// VERIFY THE MASTER INTENSITY DIAL
// ============================================================================================
// The dial replaced the friction knob, and the two claims it makes are the ones a screenshot
// cannot settle:
//
//   1. AT 0 THE PAGE IS CLEAN. Not "dimmed" — every effect retired, every audio variable a hard
//      zero, and the per-frame cssText write on :root stopped. The old knob claimed this too and
//      it was false: at friction 0 a full-viewport blend layer still rendered at opacity 0.25.
//   2. AT THE DEFAULT NOTHING CHANGED. The multiplier is exactly 1 at dial 0.6, which is what
//      makes "we reworked the whole control" and "the site looks the same" both true. Anything
//      that quietly shifts the default look is a regression, not a feature.
//
// Plus the two things that are structurally easy to get wrong: --fx surviving AudioReactive's
// cssText rebuild (it is written on <body> precisely so it does), and a per-effect override still
// beating the dial, without which the diag panel's switches would silently stop working at the
// bottom of the sweep.
//
//   node scripts/verify-intensity.mjs          (expects `npm run preview` on :4173)
//   FX_URL=http://localhost:5173/ node scripts/verify-intensity.mjs

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
// PART 1 — the response curve, as a pure function
// ============================================================================================
// It is three lines of arithmetic and it decides what every effect on the site is multiplied by.
// The two fixed points are the contract; everything else is interpolation.

const tmp = mkdtempSync(join(tmpdir(), 'ch-intensity-'))
const bundle = join(tmp, 'curve.mjs')
await build({
  entryPoints: ['src/perf/fxCurve.ts'],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
})
const { fxMultiplier, FX_DEFAULT, FX_MAX_MULTIPLIER, FX_MOTION_MIN } = await import(`file://${bundle}`)

// The essentials floor, read from the registry so the count cannot drift from the source.
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
const NON_ESSENTIAL = FX.filter((f) => !f.essential).length

console.log('--- the curve ---')
eq('0 is off, exactly', fxMultiplier(0), 0)
eq('the default is 1.0, exactly', fxMultiplier(FX_DEFAULT), 1)
eq('1 is the ceiling', fxMultiplier(1), FX_MAX_MULTIPLIER)
eq('the default sits near the middle of the travel', FX_DEFAULT >= 0.45 && FX_DEFAULT <= 0.7, true)
eq('half the lower leg is half strength', fxMultiplier(FX_DEFAULT / 2), 0.5)
// Monotone, or the dial would be non-invertible: two positions producing the same look means a
// person turning it can see nothing happen, and a benchmark row can't be reproduced from a value.
let monotone = true
for (let i = 1; i <= 100; i++) if (fxMultiplier(i / 100) <= fxMultiplier((i - 1) / 100)) monotone = false
monotone ? ok('the curve is monotone') : bad('the curve is monotone', 'a step of the dial did not change the multiplier')
eq('out-of-range input is clamped, not trusted', [fxMultiplier(-5), fxMultiplier(9)], [0, FX_MAX_MULTIPLIER])

rmSync(tmp, { recursive: true, force: true })

// ============================================================================================
// PART 2 — the page
// ============================================================================================

const exe = CANDIDATES.find((p) => existsSync(p))
const launchOpts = { headless: true, args: ['--headless=new', '--no-sandbox'] }
if (exe) launchOpts.executablePath = exe
else launchOpts.channel = 'chrome'

const browser = await chromium.launch(launchOpts)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

async function load(query, { settleMs = 600 } = {}) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
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
    const cs = getComputedStyle(root)
    return {
      fx: document.body.style.getPropertyValue('--fx'),
      off: [...root.classList].filter((c) => c.startsWith('fx-off-')).map((c) => c.slice(7)).sort(),
      beat: cs.getPropertyValue('--m-beat').trim(),
      lift: cs.getPropertyValue('--beat-lift').trim(),
      // The three variables the deleted knob published. Any value at all here means a rule
      // somewhere is still being fed by a control that no longer exists.
      dead: ['--friction', '--chroma', '--shake'].filter((v) => cs.getPropertyValue(v).trim() !== ''),
      crt: document.querySelectorAll('.friction-overlay, .crt-scan, .crt-vignette').length,
      // null when the component is unmounted entirely, which is what happens below the shader's
      // own threshold — reporting body's opacity there would have read as "the rig is fully on".
      canvasOpacity: document.querySelector('.thermal-canvas')
        ? getComputedStyle(document.querySelector('.thermal-canvas')).opacity
        : null,
      stored: localStorage.getItem('so.intensity'),
    }
  })
}

console.log('\n--- the default ---')
let s = await load('')
eq('--fx is 1 at the default, i.e. the site as tuned', s.fx, '1.000')
eq('nothing is retired at the default', s.off, [])
eq('the CRT overlay is gone from the DOM', s.crt, 0)
eq('--friction / --chroma / --shake resolve to nothing', s.dead, [])

console.log('\n--- the bottom of the dial ---')
s = await load('intensity=0')
eq('--fx is 0', s.fx, '0.000')
// THE BOTTOM OF THE DIAL IS NOT A DEAD PAGE, and these three assertions used to say it was.
//
// The original contract here was "at 0 every effect is retired and every audio variable is a hard
// zero". That was rejected on the device, in these words: "the very minimum must be ken burns and
// beats with the text and stuff, and the scrolling text and everything and a few lasers -- the site
// being completely static is not acceptable." So resolveOff() exempts the `essential` ids and
// fxMotionMultiplier() clamps the motion multiplier to FX_MOTION_MIN rather than letting it reach 0.
//
// These now assert THAT contract. Left as-is they reported three failures for the required
// behaviour, which is worse than no coverage: it trains you to read a red suite as normal.
eq('every NON-ESSENTIAL effect is retired', s.off.length, NON_ESSENTIAL)
// --m-beat is a REGISTERED property, so the computed value is the number, not the token that was
// written; compare numerically or a correct "0.00" reads as a failure against a literal "0".
// POLLED, NOT SAMPLED ONCE. --m-beat is a live audio transient: between two beats it is legitimately
// near zero, so a single read makes this check flaky, and a flaky suite is very nearly as useless as
// a red one. It failed intermittently for exactly that reason. Poll for up to 3s and take the peak;
// only a floor that is genuinely pinned to zero can fail now.
const peak = await page.evaluate(async () => {
  const root = document.documentElement
  let beat = 0
  let lift = '0px'
  const t0 = performance.now()
  while (performance.now() - t0 < 3000) {
    const cs = getComputedStyle(root)
    beat = Math.max(beat, Number(cs.getPropertyValue('--m-beat')) || 0)
    const l = cs.getPropertyValue('--beat-lift').trim()
    if (l && l !== '0px') lift = l
    await new Promise((r) => requestAnimationFrame(r))
  }
  return { beat, lift }
})
peak.beat > 0
  ? ok('the beat variable survives the floor', `peak --m-beat ${peak.beat} — clamped at FX_MOTION_MIN ${FX_MOTION_MIN}, not zeroed`)
  : bad('the beat variable survives the floor', 'peak --m-beat was 0 across 3s — the motion clamp is not in effect')
peak.lift !== '0px'
  ? ok('the heading lift survives the floor', `peak --beat-lift ${peak.lift}`)
  : bad('the heading lift survives the floor', 'the lift stayed 0px across 3s; essential beat motion is gone')
eq('the light rig is not drawn', s.canvasOpacity === null || s.canvasOpacity === '0', true)

console.log('\n--- the top of the dial ---')
s = await load('intensity=1')
eq('--fx reaches the ceiling', s.fx, FX_MAX_MULTIPLIER.toFixed(3))
eq('nothing is retired at the top either', s.off, [])

// ...and where it is still mounted, it fades with the dial rather than switching.
s = await load('intensity=0.4')
eq('the light rig fades with the dial', s.canvasOpacity, String(fxMultiplier(0.4).toFixed(3)))

console.log('\n--- retirement order ---')
// Half the sweep should have retired the expensive per-pixel passes and kept the cheap composited
// ones. This is the property that makes turning the dial DOWN a performance control and not just
// a dimmer: the things that cost the most leave first.
s = await load('intensity=0.3')
const gone = new Set(s.off)
;['cardGlass', 'playerGlass', 'bcStrobe', 'beatFilter', 'shaderBlend', 'bcGlitchCut'].every((id) => gone.has(id))
  ? ok('the per-pixel passes are retired by half travel', [...gone].join(' '))
  : bad('the per-pixel passes are retired by half travel', `still on: ${['cardGlass', 'playerGlass', 'bcStrobe', 'beatFilter', 'shaderBlend', 'bcGlitchCut'].filter((id) => !gone.has(id)).join(' ')}`)
;['beatTransform', 'audioPump', 'bcVignette', 'bcVideo', 'beatLift'].every((id) => !gone.has(id))
  ? ok('the cheap composited ones survive it', 'beatTransform audioPump bcVignette bcVideo beatLift')
  : bad('the cheap composited ones survive it', `retired too early: ${['beatTransform', 'audioPump', 'bcVignette', 'bcVideo', 'beatLift'].filter((id) => gone.has(id)).join(' ')}`)

console.log('\n--- precedence ---')
// The panel's switches have to keep working at the bottom of the sweep. If the dial won this,
// "force it back on" would silently do nothing exactly when someone is trying to isolate an
// effect, which is the failure this whole harness exists to prevent.
s = await load('intensity=0&fxon=cardGlass')
s.off.includes('cardGlass')
  ? bad('an override beats the dial', 'cardGlass was forced on and is still retired')
  : ok('an override beats the dial', 'cardGlass forced on at intensity 0')

console.log('\n--- --fx survives the audio pump ---')
// THE RISK THIS DESIGN WAS SHAPED AROUND. AudioReactive rebuilds documentElement's entire inline
// style from its own map once per frame, so anything else written there is erased on the next
// frame. --fx is on <body> for that reason; this asserts it, with the pump actually running.
await load('')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /play|▶/i.test(x.getAttribute('aria-label') || ''))
  b?.click()
})
await page.waitForTimeout(1200)
const after = await page.evaluate(() => ({
  fx: document.body.style.getPropertyValue('--fx'),
  rootHasFx: document.documentElement.style.getPropertyValue('--fx'),
  pumping: document.documentElement.style.cssText.includes('--m-beat'),
}))
after.fx === '1.000'
  ? ok('--fx is still set after the pump has flushed', `body --fx=${after.fx}, pump ${after.pumping ? 'running' : 'idle'}`)
  : bad('--fx is still set after the pump has flushed', `body --fx=${JSON.stringify(after.fx)}`)
eq('...and it was never written to <html>, where it would be erased', after.rootHasFx, '')

console.log('\n--- the control writes through the preference ---')
// Dragging the knob must persist, or a device profile that lowers the dial is undone by a reload.
await page.evaluate(() => {
  const k = [...document.querySelectorAll('[role="slider"]')].find((x) => /intensity/i.test(x.getAttribute('aria-label') || ''))
  if (!k) return
  k.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))
})
await page.waitForTimeout(200)
const persisted = await page.evaluate(() => ({
  stored: localStorage.getItem('so.intensity'),
  fx: document.body.style.getPropertyValue('--fx'),
}))
persisted.stored !== null && Number(persisted.stored) < FX_DEFAULT
  ? ok('turning the knob down persists and republishes --fx', `so.intensity=${persisted.stored} --fx=${persisted.fx}`)
  : bad('turning the knob down persists and republishes --fx', JSON.stringify(persisted))

console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}`)
await browser.close()
process.exit(failed ? 1 : 0)
