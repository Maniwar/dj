import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(existsSync)
const b = await chromium.launch({ headless:true, ...(exe?{executablePath:exe}:{channel:'chrome'}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--force-device-scale-factor=1'] })
const VIEWS = [
  ['mobile',   390, 844],
  ['tablet',   834, 1112],
  ['laptop',   1280, 800],
  ['fhd',      1920, 1080],
  ['qhd',      2560, 1440],
  ['uw21',     3440, 1440],
  ['uw32',     5120, 1440],
  ['uw7k',     7680, 2160],
]
const tag = process.argv[2] ?? 'base'
for (const [name, w, h] of VIEWS) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} })
  const page = await ctx.newPage()
  try {
    await page.goto('http://localhost:4173/', { waitUntil:'domcontentloaded' })
    await page.waitForTimeout(1200)
    // measure the boot-gate column before entering
    const m = await page.evaluate(() => {
      const el = document.querySelector('.boot-inner'); const btn = document.querySelector('.logon-btn')
      if (!el) return null
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const br = btn?.getBoundingClientRect()
      return { innerW: Math.round(r.width), padX: cs.paddingLeft,
               contentW: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
               btnW: Math.round(br?.width ?? 0), btnH: Math.round(br?.height ?? 0) }
    })
    console.log(`${name.padEnd(7)} ${String(w).padStart(4)}x${h}  boot-inner=${m?.innerW}px pad=${m?.padX} content=${m?.contentW}px  btn=${m?.btnW}x${m?.btnH}`)
    await page.screenshot({ path:`qa-shots/${tag}-${name}-boot.png` })
    await page.locator('.logon-btn').click({ timeout: 4000 }).catch(()=>{})
    await page.waitForTimeout(1400)
    await page.screenshot({ path:`qa-shots/${tag}-${name}-console.png` })  // the loading sequence
    await page.waitForTimeout(11000)
    await page.screenshot({ path:`qa-shots/${tag}-${name}-hero.png` })
    await page.evaluate(() => document.querySelector('#lore')?.scrollIntoView())
    await page.waitForTimeout(3500)
    await page.screenshot({ path:`qa-shots/${tag}-${name}-lore.png` })
  } catch (e) { console.log(name, 'FAILED', e.message.split('\n')[0]) }
  await ctx.close()
}
await b.close()
