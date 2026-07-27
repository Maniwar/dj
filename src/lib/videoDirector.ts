// ONE VIDEO AT A TIME.
//
// Measured on a Samsung Tab Ultra with ?diag: nine <video> elements on the page and TWO decoding
// 1080p at once. That is the load. It also explains every confusing part of the report — the
// device showed 54fps and 0% slow frames, so it was not "struggling" in any way a frame-time
// sampler could see; it was hitting the hardware video decoder's ceiling, which starves
// compositing in bursts and reads as the whole interface pulsing rather than as a low frame rate.
//
// A bigger viewport intersects more sections at once, which is why maximising the window made it
// worse, and why shrinking it "fixed" it. Nothing about window size mattered except how many
// clips it let play together.
//
// Each section observes its own visibility and plays its own clip, which is correct in isolation
// and wrong in aggregate: nobody was counting the total. This is the missing global rule — the
// most-visible video plays, every other one pauses. It deliberately does NOT touch `src`,
// preload, or the DOM, so nothing reloads and no layout changes; it only decides who is allowed
// to decode.
//
// Two clips CAN overlap briefly during a cross-fade, which is intentional and short. The
// threshold below allows a challenger to take over only when it is clearly more visible, so a
// scroll that parks between two sections cannot flip playback back and forth every frame.

const SWITCH_MARGIN = 0.15 // a challenger must beat the incumbent by this much to take over

let observer: IntersectionObserver | null = null
let mo: MutationObserver | null = null
const ratios = new WeakMap<HTMLVideoElement, number>()
let current: HTMLVideoElement | null = null

function apply() {
  const videos = Array.from(document.querySelectorAll('video'))
  let best: HTMLVideoElement | null = null
  let bestRatio = 0
  for (const v of videos) {
    const r = ratios.get(v) ?? 0
    if (r > bestRatio) {
      bestRatio = r
      best = v
    }
  }

  // Hysteresis: keep the incumbent unless the challenger is clearly ahead. Without this, two
  // sections at similar visibility swap the playing clip on every scroll tick, and restarting a
  // decode repeatedly is far more expensive than letting one run.
  if (current && best && current !== best) {
    const cur = ratios.get(current) ?? 0
    if (bestRatio <= cur + SWITCH_MARGIN) best = current
  }
  if (bestRatio <= 0) best = null

  for (const v of videos) {
    if (v === best) {
      // Only ever resume something that was already meant to be playing. A muted background clip
      // that a section paused for its own reasons stays paused.
      if (v.paused && v.dataset.wantPlay === '1') v.play().catch(() => {})
    } else if (!v.paused) {
      // Remember that this one wanted to play, so it can resume when it becomes the visible one.
      v.dataset.wantPlay = '1'
      v.pause()
    }
  }
  current = best
}

/** Start enforcing the one-video rule. Returns a teardown. */
export function startVideoDirector(): () => void {
  if (typeof window === 'undefined') return () => {}

  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) ratios.set(e.target as HTMLVideoElement, e.intersectionRatio)
      apply()
    },
    { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  )

  const attach = () => {
    document.querySelectorAll('video').forEach((v) => {
      if (!(v as any).__directed) {
        ;(v as any).__directed = true
        // Anything that starts playing is recorded as wanting to play, so the director can hand
        // playback back to it later without knowing why it started.
        v.addEventListener('play', () => {
          v.dataset.wantPlay = '1'
          apply()
        })
        observer!.observe(v)
      }
    })
  }
  attach()

  // Sections mount and unmount as the page loads and as routes/scenes change, so new <video>
  // elements appear after this runs. Watching the tree is what makes the rule hold for all of
  // them rather than only the ones present at startup.
  mo = new MutationObserver(attach)
  mo.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer?.disconnect()
    mo?.disconnect()
    observer = mo = null
    current = null
  }
}
