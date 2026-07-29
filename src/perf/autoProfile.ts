import { SampleWindow, measureRefreshHz, type FrameStats } from './sampler'
import { classify, profileIndex, worseOf, PROFILES, type ProfileId, type Verdict } from './profiles'
import { autoArmed, isPerfStateHeld, perfState, setDetectedProfile } from './fxState'
import { useSiteStore } from '../state/useSiteStore'

// ============================================================================================
// AUTO-DETECTION — measure the device, do not guess what kind of device it is
// ============================================================================================
// This replaces src/lib/calmMode.ts, which is deleted. Two things about it were right and are
// kept verbatim, and one was wrong and is the reason this file exists.
//
// RIGHT, AND KEPT:
//
//   Measure, never infer. Every earlier attempt asked "what kind of device is this?" — a width,
//   then a height, then pointer:coarse — and each was wrong for some real machine. A Samsung Tab
//   Ultra with its browser maximised defeated all three. There is no media query here.
//
//   One-way. Dropping effects makes frames cheaper, which makes the measurement look healthy,
//   which would restore the effects, which would stutter again. That oscillation reads as far
//   worse flicker than the original problem. So the ladder is walked DOWNWARDS only, and the
//   only re-measurement allowed is one that can make things lighter.
//
// WRONG, AND FIXED: it latched on the FRACTION OF FRAMES SLOWER THAN 26ms, averaged over 900ms,
// against a 40% threshold. On both devices that actually exhibit the problem it never fired once,
// because the page held a clean 60fps average while visibly stuttering — the stutter was one
// frame in twenty, and one frame in twenty is 5%, nowhere near 40%. A ratio against a threshold
// is a mean wearing a hat. classify() in profiles.ts decides on p95, corroborated by p99, by
// long-task time and by the dropped-frame fraction against the measured refresh rate; see the
// block there for why each of those four fails differently.

/**
 * Ignore startup entirely: the lazy three.js chunk, WebGLRenderer.setSize allocating its buffers
 * and the first video decode all land in the first few seconds. Judging a device on them would
 * calm every device. The duration is unchanged from calmMode, where the reasoning held.
 *
 * WHAT IT IS MEASURED FROM IS NOT. calmMode counted from page load, which on this site is the
 * wrong clock: the club is behind a boot gate, and a visitor can sit on the login screen for a
 * minute. Counting from load means the window lands on an idle overlay — three animations and no
 * video — and classifies the device as `full` on the strength of a page that was showing nothing.
 * Someone who logs on immediately gets the opposite error: the window lands on the reveal, which
 * is the most expensive second of the session, and the device is over-demoted. So the clock
 * starts when the gate lifts, and the grace period covers the reveal itself.
 */
const GRACE_MS = 3500
/** Long enough to survive one scroll or one decode hiccup, short enough to decide promptly. */
const WINDOW_MS = 900
/** Between the two windows, so a single transient cannot own both. */
const GAP_MS = 250
/**
 * One re-measurement, late enough that the page is in its steady state — every video decoding,
 * the shader compiled, the marquees running — and that a device which only falls over once warm
 * has had time to.
 */
const RECHECK_MS = 15_000

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Resolve once the club is actually on screen — logged on and past the boot sequence, which is
 * the same condition App uses to set `.gated`. Behind the gate the page is an opaque overlay with
 * every animation paused, and its frame times describe nothing.
 */
function ungated(): Promise<void> {
  const shown = (s: { loggedOn: boolean; booting: boolean }) => s.loggedOn && !s.booting
  if (shown(useSiteStore.getState())) return Promise.resolve()
  return new Promise((resolve) => {
    const un = useSiteStore.subscribe((s) => {
      if (!shown(s)) return
      un()
      resolve()
    })
  })
}

/** One valid window, or null. Retried once — an invalid window is usually a lost tab, not a slow device. */
async function sample(ms: number): Promise<FrameStats | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const w = new SampleWindow()
    await wait(ms)
    const s = w.close()
    if (s.valid) return s
    await wait(GAP_MS)
  }
  return null
}

/**
 * Start measuring, and downgrade the profile if the device cannot keep up.
 *
 * Returns a cancel function. Cancelling stops further measurement; it never reverts a downgrade
 * that has already been applied, because reverting is an upgrade and upgrades are what the
 * one-way rule forbids.
 */
