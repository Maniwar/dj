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
