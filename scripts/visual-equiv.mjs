// ============================================================================================
// VISUAL EQUIVALENCE — per element, per property, exact
// ============================================================================================
// A screenshot diff could not answer "does this look the same?" here: the WebGL rig, the spectrum
// analyser and the Broadcast still all redraw from their own clocks, and the background stills
// decode lazily, so two captures of the IDENTICAL page differed by up to 85% of the frame. The
// noise floor was larger than any change worth finding.
//
// So equivalence is checked where it is exact instead. Every element in the document is measured
// twice in ONE page — once with a stylesheet that reverts the cuts, once without — and its box
// and its appearance-bearing computed properties are compared. This is strictly stronger than a
// screenshot: it is per element rather than per pixel, it cannot be fooled by two differences
// cancelling out, and it has no noise at all.
//
// IDENTITY TRANSFORMS ARE NORMALISED. `transform: none` and `matrix(1, 0, 0, 1, 0, 0)` render
// the same pixels, and the Ken-Burns window cut deliberately turns one into the other on the
// slides it stops animating. Reporting that as a difference would bury the real ones.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

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
const UNDO = args.undo || readFileSync(args.undofile, 'utf8')
const SCROLLS = (args.scrolls || '0,2600,4300,6000,9000,12200,13400,16000').split(',').map(Number)

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
await page.waitForTimeout(4000)

const report = []
for (const y of SCROLLS) {
  const r = await page.evaluate(
    async ({ y, undo }) => {
      // STOP THE MUSIC FIRST. With a track playing, AudioReactive rewrites --m-beat and
      // --beat-lift on :root every frame, so ~35 beat-driven transforms, text-shadows and
      // opacities differ between ANY two snapshots taken a second apart — measured: 193 elements
      // "changed" on a run where the stylesheet was the only thing held constant, and the lyric
      // line even re-rendered with a different word count, which changed the element total. None
      // of that is the stylesheet. Paused and allowed to decay, --m-beat settles to 0 and the
      // page becomes comparable.
      for (const m of document.querySelectorAll('audio, video')) {
        try {
          m.pause()
        } catch {}
      }
      scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 2500))

      // Freeze every animation at its FIRST FRAME. Ken-Burns is the thing being changed, so
      // leaving it running would make every reading differ — but the time it is frozen AT
      // matters just as much, and t=1500 was wrong. Every Ken-Burns keyframe starts at the
      // resting transform (`from { transform: scale(1) translate(0,0) }`), which is the whole
      // reason the slides can be declared-and-paused without popping; parking the clock at 1.5s
      // instead advanced the still-paused slides to scale ~1.002 and reported that as a
      // difference against the slides that now have no animation at all. At t=0 the two states
      // are the same picture, which is the actual claim being tested: a slide outside the
      // promotion window looks exactly like a slide that is paused at the start of its pan.
      const freeze = () => {
        for (const a of document.getAnimations()) {
          try {
            a.pause()
            a.currentTime = 0
          } catch {}
        }
      }
      const PROPS = [
        'opacity', 'visibility', 'display', 'transform', 'scale', 'rotate', 'translate',
        'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundColor',
        'filter', 'mixBlendMode', 'boxShadow', 'textShadow', 'color', 'zIndex',
        'animationName', 'animationPlayState', 'animationDuration',
      ]
      // matrix(1, 0, 0, 1, 0, 0) and none paint identically
      const norm = (k, v) =>
        (k === 'transform' || k === 'translate' || k === 'scale' || k === 'rotate') &&
        /^(none|matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)|1|0px)$/.test(v)
          ? 'IDENTITY'
          : v

      const snap = () => {
        freeze()
        const out = []
        const all = document.querySelectorAll('body *')
        for (let i = 0; i < all.length; i++) {
          const el = all[i]
          const cs = getComputedStyle(el)
          const b = el.getBoundingClientRect()
          const rec = { i, tag: el.tagName, cls: typeof el.className === 'string' ? el.className : '',
            box: [Math.round(b.x * 100) / 100, Math.round(b.y * 100) / 100, Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100] }
          for (const p of PROPS) rec[p] = norm(p, cs[p])
          out.push(rec)
        }
        return out
      }

      let s = document.getElementById('__undo')
      if (!s) {
        s = document.createElement('style')
        s.id = '__undo'
        document.head.appendChild(s)
      }
      s.textContent = undo
      await new Promise((r) => setTimeout(r, 700))
      const before = snap()
      s.textContent = ''
      await new Promise((r) => setTimeout(r, 700))
      const after = snap()

      if (before.length !== after.length) return { y, error: `element count changed ${before.length} -> ${after.length}` }
      const diffs = []
      for (let i = 0; i < before.length; i++) {
        const a = before[i], b = after[i]
        const changed = []
        for (let k = 0; k < 4; k++) if (Math.abs(a.box[k] - b.box[k]) > 0.02) changed.push(`box.${'xywh'[k]} ${a.box[k]} -> ${b.box[k]}`)
        for (const p of PROPS) if (a[p] !== b[p]) changed.push(`${p}: ${a[p]} -> ${b[p]}`)
        if (changed.length) diffs.push({ tag: a.tag, cls: a.cls.slice(0, 60), changed })
      }
      return { y, elements: before.length, diffs }
    },
    { y, undo: UNDO },
  )
  report.push(r)
  const n = r.diffs ? r.diffs.length : 'ERR'
  console.log(`scrollY=${String(y).padEnd(6)} elements=${r.elements}  differing elements: ${n}`)
  if (r.diffs) for (const d of r.diffs) console.log(`    <${d.tag.toLowerCase()} class="${d.cls}">  ${d.changed.join(' | ')}`)
}
await browser.close()
const total = report.reduce((s, r) => s + (r.diffs ? r.diffs.length : 0), 0)
console.log('\nTOTAL differing elements across all scroll positions:', total)
