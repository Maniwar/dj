import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audioBus } from '../../audio/audioBus'
import { useSiteStore } from '../../state/useSiteStore'
import { thermalVert, thermalFrag } from './thermalShader'

const AMBIENT = 22
const MAXT = 125

const pointer = { x: 0.5, y: 0.5 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth
    pointer.y = 1 - e.clientY / window.innerHeight
  })
}

function ThermalPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const { size, gl } = useThree()

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
    }),
    [],
  )

  useEffect(() => {
    const dpr = Math.min(1.75, window.devicePixelRatio || 1)
    gl.setPixelRatio(dpr)
    uniforms.uRes.value.set(size.width * dpr, size.height * dpr)
  }, [size, gl, uniforms])

  useFrame((_, dt) => {
    const u = uniforms
    u.uTime.value += dt
    const b = audioBus.bands
    const t = audioBus.thermal
    u.uBass.value = b.bass
    u.uLevel.value = b.level
    u.uTreble.value = b.treble
    u.uBeat.value = b.beat
    u.uTemp.value = (t.temperature - AMBIENT) / (MAXT - AMBIENT)
    u.uHumidity.value = t.humidity
    u.uDew.value = t.dewPointHit ? 1 : Math.max(0, u.uDew.value - dt * 1.5)
    u.uOverclock.value = t.overclock
    u.uFriction.value = useSiteStore.getState().friction
    // ease the cursor hotspot
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
  if (reduced) {
    // graceful static fallback: no animation loop
    return <div className="thermal-fallback" aria-hidden />
  }
  return (
    <div className="thermal-canvas" aria-hidden>
      <Canvas
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.75]}
        frameloop="always"
      >
        <ThermalPlane />
      </Canvas>
    </div>
  )
}
