// BACKSTAGE — the Eurobeat Records archive: the band with the performance switched off, and the
// note the archivist filed against each frame. Deliberately BALANCED and INTERLEAVED — THIRTEEN
// frames per member, shuffled so no one person owns the section (it began as fourteen straight
// Jussi frames, which made it his page rather than the band's).
//
// The count is load-bearing, not decorative: the filter chips print it, so the moment one member
// gains frames and the others don't, the imbalance is displayed on the page in figures. Adding to
// one array means adding the same number to the other three.
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
  { id: 'k-vending', who: 'kiki', image: '/assets/backstage/kiki-vending.jpg', title: 'THE MACHINE',
    note: 'It took her money and gave her nothing. Two roadies watched the entire recovery operation and were not asked to help.' },
  { id: 'k-suitcase', who: 'kiki', image: '/assets/backstage/kiki-suitcase.jpg', title: 'EXCESS',
    note: 'The case closed. It has never opened again in the same condition. Six cities later the zip was still holding.' },
  { id: 'k-tvshow', who: 'kiki', image: '/assets/backstage/kiki-tvshow.jpg', title: 'PLAYBACK, REGIONAL TV',
    note: 'The microphone was not connected to anything. She gave it everything regardless. The broadcast went out at 14:40 on a Tuesday.' },
  // NOT 05:00 — that is k-asleep, where she is unconscious on the flight cases. She cannot also be
  // upright in a phone box winning an argument at the same hour of the same set.
  { id: 'k-payphone', who: 'kiki', image: '/assets/backstage/kiki-payphone.jpg', title: '02:40, THE LABEL',
    note: 'Seven minutes and most of a pocket of coins. She won the argument. The label maintains there was no argument.' },
  { id: 'k-icebath', who: 'kiki', image: '/assets/backstage/kiki-icebath.jpg', title: 'THE RIDER, CHILLED',
    note: 'The dressing room had no fridge. It did have a bath. She took the call from it without mentioning either fact.' },
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
    note: 'Seventy minutes on humidity, delivered to an empty room of folding chairs. He described it afterwards as "well received."' },
  { id: 'd-fax', who: 'dieter', image: '/assets/backstage/dieter-fax.jpg', title: 'THE FAX',
    note: 'Notes on the Rotterdam mix, sent at 04:00 to a machine nobody was standing next to. It ran to nine metres. He waited for the confirmation slip.' },
  { id: 'd-poster', who: 'dieter', image: '/assets/backstage/dieter-poster.jpg', title: 'FLYPOSTING, 03:00',
    note: 'He pasted over a bill for a rival night and did not consider this to be a decision worth discussing.' },
  { id: 'd-mirror', who: 'dieter', image: '/assets/backstage/dieter-mirror.jpg', title: 'THE FACE',
    note: 'Rehearsed nightly. He is not aware anyone has ever seen him do it. Everyone has seen him do it.' },
  { id: 'd-catering', who: 'dieter', image: '/assets/backstage/dieter-catering.jpg', title: 'CATERING, ASSESSED',
    note: 'Clipboard, clingfilm, one raised corner. The verdict was delivered to the promoter in writing the following morning.' },
  { id: 'd-scooter', who: 'dieter', image: '/assets/backstage/dieter-scooter.jpg', title: 'TRANSPORT',
    note: 'The venue was large and the record box was heavy. He has never explained where the scooter came from, or where it went.' },
]

