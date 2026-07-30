import { useEffect, useRef, useState } from 'react'
import { audioBus } from '../audio/audioBus'
import { withBase } from '../lib/asset'
import { videoSrc } from '../lib/videoRendition'
import { PERF } from '../lib/perfFlags'
import { useFxOn } from '../perf/useFx'
import { usePlayerStore } from '../state/usePlayerStore'
import { useSiteStore } from '../state/useSiteStore'
import { sceneForTrack, hydrateRealVideo, type Scene } from './broadcastFrames'

// Persistent, always-muted "leaked club footage" behind the whole site. Turns Gemini
// stills into moving video via Ken-Burns motion + BEAT-SYNCED hard-cuts + VHS glitch +
// strobes. Always shows the CURRENT track's city. If a real AtlasCloud mp4 exists for the
// scene, it plays that (muted) instead of the montage. The player's MP3 is the only sound.

// Cuts land on PHRASE boundaries, not on whatever beat crossed a threshold. An editor cuts on
// the 1 of a bar; cutting on arbitrary beats is what makes a montage read as noise instead of
// as a music video. 8 beats = 2 bars (~3.5s at 138 BPM); phones hold a shot twice as long.
const BEATS_PER_CUT = PERF.isMobile ? 16 : 8
// Fallback only — used until a tempo is established (or if onset tracking loses the plot).
const MAX_HOLD_MS = PERF.isMobile ? 8000 : 4600

export default function Broadcast() {
  const slug = usePlayerStore((s) => s.currentTrackSlug)
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const reduced = useSiteStore((s) => s.reducedMotion)

  const [scene, setScene] = useState<Scene>(() => sceneForTrack(null))
  const [frameIdx, setFrameIdx] = useState(0)
  const [showA, setShowA] = useState(true) // which layer is on top (crossfade A/B)
  const [aSrc, setASrc] = useState(scene.frames[0])
  const [bSrc, setBSrc] = useState(scene.frames[1 % scene.frames.length])
  const [vidIdx, setVidIdx] = useState(0)
  const vids = scene.mp4s ?? (scene.mp4 ? [scene.mp4] : [])
  // `bcVideo` off falls back to the SAME still frames the site already uses when no mp4 exists
  // for a scene — the composition, the tint and the beat-cuts are unchanged. That fallback is
  // why this switch can exist at all: hiding the <video> with CSS would leave a decoder running
  // behind a black page, which in a benchmark reads as "the video is free".
  //
  // ONE condition now, not two. The player's 🎬 button used to be a separate `videoEnabled` flag
  // ANDed in here, which meant the visitor's explicit choice and the perf ladder's decision were
  // two different channels that could contradict each other — and did: `minimal` switched
  // `bcVideo` off while the button went on claiming video was on. The button writes a per-effect
  // override now, so it arrives through this same class and outranks the profile by the ordinary
  // precedence rule. See the block above setVideoPreference in fxState.ts.
  const bcVideoOn = useFxOn('bcVideo')
  const useVideo = vids.length > 0 && bcVideoOn

  const rootRef = useRef<HTMLDivElement>(null)
  const lastCut = useRef(0)
  const clock = useRef(0)
  const idxRef = useRef(0)
  const lastBeatIdx = useRef(0) // so a cut fires once per phrase, not every frame of it

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
    setVidIdx(0)
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
    if (reduced || useVideo) return
    let raf = 0
    let prev = performance.now()
    const loop = (now: number) => {
      const dt = now - prev
      prev = now
      clock.current += dt
      const sinceCut = now - lastCut.current
      // Cut on the DOWNBEAT of every other bar: watch the beat counter and fire the frame a new
      // beat lands on a phrase boundary. Because beatIndex only advances on a detected kick,
      // the cut is locked to the track rather than to a wall-clock timer.
      const idx = audioBus.music.beatIndex
      const newBeat = idx !== lastBeatIdx.current
      lastBeatIdx.current = idx
      const onPhrase = newBeat && idx > 0 && idx % BEATS_PER_CUT === 0
      const stale = sinceCut > MAX_HOLD_MS // only bites before a tempo is known
      if ((onPhrase || stale) && audioBus.playing) {
        lastCut.current = now
        doCut()
      }
      // local chroma var kept in sync with the live kick (the strobe itself now answers on the
      // SNARE via --m-snare, so this only feeds the broadcast layer's own tinting)
      const el = rootRef.current
      if (el) el.style.setProperty('--beat', audioBus.bands.beat.toFixed(2))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, useVideo, scene.key])

  if (PERF.noBroadcast) return null // ?nobroadcast — isolate the footage layer when debugging

  return (
    <div
      ref={rootRef}
      className={`broadcast ${loggedOn ? 'live' : 'idle'}`}
      aria-hidden
      data-city={scene.city}
      /* The scan layer keys its video-only darkening off this. It used to use
         `.bc-video ~ .bc-scan`, which stopped matching the moment the media moved inside
         .bc-band — same fix, and the same attribute, as .lore-stop[data-media]. */
      data-media={useVideo ? 'video' : 'still'}
    >
      {/* Blurred side fill, BEHIND the band. Only visible past 2.5:1 or in a short landscape
          window, where the footage is a centred band and there is bar to fill — everywhere else
          .bc-fill is display:none and this div costs nothing. It shows the scene's FIRST frame
          rather than whichever one is on screen: see the .bc-fill comment in index.css (a
          background-image cannot cross-fade, so following the beat-cut would pop the sides).
          Deliberately NOT a second <video>: videoDirector.ts allows one decoder at a time. */}
      <div className="bc-fill" style={{ backgroundImage: `url(${withBase(scene.frames[0])})` }} />
      {/* The band is the static wrapper the soft edge hangs off. It cannot be the media itself —
          .bc-frame animates Ken-Burns, and a mask would be transformed along with it. */}
      <div className="bc-band">
        {useVideo ? (
          <video
            key={vids[vidIdx % vids.length]}
            className="bc-video"
            src={videoSrc(vids[vidIdx % vids.length])}
            autoPlay
            muted
            playsInline
            loop={vids.length === 1}
            onEnded={() => vids.length > 1 && setVidIdx((i) => (i + 1) % vids.length)}
          />
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
      </div>
      {/* club-atmosphere overlays */}
      {!PERF.bcOff.has('strobe') && <div className="bc-strobe" />}
      {!PERF.noGrain && !PERF.bcOff.has('grain') && <div className="bc-grain" />}
      {!PERF.bcOff.has('scan') && <div className="bc-scan" />}
      {!PERF.bcOff.has('vignette') && <div className="bc-vignette" />}
      {!PERF.bcOff.has('rec') && <div className="bc-rec">
        ● REC &nbsp; {scene.city} &nbsp; · &nbsp; SO-CAM {String(frameIdx + 1).padStart(2, '0')}
      </div>}
    </div>
  )
}
