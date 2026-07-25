import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audioBus } from '../../audio/audioBus'
import { ACCENTS, useSiteStore } from '../../state/useSiteStore'
import { usePlayerStore } from '../../state/usePlayerStore'
import { thermalVert, thermalFrag } from './thermalShader'
import { PERF } from '../../lib/perfFlags'

const AMBIENT = 22
const MAXT = 125
const FREQ_BINS = 64
// The full-screen fragment shader is the heaviest thing on the page. Cap the render
// resolution hard on phones (1x) and modestly on desktop (1.4x) so the beat cuts, lasers
// and the whole compositing stack stay at 60fps instead of flickering.
const MAX_DPR =
  typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 1 : 1.4

const pointer = { x: 0.5, y: 0.5 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth
    pointer.y = 1 - e.clientY / window.innerHeight
  })
}

function Mainstage() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const songSlugRef = useRef('')
  const agcRef = useRef(0) // running peak for the spectrum strip's auto-gain
  const confettiRef = useRef(0)
  const { size, gl } = useThree()

  // RGBA spectrum texture (universally supported) — the giant LED wall + lasers read it
  const freqData = useMemo(() => new Uint8Array(FREQ_BINS * 4), [])
  const bandRaw = useMemo(() => new Float32Array(FREQ_BINS), [])
  const freqTex = useMemo(() => {
    const t = new THREE.DataTexture(freqData, FREQ_BINS, 1, THREE.RGBAFormat)
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }, [freqData])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uBass: { value: 0 },
      uLevel: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uSnare: { value: 0 },
      uHat: { value: 0 },
      uDown: { value: 0 },
      uBar: { value: 0 },
      uBuild: { value: 0 },
      uDrop: { value: 0 },
      uAccent: { value: new THREE.Vector3(1.0, 0.12, 0.56) },
      uQuality: { value: PERF.isMobile ? 0 : 1 }, // phones skip the costliest shader passes
      uSong: { value: 0 }, // per-track lighting design (stable hash of the slug)
      uPattern: { value: 0 }, // which rig look is up; changes every 4 bars
      uVocal: { value: 0 },   // impulse each time a sung word lands
      uConfetti: { value: 0 }, // slow-decaying drop envelope, so confetti outlives the drop
      uTemp: { value: 0 },
      uHumidity: { value: 0.35 },
      uDew: { value: 0 },
      uOverclock: { value: 0 },
      uFriction: { value: 0.1 },
      uSauna: { value: 0 },
      uFreq: { value: freqTex },
      uFreqCount: { value: FREQ_BINS },
    }),
    [freqTex],
  )

  useEffect(() => {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
    gl.setPixelRatio(dpr)
    uniforms.uRes.value.set(size.width * dpr, size.height * dpr)
  }, [size, gl, uniforms])

  useFrame((_, dt) => {
    const u = uniforms
    u.uTime.value += dt
    const b = audioBus.bands
    const t = audioBus.thermal
    // ---- SPECTRUM STRIP ----
    // Bands are spaced LOGARITHMICALLY, not linearly. A linear split maps most of the strip's
    // width onto 10–22kHz, where these tracks carry almost nothing — which is why the right-hand
    // end sat flat and dead — while squeezing the bass and mids, where the music actually lives,
    // into the first few pixels. Log spacing (40Hz–13kHz) gives every octave equal width, so the
    // strip moves across its whole length.
    const src = audioBus.freq
    const nyquist = 22050
    const fMin = 40, fMax = 13000
    const ratio = fMax / fMin
    let frameMax = 0
    for (let i = 0; i < FREQ_BINS; i++) {
      const f0 = fMin * Math.pow(ratio, i / FREQ_BINS)
      const f1 = fMin * Math.pow(ratio, (i + 1) / FREQ_BINS)
      const b0 = Math.max(0, Math.floor((f0 / nyquist) * src.length))
      const b1 = Math.min(src.length, Math.max(b0 + 1, Math.ceil((f1 / nyquist) * src.length)))
      let m = 0
      for (let j = b0; j < b1; j++) m += src[j]
      m /= b1 - b0
      bandRaw[i] = m
      if (m > frameMax) frameMax = m
    }
    // Auto-gain against a running peak, exactly like the player's EQ: recorded music rarely
    // pushes the analyser near full scale, so without this the bars only ever use the bottom
    // of their range and look flat regardless of what's playing.
    agcRef.current = frameMax > agcRef.current
      ? frameMax
      : agcRef.current * 0.94 + frameMax * 0.06
    const ref = Math.max(24, agcRef.current)
    for (let i = 0; i < FREQ_BINS; i++) {
      // slight gamma so the quiet detail lifts without the peaks clipping into a solid block
      const v = Math.min(255, 255 * Math.pow(Math.min(1, bandRaw[i] / ref), 0.78))
      const o = i * 4
      freqData[o] = v
      freqData[o + 1] = v
      freqData[o + 2] = v
      freqData[o + 3] = 255
    }
    freqTex.needsUpdate = true

    // Amplify the (usually timid) raw bands so the lasers/haze visibly pump to the beat.
    const boost = (x: number, g: number, gamma: number) =>
      Math.min(1, Math.pow(Math.max(0, x), gamma) * g)
    u.uBass.value = boost(b.bass, 1.7, 0.78)
    u.uLevel.value = boost(b.level, 1.7, 0.8)
    u.uTreble.value = boost(b.treble, 1.75, 0.8)
    // The kit + song structure drive the light rig: the beams sweep in musical time (uBar),
    // the strobe answers on the backbeat, hats glitter, and builds/drops shape the room.
    // These arrive pre-shaped from the onset detectors, so they are NOT boosted — boosting a
    // clean 0..1 envelope just clips it and washes the dynamics out.
    const mu = audioBus.music
    u.uBeat.value = b.beat
    u.uSnare.value = b.snare
    u.uHat.value = b.hat
    u.uDown.value = mu.downbeat
    u.uBar.value = mu.barPhase
    u.uBuild.value = mu.build
    u.uDrop.value = mu.drop
    u.uVocal.value = audioBus.vocal
    // The drop envelope itself is gone in ~1s, but confetti has to keep falling after that —
    // hold the peak and bleed it away over ~4s.
    confettiRef.current = Math.max(mu.drop, confettiRef.current - dt / 4.0)
    u.uConfetti.value = confettiRef.current
    // Ease toward the current section's colour rather than snapping — a hard cut in the rig
    // colour on a scroll boundary looks like a bug; a ~1s fade reads as the lighting following
    // the story. (Same rate regardless of framerate.)
    // Stable per-track value so each song's rig is its own design and never drifts between plays
    const slug = usePlayerStore.getState().currentTrackSlug ?? ''
    if (slug !== songSlugRef.current) {
      songSlugRef.current = slug
      let h = 0
      for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
      u.uSong.value = (h % 1000) / 1000
    }
    // Change the LOOK every 4 bars, on the bar line — so the rig moves from the overhead
    // truss to the corners to floor uplights to side towers, like a desk running cues.
    u.uPattern.value = Math.floor(mu.beatIndex / 16) % 5
    const target = ACCENTS[useSiteStore.getState().accent] ?? ACCENTS.default
    const k = 1 - Math.exp(-dt / 0.35)
    u.uAccent.value.x += (target[0] - u.uAccent.value.x) * k
    u.uAccent.value.y += (target[1] - u.uAccent.value.y) * k
    u.uAccent.value.z += (target[2] - u.uAccent.value.z) * k
    u.uTemp.value = (t.temperature - AMBIENT) / (MAXT - AMBIENT)
    u.uHumidity.value = t.humidity
    u.uDew.value = t.dewPointHit ? 1 : Math.max(0, u.uDew.value - dt * 1.5)
    u.uOverclock.value = t.overclock
    const st = useSiteStore.getState()
    u.uFriction.value = st.friction
    u.uSauna.value = st.saunaMode ? 1 : 0
    u.uMouse.value.x += (pointer.x - u.uMouse.value.x) * Math.min(1, dt * 6)
    u.uMouse.value.y += (pointer.y - u.uMouse.value.y) * Math.min(1, dt * 6)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={thermalVert}
        fragmentShader={thermalFrag}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}

export default function ThermalRunaway() {
  const reduced = useSiteStore((s) => s.reducedMotion)
  if (reduced || PERF.noShader) return <div className="thermal-fallback" aria-hidden />
  return (
    <div className="thermal-canvas" aria-hidden>
      <Canvas
        gl={{
          antialias: false,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
        }}
        dpr={[1, MAX_DPR]}
        frameloop="always"
      >
        <Mainstage />
      </Canvas>
    </div>
  )
}
