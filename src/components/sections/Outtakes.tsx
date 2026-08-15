import { OUTTAKES } from '../../data/outtakes'
import { withBase } from '../../lib/asset'

// THE OUTTAKES — a contact sheet from the Eurobeat Records archive. Every frame of the Finn
// we hold, each with the note the archivist filed against it. Images are lazy-loaded: there
// are fourteen of them and they sit well below the fold.
export default function Outtakes() {
  return (
    <section className="outtakes" id="outtakes">
      <div className="ot-inner">
        <h2 className="section-title">THE OUTTAKES</h2>
        <p className="section-kicker">
          eurobeat records archive · roll 07 · contact sheet · do not print
        </p>

        <div className="ot-grid">
          {OUTTAKES.map((o, i) => (
            <figure className="ot-card" key={o.id}>
              <div className="ot-media">
                <img
                  className="ot-img"
                  src={withBase(o.image)}
                  alt={o.title}
                  loading="lazy"
                  decoding="async"
                />
                <span className="ot-frame">FRAME {String(i + 1).padStart(2, '0')}</span>
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
          ● {OUTTAKES.length} frames · 1 subject · 0 smiles on file
        </p>
      </div>
    </section>
  )
}
