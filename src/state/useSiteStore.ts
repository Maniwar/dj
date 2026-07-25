import { create } from 'zustand'

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
  if (typeof localStorage === 'undefined') return 'hair'
  const v = localStorage.getItem(STORE_KEY) as LyricStyle | null
  return v && (LYRIC_STYLES as readonly string[]).includes(v) ? v : 'hair'
}

type SiteState = {
  loggedOn: boolean // has the user clicked LOG ON & PLUG IN?
  booting: boolean // dial-up handshake in progress
  friction: number // 0..1 — the Friction Knob. Higher = more chromatic aberration + CRT shake.
  saunaMode: boolean // secret unlock
  reducedMotion: boolean
  hits: number // fake 2004 hit-counter
  lyricsOpen: boolean // karaoke panel visibility
  videoEnabled: boolean // play the real muted mp4 backgrounds vs the Ken-Burns stills
  accent: AccentKey // which section owns the light rig right now
  setAccent: (a: AccentKey) => void
  lyricStyle: LyricStyle // viewer's choice of how sung words are drawn
  cycleLyricStyle: () => void
  logOn: () => void
  finishBoot: () => void
  setFriction: (v: number) => void
  toggleSauna: () => void
  toggleLyrics: () => void
  toggleVideo: () => void
  bumpHits: () => void
}

const seededHits = 4_019_202 // "since 2002" — grows while you watch

export const useSiteStore = create<SiteState>((set) => ({
  loggedOn: false,
  booting: false,
  friction: 0.12,
  saunaMode: false,
  reducedMotion:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  hits: seededHits,
  lyricsOpen: false,
  videoEnabled: true,
  accent: 'default',
  setAccent: (a) => set((s) => (s.accent === a ? s : { accent: a })), // no-op re-renders avoided
  lyricStyle: initialLyricStyle(),
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
  setFriction: (v) => set({ friction: Math.max(0, Math.min(1, v)) }),
  toggleSauna: () => set((s) => ({ saunaMode: !s.saunaMode })),
  toggleLyrics: () => set((s) => ({ lyricsOpen: !s.lyricsOpen })),
  toggleVideo: () => set((s) => ({ videoEnabled: !s.videoEnabled })),
  bumpHits: () => set((s) => ({ hits: s.hits + Math.floor(1 + Math.random() * 3) })),
}))
