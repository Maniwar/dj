import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(existsSync)
const b = await chromium.launch({ headless:true, ...(exe?{executablePath:exe}:{channel:'chrome'}), args:['--no-sandbox'] })
const page = await b.newPage({ viewport:{width:3000,height:3000}, deviceScaleFactor:1 })
await page.goto('file://' + process.cwd() + '/artwork/cover.html', { waitUntil:'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1200)
await page.screenshot({ path:'artwork/club-humidity-cover-3000.jpg', type:'jpeg', quality:96 })
await b.close()
