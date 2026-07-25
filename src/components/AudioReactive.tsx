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
      for (const v of ['--m-snare', '--m-hat', '--m-down', '--m-build', '--m-drop', '--m-bar']) root.style.setProperty(v, '0')
      return
    }
    let raf = 0
    let beat = 0, level = 0, bass = 0, treble = 0
    const written: Record<string, string> = {}
    const setVar = (name: string, v: number) => {
      const s = v.toFixed(2)
      if (written[name] === s) return
      written[name] = s
      root.style.setProperty(name, s)
    }
    const loop = () => {
      const b = audioBus.bands
      // When nothing is PLAYING, ease every band to 0 so the whole page goes calm (Ken-Burns
      // keeps drifting, but the beat-pulses stop). Don't rely on the analyser decaying to
      // silence on its own — a paused/suspended audio graph can freeze its last FFT, which
      // would leave the site pulsing to a beat that isn't there.
      const on = audioBus.playing
      const tBeat = on ? b.beat : 0, tLevel = on ? b.level : 0
      const tBass = on ? b.bass : 0, tTreble = on ? b.treble : 0
      // The beat envelope now arrives pre-shaped from the onset detector (instant attack, timed
      // decay), so DON'T re-smooth the attack — that's what blunted the hit and made it feel
      // late. Follow a rise instantly; ease only the fall. No gain curve either: the envelope
      // is already a clean 0..1, and the old pow()*1.55 lifted the noise floor to ~0.3, which
      // left everything permanently half-pulsing (the "jitter") with no headroom for real kicks.
      beat = tBeat > beat ? tBeat : beat + (tBeat - beat) * 0.28
      level += (tLevel - level) * 0.22
      bass += (tBass - bass) * 0.4
      treble += (tTreble - treble) * 0.35
      // Only write when the value actually changed: every setProperty on :root invalidates
      // style for each element using these vars, so skipping no-op writes cuts a lot of
      // per-frame recalculation (2 decimals is finer than any of the visuals resolve).
      setVar('--m-beat', beat)
      setVar('--m-level', gain(level, 1.6, 0.8))
      setVar('--m-bass', gain(bass, 1.7, 0.78))
      setVar('--m-treble', gain(treble, 1.7, 0.8))
      // Per-instrument + structural channels, so each visual can react to the part of the kit
      // that actually suits it instead of everything firing off the kick.
      const mu = audioBus.music
      setVar('--m-snare', on ? b.snare : 0)
      setVar('--m-hat', on ? b.hat : 0)
      setVar('--m-down', on ? mu.downbeat : 0)
      setVar('--m-build', on ? mu.build : 0)
      setVar('--m-drop', on ? mu.drop : 0)
      // phases keep running so bar-synced sweeps stay continuous rather than snapping
      setVar('--m-bar', mu.barPhase)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
