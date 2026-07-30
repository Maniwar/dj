import { PERF } from '../lib/perfFlags'
import { refreshRenditionChoice } from '../lib/videoRendition'
import { ALL_FX_IDS, FX_BY_ID, VIDEO_FX_IDS, type FxId } from './registry'
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
// AND THE ONE EXCEPTION, WHICH IS NOT AN EXCEPTION: ASKING FOR AUTO.
//
// `profile: 'auto'` means two different things and the difference is the whole of `autoChosen`:
//
//   nobody has said anything   the state a first visit boots in. Rung 6: the site as designed.
//                              A measurement taken here is ADVISORY — it is recorded, the panel
//                              shows it, the export carries it, and it does not touch the page.
//                              This is the behaviour that was reverted out of production once for
//                              silently stripping the glass and the lyric animation off healthy
//                              machines, and it must not change. See setDetectedProfile.
//   a person chose Auto        the mini bar's Auto rung, the panel's `auto` segment, or
//                              ?profile=auto. Rung 4: an explicit choice, exactly like choosing
//                              Lean, and what was chosen is "apply whatever you measure on this
//                              device". So it DOES reach the page, and it keeps reaching it — a
//                              later downgrade follows, because following is what was asked for.
//
// A measurement must never reach the page uninvited; a person asking for the measurement is the
// invitation. Both halves live in profileFor() below, which is the only function that decides
// which profile is in force.
//
// RESOLUTION IS A PURE FUNCTION of that state, and its only output is the set of `fx-off-<id>`
// root classes plus `.calm`. No parallel channel, no second stylesheet, no component holding its
// own copy. Everything downstream — the panel's switches, useFx's subscriptions, the benchmark's
// snapshot/restore, the JSON export — reads the same classes back off <html>.

export type FxSource = 'url' | 'stored' | 'manual' | 'auto' | 'default'

export type PerfState = {
  /** What the user or the URL asked for. 'auto' defers to `detected`, but only if `autoChosen`. */
  profile: ProfileId | 'auto'
  /**
   * Whether `profile: 'auto'` is a CHOICE rather than the absence of one.
   *
   * Only meaningful while `profile === 'auto'`, where it separates the two cases in the block
   * above: false is the un-chosen boot default (detection stays advisory), true means a person
   * asked for the measurement to be applied (it is, and it keeps being).
   *
   * It is a field of its own rather than being read off `source` because `source` cannot answer
   * the question: `?fxoff=cardGlass` on a fresh device leaves `profile: 'auto'` with
   * `source: 'url'`, and treating that as "they asked for auto" would let one per-effect flag
   * silently opt a device into being restyled by a measurement. `source` records which rung of
   * the ladder won; this records which of the two autos we are in.
   */
  autoChosen: boolean
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
   * it set itself. NOTE the asymmetry now only applies to the AUTOMATIC paths — setDetectedProfile
   * and boot — because an explicit rung tap PLACES the dial at that rung instead of clamping it;
   * see setProfile for why clamping there was the cursor-trail defect.
   */
  intensityByHand: boolean
  /** The auto-detector's full reasoning, for the export. */
  verdict: Verdict | null
  /**
   * Bumped whenever something makes the page MEASURABLY MORE EXPENSIVE than when it was last
   * judged, to license one further measurement.
   *
   * The one-way rule (autoProfile.ts) says a verdict may only ever move DOWN the ladder, and that
   * is what stops the oscillation. But it was written for a page whose cost is fixed after boot,
   * and the video button breaks that assumption: measure a device with video OFF and it is a page
   * with no decoders, which classifies healthy — then the video goes on and the page it certified
   * no longer exists. Auto had already spent its two windows and would never look again.
   *
   * So the epoch is not an exception to the one-way rule, it is the rule's missing input. Only
   * transitions that ADD cost bump it, so every re-measurement it licenses can still only move
   * downwards; turning video back OFF deliberately does not bump, because that is an upgrade and
   * upgrades are exactly what must never be automatic.
   */
  measureEpoch: number
}

