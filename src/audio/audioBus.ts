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

    // Transient / "beat" envelope: fast attack on rising bass, slow decay.
    const beatTarget = Math.max(0, bass - this.prevBass) * 4
    this.bands.beat = Math.max(beatTarget, this.bands.beat * 0.86)
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
