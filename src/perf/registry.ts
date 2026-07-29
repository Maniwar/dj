// ============================================================================================
// THE EFFECT REGISTRY — one list, and everything else reads it
// ============================================================================================
// This project has spent weeks bisecting performance by hand: a new URL flag per experiment, a
// new conditional render per flag, and no way to ask "what is actually switched on right now?"
// The answer was spread across perfFlags.ts, three media queries and five components, so every
// measurement had to be re-derived from first principles and several were quietly wrong.
//
// So there is now exactly ONE description of every switchable effect, and every other part of
// the harness is a projection of it:
//
//   registry ──► root class `fx-off-<id>`  ──► src/fx-off.css neutralises the CSS
//            ──► PERF.fxOff                 ──► components skip mounting the JS/React ones
//            ──► the JSON export            ──► `why` and `targets` ship WITH the numbers, so a
//                                               report is readable by someone who has never
//                                               opened this repo
//
// Rules that keep it honest:
//
//  1. THE CLASS IS THE SERIALISATION. Every effect gets a root class whether or not CSS is what
//     turns it off, so the panel, the URL and the export need no per-effect special cases.
//  2. NOTHING DEAD GETS AN ENTRY. `.gilt`, `.leopard`, `.vhs-*`, the TOUR ARCHIVE block and
//     `.divider span` have no component rendering them. A switch that does nothing still shows
//     up in a benchmark as "this effect is free", which is worse than not offering it — it is a
//     wrong answer rather than a missing one. (Those selectors DO appear inside fx-off.css's
//     rules, where they cost nothing and mean a revived component cannot escape a switch.)
//  3. COST IS MEASURED IN PIXELS TOUCHED PER FRAME, not in how fancy the effect looks.
//
// Counts in `why` are live DOM instances at steady state: 7 lore stops, 4 journey stops, 19
// tracks, 5 marquees x 40 hooks x 2 copies, 6 merch cards, 11 guestbook posts, 6 date rows.

/** Which subsystem the effect belongs to. Used to group the panel and to build ablation legs. */
export type FxGroup = 'blend' | 'blur' | 'audio' | 'motion' | 'video' | 'shader'

/** 1 = cheap paint · 2 = repeated paint or many layers · 3 = per-pixel, full-viewport, per frame */
export type FxCost = 1 | 2 | 3

/**
 * How the switch is honoured.
 *   'css'   — src/fx-off.css neutralises it entirely; nothing else has to cooperate.
 *   'react' — a component must not mount it. The class alone may still hide it, but the work
 *             (a decoding <video>, a WebGL context, a rAF loop) only stops when React does.
 *   'js'    — a plain module reads the class or the flag and takes a different path.
 */
export type FxKind = 'css' | 'react' | 'js'

/**
 * Hand-written, NOT `typeof FX[number]['id']`.
 *
 * Profiles, the benchmark matrix and fx-off.css all index these ids. Inferring the union from
 * the array means a typo in the array silently WIDENS the union and every consumer compiles;
 * writing it once means tsc reports the mismatch at both ends. The redundancy is the point.
 */
export type FxId =
  | 'shader'
  | 'shaderBlend'
  | 'bcStrobe'
  | 'bcGrain'
  | 'bcScan'
  | 'bcVignette'
  | 'bcRec'
  | 'bcGlitchCut'
  | 'cardGlass'
  | 'playerGlass'
  | 'blurFills'
  | 'beatFilter'
  | 'beatShadow'
  | 'beatBoxShadow'
  | 'beatTransform'
  | 'beatLift'
  | 'audioPump'
  | 'kenBurns'
  | 'goldSheen'
  | 'marquees'
  | 'lyricLetters'
  | 'sectionCut'
  | 'cursorFx'
  | 'player3d'
  | 'bcVideo'
  | 'sectionVideo'
  | 'hdRendition'

