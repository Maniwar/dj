import { useEffect } from 'react'
import { AudioProvider } from './audio/AudioProvider'
import ThermalRunaway from './components/webgl/ThermalRunaway'
import FrictionOverlay from './components/FrictionOverlay'
import BootGate from './components/BootGate'
import EasterEggs from './components/EasterEggs'
import Player from './components/player/Player'
import Hero from './components/sections/Hero'
import Lore from './components/sections/Lore'
import Tracklist from './components/sections/Tracklist'
import Guestbook from './components/sections/Guestbook'
import TourArchive from './components/sections/TourArchive'
import HallOfFame from './components/sections/HallOfFame'
import Merch from './components/sections/Merch'
import { BrandBar, Divider, Crest } from './components/Ornaments'
import { useSiteStore } from './state/useSiteStore'

export default function App() {
  const bumpHits = useSiteStore((s) => s.bumpHits)
  useEffect(() => {
    const id = setInterval(bumpHits, 4200) // hit-counter creeps up while you watch
    return () => clearInterval(id)
  }, [bumpHits])

  return (
    <AudioProvider>
      <ThermalRunaway />
      <FrictionOverlay />

      <div className="content">
        <BrandBar />
        <Hero />
        <Divider mark="❈" />
        <Lore />
        <Divider mark="✦" />
        <Tracklist />
        <Guestbook />
        <Divider mark="❈" />
        <TourArchive />
        <Divider mark="✦" />
        <HallOfFame />
        <Merch />
        <footer className="site-footer">
          <Crest small />
          <div className="marquee-track slow">
            <div className="marquee-run">
              STAY MOIST · DRINK WATER · THE SYNTHESIZER IS SO BIG · STAY MOIST · MIND THE BASS ·
              LIMITED EDITION · STAY MOIST · DRINK WATER · THE SYNTHESIZER IS SO BIG · STAY MOIST ·
              MIND THE BASS · LIMITED EDITION ·
            </div>
          </div>
          <p>
            © 2002–2004 EUROBEAT RECORDS · SYSTEM OVERLOAD · ALL MOISTURE RESERVED · a parody, lovingly
          </p>
        </footer>
      </div>

      <Player />
      <BootGate />
      <EasterEggs />
    </AudioProvider>
  )
}
