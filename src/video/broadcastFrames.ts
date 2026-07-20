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
  '/assets/video/frames/variants/club-floor-v1.jpg', // duo at booth, screens mirror them
  '/assets/video/frames/club-podium.jpg',
  '/assets/video/frames/variants/club-floor-v2.jpg', // Dieter center, Kiki on both screens
  '/assets/video/frames/club-floor.jpg', // V4 — duo at booth, abstract laser screens
  '/assets/video/frames/variants/club-floor-v3.jpg', // duo hero, abstract side screens
  '/assets/video/frames/club-vip.jpg',
]

export type Scene = {
  key: string
  city: string
  frames: string[] // stills to beat-cut between
  mp4?: string // first real video (back-compat)
  mp4s?: string[] // all real videos for this scene (the mainstage cycles through several)
}

export const SCENES: Record<string, Scene> = {
  club: { key: 'club', city: 'THE MAINSTAGE', frames: CLUB },
  ibiza: { key: 'ibiza', city: 'IBIZA', frames: ['/assets/tour/ibiza.jpg', ...CLUB] },
  tokyo: { key: 'tokyo', city: 'TOKYO', frames: ['/assets/tour/tokyo.jpg', ...CLUB] },
  miami: { key: 'miami', city: 'MIAMI', frames: ['/assets/tour/miami.jpg', ...CLUB] },
  berlin: { key: 'berlin', city: 'BERLIN', frames: ['/assets/tour/berlin.jpg', ...CLUB] },
}

// The MAINSTAGE (club) is the default home scene. Only the four city-bound songs show their
// city; every other track (and the home/first load) shows the mainstage — so the first
// impression is the band on the decks, not a random tour city.
const CITY_TRACK: Record<string, string> = {
  'touch-my-subwoofer': 'ibiza',
  'euro-airways': 'tokyo',
  'pump-my-iron': 'miami',
  'the-basement-vip': 'berlin',
}

export function sceneForTrack(slug: string | null): Scene {
  if (!slug) return SCENES.club
  return SCENES[CITY_TRACK[slug] ?? 'club'] ?? SCENES.club
}

// Merge AtlasCloud results (if present) so scenes gain real muted mp4s. Optional file —
// present only after `npm run gen:videos` has run on an unblocked network.
export async function hydrateRealVideo(): Promise<void> {
  try {
    const mod = await import('../data/atlascloud.results.json')
    const clips = (mod as any).default?.clips ?? (mod as any).clips ?? []
    const clubVids: string[] = []
    for (const c of clips) {
      if (c.status !== 'ready' || !c.mp4Url) continue
      if (SCENES[c.id]) SCENES[c.id].mp4 = c.mp4Url // club(booth)/ibiza/tokyo/miami/berlin
      // the mainstage cycles through ALL the club-frame videos
      if (c.id === 'club' || (typeof c.id === 'string' && c.id.startsWith('club-'))) clubVids.push(c.mp4Url)
    }
    if (clubVids.length) SCENES.club.mp4s = clubVids
    // cities: expose their single video as a one-element list too, so the player has one code path
    for (const id of ['ibiza', 'tokyo', 'miami', 'berlin']) {
      if (SCENES[id]?.mp4) SCENES[id].mp4s = [SCENES[id].mp4!]
    }
  } catch {
    /* no results yet — stills-only montage */
  }
}
