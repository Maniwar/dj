import { audioBus } from '../audio/audioBus'
import { ALL_FX_IDS, FX, FX_BY_ID, VIDEO_FX_IDS, type FxId } from './registry'
import { applyFxOff, readFxOff, unhonoured } from './fxClasses'
import { holdPerfState } from './fxState'
import { getIntensity, setIntensity } from './intensity'
import { SampleWindow, domCensus, type FrameStats } from './sampler'

// ============================================================================================
// THE BENCHMARK — an ablation matrix, run on the device that has the problem
// ============================================================================================
// The manual bisect that produced this project's one solid clue took days and established a
// single sentence: video alone is smooth, effects alone are smooth, video WITH effects crawls.
// That sentence is not a finding, it is a shape — it says the cost is SUPERADDITIVE, which is
// exactly the case where testing one effect at a time finds nothing. So the matrix is built to
// measure the shape directly:
//
//     interactionMs = p95(both) − p95(video) − p95(effects) + p95(floor)
//
// which is the standard 2x2 factorial interaction term. If it is near zero the costs simply add
// up and the expensive effect can be found by ablation. If it is large and positive, the pair is
// the problem and no single-effect ablation will ever find it — which would explain every
// previous round of this investigation.
//
// The four legs run ADJACENTLY IN TIME so that a device warming up cannot fabricate the result,
// and the `full` matrix re-runs the whole quick block in reverse afterwards so that thermal drift
// shows up as a reported number rather than as a conclusion.

export type BenchLeg = 'floor' | 'video' | 'effects' | 'both'
export type MatrixId = 'quick' | 'full' | 'manual'

export type BenchConfig = {
  id: string
  label: string
  off: FxId[]
  intensity: number
  leg?: BenchLeg
}

export type BenchConfigResult = {
  config: BenchConfig
  stats: FrameStats
  /**
   * Ids in `config.off` that the root class alone does not honour on this build. Empty is the
   * goal; non-empty means this row measured strictly MORE than it claims to, and every consumer
   * — the panel, the analysis, the export — has to say so rather than quietly averaging it in.
   */
  unhonoured: FxId[]
  /** True when the first window was invalid and this is the retry. */
  retried: boolean
}

export type BenchRun = {
  matrix: MatrixId
  startedAt: string
  settleMs: number
  sampleMs: number
  configs: BenchConfigResult[]
  /** Set when maxMs or Abort cut the run short. Partial results are kept, never discarded. */
  abortedEarly?: boolean
}

// --------------------------------------------------------------------------------------------
// Timing
// --------------------------------------------------------------------------------------------
// SETTLE is discarded, and it is not optional. Switching a configuration creates and destroys
// compositor layers, recompiles nothing but re-rasterises plenty, and produces a one-off spike of
// 50-200ms. Sampled, that spike would own p99 for every row and the matrix would rank
// configurations by how disruptive they were to APPLY rather than by what they cost to RUN.
const SETTLE_MS = 700
// 3s at 60Hz is ~180 frames, so p95 is the 171st value and p99 the 179th. Below about 100 frames
// p99 is a single sample and is noise; above ~5s the full matrix stops fitting in the window a
// person will hold a tablet still for.
const SAMPLE_MS = 3000
// Shared with the player's 🎬 button rather than restated here. The headline legs of this
// benchmark and that button have to mean the same thing by "the video", or `effects-only` would be
// measuring a page the visitor could not actually produce.
const VIDEO_IDS: readonly FxId[] = VIDEO_FX_IDS

export type BenchProgress = {
  index: number
  total: number
  config: BenchConfig
  phase: 'settle' | 'sample' | 'census' | 'retry'
  elapsedMs: number
}

export type BenchOptions = {
  matrix: 'quick' | 'full'
  settleMs?: number
  sampleMs?: number
  /** Hard ceiling. Blowing it exports what has been measured so far rather than losing it. */
  maxMs?: number
  onProgress?: (p: BenchProgress) => void
  signal?: { aborted: boolean }
}

// --------------------------------------------------------------------------------------------
// The matrix
// --------------------------------------------------------------------------------------------

