import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { audioBus } from './audioBus'
import { useSiteStore } from '../state/useSiteStore'
import {
  usePlayerStore,
  getTrack,
  getVersion,
  nextTrackSlug,
  prevTrackSlug,
} from '../state/usePlayerStore'

type AudioController = {
  playTrack: (slug: string, versionId?: string) => void
  toggle: () => void
  play: () => void
  pause: () => void
  setVersion: (versionId: string) => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
}

const Ctx = createContext<AudioController | null>(null)
export const useAudio = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAudio must be used within <AudioProvider>')
  return c
}

const AMBIENT = 22 // °C
const DEW_POINT = 96 // meltdown threshold

export function AudioProvider({ children }: { children: ReactNode }) {
  const elRef = useRef<HTMLAudioElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const rafRef = useRef<number>(0)
  const lastTsRef = useRef<number>(0)
  // meltdown state machine (kept out of React to avoid churn)
  const coolingRef = useRef<number>(0) // seconds remaining in a liquid-cooling event

  // create the single, never-unmounted <audio> element
  if (!elRef.current && typeof Audio !== 'undefined') {
    const el = new Audio()
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    elRef.current = el
  }

  function ensureGraph() {
    if (ctxRef.current || !elRef.current) return
    const AC = window.AudioContext || (window as any).webkitAudioContext
    const ctx: AudioContext = new AC()
    const src = ctx.createMediaElementSource(elRef.current)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = audioBus.fftSize
    analyser.smoothingTimeConstant = 0.82
    const gain = ctx.createGain()
    gain.gain.value = usePlayerStore.getState().volume
    src.connect(analyser)
    analyser.connect(gain)
    gain.connect(ctx.destination)
    ctxRef.current = ctx
    gainRef.current = gain
    audioBus.attach(analyser)
    startLoop()
  }

  function startLoop() {
    cancelAnimationFrame(rafRef.current)
    lastTsRef.current = performance.now()
    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000)
      lastTsRef.current = ts
      audioBus.update()
      integrateThermal(dt)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function integrateThermal(dt: number) {
    const t = audioBus.thermal
    const friction = useSiteStore.getState().friction
    const playing = audioBus.playing
    // heat in from bass energy + friction knob; passive cooling toward ambient
    const heatIn = playing ? audioBus.bands.bass * 70 + friction * 22 : 0
    const cooling = (t.temperature - AMBIENT) * (coolingRef.current > 0 ? 3.2 : 0.55)
    t.temperature += (heatIn - cooling) * dt
    // humidity chases temperature
    const targetHum = 0.3 + Math.min(1, Math.max(0, (t.temperature - AMBIENT) / 90)) * 0.7
    t.humidity += (targetHum - t.humidity) * Math.min(1, dt * 1.5)

    if (coolingRef.current > 0) {
      coolingRef.current -= dt
      t.dewPointHit = true
      t.overclock = Math.min(1, t.overclock + dt * 1.6)
      if (coolingRef.current <= 0) {
        coolingRef.current = 0
        t.dewPointHit = false
      }
    } else {
      t.overclock = Math.max(0, t.overclock - dt * 0.25) // reward decays
      if (t.temperature >= DEW_POINT) {
        // MELTDOWN → Kiki dumps the bucket → liquid cooling for ~2.4s
        coolingRef.current = 2.4
        t.dewPointHit = true
      }
    }
    t.temperature = Math.max(AMBIENT, Math.min(125, t.temperature))
  }

  // ---- element event wiring -> low-frequency store updates ----
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const set = usePlayerStore.getState()._set
    const onTime = () => set({ currentTime: el.currentTime })
    const onDur = () => set({ duration: isFinite(el.duration) ? el.duration : 0 })
    const onPlay = () => {
      audioBus.playing = true
      set({ isPlaying: true })
    }
    const onPause = () => {
      audioBus.playing = false
      set({ isPlaying: false })
    }
    const onEnded = () => controller.next()
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('durationchange', onDur)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('durationchange', onDur)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // attach the (otherwise detached) audio element to the DOM, hidden — more robust
  // across browsers and observable for debugging. It lives for the app's lifetime.
  useEffect(() => {
    const el = elRef.current
    if (el && !el.isConnected) {
      el.setAttribute('aria-hidden', 'true')
      el.style.display = 'none'
      document.body.appendChild(el)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  function loadAndMaybePlay(src: string, opts: { seek?: number; play?: boolean }) {
    const el = elRef.current
    if (!el) return
    const gain = gainRef.current
    if (gain && ctxRef.current) {
      // quick dip to mask the source swap (bootleg switch)
      const now = ctxRef.current.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.04)
    }
    const onReady = () => {
      el.removeEventListener('loadedmetadata', onReady)
      if (opts.seek != null) el.currentTime = Math.min(opts.seek, el.duration || opts.seek)
      if (opts.play) el.play().catch(() => {})
      if (gain && ctxRef.current) {
        const now = ctxRef.current.currentTime
        gain.gain.linearRampToValueAtTime(usePlayerStore.getState().volume, now + 0.18)
      }
    }
    el.addEventListener('loadedmetadata', onReady)
    el.src = src
    el.load()
  }

  // standalone functions (no `this`) so the methods can call one another cleanly
  function playTrack(slug: string, versionId?: string) {
    ensureGraph()
    ctxRef.current?.resume()
    const track = getTrack(slug)
    if (!track) return
    const version = getVersion(slug, versionId ?? track.defaultVersionId)
    if (!version) return
    usePlayerStore.getState()._set({ currentTrackSlug: slug, currentVersionId: version.id })
    loadAndMaybePlay(version.src, { seek: 0, play: true })
  }

  const controller: AudioController = useMemo(
    () => ({
      playTrack,
      toggle() {
        const el = elRef.current
        if (!el) return
        ensureGraph()
        ctxRef.current?.resume()
        if (!usePlayerStore.getState().currentTrackSlug) {
          playTrack(usePlayerStore.getState().tracks[0].slug)
          return
        }
        if (el.paused) el.play().catch(() => {})
        else el.pause()
      },
      play() {
        ensureGraph()
        ctxRef.current?.resume()
        elRef.current?.play().catch(() => {})
      },
      pause() {
        elRef.current?.pause()
      },
      setVersion(versionId) {
        const st = usePlayerStore.getState()
        const version = getVersion(st.currentTrackSlug, versionId)
        if (!version) return
        const el = elRef.current
        const wasPlaying = el ? !el.paused : false
        const at = el ? el.currentTime : 0
        st._set({ currentVersionId: version.id })
        loadAndMaybePlay(version.src, { seek: at, play: wasPlaying })
      },
      next() {
        playTrack(nextTrackSlug(usePlayerStore.getState().currentTrackSlug))
      },
      prev() {
        playTrack(prevTrackSlug(usePlayerStore.getState().currentTrackSlug))
      },
      seek(t) {
        if (elRef.current) elRef.current.currentTime = t
      },
      setVolume(v) {
        const vol = Math.max(0, Math.min(1, v))
        usePlayerStore.getState()._set({ volume: vol })
        if (gainRef.current && ctxRef.current) {
          gainRef.current.gain.setTargetAtTime(vol, ctxRef.current.currentTime, 0.02)
        }
      },
    }),
    // controller is stable; internal refs/functions handle the rest
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>
}
