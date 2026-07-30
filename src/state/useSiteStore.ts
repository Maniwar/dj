import { create } from 'zustand'
import { FX_DEFAULT } from '../perf/fxCurve'

// The light rig takes its colour from wherever you are in the story, so the lasers belong to
// the section instead of washing everything the same pink. Values are 0..1 RGB for the shader.
export const ACCENTS = {
  default: [1.0, 0.12, 0.56], // house magenta
  kiki: [1.0, 0.12, 0.56], // she is the signal — magenta
  dieter: [0.08, 0.88, 1.0], // he is the noise — cold blue
  both: [0.39, 1.0, 0.18], // the sauna incident — acid
  ibiza: [1.0, 0.55, 0.18], // sunrise gold
  tokyo: [1.0, 0.15, 0.78], // neon pink
  miami: [0.1, 0.95, 0.85], // pool aqua
  berlin: [0.45, 1.0, 0.25], // basement acid
} as const satisfies Record<string, readonly [number, number, number]>

export type AccentKey = keyof typeof ACCENTS

/**
 * The order the palette is walked when no section has claimed the colour.
 *
 * Ordered so consecutive steps are far apart in hue -- magenta, cold blue, acid, gold, aqua -- since
 * adjacent similar colours read as a flicker rather than a cue change. `kiki` is absent on purpose:
 * it is byte-identical to `default`, so including it would stall the walk on pink for two steps.
 */
export const ACCENT_WALK: readonly AccentKey[] = [
  'default',
  'dieter',
  'both',
  'ibiza',
  'miami',
  'tokyo',
  'berlin',
]

/**
 * THE COLOUR IN FORCE, and the only definition of it.
 *
 * A named section owns the colour -- that association is the whole point of ACCENTS. Where nothing
 * has claimed it (the hero, the guestbook, anywhere between sections) the palette is walked on the
 * beat grid instead, so the rig is not stuck on house magenta for most of the page.
 *
 * THIS EXISTS AS ONE FUNCTION BECAUSE IT SHIPPED AS TWO. The walk was added to the shader only, so
 * the LED wall cycled while the player's spectrum went on reading the raw section accent -- which is
 * `default` almost everywhere. Reported as "the bottom part is cycling color now, but not the
 * player's spectrometer, it's stuck on pink", and that was exactly right: two controls, two rules.
 * Both callers now take their target from here, so they cannot disagree about what colour the room
 * is. Pure, and given the beat index rather than reading the clock itself, so it stays testable.
 */
export function effectiveAccent(
  accent: AccentKey,
  beatIndex: number
): readonly [number, number, number] {
  if (accent !== 'default') return ACCENTS[accent] ?? ACCENTS.default
  // 32 beats = 8 bars, the same cadence the shader's beam patterns move on.
  return ACCENTS[ACCENT_WALK[Math.floor(beatIndex / 32) % ACCENT_WALK.length]]
}

// How the sung lyric words are drawn. Legibility over moving footage is genuinely a matter of
// taste and of what you're watching, so this is the VIEWER's choice, cycled from the player and
// remembered on their device.
export const LYRIC_STYLES = ['none', 'hair', 'dark', 'both', 'core'] as const
export type LyricStyle = (typeof LYRIC_STYLES)[number]
export const LYRIC_STYLE_LABEL: Record<LyricStyle, string> = {
  none: 'Neon fill',
  hair: 'Hairline outline',
  dark: 'Dark outline',
  both: 'Outline + halo',
  core: 'White + colour glow',
}
const STORE_KEY = 'so.lyricStyle'
function initialLyricStyle(): LyricStyle {
  // 'core' = white letters with the singer's colour in the glow — the most legible of the five
  // over moving footage, which is why it's the default.
  if (typeof localStorage === 'undefined') return 'core'
  const v = localStorage.getItem(STORE_KEY) as LyricStyle | null
  return v && (LYRIC_STYLES as readonly string[]).includes(v) ? v : 'core'
}

