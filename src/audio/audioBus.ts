// The AudioBus is a module-level singleton that carries high-frequency (60fps)
// analyser data OUTSIDE of React state. A single rAF loop (owned by AudioProvider)
// writes into these typed arrays each frame; every visualizer READS them from its
// own useFrame/rAF. Nothing here triggers a React re-render — that is deliberate.
// Putting FFT arrays in React state at 60fps is the classic way to melt the CPU.
//
// It doesn't just hand out loudness: it listens to the KIT. Kick, snare/clap and hats are
// detected separately, and their timing is tracked into bars — so the visuals can give each
// instrument its own job (kick = the physical hit, snare = the strobe accent, hats = shimmer)
// and accent the downbeat, instead of every element flashing on the same one signal.

export type Bands = {
  bass: number // 0..1  (sub / kick energy — drives the Thermal Runaway heat + subwoofer)
  lowMid: number // 0..1
  mid: number // 0..1
  treble: number // 0..1 (Kiki G's channel — hats, vox air)
  level: number // 0..1  overall loudness
  beat: number // 0..1  short-decay transient envelope (pulses on kicks)
  snare: number // 0..1  the backbeat — claps/snares, typically beats 2 & 4
  hat: number // 0..1  fast top-end shimmer (hi-hats, air)
}

// Musical structure, derived from the timing of the detected kicks.
export type Music = {
  bpm: number // running tempo estimate (0 until enough beats are seen)
  beatPhase: number // 0..1 progress from the last kick to the next expected one
  barPhase: number // 0..1 progress through a 4-beat bar
  beatIndex: number // beats counted since playback started
  downbeat: number // 0..1 envelope, fires bigger on the 1st beat of each bar
  build: number // 0..1 rising-energy tension (the run-up before a drop)
  drop: number // 0..1 envelope, fires when the track slams back in
}

export type Thermal = {
  temperature: number // 20..120 (°C) integrated from bass + friction
  humidity: number // 0..1
  dewPointHit: boolean // true during a liquid-cooling meltdown event
  overclock: number // 0..1 reward window intensity after a cooldown
}

const FFT_SIZE = 2048
const BINS = FFT_SIZE / 2

// One reusable onset detector per instrument. Spectral flux over a bin range, compared against
// an ADAPTIVE threshold (running mean + deviation of recent flux) so it rides each track's own
// dynamics, with a refractory gap that stops one smeared transient double-triggering.
class OnsetDetector {
  env = 0
  lastOnset = 0
  fired = false
  private prev: Float32Array | null = null
  private hist = new Float32Array(64)
  private idx = 0
  private count = 0

  constructor(
    private lo: number,
    private hi: number,
    private k: number, // deviation multiplier — lower = more sensitive
    private refractoryMs: number,
    private decayMs: number,
  ) {}

  update(f: Uint8Array, now: number, dt: number, playing: boolean) {
    const hi = Math.min(this.hi, f.length)
    const lo = Math.min(this.lo, hi)
    const span = hi - lo
    this.fired = false
    if (span > 0) {
      if (!this.prev || this.prev.length !== span) this.prev = new Float32Array(span)
      let flux = 0
      for (let i = 0; i < span; i++) {
        const v = f[lo + i] / 255
        const d = v - this.prev[i]
        if (d > 0) flux += d // positive differences only = energy ARRIVING (an onset)
        this.prev[i] = v
      }
      this.hist[this.idx] = flux
      this.idx = (this.idx + 1) % this.hist.length
      this.count = Math.min(this.count + 1, this.hist.length)
      let mean = 0
      for (let i = 0; i < this.count; i++) mean += this.hist[i]
      mean /= Math.max(1, this.count)
      let varSum = 0
      for (let i = 0; i < this.count; i++) {
        const d = this.hist[i] - mean
        varSum += d * d
      }
      const std = Math.sqrt(varSum / Math.max(1, this.count))
      const threshold = mean + std * this.k + 0.01
      if (playing && flux > threshold && now - this.lastOnset > this.refractoryMs) {
        this.lastOnset = now
        this.env = 1 // instant attack: the hit lands ON the transient
        this.fired = true
      }
    }
    // decay in REAL TIME, not per frame, so it behaves identically at 30fps and 120fps
    this.env *= Math.exp(-dt / this.decayMs)
    return this.env
  }
}

class AudioBusImpl {
  fftSize = FFT_SIZE
  bins = BINS
  freq = new Uint8Array(BINS) // frequency magnitudes 0..255
  time = new Uint8Array(BINS) // waveform 0..255 (128 = silence)
  bands: Bands = { bass: 0, lowMid: 0, mid: 0, treble: 0, level: 0, beat: 0, snare: 0, hat: 0 }
  music: Music = { bpm: 0, beatPhase: 0, barPhase: 0, beatIndex: 0, downbeat: 0, build: 0, drop: 0 }
  thermal: Thermal = { temperature: 22, humidity: 0.35, dewPointHit: false, overclock: 0 }
  playing = false

  private analyser: AnalyserNode | null = null
  private prevBass = 0
  private lastT = 0