function everythingExcept(keep: readonly FxId[]): FxId[] {
  const k = new Set(keep)
  return ALL_FX_IDS.filter((id) => !k.has(id))
}

/**
 * Eight configurations, ~3.7s each, ~40 seconds total.
 *
 * `baseline` is whatever the page was already in when Run was pressed, so a user who has been
 * flipping switches by hand gets their own state measured rather than a reset one. Everything
 * after it is absolute, not relative to baseline — a matrix defined relative to a state the user
 * can change is a matrix whose rows cannot be compared between two exported files.
 */
export function quickMatrix(baselineOff: FxId[], intensity: number): BenchConfig[] {
  return [
    { id: 'baseline', label: 'As loaded', off: [...baselineOff], intensity },
    { id: 'floor', label: 'Everything off', off: [...ALL_FX_IDS], intensity: 0, leg: 'floor' },
    {
      id: 'video-only',
      label: 'Video, no effects',
      off: everythingExcept(VIDEO_IDS),
      intensity: 0,
      leg: 'video',
    },
    { id: 'effects-only', label: 'Effects, no video', off: [...VIDEO_IDS], intensity, leg: 'effects' },
    { id: 'video-plus-effects', label: 'Video + effects', off: [], intensity, leg: 'both' },
    {
      id: 'no-blur',
      label: 'No backdrop blur',
      off: ['cardGlass', 'playerGlass', 'blurFills'],
      intensity,
    },
    {
      id: 'no-blend',
      label: 'No blend layers',
      off: ['shaderBlend', 'bcStrobe', 'bcScan', 'bcGrain', 'cursorFx'],
      intensity,
    },
    {
      id: 'no-audio-css',
      label: 'No audio-reactive CSS',
      off: ['beatFilter', 'beatShadow', 'beatBoxShadow', 'beatTransform', 'beatLift', 'audioPump'],
      intensity,
    },
  ]
}

/**
 * The quick block, then every cost>=2 effect ablated one at a time, then the quick block again in
 * reverse. ~42 configurations, ~2.6 minutes.
 *
 * BOTH DIRECTIONS, on purpose:
 *   solo-off-<id>  removes one effect from a full page   — "does taking this away help?"
 *   solo-on-<id>   adds one effect to the bare floor     — "does having this hurt?"
 *
 * They agree when an effect has an independent cost, and they DISAGREE exactly when the effect is
 * only expensive in company. The disagreement is the diagnostic, which is why both numbers are
 * reported per effect rather than averaged into one.
 */
export function fullMatrix(baselineOff: FxId[], intensity: number): BenchConfig[] {
  const quick = quickMatrix(baselineOff, intensity)
  const solo: BenchConfig[] = []

  for (const fx of FX) {
    if (fx.cost < 2) continue
    solo.push({
      id: `solo-off-${fx.id}`,
      label: `Everything but ${fx.label}`,
      off: [fx.id],
      intensity,
    })
  }
  for (const fx of FX) {
    // Only the cost-3 effects get an additive leg. Adding a cheap effect to a bare floor moves
    // p95 by less than the run-to-run noise, so the row would cost 3.7 seconds to produce a
    // number indistinguishable from zero.
    if (fx.cost < 3) continue
    solo.push({
      id: `solo-on-${fx.id}`,
      label: `Only ${fx.label}`,
      off: everythingExcept([fx.id]),
      intensity,
    })
  }

  const reverse = [...quick].reverse().map((c) => ({ ...c, id: `${c.id}-r`, label: `${c.label} (re-run)` }))
  return [...quick, ...solo, ...reverse]
}

// --------------------------------------------------------------------------------------------
// Preconditions
// --------------------------------------------------------------------------------------------

/**
 * Blocking problems, in plain English, or an empty array.
 *
 * These are refused rather than worked around. The obvious "helpful" behaviour — start playback
 * if it is not playing — is the exact thing that must not happen: autoplay is blocked without a
 * gesture on both target devices, so the runner would silently produce a matrix in which every
 * audio-driven configuration measured a page with no audio, and the numbers would look clean and
 * mean nothing.
 */
