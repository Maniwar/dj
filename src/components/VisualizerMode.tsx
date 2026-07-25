import { useEffect } from 'react'
import { usePlayerStore, getTrack } from '../state/usePlayerStore'
import { useSiteStore } from '../state/useSiteStore'

// FULL-SCREEN TAKEOVER. The page falls away and the light rig plays on its own — the closest
// thing this site has to putting the visuals on the big screen at the back of the club.
// Everything that drives it is already running; this only removes what's in the way, so there
// is no second render path to keep in step.
export default function VisualizerMode() {
  const on = useSiteStore((s) => s.visualizer)
  const toggle = useSiteStore((s) => s.toggleVisualizer)
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const track = getTrack(slug)

  // V toggles, Escape always exits — a full-screen mode you can't leave by reflex is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')
      if (typing) return
      if (e.key === 'Escape' && useSiteStore.getState().visualizer) toggle()
      else if ((e.key === 'v' || e.key === 'V') && useSiteStore.getState().loggedOn) toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  // drive the page-level class so the content can fade without this component owning layout
  useEffect(() => {
    document.documentElement.classList.toggle('viz-on', on && loggedOn)
    return () => document.documentElement.classList.remove('viz-on')
  }, [on, loggedOn])

  if (!on || !loggedOn) return null
  return (
    <div className="viz-hud" role="dialog" aria-label="Visualizer">
      <div className="viz-now">{track ? track.title : 'SYSTEM OVERLOAD'}</div>
      <button className="viz-exit" onClick={toggle}>ESC · EXIT VISUALIZER</button>
    </div>
  )
}
