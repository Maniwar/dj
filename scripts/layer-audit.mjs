// ============================================================================================
// COMPOSITOR LAYER AUDIT — enumerate every promotion cause on the RENDERED page
// ============================================================================================
// Written for task 3 (the Samsung Tab Ultra's ~120-layer cliff). The Surface's problem was 104
// `.glow-trail` nodes and is fixed; the tablet hides those entirely under (pointer: coarse), so
// its 99-layer FLOOR is a different, un-enumerated set of causes. This script enumerates it.
//
// WHAT IT COUNTS, AND WHY IT IS NOT A GUESS.
// Every element in the live document is inspected with getComputedStyle AFTER boot, plus
// document.getAnimations() for compositor-driving animations. An element is only counted if it
// is actually rendered (non-zero box, not display:none, not visibility:hidden, not opacity:0) —
// a `display: none` rule cannot cost a layer, and counting it would have made the coarse-pointer
// numbers meaningless since that is exactly how the cursor FX are switched off there.
//
// CDP LayerTree is also read, as ground truth, but it is NOT the headline number: headless
// Chrome composites differently from a Mali-G925 (no video overlay planes, SwiftShader for GL),
// so its absolute count does not transfer. The DOM cause count DOES transfer, because the
// promotion rules are the same code path in Blink on both.
//
//   node scripts/layer-audit.mjs --url http://localhost:4173/ --geom tablet
//   node scripts/layer-audit.mjs --url ... --geom surface --query 'profile=minimal&intensity=0'
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]])
    return acc
  }, []),
)

const BASE = args.url || 'http://localhost:4173/'
const QUERY = args.query || ''
const OUT = args.out || null
const SHOT = args.shot || null

// Measured device facts, from three real JSON exports. Do not re-derive.
const GEOM = {
  tablet: { width: 1691, height: 960, deviceScaleFactor: 1.75, hasTouch: true, isMobile: false, label: 'Samsung Tab Ultra (Mali-G925)' },
  surface: { width: 1564, height: 926, deviceScaleFactor: 1.75, hasTouch: false, isMobile: false, label: 'Surface (Iris Plus 640)' },
}
const geomName = args.geom || 'tablet'
const geom = GEOM[geomName]
if (!geom) throw new Error(`unknown --geom ${geomName}`)

const URL_ = BASE.replace(/\/$/, '/') + (QUERY ? (BASE.includes('?') ? '&' : '?') + QUERY : '')

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({
  viewport: { width: geom.width, height: geom.height },
  deviceScaleFactor: geom.deviceScaleFactor,
  hasTouch: geom.hasTouch,
  isMobile: geom.isMobile,
})
const page = await context.newPage()
const client = await context.newCDPSession(page)

// LayerTree ground truth. Collected across the whole run; the last snapshot is reported.
let lastLayers = null
await client.send('DOM.enable').catch(() => {})
client.on('LayerTree.layerTreeDidChange', (e) => {
  if (e.layers) lastLayers = e.layers
})
await client.send('LayerTree.enable').catch(() => {})

await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.locator('.logon-btn').waitFor({ state: 'visible', timeout: 25000 })
await page.locator('.logon-btn').click()
await page.waitForSelector('.hero', { timeout: 15000 })
await page.waitForFunction(() => !document.querySelector('.boot-gate'), { timeout: 45000 })
await page.waitForTimeout(4000) // let footage start, marquees spin up, audio graph settle

