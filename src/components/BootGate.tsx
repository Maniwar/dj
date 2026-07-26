import { useEffect, useState } from 'react'
import { useSiteStore } from '../state/useSiteStore'
import { useAudio } from '../audio/AudioProvider'
import { usePlayerStore, randomVersionId } from '../state/usePlayerStore'
import { BUILD_STAMP } from '../version'
import { bootAssets, warm, connectionAllowsPrefetch } from '../lib/preload'

const BOOT_LINES = [
  'DIALING EUROBEAT RECORDS MAINFRAME... ▓▓▓▓▓▓▓',
  'HANDSHAKE @ 56.6 kbps ... OK',
  'MOUNTING /mp3 ... 19 TRACKS / 39 PRESSINGS FOUND',
  'CALIBRATING HUMIDITY SENSORS ... 94% RH',
  'WARMING DRUM MACHINE ... DO NOT TOUCH THE COILS',
  'KIKI G IS ONLINE ●   DIETER IS ONLINE ●',
  'SYSTEM OVERLOAD READY. STAY MOIST.',
]

// The boot console was pure theatre on a fixed timer while the real assets loaded whenever they
// felt like it. Now it's the actual load sequence: the bar reports real bytes landing, and the
// door opens when the mainstage is genuinely warm — bounded at both ends so it still reads as a
// sequence on a fast pipe and never traps anyone on a slow one.
const MIN_BOOT_MS = 2600
const MAX_BOOT_MS = 9000

export default function BootGate() {
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const booting = useSiteStore((s) => s.booting)
  const logOn = useSiteStore((s) => s.logOn)
  const finishBoot = useSiteStore((s) => s.finishBoot)
  const audio = useAudio()
  const [line, setLine] = useState(0)
  const [progress, setProgress] = useState(0)

  // Lock page scroll while the gate/boot overlay covers the screen — the fixed overlay hides
  // the page but the document behind it was still scrollable. Restore on log-on.
  useEffect(() => {
    if (loggedOn && !booting) return
    const html = document.documentElement
    const body = document.body
    const prev = { html: html.style.overflow, body: body.style.overflow }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev.html
      body.style.overflow = prev.body
    }
  }, [loggedOn, booting])

  useEffect(() => {
    if (!booting) return
    setLine(0)
    setProgress(0)

    const started = performance.now()
    let ready = false
    if (connectionAllowsPrefetch()) {
      warm(bootAssets(), (p) => {
        setProgress(p)
        if (p >= 1) ready = true
      })
    } else {
      // metered or 2G: don't speculatively download anything, just play the sequence
      ready = true
      setProgress(1)
    }

    const iv = setInterval(() => {
      setLine((l) => Math.min(l + 1, BOOT_LINES.length - 1))
      const elapsed = performance.now() - started
      if (elapsed >= MIN_BOOT_MS && (ready || elapsed >= MAX_BOOT_MS)) {
        clearInterval(iv)
        finishBoot()
      }
    }, 360)
    return () => clearInterval(iv)
  }, [booting, finishBoot])

  if (loggedOn && !booting) return null

  const handleLogOn = () => {
    logOn()
    // the required first user gesture -> start the continuous global stream on a RANDOM
    // track so the album doesn't open on the same song every visit.
    const tracks = usePlayerStore.getState().tracks
    const first = tracks[Math.floor(Math.random() * tracks.length)]
    // and a random pressing of it, so first boot can open on a bootleg rather than always an A-side
    audio.playTrack(first.slug, randomVersionId(first.slug))
  }

  return (
    <div className={`boot-gate ${booting ? 'booting' : ''}`}>
      <div className="boot-inner">
        <div className="boot-logo">
          <span className="drip">CLUB HUMIDITY</span>
          <span className="boot-sub">SYSTEM OVERLOAD // THE MOIST MIX 2002</span>
          <span className="boot-ver">BUILD {BUILD_STAMP}</span>
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
              {/* real download progress, floored by the line count so the bar always moves */}
              <span
                style={{
                  width: `${Math.max(progress, (line + 1) / BOOT_LINES.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
