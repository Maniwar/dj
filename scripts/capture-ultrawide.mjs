// Capture the site on extreme-wide desktop viewports so we can SEE what breaks (cover-crop of
// characters, empty side gutters, stretched hero). Desktop context (not mobile emulation).
//   CAP_URL=https://maniwar.github.io/dj/ node scripts/capture-ultrawide.mjs
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'

const URL = process.env.CAP_URL || 'https://maniwar.github.io/dj/'
const OUT = process.env.CAP_OUT || './ultrawide-shots'
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

const SIZES = [
  { name: '32x9', w: 5120, h: 1440 }, // super ultrawide
  { name: '21x9', w: 3440, h: 1440 }, // common ultrawide
]

for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.locator('.logon-btn').click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(7500)
  const shots = [
    ['home', null, 0],
    ['lore-kiki', '.lore-stop', 0],
    ['tour', '.journey-stop', 0],
    ['tracklist', '#tracks', 0],
  ]
  for (const [name, sel, idx] of shots) {
    if (sel) {
      await page.evaluate(({ sel, idx }) => {
        const el = document.querySelectorAll(sel)[idx]
        if (el) el.scrollIntoView({ block: 'start' })
      }, { sel, idx })
    } else {
      await page.evaluate(() => window.scrollTo(0, 0))
    }
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${s.name}-${name}.png` })
    console.log(`  ✓ ${s.name}-${name}`)
  }
  await ctx.close()
}
await browser.close()
console.log('done ->', OUT)
