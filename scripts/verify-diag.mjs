// ============================================================================================
// VERIFY THE DIAG HARNESS — panel, benchmark, export, end to end in a real browser
// ============================================================================================
// The panel exists to produce a number that can be trusted, so the things checked here are the
// ones that would make it produce a number that cannot:
//
//   · the host hangs off <html>, not <body>  — body.sauna's filter would otherwise tint the panel
//     AND make it a containing block, so a position:fixed panel would stop being fixed
//   · the site's stylesheet does not reach inside the shadow root
//   · every registry entry has exactly one switch, and flipping one writes exactly one class
//   · the live readout actually changes, i.e. the sampler's clock is running
//   · Run Quick refuses to start with no audio, and produces the full matrix with audio
//   · the exported file is real JSON, is self-describing, and carries percentiles rather than a
//     mean — the metric the whole exercise turns on
//
//   node scripts/verify-diag.mjs           (expects `npm run preview` on :4173)
//   DIAG_URL=http://localhost:5173/ node scripts/verify-diag.mjs

import { chromium } from 'playwright-core'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const URL = process.env.DIAG_URL || 'http://localhost:4173/'

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

const exe = CANDIDATES.find((p) => existsSync(p))
const launchOpts = {
  headless: true,
  // No SwiftShader flags, unlike smoke.mjs. Forcing software GL drops this page to about one
  // frame a second, every sample window then comes back "only 6 frames", and the matrix proves
  // nothing. The shader is switched off below instead, which is why no GL is needed at all.
  args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
}
if (exe) launchOpts.executablePath = exe
else launchOpts.channel = 'chrome'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const browser = await chromium.launch(launchOpts)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

// ---- boot, log on, play --------------------------------------------------------------------
// ?noshader, deliberately. Headless Chrome has no GPU, so ThermalRunaway's fragment shader runs
// on SwiftShader at about two frames a second — every sample window would come back `valid:false`
// with "only 6 frames" and the matrix would prove nothing. The point of this script is that the
// harness works, not what this machine scores; the real numbers come off the tablet.
// domcontentloaded, not networkidle: the site prefetches video from the moment it boots, so the
// network never goes idle and waiting for it to is a guaranteed timeout.
await page.goto(`${URL}${URL.includes('?') ? '&' : '?'}noshader`, { waitUntil: 'domcontentloaded' })
await page.locator('.logon-btn').waitFor({ state: 'visible', timeout: 15_000 })
await page.locator('.logon-btn').click()
await page.waitForSelector('.hero', { timeout: 8000 })
// The gate must be GONE, not merely past. It is a fixed full-viewport overlay, so while it is up
// every synthetic tap lands on it rather than on the crest — which looked exactly like the tap
// gesture being broken. The dial-up sequence plus a failing Turnstile can take ~15s locally.
await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 30_000 })
await page.waitForTimeout(600)

// ---- the crest gesture opens it, with no query string and no keyboard ----------------------
await page.evaluate(() => {
  window.__taps = []
  document.addEventListener('pointerdown', (e) => window.__taps.push(String(e.target.className)), true)
})
const crest = page.locator('.crest').first()
await crest.scrollIntoViewIfNeeded()
for (let i = 0; i < 5; i++) await crest.click({ force: true })
await page.waitForTimeout(400)
const taps = await page.evaluate(() => window.__taps)
const hostInfo = await page.evaluate(() => {
  const h = document.getElementById('so-diag-host')
  if (!h) return null
  return {
    parentIsHtml: h.parentElement === document.documentElement,
    hasShadow: !!h.shadowRoot,
    startsCollapsed: h.classList.contains('collapsed'),
    switches: h.shadowRoot?.querySelectorAll('input[type=checkbox][role=switch]').length ?? 0,
    // The site sets `font-family`, `letter-spacing` and `text-transform` globally; those are
    // inherited properties, the one category shadow DOM does NOT block. :host re-declares them.
    font: h.shadowRoot ? getComputedStyle(h.shadowRoot.querySelector('.wrap')).fontFamily : '',
    transform: h.shadowRoot ? getComputedStyle(h.shadowRoot.querySelector('.wrap')).textTransform : '',
  }
})
check('five taps on the crest open the panel', !!hostInfo, `taps hit: ${taps.join(' | ')}`)
check('opens collapsed, clear of the player transport', hostInfo?.startsCollapsed)
// Everything below operates the expanded panel.
await page.evaluate(() => document.getElementById('so-diag-host').shadowRoot.querySelector('.iconbtn').click())
await page.waitForTimeout(300)
check('host hangs off <html>, out of reach of body.sauna', hostInfo?.parentIsHtml)
check('open shadow root', hostInfo?.hasShadow)
check(
  'site typography does not leak in',
  hostInfo && !/Orbitron|Barlow|VT323/i.test(hostInfo.font) && hostInfo.transform === 'none',
  hostInfo?.font,
)

