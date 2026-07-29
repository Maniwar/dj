// ============================================================================================
// VERIFY THE KILL SHEET — every fx-off-<id> class must actually change computed style
// ============================================================================================
// This project has repeatedly shipped overrides that silently did nothing: a later duplicate
// rule won, a media query never matched, or the selector was rewritten out from under the
// override. A switch that reports "off" in the panel and in the exported JSON while the effect
// keeps running does not just fail to help — it puts a wrong number in a benchmark, which is
// worse than no number.
//
// So each CSS-kind entry in src/perf/registry.ts is checked here against a live browser:
// measure getComputedStyle BEFORE the class, add it, measure AFTER, and require a difference on
// the property the rule claims to control.
//
// Probe elements are built in the page rather than hunted for. Half these selectors describe
// transient state (.section-cut exists for 420ms, .broadcast.glitch-cut for 280ms, .ls-ch only
// while a word is being sung, .tl-row.active only during playback), and the question being asked
// is purely "does this rule match and win the cascade" — which a synthetic node answers exactly,
// deterministically, and without waiting for the music.
//
// THREE THINGS THE PROBES HAVE TO GET RIGHT, each of which produced a false failure first time:
//   1. The audio variables must be NON-ZERO. With nothing playing --m-beat is 0, so the live
//      declaration and the pinned replacement evaluate to the same value and a working rule
//      looks like a no-op. They are forced to a mid-beat value for the duration of the run.
//   2. --accent must be in scope. .lore-name and friends read it inside a drop-shadow; with no
//      .accent-* ancestor the colour is invalid, the whole filter computes to `none`, and again
//      a working rule looks like a no-op. Those probes get an .accent-kiki wrapper.
//   3. Some effects only exist under a media query or a finish. .lore-fill is display:none until
//      2.5:1 and the mini bar only blurs under :root.glass-frost, so those checks run in their
//      own context rather than being quietly skipped.
//
//   node scripts/verify-fx-off.mjs            (expects `npm run preview` on :4173)
//   FX_URL=http://localhost:5173/ node scripts/verify-fx-off.mjs

import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const URL = process.env.FX_URL || 'http://localhost:4173/'

