import { PERF } from '../lib/perfFlags'
import { refreshRenditionChoice } from '../lib/videoRendition'
import { ALL_FX_IDS, FX_BY_ID, type FxId } from './registry'
import { applyFxOff } from './fxClasses'
import { getIntensity, setIntensity } from './intensity'
import { FX_DEFAULT } from './fxCurve'
import {
  PROFILE_BY_ID,
  isProfileId,
  type Profile,
  type ProfileId,
  type Verdict,
} from './profiles'
import {
  clearStoredPerf,
  readStoredIntensity,
  readStoredOverrides,
  readStoredProfile,
  writeStoredIntensity,
  writeStoredOverrides,
  writeStoredProfile,
  type Overrides,
} from './persist'

// ============================================================================================
// THE ONE PERF STATE
// ============================================================================================
// Four things can have an opinion about which effects run: the URL, localStorage, the
// auto-detector, and the person holding the device. This module is where those four are
// reconciled into ONE answer, and it is the only place that answer is written to the page.
//
// PRECEDENCE, highest first. Each rung can only be overruled by something MORE explicit:
//
//   1. ?fxoff= / ?fxon=          per-effect, from the address bar. Also what the benchmark emits
//                                as a reload-based repro, so it has to beat everything.
//   2. stored per-effect switches the panel's toggles. A person flipped this by hand.
//   3. ?profile= / ?intensity=   a whole configuration, from the address bar.
//   4. stored profile            a person chose this from the panel, on this device.
//   5. auto-detected             1.8 seconds of frame times. A guess, and treated as one.
//   6. full                      the site as designed.
//
// Rungs 1–4 are all "explicit choice", which is why none of them can be touched by rung 5: the
// auto-detector checks `autoArmed()` and stands down entirely if anything above it has spoken.
// That is the requirement, stated plainly — a visitor's choice is never overridden by a later
// measurement.
//
// RESOLUTION IS A PURE FUNCTION of that state, and its only output is the set of `fx-off-<id>`
// root classes plus `.calm`. No parallel channel, no second stylesheet, no component holding its
// own copy. Everything downstream — the panel's switches, useFx's subscriptions, the benchmark's
// snapshot/restore, the JSON export — reads the same classes back off <html>.

export type FxSource = 'url' | 'stored' | 'manual' | 'auto' | 'default'

export type PerfState = {
  /** What the user or the URL asked for. 'auto' defers to `detected`. */
  profile: ProfileId | 'auto'
  /** The auto-detector's verdict, or null if it has not run / was not armed. */
  detected: ProfileId | null
  /** Why the applied profile is what it is. Recorded in the export. */
  source: FxSource
  /** Per-effect overrides. true = force ON, false = force OFF. Beats the profile either way. */
  overrides: Overrides
  /** Per-effect overrides from ?fxoff= / ?fxon=. Never persisted — a URL is per-visit. */
  urlOverrides: Overrides
  /** The master dial, 0..1. */
  intensity: number
  /**
   * Whether the dial position came from a PERSON (the knob, the panel slider, the mini-bar chip,
   * ?intensity=) rather than from a profile's cap.
   *
   * It exists because the dial now retires effects as well as scaling them, which made the
   * profile control dishonest in one direction: choosing Lean pulls the dial to 0.35, and
   * choosing Full afterwards left it there, so a segmented control labelled "everything on, as
   * designed" resolved to a page with eight effects still switched off. A profile may move a dial
   * it set itself; it may only ever clamp DOWN one that someone chose.
   */
  intensityByHand: boolean
  /** The auto-detector's full reasoning, for the export. */
  verdict: Verdict | null
}

let state: PerfState = {
  profile: 'auto',
  detected: null,
  source: 'default',
  overrides: {},
  urlOverrides: {},
  intensity: FX_DEFAULT,
  intensityByHand: false,
  verdict: null,
}

let initialised = false

const listeners = new Set<() => void>()

