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
  const { size, gl } = useThree()

  // RGBA spectrum texture (universally supported) — the giant LED wall + lasers read it
  const freqData = useMemo(() => new Uint8Array(FREQ_BINS * 4), [])
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
    // push downsampled FFT into the texture for the LED wall
    const src = audioBus.freq
    const step = Math.max(1, Math.floor(src.length / FREQ_BINS))
    for (let i = 0; i < FREQ_BINS; i++) {
      let m = 0
      for (let j = 0; j < step; j++) m += src[i * step + j] || 0
      const v = Math.min(255, (m / step) * 1.25)
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
