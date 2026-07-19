const ITEMS = [
  { emoji: '🧴', name: 'Signature Thermal Paste', price: '€24', note: 'Arctic-grade. Smells of eucalyptus.' },
  { emoji: '🥋', name: 'Moisture-Wicking Tracksuit', price: '€89', note: 'Velvet top, technical bottom. Wolfgang-approved.' },
  { emoji: '🪣', name: 'The Cedar Bucket (Replica)', price: '€49', note: 'As dumped in Berlin, 2002. Water not included.' },
  { emoji: '💾', name: 'Bootleg Dubplate Blank', price: '€15', note: 'Cut your own white-label. Lathe sold separately.' },
  { emoji: '🕶️', name: "Wolfgang's Cheap Sunglasses", price: '€9', note: 'Genuinely cheap. That is the point.' },
  { emoji: '🌡️', name: 'Club Humidity Hygrometer', price: '€33', note: 'Reads 94% at all times. Possibly broken. Possibly correct.' },
]

export default function Merch() {
  return (
    <section className="merch" id="merch">
      <div className="merch-inner">
        <h2 className="section-title">THE MERCH TABLE</h2>
        <p className="section-kicker">everything is permanently, aggressively out of stock</p>
        <div className="merch-grid">
          {ITEMS.map((it) => (
            <div className="merch-card" key={it.name}>
              <div className="merch-emoji">{it.emoji}</div>
              <div className="merch-name">{it.name}</div>
              <div className="merch-note">{it.note}</div>
              <div className="merch-foot">
                <span className="merch-price">{it.price}</span>
                <button className="merch-btn" disabled>
                  SOLD OUT
                </button>
              </div>
              <div className="merch-sold" aria-hidden>
                SOLD OUT
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