// Winamp let you click the analyser to cycle visualisations; this does the same.
export const VIZ_MODES = ['bars', 'mirror', 'scope', 'dots'] as const
export type VizMode = (typeof VIZ_MODES)[number]
export const VIZ_LABEL: Record<VizMode, string> = {
  bars: 'Spectrum',
  mirror: 'Mirror',
  scope: 'Oscilloscope',
  dots: 'Peak dots',
}
const VIZ_KEY = 'so.vizMode'
function initialViz(): VizMode {
  if (typeof localStorage === 'undefined') return 'bars'
  const v = localStorage.getItem(VIZ_KEY) as VizMode | null
  return v && (VIZ_MODES as readonly string[]).includes(v) ? v : 'bars'
}

type SiteState = {
  loggedOn: boolean // has the user clicked LOG ON & PLUG IN?
  booting: boolean // dial-up handshake in progress
  /**
   * 0..1 — THE MASTER INTENSITY DIAL. Was `friction`, which drove CRT scanlines, a chromatic
   * split and a full-viewport shake; all three are gone (they cost legibility and bought
   * nothing). It now scales EVERY effect on the site at once — see src/perf/intensity.ts for the
   * response curve and for the two mechanisms it feeds (--fx, and the pre-multiplied --m-* pump).
   *
   * This field is the value's public home, but it is NOT where a change should be written:
   * fxState.setIntensityPref owns the preference (it persists it, and it is the same value the
   * diag panel's slider and the profile caps act on). All this field does is hold the resolved
   * number for the components that render from it.
   */
  intensity: number
  saunaMode: boolean // secret unlock
  reducedMotion: boolean
  hits: number // fake 2004 hit-counter
  lyricsOpen: boolean // karaoke panel visibility
  // NO `videoEnabled` HERE ANY MORE. It lived in this store for a long time and that was the bug:
  // the perf harness reconciles four sources of truth about which effects run, and this was a
  // fifth that it could not see, so `minimal` switched the video off underneath a button that
  // went on reporting it as on. It is a per-effect override in fxState now — rung 2 of the
  // precedence ladder — which is persisted, appears in the JSON export, and outranks a profile by
  // the ordinary rule instead of by a bare && in three components. See setVideoPreference.
  accent: AccentKey // which section owns the light rig right now
  setAccent: (a: AccentKey) => void
  lyricStyle: LyricStyle // viewer's choice of how sung words are drawn
  cycleLyricStyle: () => void
  visualizer: boolean // full-screen takeover: the page falls away and the rig performs
  toggleVisualizer: () => void
  /** Panel finish: solid, clear glass, or frosted. Cycles; see toggleGlass. */
  glass: 'off' | 'clear' | 'frost'
  toggleGlass: () => void
  vizMode: VizMode // which analyser visualisation the player is showing
  cycleVizMode: () => void
  shuffle: boolean // play the album in a random order
  repeat: boolean // loop the current track instead of advancing
  toggleShuffle: () => void
  toggleRepeat: () => void
  logOn: () => void
  finishBoot: () => void
  setIntensity: (v: number) => void
  toggleSauna: () => void
  toggleLyrics: () => void
  bumpHits: () => void
}

const seededHits = 4_019_202 // "since 2002" — grows while you watch

