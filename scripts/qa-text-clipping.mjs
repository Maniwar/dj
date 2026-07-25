import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(existsSync)
const b = await chromium.launch({ headless:true, ...(exe?{executablePath:exe}:{channel:'chrome'}),
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] })
for (const [name,w,h] of [['uw21',3440,1440],['uw32',5120,1440],['uw7k',7680,2160],['wide-short',3440,900]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/', { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => document.querySelector('.logon-btn')?.click())
  await page.waitForSelector('.boot-gate', { state:'detached', timeout:25000 }).catch(()=>{})
  await page.waitForTimeout(2000)
  // walk every section so lazy content is laid out
  await page.evaluate(async () => {
    for (const s of document.querySelectorAll('section[id]')) {
      s.scrollIntoView(); await new Promise(r => setTimeout(r, 260))
    }
  })
  const bad = await page.evaluate(() => {
    // ONLY genuine clipping: overflow hidden/clip on a real element. Not auto/scroll (that's
    // scrollable, not lost) and never <html>/<body> — everything below the fold would "fail".
    const clipAncestor = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p)
        if (/hidden|clip/.test(cs.overflowY) || /hidden|clip/.test(cs.overflowX)) return p
      }
      return null
    }
    const out = []
    for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,li,a,button,label,td,th')) {
      const txt = (el.textContent || '').trim()
      if (!txt || el.children.length) continue                 // leaf text only
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue
      const anc = clipAncestor(el); if (!anc) continue
      // ignore layers that are deliberately transformed/animated (the beat zoom)
      if (getComputedStyle(anc).scale !== 'none' && getComputedStyle(anc).scale !== '1') continue
      const ar = anc.getBoundingClientRect()
      const cut = Math.round(Math.max(0, r.bottom - ar.bottom) + Math.max(0, ar.top - r.top)
                           + Math.max(0, r.right - ar.right) + Math.max(0, ar.left - r.left))
      if (cut > 4) out.push(`${el.className || el.tagName}("${txt.slice(0,28)}") cut ${cut}px by .${anc.className.split(' ')[0]}`)
    }
    return [...new Set(out)]
  })
  console.log(`\n${name} ${w}x${h}: ${bad.length ? bad.length + ' clipped' : 'CLEAN'}`)
  bad.slice(0, 8).forEach(x => console.log('   ', x))
  await ctx.close()
}
await b.close()
