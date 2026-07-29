// ============================================================================================
// FRAME SAMPLING — the tail, not the average
// ============================================================================================
// The bug this harness exists to find hid behind a mean for a week. A page can average 16.7ms
// per frame — a flawless "60fps" — while one frame in twenty takes 90ms, and one frame in twenty
// is exactly what the eye reads as a stutter. So nothing here reports a mean as a headline: the
// windows keep every frame delta and report PERCENTILES, and p95 is the number the benchmark
// ranks, sorts and recommends on.
//
// Everything in the per-frame path is allocation-free and does no layout read. Deltas go into a
// preallocated Float32Array; the sort, the percentiles and the DOM census all happen when a
// window CLOSES. A sampler that allocates inside its own measurement window measures its own
// garbage collector.

/** One closed measurement window. Every field is per-window, never cumulative. */
export type FrameStats = {
  frames: number
  durationMs: number
  /** frames / seconds. Kept because it is the number people recognise — never ranked on. */
  fps: number
  mean: number
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  max: number
  /** dt > 26ms. The same threshold calmMode has always used, kept so old notes still compare. */
  jankPct: number
  /** dt > 50ms — "you saw that one". */
  badPct: number
  /** Σ max(0, round(dt / refreshMs) - 1), against the panel's MEASURED refresh rate. */
  droppedApprox: number
  longTasks: number
  longTaskMs: number
  /** Σ layout-shift value where !hadRecentInput. */
  layoutShift: number
  heapMB: number | null
  scrollY: number
  /**
   * False means the window measured something other than rendering cost — a backgrounded tab, a
   * stall, or too few frames to say anything. Invalid windows are still exported WITH the reason:
   * a configuration that could not be measured on this device is itself a finding.
   */
  valid: boolean
  invalidReason?: string
  /** Taken once, at the end of settle, before the window opens. Never during it. */
  census?: DomCensus
}

/**
 * A snapshot of how much the page is asking the compositor to do.
 *
 * This is the expensive part of the old Diagnostics overlay — a `body *` walk with a
 * getComputedStyle per node — and it used to run twice a second, forever, INCLUDING while frame
 * time was being measured. A full style resolution on every element is comfortably a long task on
 * a tablet, so the old overlay was reliably manufacturing several of the long tasks it reported.
 * It now runs exactly once per configuration, at the end of settle, and never inside a window.
 */
export type DomCensus = {
  elements: number
  /** mix-blend-mode !== normal. Each one forces a framebuffer readback to blend against. */
  blendLayers: number
  /** will-change or a transform — i.e. asking for its own compositor layer. */
  promotedLayers: number
  /** backdrop-filter — a per-pixel blur of whatever is behind, re-run whenever that is dirty. */
  backdropFilters: number
  /** a non-none filter, which forces the element out of the fast compositing path. */
  filtered: number
  animations: number
  pausedAnimations: number
  videos: number
  videosPlaying: number
  canvases: number
}

// --------------------------------------------------------------------------------------------
// Refresh rate
// --------------------------------------------------------------------------------------------
// droppedApprox is meaningless without it. A 90Hz tablet holding 11ms frames is perfect; a 60Hz
// one holding 11ms frames is impossible and means something is wrong with the clock. Measured
// rather than assumed, because both target devices are high-refresh panels that may or may not
// be running at their headline rate depending on battery and thermal state.
let refreshHz = 60
let refreshMs = 1000 / 60
let refreshMeasured = false

export function getRefreshHz(): number {
  return refreshHz
}

/**
 * Median frame delta over `frames` idle frames. Median, not mean: the first few frames after any
 * call site are polluted by whatever the caller just did, and a median throws those away for free.
 */
export function measureRefreshHz(frames = 120): Promise<number> {
  return new Promise((resolve) => {
    if (refreshMeasured) return resolve(refreshHz)
    const dts: number[] = []
    let last = performance.now()
    let n = 0
    const step = (now: number) => {
      const dt = now - last
      last = now
      if (n++ > 0 && dt > 1 && dt < 200) dts.push(dt)
      if (dts.length < frames && n < frames * 3) {
        requestAnimationFrame(step)
        return
      }
      if (dts.length >= 10) {
        dts.sort((a, b) => a - b)
        const med = dts[dts.length >> 1]
        // Snap to the nearest plausible panel rate. A measured 16.9ms is a 60Hz panel with the
        // page under a little load, not a 59.2Hz display, and reporting 59 makes droppedApprox
        // count a dropped frame on every single frame.
        const candidates = [30, 48, 50, 60, 72, 90, 120, 144, 165, 240]
        const raw = 1000 / med
        refreshHz = candidates.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a))
        refreshMs = 1000 / refreshHz
      }
      refreshMeasured = true
      resolve(refreshHz)
    }
    requestAnimationFrame(step)
  })
}

