import { lazy, Suspense, useEffect } from 'react'
import { AudioProvider } from './audio/AudioProvider'
import Broadcast from './video/Broadcast'
import BootGate from './components/BootGate'
import EasterEggs from './components/EasterEggs'
import Player from './components/player/Player'
import Hero from './components/sections/Hero'
import Lore from './components/sections/Lore'
import Tracklist from './components/sections/Tracklist'
import Guestbook from './components/sections/Guestbook'
import TourJourney from './components/sections/TourJourney'
import HallOfFame from './components/sections/HallOfFame'
import Merch from './components/sections/Merch'
import { BrandBar, Crest } from './components/Ornaments'
import AudioReactive from './components/AudioReactive'
import LyricMarquee from './components/LyricMarquee'
import LyricStage from './components/LyricStage'
import Precache from './components/Precache'
import PauseOffscreen from './components/PauseOffscreen'
import BeatCursor from './components/BeatCursor'
import SectionCut from './components/SectionCut'
import VisualizerMode from './components/VisualizerMode'
import { startAutoProfile } from './perf/autoProfile'
import { PERF } from './lib/perfFlags'
import { startVideoDirector } from './lib/videoDirector'
import DiagPanel from './perf/DiagPanel'
import TourRail from './components/TourRail'
import Lyrics from './components/player/Lyrics'
import { useSiteStore } from './state/useSiteStore'

// three.js + @react-three/fiber are ~330KB gzipped and by far the heaviest thing we ship, and
// initialising the renderer (WebGLRenderer.setSize allocating buffers) is the single longest
// synchronous block on the page. Statically imported it sat on the critical path, delaying the
// first paint of a screen that does not even show it.
//
// The light rig lives BEHIND the boot gate — nobody sees the club until they press LOG ON — so
// it can load during the boot sequence instead of before it. Mounting is gated on loggedOn,
// which means the chunk is fetched and the renderer built while the console is still scrolling,
// and the gate's own paint no longer waits on any of it.
const ThermalRunaway = lazy(() => import('./components/webgl/ThermalRunaway'))

export default function App() {
  // ?nofx=<class> — isolation switch, see the ISOLATION block in index.css
  useEffect(() => {
    if (PERF.nofx) document.documentElement.classList.add(`nofx-${PERF.nofx}`)
  }, [])

  // Measure real frame time and step DOWN the profile ladder if this device cannot keep up.
  // Guessing the device class from media queries was wrong three times in a row; this asks the
  // machine instead — and it asks about the TAIL, because the page held a clean 60fps average
  // on both devices that actually have the problem. It stands down entirely if the URL or a
  // stored choice has already decided. Replaces startCalmMode(), which is deleted.
  useEffect(() => startAutoProfile(), [])
  // Nine <video> elements exist; only the most visible one is allowed to decode.
  useEffect(() => startVideoDirector(), [])

  const bumpHits = useSiteStore((s) => s.bumpHits)
  const loggedOn = useSiteStore((s) => s.loggedOn)
  const booting = useSiteStore((s) => s.booting)

  // Pause everything behind the boot gate. Mounting early stays — that is what precaches during
  // the boot sequence — but nothing behind an opaque overlay needs to animate. Measured: 27
  // running animations on the login screen, none of them visible to anyone.
  const behindGate = !loggedOn || booting
  useEffect(() => {
    document.documentElement.classList.toggle('gated', behindGate)
  }, [behindGate])


  useEffect(() => {
    const id = setInterval(bumpHits, 4200) // hit-counter creeps up while you watch
    return () => clearInterval(id)
  }, [bumpHits])

  return (
    <AudioProvider>
      <AudioReactive />
      <Broadcast />
      {loggedOn && (
        <Suspense fallback={null}>
          <ThermalRunaway />
        </Suspense>
      )}
      <LyricStage />
      <SectionCut />
      <Precache />
      <PauseOffscreen />
      <BeatCursor />
      <VisualizerMode />
      {/* Renders into its own shadow root hung off <html>, so it is not affected by — and cannot
          affect — anything in .content. Opens on ?diag or five taps on the crest. */}
      <DiagPanel />
      {/* FrictionOverlay used to mount here: a permanently-present fixed layer at z-30 carrying
          CRT scanlines, a 0.72-black vignette and a 7Hz shake, over the whole page. The knob it
          served is now the master intensity dial (src/perf/intensity.ts) and reaches the page
          through --fx and the audio variables, so there is nothing left for the layer to do. */}

      <div className="content">
        <BrandBar />
        <Hero />
        <LyricMarquee tint="magenta" offset={0} />
        <Lore />
        <LyricMarquee tint="acid" offset={3} pxPerSec={95} />
        <Tracklist />
        <Guestbook />
        <LyricMarquee tint="blue" offset={6} />
        <TourJourney />
        <LyricMarquee tint="magenta" offset={9} pxPerSec={55} />
        <HallOfFame />
        <Merch />
        <footer className="site-footer">
          <Crest small />
          <LyricMarquee tint="acid" offset={2} pxPerSec={45} />
          <p>
            © 2002–2004 EUROBEAT RECORDS · SYSTEM OVERLOAD · ALL MOISTURE RESERVED · a parody, lovingly
          </p>
        </footer>
      </div>

      <Player />
      <Lyrics />
      <TourRail />
      <BootGate />
      <EasterEggs />
    </AudioProvider>
  )
}
