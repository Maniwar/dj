import { create } from 'zustand'
import type { Track, Version } from '../data/types'
import manifest from '../data/tracks.json'

const TRACKS = (manifest as { tracks: Track[] }).tracks

type PlayerState = {
  tracks: Track[]
  currentTrackSlug: string | null
  currentVersionId: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  // low-frequency state written by AudioProvider — safe for React
  _set: (p: Partial<PlayerState>) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  tracks: TRACKS,
  currentTrackSlug: null,
  currentVersionId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  _set: (p) => set(p),
}))

// ---- selectors / helpers (pure, no hooks) ----
export function getTrack(slug: string | null): Track | undefined {
  if (!slug) return undefined
  return TRACKS.find((t) => t.slug === slug)
}

export function getVersion(slug: string | null, versionId: string | null): Version | undefined {
  const t = getTrack(slug)
  if (!t) return undefined
  return t.versions.find((v) => v.id === versionId) ?? t.versions[0]
}

export function nextTrackSlug(slug: string | null): string {
  if (!slug) return TRACKS[0].slug
  const i = TRACKS.findIndex((t) => t.slug === slug)
  return TRACKS[(i + 1 + TRACKS.length) % TRACKS.length].slug
}

export function prevTrackSlug(slug: string | null): string {
  if (!slug) return TRACKS[0].slug
  const i = TRACKS.findIndex((t) => t.slug === slug)
  return TRACKS[(i - 1 + TRACKS.length) % TRACKS.length].slug
}
