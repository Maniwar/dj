import { useEffect } from 'react'
import { audioBus } from '../audio/audioBus'
import { PERF } from '../lib/perfFlags'

// Pumps the live audio bands onto :root as CSS custom properties so the ENTIRE PAGE
// can react to the music in pure CSS (no per-element JS). One rAF loop, throttled
// smoothing, no React re-renders.
//   --m-beat  : short transient envelope (kick pulses)   0..1
//   --m-level : overall loudness                          0..1
//   --m-bass  : low-end energy                            0..1
//   --m-treble: high end                                  0..1
// Recorded/streamed music rarely pumps the analyser to 1.0 — raw bands sit around
// 0.2–0.4, which makes CSS reactions feel timid. gain() lifts the low/mid range with a
// gamma curve and a gain factor (clamped) so the page visibly PULSES with the beat while
// still topping out cleanly on peaks. Because everything is wired to --m-beat, boosting it
// here strengthens every reactive element on the site at once.
const gain = (x: number, g: number, gamma: number) =>
  Math.min(1, Math.pow(Math.max(0, x), gamma) * g)

export default function AudioReactive() {
  useEffect(() => {
    const root = document.documentElement
    if (PERF.noReact) {
      // low-power: set neutral values once, no per-frame writes
      for (const v of ['--m-beat', '--m-level', '--m-bass', '--m-treble']) root.style.setProperty(v, '0.2')
      return
    }
    let raf = 0
    let beat = 0, level = 0, bass = 0, treble = 0
    const loop = () => {
      const b = audioBus.bands
      // smooth a touch so it pulses instead of jitters (snappier attack on the beat)
      beat += (b.beat - beat) * 0.6
      level += (b.level - level) * 0.22
      bass += (b.bass - bass) * 0.4
      treble += (b.treble - treble) * 0.35
      root.style.setProperty('--m-beat', gain(beat, 1.55, 0.7).toFixed(3))
      root.style.setProperty('--m-level', gain(level, 1.6, 0.8).toFixed(3))
      root.style.setProperty('--m-bass', gain(bass, 1.7, 0.78).toFixed(3))
      root.style.setProperty('--m-treble', gain(treble, 1.7, 0.8).toFixed(3))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
