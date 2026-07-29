// ============================================================================================
// THE DIAL'S RESPONSE CURVE — the one place that says what a knob position MEANS
// ============================================================================================
// A leaf module on purpose: it imports nothing, so both the site store (which holds the dial
// position) and src/perf/intensity.ts (which publishes the multiplier) can read the same
// constants without an import cycle. Two definitions of "the default" that drifted apart would
// be a silent visual regression — the page would boot at a strength nothing was tuned to.
//
// TWO DIFFERENT NUMBERS, and keeping them apart is the whole idea:
//
//   DIAL POSITION  0..1   what the knob and the panel slider show, what is persisted, what the
//                         registry's minIntensity thresholds are compared against.
//   MULTIPLIER     0..1.4 what the effects are actually scaled by — published as the --fx custom
//                         property and pre-multiplied into every --m-* audio variable.
//
// The curve maps one to the other, and it is deliberately NOT the identity:
//
//   dial 0     → 0     every effect off. A clean page, and the accessibility escape hatch.
//   dial 0.6   → 1.0   EXACTLY the values the site was tuned to. This is the default.
//   dial 1     → 1.4   more than the site has ever shipped: wider glows, deeper alphas, a
//                      harder beat.
//
// WHY THE DEFAULT SITS AT 0.6 RATHER THAN AT THE TOP. A dial whose rest position is also its
// ceiling is a dial that can only ever be turned down — half a control. Putting the shipped look
// at 0.6 gives it travel in both directions, and it makes the two things a person actually wants
// reachable without either being a special case: "calm this down" is the bottom 60% of the
// sweep, "give me more" is the top 40%. The old friction knob defaulted to 0.12 out of 1, which
// meant 88% of its travel was territory nobody had ever looked at.
//
// The upper leg is gentler than the lower one (0.4 of headroom spread over 0.4 of travel, versus
// 1.0 of range over 0.6 of travel) because above 1.0 every term is leaving the range it was
// tuned in. Alphas clamp, glow radii do not — 1.4x is about as far as the type stays readable
// over moving footage, which is the constraint that set the number.

/** Dial position at which the multiplier is exactly 1 — i.e. the site as designed. */
export const FX_DEFAULT = 0.6

/** Multiplier at dial 1. */
export const FX_MAX_MULTIPLIER = 1.4

export function clampDial(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : FX_DEFAULT
}

/** Dial position (0..1) → effect multiplier (0..FX_MAX_MULTIPLIER). Pure; no DOM, no state. */
export function fxMultiplier(dial: number): number {
  const d = clampDial(dial)
  if (d <= FX_DEFAULT) return d / FX_DEFAULT
  return 1 + ((d - FX_DEFAULT) / (1 - FX_DEFAULT)) * (FX_MAX_MULTIPLIER - 1)
}

// ============================================================================================
// MOTION IS CLAMPED. ORNAMENT IS NOT.
// ============================================================================================
// The dial reaches the page through two channels (see intensity.ts). The static one — glow
// radii, alphas, opacities — can safely run the full 0..1.4: at 0 it is simply absent, at 1.4 it
// is gaudy, and neither hurts. The dynamic one is different at BOTH ends, and one multiplier
// serving both was wrong twice over.
//
// AT THE TOP: --m-* values are pre-multiplied at the source, and one of them, --beat-lift, is a
// translateY on the whole content layer. It already travels 12-14px at the shipped setting; at
// 1.4x that is close to 30px of the type, the badges and the player all moving together against
// a background video that does not move. It was reported as "the site shakes at 100%", which is
// exactly what it was. Amplifying whole-page translation is also the precise defect this project
// spent weeks chasing, so the ceiling for motion is the amplitude the site was tuned at: 1.0.
//
// AT THE BOTTOM: a multiplier of 0 makes every audio variable the constant 0, so the type stops
// responding to the music entirely. That produces a page that is technically running but reads as
// broken — a club with the lights on. The registry marks the beat response `essential` for this
// reason, and marking it essential is worthless if the multiplier feeding it is zero. So motion
// keeps a floor: quieter than shipped, never absent.
export const FX_MOTION_MIN = 0.3
export const FX_MOTION_MAX = 1

/**
 * The multiplier for anything that MOVES — every --m-* value, and --beat-lift with it.
 * Clamped to [0.3, 1]: the beat is always legible, and never larger than the tuned amplitude.
 */
export function fxMotionMultiplier(dial: number): number {
  return Math.max(FX_MOTION_MIN, Math.min(FX_MOTION_MAX, fxMultiplier(dial)))
}
