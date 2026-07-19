import { useEffect } from 'react'
import { audioBus } from '../audio/audioBus'

// Pumps the live audio bands onto :root as CSS custom properties so the ENTIRE PAGE
// can react to the music in pure CSS (no per-element JS). One rAF loop, throttled
// smoothing, no React re-renders.
//   --m-beat  : short transient envelope (kick pulses)   0..1
//   --m-level : overall loudness                          0..1
//   --m-bass  : low-end energy                            0..1
//   --m-treble: high end                                  0..1
export default function AudioReactive() {
  useEffect(() => {
    const root = document.documentElement
    let raf = 0
    let beat = 0, level = 0, bass = 0, treble = 0
    const loop = () => {
      const b = audioBus.bands
      // smooth a touch so it pulses instead of jitters
      beat += (b.beat - beat) * 0.5
      level += (b.level - level) * 0.2
      bass += (b.bass - bass) * 0.35
      treble += (b.treble - treble) * 0.3
      root.style.setProperty('--m-beat', beat.toFixed(3))
      root.style.setProperty('--m-level', level.toFixed(3))
      root.style.setProperty('--m-bass', bass.toFixed(3))
      root.style.setProperty('--m-treble', treble.toFixed(3))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
