import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(existsSync)
// real GPU path where available; the light rig is the whole point of this capture
const b = await chromium.launch({ headless:true, ...(exe?{executablePath:exe}:{channel:'chrome'}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] })
// square, at 2x, so the capture is a true 3000x3000
const ctx = await b.newContext({ viewport:{width:1500,height:1500}, deviceScaleFactor:2 })
const page = await ctx.newPage()
await page.goto('http://localhost:4280/', { waitUntil:'domcontentloaded' })
await page.waitForTimeout(1200)
await page.evaluate(() => document.querySelector('.logon-btn')?.click())
await page.waitForSelector('.boot-gate', { state:'detached', timeout:30000 }).catch(()=>{})
await page.waitForTimeout(6000)
// Rendering the SITE at 1:1 and calling it a cover was tried and abandoned. It produces a page,
// not a sleeve: the crest strands itself in a corner because the desktop four-corner grid still
// applies at 1500px, the catalogue line lands unreadable over the picture, and the ARTIST NAME
// does not appear at all — which is the one thing album art has to carry. The site's hero is
// composed to sit beside a player and a scroll cue; a sleeve has different requirements and
// needs its own layout. So this captures the ARTWORK only, and cover.html composes the sleeve.
await page.evaluate(() => {
  // page furniture: interface, not artwork
  const hide = [
    '.player', '.lyric-stage', '.tour-rail', '.brandbar', '.bc-rec',
    '.beat-cursor', '.flashlight', '.scroll-cue', '.hitcounter', '.hero-gauge',
    '.hero-flex', '.friction-overlay',
  ]
  hide.forEach((sel) => document.querySelectorAll(sel).forEach((e) => (e.style.display = 'none')))

  // everything below the hero belongs to the site, not to a sleeve
  document.querySelectorAll('section:not(.hero), .site-footer').forEach((e) => (e.style.display = 'none'))

  document.querySelectorAll('.content').forEach((e) => (e.style.display = 'none'))
  const inner = null && document.querySelector('.hero-inner')
  if (inner) {
    inner.style.cssText +=
      ';display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'text-align:center;height:100vh;padding:0 8vw;max-width:none;'
  }
  document.querySelectorAll('.hero-lede, .hero-meta').forEach((e) => (e.style.display = 'contents'))
  const crest = document.querySelector('.hero-crest')
  if (crest) crest.style.cssText += ';margin:0 0 3vh 0;transform:scale(1.5);'
  const title = document.querySelector('.hero-title .drip')
  if (title) title.style.cssText += ';font-size:15vw;line-height:.84;'
  const sub = document.querySelector('.hero-sub')
  if (sub) sub.style.cssText += ';font-size:3.2vw;margin-top:3vh;'
  const artists = document.querySelector('.hero-artists')
  if (artists) artists.style.cssText += ';font-size:2.6vw;margin-top:1.5vh;'
  const eyebrow = document.querySelector('.eyebrow')
  if (eyebrow) eyebrow.style.cssText += ';font-size:1.5vw;letter-spacing:.4em;margin-bottom:3vh;'

  // push the rig: this is a cover, not a UI
  const c = document.querySelector('.thermal-canvas')
  if (c) { c.style.opacity = '1'; c.style.filter = 'saturate(1.35) brightness(1.2)' }
})
await page.waitForTimeout(2500)
await page.screenshot({ path:'artwork/bg-rig.jpg', type:'jpeg', quality:96 })
await b.close()
console.log('captured artwork/bg-rig.jpg — live rig at 3000x3000')