export function subscribePerfState(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function perfState(): Readonly<PerfState> {
  return state
}

/** Which profile is actually in force right now. */
export function appliedProfile(): ProfileId {
  if (state.profile !== 'auto') return state.profile
  return state.detected ?? 'full'
}

export function appliedProfileDef(): Profile {
  return PROFILE_BY_ID[appliedProfile()]
}

/**
 * True while nothing more explicit than a measurement has spoken ABOUT THE PROFILE.
 *
 * This is exactly `profile === 'auto'` and deliberately does not consult `source`. Per-effect
 * overrides — stored or from ?fxoff= — do not disarm the detector, because they already outrank
 * whatever it decides at resolve time; disarming on them as well would mean that switching one
 * effect off by hand silently opted the device out of ever being measured. And `?profile=auto`
 * has to ARM detection rather than count as "the URL decided", which reading `source` here got
 * backwards.
 *
 * The detector calls this before it starts AND again before it applies, because a person can
 * choose a profile during the 3.5 second grace period and it would be absurd for a measurement
 * that began before they touched anything to overwrite it 900ms later.
 */
export function autoArmed(): boolean {
  return state.profile === 'auto'
}

// --------------------------------------------------------------------------------------------
// Resolution
// --------------------------------------------------------------------------------------------

/**
 * The full set of effects switched off right now, from state alone.
 *
 * THE PROFILE SETS THE BASELINE, THE DIAL SCALES WITHIN IT — one mechanism, not two. The profile
 * contributes a fixed set of ids; the dial contributes every id whose `minIntensity` threshold it
 * has fallen below, so turning it down retires effects in roughly cost order and 0 retires all of
 * them. Without this the dial would only fade the things that happen to read a variable, and
 * "0 = a clean page" would be false for every structural effect — the frosted cards would still
 * blur, the videos would still decode, the trail nodes would still be promoted.
 *
 * The comparison is against the DIAL POSITION, not the multiplier, so a threshold in the registry
 * reads directly as a position on the control a person is holding. Note that the default (0.6)
 * sits above every threshold in the registry: nothing is retired until the dial is turned down.
 */
export function resolveOff(s: Readonly<PerfState> = state): FxId[] {
  // `auto` resolves to `full`, NOT to whatever was detected. Detection is advisory — see
  // setDetectedProfile. This is the single line that decides whether a frame-time measurement is
  // allowed to rewrite the page, and it is not.
  const profile = PROFILE_BY_ID[s.profile === 'auto' ? 'full' : s.profile]
  const off = new Set<FxId>(profile.off)
  for (const id of ALL_FX_IDS) {
    if (s.intensity <= FX_BY_ID[id].minIntensity) off.add(id)
  }
  // THE FLOOR IS STILL CLUB HUMIDITY. Neither of the two AUTOMATIC mechanisms above may retire an
  // essential effect, so no profile and no dial position can produce a static page. Both are
  // filtered here, in one place, rather than by pruning the profile lists and special-casing the
  // dial — those are two edits that must agree forever, and this is one that cannot drift.
  //
  // This runs BEFORE the override loops on purpose: an explicit per-effect toggle, from the panel
  // or from ?fxoff=, still wins. The benchmark ablates essentials by exactly that route, because
  // an effect that cannot be switched off cannot be measured, and `shader` and `kenBurns` are
  // among the things most worth measuring.
  for (const id of ALL_FX_IDS) if (FX_BY_ID[id].essential) off.delete(id)
  // Stored overrides first, URL overrides last: the address bar is the more explicit statement
  // and is how a stored choice gets debugged from outside without clearing it.
  for (const [id, on] of Object.entries(s.overrides) as Array<[FxId, boolean]>) {
    if (on) off.delete(id)
    else off.add(id)
  }
  for (const [id, on] of Object.entries(s.urlOverrides) as Array<[FxId, boolean]>) {
    if (on) off.delete(id)
    else off.add(id)
  }
  return ALL_FX_IDS.filter((id) => off.has(id))
}

/** Whether one specific effect is running, resolved the same way the classes are. */
export function isFxActive(id: FxId): boolean {
  return !resolveOff().includes(id)
}

// --------------------------------------------------------------------------------------------
// Applying
// --------------------------------------------------------------------------------------------
// HELD WHILE A BENCHMARK RUNS. runBench reconfigures the page every 3.7 seconds by writing root
// classes directly, and it restores the entry configuration in a finally block. If the
// auto-detector's 15-second re-measurement landed in the middle of that, it would apply a
// profile on top of a benchmark configuration, corrupt one row, and then be silently reverted by
// the restore — producing a number that nothing in the export could explain. So state changes
// are deferred rather than dropped: they land the moment the hold is released.

let held = 0
let dirtyWhileHeld = false

export function holdPerfState(): () => void {
  held++
  let released = false
  return () => {
    if (released) return
    released = true
    held--
    if (held === 0 && dirtyWhileHeld) {
      dirtyWhileHeld = false
      apply()
    }
  }
}

export function isPerfStateHeld(): boolean {
  return held > 0
}

function apply(): void {
  if (held > 0) {
    dirtyWhileHeld = true
    return
  }
  const root = document.documentElement
  const off = resolveOff()
  const wantCalm = appliedProfileDef().calm

  const hadCalm = root.classList.contains('calm')
  const hadSd = off.includes('hdRendition')

  applyFxOff(off)
  root.classList.toggle('calm', wantCalm)
  setIntensity(state.intensity)

  // videoRendition caches its HD/SD answer for the session and reads BOTH `.calm` and
  // `fx-off-hdRendition` off the root. Clearing the cache is what calmMode did when it latched,
  // and for the same reason: the decision deliberately does not swap the src of a playing clip,
  // so the change lands at the next scene or track change, which nobody perceives as a change.
  // (The benchmark pointedly does NOT do this — see applyConfig in bench.ts. It needs every row
  // to be measured under the same rendition, and `hdRendition` stays on the reload-required list
  // precisely so its rows are honest about that.)
  if (hadCalm !== wantCalm || hadSd !== off.includes('hdRendition')) refreshRenditionChoice()

  for (const fn of listeners) fn()
}

// --------------------------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------------------------

/**
 * Resolve every source and write the result to <html>. Called from main.tsx SYNCHRONOUSLY,
 * before React mounts.
 *
 * Doing this in an effect would paint one frame with every effect on before switching them off.
 * On the device that stored `minimal` last visit, that frame is the most expensive one of the
 * session and it is the first thing its owner sees.
 */
export function initPerfState(): Readonly<PerfState> {
  if (initialised) return state
  initialised = true

  const urlOverrides: Overrides = {}
  for (const id of PERF.fxOff) urlOverrides[id] = false
  for (const id of PERF.fxOn) urlOverrides[id] = true

  const storedProfile = readStoredProfile()
  const urlProfile = PERF.profile && isProfileId(PERF.profile) ? PERF.profile : PERF.profile === 'auto' ? 'auto' : null

  const profile: ProfileId | 'auto' = urlProfile ?? storedProfile ?? 'auto'
  const source: FxSource = urlProfile
    ? 'url'
    : storedProfile
      ? 'stored'
      : Object.keys(urlOverrides).length
        ? 'url'
        : 'default'

  // ?intensity= beats the stored dial beats whatever the site store defaults to. Note the
  // explicit null checks: 0 is the most meaningful value this can hold.
  const storedIntensity = readStoredIntensity()
  // A stored dial position only exists because something wrote one, and the only writers are the
  // three controls a person operates. So its presence IS the "chosen by hand" signal; no fourth
  // localStorage key is needed to carry it.
  const byHand = PERF.intensity !== null || storedIntensity !== null
  const asked = PERF.intensity ?? storedIntensity ?? getIntensity()
  // The profile's cap applies AT BOOT, by the same rule setProfile uses. Without this,
  // ?profile=minimal — and a stored `minimal` from a previous visit — left the dial at its
  // default: every effect off by class, yet --fx at 1 and the audio pump still writing at full
  // strength into rules that no longer render. Two states that should be identical
  // (?profile=minimal and ?intensity=0) would have differed in the one place a benchmark reads.
  const cap = PROFILE_BY_ID[profile === 'auto' ? 'full' : profile].intensityCap

  state = {
    profile,
    detected: null,
    source,
    overrides: readStoredOverrides(),
    urlOverrides,
    intensity: byHand ? Math.min(asked, cap) : Math.min(FX_DEFAULT, cap),
    intensityByHand: byHand,
    verdict: null,
  }

  apply()
  return state
}

// --------------------------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------------------------

/**
 * A profile chosen by a person. Persisted immediately, and it disarms auto-detection for good on
 * this device — not just for this session. Re-deciding on their behalf next visit is exactly the
 * behaviour this whole precedence ladder exists to prevent.
 */
export function setProfile(p: ProfileId | 'auto'): void {
  const cap = PROFILE_BY_ID[p === 'auto' ? (state.detected ?? 'full') : p].intensityCap
  state = {
    ...state,
    profile: p,
    source: 'manual',
    // ONE-SHOT, only here, and asymmetric on purpose.
    //
    // A dial nobody has touched belongs to the profile, so it is placed AT that profile's
    // position — the default look, capped — which means the ladder is reversible: Lean then Full
    // gets the site back, rather than leaving it quietly reduced under a control that says
    // "everything on". A dial someone has turned is only ever clamped DOWN, because choosing a
    // lighter profile can never make the page more expensive, and it stays free afterwards so
    // that wanting the look back under `lean` is not fought by a control that snaps out of your
    // fingers.
    intensity: state.intensityByHand ? Math.min(state.intensity, cap) : Math.min(FX_DEFAULT, cap),
  }
  writeStoredProfile(p)
  // ONLY a hand-set dial is persisted, and this is load-bearing rather than an optimisation: the
  // stored value's PRESENCE is what `intensityByHand` is reconstructed from at boot. Writing the
  // capped value here unconditionally would make every profile change look like a person turning
  // the knob on the next visit, and the reversibility above would survive exactly one reload.
  // With no stored value, initPerfState re-derives the same position from the stored profile.
  if (state.intensityByHand) writeStoredIntensity(state.intensity)
  apply()
}

/**
 * The auto-detector's verdict. Applied only while nothing more explicit has spoken, and only
 * DOWNWARDS — see autoProfile.ts for why an upgrade is never allowed.
 */
export function setDetectedProfile(v: Verdict): void {
  // RECORDED, NOT APPLIED. `detected` is a RECOMMENDATION: the panel shows it, the JSON export
  // carries it, and `resolveOff` deliberately ignores it (see the note there). Neither the
  // profile nor the dial is touched here, so a measurement can never restyle the page on its own.
  //
  // This used to clamp `intensity` to the detected profile's cap as well, which is how an
  // explicit `?intensity=1` came back as --fx 0.583 in testing: the URL was honoured and then
  // silently overwritten a few seconds later by a measurement nobody asked for.
  state = { ...state, detected: v.profile, verdict: v }
  apply()
}

/** One switch, flipped by hand. `undefined` clears the override back to whatever the profile says. */
export function setOverride(id: FxId, on: boolean | undefined): void {
  const overrides: Overrides = { ...state.overrides }
  if (on === undefined) delete overrides[id]
  else overrides[id] = on
  state = { ...state, overrides }
  writeStoredOverrides(overrides)
  apply()
}

/** The dial. Persisted, because it is a preference and not a measurement. */
export function setIntensityPref(v: number): void {
  const clamped = Math.max(0, Math.min(1, v))
  state = { ...state, intensity: clamped, intensityByHand: true }
  writeStoredIntensity(clamped)
  apply()
}

/**
 * Forget every stored choice and re-arm auto-detection.
 *
 * `detected` is deliberately KEPT — it is a measurement of this device and is still true. What
 * changes is that the page goes back to honouring it.
 */
export function resetPerfState(): void {
  clearStoredPerf()
  state = {
    ...state,
    profile: 'auto',
    overrides: {},
    source: state.detected ? 'auto' : 'default',
    // The dial is one of the three things Reset clears, so it has to come back HERE too, not just
    // in localStorage. Leaving it where a profile had put it meant the page stayed visibly
    // reduced while claiming to be back on the detected profile — and a reload would then have
    // looked different from what was on screen, which is the worst of both.
    intensity: FX_DEFAULT,
    intensityByHand: false,
  }
  apply()
}
