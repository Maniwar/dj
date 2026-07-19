import { useEffect, useRef, useState, useCallback } from 'react'
import type { TourClip, VideoJobStatus } from '../data/types'

type AssetState = {
  status: VideoJobStatus
  progress: number // 0..100 (for the RENDERING loader)
  mp4Url?: string
  webmUrl?: string
  error?: string
}

// ── INTEGRATION POINT ──────────────────────────────────────────────────────────
// In production this hits the AtlasCloud job-status endpoint (or is superseded by a
// webhook / Supabase-realtime push that flips the row to 'ready'). The Node generator
// script (scripts/gen-atlascloud-videos.mjs) creates the jobs and, on completion,
// writes mp4Url/webmUrl + status:'ready' back into tour.manifest.ts, so most visitors
// never poll at all. For the vertical slice we simulate the job advancing so every
// UI state (queued → rendering → ready, plus error+retry) is visible.
async function pollAtlasCloud(
  clip: TourClip,
  attempt: number,
  signal: AbortSignal,
): Promise<AssetState> {
  // const res = await fetch(`/api/atlascloud/status/${clip.jobId}`, { signal })
  // return await res.json()
  await new Promise((r) => setTimeout(r, 0)) // yield; keeps the shape async
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
  // simulated progression keyed off attempt count
  const steps = 4
  const progress = Math.min(100, (attempt / steps) * 100)
  if (attempt >= steps) return { status: 'ready', progress: 100 }
  return { status: attempt === 0 ? 'queued' : 'rendering', progress }
}

export function useAtlasCloudAsset(clip: TourClip) {
  const [state, setState] = useState<AssetState>({
    status: clip.status,
    progress: clip.status === 'ready' ? 100 : 0,
    mp4Url: clip.mp4Url,
    webmUrl: clip.webmUrl,
    error: clip.status === 'error' ? 'RENDER FAILED — too much steam' : undefined,
  })
  const attemptRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const [runToken, setRunToken] = useState(0)

  const retry = useCallback(() => {
    attemptRef.current = 0
    setState({ status: 'queued', progress: 0 })
    setRunToken((t) => t + 1)
  }, [])

  useEffect(() => {
    // terminal states don't poll
    if (state.status === 'ready') return
    if (state.status === 'error' && runToken === 0) return

    const ac = new AbortController()
    let cancelled = false

    const loop = async () => {
      try {
        const next = await pollAtlasCloud(clip, attemptRef.current, ac.signal)
        if (cancelled) return
        attemptRef.current += 1
        setState((s) => ({ ...s, ...next }))
        if (next.status !== 'ready') {
          // exponential backoff, capped (2s → 4s → 8s → 16s → 30s)
          const delay = Math.min(30_000, 2000 * 2 ** Math.min(attemptRef.current, 4))
          timerRef.current = window.setTimeout(loop, delay)
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError' || cancelled) return
        setState((s) => ({ ...s, status: 'error', error: 'connection dropped — dial-up unstable' }))
      }
    }

    // first poll fires quickly so 'queued' shows immediately
    timerRef.current = window.setTimeout(loop, 400)

    return () => {
      cancelled = true
      ac.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken])

  return { ...state, retry }
}
