// The Broadcast layer turns Gemini party stills into moving "leaked club footage":
// Ken-Burns motion + beat-synced hard-cuts + VHS glitch + strobes. Each track is bound
// to a SCENE (a city) so the footage matches whatever is playing. When AtlasCloud mp4s
// exist (atlascloud.results.json), the Broadcast prefers the real muted video per scene.

import manifest from '../data/tracks.json'
import type { Track } from '../data/types'

// All five mainstage frames — now character-locked (Kiki on the decks, Dieter beside her,
// the leopard crew up front) via Seedream v5.0 Pro edit. Beat-cut between these.
const CLUB = [
  '/assets/video/frames/club-booth.jpg', // Kiki commands the decks with Dieter — the money shot
  '/assets/video/frames/club-crowd.jpg',
  '/assets/video/frames/club-podium.jpg',
  '/assets/video/frames/club-floor.jpg',
  '/assets/video/frames/club-vip.jpg',
]

export type Scene = {
  key: string
  city: string
  frames: string[] // stills to beat-cut between
  mp4?: string // filled from atlascloud.results.json when real video exists
}

export const SCENES: Record<string, Scene> = {
  club: { key: 'club', city: 'THE MAINSTAGE', frames: CLUB },
  ibiza: { key: 'ibiza', city: 'IBIZA', frames: ['/assets/tour/ibiza.jpg', ...CLUB] },
  tokyo: { key: 'tokyo', city: 'TOKYO', frames: ['/assets/tour/tokyo.jpg', ...CLUB] },
  miami: { key: 'miami', city: 'MIAMI', frames: ['/assets/tour/miami.jpg', ...CLUB] },
  berlin: { key: 'berlin', city: 'BERLIN', frames: ['/assets/tour/berlin.jpg', ...CLUB] },
}

const ROTATION = ['club', 'ibiza', 'club', 'tokyo', 'club', 'miami', 'club', 'berlin']
const TRACKS = (manifest as { tracks: Track[] }).tracks

// deterministic track -> scene, so the same song always shows the same city
const trackScene = new Map<string, string>()
TRACKS.forEach((t, i) => trackScene.set(t.slug, ROTATION[i % ROTATION.length]))

export function sceneForTrack(slug: string | null): Scene {
  if (!slug) return SCENES.club
  return SCENES[trackScene.get(slug) ?? 'club'] ?? SCENES.club
}

// Merge AtlasCloud results (if present) so scenes gain real muted mp4s. Optional file —
// present only after `npm run gen:videos` has run on an unblocked network.
export async function hydrateRealVideo(): Promise<void> {
  try {
    const mod = await import('../data/atlascloud.results.json')
    const clips = (mod as any).default?.clips ?? (mod as any).clips ?? []
    for (const c of clips) {
      if (c.status === 'ready' && c.mp4Url && SCENES[c.id]) SCENES[c.id].mp4 = c.mp4Url
    }
  } catch {
    /* no results yet — stills-only montage */
  }
}
