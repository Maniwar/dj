// The Lore scroll-journey: two character HERO pages (Kiki, Dieter) followed by the origin
// story beats. Each stop is a full-bleed scene the reader scrolls through. `image` is the
// still (a real character ref for the heroes; story scenes get their own generated art).
// `videoKey` lets a stop swap its still for a muted looping clip once one exists.
export type LoreStop = {
  id: string
  kind: 'hero' | 'chapter'
  eyebrow: string
  title: string
  body: string
  image: string
  accent: 'kiki' | 'dieter' | 'both'
  videoKey?: string
}

export const LORE_STOPS: LoreStop[] = [
  {
    id: 'kiki',
    kind: 'hero',
    eyebrow: 'THE STAR · VOCALS · ATTITUDE · LIQUID COOLING',
    title: 'KIKI G',
    accent: 'kiki',
    image: '/assets/lore/kiki-hero.jpg',
    body: `Squeaky enough to shatter a champagne flute at forty paces. Discovered routing a fourteen-person LAN party while pouring a perfect foam heart — on roller skates — at Stockholm's premier dial-up cyber café. Wears silver because gold is for people who peaked. Has never once, not for a single second, been impressed by Dieter — which is the only reason this band still exists. Personally responsible for 100% of the moisture.`,
  },
  {
    id: 'dieter',
    kind: 'hero',
    eyebrow: 'THE MAESTRO · DECKS · SPOKEN WORD · THERMAL VIOLATIONS',
    title: 'DJ DIETER',
    accent: 'dieter',
    image: '/assets/lore/dieter-hero.jpg',
    body: `Former MIDI-workstation salesman of Munich; keeps all forty-one framed noise complaints above the decks. Believes — with his whole bare chest — that he IS a synthesizer. Communicates exclusively via a deep sleazy whisper and one thin, decisive moustache. The leather jacket has never been zipped. The sunglasses have never come off. Not even in the sauna. ESPECIALLY not in the sauna.`,
  },
  {
    id: 'munich',
    kind: 'chapter',
    eyebrow: 'CHAPTER I · MUNICH',
    title: 'THE SYNTH SALESMAN',
    accent: 'dieter',
    image: '/assets/lore/munich.jpg',
    body: `By day he moved MIDI-compatible workstations. By night he tested "vibrating low-end frequencies" in a soundproofed basement until the neighbours filed forty-one noise complaints. He framed every single one. He has never apologised. He never will.`,
  },
  {
    id: 'stockholm',
    kind: 'chapter',
    eyebrow: 'CHAPTER II · STOCKHOLM',
    title: 'THE ROLLER-SKATING WAITRESS',
    accent: 'kiki',
    image: '/assets/lore/stockholm.jpg',
    body: `She could route a full LAN party and pull a triple espresso without crashing either. Skated the cyber café floor at 30 km/h with a tray of lattes and zero spillage. Turned down every producer in Scandinavia. Then a sweaty man in a leather jacket walked into a sauna.`,
  },
  {
    id: 'sauna',
    kind: 'chapter',
    eyebrow: 'CHAPTER III · BERLIN, 2002',
    title: 'THE SAUNA INCIDENT',
    accent: 'both',
    image: '/assets/lore/sauna.jpg',
    body: `Dieter dragged a waterproof drum machine into a pressurised cedar sauna "to test its thermal limits." The hardware overheated and clipped hard — total meltdown imminent. Kiki grabbed the bucket, doused the coals, and 94% relative humidity short-circuited them both. SYSTEM OVERLOAD was born, dripping.`,
  },
  {
    id: 'doctrine',
    kind: 'chapter',
    eyebrow: 'CHAPTER IV · THE DOCTRINE',
    title: 'THE MOISTURE DOCTRINE',
    accent: 'both',
    image: '/assets/lore/doctrine.jpg',
    body: `They signed to Eurobeat Records on a napkin too damp to read. The rider: one working sauna, one cedar bucket, and thermal paste "for emergencies." "Club Humidity" was mixed entirely at 94% humidity. The engineers wore ponchos. The masters still smell faintly of eucalyptus.`,
  },
]

// kept for any legacy import
export const LORE_CHAPTERS = LORE_STOPS.filter((s) => s.kind === 'chapter')
