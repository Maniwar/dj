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