export type FxDef = {
  id: FxId
  /** Shown in the panel. Plain English, no jargon — this is read on a tablet at arm's length. */
  label: string
  group: FxGroup
  cost: FxCost
  kind: FxKind
  /**
   * The master-dial threshold, as a DIAL POSITION (0..1 — what the knob and the panel slider
   * show), not as a multiplier. An effect is active while `intensity > minIntensity`, so turning
   * the dial down retires effects in roughly cost order and 0 (strictly greater) retires every
   * one of them. Values are spread rather than clustered so each notch of the dial does something.
   *
   * Every threshold here is below the dial's default of 0.6, which is the invariant that makes
   * "the shipped look" and "nothing retired" the same state. Anything raised above 0.6 would
   * start switching effects off on a fresh visit, which is a change to the site rather than a
   * change to the harness.
   */
  minIntensity: number
  /** WHY it costs. Copied verbatim into the JSON export. */
  why: string
  /** What it reaches, for the panel tooltip and for grepping back to index.css / fx-off.css. */
  targets: string
}

export const FX: readonly FxDef[] = [
  // ---- shader ------------------------------------------------------------------------------
  {
    id: 'shader',
    label: 'Light rig (WebGL)',
    group: 'shader',
    cost: 3,
    kind: 'react',
    minIntensity: 0.15,
    why: 'A full-viewport WebGL canvas running a fragment shader with per-pixel raymarched beams. Unmounting it also releases the renderer and the ~330KB three.js chunk stays idle.',
    targets: 'ThermalRunaway (the whole component) · .thermal-canvas · .thermal-fallback',
  },
  {
    id: 'shaderBlend',
    label: 'Light rig blends with the page',
    group: 'blend',
    cost: 3,
    kind: 'css',
    minIntensity: 0.35,
    why: 'mix-blend-mode: screen on a fixed full-viewport canvas forces the compositor to READ BACK the entire viewport — which contains a decoding video — to blend against, every frame the canvas updates. The single largest readback on the page, and the one that only exists when video and effects are both present.',
    targets: '.thermal-canvas { mix-blend-mode }',
  },

  // ---- the broadcast overlay stack ---------------------------------------------------------
  {
    id: 'bcStrobe',
    label: 'Snare strobe',
    group: 'blend',
    cost: 3,
    kind: 'css',
    minIntensity: 0.45,
    why: 'Full-screen screen-blend whose opacity is rewritten every frame from --m-snare/--m-drop. A blend whose input changes cannot be cached, so it re-blends the whole viewport per frame rather than once.',
    targets: '.bc-strobe',
  },
  {
    id: 'bcGrain',
    label: 'Film grain',
    group: 'blend',
    cost: 2,
    kind: 'css',
    minIntensity: 0.3,
    why: 'Full-screen overlay-blend carrying an SVG turbulence texture, translated forever by grainshift at steps(2), with its opacity riding --m-hat. Blend plus animation plus a per-frame alpha.',
    targets: '.bc-grain · @keyframes grainshift',
  },
  {
    id: 'bcScan',
    label: 'Scanlines blend',
    group: 'blend',
    cost: 2,
    kind: 'css',
    minIntensity: 0.25,
    why: 'multiply-blend over the footage. The layer also carries the flat black that darkens the video, so it is normalised to a plain overlay rather than removed — deleting it would make the whole site lighter and invalidate the comparison.',
    targets: '.bc-scan { mix-blend-mode }',
  },
  {
    id: 'bcVignette',
    label: 'Vignette',
    group: 'blend',
    cost: 1,
    kind: 'css',
    minIntensity: 0.05,
    why: 'One full-screen radial gradient, no blend, no animation. Paints once. Included because it is the cheapest layer in the stack and therefore the control: if removing it moves the numbers, the cost is layer COUNT rather than layer content.',
    targets: '.bc-vignette',
  },
  {
    id: 'bcRec',
    label: 'REC blink',
    group: 'motion',
    cost: 1,
    kind: 'css',
    minIntensity: 0.2,
    why: 'recblink runs forever on a small text node pinned over the video. Cheap on its own; it is here because an infinite animation keeps the page marked as animating, which changes how the compositor treats everything around it.',
    targets: '.bc-rec · @keyframes recblink',
  },
  {
    id: 'bcGlitchCut',
    label: 'Beat glitch cut',
    group: 'motion',
    cost: 2,
    kind: 'css',
    minIntensity: 0.4,
    why: 'bcshift animates `filter` on .broadcast — the element that CONTAINS the video and every overlay — so for 280ms after each cut the whole stack renders through a filter pipeline instead of being handed to the compositor as textures.',
    targets: '.broadcast.glitch-cut · @keyframes bcshift',
  },

  // ---- backdrop blur -----------------------------------------------------------------------
  {
    id: 'cardGlass',
    label: 'Frosted cards',
    group: 'blur',
    cost: 3,
    kind: 'css',
    minIntensity: 0.5,
    why: '24 live elements each carrying backdrop-filter: blur(6px) saturate(1.05). A backdrop-filter re-blurs its backdrop whenever the backdrop is dirty, and the backdrop here is a fixed playing video plus an animating WebGL canvas — i.e. dirty every frame. 24 per-pixel blur passes per frame is the sharpest match for "video alone is smooth, video plus effects crawls". Killed only below 768px today, so both target devices keep all of it.',
    targets: '.merch-card · .gb-post · .dates li · .hero-gauge (+ the dead .gilt/.lore-card/.tour-card)',
  },
  {
    id: 'playerGlass',
    label: 'Player glass',
    group: 'blur',
    cost: 3,
    kind: 'css',
    minIntensity: 0.45,
    why: 'ON BY DEFAULT. backdrop-filter: blur(1px) saturate(1.7) brightness(1.12) contrast(1.04) over playing video, plus two infinite background-position sweeps (glassSweepA 13s, glassSweepB 21s) that repaint the panel every frame on top of it. contain: paint isolation exists only under max-width:768px, so a Surface gets none of it.',
    targets: ':root.glass-on .player · .player::before · .player::after · .player-title · :root.glass-frost .player',
  },
  {
    id: 'blurFills',
    label: 'Blurred letterbox fills',
    group: 'blur',
    cost: 2,
    kind: 'css',
    minIntensity: 0.35,
    why: 'blur(7px) on an 8x-upscaled copy of each lore scene and blur(48px)/blur(40px) behind each journey scene. Only rendered past 2.5:1 (or on a landscape phone), where the surfaces are largest. Off returns them to the default they already have at ordinary aspect ratios: hidden.',
    targets: '.lore-fill · .journey-bg-blur',
  },

  // ---- audio-driven CSS --------------------------------------------------------------------
  {
    id: 'beatFilter',
    label: 'Beat glow on headings (filter)',
    group: 'audio',
    cost: 3,
    kind: 'css',
    minIntensity: 0.4,
    why: 'drop-shadow with a per-frame blur RADIUS on the largest, gradient-clipped type on the page — and the same elements also carry a per-frame scale. A filtered element must be re-rasterised whenever its scale changes, and at DPR 1.75 every step lands on a different sub-pixel grid, so the heading is re-rasterised on every beat.',
    targets: '.section-title · .hero-title · .journey-city · .lore-name · .lore-roster-name',
  },
  {
    id: 'beatShadow',
    label: 'Beat glow on text (text-shadow)',
    group: 'audio',
    cost: 2,
    kind: 'css',
    minIntensity: 0.2,
    why: 'An animated text-shadow blur radius is a repaint of the text layer every frame. ~35 elements. Pinned to the value the phone breakpoint already freezes them at, so nothing looks flat.',
    targets: '.eyebrow · .section-kicker · .journey-venue · .lore-tag · .journey-seed · .lore-eyebrow · .merch-name · .quote · .lcd-title · .tl-row.active .tl-title · .viz-now',
  },
  {
    id: 'beatBoxShadow',
    label: 'Beat glow on chrome (box-shadow)',
    group: 'audio',
    cost: 1,
    kind: 'css',
    minIntensity: 0.15,
    why: 'Same repaint mechanism as the text glow but on small, mostly-offscreen boxes, so the affected area is a fraction of it. Included to separate "any animated shadow costs" from "animated shadows on LARGE elements cost".',
    targets: '.brandbar · .hero-flex span · .tl-row.active · .rail-fill · .rail-pin.done',
  },
  {
    id: 'beatTransform',
    label: 'Beat pulse (transform)',
    group: 'audio',
    cost: 1,
    kind: 'css',
    minIntensity: 0.05,
    why: 'Composited scale/translate — the cheapest way the page can react and the last thing that should ever be retired. It is switchable so a benchmark can prove that, rather than assume it.',
    targets: '.section-title · .hero-title .drip · .crest .ring · .lore-name · .journey-city · .lm-run · .rail-vehicle · .shade-vu i · .tl-row.active .tl-title · .ls-word.now',
  },
  {
    id: 'beatLift',
    label: 'Heading jump (--beat-lift)',
    group: 'audio',
    cost: 1,
    kind: 'css',
    minIntensity: 0.1,
    why: 'One shared translateY channel read by three heading rules. It gets its own switch because it is the ONE variable the ?live= bisect can never isolate — that flag strips the "--m-" prefix, which --beat-lift does not have, so it was silently un-freezable in every previous experiment.',
    targets: ':root { --beat-lift } → .hero-title .drip · .section-title · .lore-name · .journey-city',
  },
  {
    id: 'audioPump',
    label: 'Audio variable pump',
    group: 'audio',
    cost: 2,
    kind: 'js',
    minIntensity: 0.02,
    why: 'The per-frame cssText write on :root itself, independent of what any rule does with the values. Registered custom properties inherit, so the write marks the document for style re-resolution regardless. This is the switch that separates "the effects are expensive" from "writing the variables is expensive" — a distinction earlier rounds never cleanly made.',
    targets: 'AudioReactive: the cssText flush of --m-beat/level/bass/treble/snare/hat/down/build/drop and --beat-lift',
  },

  // ---- always-running motion ---------------------------------------------------------------
  {
    id: 'kenBurns',
    label: 'Background drift + beat zoom',
    group: 'motion',
    cost: 2,
    kind: 'css',
    minIntensity: 0.3,
    why: '13 viewport-sized permanently-promoted textures (2 broadcast frames, 7 lore, 4 journey), each ~6.5 Mpx at 1848x1152 @ DPR 1.75, drifting under Ken-Burns AND carrying a per-frame beat scale. index.css already diagnoses this as GPU layer eviction and only fixes it inside :root.calm.',
    targets: '.bc-frame · .lore-bg · .journey-bg (animation, scale, will-change, overscan)',
  },
  {
    id: 'goldSheen',
    label: 'Chrome sheen on headings',
    group: 'motion',
    cost: 2,
    kind: 'css',
    minIntensity: 0.25,
    why: 'Animating background-position on background-clip: text re-rasterises the glyph mask, so the largest type on the page repaints continuously whether or not anything is playing.',
    targets: '.gold-text · .section-title · @keyframes goldsheen',
  },
  {
    id: 'marquees',
    label: 'Scrolling text',
    group: 'motion',
    cost: 1,
    kind: 'css',
    minIntensity: 0.15,
    why: 'Seven infinite transform animations carrying 400 .lm-item spans. Composited, so it should be nearly free — which is exactly why it is worth measuring rather than assuming: a promoted strip the width of several viewports is still a large texture.',
    targets: '.lm-run · .marquee-run · .marquee',
  },
  {
    id: 'lyricLetters',
    label: 'Per-letter lyric animation',
    group: 'motion',
    cost: 2,
    kind: 'css',
    minIntensity: 0.3,
    why: 'One infinite lsAlive animation per LETTER of the live word, restarted for every word, each reading --m-beat inside its own keyframes — plus a two-stop per-word drop-shadow in style D.',
    targets: '.ls-ch · .ls-ch-i · @keyframes lsAlive · .ls-both .ls-word { filter }',
  },
  {
    id: 'sectionCut',
    label: 'Section cut wipe',
    group: 'motion',
    cost: 1,
    kind: 'css',
    minIntensity: 0.25,
    why: 'A full-viewport fixed layer animating background-position across a 260%-wide 9-stop gradient for 420ms at every section crossing. Brief, but it lands exactly when the page is also scrolling.',
    targets: '.section-cut · @keyframes cutSweep',
  },
  {
    id: 'cursorFx',
    label: 'Cursor light + trail',
    group: 'blend',
    cost: 2,
    kind: 'react',
    minIntensity: 0.35,
    why: 'Three mix-blend-mode: screen layers over the footage plus 104 pooled .glow-trail nodes each carrying will-change: transform, opacity — 104 permanent layer-promotion hints above a playing video. Retired on touch by display:none, so this is a desktop/Surface-only cost and no existing flag could switch it off.',
    targets: '.beat-cursor · .flashlight · .click-burst · .glow-trail (and the BeatCursor rAF/pointer loop)',
  },
  {
    id: 'player3d',
    label: 'Player 3D tilt',
    group: 'motion',
    cost: 1,
    kind: 'css',
    minIntensity: 0.2,
    why: 'perspective() + transform-style: preserve-3d with five translateZ children forces the player into a 3D rendering context, which the compositor cannot flatten. Already switched off on mobile; live on a Surface.',
    targets: '.player:not(.mobile) · .player-body · .player-title · .lcd · .seek · .transport · .bootleg',
  },

  // ---- video -------------------------------------------------------------------------------
  {
    id: 'bcVideo',
    label: 'Mainstage video',
    group: 'video',
    cost: 3,
    kind: 'react',
    minIntensity: 0.1,
    why: 'The fixed full-viewport <video> behind the entire site. It measured SMOOTH on its own on both problem devices, which is the whole reason this harness exists: the cost appears only in combination, so it has to be switchable independently of the effects composited over it.',
    targets: 'Broadcast: .bc-video (falls back to the .bc-frame stills)',
  },
  {
    id: 'sectionVideo',
    label: 'Lore / tour videos',
    group: 'video',
    cost: 2,
    kind: 'react',
    minIntensity: 0.2,
    why: 'Up to 11 further <video> elements in the DOM (7 lore, 4 journey). videoDirector allows a second decoder during transitions, so two can decode at once while a translucent panel and frosted cards sit on top of them.',
    targets: 'Lore: .lore-video · TourJourney: .journey-video (both fall back to stills)',
  },
  {
    id: 'hdRendition',
    label: 'HD video rendition',
    group: 'video',
    cost: 2,
    kind: 'js',
    minIntensity: 0.3,
    why: '1920x1080 at ~4 Mbps instead of 1280x720 at ~2.4. Decode cost scales with pixels, and on a tile-based mobile GPU the decoded frame is also a bigger texture to composite every other layer against.',
    targets: 'videoRendition.prefersHdVideo() → /assets/video/hd/',
  },
] as const

