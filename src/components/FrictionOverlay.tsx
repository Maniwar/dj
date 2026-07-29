import { useEffect } from 'react'
import { useSiteStore } from '../state/useSiteStore'

// Turning the Friction knob up pushes CSS custom properties on :root that headings,
// the content shake, and the scanline overlay all read. (The Thermal Runaway WebGL
// shader also reads friction directly for grain/scanlines.) We drive CSS vars instead
// of an SVG filter on the whole app so the fixed-position player never breaks.
export default function FrictionOverlay() {
  const friction = useSiteStore((s) => s.friction)

  useEffect(() => {
    const root = document.documentElement
    // On BODY, not documentElement. AudioReactive now owns the root element's inline style
    // outright so it can write all nine audio variables in ONE mutation per frame; anything else
    // living there would be wiped by that. These still inherit to every element, because every
    // element is inside body, and they change only when the knob moves.
    document.body.style.setProperty('--friction', String(friction))
    document.body.style.setProperty('--chroma', String(friction * 3))
    document.body.style.setProperty('--shake', String(friction))
    // Gate the shake animation itself, not just its amplitude. A keyframe animation on a
    // full-viewport fixed layer costs the same whether it moves 1.4px or 0 — the compositor
    // re-composites the layer either way — so at rest the animation must not exist at all.
    root.classList.toggle('friction-on', friction > 0.02)
  }, [friction])

  return (
    <div
      className="friction-overlay"
      aria-hidden
      style={{ opacity: 0.25 + friction * 0.55 }}
    >
      <div className="crt-scan" />
      <div className="crt-vignette" />
    </div>
  )
}