// --------------------------------------------------------------------------------------------
// Shared observers
// --------------------------------------------------------------------------------------------
// One PerformanceObserver of each kind for the whole session, accumulating monotonic totals.
// Windows record the totals at open and subtract at close. Two reasons this beats a per-window
// observer: constructing an observer inside a benchmark's settle period is itself work landing in
// the window it is setting up, and layout-shift entries arrive asynchronously — an observer torn
// down at the instant a window closes drops the entries for the frames it was meant to count.

const totals = { longTasks: 0, longTaskMs: 0, layoutShift: 0 }
let observersStarted = false

function startObservers(): void {
  if (observersStarted || typeof PerformanceObserver === 'undefined') return
  observersStarted = true
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        totals.longTasks++
        totals.longTaskMs += e.duration
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* Safari and older Android have no longtask entry type; the counters simply stay at 0 */
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
        // hadRecentInput excludes shifts the user caused by tapping something. What we want is
        // the page moving on its own.
        if (!e.hadRecentInput) totals.layoutShift += e.value
      }
    }).observe({ type: 'layout-shift', buffered: false } as PerformanceObserverInit)
  } catch {
    /* not supported everywhere */
  }
}

// --------------------------------------------------------------------------------------------
// The clock
// --------------------------------------------------------------------------------------------
// One rAF for the whole harness, feeding every open window. Two open windows (the panel's rolling
// segment and a benchmark window) must see the SAME deltas or the two numbers cannot be compared,
// and two rAF loops would each add a callback to every frame they claim to be measuring.

const CAP = 8192 // ~2.3 minutes at 60Hz. A single window is 3s; this can never be reached.

const open = new Set<SampleWindow>()
let raf = 0
let lastTs = 0

function tick(now: number): void {
  raf = requestAnimationFrame(tick)
  const dt = now - lastTs
  lastTs = now
  // Set iteration order is insertion order and the set is never mutated from inside push(), so
  // this is safe and allocation-free.
  for (const w of open) w.push(dt)
}

function ensureClock(): void {
  if (raf) return
  lastTs = performance.now()
  raf = requestAnimationFrame(tick)
}

function stopClockIfIdle(): void {
  if (open.size === 0 && raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'visibilitychange',
    () => {
      // A backgrounded tab throttles rAF to ~1Hz. Every open window is now measuring the
      // throttle, not the page, and there is no way to recover the frames it missed — so the
      // windows are marked, permanently, and the benchmark retries them.
      if (document.visibilityState !== 'visible') for (const w of open) w.markHidden()
    },
    { passive: true },
  )
}

export class SampleWindow {
  private dts = new Float32Array(CAP)
  private n = 0
  private startedAt = 0
  private base = { longTasks: 0, longTaskMs: 0, layoutShift: 0 }
  private sawHidden = false
  private sawStall = false
  private skipFirst = true
  private closed = false
  private census?: DomCensus

  constructor(census?: DomCensus) {
    startObservers()
    this.census = census
    this.startedAt = performance.now()
    this.base.longTasks = totals.longTasks
    this.base.longTaskMs = totals.longTaskMs
    this.base.layoutShift = totals.layoutShift
    this.sawHidden = typeof document !== 'undefined' && document.visibilityState !== 'visible'
    open.add(this)
    ensureClock()
  }

  /** Per-frame. No allocation, no layout read, no branch that can throw. */
  push(dt: number): void {
    if (this.skipFirst) {
      // The first delta spans whatever the caller was doing when the window opened — applying a
      // configuration, in the benchmark's case. It belongs to the previous state, not this one.
      this.skipFirst = false
      return
    }
    if (dt > 1000) this.sawStall = true
    if (this.n < CAP) this.dts[this.n++] = dt
  }

  markHidden(): void {
    this.sawHidden = true
  }

  /** Drop the window without producing a result. Used by Abort and by unmount. */
  cancel(): void {
    if (this.closed) return
    this.closed = true
    open.delete(this)
    stopClockIfIdle()
  }