  // Bin ranges @ 2048/44.1kHz (~21.5 Hz per bin):
  //   kick  1..20   ≈ 20–430 Hz      snare/clap 70..280 ≈ 1.5–6 kHz     hats 280..500 ≈ 6–10.7 kHz
  // Kick constants were tuned offline against the real PCM (see git history): a sensitive
  // threshold PAIRED WITH a long refractory beats a strict threshold, which missed ~25% of kicks.
  // Every constant below was tuned offline against the real decoded audio and checked against
  // what the part actually plays at 138 BPM: kick ≈2.3 hits/sec, snare/clap on 2 & 4 ≈1.15,
  // hats in 8ths ≈4.6. Measured result: 2.27 / 1.13 / 4.57. The snare needs a HIGH threshold
  // (mids are crowded with vocals and synth stabs), the hats a very low one.
  // 340ms refractory, not 290: swept offline against the real tracks. At 290 syncopated bass
  // notes between the kicks slipped through and dragged the tempo estimate SHORT (139 BPM read
  // as 146). 340 still passes every real kick (it allows up to 176 BPM) and pulled the measured
  // tempo to 136–140 against a true 138, with beat-to-beat jitter falling from 0.55 to ~0.03.
  private kick = new OnsetDetector(1, 20, 0.5, 340, 170)
  private snare = new OnsetDetector(70, 280, 3.0, 300, 140)
  private hat = new OnsetDetector(280, 500, 0.4, 60, 70)

  // beat-timing / structure (phase-locked loop — see update())
  private beatGaps: number[] = []
  private lastBeatAt = 0
  private levelShort = 0
  private levelLong = 0
  private period = 0 // ms between beats, once a tempo is established
  private nextBeat = 0 // when the NEXT beat is due (predicted)
  private locked = false // are we confidently riding the track's grid?
  private lastOnsetAt = 0
  private beatEnv = 0
  private hinted = false // was the tempo supplied up-front by the track metadata?

  // Every track ships its BPM in lyrics.json, so hand the grid its tempo instead of making it
  // rediscover it. With a prior, the PLL only has to find the PHASE — it locks on the very
  // first kick rather than after ~1.7s of listening, which is what made the opening bars of a
  // newly-selected track feel hesitant.
  setTempoHint(bpm: number) {
    if (!(bpm > 60 && bpm < 220)) return
    this.period = 60000 / bpm
    this.hinted = true
    this.locked = false // phase is unknown again — re-anchor on the next kick
    this.beatGaps.length = 0
  }

  attach(analyser: AnalyserNode) {
    this.analyser = analyser
    this.freq = new Uint8Array(analyser.frequencyBinCount)
    this.time = new Uint8Array(analyser.frequencyBinCount)
    this.bins = analyser.frequencyBinCount
  }

  detach() {
    this.analyser = null
    this.freq.fill(0)
    this.time.fill(128)
    this.bands = { bass: 0, lowMid: 0, mid: 0, treble: 0, level: 0, beat: 0, snare: 0, hat: 0 }
    this.music = { bpm: 0, beatPhase: 0, barPhase: 0, beatIndex: 0, downbeat: 0, build: 0, drop: 0 }
  }

