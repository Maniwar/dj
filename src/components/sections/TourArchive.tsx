import { TOUR_CLIPS } from '../../data/tour.manifest'
import type { TourClip } from '../../data/types'
import { useAtlasCloudAsset } from '../../hooks/useAtlasCloudAsset'

function ClipCard({ clip }: { clip: TourClip }) {
  const asset = useAtlasCloudAsset(clip)

  return (
    <article className={`tour-card status-${asset.status}`}>
      <div className="tour-media">
        {/* poster still (Gemini) always present; video swaps in when ready */}
        <div
          className="tour-poster"
          style={{ backgroundImage: clip.posterUrl ? `url(${clip.posterUrl})` : undefined }}
          data-city={clip.city}
        >
          {!clip.posterUrl && <span className="poster-fallback">{clip.city}</span>}
        </div>

        {asset.status === 'ready' && asset.mp4Url ? (
          <video
            className="tour-video"
            src={asset.mp4Url}
            poster={clip.posterUrl}
            muted
            loop
            playsInline
            autoPlay
          />
        ) : asset.status === 'ready' ? (
          <div className="tour-ready-note">▶ LEAKED FOOTAGE RECOVERED</div>
        ) : asset.status === 'error' ? (
          <div className="tour-overlay err">
            <span className="vhs-glitch">⚠ SIGNAL LOST</span>
            <span className="tour-err-msg">{asset.error}</span>
            <button className="retry-btn" onClick={asset.retry}>
              ↻ RE-RENDER RAVE
            </button>
          </div>
        ) : (
          <div className="tour-overlay">
            <span className="vhs-tracking">
              {asset.status === 'queued' ? 'QUEUED IN RENDER FARM…' : 'RENDERING RAVE…'}
            </span>
            <div className="render-bar">
              <span style={{ width: `${asset.progress}%` }} />
            </div>
            <span className="render-pct">{Math.round(asset.progress)}%</span>
          </div>
        )}

        <div className="tour-stamp">● REC &nbsp; {clip.city} · {clip.year}</div>
        <div className="tour-scanlines" aria-hidden />
      </div>
      <div className="tour-caption">
        <h3>
          {clip.city} <span className="tour-venue">— {clip.venue}</span>
        </h3>
        <p>{clip.blurb}</p>
        <span className="tour-seed">seed·{clip.seed} · same super-fans, every city</span>
      </div>
    </article>
  )
}

export default function TourArchive() {
  return (
    <section className="tour" id="tour">
      <div className="tour-inner">
        <h2 className="section-title">THE GLOBAL MELTDOWN</h2>
        <p className="section-kicker">
          worldwide dominance · leaked VHS &amp; club-doc footage · character-locked super-fans
        </p>
        <div className="tour-grid">
          {TOUR_CLIPS.map((c) => (
            <ClipCard key={c.id} clip={c} />
          ))}
        </div>
      </div>
    </section>
  )
}
