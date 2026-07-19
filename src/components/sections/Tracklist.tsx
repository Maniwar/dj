import { usePlayerStore } from '../../state/usePlayerStore'
import { useAudio } from '../../audio/AudioProvider'

export default function Tracklist() {
  const audio = useAudio()
  const tracks = usePlayerStore((s) => s.tracks)
  const currentSlug = usePlayerStore((s) => s.currentTrackSlug)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  return (
    <section className="tracklist" id="tracks">
      <div className="tl-inner">
        <h2 className="section-title">THE TRACKLIST</h2>
        <p className="section-kicker">
          19 tracks · 39 pressings · flip any bootleg live in the player ↙
        </p>
        <ol className="tl-list">
          {tracks.map((t, i) => {
            const active = t.slug === currentSlug
            return (
              <li key={t.slug} className={`tl-row ${active ? 'active' : ''}`}>
                <button className="tl-play" onClick={() => audio.playTrack(t.slug)} aria-label={`Play ${t.title}`}>
                  {active && isPlaying ? '❚❚' : '▶'}
                </button>
                <span className="tl-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="tl-title">{t.title}</span>
                <span className="tl-versions">
                  {t.versions.map((v) => (
                    <button
                      key={v.id}
                      className="tl-badge"
                      title={`${v.label} — ${v.vibe}`}
                      onClick={() => audio.playTrack(t.slug, v.id)}
                    >
                      {v.badge}
                    </button>
                  ))}
                  {!t.hasBootleg && <span className="tl-orphan" title="No bootleg exists">◦ SOLE CUT</span>}
                </span>
                {active && <span className="tl-eq" aria-hidden><i /><i /><i /><i /></span>}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