export const useSiteStore = create<SiteState>((set) => ({
  loggedOn: false,
  booting: false,
  // The dial's rest position. 0.6 is not a taste call: it is the point on the response curve
  // where the multiplier is exactly 1.0, i.e. where every effect renders at the value it was
  // tuned to. It reads FX_DEFAULT from src/perf/fxCurve.ts rather than restating 0.6, because a
  // second copy of "the default" that drifted would boot the site at a strength nothing was
  // tuned at. (fxCurve is a leaf module for exactly this: it imports nothing, so there is no
  // cycle between the store and the perf harness.)
  intensity: FX_DEFAULT,
  saunaMode: false,
  reducedMotion:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  hits: seededHits,
  lyricsOpen: false,
  accent: 'default',
  setAccent: (a) => set((s) => (s.accent === a ? s : { accent: a })), // no-op re-renders avoided
  lyricStyle: initialLyricStyle(),
  visualizer: false,
  toggleVisualizer: () => set((s) => ({ visualizer: !s.visualizer })),
  // Default OFF, and deliberately so. backdrop-filter has to re-blur its backdrop EVERY FRAME
  // while video plays behind it — the same class of per-pixel work that was heating phones
  // earlier — so it is opt-in rather than something everyone pays for by default. The choice
  // persists, because having to re-enable it every visit would make it not worth having.
  // Three finishes rather than a switch, because they are genuinely different materials and
  // which one looks best depends on what is playing behind the panel. CLEAR is the interesting
  // one — you see the scene through it — and it is also the cheapest of the two glass modes,
  // since a 1px blur costs a fraction of a 16px one over playing video. Solid stays the default
  // so nobody pays for a backdrop pass they did not ask for. The choice persists.
  glass: (() => {
    try {
      const v = localStorage.getItem('so.glass')
      // Defaults to CLEAR, not off. The original default of 'off' was justified by
      // backdrop-filter having to re-blur its backdrop every frame over playing video — but
      // clear glass has no backdrop-filter at all. It is transparency, a rim light and a bevel:
      // all paint-once, all free. So the old default made everyone pay a perf-motivated cost
      // that the clear finish does not incur, and on mobile the finish button is unreachable
      // from the minimized player, so most people could never have found it. FROSTED, which is
      // the expensive one, stays strictly opt-in.
      return v === 'clear' || v === 'frost' || v === 'off' ? v : 'clear'
    } catch {
      return 'off'
    }
  })(),
  toggleGlass: () =>
    set((s) => {
      // SOLID is not in the cycle. It earns its place as a fallback - for reduced motion, and
      // as the cheap option when nothing else can render - but it is the least interesting of
      // the three, and spending a third of an interactive cycle returning to a plain dark panel
      // is a poor trade. Especially on a phone, where this button is only reachable by expanding
      // the player first. The toggle now swaps between the two MATERIALS; 'off' remains a valid
      // stored value and simply steps into the cycle at clear.
      const order = ['clear', 'frost'] as const
      // indexOf returns -1 for 'off' (a valid stored value that is no longer in the cycle),
      // and -1 + 1 === 0, so a visitor holding it steps in at clear. The cast is needed because
      // the store's type is wider than the cycle by exactly that one value.
      const i = order.indexOf(s.glass as (typeof order)[number])
      const glass = order[(i + 1) % order.length]
      try { localStorage.setItem('so.glass', glass) } catch { /* private mode */ }
      return { glass }
    }),
  vizMode: initialViz(),
  shuffle: false,
  repeat: false,
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  toggleRepeat: () => set((s) => ({ repeat: !s.repeat })),
  cycleVizMode: () =>
    set((s) => {
      const next = VIZ_MODES[(VIZ_MODES.indexOf(s.vizMode) + 1) % VIZ_MODES.length]
      try {
        localStorage.setItem(VIZ_KEY, next)
      } catch {
        /* private mode — the choice just won't persist */
      }
      return { vizMode: next }
    }),
  cycleLyricStyle: () =>
    set((s) => {
      const next = LYRIC_STYLES[(LYRIC_STYLES.indexOf(s.lyricStyle) + 1) % LYRIC_STYLES.length]
      try {
        localStorage.setItem(STORE_KEY, next)
      } catch {
        /* private mode — the choice just won't persist */
      }
      return { lyricStyle: next }
    }),
  logOn: () => set({ loggedOn: true, booting: true }),
  finishBoot: () => set({ booting: false }),
  setIntensity: (v) => set({ intensity: Math.max(0, Math.min(1, v)) }),
  toggleSauna: () => set((s) => ({ saunaMode: !s.saunaMode })),
  toggleLyrics: () => set((s) => ({ lyricsOpen: !s.lyricsOpen })),
  bumpHits: () => set((s) => ({ hits: s.hits + Math.floor(1 + Math.random() * 3) })),
}))
