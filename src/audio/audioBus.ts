// The AudioBus is a module-level singleton that carries high-frequency (60fps)
// analyser data OUTSIDE of React state. A single rAF loop (owned by AudioProvider)
// writes into these typed arrays each frame; every visualizer READS them from its
// own useFrame/rAF. Nothing here triggers a React re-render — that is deliberate.
// Putting FFT arrays in React state at 60fps is the classic way to melt the CPU.

export type Bands = {
  bass: number // 0..1  (sub / kick energy — drives the Thermal Runaway heat + subwoofer)
  lowMid: number // 0..1
  mid: number // 0..1
  treble: number // 0..1 (Kiki G's channel — hats, vox air)
  level: number // 0..1  overall loudness
  beat: number // 0..1  short-decay transient envelope (pulses on kicks)
}

export type Thermal = {
  temperature: number // 20..120 (°C) integrated from bass + friction
  humidity: number // 0..1
  dewPointHit: boolean // true during a liquid-cooling meltdown event
  overclock: number // 0..1 reward window intensity after a cooldown
}

const FFT_SIZE = 2048
const BINS = FFT_SIZE / 2

class AudioBusImpl {
  fftSize = FFT_SIZE
  bins = BINS
  freq = new Uint8Array(BINS) // frequency magnitudes 0..255
  time = new Uint8Array(BINS) // waveform 0..255 (128 = silence)
  bands: Bands = { bass: 0, lowMid: 0, mid: 0, treble: 0, level: 0, beat: 0 }
  thermal: Thermal = { temperature: 22, humidity: 0.35, dewPointHit: false, overclock: 0 }
  playing = false

  private analyser: AnalyserNode | null = null
  private prevBass = 0
  // ---- onset detection state ----
  private prevLow: Float32Array | null = null // last frame's low-band magnitudes
  private fluxHist = new Float32Array(64) // ~1s of spectral-flux history
  private fluxIdx = 0
  private fluxCount = 0
  private lastOnset = 0
  private lastT = 0
  private env = 0 // the beat envelope itself

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
    this.bands = { bass: 0, lowMid: 0, mid: 0, treble: 0, level: 0, beat: 0 }
  }

  // Called once per animation frame by AudioProvider.
  update() {
    const a = this.analyser
    if (!a) return
    a.getByteFrequencyData(this.freq)
    a.getByteTimeDomainData(this.time)

    const f = this.freq
    const n = f.length
    // Rough band splits across the (mostly sub-20kHz) spectrum.
    const bass = avg(f, 1, Math.floor(n * 0.04))
    const lowMid = avg(f, Math.floor(n * 0.04), Math.floor(n * 0.12))
    const mid = avg(f, Math.floor(n * 0.12), Math.floor(n * 0.35))
    const treble = avg(f, Math.floor(n * 0.35), Math.floor(n * 0.75))
    let level = 0
    for (let i = 0; i < n; i++) level += f[i]
    level = level / (n * 255)

    // ---- BEAT: real onset detection, not a raw difference ----
    // The old version diffed the *smoothed* bass average frame-to-frame. Two problems: the
    // analyser's smoothingTimeConstant smears a kick's attack over several frames (so the
    // pulse landed late and mushy), and every wobble in the mix registered as a "beat", which
    // reads as constant jitter rather than rhythm. Instead: spectral FLUX over the kick band,
    // fired against an ADAPTIVE threshold (running mean + deviation) with a refractory gap,
    // then an envelope with an instant attack and a TIME-BASED decay.
    const now = performance.now()
    const dt = this.lastT ? Math.min(100, now - this.lastT) : 16.7
    this.lastT = now

    const LOW_HI = Math.min(n, 20) // ~20–430 Hz @ 2048/44.1k — the kick/bass region
    if (!this.prevLow || this.prevLow.length !== LOW_HI) this.prevLow = new Float32Array(LOW_HI)
    let flux = 0
    for (let i = 1; i < LOW_HI; i++) {
      const v = f[i] / 255
      const d = v - this.prevLow[i]
      if (d > 0) flux += d // positive differences only = energy ARRIVING (an onset)
      this.prevLow[i] = v
    }

    this.fluxHist[this.fluxIdx] = flux
    this.fluxIdx = (this.fluxIdx + 1) % this.fluxHist.length
    this.fluxCount = Math.min(this.fluxCount + 1, this.fluxHist.length)
    let mean = 0
    for (let i = 0; i < this.fluxCount; i++) mean += this.fluxHist[i]
    mean /= Math.max(1, this.fluxCount)
    let varSum = 0
    for (let i = 0; i < this.fluxCount; i++) {
      const d = this.fluxHist[i] - mean
      varSum += d * d
    }
    const std = Math.sqrt(varSum / Math.max(1, this.fluxCount))
    // Adaptive: rides the track's own dynamics instead of a fixed number that suits one mix.
    // The 0.5 deviation multiplier and the 290ms refractory below were TUNED OFFLINE against the
    // real tracks (decoded to PCM, WebAudio path emulated, onset spacing compared to the known
    // 138 BPM). A sensitive threshold PAIRED WITH a long refractory beats a strict threshold:
    // strict settings missed ~25% of kicks (a stutter), while the refractory alone is enough to
    // stop double-triggers. Measured across 5 tracks this recovers 138 BPM from its own onset
    // spacing, at ~2.3 pulses/sec, with irregularity down from 0.55 to ~0.15.
    const threshold = mean + std * 0.5 + 0.01

    if (this.playing && flux > threshold && now - this.lastOnset > 290) {
      this.lastOnset = now
      this.env = 1 // instant attack: the pulse lands ON the kick
    }
    // Exponential decay in REAL TIME, not per frame — the old per-frame 0.86 decayed twice as
    // slowly at 30fps as at 60fps, which is a big part of why it felt uneven on phones.
    this.env *= Math.exp(-dt / 170)
    this.bands.beat = this.env
    this.prevBass = bass

    this.bands.bass = bass
    this.bands.lowMid = lowMid
    this.bands.mid = mid
    this.bands.treble = treble
    this.bands.level = level
  }
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
