#!/usr/bin/env node
// Regression check for wiring Jussi into the Lore journey: confirms he renders WITHOUT
// disturbing the stops that were already there. Run against `npm run preview`.
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
await page.waitForTimeout(2500)

// Walk the whole Lore journey so every stop mounts and its IntersectionObserver fires.
const stops = await page.locator('.lore-stop').count()
const titles = await page.locator('.lore-name').allInnerTexts()
const tags = []
for (let i = 0; i < stops; i++) {
  await page.locator('.lore-stop').nth(i).scrollIntoViewIfNeeded()
  await page.waitForTimeout(650)
  const t = await page.locator('.lore-stop').nth(i).locator('.lore-tag').allInnerTexts()
  if (t.length) tags.push(t[0].trim())
}

// Jussi's own stop: screenshot it, and confirm the light rig took his accent.
const jussi = page.locator('.lore-stop.accent-jussi')
const hasJussi = (await jussi.count()) > 0
if (hasJussi) {
  await jussi.first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/jussi-lore.png` })
}
const accentNow = await page.evaluate(() => document.querySelector('.lore-stop.accent-jussi')
  ? getComputedStyle(document.querySelector('.lore-stop.accent-jussi')).getPropertyValue('--accent').trim()
  : null)

// The rest of the page must still work: tracklist, guestbook, tour, player.
await page.evaluate(() => window.scrollTo(0, 0))
const probe = await page.evaluate(() => ({
  trackRows: document.querySelectorAll('.tl-row').length,
  guestPosts: document.querySelectorAll('.gb-post').length,
  hasPlayer: !!document.querySelector('.player'),
  hasBroadcast: !!document.querySelector('.broadcast'),
  audio: (() => { const a = document.querySelector('audio'); return a ? { paused: a.paused, src: (a.currentSrc || '').split('/').pop() } : null })(),
}))

console.log(JSON.stringify({ stops, titles, tags, hasJussi, accentNow, probe, errors }, null, 2))
await browser.close()
if (errors.length) process.exit(3)
