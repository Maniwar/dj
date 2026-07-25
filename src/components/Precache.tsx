import { useEffect } from 'react'
import { useSiteStore } from '../state/useSiteStore'
import { withBase } from '../lib/asset'
import results from '../data/atlascloud.results.json'

// The dial-up boot console is ~4 seconds of the viewer watching text scroll. Measured, almost
// nothing was being fetched in it: the mainstage rotation loads a clip only when the montage
// cuts to it, so the second video arrived ~10s in — right when it was needed, which is exactly
// when you don't want to be waiting on the network.
//
// So we spend that window warming what the home page is CERTAIN to need next: the rest of the
// mainstage rotation. Deliberately NOT everything — the full set of clips is ~33MB and most of
// it belongs to sections you may never scroll to.
//
// Uses <link rel="prefetch">, not fetch(): the browser treats it as idle-priority and will not
// let it compete with the audio stream or the first video. And it stands down entirely on
// save-data or a slow connection, where speculative downloading is a cost, not a courtesy.
function connectionAllowsPrefetch(): boolean {
  const c = (navigator as any).connection
  if (!c) return true // unknown — assume a normal connection
  if (c.saveData) return false
  return !/(^|-)2g$/.test(c.effectiveType ?? '')
}

export default function Precache() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const booting = useSiteStore((s) => s.booting)

  useEffect(() => {
    // only while the boot console is actually up
    if (!loggedOn || !booting) return
    if (!connectionAllowsPrefetch()) return

    const clips = (results as { clips?: Array<{ id?: string; status?: string; mp4Url?: string }> }).clips ?? []
    // the mainstage cycle — everything the home page rotates through, minus the first clip,
    // which the Broadcast has already started loading by now
    const urls = clips
      .filter((c) => c.status === 'ready' && c.mp4Url && c.id?.startsWith('club-'))
      .map((c) => withBase(c.mp4Url!))

    const links: HTMLLinkElement[] = []
    for (const href of urls) {
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'video'
      link.href = href
      document.head.appendChild(link)
      links.push(link)
    }
    return () => {
      // the fetches themselves continue in the browser's cache; only the tags are tidied up
      links.forEach((l) => l.remove())
    }
  }, [loggedOn, booting])

  // ---- STAGE TWO: everything else, but only once the page is idle ----
  // The lore and city clips are another ~19MB. They're worth having warm — scrolling into The
  // Origin shouldn't wait on a download — but they are NOT worth competing with the audio or
  // the mainstage rotation for bandwidth, and they belong to sections a visitor may never
  // reach. So they queue behind the boot prefetch, go one at a time, and only when the browser
  // says it's idle.
  useEffect(() => {
    if (!loggedOn || booting) return
    if (!connectionAllowsPrefetch()) return

    const clips = (results as { clips?: Array<{ id?: string; status?: string; mp4Url?: string }> }).clips ?? []
    const queue = clips
      .filter((c) => c.status === 'ready' && c.mp4Url && !c.id?.startsWith('club-') && c.id !== 'club')
      .map((c) => withBase(c.mp4Url!))

    let cancelled = false
    const links: HTMLLinkElement[] = []
    const idle: (cb: () => void) => number =
      (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 800))

    const pump = () => {
      if (cancelled) return
      const href = queue.shift()
      if (!href) return
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'video'
      link.href = href
      // one at a time: chain the next only after this one is done, so a slow connection
      // degrades to "fewer warmed clips" rather than a stalled queue of parallel downloads
      link.onload = () => idle(pump)
      link.onerror = () => idle(pump)
      document.head.appendChild(link)
      links.push(link)
    }
    const start = idle(pump)

    return () => {
      cancelled = true
      if ((window as any).cancelIdleCallback) (window as any).cancelIdleCallback(start)
      links.forEach((l) => l.remove())
    }
  }, [loggedOn, booting])

  return null
}
