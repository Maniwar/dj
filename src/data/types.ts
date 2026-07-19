export type Version = {
  id: string
  label: string
  badge: string
  vibe: string
  src: string
  file: string
  variantIndex: number
}

export type Track = {
  slug: string
  title: string
  versionCount: number
  hasBootleg: boolean
  defaultVersionId: string
  versions: Version[]
}

export type TrackManifest = {
  generatedFrom: string
  trackCount: number
  fileCount: number
  tracks: Track[]
}

// ---- AtlasCloud video pipeline types ----
export type VideoJobStatus = 'idle' | 'queued' | 'rendering' | 'ready' | 'error'

// A party clip bound to a specific track. Generated per-track so the crowd's energy
// matches the song (bpm/energy fed into the AtlasCloud prompt); character-locked via
// seed so the same super-fans recur city to city. ALWAYS played muted — the player
// audio is the only sound.
export type VideoClip = {
  id: string
  trackSlug: string // which song this footage is the "music video" for
  city: string
  venue: string
  seed: number // locked super-fan identity seed (same across all cities)
  bpm: number // fed to AtlasCloud so dancing matches the track tempo
  energy: 'simmer' | 'sweaty' | 'meltdown'
  tint: string // fallback gradient tint when the poster image isn't generated yet
  status: VideoJobStatus
  syncMode: 'loop-react' | 'clock-slave' // loop+beat-react, or slave currentTime to audio clock
  jobId?: string
  posterUrl?: string
  mp4Url?: string
  webmUrl?: string
  blurb: string
}

export type TourClip = {
  id: string
  city: string
  venue: string
  year: string
  seed: number
  status: VideoJobStatus
  jobId?: string
  posterUrl?: string // Gemini-generated still, used as <video poster> + placeholder
  mp4Url?: string
  webmUrl?: string
  blurb: string
}
