import { APP_VERSION, BUILD_SHA, BUILD_STAMP } from '../version'
import { PERF } from '../lib/perfFlags'
import { prefersHdVideo } from '../lib/videoRendition'
import { usePlayerStore } from '../state/usePlayerStore'
import { audioBus } from '../audio/audioBus'
import { FX, type FxId } from './registry'
import { readFxOff, RELOAD_REQUIRED, fxUrl } from './fxClasses'
import {
  appliedProfile,
  appliedProfileDef,
  perfState,
  videoByHand,
  videoOn,
  type FxSource,
} from './fxState'
import type { ProfileId, Verdict } from './profiles'
import { getIntensity, getFxMultiplier, FX_DEFAULT } from './intensity'
import { deviceInfo, deviceSlug, type DeviceInfo } from './deviceInfo'
import { analyse, type Analysis, type BenchRun } from './bench'

// ============================================================================================
// THE FILE THE USER SENDS BACK
// ============================================================================================
// This is the actual deliverable. Everything else in src/perf exists so that this file can be
// produced on a Samsung tablet, downloaded, and mailed to someone who cannot reproduce the
// problem on any machine they own.
//
// So it is SELF-DESCRIBING. The registry ships inside it — every id that appears in `runs` or
// `analysis` is defined in the same file, with the reason that effect is expensive written out in
// prose. The metric is named. The caveats are spelled out. A reader who has never opened this
// repository can read the file top to bottom and reach the same conclusion the panel showed,
// which is the difference between a report and a pile of numbers.

export const SCHEMA = 'clubhumidity.perf/1'

export type PerfReport = {
  schema: typeof SCHEMA
  generatedAt: string
  build: { version: string; sha: string; stamp: string }
  device: DeviceInfo
  session: {
    url: string
    /** The URL that reproduces the CURRENT switch positions on a fresh load. */
    reproUrl: string
    legacyFlags: { live: string[]; freeze: string; nofx: string; isMobile: boolean }
    fxOff: FxId[]
    /** Switches this build cannot honour without a reload. Empty once the components subscribe. */
    reloadRequired: FxId[]
    profile: {
      /** What the auto-detector measured, whether or not it was allowed to apply it. */
      detected: ProfileId | null
      /** What is actually in force. */
      applied: ProfileId
      /** What was ASKED for — 'auto' means the applied value came from measurement. */
      requested: ProfileId | 'auto'
      /** Which rung of the precedence ladder won. */
      source: FxSource
      /** Which effects that profile switches off, so `fxOff` can be attributed. */
      profileOff: FxId[]
      /** Per-effect overrides in force, true = forced ON. Stored ones and URL ones separately. */
      overrides: Partial<Record<FxId, boolean>>
      urlOverrides: Partial<Record<FxId, boolean>>
      /** The detector's numbers and the signal that decided, in prose. */
      verdict: Verdict | null
    }
    /** Dial position, 0..1 — what the control shows and what minIntensity is compared against. */
    intensity: number
    /** What the effects were scaled by, 0..1.4. 1.0 is the site as tuned. */
    intensityMultiplier: number
    /** The dial position that maps to a multiplier of 1, so the two above can be related. */
    intensityDefault: number
    calmLatched: boolean
    audioPlaying: boolean
    trackSlug: string | null
    /** Video as RESOLVED — the `bcVideo` class, not a preference that could disagree with it. */
    videoEnabled: boolean
    /** Whether a person pinned that, as opposed to it being the default or the ladder's doing. */
    videoByHand: boolean
    /**
     * How many times the page has been made more expensive since load, each of which licensed the
     * detector one further measurement. Non-zero next to a `full` verdict is the signal that the
     * verdict describes a cheaper page than the one these rows were measured on.
     */
    measureEpoch: number
    renditionHd: boolean
  }
  registry: Array<{
    id: FxId
    label: string
    group: string
    cost: number
    kind: string
    minIntensity: number
    why: string
    targets: string
  }>
  runs: BenchRun[]
  analysis: Analysis
  notes: string
}

