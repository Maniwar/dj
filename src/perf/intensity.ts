import { useSiteStore } from '../state/useSiteStore'
import { clampDial, fxMultiplier, FX_DEFAULT } from './fxCurve'

export { FX_DEFAULT, FX_MAX_MULTIPLIER, fxMultiplier } from './fxCurve'

// ============================================================================================
// THE MASTER INTENSITY DIAL — one value, two mechanisms, no third
// ============================================================================================
// The knob used to be FRICTION: CRT scanlines, a chromatic split on the lyrics, and a 7Hz shake
// of a full-viewport fixed layer. It is now a master intensity control over every effect on the
// site. The old behaviour is deleted outright rather than left switchable — it cost legibility
// (the complaint) and a permanently-animating viewport-sized composited layer (the perf bug),
// and it did both of those AT EVERY KNOB POSITION: the overlay was pinned at opacity 0.25 and
// its two children carried no friction term at all, so "0" was never off. The chromatic split
// was also shadowing a live rule — the lyric line's beat glow has never once rendered.
//
// A dial position reaches the page through EXACTLY TWO channels, and everything visual is one of
// the two. There is no third, and adding one would be the mistake this file exists to prevent:
//
//   1. STATIC TERMS — `--fx`, a registered custom property carrying the multiplier. Rules that
//      have a fixed strength multiply their own constant by it: `opacity: calc(0.16*var(--fx))`.
//      Roughly a dozen declarations, listed at the @property block in index.css.
//
//   2. DYNAMIC TERMS — pre-multiplied AT THE SOURCE. AudioReactive scales every --m-* value by
//      the multiplier before it is stringified, so all ~94 beat-reactive declarations scale for
//      free and not one rule had to be rewritten. This is why the rework is a small diff.
//
// The second channel also gives the best possible behaviour at 0 with no extra branch: every
// audio variable becomes the constant "0.0", AudioReactive's dedupe cache matches on every
// frame, nothing is pending, and the per-frame cssText write on :root — the exact cost that
// ?noreact was built to isolate — stops happening at all.
//
// WHERE `--fx` IS WRITTEN, AND WHY IT IS NOT ON <html>. AudioReactive owns documentElement's
// inline style outright: it rebuilds the whole `cssText` from its own map once per frame so the
// nine audio variables cost ONE style invalidation instead of nine. Anything else written there
// is erased on the next frame. Custom properties inherit, and every styled element is inside
// <body>, so writing it one level down reaches exactly the same rules while leaving that
// invariant alone. (This is the same reasoning, and the same conclusion, that moved the old
// --friction/--chroma/--shake variables to body.)
//
// PRECEDENCE. This module is the low-level writer: it moves the value and repaints. It does NOT
// persist and does NOT reconcile with the profile — fxState.setIntensityPref does both, and it
// is what the knob and the panel slider call. The split matters because the BENCHMARK sets the
// dial 8-40 times per run and must not leave a visitor's device configured by whichever row ran
// last.

// Seeded from the constant rather than from the store: this module is imported BY the store's
// consumers and evaluating getState() at module scope would make the value depend on load order.
// The first real value arrives microseconds later, from initPerfState().
let multiplier = fxMultiplier(FX_DEFAULT)

/** The multiplier the page is currently rendering at. Read per frame by AudioReactive. */
export function getFxMultiplier(): number {
  return multiplier
}

/** The dial position, 0..1 — what the knob shows and what is persisted. */
export function getIntensity(): number {
  return useSiteStore.getState().intensity
}

/**
 * Move the dial. Writes the store and republishes `--fx` — nothing else.
 *
 * `--fx` is written unconditionally, even when the value has not changed, because this is also
 * the boot path: initPerfState() calls it synchronously before React mounts, and on a reload
 * where the stored dial equals the store's default an early return would leave the property
 * unset for the first paint.
 */
export function setIntensity(v: number): void {
  const dial = clampDial(v)
  multiplier = fxMultiplier(dial)
  // 3dp: the smallest step any consumer resolves is a fraction of a pixel of glow radius, and a
  // shorter token is a shorter style-invalidation payload on a control that can be dragged.
  document.body?.style.setProperty('--fx', multiplier.toFixed(3))
  if (useSiteStore.getState().intensity !== dial) useSiteStore.getState().setIntensity(dial)
}

/** Subscribe to changes, for the panel's slider readout. Returns an unsubscribe. */
export function onIntensityChange(fn: (v: number) => void): () => void {
  return useSiteStore.subscribe((s, prev) => {
    if (s.intensity !== prev.intensity) fn(s.intensity)
  })
}
