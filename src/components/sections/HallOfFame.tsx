const QUOTES = [
  ['“Physically the wettest album ever pressed.”', 'MOISTURE WEEKLY'],
  ['“I have never sweated harder at a desk.”', 'SYNTH GOD MONTHLY'],
  ['“The bass liquefied my fillings. 5 stars.”', 'RAVE HERALD'],
  ['“Dieter is not a god. But the synth IS so big.”', 'PITCHFORK-ish'],
  ['“Kiki G looked at me. I filed my taxes early.”', 'EURO DANCE DIGEST'],
  ['“Do not operate heavy machinery. Operate this.”', 'CLUB CIRCUIT'],
]

const DATES = [
  'IBIZA · TERRAZA DEL VAPOR — SOLD OUT',
  'TOKYO · SUB-BASEMENT 9 — SOLD OUT',
  'MIAMI · ROOFTOP CONDENSA — SOLD OUT',
  'BERLIN · THE ORIGINAL SAUNA — SOLD OUT',
  'REYKJAVÍK · GEYSIR ARENA — SOLD OUT',
  'DUBAI · INDOOR RAINFOREST — SOLD OUT',
]

export default function HallOfFame() {
  return (
    <section className="hof" id="press">
      <div className="hof-inner">
        <h2 className="section-title">HALL OF FAME</h2>
        <div className="marquee-track">
          <div className="marquee-run">
            {[...QUOTES, ...QUOTES].map((q, i) => (
              <span className="quote" key={i}>
                {q[0]} <b>— {q[1]}</b> &nbsp;✦&nbsp;
              </span>
            ))}
          </div>
        </div>
        <ul className="dates">
          {DATES.map((d) => (
            <li key={d}>
              <span className="date-txt">{d}</span>
              <span className="date-stamp">SOLD OUT</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