export const ALL_FX_IDS: FxId[] = FX.map((f) => f.id)

export const FX_BY_ID = Object.fromEntries(FX.map((f) => [f.id, f])) as Record<FxId, FxDef>

/** Ordered as the panel groups them: the expensive, page-wide things first. */
export const FX_GROUPS: readonly FxGroup[] = ['blend', 'blur', 'audio', 'motion', 'video', 'shader']

export const FX_GROUP_LABEL: Record<FxGroup, string> = {
  blend: 'Blend layers',
  blur: 'Blur passes',
  audio: 'Audio-reactive CSS',
  motion: 'Animation',
  video: 'Video',
  shader: 'WebGL',
}

/** Narrow an untrusted string (URL, localStorage, a pasted JSON report) to a known id. */
export function isFxId(v: string): v is FxId {
  return Object.prototype.hasOwnProperty.call(FX_BY_ID, v)
}

/**
 * Parse a comma-separated list of ids, dropping anything unknown.
 *
 * Silently dropping is deliberate: a typo in ?fxoff= must not create a root class that no rule
 * matches, because that reads as "this effect is off" in the panel and in the export while
 * changing nothing on screen. A benchmark row that lies is worse than a flag that is ignored.
 */
export function parseFxIds(csv: string | null | undefined): FxId[] {
  if (!csv) return []
  const seen = new Set<FxId>()
  for (const raw of csv.split(',')) {
    const id = raw.trim()
    if (id && isFxId(id)) seen.add(id)
  }
  return [...seen]
}