// ---- one switch per registry entry ----------------------------------------------------------
const registryCount = (readFileSync('src/perf/registry.ts', 'utf8').match(/^\s{4}id: '/gm) || []).length
check('a switch for every registry entry', hostInfo?.switches === registryCount, `${hostInfo?.switches} vs ${registryCount}`)

// ---- flipping a switch writes exactly one root class ----------------------------------------
const flip = await page.evaluate(async () => {
  const sr = document.getElementById('so-diag-host').shadowRoot
  const before = document.documentElement.className
  const sw = sr.querySelector('input[aria-label="Frosted cards"]')
  sw.click()
  await new Promise((r) => setTimeout(r, 120))
  const after = document.documentElement.className
  return { before, after, has: document.documentElement.classList.contains('fx-off-cardGlass'), checked: sw.checked }
})
check('flipping a switch adds its fx-off class', flip.has && flip.checked === false)
check(
  'and adds only that one class',
  flip.after.split(/\s+/).filter(Boolean).length === flip.before.split(/\s+/).filter(Boolean).length + 1,
  flip.after,
)

// ---- the readout is alive ---------------------------------------------------------------------
const readText = () =>
  page.evaluate(() => document.getElementById('so-diag-host').shadowRoot.querySelector('.live').textContent)
const t1 = await readText()
await page.waitForTimeout(1400)
const t2 = await readText()
check('live readout updates', t1 !== t2 && /p95/.test(t2), t2)

// ---- Run refuses without audio ----------------------------------------------------------------
// Chrome is launched with --autoplay-policy=no-user-gesture-required, so the site may already be
// playing by the time the panel opens. Stop it explicitly rather than assume: the refusal is the
// guard that stops nine audio-driven configurations from being measured on a silent page, and it
// is precisely the kind of thing that would go unnoticed if the test only ever ran with audio.
await page.evaluate(() => document.querySelectorAll('audio').forEach((a) => a.pause()))
await page.waitForTimeout(600)
const refusal = await page.evaluate(async () => {
  const sr = document.getElementById('so-diag-host').shadowRoot
  const btn = [...sr.querySelectorAll('button.act')].find((b) => b.textContent.startsWith('Run Quick'))
  btn.click()
  await new Promise((r) => setTimeout(r, 250))
  return { msg: sr.querySelector('.msg')?.textContent ?? '', started: !!sr.querySelector('.running') }
})
check('Run refuses with the music stopped', /Press play/i.test(refusal.msg) && !refusal.started, refusal.msg)

// ---- with audio, the full matrix runs ---------------------------------------------------------
await page.locator('.tl-row .tl-play').first().click()
await page.waitForFunction(
  () => [...document.querySelectorAll('audio')].some((a) => !a.paused),
  { timeout: 15_000 },
)
await page.waitForTimeout(1200)
await page.evaluate(() => {
  const sr = document.getElementById('so-diag-host').shadowRoot
  ;[...sr.querySelectorAll('button.act')].find((b) => b.textContent.startsWith('Run Quick')).click()
})
await page.waitForTimeout(600)
const sawStrip = await page.evaluate(
  () => !!document.getElementById('so-diag-host').shadowRoot.querySelector('.running'),
)
check('panel collapses to a progress strip while running', sawStrip)

await page
  .waitForFunction(
    () => !!document.getElementById('so-diag-host').shadowRoot.querySelector('table'),
    { timeout: 120_000, polling: 1000 },
  )
  .catch(() => {})
const rows = await page.evaluate(
  () => document.getElementById('so-diag-host').shadowRoot.querySelectorAll('tbody tr').length,
)
check('results table has all eight quick configurations', rows === 8, `${rows} rows`)

// ---- the export ---------------------------------------------------------------------------------
const dl = page.waitForEvent('download', { timeout: 15_000 })
await page.evaluate(() => {
  const sr = document.getElementById('so-diag-host').shadowRoot
  ;[...sr.querySelectorAll('button.act')].find((b) => b.textContent.startsWith('Export')).click()
})
let report = null
let filename = ''
try {
  const d = await dl
  filename = d.suggestedFilename()
  const path = await d.path()
  report = JSON.parse(readFileSync(path, 'utf8'))
} catch (e) {
  check('export downloads a file', false, String(e.message || e))
}

if (report) {
  // DIAG_DUMP=./out.json keeps the file, for eyeballing the shape of what the user will send.
  if (process.env.DIAG_DUMP) writeFileSync(process.env.DIAG_DUMP, JSON.stringify(report, null, 2))
  check('export downloads a file', true, filename)
  check(
    'filename carries build, device and timestamp',
    /^clubhumidity-perf_[^_]+_[^_]+_\d{8}T\d{6}\.json$/.test(filename),
    filename,
  )
  check('schema + build stamp', report.schema === 'clubhumidity.perf/1' && !!report.build.sha)
  check('device block identifies the machine', !!report.device.ua && report.device.viewport.megapixels > 0)
  check('registry is embedded, with reasons', report.registry.length === registryCount && !!report.registry[0].why)
  const quick = report.runs.find((r) => r.matrix === 'quick')
  check('the run is in the file', quick?.configs.length === 8)
  const s = quick?.configs[0]?.stats
  check(
    'percentiles, not just a mean',
    s && typeof s.p50 === 'number' && typeof s.p95 === 'number' && typeof s.p99 === 'number' && s.p99 >= s.p95 && s.p95 >= s.p50,
    s && `p50 ${s.p50} p95 ${s.p95} p99 ${s.p99}`,
  )
  check('analysis ranks on p95', report.analysis.metric === 'p95FrameMs' && report.analysis.rankedByP95.length === 8)
  check('the 2x2 interaction term was computed', !!report.analysis.interaction, report.analysis.interaction?.verdict)
  check(
    'unhonoured switches are declared, not hidden',
    Array.isArray(report.analysis.unmeasured) && report.session.reloadRequired.length > 0,
    `unmeasured: ${report.analysis.unmeasured?.join(',') || 'none'}`,
  )
}

// ---- and it puts the page back --------------------------------------------------------------
const restored = await page.evaluate(() => document.documentElement.className)
check('the page is restored to its pre-run configuration', restored.includes('fx-off-cardGlass'), restored)

// Turnstile fails against localhost with no site key — pre-existing and unrelated to the panel.
const relevant = pageErrors.filter((e) => !/Turnstile/i.test(e))
check('no page errors', relevant.length === 0, relevant.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
