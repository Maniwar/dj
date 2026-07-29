import { useEffect } from 'react'
import { audioBus } from '../audio/audioBus'
import { PERF } from '../lib/perfFlags'
import { useFxOn } from '../perf/useFx'
import { getFxMultiplier } from '../perf/intensity'

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
  // Subscribed rather than read once from the URL, so the `audioPump` switch is honoured live —
  // by the panel, and by the benchmark's no-audio-css row, which previously asked for the pump to
  // stop and measured it still running. Flipping it re-runs this effect: the cleanup cancels the
  // rAF loop, and the branch below pins the variables at neutral.
  const pump = useFxOn('audioPump')
  useEffect(() => {
    const root = document.documentElement
    if (!pump) {
      // low-power: set neutral values once, no per-frame writes. cssText is not used here — the
      // loop is not running, so there is nothing to rebuild and nothing else writes this element.
      // The resting values are scaled by the dial like everything else, so that at intensity 0 —
      // where this branch is always the one taken, because `audioPump` is retired below 0.02 —
      // every audio variable is a hard 0 and the page has no residual pulse in it at all.
      const rest = (0.2 * getFxMultiplier()).toFixed(2)
      for (const v of ['--m-beat', '--m-level', '--m-bass', '--m-treble']) root.style.setProperty(v, rest)
      for (const v of ['--m-snare', '--m-hat', '--m-down', '--m-build', '--m-drop']) root.style.setProperty(v, '0')
      root.style.setProperty('--beat-lift', '0px')
      return
    }
    let raf = 0
    let beat = 0, level = 0, bass = 0, treble = 0
    // Device pixel ratio, read once: it is what decides whether a translation is representable
    // without re-rasterising the glyphs.
    const DPR = window.devicePixelRatio || 1
    const written: Record<string, string> = {}
    // ISOLATION: hold one group of variables at a constant while the rest keep updating. The
    // WRITE still happens once and then stops for the frozen group, so this separates "the effect
    // this variable drives is expensive" from "writing custom properties on :root is expensive".
    const frozen = (name: string) => {
      // ?live= wins when present: only the named variables keep updating.
      if (PERF.live.size) return !PERF.live.has(name.replace('--m-', ''))
      if (PERF.freeze === 'beat') return name === '--m-beat'
      if (PERF.freeze === 'others') return name !== '--m-beat'
      return false
    }
    // WRITE AS SELDOM AS POSSIBLE — the write itself is the cost.
    //
    // Proven on the device: freezing --m-beat alone removed the jitter, and so did freezing the
    // other nine while --m-beat kept updating. Neutralising every class of EFFECT
    // (?nofx=blur|alpha|transform) changed nothing. So the expense is the act of setting a custom
    // property on :root, not anything the CSS does with the value: unregistered custom properties
    // inherit, so each write marks the whole document for style re-resolution.
    //
    // These envelopes move slowly and nothing needs two decimal places of them. Rounding to one
    // collapses most frames into "unchanged", and an unchanged value is not written at all.
    // --m-beat stays at 2dp: it is the transient, and its resolution is what the kick reads from.
    // CALIBRATED AGAINST A MEASURED THRESHOLD, not a theory.
    //
    // ?freeze=others leaves only --m-beat writing — roughly 60 writes/sec — and the jitter is
    // gone. The first pass got from ~540 to 198/sec and the jitter remained. So the ceiling is
    // somewhere under 198, and every write removed helps.
    //
    // --m-beat at 2dp changes on nearly every frame, so it alone is ~60/sec of the total. At 1dp
    // it changes about ten times across a beat envelope instead of sixty. For a glow radius and a
    // scale of a few percent that step is imperceptible; for the write count it is the difference
    // that matters. Everything else is coarser still.
    const COARSE = new Set(['--m-build', '--m-drop', '--m-down', '--m-hat', '--m-snare', '--m-beat', '--m-level', '--m-bass', '--m-treble'])
    // ONE STYLE MUTATION PER FRAME, NOT NINE.
    //
    // Each setProperty() on documentElement is its own style-invalidation pass. The evidence says
    // that count is what matters, not the values: ?freeze=others leaves the EXPENSIVE variable
    // (--m-beat, read by 55 rules) writing and has no jitter, because it is one pass per frame;
    // ?freeze=beat has eight passes but none touches those 55 rules. Only the full state has many
    // passes AND an expensive one — which is why removing either half fixed it, and why cutting
    // the write count from 540/s to 198/s did not.
    //
    // Collecting the frame's values and assigning cssText once reproduces the ?freeze=others
    // profile exactly — a single mutation — while keeping every variable live at full resolution.
    // This is also why the master dial publishes `--fx` on <body> and not here: cssText replaces
    // the whole inline style attribute, so anything else written to this element is erased on the
    // next frame. Nothing else may live here. (The friction knob's variables were moved to body
    // for the same reason before it was retired.)
    const pending: Record<string, string> = {}
    // THE MASTER DIAL IS APPLIED HERE, AT THE SOURCE — not in the ~94 rules downstream.
    //
    // Every rule that reacts to the music reads one of these variables, so scaling the VALUE
    // scales the reaction, and not one selector had to be touched to make the dial reach them.
    // It also produces the right thing at 0 for free: every variable becomes the constant "0.0",
    // the dedupe below matches on every frame, `pending` stays empty, and the per-frame cssText
    // write — the cost this file spent weeks isolating — stops entirely. No extra branch.
    //
    // Read per frame rather than captured, because the dial can move while the loop is running
    // and re-running the effect on every drag frame would tear down and rebuild the rAF loop.
    const setVar = (name: string, v: number) => {
      const fx = getFxMultiplier()
      if (frozen(name)) {
        if (written[name] === undefined) {
          // The REAL value, not a sentinel. `written` is not a set of "have I handled this yet"
          // flags — it is the source the cssText flush below is rebuilt from, so storing the
          // string 'frozen' meant the very next flush emitted `--m-beat:frozen`, an invalid token
          // that overwrote the correct one-time value. Every ?live= and ?freeze= bisect run since
          // that flush was introduced measured a page whose frozen variables were unset.
          const held =
            name === '--beat-lift' ? '0px' : ((name === '--m-beat' ? 0.35 : 0.2) * fx).toFixed(2)
          written[name] = held
          root.style.setProperty(name, held)
        }
        return
      }
      // --beat-lift is SNAPPED TO WHOLE DEVICE PIXELS, and the snap has to happen AFTER the dial
      // is applied or the scaling puts the offsets straight back onto fractional pixels — which
      // is the exact shimmer the snap was added to remove (commit "Snap --beat-lift to whole
      // device pixels"). That is why the rounding lives here and not at the call site.
      const s =
        name === '--beat-lift'
          ? `${Math.round(v * fx * DPR) / DPR}px`
          : (v * fx).toFixed(COARSE.has(name) ? 1 : 2)
      if (written[name] === s) return
      written[name] = s
      pending[name] = s
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
      // --m-bass and --m-treble look unused in index.css and are NOT: the player's VU bars read
      // them through inline styles in Player.tsx. Only --m-bar is genuinely read by nothing.
      setVar('--m-bass', gain(bass, 1.5, 0.8))
      setVar('--m-treble', gain(treble, 1.7, 0.8))
      // Per-instrument + structural channels, so each visual can react to the part of the kit
      // that actually suits it instead of everything firing off the kick.
      const mu = audioBus.music
      setVar('--m-snare', on ? b.snare : 0)
      setVar('--m-hat', on ? b.hat : 0)
      setVar('--m-down', on ? mu.downbeat : 0)
      setVar('--m-build', on ? mu.build : 0)
      setVar('--m-drop', on ? mu.drop : 0)

      // --beat-lift: SNAPPED TO WHOLE DEVICE PIXELS, and computed here rather than in CSS.
      //
      // This was a derived custom property: calc((beat + down*0.8 + drop*1.2) * -7px), read by
      // .hero-title .drip (CLUB HUMIDITY), .section-title and .lore-name as translateY. A
      // translation of a fractional pixel forces text to be re-rasterised on a different
      // sub-pixel grid, and on a DPR 1.75 display that is visible as shimmer.
      //
      // It explains the bisect exactly. --m-level does not feed this, so beat+level produces the
      // same ~11 distinct offsets as beat alone and is clean; --m-down does, so beat+down
      // produces ~121 and jitters. No cumulative-work account predicts that difference.
      //
      // Rounding to a multiple of 1/dpr means every offset lands on a whole device pixel, so the
      // glyphs rasterise identically each time however many distinct values the audio produces.
      // Computing it here also removes a CSS-level variable-to-variable dependency chain.
      const liftPx = (on ? beat + (mu.downbeat ?? 0) * 0.8 + (mu.drop ?? 0) * 1.2 : 0) * -7
      setVar('--beat-lift', liftPx)
      // phases keep running so bar-synced sweeps stay continuous rather than snapping
      // flush: one assignment, one invalidation pass
      const keys = Object.keys(pending)
      if (keys.length) {
        root.style.cssText = Object.entries(written)
          .map(([k, v]) => `${k}:${v}`)
          .join(';')
        for (const k of keys) delete pending[k]
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [pump])
  return null
}
