import { withBase } from './asset'
import { fxOffClass } from '../perf/fxClasses'

// The clips ship in two renditions, built by scripts/build-video-renditions.mjs:
//
//   /assets/video/x.mp4       1280x720, ~2.4 Mbps  — the default
//   /assets/video/hd/x.mp4    1920x1080, ~4 Mbps   — big displays only
//
// They're shown with `object-fit: cover`, which scales a clip to the WIDTH of the viewport, so
// the 720p source is blown up 2.7x on a 21:9 panel, 4x on 32:9 and 6x on a 7K ultrawide. Serving
// 1080p to everyone would double the bytes for the majority on a laptop or phone who cannot
// resolve the difference, so the client picks the rendition that matches its display.
const SD_PREFIX = '/assets/video/'
const HD_PREFIX = '/assets/video/hd/'

/** Below this many physical pixels across, 720p is already at or above native. */
const HD_MIN_PHYSICAL_WIDTH = 1920

// Decided ONCE per session, deliberately. Re-evaluating on resize would swap the `src` of a
// playing <video> and restart the clip mid-scene, which is far more jarring than a slightly
// soft frame after someone drags the window to another monitor.
let cached: boolean | null = null

/**
 * Forget the cached decision so the next clip re-picks its rendition.
 *
 * Going full screen can take a 1400px window past the 1920-physical-pixel threshold, but the
 * decision was made once at load and never revisited. It deliberately does NOT swap the src of
 * whatever is playing: changing a playing video's source restarts the clip mid-scene, which is
 * a far worse artefact than one more scene at 720p. Clearing the cache means the UPGRADE lands
 * at the next natural scene or track change, which nobody perceives as a change at all.
 */
export function refreshRenditionChoice(): void {
  cached = null
}

if (typeof window !== 'undefined') {
  document.addEventListener('fullscreenchange', refreshRenditionChoice)
  document.addEventListener('webkitfullscreenchange', refreshRenditionChoice)
}

export function prefersHdVideo(): boolean {
  if (cached !== null) return cached
  if (typeof window === 'undefined') return (cached = false)

  const conn = (navigator as any).connection
  // on a metered or slow connection the smaller file wins regardless of how big the panel is
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return (cached = false)

  // HD IS EARNED, NOT ASSUMED — and never withheld from a screen that deserves it.
  //
  // The first fix here banned HD outright on touch devices, which stopped the flicker on a
  // struggling tablet by permanently serving soft video to every capable one. That is the wrong
  // trade: a large high-density panel is exactly where 1080p is worth having.
  //
  // So the decision now follows MEASUREMENT. src/perf/autoProfile.ts samples real frame time and
  // steps the profile down when the device cannot keep up; `lean` and `minimal` set `.calm`.
  // While that is unset, resolution alone decides, so a capable tablet gets HD like any other big
  // display. Once a profile sets it, this drops to SD — and because fxState calls
  // refreshRenditionChoice() whenever `.calm` changes, the downgrade lands at the next natural
  // scene change rather than restarting whatever is playing.
  if (document.documentElement.classList.contains('calm')) return (cached = false)

  // The `hdRendition` switch, honoured the same way `.calm` already is — by reading the root
  // class rather than by holding a second copy of the state. The decision is cached for the
  // session, so anything that flips the class at runtime (the diag panel, the benchmark) must
  // call refreshRenditionChoice() afterwards, exactly as fxState does when a profile applies.
  if (document.documentElement.classList.contains(fxOffClass('hdRendition'))) return (cached = false)

  // physical pixels, not CSS pixels: that's what the compositor actually has to fill, so a
  // retina laptop at 1512 CSS px is really driving 3024 and does benefit from the larger source
  const physical = window.innerWidth * (window.devicePixelRatio || 1)
  return (cached = physical >= HD_MIN_PHYSICAL_WIDTH)
}

/**
 * Resolve a clip path to the right rendition for this display, base-path included.
 * Non-video paths and absolute URLs pass straight through to withBase().
 */
export function videoSrc(path: string | null | undefined): string {
  if (!path) return ''
  if (!path.startsWith(SD_PREFIX) || path.startsWith(HD_PREFIX)) return withBase(path)
  if (!prefersHdVideo()) return withBase(path)
  return withBase(HD_PREFIX + path.slice(SD_PREFIX.length))
}
