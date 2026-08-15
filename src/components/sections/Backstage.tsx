import { useMemo, useState } from 'react'
import { BACKSTAGE, WHO_LABEL, type Who } from '../../data/backstage'
import { withBase } from '../../lib/asset'

// BACKSTAGE — the Eurobeat Records archive: the band off duty, covering all four members and
// interleaved so no single member owns it. The filter chips are the cheap way to let someone
// follow one character without splitting the sheet into four blocks that each read as "their"
// section. Images are lazy-loaded: there are 32 of them and they sit well below the fold.
const ORDER: Who[] = ['kiki', 'dieter', 'crew', 'jussi']

export default function Backstage() {
  const [who, setWho] = useState<Who | 'all'>('all')
  const shown = useMemo(
    () => (who === 'all' ? BACKSTAGE : BACKSTAGE.filter((o) => o.who === who)),
    [who],
  )
  const counts = useMemo(() => {
    const c = {} as Record<Who, number>
    for (const o of BACKSTAGE) c[o.who] = (c[o.who] ?? 0) + 1
    return c
  }, [])

  return (
    <section className="backstage" id="backstage">
      <div className="bs-inner">
        <h2 className="section-title">BACKSTAGE</h2>
        <p className="section-kicker">
          eurobeat records archive · roll 07 · off duty, off the record
        </p>

        <div className="bs-filters" role="group" aria-label="Filter backstage frames by member">
          <button
            className={`bs-chip ${who === 'all' ? 'on' : ''}`}
            onClick={() => setWho('all')}
            aria-pressed={who === 'all'}
          >
            EVERYONE <span className="bs-count">{BACKSTAGE.length}</span>
          </button>
          {ORDER.map((w) => (
            <button
              key={w}
              className={`bs-chip who-${w} ${who === w ? 'on' : ''}`}
              onClick={() => setWho(w)}
              aria-pressed={who === w}
            >
              {WHO_LABEL[w]} <span className="bs-count">{counts[w] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="bs-grid">
          {shown.map((o, i) => (
            <figure className={`bs-card who-${o.who}`} key={o.id}>
              <div className="bs-media">
                <img
                  className="bs-img"
                  src={withBase(o.image)}
                  alt={`${WHO_LABEL[o.who]} — ${o.title}`}
                  loading="lazy"
                  decoding="async"
                />
                <span className="bs-frame">FRAME {String(i + 1).padStart(2, '0')}</span>
                <span className="bs-who">{WHO_LABEL[o.who]}</span>
                <span className="bs-scan" aria-hidden />
              </div>
              <figcaption className="bs-cap">
                <h3 className="bs-title">{o.title}</h3>
                <p className="bs-note">{o.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="bs-foot">
          ● {shown.length} frame{shown.length === 1 ? '' : 's'} · {ORDER.length} members ·
          {' '}0 smiles on file from the Finn
        </p>
      </div>
    </section>
  )
}