let state: PerfState = {
  profile: 'auto',
  autoChosen: false,
  detected: null,
  source: 'default',
  overrides: {},
  urlOverrides: {},
  intensity: FX_DEFAULT,
  intensityByHand: false,
  verdict: null,
  measureEpoch: 0,
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

/**
 * WHICH PROFILE IS IN FORCE, from a state and nothing else. The one answer.
 *
 * Two functions used to decide this — this one and resolveOff — and fixing only resolveOff left
 * `.calm` still landing on a healthy desktop: no fx-off classes, glass intact, and yet the SD
 * video rendition and the hard-cut background, because the OTHER copy was still reading
 * `detected`. They cannot drift now: both call this, and it is pure so the panel and the report
 * can ask it about a state they are holding rather than about the module's.
 *
 * `auto` resolves to FULL unless a person asked for auto, in which case it resolves to the
 * measurement — the distinction in the block at the top of this file.
 *
 * NOTE THE `?? 'full'`: chosen-auto before any verdict is FULL, not something degraded. A device
 * is innocent until measured, and Auto's first 5.5 seconds are exactly that window. (It is also
 * what every reload looks like: the stored profile is `auto`, `detected` starts null again, and
 * the page must not boot into a guess it has not made yet.)
 */
function profileFor(s: Readonly<PerfState>): ProfileId {
  if (s.profile !== 'auto') return s.profile
  return s.autoChosen ? (s.detected ?? 'full') : 'full'
}

/** Which profile is actually in force right now. */
export function appliedProfile(): ProfileId {
  return profileFor(state)
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
 *
 * BOTH AUTOS ARE ARMED — `autoChosen` is not consulted either. The un-chosen default is measured
 * so the panel and the export have a recommendation to show; the chosen one is measured because
 * its whole purpose is to be measured. What `autoChosen` decides is what happens to the verdict
 * afterwards, not whether it is taken. That split is also what makes the round trip work: Lean by
 * hand disarms this, and choosing Auto again re-arms it — mid-session, which startAutoProfile
 * watches for, not only on the next load.
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
  // One answer to "which profile is in force", shared with the `.calm` class — see profileFor(),
  // which is where an un-chosen `auto` resolves to `full` because an uninvited measurement is
  // advisory, and a chosen one resolves to the measurement because that is what was asked for.
  const profile = PROFILE_BY_ID[profileFor(s)]
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
  // THE ONE PLACE THE TWO AUTOS ARE TOLD APART AT BOOT. `auto` reaching the page requires someone
  // to have SAID auto — typed ?profile=auto, or tapped the Auto rung on a previous visit, which is
  // what a stored 'auto' is a record of. Falling through to `'auto'` because the key is absent is
  // the other one: a first visit, which gets the site as designed and a measurement it can ignore.
  //
  // Storing 'auto' is therefore not the same as storing nothing, which is why Reset drops the key
  // rather than writing 'auto' into it — see resetPerfState.
  const autoChosen = profile === 'auto' && (urlProfile === 'auto' || storedProfile === 'auto')
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

  const booted: PerfState = {
    profile,
    autoChosen,
    detected: null,
    source,
    overrides: readStoredOverrides(),
    urlOverrides,
    intensity: asked,
    intensityByHand: byHand,
    verdict: null,
    // A stored video override is not a cost INCREASE relative to anything — there is no earlier
    // verdict on this load to invalidate. Boot always starts at epoch 0 and the first measurement
    // simply measures whatever the stored preference already put on the page.
    measureEpoch: 0,
  }
  // The profile's cap applies AT BOOT, by the same rule setProfile uses. Without this,
  // ?profile=minimal — and a stored `minimal` from a previous visit — left the dial at its
  // default: every effect off by class, yet --fx at 1 and the audio pump still writing at full
  // strength into rules that no longer render. Two states that should be identical
  // (?profile=minimal and ?intensity=0) would have differed in the one place a benchmark reads.
  //
  // Taken through profileFor rather than from `profile` directly so the dial cannot disagree with
  // the classes about which profile is in force. At boot they always agree that auto is Full
  // (`detected` is null this early, on a chosen auto as much as an un-chosen one), but a second
  // expression of the same rule is a second thing to keep in step, and this file has been bitten
  // by exactly that once already.
  const cap = PROFILE_BY_ID[profileFor(booted)].intensityCap

  state = { ...booted, intensity: byHand ? Math.min(asked, cap) : Math.min(FX_DEFAULT, cap) }

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
 *
 * `p === 'auto'` is the one value that RE-ARMS instead of disarming, and it is still a choice: it
 * says "apply whatever you measure here", so from this moment the verdict reaches the page and
 * keeps reaching it. That is the round trip the mini bar's fifth rung needs — Lean by hand, then
 * Auto, and the device is measured again rather than being stuck on a decision nobody made.
 */
export function setProfile(p: ProfileId | 'auto'): void {
  const chosen: PerfState = { ...state, profile: p, autoChosen: p === 'auto' }
  const cap = PROFILE_BY_ID[profileFor(chosen)].intensityCap
  state = {
    ...chosen,
    // WHO DECIDED, not who clicked. Choosing Auto on a device that has already been measured means
    // the applied profile came from the measurement, and labelling that "your choice" in the panel
    // and in the export would misattribute it — nobody chose Lean, the frame times did. Until
    // there is a verdict the answer really is the person, because Auto is Full until then.
    source: p === 'auto' && state.detected ? 'auto' : 'manual',
    // ONE-SHOT, and asymmetric on purpose.
    //
    // Applied here and — by the same rule, from the same expression — in setDetectedProfile when a
    // CHOSEN auto changes which profile is in force. That transition IS a profile change; it just
    // has a measurement rather than a thumb behind it, and a dial that stayed at the full-strength
    // position under an applied `lean` would be the exact dishonesty this clamp exists to stop.
    //
    // A dial nobody has touched belongs to the profile, so it is placed AT that profile's
    // position — the default look, capped — which means the ladder is reversible: Lean then Full
    // gets the site back, rather than leaving it quietly reduced under a control that says
    // "everything on". A dial someone has turned is only ever clamped DOWN, because choosing a
    // lighter profile can never make the page more expensive, and it stays free afterwards so
    // that wanting the look back under `lean` is not fought by a control that snaps out of your
    // fingers.
    // A RUNG TAP IS A STATEMENT ABOUT POSITION, so the dial is PLACED AT the rung rather than
    // merely clamped to it. Clamping was the reported defect: with a hand-set dial, `Math.min`
    // could only ever lower it, so tapping up the ladder left the dial stranded low -- pick Lean
    // (0.35), then pick Full, and Full resolved to a page with sixteen effects still retired
    // because --fx never came back up. Reported as the cursor trail not returning until the dial
    // was played with by hand, which is exactly what was required of it.
    //
    // Placing it makes the five rungs deterministic and reversible: each one is a named position,
    // tapping it twice is idempotent, and the label always describes the page. Auto keeps the old
    // expression because it is not a position -- it is a request to be measured, so it starts from
    // the designed look and the verdict moves it from there.
    intensity: p === 'auto' ? Math.min(FX_DEFAULT, cap) : cap,
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
 * The auto-detector's verdict. Recorded always; applied only to a CHOSEN auto, and only
 * DOWNWARDS — see autoProfile.ts for why an upgrade is never allowed.
 */
export function setDetectedProfile(v: Verdict): void {
  // RECORDED, AND APPLIED ONLY IF INVITED. `detected` is a RECOMMENDATION by default: the panel
  // shows it, the JSON export carries it, and profileFor() ignores it, so a measurement can never
  // restyle the page on its own. It shipped doing that once — twenty seconds after load a
  // perfectly healthy desktop silently acquired eighteen fx-off classes and `.calm` — and the
  // fix was not to measure less but to stop wiring the measurement straight to the page.
  //
  // The exception is the whole point of the Auto rung: if a person chose Auto, `profileFor` reads
  // `detected`, so simply writing it here lands it on the page, and a LATER downgrade lands too.
  // That is not the reverted behaviour returning by the back door — it is the same measurement
  // going through the front, with someone holding the door open.
  const before = appliedProfile()
  state = { ...state, detected: v.profile, verdict: v }
  const after = appliedProfile()

  // WHO DECIDED. On a chosen auto the answer is now the measurement whatever it says — including
  // when it says `full`, which is not the same fact as "nobody has measured anything yet" even
  // though the page looks identical. Set from the state rather than from `after !== before` so it
  // agrees with the identical expression in setProfile: both routes into "auto, with a verdict"
  // have to label the panel and the export the same way or the source line becomes a coin toss.
  if (state.profile === 'auto' && state.autoChosen) state = { ...state, source: 'auto' }

  if (after !== before) {
    // The applied profile just changed, so the profile's one-shot dial cap applies exactly as it
    // does in setProfile — see the long note there for why it is asymmetric.
    //
    // GATED ON THE APPLIED PROFILE CHANGING, which is what keeps the old bug fixed. This used to
    // clamp unconditionally, and that is how an explicit `?intensity=1` came back as --fx 0.583 in
    // testing: the URL was honoured and then silently overwritten a few seconds later by a
    // measurement nobody had asked for. An advisory verdict does not move `appliedProfile()`, so
    // it now cannot reach the dial either.
    const cap = PROFILE_BY_ID[after].intensityCap
    state = {
      ...state,
      intensity: state.intensityByHand ? Math.min(state.intensity, cap) : Math.min(FX_DEFAULT, cap),
    }
    // NOT PERSISTED, deliberately, unlike setProfile's clamp. What is stored is `auto`, and the
    // point of `auto` is that it is re-decided from a fresh measurement every visit; writing the
    // dial position a measurement implied would turn one afternoon's verdict into a preference
    // that outlives it — and, worse, would read back at boot as "a person turned this knob".
  }
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

// --------------------------------------------------------------------------------------------
// THE VIDEO BUTTON — on the ladder, not beside it
// --------------------------------------------------------------------------------------------
// The player's 🎬 button used to be `videoEnabled` in useSiteStore, ANDed into three components
// next to their `useFxOn` reads. That made it a FIFTH source of truth this file could not see, and
// the precedence ladder at the top — whose entire purpose is that a measurement never overrules a
// person — gave it no protection at all, because protection is something resolveOff() does and
// resolveOff() had never heard of it. Two consequences, both of which shipped:
//
//   `lean` contains sectionVideo and `minimal` contains everything, so auto reaching either killed
//   the video while `videoEnabled` stayed true. The button went on rendering `.on`, went on saying
//   "Video ON — tap for stills", and did nothing anyone could see. A control that lies about the
//   thing it controls.
//
//   `videoEnabled` was not persisted and the profile was. A stored `lean` therefore reloaded with
//   the button claiming ON over dead section videos, on every single visit.
//
// So the preference IS an override now — rung 2, "a person flipped this by hand", which
// resolveOff() already honours in BOTH directions and persist.ts already stores. Nothing new had to
// be invented for it to outrank a profile; it just had to stop being kept somewhere else.

/**
 * Whether video is actually on screen right now, resolved exactly as the classes are.
 *
 * The button reads THIS rather than a preference flag, which is what makes it honest: when auto or
 * the dial legitimately retires video on an untouched button, the button goes dark with it instead
 * of claiming a state the page is not in.
 */
export function videoOn(): boolean {
  return isFxActive('bcVideo')
}

/**
 * Whether a PERSON has said anything about video, as opposed to it merely defaulting to on.
 *
 * The presence of the override is the signal, exactly as the presence of a stored dial position is
 * what `intensityByHand` is reconstructed from at boot — no extra key, nothing that can fall out of
 * step with the thing it describes.
 *
 * This is the whole asymmetry, and it is the same one `autoChosen` draws for the profile:
 *
 *   untouched   video is on because that is the default. Auto may still retire it on a device that
 *               cannot afford it — which is the point of having a floor at all.
 *   tapped      video is on because someone asked for it. Auto may not take it away, at any
 *               profile, `minimal` included. It drops something else instead.
 */
export function videoByHand(): boolean {
  return state.overrides.bcVideo !== undefined
}

/**
 * The 🎬 button. Pins video on or off across both video ids, and licenses a re-measurement when
 * that makes the page more expensive.
 *
 * Both ids move together because the button has always meant "moving pictures or stills" as one
 * idea, and splitting them would give it a third state nobody asked for. `hdRendition` is
 * deliberately not among them — see VIDEO_FX_IDS.
 */
export function setVideoPreference(on: boolean): void {
  const overrides: Overrides = { ...state.overrides }
  for (const id of VIDEO_FX_IDS) overrides[id] = on
  state = {
    ...state,
    overrides,
    // ONLY ON THE WAY UP. Turning video on adds up to twelve decoders to a page whose verdict was
    // measured without them, so that verdict now describes a page that does not exist and one more
    // window is owed. Turning it off can only have made things cheaper, and a re-measurement there
    // could only ever argue for an upgrade — which is the oscillation the one-way rule exists to
    // prevent, so it is not licensed.
    measureEpoch: on ? state.measureEpoch + 1 : state.measureEpoch,
  }
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
 * changes is that the page goes back to treating it as ADVICE.
 *
 * So this lands on the UN-CHOSEN auto (`autoChosen: false`), not on the Auto rung, and the
 * difference is deliberate: Reset means "put this device back the way it arrived", and the way it
 * arrived is the site as designed with a measurement it is free to ignore. Choosing to be
 * measured is what the Auto rung on the FX button and the panel's `auto` segment are for.
 *
 * The alternative was tried on paper and is worse: since clearStoredPerf drops the key rather than
 * writing 'auto' into it, a Reset that applied the verdict would look nothing like the same
 * device one reload later — the two states this function is supposed to make identical.
 */
export function resetPerfState(): void {
  clearStoredPerf()
  state = {
    ...state,
    profile: 'auto',
    autoChosen: false,
    overrides: {},
    // 'auto' means "a measurement decided this", and after a Reset nothing measured has decided
    // anything: the page is Full because that is where an un-chosen auto sits.
    source: 'default',
    // The dial is one of the three things Reset clears, so it has to come back HERE too, not just
    // in localStorage. Leaving it where a profile had put it meant the page stayed visibly
    // reduced while claiming to be back on the detected profile — and a reload would then have
    // looked different from what was on screen, which is the worst of both.
    intensity: FX_DEFAULT,
    intensityByHand: false,
  }
  apply()
}
