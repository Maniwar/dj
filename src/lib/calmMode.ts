import { refreshRenditionChoice } from './videoRendition'

// CALM MODE — measured, not guessed.
//
// Every previous attempt at this asked "what KIND of device is this?" via media queries: a width,
// then a height, then pointer:coarse. Each one was wrong for some real device, because none of
// them measure the thing that actually matters — whether this machine can keep up. A Samsung tablet
// with a maximised window is the case that broke all three, and the next unusual device would
// break whatever fourth guess I made.
//
// So this measures FRAME TIME and reacts to it. If the page cannot hold a reasonable frame rate,
// it sets `.calm` on <html> and the stylesheet drops the expensive per-frame repaints — the
// audio-driven text-shadows, filters and box-shadows that recompute every frame --m-beat moves.
// A device that copes never sees any change.
//
// ONE-WAY, deliberately. Dropping effects makes frames cheaper, which would make the measurement
// look healthy again, which would restore the effects, which would stutter again — an oscillation
// that reads as far worse flicker than the original problem. Calm is a latch: once tripped it
// stays for the session.
//
// It only samples while something is animating. When the page is idle the frame rate is
// meaningless (rAF is throttled), and judging a device by its idle behaviour is how you end up
// calming a machine that was merely doing nothing.

const SAMPLE_MS = 900 // long enough to survive a scroll or a decode hiccup
const SLOW_FRAME = 26 // ms — below ~38fps. Not 16.7: occasional long frames are normal.
const SLOW_RATIO = 0.4 // fraction of frames over budget before we call it struggling
const GRACE_MS = 3500 // ignore startup entirely: boot, first video decode, shader compile

export function startCalmMode(): () => void {
  if (typeof window === 'undefined') return () => {}

  const root = document.documentElement

  // Respect an explicit opt-out/opt-in, which also makes this testable on a real device:
  //   ?calm      — force it on
  //   ?nocalm    — force it off
  const q = location.search
  if (/[?&]calm(?:&|=|$)/i.test(q)) {
    root.classList.add('calm')
    // The forced path must do everything the measured path does, or ?calm tests something other
    // than what a struggling device actually experiences — which makes it useless as a diagnostic.
    refreshRenditionChoice()
    return () => {}
  }
  if (/[?&]nocalm(?:&|=|$)/i.test(q)) return () => {}

  let raf = 0
  let last = performance.now()
  let windowStart = last
  let frames = 0
  let slow = 0
  const started = last

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    const dt = now - last
    last = now

    if (now - started < GRACE_MS) {
      windowStart = now
      frames = slow = 0
      return
    }

    // A frame longer than ~half a second is a tab switch, a GC pause or a stall — not a
    // measurement of rendering cost. Counting it would calm a device on the strength of one hiccup.
    if (dt > 500) {
      windowStart = now
      frames = slow = 0
      return
    }

    frames++
    if (dt > SLOW_FRAME) slow++

    if (now - windowStart >= SAMPLE_MS) {
      // Require a real sample. A handful of frames says nothing, and rAF is throttled when the
      // page is idle or backgrounded, which would otherwise look identical to a slow device.
      if (frames >= 20 && slow / frames >= SLOW_RATIO) {
        root.classList.add('calm')
        // Let the video layer re-decide too. It deliberately does NOT swap a playing clip — the
        // lighter rendition lands at the next scene change, which nobody perceives as a change.
        refreshRenditionChoice()
        cancelAnimationFrame(raf)
        raf = 0
        return
      }
      windowStart = now
      frames = slow = 0
    }
  }

  raf = requestAnimationFrame(tick)
  return () => {
    if (raf) cancelAnimationFrame(raf)
  }
}