export function buildReport(runs: BenchRun[], notes = ''): PerfReport {
  const dev = deviceInfo()
  const off = [...readFxOff()]
  const ps = perfState()
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    build: { version: APP_VERSION, sha: BUILD_SHA, stamp: BUILD_STAMP },
    device: dev,
    session: {
      url: location.href,
      reproUrl: fxUrl(off),
      legacyFlags: {
        live: [...PERF.live],
        freeze: PERF.freeze,
        nofx: PERF.nofx,
        isMobile: PERF.isMobile,
      },
      fxOff: off,
      reloadRequired: [...RELOAD_REQUIRED],
      // WHY the page was in this configuration, not just what it was. A file that says "cardGlass
      // was off" is ambiguous between "the visitor switched it off", "the profile they chose does
      // that" and "we measured this device at p95 61ms and decided for them" — and the three lead
      // to completely different conclusions about the numbers underneath.
      profile: {
        detected: ps.detected,
        applied: appliedProfile(),
        requested: ps.profile,
        source: ps.source,
        profileOff: [...appliedProfileDef().off],
        overrides: { ...ps.overrides },
        urlOverrides: { ...ps.urlOverrides },
        verdict: ps.verdict,
      },
      // BOTH numbers. `intensity` is the dial position (what the knob and the slider show, and
      // what the registry's minIntensity thresholds are compared against); `intensityMultiplier`
      // is what the effects were actually scaled by, which is the one that explains the pixels.
      // They are not equal — 0.6 maps to 1.0 — and a report carrying only one of them would be
      // read wrong by whoever opens it.
      intensity: getIntensity(),
      intensityMultiplier: getFxMultiplier(),
      intensityDefault: FX_DEFAULT,
      calmLatched: document.documentElement.classList.contains('calm'),
      audioPlaying: audioBus.playing,
      trackSlug: usePlayerStore.getState().currentTrackSlug,
      // Read off the resolved state rather than out of the site store, which no longer has an
      // opinion about video. An export that disagreed with the page about whether video was
      // playing would misattribute every row measured under it.
      videoEnabled: videoOn(),
      videoByHand: videoByHand(),
      measureEpoch: perfState().measureEpoch,
      renditionHd: prefersHdVideo(),
    },
    // Embedded in full, not by reference. The `why` strings are the difference between "cardGlass
    // is the worst row" and "24 backdrop-filter blurs re-blur a dirty backdrop every frame".
    registry: FX.map((f) => ({
      id: f.id,
      label: f.label,
      group: f.group,
      cost: f.cost,
      kind: f.kind,
      minIntensity: f.minIntensity,
      why: f.why,
      targets: f.targets,
    })),
    runs,
    analysis: analyse(runs),
    notes,
  }
}

/**
 * `clubhumidity-perf_263b43d_sm-x910_20260728T091402.json`
 *
 * Build sha, device and timestamp, in that order, because that is the order two files need to be
 * told apart in: same device different build, or same build different device.
 */
export function reportFilename(r: PerfReport): string {
  const ts = r.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, '')
  return `clubhumidity-perf_${r.build.sha}_${deviceSlug(r.device)}_${ts}.json`
}

export function reportJson(r: PerfReport): string {
  // Indented. It is read by a person before it is read by anything else, and the file is ~40KB
  // either way.
  return JSON.stringify(r, null, 2)
}

/**
 * A real file download, via Blob + <a download>.
 *
 * Android Chrome will not open a data: URI as a download and will not save a JSON response it did
 * not fetch, so the blob URL is the only route that reliably lands in the tablet's Downloads
 * folder — which is where it has to be, because the tablet is the device with the problem and its
 * owner has to be able to attach the file to a message.
 */
export function downloadReport(r: PerfReport): string {
  const name = reportFilename(r)
  const blob = new Blob([reportJson(r)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Revoking synchronously races the download on some Android builds; one turn of the event loop
  // is enough and the blob is a few tens of KB.
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 4000)
  return name
}

/**
 * Clipboard, with the ancient fallback deliberately kept.
 *
 * navigator.clipboard is undefined outside a secure context, and the tablet is routinely tested
 * against a LAN dev server over plain http — which is exactly the situation in which losing the
 * export would be most annoying.
 */
export async function copyReport(r: PerfReport): Promise<boolean> {
  const text = reportJson(r)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through — a rejected permission is not a reason to give up */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
