import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audioBus } from '../../audio/audioBus'
import { useSiteStore } from '../../state/useSiteStore'
import { thermalVert, thermalFrag } from './thermalShader'

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
    u.uBeat.value = boost(b.beat, 1.7, 0.68)
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
  if (reduced) return <div className="thermal-fallback" aria-hidden />
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
