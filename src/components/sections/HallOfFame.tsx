const QUOTES = [
  ['“Physically the wettest album ever pressed.”', 'MOISTURE WEEKLY'],
  ['“I have never sweated harder at a desk.”', 'SYNTH GOD MONTHLY'],
  ['“The bass liquefied my fillings. 5 stars.”', 'RAVE HERALD'],
  ['“Dieter is not a god. But the synth IS so big.”', 'PITCHFORK-ish'],
  ['“Kiki G looked at me. I filed my taxes early.”', 'EURO DANCE DIGEST'],
  ['“Do not operate heavy machinery. Operate this.”', 'CLUB CIRCUIT'],
  // Inner quotation is single — it was the same curly double as the pull-quote around it, which
  // renders as one quote closing early and the sentence falling apart.
  ['“We asked the Finn for a comment. He said ‘It is fine.’ We ran it as the headline.”', 'HELSINKI BEAT'],
  // NOT "Club Condensa, Berlin": Condensa is the Miami rooftop three lines down, and Berlin's
  // venue is The Original Sauna. One name, two cities, both printed on the same screen.
  ['“Rated our sauna a 2. We have closed the venue.”', 'CLUB KONDENSATOR, HAMBURG'],
]

// No "— SOLD OUT" here: each row also renders the rotated red .date-stamp, so carrying it in the
// string too printed it twice on every line.
const DATES = [
  'IBIZA · TERRAZA DEL VAPOR',
  'TOKYO · SUB-BASEMENT 9',
  'MIAMI · ROOFTOP CONDENSA',
  'BERLIN · THE ORIGINAL SAUNA',
  'REYKJAVÍK · GEYSIR ARENA',
  'DUBAI · INDOOR RAINFOREST',
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
