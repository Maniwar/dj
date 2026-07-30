import { useEffect, useRef } from 'react'
import { audioBus } from '../../audio/audioBus'
import { usePlayerStore } from '../../state/usePlayerStore'
import { ACCENTS, useSiteStore, VIZ_LABEL } from '../../state/useSiteStore'

const BARS = 40

// Real-time analyser painted straight from the AudioBus (no React state per frame).
// Click it to cycle visualisations, the way Winamp's did — spectrum, mirrored, oscilloscope,
// peak dots. The choice is remembered per viewer.
export default function SpectrumDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<number[]>(new Array(BARS).fill(0))
  const valsRef = useRef<number[]>(new Array(BARS).fill(0))
  const agcRef = useRef(0.35) // running peak for auto-gain normalization
  const mode = useSiteStore((s) => s.vizMode)
  const cycle = useSiteStore((s) => s.cycleVizMode)
  // The draw loop must NOT restart when the mode changes, so it reads the mode from a ref.
  const modeRef = useRef(mode)
  modeRef.current = mode
  // THE SECTION OWNS THE COLOUR, which is why this is here at all. Reported twice as "the wide
  // spectrometer only stays pink" and "spec is not cycling in colors as expected", and it was
  // neither a stuck value nor a broken ramp: this component simply never read `accent`. It drew
  // from `temp` alone, and every warm stop had red pinned at 255, so the whole palette it could
  // reach was salmon -> magenta. At a real 37C rig temperature `hot` is 0.17, i.e. the bottom
  // sixth of a ramp nothing ever traverses.
  // ACCENTS carries eight section colours and its own comment says they exist so "the lasers
  // belong to the section instead of washing everything the same pink" — this display was the
  // thing washing everything the same pink. Lore sets it per stop and TourJourney per city, so
  // scrolling now walks magenta / cold blue / acid / sunrise gold / neon pink / pool aqua.
  // Same ref treatment as the mode: a colour change must not restart the loop.
  const accent = useSiteStore((s) => s.accent)
  const accentRef = useRef(accent)
  accentRef.current = accent
  // The eased colour actually painted, carried across frames. Seeded from the accent in force at
  // mount so the first frame is already correct rather than fading up from black.
  const smoothRef = useRef<[number, number, number]>([...(ACCENTS[accent] ?? ACCENTS.default)] as [number, number, number])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    // RESIZE WITHOUT FEEDBACK.
    //
    // This was `new ResizeObserver(() => { getBoundingClientRect(); canvas.width = ... })` observing
    // the canvas itself. Writing canvas.width/height changes the element's INTRINSIC size, which the
    // observer sees as a resize, which writes it again — a loop that browsers only sometimes break
    // cleanly. The visible result is the analyser jumping and the player resizing with it, and
    // because it is a timing race it appears under load and never in emulation.
    //
    // Two changes break it. The size comes from the observer's own contentRect instead of a fresh
    // getBoundingClientRect(), so no forced synchronous layout happens inside a layout callback.
    // And the write is guarded: if the pixel dimensions have not actually changed, nothing is
    // written, so the observer has nothing to react to and the loop cannot start.
    let lastW = 0
    let lastH = 0
    const applySize = (cssW: number, cssH: number) => {
      const w = Math.max(1, Math.round(cssW * dpr))
      const h = Math.max(1, Math.round(cssH * dpr))
      if (w === lastW && h === lastH) return // the guard that ends the feedback loop
      lastW = w
      lastH = h
      canvas.width = w
      canvas.height = h
    }
    const r0 = canvas.getBoundingClientRect()
    applySize(r0.width, r0.height)
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) applySize(box.width, box.height)
    })
    ro.observe(canvas)

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // subtle grid
      ctx.strokeStyle = 'rgba(0, 255, 180, 0.08)'
      ctx.lineWidth = 1
      for (let y = 0; y < H; y += 6 * dpr) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }

      const freq = audioBus.freq
      const N = freq.length
      const temp = audioBus.thermal.temperature
      const hot = Math.min(1, Math.max(0, (temp - 22) / 90))
      const m = modeRef.current

      // The section accent, lifted toward white by `t`.
      // THE LIFT VALUES ARE DELIBERATELY SMALL. The first version of this used 0.62-0.90, which
      // whitened every accent so far that they all collapsed toward pale -- and pale magenta reads
      // as exactly the "stuck on pink" this was meant to fix. Measured on the canvas: dieter came
      // back rgb(168,169,186) against a default of rgb(194,148,183), i.e. the accent WAS arriving
      // and was being washed out on arrival. Keep the hue dominant; the lift is for reading height,
      // not for brightness on its own. `hot` is folded into every call site rather
      // than replaced: a rig that is genuinely running hot should still read hotter, it just no
      // longer decides the hue on its own. ACCENTS values are 0..1 for the shader, hence the *255.
      // EASED, NOT SNAPPED. Read raw, this jumped the instant a stop crossed the observer line, so
      // scrolling read as the display flashing between colours rather than changing cue. The shader
      // already eases uAccent with a 0.35s time constant (ThermalRunaway), and the two have to agree
      // or the rig and the player disagree about what colour the room is. 0.05 per frame is that
      // same constant at 60fps: 1 - exp(-(1/60)/0.35) = 0.047.
      const tgt = ACCENTS[accentRef.current] ?? ACCENTS.default
      const sm = smoothRef.current
      for (let i = 0; i < 3; i++) sm[i] += (tgt[i] - sm[i]) * 0.05
      const [ar, ag, ab] = sm
      const A = (t: number) => {
        const k = t < 0 ? 0 : t > 1 ? 1 : t
        const c = (v: number) => Math.round(255 * (v + (1 - v) * k))
        return `rgb(${c(ar)}, ${c(ag)}, ${c(ab)})`
      }

      // ---- OSCILLOSCOPE: the raw waveform; no band analysis needed ----
      if (m === 'scope') {
        const t = audioBus.time
        ctx.lineWidth = 1.6 * dpr
        ctx.strokeStyle = A(0.06 + hot * 0.16)
        ctx.beginPath()
        for (let i = 0; i < t.length; i += 2) {
          const x = (i / t.length) * W
          const y = H / 2 + ((t[i] - 128) / 128) * (H * 0.46)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
        raf = requestAnimationFrame(draw)
        return
      }

      // Log-ish frequency mapping over the USEFUL range (a linear split wastes the top half
      // on the 11–22kHz dead zone). Bands are CONTIGUOUS + monotonic (each starts where the
      // last ended), so the sparse low end gives ~1 bin per bar and the top widens — every
      // bar samples a different slice instead of the first few collapsing onto the same bin.
      const minBin = 2
      const maxBin = Math.max(minBin + BARS, Math.floor(N * 0.55))
      const logBase = Math.pow(maxBin / minBin, 1 / BARS)
      const gap = 2 * dpr
      const bw = (W - gap * (BARS - 1)) / BARS
      const peaks = peaksRef.current

      // Pass 1: average energy per contiguous log band + track the frame's loudest band.
      const vals = valsRef.current
      let bandLo = minBin
      let frameMax = 0.0001
      for (let i = 0; i < BARS; i++) {
        let hi = Math.floor(minBin * Math.pow(logBase, i + 1))
        if (hi <= bandLo) hi = bandLo + 1
        if (hi > N) hi = N
        let sum = 0
        for (let j = bandLo; j < hi; j++) sum += freq[j]
        const avg = sum / ((hi - bandLo) * 255)
        bandLo = hi
        vals[i] = avg
        if (avg > frameMax) frameMax = avg
      }
      // AUTO-GAIN: fast-attack / slow-release running peak. Loud EDM saturates the analyser
      // near max, so a fixed gain always pins the bars — instead we normalize to the recent
      // peak, so the display shows the spectral SHAPE (dynamic) regardless of loudness.
      agcRef.current = frameMax > agcRef.current ? frameMax : agcRef.current * 0.94 + frameMax * 0.06
      const ref = Math.max(0.1, agcRef.current)

      for (let i = 0; i < BARS; i++) {
        // normalize to the running peak; gamma>1 opens the gap between loud and quiet bars
        const v = Math.min(1, Math.pow(vals[i] / ref, 1.35))
        const x = i * (bw + gap)

        if (m === 'dots') {
          // Peak-only: just the cap, floating on its own decay. Sparse, and the spectral shape
          // reads at a glance without a wall of colour.
          peaks[i] = Math.max(peaks[i] - 1.2 * dpr, v * H)
          ctx.fillStyle = A(0.10 + hot * 0.18)
          ctx.fillRect(x, H - peaks[i] - 2 * dpr, bw, 2.5 * dpr)
          continue
        }

        if (m === 'mirror') {
          // Mirrored about the centre line — the classic hi-fi analyser look.
          const half = (v * H) / 2
          const grad = ctx.createLinearGradient(0, H / 2 - half, 0, H / 2 + half)
          // Mirrored: lifted at the extremes, pure accent through the centre line.
          grad.addColorStop(0, A(0.30 + hot * 0.16))
          grad.addColorStop(0.5, A(0.02))
          grad.addColorStop(1, A(0.30 + hot * 0.16))
          ctx.fillStyle = grad
          ctx.fillRect(x, H / 2 - half, bw, half * 2)
          continue
        }

        // default: bars rising from the floor, with falling peak caps
        const bh = v * H
        const grad = ctx.createLinearGradient(0, H, 0, H - bh)
        // Bars: saturated accent at the floor, lifting toward white at the peak, so height still
        // reads as energy without the hue changing between one bar and its neighbour.
        grad.addColorStop(0, A(0.04))
        grad.addColorStop(1, A(0.34 + hot * 0.16))
        ctx.fillStyle = grad
        ctx.fillRect(x, H - bh, bw, bh)

        peaks[i] = Math.max(peaks[i] - 1.5 * dpr, bh)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(x, H - peaks[i] - 2 * dpr, bw, 2 * dpr)
      }

      // idle waveform baseline when nothing is playing
      if (!usePlayerStore.getState().isPlaying) {
        ctx.strokeStyle = 'rgba(0,255,180,0.5)'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        const t = audioBus.time
        for (let i = 0; i < t.length; i += 16) {
          const x = (i / t.length) * W
          const y = H / 2 + ((t[i] - 128) / 128) * (H * 0.18)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <button
      type="button"
      className="spectrum-wrap"
      onClick={cycle}
      aria-label={`Visualisation: ${VIZ_LABEL[mode]} — click to change`}
      title={`${VIZ_LABEL[mode]} — click to change`}
    >
      <canvas ref={canvasRef} className="spectrum-canvas" aria-hidden />
      <span className="spectrum-tag">{VIZ_LABEL[mode]}</span>
    </button>
  )
}
