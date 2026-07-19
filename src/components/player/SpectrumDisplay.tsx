import { useEffect, useRef } from 'react'
import { audioBus } from '../../audio/audioBus'
import { usePlayerStore } from '../../state/usePlayerStore'

const BARS = 40

// Real-time spectrum analyzer painted straight from the AudioBus (no React state).
export default function SpectrumDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<number[]>(new Array(BARS).fill(0))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
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
      const temp = audioBus.thermal.temperature
      const hot = Math.min(1, Math.max(0, (temp - 22) / 90))

      let bandLo = minBin
      for (let i = 0; i < BARS; i++) {
        let hi = Math.floor(minBin * Math.pow(logBase, i + 1))
        if (hi <= bandLo) hi = bandLo + 1
        if (hi > N) hi = N
        // peak within the band reads punchier than an average
        let m = 0
        for (let j = bandLo; j < hi; j++) if (freq[j] > m) m = freq[j]
        bandLo = hi
        let v = m / 255
        // noise floor + gamma + gain for a lively, wide dynamic range
        v = Math.min(1, Math.pow(Math.max(0, v - 0.03), 0.62) * 1.35)
        const bh = v * H
        const x = i * (bw + gap)

        const grad = ctx.createLinearGradient(0, H, 0, H - bh)
        grad.addColorStop(0, `rgb(${40 + hot * 180}, 255, ${180 - hot * 120})`)
        grad.addColorStop(1, `rgb(255, ${200 - hot * 120}, ${120 + hot * 80})`)
        ctx.fillStyle = grad
        ctx.fillRect(x, H - bh, bw, bh)

        // peak caps
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

  return <canvas ref={canvasRef} className="spectrum-canvas" aria-hidden />
}
