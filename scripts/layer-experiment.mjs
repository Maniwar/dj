// ============================================================================================
// LAYER EXPERIMENT — inject a candidate cut, re-count REAL compositor layers, revert, repeat
// ============================================================================================
// The DOM census in sampler.ts answers "how many elements carry a transform or a will-change",
// which is the number every historical export is quoted in. It is NOT the same question as "how
// many compositor layers does Blink actually create" — a static `rotate(45deg)` counts in the
// first and not in the second. Task 3 needs both, so this script measures the second directly
// from CDP LayerTree and diffs it across candidate patches, in ONE page load so nothing else
// moves between readings.
//
// Blink's compositing DECISION is platform-independent (same cc/ code on Mali and on a laptop),
// which is what makes a headless layer count transferable even though the absolute frame times
// are not.
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
const URL_ = (args.url || 'http://localhost:4801/') + (args.query ? '?' + args.query : '')
const PATCHES = JSON.parse(readFileSync(args.patches, 'utf8'))

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: geom.width, height: geom.height }, deviceScaleFactor: geom.deviceScaleFactor, hasTouch: geom.hasTouch })
const page = await context.newPage()
const client = await context.newCDPSession(page)
let layers = null
client.on('LayerTree.layerTreeDidChange', (e) => {
  if (e.layers) layers = e.layers
})
await client.send('LayerTree.enable')

await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.locator('.logon-btn').waitFor({ state: 'visible', timeout: 25000 })
await page.locator('.logon-btn').click()
await page.waitForSelector('.hero', { timeout: 15000 })
await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 45000 })
await page.waitForTimeout(4000)

// The census, verbatim from sampler.ts, so both currencies come from the same reading.
const census = () =>
  page.evaluate(() => {
    let n = 0
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.willChange !== 'auto' || cs.transform !== 'none') n++
    }
    return n
  })

// A layer reading has to be forced: layerTreeDidChange only fires when something changes, so a
// no-op patch would silently report the PREVIOUS patch's number. Toggling the tree off and on
// guarantees a fresh full snapshot for every row.
async function readLayers() {
  await page.waitForTimeout(900)
  layers = null
  await client.send('LayerTree.disable')
  await client.send('LayerTree.enable')
  const t0 = Date.now()
  while (layers === null && Date.now() - t0 < 6000) await page.waitForTimeout(100)
  return layers ? layers.length : null
}

async function apply(css) {
  await page.evaluate((css) => {
    let s = document.getElementById('__exp')
    if (!s) {
      s = document.createElement('style')
      s.id = '__exp'
      document.head.appendChild(s)
    }
    s.textContent = css
  }, css)
  await page.waitForTimeout(1200)
}

// ROUND-ROBIN, NOT ONE PASS PER PATCH. The page is live while this runs — the karaoke word
// advances, the tour rail shows and hides, a slide activates — and a single sweep charges all of
// that drift to whichever patch happened to be applied when it moved. Measured: a straight sweep
// gave BASELINE 87 census on the way out and 84 on the way back, which is larger than several of
// the effects being tested. Cycling every patch each round and taking the MEDIAN spreads the
// drift evenly across all of them.
const ROUNDS = Number(args.rounds || 3)
const all = [{ name: 'BASELINE', css: '' }, ...PATCHES]
const samples = new Map(all.map((p) => [p.name, { layers: [], census: [] }]))
for (let r = 0; r < ROUNDS; r++) {
  for (const p of all) {
    await apply(p.css)
    const s = samples.get(p.name)
    s.layers.push(await readLayers())
    s.census.push(await census())
  }
  process.stderr.write(`round ${r + 1}/${ROUNDS} done\n`)
}
const med = (a) => {
  const v = a.filter((x) => x != null).sort((x, y) => x - y)
  return v.length ? v[v.length >> 1] : null
}
const base = samples.get('BASELINE')
const bl = med(base.layers)
const bc = med(base.census)
const rows = []
for (const p of all) {
  const s = samples.get(p.name)
  const l = med(s.layers)
  const c = med(s.census)
  rows.push({ name: p.name, layers: l, census: c, dLayers: l - bl, dCensus: c - bc, rawLayers: s.layers, rawCensus: s.census })
  console.log(
    String(l).padStart(4) + ' layers (' + String(l - bl).padStart(4) + ')  ' +
    String(c).padStart(4) + ' census (' + String(c - bc).padStart(4) + ')  ' + p.name,
  )
}
await apply('')
console.log(JSON.stringify(rows))
await browser.close()
