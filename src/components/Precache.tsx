import { useEffect } from 'react'
import { useSiteStore } from '../state/useSiteStore'
import { LORE_STOPS } from '../data/lore'
import { connectionAllowsPrefetch, idleSoon, restAssets } from '../lib/preload'

// STAGE TWO. The boot sequence (BootGate) now warms the mainstage itself — the stills and clips
// the home page is certain to need — and reports real progress while it does. This picks up
// everything else: the city stills, the lore stills and the remaining clips, ~25MB belonging to
// sections a visitor may never scroll to.
//
// They're worth having warm (scrolling into The Origin shouldn't wait on a download) but they
// are NOT worth competing with the audio stream or the mainstage rotation, so they go one at a
// time, behind an idle callback, and stand down entirely on a metered connection.
const LORE_IMAGES = Array.from(
  new Set(LORE_STOPS.map((s) => s.image).filter((i): i is string => !!i)),
)

export default function Precache() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const booting = useSiteStore((s) => s.booting)

  useEffect(() => {
    if (!loggedOn || booting) return
    if (!connectionAllowsPrefetch()) return

    const queue = restAssets(LORE_IMAGES)
    let cancelled = false

    const pump = () => {
      if (cancelled) return
      const next = queue.shift()
      if (!next) return
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = next.as
      link.href = next.href
      // one at a time: chain the next only once this one is done, so a slow connection degrades
      // to "fewer warmed assets" rather than a stalled queue of parallel downloads
      link.onload = () => idleSoon(pump)
      link.onerror = () => idleSoon(pump)
      document.head.appendChild(link)
    }
    idleSoon(pump)

    return () => {
      cancelled = true
    }
  }, [loggedOn, booting])

  return null
}
