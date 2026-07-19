import { useEffect } from 'react'
import { AudioProvider } from './audio/AudioProvider'
import Broadcast from './video/Broadcast'
import ThermalRunaway from './components/webgl/ThermalRunaway'
import FrictionOverlay from './components/FrictionOverlay'
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
import Lyrics from './components/player/Lyrics'
import { useSiteStore } from './state/useSiteStore'

export default function App() {
  const bumpHits = useSiteStore((s) => s.bumpHits)
  useEffect(() => {
    const id = setInterval(bumpHits, 4200) // hit-counter creeps up while you watch
    return () => clearInterval(id)
  }, [bumpHits])

  return (
    <AudioProvider>
      <AudioReactive />
      <Broadcast />
      <ThermalRunaway />
      <FrictionOverlay />

      <div className="content">
        <BrandBar />
        <Hero />
        <LyricMarquee tint="magenta" offset={0} />
        <Lore />
        <LyricMarquee tint="acid" offset={3} speed={28} />
        <Tracklist />
        <Guestbook />
        <LyricMarquee tint="blue" offset={6} />
        <TourJourney />
        <LyricMarquee tint="magenta" offset={9} speed={40} />
        <HallOfFame />
        <Merch />
        <footer className="site-footer">
          <Crest small />
          <LyricMarquee tint="acid" offset={2} speed={46} />
          <p>
            © 2002–2004 EUROBEAT RECORDS · SYSTEM OVERLOAD · ALL MOISTURE RESERVED · a parody, lovingly
          </p>
        </footer>
      </div>

      <Player />
      <Lyrics />
      <BootGate />
      <EasterEggs />
    </AudioProvider>
  )
}