export function benchPreconditions(): string[] {
  const problems: string[] = []
  if (!audioBus.playing) problems.push('Press play first — the audio-reactive effects only cost anything while music is playing.')
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    problems.push('Bring this tab to the front.')
  }
  return problems
}

// --------------------------------------------------------------------------------------------
// The runner
// --------------------------------------------------------------------------------------------

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

function applyConfig(c: BenchConfig): void {
  applyFxOff(c.off)
  setIntensity(c.intensity)
  // Deliberately NOT calling refreshRenditionChoice(). It re-decides the video rendition, which
  // lands at the next scene change — i.e. at an unpredictable point inside some later window —
  // and would make one row in the matrix quietly different from its neighbours. hdRendition is
  // already declared reload-required for exactly this reason.
}

export async function runBench(opts: BenchOptions): Promise<BenchRun> {
  const settleMs = opts.settleMs ?? SETTLE_MS
  const sampleMs = opts.sampleMs ?? SAMPLE_MS
  const maxMs = opts.maxMs ?? (opts.matrix === 'quick' ? 120_000 : 420_000)

  const entryOff = [...readFxOff()]
  const entryIntensity = getIntensity()
  const restore = () => {
    applyFxOff(entryOff)
    setIntensity(entryIntensity)
  }
  // The benchmark writes root classes DIRECTLY and never touches the persisted perf state — a
  // matrix that mutated a stored preference 42 times would leave the device configured by
  // whichever row happened to run last. The hold is the other half of that contract: it defers
  // any state change (an auto-profile downgrade is the realistic one, since the detector
  // re-measures at T+15s) until the run is over, so a profile cannot land on top of a benchmark
  // configuration, corrupt one row, and then be silently reverted by the restore below.
  const releaseHold = holdPerfState()
  // The page must not be left in a benchmark configuration if the tab is closed or reloaded
  // mid-run — the classes would persist for exactly as long as the document does, but a reload
  // during a run is also the most likely moment for someone to conclude the site is broken.
  window.addEventListener('beforeunload', restore)

  const configs =
    opts.matrix === 'quick'
      ? quickMatrix(entryOff, entryIntensity)
      : fullMatrix(entryOff, entryIntensity)

  const run: BenchRun = {
    matrix: opts.matrix,
    startedAt: new Date().toISOString(),
    settleMs,
    sampleMs,
    configs: [],
  }

  const startedAt = performance.now()
  try {
    // Put the reported symptom's habitat on screen: the lore band is a playing video with a
    // translucent panel and frosted cards over it, which is the one place all three suspects
    // overlap. Scroll is NOT locked — an accidental swipe should show up in the data as an
    // anomalous scrollY on one row, not be silently prevented in a way that makes the harness
    // behave differently from the site.
    document.querySelector('.lore-band')?.scrollIntoView({ block: 'center' })
    await wait(600)

    for (let i = 0; i < configs.length; i++) {
      if (opts.signal?.aborted || performance.now() - startedAt > maxMs) {
        run.abortedEarly = true
        break
      }
      const config = configs[i]
      const emit = (phase: BenchProgress['phase']) =>
        opts.onProgress?.({
          index: i,
          total: configs.length,
          config,
          phase,
          elapsedMs: performance.now() - startedAt,
        })

      applyConfig(config)
      // Two frames so React has committed any unmount the configuration implies before the
      // discarded settle period starts absorbing the layer churn it causes.
      await nextFrame()
      await nextFrame()

      emit('settle')
      await wait(settleMs)

      emit('census')
      const census = domCensus()

      emit('sample')
      let win = new SampleWindow(census)
      await wait(sampleMs)
      let stats = win.close()

      let retried = false
      if (!stats.valid && !opts.signal?.aborted) {
        // One retry, then keep the invalid result with its reason. A configuration that cannot be
        // measured on this device is data — usually it means the tab lost focus, which is worth
        // knowing about a device whose owner is holding it.
        retried = true
        emit('retry')
        await wait(300)
        win = new SampleWindow(census)
        await wait(sampleMs)
        stats = win.close()
      }

      run.configs.push({ config, stats, unhonoured: unhonoured(config.off), retried })
    }
  } finally {
    restore()
    window.removeEventListener('beforeunload', restore)
    // After restore(), so a deferred state change re-applies on top of the page the user had
    // rather than on top of the last configuration measured.
    releaseHold()
  }

  return run
}

