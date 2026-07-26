import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(existsSync)
const b = await chromium.launch({ headless:true, ...(exe?{executablePath:exe}:{channel:'chrome'}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] })
for (const [n,w,h] of [['landscape',844,390],['portrait',390,844]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, isMobile:true, hasTouch:true, deviceScaleFactor:2 })
  await ctx.addInitScript(() => localStorage.setItem('so.player', JSON.stringify({x:24,y:0,min:true})))
  const page = await ctx.newPage()
  await page.goto('http://localhost:4212/', { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => document.querySelector('.logon-btn')?.click())
  await page.waitForSelector('.boot-gate', { state:'detached', timeout:30000 }).catch(()=>{})
  await page.waitForTimeout(4000)
  // pick a track that actually has multiple pressings
  await page.evaluate(() => { for (let i=0;i<6;i++) document.querySelector('.player-shade .shade-btn:nth-child(4)')?.click() })
  await page.waitForTimeout(1500)
  const r = await page.evaluate(() => {
    const g = document.querySelector('.shade-versions')
    const p = document.querySelector('.player').getBoundingClientRect()
    return { shown: g ? getComputedStyle(g).display : 'absent',
             chips: g ? [...g.querySelectorAll('.shade-ver')].map(b=>b.textContent.trim()) : [],
             on: g ? [...g.querySelectorAll('.shade-ver.on')].map(b=>b.textContent.trim()) : [],
             barH: Math.round(p.height) }
  })
  console.log(`${n} ${w}x${h}: chips ${r.shown} [${r.chips.join(' ')}] active=[${r.on.join('')}] barHeight=${r.barH}px`)
  if (n === 'landscape') await page.locator('.player').screenshot({ path:'qa-shots/chips.png' })
  await ctx.close()
}
await b.close()
