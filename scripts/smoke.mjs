import { chromium } from 'playwright-core'

const URL = process.env.SMOKE_URL || 'http://localhost:4173/'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = process.env.SMOKE_OUT || './smoke-shots'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: EXE,
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
})
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
    tourCards: document.querySelectorAll('.tour-card').length,
    guestPosts: document.querySelectorAll('.gb-post').length,
    audioSrc: audio ? audio.currentSrc.split('/').pop() : null,
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
