#!/usr/bin/env node
// Verifies the Outtakes contact sheet renders (all frames, all images actually load) and that
// the rest of the page is untouched. Run against `npm run preview`.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL || 'http://localhost:4173/'
const OUT = './smoke-shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
const logon = page.locator('.logon-btn')
if (await logon.count()) await logon.first().click()
await page.waitForTimeout(2200)

await page.locator('#outtakes').scrollIntoViewIfNeeded()
await page.waitForTimeout(900)
// nudge through the grid so every lazy image is asked for
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(350)
}
await page.waitForTimeout(1200)

const ot = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.ot-card')]
  const imgs = [...document.querySelectorAll('.ot-img')]
  return {
    cards: cards.length,
    titles: [...document.querySelectorAll('.ot-title')].map((n) => n.textContent),
    imgsTotal: imgs.length,
    imgsLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
  }
})

await page.locator('#outtakes').scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/outtakes.png` })

// hero + rest of page still fine
await page.locator('.lore-stop.accent-jussi').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/jussi-hero-page.png` })

const rest = await page.evaluate(() => ({
  loreStops: document.querySelectorAll('.lore-stop').length,
  trackRows: document.querySelectorAll('.tl-row').length,
  guestPosts: document.querySelectorAll('.gb-post').length,
  hasPlayer: !!document.querySelector('.player'),
}))

console.log(JSON.stringify({ ot, rest, errors }, null, 2))
await browser.close()
if (ot.broken.length) process.exit(4)
