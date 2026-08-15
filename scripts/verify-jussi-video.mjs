#!/usr/bin/env node
// End-to-end proof that Jussi's Lore stops actually swap their still for the generated mp4,
// and that the video the browser asks for really exists (a missing rendition is otherwise a
// silent, resolution-dependent break). Run against `npm run preview`.
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

const results = {}
// Two viewports on purpose: 1440 takes the 720p path, 2560 crosses the HD threshold. The bug
// this guards against only appears on the wide one.
for (const [label, width] of [['sd-1440', 1440], ['hd-2560', 2560]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const failed = []
  page.on('response', (r) => {
    if (/\/assets\/video\/.*\.mp4/.test(r.url()) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  const logon = page.locator('.logon-btn')
  if (await logon.count()) await logon.first().click()
  await page.waitForTimeout(2200)

  await page.locator('.lore-stop.accent-jussi').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(2500)

  const info = await page.evaluate(() => {
    const stop = document.querySelector('.lore-stop.accent-jussi')
    const v = stop?.querySelector('video')
    return {
      hasVideoEl: !!v,
      src: v?.getAttribute('src') || null,
      readyState: v?.readyState ?? null,   // >=1 means metadata loaded, i.e. the file resolved
      videoWidth: v?.videoWidth ?? null,
    }
  })
  if (label === 'hd-2560') await page.screenshot({ path: `${OUT}/jussi-video-hd.png` })
  results[label] = { ...info, failedRequests: failed }
  await page.close()
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
const anyFailed = Object.values(results).some((r) => r.failedRequests.length)
if (anyFailed) process.exit(5)