const result = await page.evaluate(() => {
  // ------------------------------------------------------------------------------------------
  // Is this element actually rendered? A rule that never paints cannot cost a layer.
  // ------------------------------------------------------------------------------------------
  const isRendered = (el, cs) => {
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false
    if (parseFloat(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return false
    // walk up for display:none / visibility:hidden ancestors — getBoundingClientRect is 0 for
    // those anyway, but content-visibility and detached subtrees are not always
    return el.isConnected
  }

  const has3d = (t) => {
    if (!t || t === 'none') return false
    if (t.startsWith('matrix3d(')) {
      const n = t.slice(9, -1).split(',').map(Number)
      // a matrix3d that is really 2d has 0 in the z row/col and 1 at m33
      return !(n[2] === 0 && n[6] === 0 && n[8] === 0 && n[9] === 0 && n[10] === 1 && n[11] === 0 && n[14] === 0)
    }
    return false
  }

  // Compositor-driving animations: a RUNNING css animation/transition on transform, opacity,
  // filter or backdrop-filter is promoted by Blink for its duration.
  const animByEl = new Map()
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target
    if (!t || !(t instanceof Element)) continue
    if (a.playState !== 'running') continue
    let props = new Set()
    try {
      for (const kf of a.effect.getKeyframes()) for (const k of Object.keys(kf)) props.add(k)
    } catch {}
    const compositable = [...props].filter((p) =>
      ['transform', 'opacity', 'filter', 'backdropFilter', 'rotate', 'scale', 'translate'].includes(p),
    )
    if (!compositable.length) continue
    const prev = animByEl.get(t) || new Set()
    for (const p of compositable) prev.add(p)
    animByEl.set(t, prev)
  }

  const WC_COMPOSITED = ['transform', 'opacity', 'filter', 'backdrop-filter', 'perspective', 'scroll-position', 'top', 'left', 'contents']

  const rows = []
  const all = document.querySelectorAll('*')
  for (const el of all) {
    const cs = getComputedStyle(el)
    if (!isRendered(el, cs)) continue
    const causes = []

    const wc = cs.willChange
    if (wc && wc !== 'auto') {
      const parts = wc.split(',').map((s) => s.trim())
      const hit = parts.filter((p) => WC_COMPOSITED.includes(p))
      if (hit.length) causes.push('will-change:' + hit.join('+'))
    }
    if (has3d(cs.transform)) causes.push('transform-3d')
    if (cs.transformStyle === 'preserve-3d') causes.push('preserve-3d')
    if (cs.perspective && cs.perspective !== 'none') causes.push('perspective')
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') causes.push('mix-blend-mode:' + cs.mixBlendMode)
    const bf = cs.backdropFilter || cs.webkitBackdropFilter
    if (bf && bf !== 'none') causes.push('backdrop-filter')
    if (cs.backfaceVisibility === 'hidden') causes.push('backface-visibility:hidden')
    if (cs.contain && cs.contain !== 'none') causes.push('contain:' + cs.contain)
    if (cs.isolation === 'isolate') causes.push('isolation')
    if (cs.position === 'fixed') causes.push('position:fixed')
    if (cs.position === 'sticky') causes.push('position:sticky')
    const tag = el.tagName.toLowerCase()
    if (tag === 'video') causes.push('<video>')
    if (tag === 'canvas') causes.push('<canvas>')
    if (tag === 'iframe') causes.push('<iframe>')
    const anim = animByEl.get(el)
    if (anim) causes.push('animation:' + [...anim].sort().join('+'))
    if (cs.filter && cs.filter !== 'none') causes.push('filter')

    if (!causes.length) continue

    // a stable, human-readable identity for the node
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean)
    const ident = tag + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : '')
    const r = el.getBoundingClientRect()
    rows.push({
      ident,
      tag,
      classes: cls,
      causes,
      w: Math.round(r.width),
      h: Math.round(r.height),
      area: Math.round(r.width * r.height),
    })
  }

  // Which CSS rules in the loaded sheets declare each promoting property, and on what selector.
  const RULE_PROPS = [
    'will-change', 'transform', 'transform-style', 'perspective', 'mix-blend-mode',
    'backdrop-filter', '-webkit-backdrop-filter', 'backface-visibility', 'contain',
    'isolation', 'position', 'filter', 'animation', 'animation-name',
  ]
  const ruleHits = []
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    const walk = (list, media) => {
      for (const rule of list) {
        // CSS NESTING MADE THE OBVIOUS WALK WRONG. In current Chrome every CSSStyleRule carries a
        // (usually empty) `.cssRules`, so `if (rule.cssRules) recurse; else inspect` recurses past
        // EVERY style rule and inspects none — this walk silently returned zero hits against a
        // 705-rule sheet. Inspect first, then recurse into whatever children a rule happens to
        // have. Grouping rules (@media/@supports) have no selectorText and fall through to the
        // recursion on their own.
        const st = rule.style
        if (rule.selectorText && st) {
        const props = []
        for (const p of RULE_PROPS) {
          const v = st.getPropertyValue(p)
          if (!v) continue
          if (p === 'position' && !['fixed', 'sticky'].includes(v.trim())) continue
          if (p === 'transform' && !/matrix3d|translate3d|translateZ|rotateX|rotateY|rotate3d|perspective\(/i.test(v)) continue
          if (p === 'contain' && v.trim() === 'none') continue
          if (p === 'isolation' && v.trim() !== 'isolate') continue
          if (p === 'will-change' && v.trim() === 'auto') continue
          if ((p === 'backdrop-filter' || p === '-webkit-backdrop-filter' || p === 'filter') && v.trim() === 'none') continue
          if (p === 'mix-blend-mode' && v.trim() === 'normal') continue
          if (p === 'backface-visibility' && v.trim() !== 'hidden') continue
          if (p === 'transform-style' && v.trim() !== 'preserve-3d') continue
          if (p === 'perspective' && v.trim() === 'none') continue
          props.push(p + ': ' + v.trim())
        }
        if (props.length) {
          let live = 0
          try {
            live = document.querySelectorAll(rule.selectorText).length
          } catch {}
          let rendered = 0
          try {
            for (const el of document.querySelectorAll(rule.selectorText)) {
              const cs = getComputedStyle(el)
              if (isRendered(el, cs)) rendered++
            }
          } catch {}
          ruleHits.push({ selector: rule.selectorText, media: media || null, props, matched: live, rendered })
        }
        }
        if (rule.cssRules && rule.cssRules.length) {
          walk(rule.cssRules, rule.conditionText ? (media ? media + ' && ' + rule.conditionText : rule.conditionText) : media)
        }
      }
    }
    walk(rules, null)
  }

  // ------------------------------------------------------------------------------------------
  // THE CENSUS METRIC — byte-for-byte the formula in src/perf/sampler.ts:377.
  // ------------------------------------------------------------------------------------------
  // This is the currency every number in the handoff is quoted in (Surface 202 -> 79, tablet
  // floor 99 / baseline 136 / cliff ~120), so it is reproduced EXACTLY rather than improved on:
  // `body *`, will-change !== auto OR transform !== none, no rendered-ness test. Any other
  // formula would produce numbers that cannot be compared to the three real device exports.
  // Every rule in the loaded sheets that could supply a transform / will-change / animation,
  // indexed so each counted element can be attributed back to the selector that promoted it.
  const sourceRules = []
  for (const sheet of document.styleSheets) {
    let top
    try {
      top = sheet.cssRules
    } catch {
      continue
    }
    const walk = (list, media) => {
      for (const rule of list) {
        // See the note in the ruleHits walk: inspect before recursing, because CSS nesting gives
        // every style rule a `.cssRules` of its own.
        if (rule.selectorText && rule.style) {
          const decl = []
          for (const p of ['transform', 'will-change', 'animation', 'animation-name', 'scale', 'rotate', 'translate']) {
            const v = rule.style.getPropertyValue(p)
            if (v && v !== 'none' && v !== 'auto') decl.push(p + ': ' + v.trim())
          }
          if (decl.length) sourceRules.push({ sel: rule.selectorText, media: media || null, decl })
        }
        if (rule.cssRules && rule.cssRules.length) {
          walk(rule.cssRules, rule.conditionText ? (media ? media + ' && ' + rule.conditionText : rule.conditionText) : media)
        }
      }
    }
    walk(top, null)
  }
  const attribute = (el) => {
    const hits = []
    for (const r of sourceRules) {
      try {
        if (el.matches(r.sel)) hits.push((r.media ? '@media ' + r.media + ' { ' : '') + r.sel + ' { ' + r.decl.join('; ') + ' }' + (r.media ? ' }' : ''))
      } catch {}
    }
    if (el.getAttribute('style') && /transform|will-change|scale|rotate|translate/.test(el.getAttribute('style'))) {
      hits.push('[inline style] ' + el.getAttribute('style').slice(0, 120))
    }
    return hits
  }

  const censusRows = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    const wc = cs.willChange !== 'auto'
    const tf = cs.transform !== 'none'
    if (!wc && !tf) continue
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean)
    const r = el.getBoundingClientRect()
    censusRows.push({
      ident: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : ''),
      willChange: wc ? cs.willChange : null,
      transform: tf ? cs.transform : null,
      display: cs.display,
      rendered: isRendered(el, cs),
      w: Math.round(r.width),
      h: Math.round(r.height),
      from: attribute(el),
    })
  }

  return {
    rows,
    ruleHits,
    censusRows,
    census: {
      elements: document.querySelectorAll('body *').length,
      promotedLayers: censusRows.length,
      promotedRendered: censusRows.filter((r) => r.rendered).length,
      byWillChange: censusRows.filter((r) => r.willChange).length,
      byTransformOnly: censusRows.filter((r) => !r.willChange && r.transform).length,
    },
    env: {
      innerWidth: innerWidth,
      innerHeight: innerHeight,
      dpr: devicePixelRatio,
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      hover: matchMedia('(hover: hover)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
      rootClasses: document.documentElement.className,
      bodyClasses: document.body.className,
      totalElements: document.querySelectorAll('*').length,
      videos: document.querySelectorAll('video').length,
      canvases: document.querySelectorAll('canvas').length,
    },
  }
})

