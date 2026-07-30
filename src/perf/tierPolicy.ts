// ============================================================================================
// WHEN TO DROP RESOLUTION, AND — THE PART THAT WAS MISSING — WHEN TO PUT IT BACK
// ============================================================================================
// This lived inside ThermalRunaway's animation loop, tangled up with uniforms and audio bands,
// where it could not be tested: the rig needs WebGL2, and headless Chromium here has none, so
// every attempt to verify the policy in a page measured a rig that had never mounted.
//
// It is a pure state machine over one number — the average frame time of a sampling window — so
// it belongs out here where a test can drive it through a hundred windows in a millisecond.
//
// The behaviour it encodes, and why:
//
// DEGRADATION USED TO BE ONE-WAY. The old guard stopped sampling once it reached the bottom tier,
// so anything that produced two slow windows ONCE — a video starting to decode, a GC pause,
// another tab waking up, a laptop dropping to battery — permanently cost 75% of the rig's pixels
// for the rest of the session, and the only cure was a reload. That is the real reason "the fx
// still look pixelated" kept coming back after each optimisation: the optimisations worked, but
// the rig never re-tested the machine to find out, so it sat at half resolution regardless.
//
// The two directions are deliberately asymmetric:
//   down  2 windows above slowMs        — react fast; dropping frames is the worse failure
//   up    8 windows below slowMs * 0.7  — a real headroom margin, so it climbs only when there is
//                                         room to spare, never when it is scraping the threshold
//                                         and would immediately sawtooth back down
//
// And each tier gets exactly ONE free retry. A machine that truly cannot hold tier N will fail
// there a second time, after which `failed[N] >= 2` stops that tier being offered again. So the
// policy converges on the best tier the machine can actually sustain, instead of oscillating
// between two resolutions forever — which would be more distracting than simply being soft.

export type TierState = {
  /** Consecutive slow windows observed at the current tier. */
  strikes: number
  /** Consecutive windows with comfortable headroom. */
  fast: number
  /** How many times each tier index has proven too expensive. Index = tier. */
  failed: number[]
}

export type TierMove = 'down' | 'up' | 'hold'

/** Windows above `slowMs` before dropping a tier. */
export const STRIKES_TO_DROP = 2
/** Windows with headroom before climbing back. */
export const WINDOWS_TO_CLIMB = 8
/**
 * Climbing needs the frame time under this fraction of `slowMs`, not merely under it.
 *
 * THIS NUMBER IS BOUNDED FROM BELOW BY VSYNC, which is easy to get wrong and was: at 0.7 the climb
 * threshold is 15.4ms, and a 60Hz display cannot report a frame delta below 16.7ms no matter how
 * idle the GPU is. `dt` is wall-clock time between rendered frames, not GPU work, so the floor is
 * the refresh interval. A threshold under that floor is never satisfied and the rig can never climb
 * -- the recovery path exists but is dead code on the most common display in the world.
 *
 * 0.84 puts it at 18.5ms: comfortably ABOVE the 16.7ms vsync floor so a healthy 60Hz machine
 * qualifies, and comfortably BELOW the 22ms slow threshold so there is real hysteresis between
 * dropping and climbing rather than a single line to oscillate across.
 */
export const HEADROOM = 0.84
/** A tier that has failed this many times is not offered again until headroom earns it back. */
export const MAX_RETRIES = 2
/**
 * Windows of unbroken headroom that FORGIVE one past failure.
 *
 * Without this the retry budget is spent permanently, and a single bad spell strands a fast machine
 * at the bottom tier for the whole session. Observed exactly that way: 59fps, p50 and p95 both 17ms
 * -- a machine comfortably hitting vsync -- pinned at tier 4 and rendering 55% of native. Walking
 * down four tiers in one bad moment marks every tier failed once, so each has a single retry left,
 * and one more hiccup at any rung locks the bottom in.
 *
 * 30 windows is roughly ten seconds of sustained comfort, far longer than any transient, so a
 * genuinely slow machine never earns credit back while a briefly-disturbed fast one always does.
 */
export const FORGIVE_AFTER = 30

export function newTierState(tierCount: number): TierState {
  return { strikes: 0, fast: 0, failed: new Array(tierCount).fill(0) }
}

/**
 * Decide what to do after one sampling window. MUTATES `st` (it is a per-rig scratch object owned
 * by the caller's ref) and returns the move the caller should apply to its tier index.
 *
 * @param avgMs   mean frame time across the window just closed
 * @param tier    current tier index, 0 = best quality
 * @param maxTier highest tier index available, i.e. TIERS.length - 1
 * @param slowMs  the frame budget; above this the window counts as slow
 */
export function tierMove(
  avgMs: number,
  tier: number,
  maxTier: number,
  slowMs: number,
  st: TierState,
): TierMove {
  if (avgMs > slowMs) {
    st.fast = 0
    st.strikes++
    if (st.strikes >= STRIKES_TO_DROP && tier < maxTier) {
      // Record the failure against the tier we are LEAVING — that is the one that proved too
      // expensive. This is what makes the one-free-retry rule converge.
      st.failed[tier] = (st.failed[tier] ?? 0) + 1
      st.strikes = 0
      return 'down'
    }
    return 'hold'
  }

  st.strikes = 0
  // "Not slow" is not enough to justify climbing — a window sitting just under the threshold will
  // go straight back over it at higher resolution, and the visible result is a rig that flickers
  // between two sharpness levels every few seconds.
  if (avgMs >= slowMs * HEADROOM) {
    st.fast = 0
    return 'hold'
  }

  st.fast++
  if (st.fast >= WINDOWS_TO_CLIMB && tier > 0) {
    if ((st.failed[tier - 1] ?? 0) < MAX_RETRIES) {
      st.fast = 0
      return 'up'
    }
    // Blocked by the retry budget. Keep counting: if the machine stays comfortable far longer than
    // any transient lasts, the evidence that it failed here is stale and one failure is forgiven.
    if (st.fast >= FORGIVE_AFTER) {
      st.failed[tier - 1] = Math.max(0, (st.failed[tier - 1] ?? 0) - 1)
      st.fast = 0
    }
  }
  return 'hold'
}
