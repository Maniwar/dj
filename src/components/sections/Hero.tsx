import { useThermalReadout } from '../../hooks/useThermalReadout'
import { useSiteStore } from '../../state/useSiteStore'

export default function Hero() {
  const thermal = useThermalReadout()
  const hits = useSiteStore((s) => s.hits)
  const hot = Math.min(1, Math.max(0, (thermal.temperature - 22) / 90))

  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <div className="eyebrow">EUROBEAT RECORDS PRESENTS · CAT# EBR-2002-💦</div>
        <h1 className="hero-title">
          <span className="drip">CLUB HUMIDITY</span>
        </h1>
        <h2 className="hero-sub">THE MOIST MIX 2002 · UNFILTERED EXCESS</h2>
        <p className="hero-artists">
          <b>DJ WOLFGANG</b> &amp; <b>KIKI G</b> <span className="aka">— System Overload —</span>
        </p>

        <div className="hero-gauge">
          <div className="gauge-label">RIG STATUS</div>
          <div className="gauge-bar">
            <span
              className="gauge-fill"
              style={{
                width: `${hot * 100}%`,
                background: `linear-gradient(90deg,#12e0c0,#ffd84d ${60 - hot * 20}%,#ff2e9a)`,
              }}
            />
            <span className="gauge-dew" style={{ left: '82%' }} title="DEW POINT">
              DEW
            </span>
          </div>
          <div className="gauge-read">
            🌡 {Math.round(thermal.temperature)}°C &nbsp;·&nbsp; 💧{' '}
            {Math.round(thermal.humidity * 100)}% RH &nbsp;·&nbsp;{' '}
            {thermal.dewPointHit
              ? '❄ LIQUID-COOLING ENGAGED'
              : hot > 0.62
                ? '⚠ THERMAL RUNAWAY IMMINENT — CRANK IT'
                : 'NOMINAL. PUSH HARDER.'}
          </div>
        </div>

        <a className="scroll-cue" href="#lore">
          ▾ ENTER THE VIP LOUNGE ▾
        </a>

        <div className="hitcounter" title="visitors since the sauna incident">
          <span className="hc-label">VISITORS:</span>
          {String(hits)
            .padStart(9, '0')
            .split('')
            .map((d, i) => (
              <span className="hc-digit" key={i}>
                {d}
              </span>
            ))}
        </div>
      </div>
    </section>
  )
}