// aggregate by cause
const byCause = {}
for (const r of result.rows) {
  for (const c of r.causes) {
    const key = c.split(':')[0] === 'will-change' ? c : c.split(':')[0] === 'contain' ? c : c.split(':')[0] === 'animation' ? 'animation' : c
    byCause[key] = (byCause[key] || 0) + 1
  }
}
// aggregate by ident (selector-ish), keeping the causes
const byIdent = {}
for (const r of result.rows) {
  const k = r.ident
  if (!byIdent[k]) byIdent[k] = { count: 0, causes: r.causes, w: r.w, h: r.h }
  byIdent[k].count++
}

// the census metric, grouped by node identity + the exact reason it counted
const censusByIdent = {}
for (const r of result.censusRows) {
  const key = r.ident + ' || ' + (r.willChange ? 'wc=' + r.willChange : '') + (r.transform ? ' tf=' + r.transform : '')
  if (!censusByIdent[key]) censusByIdent[key] = { count: 0, rendered: 0, display: r.display, w: r.w, h: r.h, from: r.from }
  censusByIdent[key].count++
  if (r.rendered) censusByIdent[key].rendered++
}

// file:line for every selector that appeared in an attribution, resolved against the SOURCE
// (dist CSS is minified and its line numbers mean nothing to a human reading a report).
const SRC = ['src/index.css', 'src/fx-off.css']
const srcLines = SRC.map((f) => ({ f, lines: readFileSync(resolve(process.cwd(), f), 'utf8').split('\n') }))
const locate = (sel) => {
  const first = sel.split(',')[0].trim()
  const needle = first.replace(/\s+/g, ' ')
  const out = []
  for (const { f, lines } of srcLines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(needle)) {
        out.push(`${f}:${i + 1}`)
        if (out.length >= 3) return out
      }
    }
  }
  return out
}
for (const v of Object.values(censusByIdent)) {
  v.at = (v.from || []).map((s) => {
    const m = s.match(/(?:@media [^{]*\{ )?([^{]+)\{/)
    return { rule: s, at: m ? locate(m[1]) : [] }
  })
}

const out = {
  url: URL_,
  geom: geomName,
  geomLabel: geom.label,
  env: result.env,
  // THE HEADLINE — sampler.ts's formula, the number 99/136/202/79 are quoted in
  census: result.census,
  // stricter: elements that a compositor would really give a layer to, rendered only
  strictPromoted: result.rows.length,
  cdpLayers: lastLayers ? lastLayers.length : null,
  byCause: Object.fromEntries(Object.entries(byCause).sort((a, b) => b[1] - a[1])),
  censusByIdent: Object.fromEntries(Object.entries(censusByIdent).sort((a, b) => b[1].count - a[1].count)),
  byIdent: Object.fromEntries(Object.entries(byIdent).sort((a, b) => b[1].count - a[1].count)),
  rules: result.ruleHits.filter((r) => r.rendered > 0).sort((a, b) => b.rendered - a.rendered),
}

if (SHOT) {
  mkdirSync(dirname(resolve(SHOT)), { recursive: true })
  await page.screenshot({ path: resolve(SHOT), fullPage: false })
}
if (OUT) {
  mkdirSync(dirname(resolve(OUT)), { recursive: true })
  writeFileSync(resolve(OUT), JSON.stringify(out, null, 2))
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