// --------------------------------------------------------------------------------------------
// Analysis
// --------------------------------------------------------------------------------------------

export type Analysis = {
  /** Stated in the file so nobody reading it later assumes these are averages. They are not. */
  metric: 'p95FrameMs'
  rankedByP95: Array<{ config: string; label: string; p95: number; deltaVsFloor: number | null; valid: boolean }>
  interaction: {
    floorP95: number
    videoOnlyP95: number
    effectsOnlyP95: number
    bothP95: number
    interactionMs: number
    /** The same sentence the panel prints, so the file needs no interpretation. */
    verdict: string
  } | null
  worstEffects: Array<{
    id: FxId
    label: string
    cost: number
    /** p95(baseline) − p95(baseline without this effect). Positive = removing it helped. */
    soloOffGainMs: number | null
    /** p95(floor + this effect) − p95(floor). Positive = its presence costs. */
    soloOnCostMs: number | null
    /** The two disagree by more than 8ms — the signature of a cost that only exists in company. */
    divergent: boolean
  }>
  /** Mean p95 drift between the forward quick block and its reversed re-run. */
  thermalDriftMs: number | null
  /** Ids the run asked to switch off but could not, so their rows measured more than they claim. */
  unmeasured: FxId[]
  recommendedOff: FxId[]
  /** Anything a reader needs in order not to over-read the numbers above. */
  caveats: string[]
}

const p95Of = (r: BenchConfigResult | undefined) => (r && r.stats.valid ? r.stats.p95 : null)

function byId(run: BenchRun, id: string): BenchConfigResult | undefined {
  return run.configs.find((c) => c.config.id === id)
}

