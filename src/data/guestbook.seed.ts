export type GuestPost = {
  id: string
  user: string
  flag: string
  color: string
  time: string
  body: string
  likes: number
}

// Pre-populated chaos from the Eurobeat Records message board, circa 2004.
export const GUESTBOOK_SEED: GuestPost[] = [
  {
    id: 's1',
    user: 'xX_BassHunter99_Xx',
    flag: '🇸🇪',
    color: '#00ff9d',
    time: '2004-03-14 03:41',
    body: "THE SUBWOOFER CRACKED MY MUM'S CHINA CABINET AND I HAVE NEVER FELT MORE ALIVE. 10/10 wolfgang is a GOD",
    likes: 1204,
  },
  {
    id: 's2',
    user: 'DialUpDiva',
    flag: '🇳🇱',
    color: '#ff2e9a',
    time: '2004-03-14 04:02',
    body: 'took 45 min to download Touch My Subwoofer on kazaa. worth every second. my dad picked up the phone and RUINED it at 98%. reuploading now pls stand by',
    likes: 877,
  },
  {
    id: 's3',
    user: 'GLOWSTICK_GARETH',
    flag: '🇬🇧',
    color: '#12e0c0',
    time: '2004-03-15 01:17',
    body: 'bass too loud. BASS TOO LOUD. the bass is TOO. LOUD. (do not fix it)',
    likes: 2033,
  },
  {
    id: 's4',
    user: 'kiki_stan_4life',
    flag: '🇩🇪',
    color: '#ffd1f0',
    time: '2004-03-15 22:58',
    body: 'kiki g looked me in the eye through the webcam stream and said "stay moist" and i have not been normal since ✧･ﾟ: *✧･ﾟ:*',
    likes: 1590,
  },
  {
    id: 's5',
    user: 'SaunaSteve',
    flag: '🇫🇮',
    color: '#7cf',
    time: '2004-03-16 00:03',
    body: 'played Firemans Disco in the actual sauna. condensation shorted my minidisc player. no regrets. this is the intended listening environment',
    likes: 640,
  },
  {
    id: 's6',
    user: '~*~AquaTeenGurl~*~',
    flag: '🇮🇹',
    color: '#a0f',
    time: '2004-03-16 15:44',
    body: `¯\\_(ツ)_/¯ who needs a boyfriend when u have EURO AIRWAYS on repeat
 ___________
< STAY MOIST >
 -----------
        \\   ^__^
         \\  (oo)\\_______`,
    likes: 921,
  },
  {
    id: 's7',
    user: 'MODEM_MIKE',
    flag: '🇧🇪',
    color: '#0f9',
    time: '2004-03-17 09:12',
    body: 'i reverse engineered the Synthesizer Is So Big bootleg _3 and its literally just wolfgang breathing near a Korg for 6 minutes. masterpiece. framed it.',
    likes: 1330,
  },
  {
    id: 's8',
    user: 'TrancePlant',
    flag: '🇪🇸',
    color: '#ff6',
    time: '2004-03-18 02:20',
    body: 'IBIZA FOAM PARTY 2004 NEVER FORGET. bianca lost a platform boot in the foam and kiki g threw her a NEW ONE from the DJ booth. legends only',
    likes: 1780,
  },
  {
    id: 's9',
    user: 'Y2Kevin',
    flag: '🇺🇸',
    color: '#4df',
    time: '2004-03-18 18:39',
    body: '<blink>WHERE IS THE MERCH</blink> i NEED the moisture-wicking tracksuit. been refreshing the merch table for 3 days. it just says SOLD OUT. hello???',
    likes: 512,
  },
  {
    id: 's10',
    user: 'DJ_Wolfgang_OFFICIAL',
    flag: '🇩🇪',
    color: '#c0c0c0',
    time: '2004-03-19 04:44',
    body: 'thank you my childrens. the synthesizer IS so big. more humidity is coming. do not let your drum machine get too hot without a supervising adult. — W',
    likes: 9999,
  },
]