const CREW: BackstageFrame[] = [
  { id: 'c-lift', who: 'crew', image: '/assets/backstage/crew-lift.jpg', title: 'SERVICE LIFT, FLOOR 3',
    note: 'Fully choreographed, performed for nobody, interrupted by the doors. They finished it anyway on the landing.' },
  { id: 'c-boot', who: 'crew', image: '/assets/backstage/crew-boot.jpg', title: 'FIELD REPAIR',
    note: 'A platform boot, a kerb, and most of a roll of gaffer tape. The boot lasted the rest of the tour.' },
  { id: 'c-hairdryer', who: 'crew', image: '/assets/backstage/crew-hairdryer.jpg', title: 'ONE HAIRDRYER',
    note: 'Three of them, one dryer, one socket. A rota was proposed and immediately abandoned.' },
  { id: 'c-photobooth', who: 'crew', image: '/assets/backstage/crew-photobooth.jpg', title: 'FOUR EXPOSURES',
    note: 'All three, one booth, limbs unaccounted for. The strip is pinned inside the tour bus to this day.' },
  { id: 'c-door', who: 'crew', image: '/assets/backstage/crew-door.jpg', title: 'SELF-APPOINTED SECURITY',
    note: 'Nobody hired them for this. Nobody got past them either. The venue\'s actual security took the night off.' },
  { id: 'c-chips', who: 'crew', image: '/assets/backstage/crew-chips.jpg', title: '06:00, AFTER',
    note: 'Coats over the stage clothes, glitter still on, chips in hand, dawn coming up. The quietest half hour of the entire tour.' },
  { id: 'c-trolleys', who: 'crew', image: '/assets/backstage/crew-trolleys.jpg', title: 'TERMINAL 2',
    note: 'Banned from the trolleys at two European airports. Both bans were, in their view, "unclear at the time."' },
  { id: 'c-pile', who: 'crew', image: '/assets/backstage/crew-pile.jpg', title: 'THE BACK SEAT',
    note: 'One boot off between the three of them. They arrived in Cologne in exactly this arrangement.' },
  { id: 'c-setlist', who: 'crew', image: '/assets/backstage/crew-setlist.jpg', title: 'THE RUNNING ORDER',
    note: 'Written straight onto the wall of the venue, revised twice, and followed exactly. The venue has since painted over it.' },
  { id: 'c-laundry', who: 'crew', image: '/assets/backstage/crew-laundry.jpg', title: '04:00, SPIN CYCLE',
    note: 'Every sequin on the tour, in one machine, in a launderette in an unnamed town. Nobody spoke for the full cycle.' },
  { id: 'c-map', who: 'crew', image: '/assets/backstage/crew-map.jpg', title: 'THREE DIRECTIONS',
    note: 'Three opinions, one map, no agreement. They arrived on time, and none of them will say whose route it was.' },
  { id: 'c-nails', who: 'crew', image: '/assets/backstage/crew-nails.jpg', title: 'THE CHAIN',
    note: 'Each one does the next one\'s hands. Nobody does their own. The system has never been explained to anyone outside the three of them.' },
  { id: 'c-jumpstart', who: 'crew', image: '/assets/backstage/crew-jumpstart.jpg', title: 'THE VAN, AGAIN',
    note: 'Fourth time that month. Under two minutes, no discussion, everyone in position. The van was sold at the end of the tour.' },
]

const JUSSI: BackstageFrame[] = [
  { id: 'j-decks', who: 'jussi', image: '/assets/lore/jussi-decks.jpg', title: 'THE CREASE',
    note: 'Ninety minutes, full pads, blocker and glove never once off the table. A bottle went off over him mid-set. He acknowledged neither the bottle nor the woman holding it, and did not miss a cue.' },
  { id: 'j-inspection', who: 'jussi', image: '/assets/lore/jussi-inspection.jpg', title: 'THE INSPECTION',
    note: 'Clipboard, thermometer, beer. Kiki and Dieter waited in the doorway for eleven minutes without speaking. The venue scored a 2 and closed the following spring.' },
  { id: 'j-sauna', who: 'jussi', image: '/assets/lore/jussi-sauna.jpg', title: 'THE LÖYLY VERDICT',
    // NOT the album booklet: the record is the 2002 Moist Mix and he is not hired until Tampere,
    // 2003 (Chapter V), so he cannot be standing in a shot for it. The tour programme he can.
    note: 'Shot for the tour programme and rejected — the label felt the artists looked "insufficiently comfortable." He added one more ladle after this frame.' },
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
  { id: 'j-hockey', who: 'jussi', image: '/assets/lore/jussi-hockey.jpg', title: 'THE NET',
    note: 'He had a regulation goal erected behind the booth and stood in it for the whole set. A beer balanced on the stick for two hours and did not fall.' },
  { id: 'j-foam', who: 'jussi', image: '/assets/lore/jussi-foam.jpg', title: 'THE ONLY THING HE SAVED',
    note: 'Chest-deep in the foam party, shirt on, sunglasses on, one arm held clear of it throughout. The beer was never at any point in danger.' },
  { id: 'j-booth', who: 'jussi', image: '/assets/lore/jussi-booth.jpg', title: 'THE BACKING VOCAL',
    note: 'One take, four words, no notes. Dieter is visible through the glass reacting to it. The take was not used.' },
  { id: 'j-bus', who: 'jussi', image: '/assets/lore/jussi-bus.jpg', title: '04:00, THE ARGUMENT',
    note: 'Kiki and Dieter are twenty minutes into a disagreement about the encore. He has not opened his eyes and has not put the bottle down.' },
  { id: 'j-beer', who: 'jussi', image: '/assets/lore/jussi-beer.jpg', title: 'THE TALLY',
    note: 'The venue stacked them as they came back. He maintains the count is unremarkable for a Thursday and declines to give a figure.' },
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
