import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'

const URL = process.env.SMOKE_URL || 'http://localhost:4173/'
const OUT = process.env.SMOKE_OUT || './smoke-shots'
mkdirSync(OUT, { recursive: true })

// Resolve a Chromium/Chrome binary across environments (playwright-core bundles none):
// explicit override, the CI bundle, then common local installs. Last resort: the system
// 'chrome' channel. Keeps the smoke test runnable on the CI box AND a dev's macOS machine.
const CANDIDATES = [
  process.env.SMOKE_BROWSER,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', // CI bundle (Linux)
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

const exe = CANDIDATES.find((p) => existsSync(p))
const launchOpts = {
  headless: true,
  args: [
    '--headless=new',
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required',
  ],
}
if (exe) launchOpts.executablePath = exe
else launchOpts.channel = 'chrome' // fall back to a system Google Chrome install

let browser
try {
  browser = await chromium.launch(launchOpts)
} catch (e) {
  console.error(
    '[smoke] could not launch a browser. Install Chrome or set SMOKE_BROWSER to a Chrome/Chromium binary.\n' +
      String(e?.message || e),
  )
  process.exit(2)
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const errors = []
const warnings = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
  if (m.type() === 'warning') warnings.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${OUT}/smoke-1-boot.png` })

// LOG ON
const logon = page.locator('.logon-btn')
await logon.waitFor({ state: 'visible', timeout: 5000 })
await logon.click()

// wait for boot console to finish -> hero visible
await page.waitForSelector('.hero', { timeout: 8000 })
await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 9000 }).catch(() => {})
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/smoke-2-hero.png`, fullPage: false })

// probes
const probe = await page.evaluate(() => {
  const canvas = document.querySelector('.thermal-canvas canvas')
  let gl = null
  try {
    gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {}
  const audio = document.querySelector('audio')
  return {
    hasThermalCanvas: !!canvas,
    canvasHasGL: !!gl,
    hasPlayer: !!document.querySelector('.player'),
    hasSpectrum: !!document.querySelector('.spectrum-canvas'),
    trackRows: document.querySelectorAll('.tl-row').length,
    tourStops: document.querySelectorAll('.journey-stop').length,
    guestPosts: document.querySelectorAll('.gb-post').length,
    audioSrc: audio ? audio.currentSrc.split('/').pop() : null,
    audioPath: audio ? new URL(audio.currentSrc || 'about:blank', location.href).pathname : null,
    bootlegDetents: document.querySelectorAll('.bootleg .detent').length,
  }
})

// play a track + flip a bootleg
await page.locator('.tl-row .tl-play').first().click()
await page.waitForTimeout(400)
const detents = page.locator('.player .bootleg .detent')
if (await detents.count() > 1) await detents.nth(1).click()
await page.waitForTimeout(400)

// tour section (real Gemini posters)
await page.locator('#tour').scrollIntoViewIfNeeded()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/smoke-4-tour.png` })

// merch + footer (scroll them into view rather than overshooting the page end)
await page.locator('.merch').scrollIntoViewIfNeeded()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/smoke-3-bottom.png` })
await page.evaluate(() => window.scrollTo(0, 0))

const playing = await page.evaluate(() => {
  const a = document.querySelector('audio')
  return { paused: a?.paused, src: a?.currentSrc.split('/').pop(), t: a?.currentTime }
})

console.log(JSON.stringify({ probe, playing, errors, warnings: warnings.slice(0, 5) }, null, 2))
await browser.close()
if (errors.length) process.exit(3)
