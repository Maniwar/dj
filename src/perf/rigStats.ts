// ============================================================================================
// WHAT RESOLUTION THE LIGHT RIG IS ACTUALLY RENDERING AT
// ============================================================================================
// This exists because its absence cost most of an evening. "The fx layer looks soft / low
// resolution / pixelated" was reported half a dozen times, and the single number that explains it
// — the shader's render scale — lived inside ThermalRunaway's closure where nothing could see it.
// The diag panel showed the intensity multiplier, which is a different quantity entirely, so the
// panel looked healthy while the rig was drawing at 70% of native and being upscaled.
//
// Two separate caps were doing it, and neither was visible: PIXEL_BUDGET (too low for any viewport
// past ~1920x1200) and MAX_SCALE (which clamped every dpr-2 display to 1.4x when native is 2.0x).
// Each was found by reading the source and reasoning, twice, after the wrong thing was fixed first.
// A single line in the export would have pointed straight at both.
//
// So: the renderer publishes here on every applyScale, and the report and the panel read it. The
// value to look at is `nativeFraction` — 1.0 means the rig is drawing at the display's own pixels,
// and anything below that is being upscaled by the browser and CANNOT be sharpened by any amount of
// anti-aliasing inside the shader.

export type RigStats = {
  /** The pixel ratio handed to WebGLRenderer.setPixelRatio, after budget and tier. */
  scale: number
  /** Degradation step, 0..3. Moves BOTH ways — see src/perf/tierPolicy.ts. */
  tier: number
  /** The multiplier that tier applies to the budgeted scale. */
  tierMultiplier: number
  /** How many rungs the ladder has, so the panel can say "1 of 5" rather than a bare index. */
  tierCount: number
  /** The multiplier of the BEST rung, i.e. TIERS[0]. Above 1 means supersampling is available. */
  topMultiplier: number
  /** window.devicePixelRatio. `scale` at parity with this is native rendering. */
  dpr: number
  /** CSS size of the canvas. */
  cssW: number
  cssH: number
  /** Actual backing-buffer size, i.e. what the shader really rasterises. */
  bufferW: number
  bufferH: number
  /**
   * scale / dpr. THE NUMBER THAT MATTERS: 1.0 is native, 0.7 means the rig is drawing 70% of the
   * display's pixels and the browser is stretching the result.
   */
  nativeFraction: number
  /** uQuality — 0 drops the costliest passes (droplets' second layer, the wet floor). */
  quality: number
}

let stats: RigStats | null = null

/**
 * Live tier-policy counters, published every sampling window.
 *
 * These exist because the question "why is the rig not climbing?" was answered wrong twice from the
 * outside: once as "it has not been long enough" and once as "it tried and could not hold it". Both
 * were guesses about hidden state. `fast` says how close it is to a climb, `failed` says which rungs
 * it has given up on, and `windows` says whether the sampler is running AT ALL -- which matters
 * because it sits after useFrame's idle return, so it only measures while audio is playing.
 */
let policy: { fast: number; failed: number[]; windows: number } | null = null
export function publishTierDebug(fast: number, failed: number[]): void {
  policy = { fast, failed: [...failed], windows: (policy?.windows ?? 0) + 1 }
}

/**
 * Whether useFrame is still reaching the sampler at all, published EVERY frame.
 *
 * The window counter froze at 7 while the effects carried on looking alive, which is the signature
 * of the idle return: it skips the uniform update but not the draw, so a frozen rig is visually
 * indistinguishable from a running one. `windows` alone cannot tell "the sampler stopped" from "the
 * sampler is running and nothing has changed", and that ambiguity cost two more round trips.
 */
let live: { playing: boolean; idle: number; frames: number } | null = null
export function publishRigLive(playing: boolean, idle: number, frames: number): void {
  live = { playing, idle, frames }
}

/** Called by ThermalRunaway whenever it recomputes the render scale. */
export function publishRigStats(s: RigStats): void {
  stats = s
}

/** Null until the rig has mounted and sized itself at least once. */
export function rigStats(): Readonly<RigStats> | null {
  return stats
}

/** One line for the panel. Kept here so the export and the panel cannot describe it differently. */
export function rigStatsLine(): string {
  const s = stats
  if (!s) return 'rig: not mounted'
  const pct = Math.round(s.nativeFraction * 100)
  const verdict = pct >= 99 ? 'native' : `${pct}% of native — upscaled`
  // SPELLED OUT, because "tier 1 (x1)" was read as "the 2x tier" -- the index and the multiplier
  // happened to both be 1, and nothing said which end of the ladder 0 was. Tier 0 is the BEST rung.
  const rung = s.tier === 0 ? 'top rung' : `${s.tier} of ${s.tierCount - 1} below top`
  const head = s.topMultiplier > 1 && s.tier > 0 ? ` · x${s.topMultiplier} rung available` : ''
  const t = ` · tier ${s.tier} (x${s.tierMultiplier}, ${rung})${head}`
  // Empty when the sampler has never run — which is itself the answer, not a missing field.
  const p = policy
    ? ` · climb ${policy.fast}/8 · failed [${policy.failed.join(',')}] · ${policy.windows}w`
    : ' · sampler has not run (needs audio playing)'
  const l = live ? ` · audio ${live.playing ? 'on' : 'OFF'} · idle ${live.idle} · f${live.frames}` : ''
  const q = s.quality > 0.5 ? '' : ' · reduced passes'
  return `rig ${s.bufferW}x${s.bufferH} @ ${s.scale.toFixed(2)}x (dpr ${s.dpr}) — ${verdict}${t}${q}${p}${l}`
}
