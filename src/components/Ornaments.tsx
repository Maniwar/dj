// Baroque gold ornaments used throughout for the farcical-luxury framing.

export function Crest({ small = false }: { small?: boolean }) {
  return (
    <div className="crest" style={small ? { transform: 'scale(0.7)' } : undefined}>
      <div className="ring">
        <span className="mono gold-text">SO</span>
      </div>
      <span className="banner">EST. MMII · BERLIN</span>
    </div>
  )
}

export function Divider({ mark = '❈' }: { mark?: string }) {
  return (
    <div className="divider" aria-hidden>
      <span />
      <em className="mark">{mark}</em>
      <span />
    </div>
  )
}

export function BrandBar() {
  return (
    <div className="brandbar" role="note">
      <span>Purveyors of Moisture to the Crowned Heads of Europe</span>
      <span className="sep">✦</span>
      <span>By Appointment · Eurobeat Records</span>
      <span className="sep">✦</span>
      <span>Multi-Platinum · Limited Edition</span>
    </div>
  )
}
