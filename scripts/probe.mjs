// Ad-hoc rendered-state probe. Boots the built site at a given geometry and runs an arbitrary
// expression in the page, so a question about the RENDERED result is answered by measuring it
// rather than by reading the stylesheet. Kept alongside layer-audit.mjs for the same reason that
// one exists: two bugs in this file were invisible to reading and obvious to measuring.
//   node scripts/probe.mjs --geom tablet --query '...' --fn "() => ({...})"
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]])
    return acc
  }, []),
)
const GEOM = {
  tablet: { width: 1691, height: 960, deviceScaleFactor: 1.75, hasTouch: true },
  surface: { width: 1564, height: 926, deviceScaleFactor: 1.75, hasTouch: false },
}
const geom = GEOM[args.geom || 'tablet']
const BASE = args.url || 'http://localhost:4801/'
const URL_ = BASE + (args.query ? '?' + args.query : '')
const fn = args.fnfile ? readFileSync(args.fnfile, 'utf8') : args.fn

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: geom.width, height: geom.height }, deviceScaleFactor: geom.deviceScaleFactor, hasTouch: geom.hasTouch })
const page = await context.newPage()
await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.locator('.logon-btn').waitFor({ state: 'visible', timeout: 25000 })
await page.locator('.logon-btn').click()
await page.waitForSelector('.hero', { timeout: 15000 })
await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 45000 })
await page.waitForTimeout(Number(args.settle || 4000))
if (args.scroll) await page.evaluate((y) => scrollTo(0, Number(y)), args.scroll)
if (args.scroll) await page.waitForTimeout(1500)

// Invoked as an EXPRESSION, explicitly. Handing playwright a bare `() => {...}` string makes it
// guess whether that is a function or a body, and a wrong guess resolves to undefined silently.
const out = await page.evaluate(`(() => { try { return (${fn})() } catch (e) { return { __error: String(e && e.stack || e) } } })()`)
console.log(JSON.stringify(out, null, 2))
await browser.close()
