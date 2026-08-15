#!/usr/bin/env node
// Verifies the Backstage lightbox: a frame opens, it loads the 2K rendition (not the grid one),
// arrows and Escape work, and the page underneath is locked while it is open.
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
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const bad = []
page.on('response', (r) => {
  if (/\/assets\/backstage\/.*\.jpg/.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`)
})
// Headless + swiftshader throttles rendering hard: rAF can go many seconds without ticking, which
// leaves CSS animations pinned at their first keyframe and makes a perfectly good overlay look
// half-transparent (or absent) in a screenshot. Driving frames by hand is the difference between
// testing the page and testing the software rasteriser.
const frames = (page, n = 8) =>
  page.evaluate((n) => new Promise((res) => {
    let i = 0
    const tick = () => (++i >= n ? res() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  }), n)

await page.goto(URL, { waitUntil: 'networkidle' })
const logon = page.locator('.logon-btn')
if (await logon.count()) await logon.first().click()
await page.waitForTimeout(2200)

await page.locator('#backstage').scrollIntoViewIfNeeded()
await page.waitForTimeout(800)

// open the first frame
await page.locator('.bs-open').first().click()
await page.waitForTimeout(1800)
await frames(page)

const opened = await page.evaluate(() => {
  const v = document.querySelector('.bs-viewer')
  const img = document.querySelector('.bs-viewer-img')
  return {
    open: !!v,
    src: img?.getAttribute('src') || null,
    naturalW: img?.naturalWidth ?? 0,
    naturalH: img?.naturalHeight ?? 0,
    fellBack: img?.dataset?.fellBack === '1',
    bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
    title: document.querySelector('.bs-viewer-title')?.textContent,
    counter: document.querySelector('.bs-viewer-count')?.textContent?.trim(),
    // the fade must actually land on 1 — a stuck overlay reads as a ghost of the page behind it
    opacity: v ? getComputedStyle(v).opacity : null,
    // the always-present player sits at z-index 60, so it must end up *behind* the overlay
    coversPlayer: (() => {
      const p = document.querySelector('.player')
      if (!p || !v) return null
      const r = p.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === v || v.contains(hit))
    })(),
  }
})
await page.screenshot({ path: `${OUT}/backstage-viewer.png` })

// arrow key advances
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(1200)
await frames(page)
const next = await page.evaluate(() => ({
  title: document.querySelector('.bs-viewer-title')?.textContent,
  counter: document.querySelector('.bs-viewer-count')?.textContent?.trim(),
  naturalW: document.querySelector('.bs-viewer-img')?.naturalWidth ?? 0,
}))

// escape closes and unlocks
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const closed = await page.evaluate(() => ({
  open: !!document.querySelector('.bs-viewer'),
  bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
}))

console.log(JSON.stringify({ opened, next, closed, failedImageRequests: bad }, null, 2))
await browser.close()

const problems = []
if (!opened.open) problems.push('viewer did not open')
if (!opened.bodyLocked) problems.push('page behind was not locked')
if (opened.fellBack) problems.push('fell back to the grid image — hi-res missing')
if (opened.naturalW < 2000) problems.push(`hi-res too small: ${opened.naturalW}px`)
if (Number(opened.opacity) < 0.99) problems.push(`overlay never faded in (opacity ${opened.opacity})`)
if (opened.coversPlayer === false) problems.push('player draws over the full-size image')
if (next.title === opened.title) problems.push('arrow key did not advance')
if (closed.open) problems.push('Escape did not close')
if (closed.bodyLocked) problems.push('page stayed locked after close')
if (bad.length) problems.push(`${bad.length} failed image request(s)`)
if (problems.length) { console.error('PROBLEMS: ' + problems.join('; ')); process.exit(6) }
console.log('viewer OK')
