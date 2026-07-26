import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(existsSync)
const b = await chromium.launch({ headless:true, ...(exe?{executablePath:exe}:{channel:'chrome'}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] })
// 1080x1920 — the top of Spotify's 720-1080px range, 9:16 exactly
const ctx = await b.newContext({
  viewport: { width: 1080, height: 1920 },
  recordVideo: { dir: 'artwork/canvas/raw', size: { width: 1080, height: 1920 } },
})
const page = await ctx.newPage()
await page.goto('http://localhost:4281/', { waitUntil:'domcontentloaded' })
await page.waitForTimeout(1200)
await page.evaluate(() => document.querySelector('.logon-btn')?.click())
await page.waitForSelector('.boot-gate', { state:'detached', timeout:30000 }).catch(()=>{})
await page.waitForTimeout(5000)
// Spotify shows the track and artist name in Now Playing and asks you not to repeat them, so
// every piece of type comes off — this is the rig and the footage, nothing else.
await page.evaluate(() => {
  const hide = ['.content', '.player', '.lyric-stage', '.tour-rail', '.brandbar', '.bc-rec',
                '.beat-cursor', '.flashlight', '.friction-overlay']
  hide.forEach(s => document.querySelectorAll(s).forEach(e => e.style.display = 'none'))
  const c = document.querySelector('.thermal-canvas')
  if (c) c.style.filter = 'saturate(1.3) brightness(1.15)'
})
await page.waitForTimeout(9000) // plenty of material to cut a clean 4s from
await ctx.close()
await b.close()
console.log('raw capture written to artwork/canvas/raw/')
