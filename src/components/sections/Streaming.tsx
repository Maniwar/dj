// ============================================================================================
// THE ONE PLACE THE SITE ASKS FOR SOMETHING BACK
// ============================================================================================
// club-humidity.com had no link to Spotify or Apple Music anywhere in it. The site is the whole
// marketing asset -- it is what gets shared, and what someone screenshots -- and it converted
// exactly none of that attention into anything that persists.
//
// FOLLOW IS THE ASK, not "listen". Spotify adds every new release to every follower's Release
// Radar automatically, so one follow is a guaranteed placement on every record ever put out after
// it. A play is worth one play. That is why Spotify leads here and why the verb is FOLLOW, with
// Apple Music sitting alongside as a straightforward "the record is also here".
//
// It sits directly after the tracklist on purpose. Someone who has just read nineteen song titles
// and played a few clips is at the top of their intent; the footer is where intent goes to die.
//
// Written in-character, because the entire proposition is the bit. A visitor who has spent five
// minutes inside a 2002 Eurodance fiction and then hits a generic "Follow us on social!" card has
// been shown the edge of the set. This reads as a distribution notice from the label.

const SPOTIFY_ARTIST = 'https://open.spotify.com/artist/3ABcpkKvzG7zpBxTOA88AZ'
const APPLE_ARTIST = 'https://music.apple.com/us/artist/club-humidity-system-overload/6794950659'
const APPLE_ALBUM = 'https://music.apple.com/us/album/the-moist-mix-2002-unfiltered-excess/6794980730'
const YTMUSIC_ARTIST = 'https://music.youtube.com/channel/UCly66mPIZ8wLrRqrdPknAvA'

export default function Streaming() {
  return (
    <section className="streaming" aria-labelledby="streaming-h">
      <div className="streaming-inner">
        <p className="streaming-eyebrow">EUROBEAT RECORDS · DISTRIBUTION NOTICE · CAT # EBR-2002-💦</p>
        <h2 id="streaming-h" className="streaming-h">
          THE MOIST MIX 2002 <span>IS AVAILABLE ON ALL MAJOR FORMATS</span>
        </h2>

        <div className="streaming-links">
          {/* PRIMARY, and deliberately the only one styled as a call to action. Everything else on
              this card is a link to a record; this one is a subscription to every record after it. */}
          <a
            className="streaming-cta"
            href={SPOTIFY_ARTIST}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="streaming-cta-verb">FOLLOW ON SPOTIFY</span>
            <span className="streaming-cta-sub">
              be notified of every future transmission
            </span>
          </a>

          <div className="streaming-alt">
            <a href={APPLE_ALBUM} target="_blank" rel="noopener noreferrer">
              ♫ THE ALBUM ON APPLE MUSIC
            </a>
            <a href={APPLE_ARTIST} target="_blank" rel="noopener noreferrer">
              ◉ SYSTEM OVERLOAD ON APPLE MUSIC
            </a>
            <a href={YTMUSIC_ARTIST} target="_blank" rel="noopener noreferrer">
              ▶ SYSTEM OVERLOAD ON YOUTUBE MUSIC
            </a>
          </div>
        </div>

        <p className="streaming-fine">
          NINETEEN SONGS · ALL AT EXACTLY 138 BPM · RECORDED AT 94% RELATIVE HUMIDITY
        </p>
      </div>
    </section>
  )
}
