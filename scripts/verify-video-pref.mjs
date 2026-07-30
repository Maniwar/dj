// ============================================================================================
// VERIFY: the player's video button and the performance ladder cannot contradict each other
// ============================================================================================
// The defect this covers shipped and was visible: `videoEnabled` lived in useSiteStore, which the
// perf harness does not reconcile, so a profile containing `sectionVideo` (lean) or everything
// (minimal) switched the video off while the 🎬 button went on rendering `.on` and went on saying
// "Video ON". A control that lies about the thing it controls.
//
// The contract now, and every assertion below is one clause of it:
//
//   UNTOUCHED, video is the default and the ladder may still retire it. A device that cannot
//   afford twelve decoders is exactly what a floor is for.
//   TAPPED, video is a rung-2 override and NOTHING automatic may contradict it — not a profile,
//   not the dial at 0, not a chosen Auto's verdict. It drops something else instead.
//   THE BUTTON REFLECTS THE RESOLVED STATE either way, so it can never sit lit over dead video.
//
// Run against `vite preview` on :4173 (npm run build && npx vite preview).
import { chromium } from 'playwright-core'

const BASE = process.env.URL || 'http://localhost:4173/'
const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

let pass = 0
const failures = []
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else failures.push(`${name}\n     want ${JSON.stringify(want)}\n      got ${JSON.stringify(got)}`)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`)
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

/** A fresh page, logged in past the boot gate so the club (and the player) is mounted. */
async function open(query = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' })
  // The gate owns the only route into the club, and the perf state is applied before React mounts,
  // so this is also the point after which root classes are meaningful.
  await page.click('.logon-btn', { timeout: 5000 })
  await page.waitForSelector('.player', { timeout: 8000 })
  await page.waitForTimeout(300)
  return page
}

const read = (page) =>
  page.evaluate(() => {
    const root = document.documentElement
    const btn = document.querySelector('.tbtn.vid')
    return {
      offBc: root.classList.contains('fx-off-bcVideo'),
      offSection: root.classList.contains('fx-off-sectionVideo'),
      offHd: root.classList.contains('fx-off-hdRendition'),
      btnLit: btn ? btn.classList.contains('on') : null,
      btnTitle: btn ? btn.getAttribute('title') : null,
      storedOverrides: localStorage.getItem('so.perfOverrides'),
      // The one thing a class cannot tell us: is a <video> actually in the DOM?
      videoEls: document.querySelectorAll('video').length,
    }
  })

console.log('\n--- 1. default: untouched button, ladder is free to retire video ---')
{
  const page = await open()
  const base = await read(page)
  check('default has no video override stored', base.storedOverrides, null)
  check('default renders video (button lit, bcVideo on)', [base.offBc, base.btnLit], [false, true])
  check('default title does not claim a pinned state', base.btnTitle, 'Video ON — tap for stills')
  await page.close()
}
{
  // The ladder retiring video on an UNTOUCHED button is correct, and the button must follow it
  // down rather than stay lit. This is the half that must keep working.
  const page = await open('?profile=minimal')
  const r = await read(page)
  check('minimal retires video when untouched', [r.offBc, r.offSection], [true, true])
  check('button goes dark with it — no lit button over dead video', r.btnLit, false)
  check('title explains the ladder did it', r.btnTitle, 'Stills (performance) — tap to force video on')
  check('no <video> element left decoding behind a stills page', r.videoEls, 0)
  await page.close()
}

console.log('\n--- 2. tapped ON: a person asked, so nothing automatic may take it away ---')
{
  const page = await open('?profile=minimal')
  const before = await read(page)
  check('starts with video retired by the profile', before.offBc, true)
  await page.click('.tbtn.vid')
  await page.waitForTimeout(250)
  const after = await read(page)
  check('tap restores video under minimal', [after.offBc, after.offSection], [false, false])
  check('button lit and reports it is being kept on', after.btnLit, true)
  check('title says pinned', after.btnTitle, 'Video ON, kept on — tap for stills')
  check(
    'both video ids persisted as force-on overrides',
    JSON.parse(after.storedOverrides || '{}'),
    { bcVideo: true, sectionVideo: true }
  )
  check('hdRendition is NOT pinned by the button — quality stays the ladder call', after.offHd, true)
  check('a real <video> came back', after.videoEls > 0, true)
  await page.close()
}
{
  // The pin has to survive a reload, which the old flag did not — it was never persisted while the
  // profile was, so every visit reloaded the button lit over dead videos.
  const page = await open('?profile=minimal')
  await page.click('.tbtn.vid')
  await page.waitForTimeout(200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.click('.logon-btn', { timeout: 5000 })
  await page.waitForSelector('.player', { timeout: 8000 })
  await page.waitForTimeout(300)
  const r = await read(page)
  check('pin survives a reload under a stored-hostile profile', r.offBc, false)
  check('button still lit after reload', r.btnLit, true)
  await page.close()
}

console.log('\n--- 3. the dial at 0 is automatic too, and must not overrule the pin ---')
{
  const page = await open('?intensity=0')
  const untouched = await read(page)
  check('intensity 0 retires video when untouched', untouched.offBc, true)
  await page.click('.tbtn.vid')
  await page.waitForTimeout(250)
  const pinned = await read(page)
  check('pin beats intensity 0', pinned.offBc, false)
  check('button lit at intensity 0 once pinned', pinned.btnLit, true)
  await page.close()
}

console.log('\n--- 4. tapped OFF is a choice as well: Full must not put video back ---')
{
  const page = await open('?profile=full')
  await page.click('.tbtn.vid') // pin OFF from a state where the profile wants it on
  await page.waitForTimeout(250)
  const r = await read(page)
  check('pinned off under full', [r.offBc, r.offSection], [true, true])
  check('button dark, and titled as a choice not a limitation', r.btnTitle, 'Stills — tap for video')
  check('no decoders', r.videoEls, 0)
  await page.close()
}

console.log('\n--- 5. a chosen Auto is automatic too: its verdict must not unpin video ---')
{
  // The measureEpoch half of this change — turning video on licensing one more measurement — is
  // NOT asserted here, deliberately. Its only observable consequence is a second, worse verdict,
  // and on any machine fast enough to run this suite both verdicts are `full`, so a green result
  // would prove nothing. It is carried in the JSON export as env.measureEpoch instead, which is
  // how every device-specific fact in this project has actually been established.
  //
  // What IS assertable here is the clause that matters most: `?profile=auto` is an explicit
  // request to be restyled by a measurement, and even that may not contradict a pinned button.
  const page = await open('?profile=auto')
  await page.click('.tbtn.vid') // pin OFF, then back ON, so the override is by hand and is `true`
  await page.waitForTimeout(200)
  await page.click('.tbtn.vid')
  await page.waitForTimeout(200)
  const pinned = await read(page)
  check('pinned on under a chosen Auto', pinned.offBc, false)
  // Long enough to clear the 3.5s grace plus both 900ms windows and the gap, i.e. past the point
  // where the first verdict has landed and been applied.
  await page.waitForTimeout(7000)
  const settled = await read(page)
  check('still on after the detector has had its say', settled.offBc, false)
  check('button still lit', settled.btnLit, true)
  check('override intact', JSON.parse(settled.storedOverrides || '{}').bcVideo, true)
  await page.close()
}

await browser.close()

console.log(`\n${pass} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('\nFAILURES\n')
  for (const f of failures) console.log(`  - ${f}\n`)
  process.exit(1)
}
