import { create } from 'zustand'

type SiteState = {
  loggedOn: boolean // has the user clicked LOG ON & PLUG IN?
  booting: boolean // dial-up handshake in progress
  friction: number // 0..1 — the Friction Knob. Higher = more chromatic aberration + CRT shake.
  saunaMode: boolean // secret unlock
  reducedMotion: boolean
  hits: number // fake 2004 hit-counter
  logOn: () => void
  finishBoot: () => void
  setFriction: (v: number) => void
  toggleSauna: () => void
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
  logOn: () => set({ loggedOn: true, booting: true }),
  finishBoot: () => set({ booting: false }),
  setFriction: (v) => set({ friction: Math.max(0, Math.min(1, v)) }),
  toggleSauna: () => set((s) => ({ saunaMode: !s.saunaMode })),
  bumpHits: () => set((s) => ({ hits: s.hits + Math.floor(1 + Math.random() * 3) })),
}))
