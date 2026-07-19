import { useRef } from 'react'
import { LORE_CHAPTERS } from '../../data/lore'

// The VIP Lounge — cramped, dark, lit only by the cursor spotlight.
export default function Lore() {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <section className="lore" id="lore" ref={ref} onPointerMove={onMove}>
      <div className="lore-spotlight" aria-hidden />
      <div className="lore-inner">
        <h2 className="section-title">THE VIP LOUNGE</h2>
        <p className="section-kicker">
          move your cursor to find the light. mind the puddles.
        </p>
        <div className="lore-grid">
          {LORE_CHAPTERS.map((c) => (
            <article className="lore-card" key={c.id}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
