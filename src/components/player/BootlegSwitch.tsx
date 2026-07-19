import type { Track } from '../../data/types'
import { useAudio } from '../../audio/AudioProvider'

// Adapts to the real data:
//   1 version  -> rusted / disabled ("NO BOOTLEG PRESSED")
//   2 versions -> classic A/B throw switch
//   3+ versions-> multi-position selector (e.g. "Synthesizer Is So Big" has 4)
export default function BootlegSwitch({
  track,
  currentVersionId,
}: {
  track: Track | undefined
  currentVersionId: string | null
}) {
  const audio = useAudio()

  if (!track) {
    return (
      <div className="bootleg disabled" title="Load a track to swap pressings">
        <span className="bootleg-label">BOOTLEG</span>
        <div className="bootleg-track"><span className="knob" /></div>
      </div>
    )
  }

  if (track.versionCount === 1) {
    return (
      <div className="bootleg rusted" title="NO BOOTLEG PRESSED — one official cut only">
        <span className="bootleg-label">BOOTLEG</span>
        <div className="bootleg-track single">
          <span className="knob" />
        </div>
        <span className="bootleg-note">SEIZED</span>
      </div>
    )
  }

  const idx = Math.max(
    0,
    track.versions.findIndex((v) => v.id === currentVersionId),
  )

  return (
    <div className={`bootleg live n${track.versionCount}`}>
      <span className="bootleg-label">
        BOOTLEG {track.versionCount > 2 ? `×${track.versionCount}` : ''}
      </span>
      <div
        className="bootleg-track"
        style={{ ['--pos' as any]: idx, ['--count' as any]: track.versions.length }}
      >
        {track.versions.map((v, i) => (
          <button
            key={v.id}
            className={`detent ${i === idx ? 'on' : ''}`}
            title={`${v.label} — ${v.vibe}`}
            aria-pressed={i === idx}
            onClick={() => audio.setVersion(v.id)}
          >
            <span className="detent-badge">{v.badge}</span>
          </button>
        ))}
        <span className="knob" aria-hidden />
      </div>
      <span className="bootleg-current">{track.versions[idx]?.label}</span>
    </div>
  )
}
