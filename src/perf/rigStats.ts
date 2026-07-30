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
  /** Degradation step, 0..3. ONE-WAY within a session — see the sampler in ThermalRunaway. */
  tier: number
  /** The multiplier that tier applies to the budgeted scale. */
  tierMultiplier: number
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
  const t = s.tier > 0 ? ` · tier ${s.tier} (x${s.tierMultiplier})` : ''
  const q = s.quality > 0.5 ? '' : ' · reduced passes'
  return `rig ${s.bufferW}x${s.bufferH} @ ${s.scale.toFixed(2)}x (dpr ${s.dpr}) — ${verdict}${t}${q}`
}
