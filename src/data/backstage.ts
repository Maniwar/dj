// BACKSTAGE — the Eurobeat Records archive: the band with the performance switched off, and the
// note the archivist filed against each frame. Deliberately BALANCED and INTERLEAVED — eight frames per
// member, shuffled so no one person owns the section (it began as fourteen straight Jussi frames,
// which made it his page rather than the band's).
export type Who = 'kiki' | 'dieter' | 'crew' | 'jussi'
export type BackstageFrame = { id: string; who: Who; image: string; title: string; note: string }

const KIKI: BackstageFrame[] = [
  { id: 'k-booth', who: 'kiki', image: '/assets/backstage/kiki-booth.jpg', title: 'CONDUCTING',
    note: 'She climbed the booth in Rotterdam and conducted eleven thousand people for four minutes. Dieter continued playing, unaware.' },
  { id: 'k-skates', who: 'kiki', image: '/assets/backstage/kiki-skates.jpg', title: 'THE OLD JOB',
    note: 'Crossed a packed floor on skates with four coffees and lost none of them. She has not worked in a café since 2001 and has not lost the ability.' },
  { id: 'k-extinguisher', who: 'kiki', image: '/assets/backstage/kiki-extinguisher.jpg', title: 'THERMAL EVENT #12',
    note: 'The drum machine went up again. She had the extinguisher before anyone else had stood up. Dieter called it "an overreaction."' },
  { id: 'k-soundcheck', who: 'kiki', image: '/assets/backstage/kiki-soundcheck.jpg', title: 'SOUNDCHECK',
    note: 'One note. Both engineers reached for their ears at the same moment. The desk was re-gained around her, not the other way round.' },
  { id: 'k-modem', who: 'kiki', image: '/assets/backstage/kiki-modem.jpg', title: 'STILL FASTER THAN THE VENUE',
    note: 'The club\'s line went down an hour before doors. She had it back up before the promoter finished explaining the problem.' },
  { id: 'k-autograph', who: 'kiki', image: '/assets/backstage/kiki-autograph.jpg', title: 'FOREHEAD, MILAN',
    note: 'He asked. She obliged. He is reported to have not washed it off for nine days.' },
  { id: 'k-mirror', who: 'kiki', image: '/assets/backstage/kiki-mirror.jpg', title: 'FOUR MINUTES TO STAGE',
    note: 'One cracked mirror, one bulb, one green laser coming through the door. She was on stage ninety seconds later looking like this was intentional.' },
  { id: 'k-asleep', who: 'kiki', image: '/assets/backstage/kiki-asleep.jpg', title: 'LOAD-OUT, 05:00',
    note: 'Asleep upright on the cases, still holding the mic. Nobody dared take it off her.' },
]

const DIETER: BackstageFrame[] = [
  { id: 'd-complaint', who: 'dieter', image: '/assets/backstage/dieter-complaint.jpg', title: 'NUMBER FORTY-ONE',
    note: 'He frames every noise complaint. There are forty-one. He has never apologised for one of them and does not intend to start.' },
  { id: 'd-synth', who: 'dieter', image: '/assets/backstage/dieter-synth.jpg', title: 'THE CHILD',
    note: 'He carried it like this from the van to the stage in four cities. It has its own seat on the bus. It does not have a name, "because it is not a pet."' },
  { id: 'd-zip', who: 'dieter', image: '/assets/backstage/dieter-zip.jpg', title: 'THE JACKET HAS NEVER BEEN ZIPPED',
    note: 'On this one occasion he attempted it. The struggle lasted six minutes. The jacket has not been zipped since.' },
  { id: 'd-interview', who: 'dieter', image: '/assets/backstage/dieter-interview.jpg', title: 'PRESS, HAMBURG',
    note: 'Question one: "How did you form?" He was still answering it fifty-one minutes later. The journalist filed nothing.' },
  { id: 'd-amp', who: 'dieter', image: '/assets/backstage/dieter-amp.jpg', title: 'THE AMPLIFIER',
    note: 'It did not move. It was later moved, in one motion, by a Finn who said nothing about it.' },
  { id: 'd-sunbed', who: 'dieter', image: '/assets/backstage/dieter-sunbed.jpg', title: 'MAINTENANCE',
    note: 'Twice weekly, sunglasses on, chain on. He refers to this as "the studio."' },
  { id: 'd-iron', who: 'dieter', image: '/assets/backstage/dieter-iron.jpg', title: 'THE VELVET',
    note: 'He will not let anyone else press the tracksuit. He irons it shirtless, in the leather jacket, at a temperature nobody has been allowed to verify.' },
  { id: 'd-whiteboard', who: 'dieter', image: '/assets/backstage/dieter-whiteboard.jpg', title: 'THE DOCTRINE, EXPLAINED',
    note: 'Ninety minutes on humidity, delivered to an empty room of folding chairs. He described it afterwards as "well received."' },
]