const CANDIDATES = [
  process.env.SMOKE_BROWSER,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

const exe = CANDIDATES.find((p) => existsSync(p))
const launchOpts = { headless: true, args: ['--headless=new', '--no-sandbox'] }
if (exe) launchOpts.executablePath = exe
else launchOpts.channel = 'chrome'

// { id, html, sel, props, pseudo?, root?: extra <html> class, wide?: needs an ultrawide viewport }
const CHECKS = [
  { id: 'shaderBlend', html: '<div class="thermal-canvas"></div>', sel: '.thermal-canvas', props: ['mix-blend-mode'] },
  { id: 'bcStrobe', html: '<div class="broadcast"><div class="bc-strobe"></div></div>', sel: '.bc-strobe', props: ['display'] },
  { id: 'bcGrain', html: '<div class="broadcast"><div class="bc-grain"></div></div>', sel: '.bc-grain', props: ['display'] },
  { id: 'bcScan', html: '<div class="broadcast"><div class="bc-scan"></div></div>', sel: '.bc-scan', props: ['mix-blend-mode'] },
  { id: 'bcVignette', html: '<div class="broadcast"><div class="bc-vignette"></div></div>', sel: '.bc-vignette', props: ['display'] },
  { id: 'bcRec', html: '<div class="broadcast"><div class="bc-rec">R</div></div>', sel: '.bc-rec', props: ['animation-name'] },
  { id: 'bcGlitchCut', html: '<div class="broadcast glitch-cut"></div>', sel: '.broadcast.glitch-cut', props: ['animation-name'] },

  { id: 'cardGlass', html: '<div class="merch-card">x</div>', sel: '.merch-card', props: ['backdrop-filter', 'background-image'] },
  { id: 'cardGlass', html: '<ul class="dates"><li>x</li></ul>', sel: '.dates li', props: ['backdrop-filter', 'background-image'] },
  { id: 'cardGlass', html: '<div class="hero-gauge">x</div>', sel: '.hero-gauge', props: ['backdrop-filter'] },
  { id: 'cardGlass', html: '<div class="gb-post">x</div>', sel: '.gb-post', props: ['backdrop-filter', 'background-image'] },

  { id: 'playerGlass', html: '<div class="player">x</div>', sel: '.player', props: ['backdrop-filter', 'background-image'] },
  { id: 'playerGlass', html: '<div class="player"><div class="player-title">x</div></div>', sel: '.player-title', props: ['backdrop-filter'] },
  { id: 'playerGlass', html: '<div class="player">x</div>', sel: '.player', props: ['animation-name'], pseudo: '::after' },
  { id: 'playerGlass', html: '<div class="player">x</div>', sel: '.player', props: ['animation-name'], pseudo: '::before' },
  // the mini bar only blurs in the FROSTED finish, via the --shade-blur custom property
  { id: 'playerGlass', root: 'glass-frost', html: '<div class="player minimized"><div class="player-shade">x</div></div>', sel: '.player-shade', props: ['backdrop-filter'] },

  // both fills are display:none until the viewport passes 2.5:1 — check them where they exist
  { id: 'blurFills', wide: true, html: '<div class="lore-stop"><div class="lore-fill"></div></div>', sel: '.lore-fill', props: ['display'] },
  { id: 'blurFills', wide: true, html: '<div class="journey-stop"><div class="journey-bg-blur"></div></div>', sel: '.journey-bg-blur', props: ['display'] },

  { id: 'beatFilter', html: '<h2 class="section-title">X</h2>', sel: '.section-title', props: ['filter'] },
  { id: 'beatFilter', html: '<h1 class="hero-title">X</h1>', sel: '.hero-title', props: ['filter'] },
  { id: 'beatFilter', html: '<h3 class="journey-city">X</h3>', sel: '.journey-city', props: ['filter'] },
  { id: 'beatFilter', html: '<div class="accent-kiki"><h3 class="lore-name">X</h3></div>', sel: '.lore-name', props: ['filter'] },
  { id: 'beatFilter', html: '<div class="accent-kiki"><span class="lore-roster-name">X</span></div>', sel: '.lore-roster-name', props: ['filter'] },

  { id: 'beatShadow', html: '<p class="section-kicker">X</p>', sel: '.section-kicker', props: ['text-shadow'] },
  { id: 'beatShadow', html: '<span class="journey-venue">X</span>', sel: '.journey-venue', props: ['text-shadow'] },
  { id: 'beatShadow', html: '<div class="accent-kiki"><span class="lore-eyebrow">X</span></div>', sel: '.lore-eyebrow', props: ['text-shadow'] },
  { id: 'beatShadow', html: '<div class="quote">X</div>', sel: '.quote', props: ['text-shadow'] },
  { id: 'beatShadow', html: '<div class="lcd-title">X</div>', sel: '.lcd-title', props: ['text-shadow'] },
  { id: 'beatShadow', html: '<div class="tl-row active"><div class="tl-title">X</div></div>', sel: '.tl-title', props: ['text-shadow'] },
  { id: 'beatShadow', html: '<div class="viz-now">X</div>', sel: '.viz-now', props: ['text-shadow'] },

  { id: 'beatBoxShadow', html: '<div class="brandbar">X</div>', sel: '.brandbar', props: ['box-shadow'] },
  { id: 'beatBoxShadow', html: '<div class="hero-flex"><span>X</span></div>', sel: '.hero-flex span', props: ['box-shadow'] },
  { id: 'beatBoxShadow', html: '<div class="tl-row active">X</div>', sel: '.tl-row.active', props: ['box-shadow'] },
  { id: 'beatBoxShadow', html: '<div class="rail-fill"></div>', sel: '.rail-fill', props: ['box-shadow'] },
  { id: 'beatBoxShadow', html: '<div class="rail-pin done"></div>', sel: '.rail-pin.done', props: ['box-shadow'] },

  { id: 'beatTransform', html: '<h2 class="section-title">X</h2>', sel: '.section-title', props: ['transform'] },
  { id: 'beatTransform', html: '<h3 class="journey-city">X</h3>', sel: '.journey-city', props: ['transform'] },
  { id: 'beatTransform', html: '<h1 class="hero-title"><span class="drip">X</span></h1>', sel: '.drip', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="crest"><div class="ring">X</div></div>', sel: '.ring', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="accent-kiki"><h3 class="lore-name">X</h3></div>', sel: '.lore-name', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="rail-vehicle">X</div>', sel: '.rail-vehicle', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="player minimized"><div class="shade-vu"><i></i></div></div>', sel: '.shade-vu i', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="tl-row active"><div class="tl-title">X</div></div>', sel: '.tl-title', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="ls-both"><span class="ls-word now">X</span></div>', sel: '.ls-word.now', props: ['transform'] },
  { id: 'beatTransform', html: '<div class="lm-run">X</div>', sel: '.lm-run', props: ['scale'] },

  { id: 'kenBurns', html: '<div class="broadcast"><div class="bc-frame on"></div></div>', sel: '.bc-frame', props: ['animation-name', 'will-change', 'top', 'scale'] },
  { id: 'kenBurns', html: '<div class="lore-stop" data-active="true"><div class="lore-bg"></div></div>', sel: '.lore-bg', props: ['animation-name', 'will-change', 'scale'] },
  { id: 'kenBurns', html: '<div class="journey-stop" data-active="true"><div class="journey-bg"></div></div>', sel: '.journey-bg', props: ['animation-name', 'will-change', 'scale'] },

  { id: 'goldSheen', html: '<div class="gold-text">X</div>', sel: '.gold-text', props: ['animation-name'] },
  { id: 'goldSheen', html: '<h2 class="section-title">X</h2>', sel: '.section-title', props: ['animation-name'] },

  { id: 'marquees', html: '<div class="lm-run">X</div>', sel: '.lm-run', props: ['animation-name', 'will-change'] },
  { id: 'marquees', html: '<div class="marquee-run">X</div>', sel: '.marquee-run', props: ['animation-name'] },
  { id: 'marquees', html: '<div class="marquee">X</div>', sel: '.marquee', props: ['animation-name'] },

  { id: 'lyricLetters', html: '<span class="ls-ch">X</span>', sel: '.ls-ch', props: ['animation-name'] },
  { id: 'lyricLetters', html: '<span class="ls-ch-i">X</span>', sel: '.ls-ch-i', props: ['animation-name'] },
  { id: 'lyricLetters', html: '<div class="ls-both"><span class="ls-word">X</span></div>', sel: '.ls-word', props: ['filter'] },

  { id: 'sectionCut', html: '<div class="section-cut"></div>', sel: '.section-cut', props: ['display'] },

  { id: 'cursorFx', html: '<div class="beat-cursor"></div>', sel: '.beat-cursor', props: ['display'] },
  { id: 'cursorFx', html: '<div class="flashlight"></div>', sel: '.flashlight', props: ['display'] },
  { id: 'cursorFx', html: '<div class="click-burst"></div>', sel: '.click-burst', props: ['display'] },
  { id: 'cursorFx', html: '<div class="glow-trail"></div>', sel: '.glow-trail', props: ['display'] },

  { id: 'player3d', html: '<div class="player">X</div>', sel: '.player', props: ['transform', 'transform-style'] },
  { id: 'player3d', html: '<div class="player"><div class="lcd">X</div></div>', sel: '.lcd', props: ['transform'] },
  { id: 'player3d', html: '<div class="player"><div class="transport">X</div></div>', sel: '.transport', props: ['transform'] },
  { id: 'player3d', html: '<div class="player"><div class="player-title">X</div></div>', sel: '.player-title', props: ['transform'] },
]

const browser = await chromium.launch(launchOpts).catch((e) => {
  console.error('[fx] could not launch a browser:', e?.message || e)
  process.exit(2)
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

// NOT networkidle: the page streams video and audio, so it never goes idle. All this needs is
// the stylesheet, so wait until a rule from it resolves.
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(
  () => {
    const probe = document.createElement('div')
    probe.className = 'bc-vignette'
    probe.style.position = 'fixed'
    document.body.appendChild(probe)
    const ok = getComputedStyle(probe).backgroundImage.includes('radial-gradient')
    probe.remove()
    return ok
  },
  null,
  { timeout: 20000 },
)

const run = async (checks) =>
  page.evaluate((list) => {
    const root = document.documentElement
    const out = []

    // Mid-beat, forced from a stylesheet rather than inline: AudioReactive rebuilds <html>'s
    // inline cssText whenever any value changes and would wipe an inline copy mid-run.
    const forced = document.createElement('style')
    forced.textContent =
      ':root{--m-beat:.5!important;--m-level:.5!important;--m-bass:.5!important;' +
      '--m-treble:.5!important;--m-snare:.5!important;--m-hat:.5!important;--m-down:.5!important;' +
      '--m-build:.5!important;--m-drop:.5!important;--b:.5!important}' +
      // TRANSITIONS OFF. .shade-vu i and .ls-word both transition `transform`, so adding the
      // class starts a 90-180ms tween and getComputedStyle immediately after returns the START
      // value — a working rule reads as a no-op. This cost two false failures.
      '*,*::before,*::after{transition:none!important}'
    document.head.appendChild(forced)

    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;height:400px'
    document.body.appendChild(host)

    const read = (sel, props, pseudo) => {
      const el = host.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el, pseudo || null)
      return props.map((p) => cs.getPropertyValue(p)).join(' | ')
    }

    for (const c of list) {
      host.innerHTML = c.html
      const cls = 'fx-off-' + c.id
      if (c.root) root.classList.add(c.root)
      root.classList.remove(cls)
      const before = read(c.sel, c.props, c.pseudo)
      root.classList.add(cls)
      const after = read(c.sel, c.props, c.pseudo)
      root.classList.remove(cls)
      if (c.root) root.classList.remove(c.root)
      out.push({
        id: c.id,
        sel: c.sel + (c.pseudo || ''),
        props: c.props.join(','),
        before,
        after,
      })
    }

    host.remove()
    forced.remove()
    return out
  }, checks)

const results = await run(CHECKS.filter((c) => !c.wide))

// The letterbox fills only exist past 2.5:1, so they get their own viewport.
await page.setViewportSize({ width: 2600, height: 900 })
results.push(...(await run(CHECKS.filter((c) => c.wide))))
await page.setViewportSize({ width: 1280, height: 900 })

// --beat-lift is a custom property whose rule has to beat an INLINE value written by
// AudioReactive every frame — which is the only reason it is declared !important. Setting the
// inline value first is the point of the check: without it, it would pass against an empty
// inline style and prove nothing.
results.push(
  await page.evaluate(() => {
    const root = document.documentElement
    root.style.setProperty('--beat-lift', '-7px')
    const before = getComputedStyle(root).getPropertyValue('--beat-lift').trim()
    root.classList.add('fx-off-beatLift')
    const after = getComputedStyle(root).getPropertyValue('--beat-lift').trim()
    root.classList.remove('fx-off-beatLift')
    root.style.removeProperty('--beat-lift')
    return { id: 'beatLift', sel: ':root (inline --beat-lift set)', props: '--beat-lift', before, after }
  }),
)

let failed = 0
for (const r of results) {
  const label = `${r.id.padEnd(15)} ${r.sel.padEnd(30)} ${r.props}`
  if (r.before === null || r.after === null) {
    console.log(`MISSING ${label}\n          probe did not match — fix the check, not the CSS`)
    failed++
  } else if (r.before === r.after) {
    console.log(`FAIL    ${label}\n          unchanged: ${r.before}`)
    failed++
  } else {
    console.log(`ok      ${label}\n          ${r.before}\n       -> ${r.after}`)
  }
}

console.log(`\n${results.length - failed}/${results.length} checks changed computed style`)
await browser.close()
process.exit(failed ? 1 : 0)
