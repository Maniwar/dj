// ============================================================================================
// BEFORE/AFTER SCREENSHOT PROOF — the same page, the same load, one stylesheet apart
// ============================================================================================
// The cuts in this round are only acceptable if the page looks the same afterwards, and "looks
// the same" is a claim that has to be measured rather than eyeballed. This boots ONCE, and at
// every scroll position captures the page twice: once with an inline stylesheet that reverts the
// cuts (BEFORE) and once without it (AFTER). One load means the same random seeds, the same
// track, the same broadcast still and the same karaoke word in both frames, which a second page
// load could not promise.
//
// EVERYTHING THAT MOVES IS FROZEN FIRST. Ken-Burns, the marquees, the beat scale and the video
// are all live, so two captures a few hundred milliseconds apart would differ for reasons that
// have nothing to do with the change. Animations are paused at a fixed currentTime, the audio
// variables are pinned, and video elements are paused on a fixed frame — so any residual pixel
// difference is attributable to the stylesheet and to nothing else.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]])
    return acc
  }, []),
)
const GEOM = {
  tablet: { width: 1691, height: 960, deviceScaleFactor: 1.75, hasTouch: true },
  surface: { width: 1564, height: 926, deviceScaleFactor: 1.75, hasTouch: false },
}
const geom = GEOM[args.geom || 'tablet']
const OUT = args.out || 'qa-shots/layer-cuts'
const UNDO = args.undo
const SCROLLS = (args.scrolls || '0,2600,4300,6000,9000,12200,13400').split(',').map(Number)

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: geom.width, height: geom.height }, deviceScaleFactor: geom.deviceScaleFactor, hasTouch: geom.hasTouch })
const page = await context.newPage()
await page.goto((args.url || 'http://localhost:4802/') + (args.query ? '?' + args.query : ''), { waitUntil: 'domcontentloaded' })
await page.locator('.logon-btn').waitFor({ state: 'visible', timeout: 25000 })
await page.locator('.logon-btn').click()
await page.waitForSelector('.hero', { timeout: 15000 })
await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 45000 })
await page.waitForTimeout(5000)

// The three surfaces that redraw from their own clocks and cannot be frozen from CSS: the WebGL
// light rig, the spectrum analyser, and the Broadcast backdrop (whose still is swapped by a JS
// timer, not by an animation). Measured: leaving them in put the noise floor at 84% of the frame,
// which drowns any change. NONE of the cuts in this round touches any of them — the `.bc-frame`
// will-change declaration is carried through unchanged — so masking them costs the comparison
// nothing and is what makes the rest of the page readable.
const MASK = '.thermal-canvas, .spectrum-canvas, .broadcast'

const freeze = () =>
  page.evaluate((mask) => {
    let s = document.getElementById('__mask')
    if (!s) {
      s = document.createElement('style')
      s.id = '__mask'
      document.head.appendChild(s)
    }
    s.textContent = mask + ' { visibility: hidden !important; }'
    // Stop the music too. AudioReactive rewrites --m-beat every frame while a track plays, which
    // moves ~35 beat-driven transforms and text-shadows between any two captures — a bigger
    // difference than anything being tested here.
    for (const v of document.querySelectorAll('audio, video')) {
      try {
        v.pause()
        if (v.tagName === 'VIDEO') v.currentTime = 1
      } catch {}
    }
    for (const a of document.getAnimations()) {
      try {
        a.pause()
        a.currentTime = 0
      } catch {}
    }
  }, MASK)

const setUndo = (on) =>
  page.evaluate(
    ({ on, css }) => {
      let s = document.getElementById('__undo')
      if (!s) {
        s = document.createElement('style')
        s.id = '__undo'
        document.head.appendChild(s)
      }
      s.textContent = on ? css : ''
    },
    { on, css: UNDO },
  )

const shots = []
for (const y of SCROLLS) {
  await page.evaluate((y) => scrollTo(0, y), y)
  await page.waitForTimeout(2200)
  await freeze()
  await page.waitForTimeout(400)
  // BEFORE first, then AFTER, then freeze again in case the class change restarted anything
  await setUndo(true)
  await page.waitForTimeout(700)
  await freeze()
  await page.waitForTimeout(300)
  const before = `${OUT}/y${y}-before.png`
  await page.screenshot({ path: before })
  await setUndo(false)
  await page.waitForTimeout(700)
  await freeze()
  await page.waitForTimeout(300)
  const after = `${OUT}/y${y}-after.png`
  await page.screenshot({ path: after })
  // CONTROL. The WebGL light rig and the spectrum canvas keep drawing no matter what is frozen,
  // so two captures of the IDENTICAL page still differ. This third shot changes nothing at all
  // between it and `after`, which gives the noise floor that the before/after number has to be
  // read against — without it, "18% of pixels changed" is unreadable.
  await page.waitForTimeout(700)
  await freeze()
  await page.waitForTimeout(300)
  const control = `${OUT}/y${y}-control.png`
  await page.screenshot({ path: control })
  shots.push({ y, before, after, control })
  console.log('captured y=' + y)
}
console.log(JSON.stringify(shots))
await browser.close()
