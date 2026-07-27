import { useEffect, useRef, useState } from 'react'
import { BUILD_STAMP } from '../version'

// On-screen diagnostics, shown only with ?diag.
//
// This exists because several rounds of fixing this site's flicker were spent inferring what a
// Samsung tablet was doing from a laptop, and emulation reproduces none of it — headless Chrome
// has a desktop GPU, no thermal limit and no mobile video decoder. The only way to know what a
// device is actually doing is to ask it, on the device, while the problem is happening.
//
// Everything here is read-only and cheap: one rAF that already had to run, and a handful of
// property reads. It must not perturb what it is measuring, so there are no layout reads
// (getBoundingClientRect, offsetWidth) anywhere in the loop.
export default function Diagnostics() {
  const [on] = useState(() => /[?&]diag(?:&|=|$)/i.test(location.search))
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!on) return
    let raf = 0
    let last = performance.now()
    let frames = 0
    let slow = 0
    let worst = 0
    let windowStart = last
    let fps = 0
    let slowPct = 0

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = now - last
      last = now
      if (dt < 500) {
        frames++
        if (dt > 26) slow++
        if (dt > worst) worst = dt
      }
      if (now - windowStart >= 500) {
        fps = Math.round((frames * 1000) / (now - windowStart))
        slowPct = frames ? Math.round((slow / frames) * 100) : 0
        frames = slow = 0
        windowStart = now

        const el = ref.current
        if (el) {
          const v = document.querySelector('video')
          const vids = document.querySelectorAll('video')
          let playing = 0
          vids.forEach((x) => {
            if (!x.paused && !x.ended) playing++
          })
          const src = (v?.currentSrc || '').split('/').slice(-2).join('/')
          el.textContent = [
            BUILD_STAMP,
            `fps ${fps}  slow ${slowPct}%  worst ${Math.round(worst)}ms`,
            `view ${innerWidth}x${innerHeight} @${devicePixelRatio}  = ${Math.round(
              (innerWidth * devicePixelRatio * innerHeight * devicePixelRatio) / 1e6,
            )}MP`,
            `coarse ${matchMedia('(pointer: coarse)').matches}  calm ${document.documentElement.classList.contains('calm')}`,
            `video ${playing}/${vids.length} playing  ${src || '—'}`,
            `canvases ${document.querySelectorAll('canvas').length}  anims ${document.getAnimations?.().length ?? '?'}`,
            `cores ${navigator.hardwareConcurrency ?? '?'}  mem ${(navigator as any).deviceMemory ?? '?'}GB`,
          ].join('\n')
          worst = 0
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on])

  if (!on) return null
  return (
    <pre
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 99999,
        margin: 0,
        padding: '6px 8px',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        color: '#8bff3b',
        background: 'rgba(0,0,0,0.82)',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      measuring…
    </pre>
  )
}
