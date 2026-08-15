import { useMemo, useState } from 'react'
import { OUTTAKES, WHO_LABEL, type Who } from '../../data/outtakes'
import { withBase } from '../../lib/asset'

// THE OUTTAKES — a contact sheet from the Eurobeat Records archive covering the whole band,
// interleaved so no single member owns it. The filter chips are the cheap way to let someone
// follow one character without splitting the sheet into four blocks that each read as "their"
// section. Images are lazy-loaded: there are 32 of them and they sit well below the fold.
const ORDER: Who[] = ['kiki', 'dieter', 'crew', 'jussi']

export default function Outtakes() {
  const [who, setWho] = useState<Who | 'all'>('all')
  const shown = useMemo(
    () => (who === 'all' ? OUTTAKES : OUTTAKES.filter((o) => o.who === who)),
    [who],
  )
  const counts = useMemo(() => {
    const c = {} as Record<Who, number>
    for (const o of OUTTAKES) c[o.who] = (c[o.who] ?? 0) + 1
    return c
  }, [])

  return (
    <section className="outtakes" id="outtakes">
      <div className="ot-inner">
        <h2 className="section-title">THE OUTTAKES</h2>
        <p className="section-kicker">
          eurobeat records archive · roll 07 · contact sheet · do not print
        </p>

        <div className="ot-filters" role="group" aria-label="Filter outtakes by member">
          <button
            className={`ot-chip ${who === 'all' ? 'on' : ''}`}
            onClick={() => setWho('all')}
            aria-pressed={who === 'all'}
          >
            EVERYONE <span className="ot-count">{OUTTAKES.length}</span>
          </button>
          {ORDER.map((w) => (
            <button
              key={w}
              className={`ot-chip who-${w} ${who === w ? 'on' : ''}`}
              onClick={() => setWho(w)}
              aria-pressed={who === w}
            >
              {WHO_LABEL[w]} <span className="ot-count">{counts[w] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="ot-grid">
          {shown.map((o, i) => (
            <figure className={`ot-card who-${o.who}`} key={o.id}>
              <div className="ot-media">
                <img
                  className="ot-img"
                  src={withBase(o.image)}
                  alt={`${WHO_LABEL[o.who]} — ${o.title}`}
                  loading="lazy"
                  decoding="async"
                />
                <span className="ot-frame">FRAME {String(i + 1).padStart(2, '0')}</span>
                <span className="ot-who">{WHO_LABEL[o.who]}</span>
                <span className="ot-scan" aria-hidden />
              </div>
              <figcaption className="ot-cap">
                <h3 className="ot-title">{o.title}</h3>
                <p className="ot-note">{o.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="ot-foot">
          ● {shown.length} frame{shown.length === 1 ? '' : 's'} · {ORDER.length} members ·
          {' '}0 smiles on file from the Finn
        </p>
      </div>
    </section>
  )
}
