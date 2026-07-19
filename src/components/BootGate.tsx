import { useEffect, useState } from 'react'
import { useSiteStore } from '../state/useSiteStore'
import { useAudio } from '../audio/AudioProvider'
import { usePlayerStore } from '../state/usePlayerStore'

const BOOT_LINES = [
  'DIALING EUROBEAT RECORDS MAINFRAME... ▓▓▓▓▓▓▓',
  'HANDSHAKE @ 56.6 kbps ... OK',
  'MOUNTING /mp3 ... 19 TRACKS / 39 PRESSINGS FOUND',
  'CALIBRATING HUMIDITY SENSORS ... 94% RH',
  'WARMING DRUM MACHINE ... DO NOT TOUCH THE COILS',
  'KIKI G IS ONLINE ●   DIETER IS ONLINE ●',
  'SYSTEM OVERLOAD READY. STAY MOIST.',
]

export default function BootGate() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const booting = useSiteStore((s) => s.booting)
  const logOn = useSiteStore((s) => s.logOn)
  const finishBoot = useSiteStore((s) => s.finishBoot)
  const audio = useAudio()
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (!booting) return
    setLine(0)
    const iv = setInterval(() => {
      setLine((l) => {
        if (l >= BOOT_LINES.length - 1) {
          clearInterval(iv)
          setTimeout(finishBoot, 650)
          return l
        }
        return l + 1
      })
    }, 360)
    return () => clearInterval(iv)
  }, [booting, finishBoot])

  if (loggedOn && !booting) return null

  const handleLogOn = () => {
    logOn()
    // the required first user gesture -> start the continuous global stream
    const first = usePlayerStore.getState().tracks[0]
    audio.playTrack(first.slug)
  }

  return (
    <div className={`boot-gate ${booting ? 'booting' : ''}`}>
      <div className="boot-inner">
        <div className="boot-logo">
          <span className="drip">CLUB HUMIDITY</span>
          <span className="boot-sub">SYSTEM OVERLOAD // THE MOIST MIX 2002</span>
        </div>

        {!booting ? (
          <>
            <p className="boot-tag">
              MULTI-PLATINUM · MOISTURE-LADEN · LIMITED EDITION
            </p>
            <button className="logon-btn" onClick={handleLogOn}>
              <span className="logon-glow" />
              ▸ LOG ON &amp; PLUG IN
            </button>
            <p className="boot-warn">
              ⚠ CONTAINS EXTREME HUMIDITY. HEADPHONES WILL FOG. AUDIO BEGINS ON ENTRY.
            </p>
          </>
        ) : (
          <div className="boot-console" role="status" aria-live="polite">
            {BOOT_LINES.slice(0, line + 1).map((l, i) => (
              <div key={i} className="boot-line">
                <span className="prompt">C:\SO&gt;</span> {l}
              </div>
            ))}
            <div className="boot-bar">
              <span style={{ width: `${((line + 1) / BOOT_LINES.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