  /** Live p95 without closing, for the panel's 2Hz readout. Allocates — never call per frame. */
  peek(): { fps: number; p50: number; p95: number; max: number; frames: number } {
    const n = this.n
    if (n < 2) return { fps: 0, p50: 0, p95: 0, max: 0, frames: n }
    const sorted = this.dts.slice(0, n).sort()
    const elapsed = performance.now() - this.startedAt
    return {
      fps: Math.round((n * 1000) / Math.max(1, elapsed)),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[n - 1],
      frames: n,
    }
  }

  close(): FrameStats {
    const endedAt = performance.now()
    this.cancel()

    const n = this.n
    const durationMs = endedAt - this.startedAt
    // slice() copies; sort() on a TypedArray is numeric, not lexicographic. Both happen here,
    // after the window is closed, so neither can land inside a measurement.
    const sorted = this.dts.slice(0, n).sort()

    let sum = 0
    let jank = 0
    let bad = 0
    let dropped = 0
    for (let i = 0; i < n; i++) {
      const dt = sorted[i]
      sum += dt
      if (dt > 26) jank++
      if (dt > 50) bad++
      const slots = Math.round(dt / refreshMs)
      if (slots > 1) dropped += slots - 1
    }

    let invalidReason: string | undefined
    if (this.sawHidden) invalidReason = 'tab was not visible'
    else if (this.sawStall) invalidReason = 'a frame took over 1s (stall, GC or tab switch)'
    else if (n < 30) invalidReason = `only ${n} frames`

    return {
      frames: n,
      durationMs: round2(durationMs),
      fps: n ? Math.round((n * 1000) / durationMs) : 0,
      mean: n ? round2(sum / n) : 0,
      p50: round2(percentile(sorted, 50)),
      p75: round2(percentile(sorted, 75)),
      p90: round2(percentile(sorted, 90)),
      p95: round2(percentile(sorted, 95)),
      p99: round2(percentile(sorted, 99)),
      max: n ? round2(sorted[n - 1]) : 0,
      jankPct: n ? round3(jank / n) : 0,
      badPct: n ? round3(bad / n) : 0,
      droppedApprox: dropped,
      longTasks: totals.longTasks - this.base.longTasks,
      longTaskMs: round2(totals.longTaskMs - this.base.longTaskMs),
      layoutShift: round3(totals.layoutShift - this.base.layoutShift),
      heapMB: heapMB(),
      scrollY: Math.round(typeof window === 'undefined' ? 0 : window.scrollY),
      valid: invalidReason === undefined,
      ...(invalidReason ? { invalidReason } : {}),
      ...(this.census ? { census: this.census } : {}),
    }
  }
}

/** Nearest-rank percentile over an ASCENDING array. p95 of 100 samples is the 95th value. */
function percentile(sorted: Float32Array, p: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const i = Math.ceil((p / 100) * n) - 1
  return sorted[Math.min(n - 1, Math.max(0, i))]
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function heapMB(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null
}

/**
 * The expensive one. Walks every element in <body> and resolves its computed style.
 *
 * Call this at the END of settle and nowhere else. It is O(elements) style resolutions and it
 * will show up as a long task on the devices this harness targets — which is fine, as long as
 * that long task lands between two windows rather than inside one.
 */
export function domCensus(): DomCensus {
  const out: DomCensus = {
    elements: 0,
    blendLayers: 0,
    promotedLayers: 0,
    backdropFilters: 0,
    filtered: 0,
    animations: 0,
    pausedAnimations: 0,
    videos: 0,
    videosPlaying: 0,
    canvases: 0,
  }
  if (typeof document === 'undefined') return out

  const all = document.querySelectorAll<HTMLElement>('body *')
  out.elements = all.length
  all.forEach((el) => {
    const cs = getComputedStyle(el)
    if (cs.mixBlendMode !== 'normal') out.blendLayers++
    if (cs.willChange !== 'auto' || cs.transform !== 'none') out.promotedLayers++
    const bd = cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter
    if (bd && bd !== 'none') out.backdropFilters++
    if (cs.filter && cs.filter !== 'none') out.filtered++
  })

  const anims = document.getAnimations?.() ?? []
  out.animations = anims.length
  out.pausedAnimations = anims.filter((a) => a.playState === 'paused').length

  const vids = document.querySelectorAll('video')
  out.videos = vids.length
  vids.forEach((v) => {
    if (!v.paused && !v.ended && v.readyState >= 2) out.videosPlaying++
  })
  out.canvases = document.querySelectorAll('canvas').length
  return out
}
