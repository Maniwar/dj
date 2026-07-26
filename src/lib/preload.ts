import { SCENES } from '../video/broadcastFrames'
import { withBase } from './asset'
import { videoSrc } from './videoRendition'
import results from '../data/atlascloud.results.json'

// Asset warming, shared by the boot sequence and the idle top-up that follows it.
//
// We use <link rel="prefetch"> rather than fetch(): the browser gives it idle priority, keeps
// the bytes in the HTTP cache where the <video>/<img> that actually needs them will find them,
// and — unlike fetch() — never holds a 4MB mp4 in a JS buffer we'd then throw away.

export type WarmAsset = { href: string; as: 'image' | 'video' }

type Clip = { id?: string; status?: string; mp4Url?: string }
const CLIPS: Clip[] = (results as { clips?: Clip[] }).clips ?? []

const readyClips = (want: (id: string) => boolean) =>
  CLIPS.filter((c) => c.status === 'ready' && c.mp4Url && want(c.id ?? '')).map((c) => ({
    // videoSrc, not withBase: warming the 720p file and then playing the 1080p one would
    // download every clip twice and leave the boot bar reporting progress on the wrong bytes
    href: videoSrc(c.mp4Url!),
    as: 'video' as const,
  }))

// /^club/ rather than 'club-': the mainstage set includes a clip whose id is exactly "club",
// and a startsWith('club-') test silently dropped it out of every stage.
const isClub = (id: string) => /^club/.test(id)

/**
 * What the home page is CERTAIN to need: the mainstage stills and the mainstage clips.
 * Every city scene is [cityStill, ...CLUB], so the club frames are the set EVERY scene draws
 * from — worth blocking the door for. The city stills are merely likely, so they wait.
 */
export function bootAssets(): WarmAsset[] {
  const stills = SCENES.club.frames.map((src) => ({ href: withBase(src), as: 'image' as const }))
  return [...stills, ...readyClips(isClub)]
}

/** Everything else — the sections a visitor may or may not scroll to. */
export function restAssets(loreImages: string[]): WarmAsset[] {
  const cityStills = Array.from(new Set(Object.values(SCENES).flatMap((s) => s.frames ?? [])))
    .filter((src) => !SCENES.club.frames.includes(src))
    .map((src) => ({ href: withBase(src), as: 'image' as const }))
  const lore = loreImages.map((src) => ({ href: withBase(src), as: 'image' as const }))
  // stills before clips: they're small, they're what shows with video off, and they're the
  // poster underneath each mp4 — so this order makes each section look ready soonest
  return [...cityStills, ...lore, ...readyClips((id) => !isClub(id))]
}

/** Speculative downloading is a courtesy on a fast pipe and a cost on a metered one. */
export function connectionAllowsPrefetch(): boolean {
  const c = (navigator as any).connection
  if (!c) return true // unknown — assume a normal connection
  if (c.saveData) return false
  return !/(^|-)2g$/.test(c.effectiveType ?? '')
}

/**
 * Warm a list of assets, reporting 0..1 as each one lands.
 *
 * The <link> tags are deliberately LEFT in the document. An earlier version removed them on
 * cleanup for tidiness, which fires exactly when the boot overlay unmounts — i.e. potentially
 * mid-download — and removing the tag can abort the fetch, defeating the entire point.
 */
export function warm(assets: WarmAsset[], onProgress: (p: number) => void): void {
  if (!assets.length) {
    onProgress(1)
    return
  }
  let done = 0
  for (const a of assets) {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = a.as
    link.href = a.href

    // Each asset ticks exactly ONCE, whichever of these happens first.
    //
    // The timeout is not belt-and-braces, it is the load-bearing part: a <link rel="prefetch">
    // for a resource already in the HTTP cache frequently never fires `load` at all. On a repeat
    // visit every asset was therefore silently unresolved, progress never reached 1, and the boot
    // rode its 9-SECOND CEILING instead of its 2.6s floor — measured at 8.2s on a warm cache
    // versus 3.6s cold. The one case that should be fastest was the slowest on the page.
    let ticked = false
    const tick = () => {
      if (ticked) return
      ticked = true
      window.clearTimeout(timer)
      onProgress(++done / assets.length)
    }
    // long enough that a genuinely-downloading asset reports honestly, short enough that a
    // cached one cannot hold the door
    const timer = window.setTimeout(tick, 1200)
    link.onload = tick
    link.onerror = tick // a missing asset must never wedge the bar either
    document.head.appendChild(link)
  }
}

/**
 * requestIdleCallback, but it CANNOT be starved.
 *
 * This page runs a permanent 60fps WebGL render loop and continuous audio analysis, so the
 * browser effectively never reports an idle period — a plain requestIdleCallback here never
 * fired at all, and the entire second stage of preloading silently did nothing. The timeout
 * option is the documented guarantee: fire by then, idle or not.
 */
export function idleSoon(cb: () => void, timeout = 1200): number {
  const ric = (window as any).requestIdleCallback
  return ric ? ric(cb, { timeout }) : window.setTimeout(cb, timeout)
}
