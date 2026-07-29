import { ALL_FX_IDS, type FxId } from './registry'
import { getRefreshHz, type FrameStats } from './sampler'

// ============================================================================================
// PERFORMANCE PROFILES — four named points on one axis, and the rule for picking one
// ============================================================================================
// A profile is nothing more than a named set of registry ids. It has no mechanism of its own: it
// resolves to the same `fx-off-<id>` root classes that the panel writes and the benchmark
// measures, so a profile is reproducible as a URL, appears in the JSON export by id, and can be
// verified with `npm run verify:fx` like anything else. That is deliberate — the previous
// attempt at this (calmMode) was a second mechanism with its own class, its own sampler and its
// own latch, and the result was that nobody could say what `.calm` actually switched off.
//
// THE LADDER IS MONOTONE. Every profile's `off` set is a superset of the one above it. Two
// things depend on that: auto-detection is a one-way walk DOWN the ladder (see autoProfile.ts),
// and "is this device on a lighter profile than that one?" is answered by an index comparison
// rather than by set arithmetic.
//
// WHAT EACH STEP IS FOR — this is the hypothesis this whole harness was built to test, written
// as four configurations rather than as prose:
//
//   full      the site as designed.
//   balanced  every PER-PIXEL PASS OVER PLAYING VIDEO is gone (3 backdrop blurs, the strobe's
//             screen blend, the per-frame drop-shadow radius on the largest type) and NOTHING
//             ELSE is: every blend layer, all motion, all audio reactivity, both videos and the
//             shader stay. If the reported symptom is the video/effects interaction, this is the
//             step that fixes it, and it costs almost nothing visible.
//   lean      additionally drops the blend layers, the promoted background textures and the
//             section videos — but KEEPS the mainstage video and the shader, because the manual
//             bisect established that video alone and the shader alone are both smooth. A
//             profile that removed them first would be optimising the thing that was measured
//             innocent.
//   minimal   everything. Also what the master intensity dial reaches at 0, which is the
//             accessibility escape hatch as much as it is the performance floor.

export const PROFILES = ['full', 'balanced', 'lean', 'minimal'] as const
export type ProfileId = (typeof PROFILES)[number]

export type Profile = {
  id: ProfileId
  label: string
  /** One line, shown under the segmented control. Read on a tablet, so no jargon. */
  blurb: string
  off: readonly FxId[]
  /**
   * The dial is CLAMPED to this when the profile CHANGES, and never at any other time.
   *
   * A continuous clamp would fight the user: dragging the slider up under `lean` would snap back
   * every time and the control would read as broken. A one-shot clamp says the useful thing —
   * choosing a lighter profile can only ever make the page cheaper — while leaving the dial free
   * afterwards for someone who has deliberately decided they want the look back.
   *
   * These are DIAL POSITIONS, and they were re-expressed when the dial's response curve landed:
   * the shipped look now sits at 0.6 rather than at 1.0, so the caps below are the positions that
   * produce the multipliers these profiles were originally specified with (1.0 / 0.83 / 0.58 / 0)
   * rather than the raw numbers, which on the new curve would have been no cap at all.
   */
  intensityCap: number
  /**
   * Whether to set `.calm` on <html>.
   *
   * `.calm` is NOT a duplicate of the ids below, which is why it survived the deletion of
   * calmMode.ts. Two of its seventeen rules do something no registry id expresses: `.bc-frame`
   * loses its overscan and its promotion, and `display: none` takes the INACTIVE background
   * frame out of the layer tree entirely. That pair roughly halves resident background texture
   * memory, which is the documented fix for the Android layer-eviction flicker — a memory
   * problem, not a paint-cost problem, and therefore not something an fx-off switch describes.
   * It also drops the video to the SD rendition via videoRendition.ts, which already reads it.
   */
  calm: boolean
}

/** Per-pixel passes over playing video. The specific hypothesis, expressed as a set. */
const BALANCED_OFF: FxId[] = [
  'cardGlass', // 24 backdrop blurs re-blurring a dirty (video) backdrop every frame
  'playerGlass', // a backdrop blur pinned over the footage, plus two infinite sweeps on top
  'blurFills', // blur(7px)/blur(48px) letterbox fills, only past 2.5:1 but huge where they exist
  'bcStrobe', // full-screen screen-blend with a per-frame opacity — uncacheable by construction
  'beatFilter', // per-frame drop-shadow RADIUS on the largest gradient-clipped type on the page
]

const LEAN_OFF: FxId[] = [
  ...BALANCED_OFF,
  'shaderBlend', // the full-viewport readback; the canvas itself stays
  'bcGrain',
  'bcScan',
  'bcGlitchCut',
  'kenBurns', // 13 permanently-promoted ~6.5Mpx textures, drifting and beat-scaled
  'goldSheen',
  'lyricLetters',
  'beatShadow',
  'sectionCut',
  'player3d',
  'cursorFx', // 104 promoted .glow-trail nodes + 3 screen blends; desktop/Surface only
  'hdRendition',
  'sectionVideo', // up to 11 further decoders; the MAINSTAGE video deliberately stays
]

