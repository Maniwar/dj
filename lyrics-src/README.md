# lyrics-src — drop Suno lyric exports here

`npm run gen:lyrics` parses every `*.txt` in this folder into `src/data/lyrics.json`
(keyed by track slug), which feeds the karaoke panel + the lyric marquees. Then rebuild
(`npm run build`) and the sheets appear.

## File format (one `.txt` per song)

The parser looks for a `Title:` line, a `NNN bpm` token, and a `--- Lyrics ---` block.
Voice is tagged from `[Section: Voice]` headers: **Male → DJ Dieter (blue)**,
**Female → Kiki G (pink)**, anything with **and → both**.

```
Title: Touch My Subwoofer
Style: Eurodance, 140 bpm

--- Lyrics ---
[Intro: Male]
Come closer.
Feel the bass.

[Chorus: Female]
Touch my subwoofer, baby
Turn it up, turn it up

[Verse: Male and Female]
All night long
--- Raw API ---
```

(The `Cover Art URL` or `--- Raw API` line just marks where lyrics end — either is fine,
or just end the file.)

## Currently MISSING lyric sheets (14 of 19)

Only 5 songs have lyrics today (abduct-me-baby, bite-me-in-the-dark, ciao-ciao-afterparty,
euro-airways, euro-trash). These 14 still need a `.txt` (Title must match exactly so the
slug lines up with the mp3):

- Firemans Disco
- Patient Zero
- Pump My Iron
- Reboot My Heart
- Sha-Sha-Shameless
- Shameless in the Luxury Car
- Shameless in the Navy
- Shameless Little Mechanic
- Shameless on the Floor
- Synthesizer Is So Big
- The Basement VIP
- Touch My Subwoofer
- Tutti-Frutti
- Winter Time Romance
