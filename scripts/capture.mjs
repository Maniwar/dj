// Capture the real mobile-emulated layout so we can actually SEE it (player docking, rail
// overlap, EQ) instead of guessing. Also grabs a burst to eyeball for gross flashing.
//   CAP_URL=http://localhost:5173/ node scripts/capture.mjs
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'

const URL = process.env.CAP_URL || 'http://localhost:5173/'
const OUT = process.env.CAP_OUT || './smoke-shots'
mkdirSync(OUT, { recursive: true })
const exe = [
  process.env.SMOKE_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean).find(existsSync)

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({
  viewport: { width: Number(process.env.CAP_W||390), height: Number(process.env.CAP_H||844) },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
})
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.locator('.logon-btn').click({ timeout: 5000 }).catch(() => {})
await page.waitForTimeout(7500) // dial-up boot console dismisses itself after ~6s
async function shot(name, sel, idx = 0) {
  const ok = await page.evaluate(
    ({ sel, idx }) => {
      const el = document.querySelectorAll(sel)[idx]
      if (!el) return false
      el.scrollIntoView({ block: 'start' })
      return true
    },
    { sel, idx },
  )
  await page.waitForTimeout(850)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  return ok
}
await shot('m-lore-kiki', '.lore-stop', 0)
await shot('m-lore-dieter', '.lore-stop', 1)
await shot('m-tour-tokyo', '.journey-stop', 1)
await shot('m-tour-berlin', '.journey-stop', 3)
const info = await page.evaluate(() => {
  const p = document.querySelector('.player')
  const rail = document.querySelector('.tour-rail')
  const pr = p?.getBoundingClientRect()
  return {
    playerMobileClass: p?.className.includes('mobile'),
    playerRect: pr && { top: Math.round(pr.top), bottom: Math.round(pr.bottom), h: Math.round(pr.height) },
    railDisplay: rail ? getComputedStyle(rail).display : 'none(absent)',
    innerH: window.innerHeight,
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