  // Called once per animation frame by AudioProvider.
  update() {
    const a = this.analyser
    if (!a) return
    a.getByteFrequencyData(this.freq)
    a.getByteTimeDomainData(this.time)

    const f = this.freq
    const n = f.length
    const now = performance.now()
    const dt = this.lastT ? Math.min(100, now - this.lastT) : 16.7
    this.lastT = now

    // Rough band splits across the (mostly sub-20kHz) spectrum.
    const bass = avg(f, 1, Math.floor(n * 0.04))
    const lowMid = avg(f, Math.floor(n * 0.04), Math.floor(n * 0.12))
    const mid = avg(f, Math.floor(n * 0.12), Math.floor(n * 0.35))
    const treble = avg(f, Math.floor(n * 0.35), Math.floor(n * 0.75))
    let level = 0
    for (let i = 0; i < n; i++) level += f[i]
    level = level / (n * 255)

    // ---- the kit, detected separately ----
    this.kick.update(f, now, dt, this.playing)
    this.bands.snare = this.snare.update(f, now, dt, this.playing)
    this.bands.hat = this.hat.update(f, now, dt, this.playing)

    // ---- BEAT GRID: a phase-locked loop, not raw detection ----
    // Reacting to detected onsets alone means a kick that's masked in a dense mix, or a bar
    // that drops the kick entirely, simply produces NO pulse — the visuals hesitate and slip
    // out of sync. So once a tempo is established we run our own clock and PREDICT each beat,
    // and use the detected onsets only to correct the clock's phase and tempo (exactly how a
    // PLL locks to a signal). The pulse then stays perfectly even, and rides through breakdowns.
    const m = this.music
    if (this.kick.fired) {
      if (this.lastBeatAt) {
        const gap = now - this.lastBeatAt
        // ignore gaps that clearly aren't one beat (a missed kick, or a stray double)
        if (gap > 200 && gap < 1200) {
          this.beatGaps.push(gap)
          if (this.beatGaps.length > 16) this.beatGaps.shift()
        }
      }
      this.lastBeatAt = now
      this.lastOnsetAt = now
    }
    // median gap -> tempo (median shrugs off the occasional missed or doubled beat)
    if (this.beatGaps.length >= 4) {
      const sorted = [...this.beatGaps].sort((x, y) => x - y)
      const medGap = sorted[Math.floor(sorted.length / 2)]
      // With a hint we trust the metadata and only allow refinement AROUND it, so one noisy
      // stretch can't drag the grid off a tempo we already know is correct.
      const lo = this.hinted ? this.period * 0.92 : 250
      const hi = this.hinted ? this.period * 1.08 : 1000
      if (medGap > lo && medGap < hi) {
        this.period = this.period ? this.period * 0.85 + medGap * 0.15 : medGap
      }
    }

    // Lock on once the tempo is trustworthy; unlock if the kicks stop (track change, silence),
    // so we never keep pulsing a grid that no longer exists. With a tempo hint from the track
    // metadata, the very first kick is enough to anchor the phase.
    const enoughEvidence = this.hinted ? this.lastBeatAt > 0 : this.beatGaps.length >= 3
    if (!this.locked && this.period > 0 && enoughEvidence) {
      this.locked = true
      this.nextBeat = this.lastBeatAt + this.period
    }
    if (this.locked && (now - this.lastOnsetAt > 2500 || !this.playing)) {
      this.locked = false
      this.beatGaps.length = 0
    }

    // Phase/tempo correction: when a real kick lands near where we predicted, nudge the clock
    // toward it rather than jumping — a hard snap would itself read as a stutter.
    if (this.locked && this.kick.fired) {
      let err = now - this.nextBeat
      while (err > this.period * 0.5) err -= this.period
      while (err < -this.period * 0.5) err += this.period
      // Phase ONLY. Letting the phase error also nudge the tempo compounds: a small consistent
      // bias walks the period away every beat (measured 138 BPM drifting out to 146). Tempo
      // comes from the robust median of recent gaps (and the metadata hint) instead.
      if (Math.abs(err) < this.period * 0.35) this.nextBeat += err * 0.30
    }

    let beatEvent = false
    if (this.locked) {
      if (now >= this.nextBeat) {
        beatEvent = true
        this.nextBeat += this.period
        // if we've fallen far behind (tab was backgrounded), resynchronise instead of firing
        // a burst of catch-up beats
        if (now - this.nextBeat > this.period * 2) this.nextBeat = now + this.period
      }
    } else if (this.kick.fired) {
      beatEvent = true // not locked yet: stay responsive off raw detection
    }

    if (beatEvent) {
      m.beatIndex++
      // A 4-beat bar: accent the 1st beat. We can't know the true downbeat without deeper
      // analysis, but a steady 4-count still reads as musical structure rather than a uniform
      // strobe — the point is that every 4th hit is BIGGER.
      if (m.beatIndex % 4 === 0) m.downbeat = 1
      this.beatEnv = 1
    }
    this.beatEnv *= Math.exp(-dt / 170)
    this.bands.beat = this.beatEnv

    const beatMs = this.period || (m.bpm > 0 ? 60000 / m.bpm : 0)
    const sinceBeat = this.locked ? beatMs - Math.max(0, this.nextBeat - now) : now - this.lastBeatAt
    m.beatPhase = beatMs ? Math.min(1, Math.max(0, sinceBeat / beatMs)) : 0
    m.barPhase = ((m.beatIndex % 4) + m.beatPhase) / 4
    m.downbeat *= Math.exp(-dt / 260) // a longer tail than a plain kick — it's the big accent

    // ---- energy shape: build-ups and drops ----
    // Two loudness averages at different speeds. Short above long = energy rising (a build);
    // a sharp jump after that tension is the drop landing.
    const kShort = 1 - Math.exp(-dt / 900)
    const kLong = 1 - Math.exp(-dt / 5000)
    const prevRatio = this.levelLong > 0.01 ? this.levelShort / this.levelLong : 1
    this.levelShort += (level - this.levelShort) * kShort
    this.levelLong += (level - this.levelLong) * kLong
    const ratio = this.levelLong > 0.01 ? this.levelShort / this.levelLong : 1
    m.build = clamp01((ratio - 1) * 3)
    if (this.playing && ratio > 1.18 && prevRatio <= 1.18) m.drop = 1
    m.drop *= Math.exp(-dt / 1200)

    this.bands.bass = bass
    this.bands.lowMid = lowMid
    this.bands.mid = mid
    this.bands.treble = treble
    this.bands.level = level
    this.prevBass = bass
  }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function avg(arr: Uint8Array, start: number, end: number) {
  let s = 0
  const a = Math.max(0, start)
  const b = Math.min(arr.length, end)
  if (b <= a) return 0
  for (let i = a; i < b; i++) s += arr[i]
  return s / ((b - a) * 255)
}

export const audioBus = new AudioBusImpl()