const CREW: BackstageFrame[] = [
  { id: 'c-lift', who: 'crew', image: '/assets/backstage/crew-lift.jpg', title: 'SERVICE LIFT, FLOOR 3',
    note: 'Fully choreographed, performed for nobody, interrupted by the doors. They finished it anyway on the landing.' },
  { id: 'c-boot', who: 'crew', image: '/assets/backstage/crew-boot.jpg', title: 'FIELD REPAIR',
    note: 'A platform boot, a kerb, and most of a roll of gaffer tape. The boot lasted another eleven cities.' },
  { id: 'c-hairdryer', who: 'crew', image: '/assets/backstage/crew-hairdryer.jpg', title: 'ONE HAIRDRYER',
    note: 'Three of them, one dryer, one socket. A rota was proposed and immediately abandoned.' },
  { id: 'c-photobooth', who: 'crew', image: '/assets/backstage/crew-photobooth.jpg', title: 'FOUR EXPOSURES',
    note: 'All three, one booth, limbs unaccounted for. The strip is pinned inside the tour bus to this day.' },
  { id: 'c-door', who: 'crew', image: '/assets/backstage/crew-door.jpg', title: 'SELF-APPOINTED SECURITY',
    note: 'Nobody hired them for this. Nobody got past them either. The venue\'s actual security took the night off.' },
  { id: 'c-chips', who: 'crew', image: '/assets/backstage/crew-chips.jpg', title: '06:00, AFTER',
    note: 'Full rave gear, glitter intact, chips in hand, dawn coming up. The quietest four minutes of the entire tour.' },
  { id: 'c-trolleys', who: 'crew', image: '/assets/backstage/crew-trolleys.jpg', title: 'TERMINAL 2',
    note: 'Banned from the trolleys at two European airports. Both bans were, in their view, "unclear at the time."' },
  { id: 'c-pile', who: 'crew', image: '/assets/backstage/crew-pile.jpg', title: 'THE BACK SEAT',
    note: 'One boot off between the three of them. They arrived in Cologne in exactly this arrangement.' },
]

const JUSSI: BackstageFrame[] = [
  { id: 'j-decks', who: 'jussi', image: '/assets/lore/jussi-decks.jpg', title: 'THE CREASE',
    note: 'Ninety minutes, full pads, blocker and glove never once off the table. Two bottles were opened over him. He acknowledged neither and did not miss a cue.' },
  { id: 'j-inspection', who: 'jussi', image: '/assets/lore/jussi-inspection.jpg', title: 'THE INSPECTION',
    note: 'Clipboard, thermometer, beer. Kiki and Dieter waited in the doorway for eleven minutes without speaking. The venue scored a 2 and closed the following spring.' },
  { id: 'j-sauna', who: 'jussi', image: '/assets/lore/jussi-sauna.jpg', title: 'THE LÖYLY VERDICT',
    note: 'Shot for the album booklet and rejected — the label felt the artists looked "insufficiently comfortable." He added one more ladle after this frame.' },
  { id: 'j-ice', who: 'jussi', image: '/assets/lore/jussi-ice.jpg', title: 'THE BUCKET',
    note: 'Every night, unasked, he carries the ice that keeps the rig alive. This is the only known photograph of it. Nobody has thanked him.' },
  { id: 'j-tv', who: 'jussi', image: '/assets/lore/jussi-tv.jpg', title: 'THE THIRD PERIOD',
    note: 'Ilves were 2–1 down. Six thousand people were behind him. He did not turn around once.' },
  { id: 'j-zamboni', who: 'jussi', image: '/assets/lore/jussi-zamboni.jpg', title: 'THE ROTTERDAM INCIDENT',
    note: 'He hired it with his own money. The venue had no ice. He resurfaced the dancefloor regardless, at walking pace, for nineteen minutes.' },
  { id: 'j-rider', who: 'jussi', image: '/assets/lore/jussi-rider.jpg', title: 'THE RIDER, HONOURED IN FULL',
    note: 'The label sent a complete catering spread by way of apology. It was not touched. The crate was gone by 23:40.' },
  { id: 'j-merch', who: 'jussi', image: '/assets/lore/jussi-merch.jpg', title: 'MERCH · MILAN',
    note: 'Units sold that evening: zero. Stock returned: complete. Fans queued for forty minutes and then quietly went home.' },
]

export const WHO_LABEL: Record<Who, string> = {
  kiki: 'KIKI G',
  dieter: 'DJ DIETER',
  crew: 'THE CREW',
  jussi: 'JUSSI JÄRVI',
}

// Round-robin the four sets so the sheet reads as the whole band rather than four blocks.
function interleave(...sets: BackstageFrame[][]): BackstageFrame[] {
  const out: BackstageFrame[] = []
  const longest = Math.max(...sets.map((s) => s.length))
  for (let i = 0; i < longest; i++) for (const s of sets) if (s[i]) out.push(s[i])
  return out
}

export const BACKSTAGE: BackstageFrame[] = interleave(KIKI, DIETER, CREW, JUSSI)
