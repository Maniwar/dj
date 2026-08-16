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
  accent: 'kiki' | 'dieter' | 'both' | 'jussi'
  videoKey?: string
  /**
   * Hero sign-off line ("SHE IS THE SIGNAL"). Optional: the original three heroes are still
   * resolved by id in the component, so adding a stop only needs this when it wants its own.
   */
  tag?: string
  /** Optional named line-up, rendered as a roster instead of one block of prose. */
  roster?: { name: string; tag: string; line: string }[]
  /**
   * Per-scene crop anchor (a CSS position, e.g. 'center 60%').
   * Wide screens bias the crop UPWARD by default to keep faces in frame, which is right for
   * most shots and wrong for any whose payoff is at the bottom. Set this where the subject
   * decides, rather than letting one heuristic govern every clip.
   */
  focus?: string
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
    id: 'jussi',
    kind: 'hero',
    eyebrow: 'HEAD OF LÖYLY & ICE · GOALTENDER · REFRIGERATION · NINE WORDS PER SHOW',
    title: 'JUSSI JÄRVI',
    accent: 'jussi',
    image: '/assets/lore/jussi-hero.jpg',
    tag: 'HE IS THE COLD',
    body: `Born Järvi. Eurobeat's art department, working from a smudged fax, printed "JARS" across the first 400,000 sleeves; pulping was quoted at €38,000 and renaming him was free. He was informed by postcard and has never mentioned it. Twelve years in the compressor room of a Tampere ice rink, which makes the only man here with an actual qualification a refrigeration engineer. Scores every venue's löyly out of ten and has awarded exactly one 10, to his aunt's cabin outside Kuopio, 1994. Berlin — the sacred sauna, the birthplace of this entire band — got a 2.`,
  },
  {
    id: 'crew',
    kind: 'hero',
    eyebrow: 'THE ENTOURAGE · BACKING VOCALS · CROWD CONTROL · LEOPARD LOGISTICS',
    title: 'THE CREW',
    accent: 'both',
    image: '/assets/ref/crew.jpg',
    body: `Credited on every sleeve as "backing vocals", though not one of them has been within four metres of a microphone. Dieter believes they work for him. They work for Kiki. Kiki never hired them — they materialised in Munich in 1998 and simply never left.`,
    roster: [
      {
        name: 'TANJA',
        tag: 'LEOPARD · SIX FOOT · GOLD HOOPS',
        line: 'Enters a room the way weather enters a room. Has never queued.',
      },
      {
        name: 'MITZI',
        tag: 'PLATINUM & PINK · GLOW BRACELETS',
        line: 'Five foot nothing. Owns forty-one glow bracelets and one volume setting.',
      },
      {
        name: 'BRIGITTE',
        tag: 'COPPER CURLS · CHROME · WHISTLE',
        line: 'The whistle is not decorative. Freckles rated 9.4 on the humidity index.',
      },
    ],
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
    // The roller skates ARE the joke and they sit at 75-95% of the frame, so the default
    // upward bias cut them off in landscape. Anchored low enough to hold face and skates.
    focus: 'center 60%',
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
    body: `They signed to Eurobeat Records on a napkin too damp to read. The rider: one working sauna, one cedar bucket, and thermal paste "for emergencies." "Club Humidity" was mixed entirely at 94% relative humidity — which is why the engineers worked in clear plastic ponchos, hoods up, as condensation ran off the ceiling and rained onto the mixing desk. Two consoles were lost. The masters still smell faintly of eucalyptus.`,
  },
  {
    id: 'tampere',
    kind: 'chapter',
    eyebrow: 'CHAPTER V · TAMPERE, 2003',
    title: 'THE MAN WHO COULD COOL ANYTHING',
    accent: 'jussi',
    image: '/assets/lore/jussi-beerleague.jpg',
    body: `The drum machine kept overheating. Someone said there was a man in Tampere who could cool anything, so Dieter flew to Finland and found him at six in the morning, alone, in goal. Dieter explained the humidity, the meltdown and the entire Moisture Doctrine for eleven uninterrupted minutes. Jussi conceded a goal partway through and did not react. When it was over he said five words — "Your sauna was a cupboard" — and Dieter wept and hired him on the spot. He has filled the bucket every night since. Nobody has ever thanked him.`,
  },
]

// kept for any legacy import
export const LORE_CHAPTERS = LORE_STOPS.filter((s) => s.kind === 'chapter')
