import { useEffect, useRef, useState } from 'react'
import { audioBus } from '../audio/audioBus'
import { withBase } from '../lib/asset'
import { PERF } from '../lib/perfFlags'
import { usePlayerStore } from '../state/usePlayerStore'
import { useSiteStore } from '../state/useSiteStore'
import { sceneForTrack, hydrateRealVideo, type Scene } from './broadcastFrames'

// Persistent, always-muted "leaked club footage" behind the whole site. Turns Gemini
// stills into moving video via Ken-Burns motion + BEAT-SYNCED hard-cuts + VHS glitch +
// strobes. Always shows the CURRENT track's city. If a real AtlasCloud mp4 exists for the
// scene, it plays that (muted) instead of the montage. The player's MP3 is the only sound.

// Calmer cut cadence on mobile — rapid full-screen background swaps are what flicker on
// phones. Keeps the effect (footage still cuts + Ken-Burns), just far less frantic.
const MIN_CUT_MS = PERF.isMobile ? 1500 : 520 // don't cut faster than this even on dense beats
const MAX_HOLD_MS = PERF.isMobile ? 6500 : 4200 // force a cut at least this often

export default function Broadcast() {
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const reduced = useSiteStore((s) => s.reducedMotion)

  const [scene, setScene] = useState<Scene>(() => sceneForTrack(null))
  const [frameIdx, setFrameIdx] = useState(0)
  const [showA, setShowA] = useState(true) // which layer is on top (crossfade A/B)
  const [aSrc, setASrc] = useState(scene.frames[0])
  const [bSrc, setBSrc] = useState(scene.frames[1 % scene.frames.length])

  const rootRef = useRef<HTMLDivElement>(null)
  const lastCut = useRef(0)
  const clock = useRef(0)
  const idxRef = useRef(0)

  useEffect(() => {
    hydrateRealVideo().then(() => setScene(sceneForTrack(slug)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pre-decode every frame of the current scene so a beat-cut swaps to an already-decoded
  // background instead of flashing while it decodes (the mobile flicker, isolated via
  // ?nobroadcast). Cheap: the scenes reuse a handful of images.
  useEffect(() => {
    scene.frames.forEach((f) => {
      const img = new Image()
      img.decoding = 'async'
      img.src = withBase(f)
    })
  }, [scene])

  // scene follows the current track (hard glitch-cut on change)
  useEffect(() => {
    const next = sceneForTrack(slug)
    setScene(next)
    idxRef.current = 0
    setFrameIdx(0)
    setASrc(next.frames[0])
    setBSrc(next.frames[1 % next.frames.length])
    setShowA(true)
    const el = rootRef.current
    if (el) {
      el.classList.remove('glitch-cut')
      // force reflow to restart the animation
      void el.offsetWidth
      el.classList.add('glitch-cut')
    }
  }, [slug])

  // advance frames on the beat
  const doCut = () => {
    const frames = sceneForTrack(usePlayerStore.getState().currentTrackSlug).frames
    const next = (idxRef.current + 1) % frames.length
    idxRef.current = next
    setFrameIdx(next)
    setShowA((prev) => {
      // load the incoming frame into the hidden layer, then flip
      if (prev) setBSrc(frames[next])
      else setASrc(frames[next])
      return !prev
    })
    const el = rootRef.current
    if (el) {
      el.classList.remove('glitch-cut')
      void el.offsetWidth
      el.classList.add('glitch-cut')
    }
  }

  useEffect(() => {
    if (reduced || scene.mp4) return // reduced motion or real video -> no still-cutting
    let raf = 0
    let prev = performance.now()
    const loop = (now: number) => {
      const dt = now - prev
      prev = now
      clock.current += dt
      const sinceCut = now - lastCut.current
      const beat = audioBus.bands.beat
      const strong = beat > 0.35 && sinceCut > MIN_CUT_MS
      const stale = sinceCut > MAX_HOLD_MS
      if ((strong || stale) && audioBus.playing) {
        lastCut.current = now
        doCut()
      }
      // drive strobe + chroma via CSS vars from the live beat
      const el = rootRef.current
      if (el) el.style.setProperty('--beat', beat.toFixed(3))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, scene.mp4, scene.key])

  if (PERF.noBroadcast) return null // ?nobroadcast — isolate the footage layer when debugging

  return (
    <div
      ref={rootRef}
      className={`broadcast ${loggedOn ? 'live' : 'idle'}`}
      aria-hidden
      data-city={scene.city}
    >
      {scene.mp4 ? (
        <video className="bc-video" src={withBase(scene.mp4)} autoPlay muted loop playsInline />
      ) : (
        <>
          {/* stable divs (no key on src change) so a beat-cut swaps the backgroundImage
              in place instead of remounting + re-decoding the frame (the mobile flash) */}
          <div
            className={`bc-frame ${showA ? 'on' : ''}`}
            style={{ backgroundImage: `url(${withBase(aSrc)})` }}
          />
          <div
            className={`bc-frame ${!showA ? 'on' : ''}`}
            style={{ backgroundImage: `url(${withBase(bSrc)})` }}
          />
        </>
      )}
      {/* club-atmosphere overlays */}
      <div className="bc-strobe" />
      <div className="bc-grain" />
      <div className="bc-scan" />
      <div className="bc-vignette" />
      <div className="bc-rec">
        ● REC &nbsp; {scene.city} &nbsp; · &nbsp; SO-CAM {String(frameIdx + 1).padStart(2, '0')}
      </div>
    </div>
  )
}
