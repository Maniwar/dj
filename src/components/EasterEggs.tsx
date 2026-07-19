import { useEffect, useState } from 'react'
import { useSiteStore } from '../state/useSiteStore'
import { audioBus } from '../audio/audioBus'

const KONAMI = [
  'ArrowUp','ArrowUp','ArrowDown','ArrowDown',
  'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a',
]

// Hidden Y2K secrets:
//  • Konami code -> SAUNA MODE (max humidity, extra steam, pink everything)
//  • hold "H" -> manually spike the rig temperature toward a meltdown
export default function EasterEggs() {
  const toggleSauna = useSiteStore((s) => s.toggleSauna)
  const saunaMode = useSiteStore((s) => s.saunaMode)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let idx = 0
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      idx = k === KONAMI[idx] ? idx + 1 : k === KONAMI[0] ? 1 : 0
      if (idx === KONAMI.length) {
        idx = 0
        toggleSauna()
        setToast('🧖 SAUNA MODE ENGAGED — 100% RELATIVE HUMIDITY')
        setTimeout(() => setToast(null), 3200)
      }
      if (k === 'h') {
        audioBus.thermal.temperature = Math.min(125, audioBus.thermal.temperature + 8)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSauna])

  useEffect(() => {
    document.body.classList.toggle('sauna', saunaMode)
  }, [saunaMode])

  return (
    <>
      {toast && <div className="egg-toast">{toast}</div>}
      <div className="secret-hint" title="try the konami code… ↑↑↓↓←→←→ B A">░</div>
    </>
  )
}