export function analyse(runs: BenchRun[]): Analysis {
  // Later runs win: a second Run Quick after flipping something is the more recent truth about
  // this device, and silently averaging it with the first would hide the change the user made.
  const merged = new Map<string, BenchConfigResult>()
  for (const run of runs) {
    if (run.matrix === 'manual') continue
    for (const c of run.configs) merged.set(c.config.id, c)
  }
  const all = [...merged.values()]
  const caveats: string[] = []

  const floor = p95Of(merged.get('floor'))
  const ranked = all
    .map((c) => ({
      config: c.config.id,
      label: c.config.label,
      p95: c.stats.p95,
      deltaVsFloor: floor === null || !c.stats.valid ? null : round2(c.stats.p95 - floor),
      valid: c.stats.valid,
    }))
    .sort((a, b) => b.p95 - a.p95)

  // ---- the 2x2 interaction --------------------------------------------------------------
  const video = p95Of(merged.get('video-only'))
  const effects = p95Of(merged.get('effects-only'))
  const both = p95Of(merged.get('video-plus-effects'))
  let interaction: Analysis['interaction'] = null
  if (floor !== null && video !== null && effects !== null && both !== null) {
    const interactionMs = round2(both - video - effects + floor)
    interaction = {
      floorP95: floor,
      videoOnlyP95: video,
      effectsOnlyP95: effects,
      bothP95: both,
      interactionMs,
      verdict:
        interactionMs > 8
          ? `Video and effects together cost ${interactionMs}ms/frame MORE than the sum of their parts — the cost is in the combination, so ablating one effect at a time will not find it.`
          : interactionMs < -8
            ? `Video and effects together cost ${-interactionMs}ms/frame LESS than the sum of their parts — something is already being dropped when both are present.`
            : `Video and effects add up (${interactionMs}ms interaction). The expensive thing is a single effect and ablation will find it.`,
    }
  }

  // The legs depend on switches that may not be honoured; if so the interaction term is arithmetic
  // over rows that did not measure what they say. Say so rather than deleting the number.
  const legIds = ['floor', 'video-only', 'effects-only', 'video-plus-effects']
  const legUnhonoured = new Set<FxId>()
  for (const id of legIds) for (const u of merged.get(id)?.unhonoured ?? []) legUnhonoured.add(u)
  if (legUnhonoured.size) {
    caveats.push(
      `The video/effects legs could not switch off: ${[...legUnhonoured].join(', ')}. Those effects were RUNNING in every leg, so the interaction term understates the true difference between them.`,
    )
  }

  // ---- per-effect ablation, both directions ----------------------------------------------
  const baseline = p95Of(merged.get('baseline'))
  const worstEffects: Analysis['worstEffects'] = []
  for (const fx of FX) {
    const off = p95Of(merged.get(`solo-off-${fx.id}`))
    const on = p95Of(merged.get(`solo-on-${fx.id}`))
    if (off === null && on === null) continue
    const soloOffGainMs = off !== null && baseline !== null ? round2(baseline - off) : null
    const soloOnCostMs = on !== null && floor !== null ? round2(on - floor) : null
    worstEffects.push({
      id: fx.id,
      label: fx.label,
      cost: fx.cost,
      soloOffGainMs,
      soloOnCostMs,
      divergent:
        soloOffGainMs !== null && soloOnCostMs !== null && Math.abs(soloOffGainMs - soloOnCostMs) > 8,
    })
  }
  worstEffects.sort((a, b) => (b.soloOffGainMs ?? b.soloOnCostMs ?? 0) - (a.soloOffGainMs ?? a.soloOnCostMs ?? 0))

  // ---- thermal drift -----------------------------------------------------------------------
  // A 2.6-minute run on a tablet that is already struggling will heat it. If every reversed row
  // is slower than its forward twin by a similar margin, the "finding" is the temperature.
  let thermalDriftMs: number | null = null
  const drifts: number[] = []
  for (const c of all) {
    if (!c.config.id.endsWith('-r')) continue
    const fwd = p95Of(merged.get(c.config.id.slice(0, -2)))
    const rev = p95Of(c)
    if (fwd !== null && rev !== null) drifts.push(rev - fwd)
  }
  if (drifts.length >= 3) {
    thermalDriftMs = round2(drifts.reduce((a, b) => a + b, 0) / drifts.length)
    if (Math.abs(thermalDriftMs) > 6) {
      caveats.push(
        `The reversed re-run was ${thermalDriftMs > 0 ? 'slower' : 'faster'} by ${Math.abs(thermalDriftMs)}ms/frame on average. The device drifted during the run; differences smaller than that between any two rows are not trustworthy.`,
      )
    }
  }

  const unmeasured = [...new Set(all.flatMap((c) => c.unhonoured))]
  if (unmeasured.length) {
    caveats.push(
      `${unmeasured.length} switch(es) need a page reload to take effect on this build: ${unmeasured.join(', ')}. Rows that asked for them measured them ON.`,
    )
  }
  const invalid = all.filter((c) => !c.stats.valid)
  if (invalid.length) {
    caveats.push(`${invalid.length} of ${all.length} windows were invalid and are excluded from the ranking.`)
  }
  if (baseline === null) caveats.push('No valid baseline window, so soloOffGainMs could not be computed.')

  // ---- what to switch off ------------------------------------------------------------------
  // Ranked by measured gain, not by cost rating. The registry's cost column is an ESTIMATE made
  // by reading CSS; the whole reason this harness exists is that reading CSS has been wrong.
  const recommendedOff = worstEffects
    .filter((e) => (e.soloOffGainMs ?? 0) > 4 || (e.soloOnCostMs ?? 0) > 6)
    .slice(0, 8)
    .map((e) => e.id)

  return {
    metric: 'p95FrameMs',
    rankedByP95: ranked,
    interaction,
    worstEffects,
    thermalDriftMs,
    unmeasured,
    recommendedOff,
    caveats,
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Human label for a config id, used by the panel's results table. */
export function configLabel(id: string): string {
  const fx = FX_BY_ID[id.replace(/^solo-(off|on)-/, '') as FxId]
  if (fx && id.startsWith('solo-off-')) return `− ${fx.label}`
  if (fx && id.startsWith('solo-on-')) return `only ${fx.label}`
  return id
}