export function startAutoProfile(): () => void {
  if (typeof window === 'undefined') return () => {}

  let cancelled = false
  const stop = () => {
    cancelled = true
  }

  // REDUCED MOTION SHORT-CIRCUITS, and does not measure. Someone who has asked their operating
  // system for less movement is not asking for "as much movement as this hardware can sustain",
  // so there is nothing here that a frame-time measurement could usefully decide.
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (autoArmed()) {
      setDetectedProfile({
        profile: 'minimal',
        reason: 'prefers-reduced-motion is set — not measured',
        p95: 0,
        p99: 0,
        longTaskMs: 0,
        droppedFrac: 0,
      })
    }
    return stop
  }

  // Nothing above rung 5 has spoken? If something has, do not even start the clock — the
  // sampler's rAF would be a callback on every frame of a page whose configuration is already
  // decided.
  if (!autoArmed()) return stop

  void (async () => {
    // droppedApprox is one of the four signals and it is meaningless without the real panel rate.
    // Measured while the gate is still up, so it costs nothing extra — and measured there quite
    // safely, because it is a median of idle deltas and does not care what is on screen.
    await measureRefreshHz()
    await ungated()
    if (cancelled || !autoArmed()) return
    await wait(GRACE_MS)
    if (cancelled || !autoArmed()) return

    const first = await decide()
    if (cancelled || first === null) return
    apply(first)

    await wait(RECHECK_MS)
    if (cancelled || !autoArmed()) return
    const second = await decide()
    if (cancelled || second === null) return
    // AT MOST ONE FURTHER STEP, and only downwards. A device that keeps looking worse should not
    // be walked all the way to `minimal` by a process the user cannot see: two visible changes to
    // the page in one session is already the most anyone should have to notice.
    const floorId = PROFILES[Math.min(PROFILES.length - 1, profileIndex(currentDetected()) + 1)]
    apply({ ...second, profile: worseOf(currentDetected(), clampTo(second.profile, floorId)) })
  })()

  return stop
}

function currentDetected(): ProfileId {
  return perfState().detected ?? 'full'
}

/** Never lighter than `floorId`. */
function clampTo(p: ProfileId, floorId: ProfileId): ProfileId {
  return profileIndex(p) > profileIndex(floorId) ? floorId : p
}

/**
 * ADVISORY, NOT AUTOMATIC. The verdict is recorded — the panel shows it, the export carries it —
 * but it does NOT restyle the page.
 *
 * The first version applied it. On a perfectly healthy desktop, twenty seconds after load, the
 * page silently acquired eighteen fx-off classes and `.calm`: the player glass gone, the
 * per-letter lyric animation gone, the frosted cards gone. It shipped to production that way, and
 * a visitor who did not know the panel existed had no way back. The measurement was not even
 * wrong — headless Chrome IS slow — it simply should never have been wired to the page.
 *
 * The judgement is worth keeping and the automatic application is not, because the two failure
 * modes are wildly asymmetric. Guessing too cautiously costs a device some effects it could have
 * afforded, and nobody can tell. Guessing too aggressively silently rewrites the site for
 * everyone, which is what happened. A recommendation a person accepts has neither failure mode.
 *
 * `?profile=` and the panel still apply a profile immediately; those are explicit requests.
 */
function apply(v: Verdict): void {
  if (!autoArmed()) return
  // Never an upgrade. See the one-way note at the top — kept because the RECOMMENDATION should
  // not oscillate either: a device that dips once should not be told "actually you're fine".
  const next = worseOf(currentDetected(), v.profile)
  if (next === currentDetected() && perfState().detected !== null) return
  setDetectedProfile({ ...v, profile: next })
}

/**
 * Two consecutive windows, and they have to agree.
 *
 * A single 900ms window is one scroll, one video keyframe or one garbage collection away from
 * saying something it does not mean. THE TWO MUST LAND WITHIN ONE STEP OF EACH OTHER; if they do
 * not, the page was doing something unrepresentative and the WORSE of the two is taken. Worse,
 * not better, because the failure mode of being too cautious is a slightly plainer page and the
 * failure mode of being too optimistic is the bug this project has been chasing for weeks.
 */
async function decide(): Promise<Verdict | null> {
  if (isPerfStateHeld()) return null // a benchmark is running; its configurations are not the page
  const a = await sample(WINDOW_MS)
  if (a === null) return null
  await wait(GAP_MS)
  if (isPerfStateHeld()) return null
  const b = await sample(WINDOW_MS)
  if (b === null) return null

  const va = classify(a)
  const vb = classify(b)
  const worse = profileIndex(va.profile) >= profileIndex(vb.profile) ? va : vb
  const gap = Math.abs(profileIndex(va.profile) - profileIndex(vb.profile))
  return gap <= 1
    ? worse
    : { ...worse, reason: `${worse.reason} (two windows disagreed by ${gap} steps; took the worse)` }
}
