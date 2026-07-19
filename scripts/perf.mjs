// Mobile performance probe. Emulates a throttled phone and measures FPS while the site is
// live, then ISOLATES each heavy layer (WebGL shader, Broadcast footage) by hiding it and
// re-measuring, so we can see which one actually costs the frames. Also counts long tasks.
//   node scripts/perf.mjs           (needs a preview server; default http://localhost:4173/)
//   PERF_URL=https://maniwar.github.io/dj/ node scripts/perf.mjs
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const URL = process.env.PERF_URL || 'http://localhost:4173/'
const CPU = Number(process.env.PERF_CPU || 4) // CPU throttle multiplier (4x ~ mid phone)
const CANDIDATES = [
  process.env.SMOKE_BROWSER,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
].filter(Boolean)
const exe = CANDIDATES.find((p) => existsSync(p))

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
  args: ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
})
const page = await context.newPage()
const client = await context.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: CPU })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.locator('.logon-btn').click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(3000) // let boot finish + footage/playback start

// count long tasks (main-thread blocks > 50ms) for the whole run
await page.evaluate(() => {
  window.__long = 0
  window.__longN = 0
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) { window.__long += e.duration; window.__longN++ }
  }).observe({ entryTypes: ['longtask'] })
})

async function fps(ms = 4000) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let frames = 0, last = performance.now(), worst = 0, jank = 0
        const start = last
        const tick = (now) => {
          const d = now - last
          last = now
          if (frames > 0) { if (d > worst) worst = d; if (d > 32) jank++ }
          frames++
          if (now - start < ms) requestAnimationFrame(tick)
          else resolve({ fps: +(frames / ((now - start) / 1000)).toFixed(1), worstMs: +worst.toFixed(0), jankFrames: jank })
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
}
const hide = (sel, on) =>
  page.evaluate(({ sel, on }) => { const e = document.querySelector(sel); if (e) e.style.display = on ? 'none' : '' }, { sel, on })

const out = { url: URL, cpuThrottle: `${CPU}x`, device: '390x844@3 (iPhone-ish)' }
out.baseline = await fps()
await hide('.thermal-canvas', true); out.hide_WebGL = await fps(); await hide('.thermal-canvas', false)
await hide('.broadcast', true); out.hide_Broadcast = await fps(); await hide('.broadcast', false)
await hide('.thermal-canvas', true); await hide('.broadcast', true)
out.hide_both = await fps()
await hide('.thermal-canvas', false); await hide('.broadcast', false)
out.longTasks = await page.evaluate(() => ({ totalMs: Math.round(window.__long), count: window.__longN }))

console.log(JSON.stringify(out, null, 2))
await browser.close()
