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
      setT({
        temperature: audioBus.thermal.temperature,
        humidity: audioBus.thermal.humidity,
        dewPointHit: audioBus.thermal.dewPointHit,
        overclock: audioBus.thermal.overclock,
      })
    }, 1000 / hz)
    return () => clearInterval(id)
  }, [hz])
  return t
}
