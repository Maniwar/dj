import { useEffect, useState } from 'react'
import { audioBus } from '../audio/audioBus'

// Low-frequency poll (default ~8/sec) of the per-frame thermal singleton, so React
// UI (gauges, readouts) can display it without re-rendering every animation frame.
export function useThermalReadout(hz = 8) {
  const [t, setT] = useState({
    temperature: audioBus.thermal.temperature,
    humidity: audioBus.thermal.humidity,
    dewPointHit: audioBus.thermal.dewPointHit,
    overclock: audioBus.thermal.overclock,
  })
  useEffect(() => {
    const id = setInterval(() => {
      const th = audioBus.thermal
      setT((prev) => {
        // ONLY RE-RENDER WHEN THE DISPLAYED VALUE CHANGES.
        //
        // This previously called setT with a FRESH OBJECT every tick. React compares with
        // Object.is, so a new object is never equal to the old one and both consumers of this
        // hook — Hero and Player — re-rendered eight times a second regardless of whether
        // anything had actually changed.
        //
        // The visible cost is not the render, it is the REPAINT. Repainting text at DPR 1.75 —
        // a fractional device pixel ratio — lands glyphs on different sub-pixels each time, so
        // CLUB HUMIDITY, THE MOIST MIX, the gauge and the player's readout all shimmered in
        // lockstep, being driven by this one timer. At DPR 1 or 2 it snaps cleanly and is
        // invisible, which is why no emulator ever reproduced it.
        //
        // Comparison is at DISPLAY precision, not raw float precision: the underlying values
        // drift continuously while the rendered text (whole °C, whole %) does not. Comparing
        // raw floats would still re-render on every tick and fix nothing.
        if (
          Math.round(prev.temperature) === Math.round(th.temperature) &&
          Math.round(prev.humidity * 100) === Math.round(th.humidity * 100) &&
          prev.dewPointHit === th.dewPointHit &&
          prev.overclock === th.overclock
        ) {
          return prev // identical reference — React bails out, nothing repaints
        }
        return {
          temperature: th.temperature,
          humidity: th.humidity,
          dewPointHit: th.dewPointHit,
          overclock: th.overclock,
        }
      })
    }, 1000 / hz)
    return () => clearInterval(id)
  }, [hz])
  return t
}