export const PROFILE_LIST: readonly Profile[] = [
  {
    id: 'full',
    label: 'Full',
    blurb: 'Everything on, as designed.',
    off: [],
    intensityCap: 1,
    calm: false,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Drops the blur passes over the video. Almost nothing looks different.',
    off: BALANCED_OFF,
    intensityCap: 0.5,
    calm: false,
  },
  {
    id: 'lean',
    label: 'Lean',
    blurb: 'Blends, background drift and the section videos go. Mainstage video and light rig stay.',
    off: LEAN_OFF,
    intensityCap: 0.35,
    calm: true,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    blurb: 'Every effect off. A clean page — also the reduced-motion setting.',
    off: [...ALL_FX_IDS],
    intensityCap: 0,
    calm: true,
  },
] as const

export const PROFILE_BY_ID = Object.fromEntries(PROFILE_LIST.map((p) => [p.id, p])) as Record<
  ProfileId,
  Profile
>

export function isProfileId(v: string): v is ProfileId {
  return (PROFILES as readonly string[]).includes(v)
}

/** Position on the ladder. Higher = lighter. Used to compare, and to step down by exactly one. */
export function profileIndex(id: ProfileId): number {
  return PROFILES.indexOf(id)
}

/** The lighter of two profiles. Auto-detection may only ever move in this direction. */
export function worseOf(a: ProfileId, b: ProfileId): ProfileId {
  return profileIndex(a) >= profileIndex(b) ? a : b
}

// ============================================================================================
// CLASSIFICATION — the tail, corroborated; never a mean
// ============================================================================================
// This is the part the previous attempt got wrong, and it is worth being precise about how.
//
// calmMode latched on the fraction of frames slower than 26ms averaged over 900ms. On the two
// devices that actually have the problem it NEVER FIRED, because the page held a clean 60fps
// average while visibly stuttering — the stutter lived in one frame in twenty, which a ratio
// against a 40% threshold cannot see and a mean cannot see at all.
//
// So the decision is made on p95, and then corroborated by three independent signals that fail
// in different ways. Any one of them can make the verdict worse; none can make it better:
//
//   p95            the headline. What one frame in twenty costs — which is what a person
//                  perceives as a stutter, because a stutter IS the tail.
//   p99            catches a page that is mostly fine and hitches hard. A clean p95 with a p99
//                  over 80ms is a device that will feel broken every second or two.
//   long-task time the frame timings' blind spot: while the main thread is blocked, rAF simply
//                  does not fire, so a 300ms block can appear as ONE long delta and barely move
//                  a percentile computed over a few hundred samples.
//   dropped frames the only refresh-aware term. It is computed in the sampler against the
//                  MEASURED panel rate, so a 120Hz tablet missing half its frames is caught even
//                  though 20ms of frame time looks respectable in absolute terms.
//
// The p95 thresholds themselves are absolute milliseconds on purpose. Stutter perception is
// absolute — 50ms reads as a hitch whether the panel refreshes at 60Hz or 120Hz — and scaling
// them by the refresh rate would have made a 120Hz device demand 8ms frames before it was
// allowed to run the site as designed. The refresh rate enters through droppedFrac instead,
// where it belongs.

/** p95 in ms. At or below each bound → that profile. Above the last → minimal. */
export const P95_BOUNDS = { full: 20, balanced: 30, lean: 50 } as const

export type Verdict = {
  profile: ProfileId
  /** Which signal decided it. Goes into the export so a surprising downgrade is explicable. */
  reason: string
  p95: number
  p99: number
  longTaskMs: number
  droppedFrac: number
}

export function classify(s: FrameStats): Verdict {
  const droppedFrac = s.frames > 0 ? s.droppedApprox / s.frames : 0
  const ltShare = s.durationMs > 0 ? s.longTaskMs / s.durationMs : 0

  let idx = s.p95 <= P95_BOUNDS.full ? 0 : s.p95 <= P95_BOUNDS.balanced ? 1 : s.p95 <= P95_BOUNDS.lean ? 2 : 3
  let reason = `p95 ${s.p95.toFixed(1)}ms`

  const worsen = (to: number, why: string) => {
    if (to > idx) {
      idx = to
      reason = why
    }
  }
  if (s.p99 > 80) worsen(2, `p99 ${s.p99.toFixed(0)}ms — hitches hard even though p95 is ${s.p95.toFixed(0)}ms`)
  else if (s.p99 > 45) worsen(1, `p99 ${s.p99.toFixed(0)}ms`)

  if (ltShare > 0.25) worsen(2, `${Math.round(ltShare * 100)}% of the window was inside long tasks`)
  else if (ltShare > 0.1) worsen(1, `${Math.round(ltShare * 100)}% of the window was inside long tasks`)

  if (droppedFrac > 0.5) worsen(2, `dropping ${Math.round(droppedFrac * 100)}% of frames at ${getRefreshHz()}Hz`)
  else if (droppedFrac > 0.25) worsen(1, `dropping ${Math.round(droppedFrac * 100)}% of frames at ${getRefreshHz()}Hz`)

  return {
    profile: PROFILES[idx],
    reason,
    p95: s.p95,
    p99: s.p99,
    longTaskMs: s.longTaskMs,
    droppedFrac: Math.round(droppedFrac * 1000) / 1000,
  }
}
