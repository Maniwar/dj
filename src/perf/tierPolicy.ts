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
  /** How many times each tier has been forgiven, so retries can back off. Index = tier. */
  forgiven: number[]
}

export type TierMove = 'down' | 'up' | 'hold'

/** Windows above `slowMs` before dropping a tier. */
export const STRIKES_TO_DROP = 4
/** Windows with headroom before climbing back. */
export const WINDOWS_TO_CLIMB = 8
/**
 * The frame time that counts as fast enough to CLIMB, in milliseconds. An ABSOLUTE number, not a
 * fraction of the drop threshold, and they had to be separated.
 *
 * As a fraction it was `slowMs * 0.84`, which silently couples the two: raising the drop threshold
 * to 42ms (24fps) to stop the rig being twitchy would move the climb threshold to 35ms, so it would
 * climb while running at 28fps, immediately fail, and hunt between rungs forever. Dropping and
 * climbing answer different questions -- "is this unacceptable?" and "is there room to spare?" --
 * and a single number cannot express both.
 *
 * 24ms, raised from 19 after watching it fail on a machine that should have sailed through.
 *
 * The reasoning for 19 was that vsync quantises frame time -- a 60Hz display delivers 16.7, 33.3 or
 * 50ms and nothing between -- so 19 sits just above the floor and means "essentially every frame is
 * landing". Correct in principle, wrong in practice, because the two numbers being compared come
 * from different clocks. The perf panel reported p50 17, p95 17, max 18 while the tier sampler's own
 * windows were never once under 19: useFrame's delta carries per-frame overhead the panel's sampler
 * does not see, so a machine measured at 17ms is measured HERE at 19-plus.
 *
 * That left it stuck between the thresholds: too slow to climb, not slow enough to drop, pinned at
 * native forever with `climb 0/8` resetting every window. A dead zone is the worst failure mode
 * here, because nothing about it looks broken.
 *
 * 24 keeps the important property -- it is far below the 33.3ms half-rate line, so a machine
 * actually missing vsync cannot satisfy it -- while leaving real margin above what a healthy 60fps
 * machine reports through this particular clock.
 */
/**
 * THE RIG RUNS AT 30fps ON PURPOSE, and every threshold before this one ignored that.
 *
 * ThermalRunaway sets frameloop="demand" and drives it from a setInterval at RIG_FRAME_MS -- a
 * deliberate half-rate cap, since a music visualiser does not need 60. So the rig's HEALTHY frame
 * time is 33.3ms, not 16.7. Three thresholds were picked here (22, 19, 24) by reading the perf
 * panel's p95 of 17ms, which is the PAGE's frame time and says nothing about the rig's cadence.
 *
 * The result was a dead zone with no exit: 33.3 is above every one of those climb thresholds and
 * below the 42ms drop threshold, so the rig could neither climb nor drop and sat at native forever
 * with climb 0/8 resetting every window. Nothing about it looked broken, which is how it survived
 * four rounds of diagnosis.
 *
 * Derived from RIG_FRAME_MS now so the two cannot drift apart if the metronome is ever retuned:
 *   climb  <= 36ms   the metronome is being hit essentially every tick
 *   drop   >  42ms   24fps, the rate the site owner asked to protect
 * A missed tick costs 66.7ms, so a window containing any meaningful share of them lands well past
 * the drop line, while a clean one sits at 33.3 and comfortably under the climb line.
 */
export const RIG_FRAME_MS = 33
export const FAST_MS = RIG_FRAME_MS + 3
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
  return { strikes: 0, fast: 0, failed: new Array(tierCount).fill(0), forgiven: new Array(tierCount).fill(0) }
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
  // "Not slow" is nowhere near enough to justify climbing. With the drop threshold at 24fps there
  // is an enormous band between "not dropping tiers" and "has capacity to spare", and a window
  // anywhere in it will go straight back over the line at higher resolution.
  if (avgMs >= FAST_MS) {
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
    //
    // BUT THE WAIT DOUBLES EACH TIME. Flat forgiveness re-offers the rung every ~10s forever, so a
    // machine that genuinely cannot hold it pays a burst of bad frames on a permanent loop -- worse
    // than never probing at all, and exactly what the retry budget existed to prevent. Doubling
    // means a rung that keeps failing is retried after 10s, then 20s, 40s, 80s and so on, which
    // fades to never in practice while still recovering instantly from a one-off bad spell.
    const n = st.forgiven[tier - 1] ?? 0
    if (st.fast >= FORGIVE_AFTER * Math.pow(2, n)) {
      st.failed[tier - 1] = Math.max(0, (st.failed[tier - 1] ?? 0) - 1)
      st.forgiven[tier - 1] = n + 1
      st.fast = 0
    }
  }
  return 'hold'
}
