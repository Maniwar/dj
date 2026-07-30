import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audioBus } from '../../audio/audioBus'
import { ACCENTS, effectiveAccent, useSiteStore } from '../../state/useSiteStore'
import { publishRigStats, publishTierDebug, publishRigLive } from '../../perf/rigStats'
import { tierMove, newTierState, RIG_FRAME_MS } from '../../perf/tierPolicy'
import { fxOffClass } from '../../perf/fxClasses'
import { usePlayerStore } from '../../state/usePlayerStore'
import { thermalVert, thermalFrag } from './thermalShader'
import { PERF } from '../../lib/perfFlags'
import { useFxOn } from '../../perf/useFx'
import { getFxMultiplier } from '../../perf/intensity'

const AMBIENT = 22
const MAXT = 125
const FREQ_BINS = 64
// The full-screen fragment shader is the heaviest thing on the page, and its cost scales with
// PIXEL COUNT — so a big display was being punished: ~161M shader ops per frame on a laptop
// versus ~1.3 BILLION at 4K. A fixed 1.4x device-pixel cap made that worse, because on a hidpi
// screen it renders ABOVE native resolution.
//
// So the canvas is sized to a pixel BUDGET instead. Small screens are unaffected (they already
// fit inside it and still get the 1.4x crispness); large ones render below native and are
// upscaled by the compositor. That trade is nearly invisible here specifically because this
// layer is beams, bloom and haze — soft, low-frequency content with no fine detail or text to
// lose. It is the one way to keep a 4K display smooth WITHOUT cutting any of the visuals.
// RENDER NATIVE FIRST, and let the tier system take it back if the GPU cannot hold it.
//
// This was 2_300_000 -- about 1920x1200 of shader work -- which meant any viewport bigger than that
// rendered the rig BELOW display resolution and upscaled it. A 3742x1358 screen is 5.1Mpx, so it
// landed at 0.67 linear scale, and the whole effects layer was soft by construction: reported as
// "the entire fx layer still looks very low resolution", which it was. Every per-effect pixel floor
// added around this file fixes ALIASING; none of them can make an upscaled buffer sharp.
//
// 5_500_000 covers a 5.1Mpx panel at scale 1.0, so DPR-1 displays up to about 3800x1400 now render
// the rig at native resolution. `Math.min(dpr, fit)` still prevents supersampling beyond the device's
// own pixels, and MAX_SCALE still caps retina.
//
// THE COST IS REAL: on that 3742x1358 screen this is 5.1Mpx of fragment work per frame instead of
// 2.3Mpx, i.e. 2.2x. It is safe to ask for because asking is reversible -- applyScale multiplies by
// TIERS[], and the sampler below steps the tier down after two slow-frame strikes, so a GPU that
// cannot hold native simply drops to 0.8, 0.65 or 0.5 of it within a few seconds. A budget that is
// too LOW has no such feedback: it just renders soft forever on hardware that had headroom to spare.
// 8M, so the top rung is actually reachable. A 2400x1364 dpr-1 desktop is 3.27Mpx native; the 1.5x
// supersampling rung wants 2.25x that, 7.4Mpx, and at the old 5.5M budget the clamp in applyScale
// would have quietly held it to 1.30x -- the rung would exist but never be reached, which is the
// same class of dead code as the vsync bug in tierPolicy.
//
// Raising it is safe in a way it was NOT before this change: the ladder steps down after two slow
// windows AND climbs back once headroom returns, so an over-ambitious budget costs a few seconds of
// adjustment rather than a permanently soft session. The old budget had to be conservative because
// degradation was one-way.
// Back to 8M. 13.5M existed only so the 2x rung could be reached; with no rung above native this
// is just the ceiling that stops an enormous window allocating an absurd buffer, and 8M leaves
// native comfortably reachable on the large displays this actually runs on.
const PIXEL_BUDGET = 8_000_000
const MIN_SCALE = 0.55 // never go so soft that the beams smear
// 2, not 1.4, and this is the cap that was actually keeping the rig soft on a retina display.
//
// shaderScale already does Math.min(dpr, fit), so it never supersamples past the device's own
// pixels -- MAX_SCALE exists only to stop an absurd buffer on a very high DPR panel. At 1.4 it was
// doing something quite different: on ANY dpr-2 display it clamped the render to 1.4x CSS when
// native is 2.0x, i.e. 70% of native, and then the browser upscaled it. Raising PIXEL_BUDGET did
// nothing for those machines because this, not the budget, was the binding constraint -- which is
// why the fx layer still read as soft after the budget change.
//
//   1871x679 @2   ->  was 2619x951 upscaled to 3742x1358;  now 3742x1358 native
//   1440x900 @2   ->  was 2016x1260 upscaled to 2880x1800; now 2880x1800 native
//
// Cost is bounded by PIXEL_BUDGET regardless: 1871x679 at scale 2 is 5.08Mpx against the 5.5M
// budget, so `fit` is not even the limiting term there. And the tier sampler still steps down if
// the GPU cannot hold it.
const MAX_SCALE = 2

// THE LADDER NOW GOES UP AS WELL AS DOWN, and the two rungs above 1.0 are the point.
//
// shaderScale ends in Math.min(dpr, fit) -- it will never render more pixels than the display
// physically has. On a dpr-2 laptop that is fine, because the browser downsamples 2x for you and
// every diagonal edge gets four samples. On a dpr-1 panel it is exactly wrong: native IS one
// sample per pixel, so every laser, every beam edge, every ring gets a hard staircase and no
// amount of work inside the shader can smooth it. The only cure for aliasing at dpr 1 is to
// render ABOVE native and let the browser downsample -- supersampling, the oldest AA there is.
//
// It starts at NATIVE (START_TIER) rather than at the top. Starting at 1.5x would mean opening
// every session with several seconds of jank while the sampler walked back down, which is a worse
// first impression than a slightly soft one. Instead the rig proves it has headroom -- 8 windows
// under budget -- and only then spends it on sharpness. Under load it steps down exactly as
// before, and tierPolicy's one-free-retry rule stops it hunting between two rungs.
// NO RUNG ABOVE NATIVE, and this time it was measured rather than guessed at.
//
// Once the thresholds were finally calibrated to the rig's own 30fps metronome, it climbed to the
// 2x rung and stayed there, so we got a real look at the cost. The budget clamped the actual scale
// to 1.35x -- 13.5Mpx, exactly PIXEL_BUDGET -- and at that size:
//
//   the page fell to about 40fps
//   the auto profile detector demoted itself from full to balanced, p95 16.8ms -> 33.4ms
//   the difference was not visible to the person looking at it
//
// A cost that is measurable and a benefit that is not is a straightforward answer.
//
// It also exposed a gap worth recording: the rig's own sampler read avg 32.5ms at that size, well
// inside its climb threshold, because it only ever measures its OWN rate-limited loop. A rig capped
// at 30fps cannot detect that it is starving the rest of the page of frames. If a rung above native
// is ever wanted again, the policy has to watch the PAGE's frame time, not the rig's.
const TIERS = [1, 0.8, 0.65, 0.5]
const START_TIER = 0 // native: the top of the ladder, and where every session begins

function shaderScale(cssW: number, cssH: number): number {
  if (typeof window === 'undefined') return 1
  const dpr = window.devicePixelRatio || 1
  if (window.matchMedia('(max-width: 768px)').matches) return Math.min(1, dpr)
  const area = Math.max(1, cssW * cssH)
  const fit = Math.sqrt(PIXEL_BUDGET / area) // scale that lands exactly on the budget
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(dpr, fit)))
}

const pointer = { x: 0.5, y: 0.5 }
/**
 * A short history of pointer positions, newest first, and the last click.
 *
 * The visible trail and burst are DOM (.glow-trail, .click-burst in BeatCursor) and the rig cannot
 * see them, so the same gesture is carried into the shader as LIGHT — which is what lets the water,
 * the confetti and the dust react to the cursor. Module scope rather than component state because it
 * is read once per frame inside useFrame and must never trigger a React render.
 *
 * Sampled on a distance threshold rather than on every event: a fast drag fires pointermove far more
 * often than the rig draws, and an unfiltered history would collapse into eight samples spanning a
 * few pixels — a blob, not a trail.
 */
const TRAIL_LEN = 8
const trail = Array.from({ length: TRAIL_LEN }, () => ({ x: 0.5, y: 0.5 }))
const click = { x: 0.5, y: 0.5, at: -100 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth
    pointer.y = 1 - e.clientY / window.innerHeight
    const dx = pointer.x - trail[0].x
    const dy = pointer.y - trail[0].y
    if (dx * dx + dy * dy > 0.0004) {
      for (let i = TRAIL_LEN - 1; i > 0; i--) {
        trail[i].x = trail[i - 1].x
        trail[i].y = trail[i - 1].y
      }
      trail[0].x = pointer.x
      trail[0].y = pointer.y
    }
  })
  window.addEventListener('pointerdown', (e) => {
    click.x = e.clientX / window.innerWidth
    click.y = 1 - e.clientY / window.innerHeight
    click.at = performance.now() / 1000
  })
}

function Mainstage() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const songSlugRef = useRef('')
  const agcRef = useRef(0) // running peak for the spectrum strip's auto-gain
  const confettiRef = useRef(0)
  const backdropElRef = useRef<HTMLVideoElement | null>(null)
  const backdropTexRef = useRef<THREE.VideoTexture | null>(null)
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
      // The render scale, so the shader can tell canvas pixels from display pixels. Anything sized
      // in "pixels" (the LED cells) has to be converted through this or it changes size whenever the
      // budget or the tier moves the scale.
      uPxScale: { value: 1 },
      // The footage, so water can bend it. Null until a <video> is actually on screen.
      uBackdrop: { value: null as THREE.VideoTexture | null },
      uRefract: { value: 0 },
      uTrail: { value: Array.from({ length: 8 }, () => new THREE.Vector2(0.5, 0.5)) },
      uClickPos: { value: new THREE.Vector2(0.5, 0.5) },
      uClickAge: { value: 99 },
      uQuality: { value: PERF.isMobile ? 0 : 1 }, // phones skip the costliest shader passes
      uSong: { value: 0 }, // per-track lighting design (stable hash of the slug)
      uPattern: { value: 0 }, // which rig look is up; changes every 4 bars
      uVocal: { value: 0 },   // impulse each time a sung word lands
      uConfetti: { value: 0 }, // slow-decaying drop envelope, so confetti outlives the drop
      uTemp: { value: 0 },
      uHumidity: { value: 0.35 },
      uDew: { value: 0 },
      uOverclock: { value: 0 },
      uIntensity: { value: 1 }, // master dial multiplier; 1 = the site as tuned
      uSauna: { value: 0 },
      uFreq: { value: freqTex },
      uFreqCount: { value: FREQ_BINS },
    }),
    [freqTex],
  )

  // ---- ADAPTIVE QUALITY ----------------------------------------------------------------
  // The pixel budget bounds how many pixels we shade, but says nothing about how fast THIS
  // GPU shades them. A fixed budget hands a 2019 integrated laptop chip exactly the same load
  // as an M3 Max, which is why the rig could still feel heavy on a modest machine even with
  // the music paused — nothing audio-reactive is running then, but the raymarch still is.
  //
  // So the renderer measures itself and backs off in discrete tiers until frames are cheap
  // enough. It only ever steps DOWN: stepping back up invites oscillation, where the page
  // alternates between smooth and stuttering, which reads far worse than settling one tier
  // lower and staying there. Each step is followed by a settle window so the cost of the
  // resize itself is never mistaken for a slow frame.
  const tier = useRef(START_TIER)
  // TIME-based windows, not frame counts. Counting frames is self-defeating here: the slower
  // the machine, the longer it takes to collect the samples that would trigger the rescue. At
  // 10fps a 90-frame window is nine seconds of jank before anything happens.
  // Grace period before ANY measurement. Start-up is the slowest the page ever is — shaders
  // compiling, the first video decoding, chunks landing — and judging a GPU on those frames
  // would pin a 3080 to the bottom tier. Degradation is no longer one-way -- tierPolicy climbs
  // back once the machine shows sustained headroom -- but a false positive still costs several
  // seconds at the wrong resolution, so the settle window below stays generous.
  const acc = useRef({ frames: 0, time: 0, settleUntil: 0, lastClose: 0, policy: newTierState(TIERS.length) })
  // 42ms, i.e. 24fps, and sustained over 4 windows rather than 2 -- roughly four seconds.
  //
  // This was 22ms. Frame time is quantised by vsync: a 60Hz display delivers 16.7, 33.3 or 50ms and
  // nothing between, so 22 did not mean "45fps", it meant "about a third of frames missed vsync" --
  // a hair-trigger sitting barely above the floor. A machine measured at 59fps with p50 and p95 both
  // 17ms had walked all the way to the bottom tier because of it. Quality should be surrendered when
  // the page is genuinely unpleasant, not when it hiccups.
  const SLOW_MS = 42

  const applyScale = useCallback(() => {
    // The budget is enforced HERE, on the final scale, not inside shaderScale. shaderScale bounds
    // the native-equivalent scale; the supersampling rungs multiply on top of it, so a cap applied
    // before the multiply would not bound the buffer that actually gets allocated. Squaring is the
    // whole point: 1.5x scale is 2.25x the fragments.
    const raw = shaderScale(size.width, size.height) * TIERS[tier.current]
    const area = Math.max(1, size.width * size.height)
    // MAX_SCALE is an ABSOLUTE ceiling here, not just a cap on the base. Without it a dpr-2 display
    // would take its native 2.0 base into the 2x rung and ask for 4.0 -- sixteen times the fragments
    // of CSS resolution, for no benefit, since a dpr-2 panel already gets 4 samples per CSS pixel
    // from the browser. Supersampling is for displays that do not have that, i.e. dpr 1.
    const scale = Math.max(MIN_SCALE, Math.min(raw, MAX_SCALE, Math.sqrt(PIXEL_BUDGET / area)))
    gl.setPixelRatio(scale)
    uniforms.uRes.value.set(size.width * scale, size.height * scale)
    uniforms.uPxScale.value = scale
    // Published so the diag panel and the JSON export can SEE the render scale. Its absence is why
    // "the fx layer looks soft" took several rounds to trace: the panel reported the intensity
    // multiplier, which is a different quantity, while two invisible caps held the rig below native.
    const dprNow = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    publishRigStats({
      scale,
      tier: tier.current,
      tierMultiplier: TIERS[tier.current],
      tierCount: TIERS.length,
      topMultiplier: TIERS[0],
      dpr: dprNow,
      cssW: size.width,
      cssH: size.height,
      bufferW: Math.round(size.width * scale),
      bufferH: Math.round(size.height * scale),
      nativeFraction: scale / dprNow,
      quality: uniforms.uQuality.value,
    })
    // past the first step-down, drop the costliest shader passes as well
    // Relative to START_TIER, not an absolute index. This read `tier.current >= 2` when 2 meant
    // "two steps below native"; 2 is now native itself, so left alone it would have switched the
    // expensive passes off for everybody the moment the ladder gained its supersampling rungs.
    uniforms.uQuality.value = PERF.isMobile || tier.current >= START_TIER + 2 ? 0 : 1
  }, [size, gl, uniforms])

  useEffect(() => {
    // recomputed on every resize, so dragging between a laptop and an external 4K panel
    // re-tunes the render scale instead of staying stuck at whatever the first screen implied
    applyScale()
  }, [applyScale])

  // the metronome for the capped mobile frame rate (see frameloop on the Canvas)
  const invalidate = useThree((st) => st.invalidate)
  useEffect(() => {

    // THE METRONOME IS WHERE IDLING HAS TO HAPPEN.
    //
    // With frameloop="demand" a frame is drawn only when invalidate() is called, so returning
    // early from useFrame skips the uniform update but NOT the draw — measured: 119 draws in 4s
    // playing, 121 after pausing. The render loop has to be told to stop, not the callback.
    //
    // Two extra ticks after playback stops so the beams ease out instead of freezing mid-sweep,
    // then nothing is drawn at all until audio resumes.
    let quiet = 0
    const id = window.setInterval(() => {
      if (audioBus.playing) quiet = 0
      else if (quiet++ > 2) return
      invalidate()
    }, RIG_FRAME_MS) // ~30fps — tierPolicy derives its thresholds from this, so they stay in step
    return () => window.clearInterval(id)
  }, [invalidate])

  const idle = useRef(0)
  useFrame((_, dt) => {
    const u = uniforms

    // DON'T DRAW WHAT NOBODY IS WATCHING.
    //
    // The rig is a MUSIC visualiser: every beam angle, intensity and sweep is driven by the
    // audio. With nothing playing the uniforms settle to constants and every frame renders an
    // identical image — a full-screen raymarch, eight beams, four octaves of fbm per pixel, at
    // 2.3 megapixels, producing a picture indistinguishable from the last one.
    //
    // Two frames of grace after playback stops so the beams ease out rather than freezing
    // mid-sweep, then the loop stops entirely until audio resumes. This costs nothing visually
    // and is the single largest block of avoidable GPU work on the page.
    // Published BEFORE the return, so the panel can distinguish "the sampler stopped because the rig
    // went idle" from "the sampler is running and nothing has changed". Those look identical from
    // outside -- the idle path skips the uniform update but still draws, so a frozen rig looks alive.
    publishRigLive(audioBus.playing, idle.current, acc.current.frames)
    if (!audioBus.playing) {
      idle.current++
      if (idle.current > 2) return
    } else {
      idle.current = 0
    }

    u.uTime.value += dt

    // measure, then degrade if this machine cannot hold the frame rate
    const a = acc.current
    const now = performance.now()
    if (a.settleUntil === 0) a.settleUntil = now + 3000 // ignore the first 3s entirely
    // The policy itself lives in src/perf/tierPolicy.ts and is covered by scripts/verify-tier.mjs.
    // It is out there rather than inline because the rig needs WebGL2 to mount and the headless
    // browser on this machine has none, so a policy written in here could not be tested at all --
    // which is how it shipped one-way degradation (drop on a hitch, never climb back) unnoticed.
    if (now >= a.settleUntil) {
      a.frames++
      a.time += dt * 1000
      // a full second of evidence, or 20 frames, whichever lands first — so a machine running
      // at 8fps still gets judged after ~1s rather than after ninety slow frames
      if (a.time >= 1000 || a.frames >= 20) {
        const move = tierMove(a.time / a.frames, tier.current, TIERS.length - 1, SLOW_MS, a.policy)
        publishTierDebug(a.policy.fast, a.policy.failed, a.time / a.frames, now - (a.lastClose || now))
        a.lastClose = now
        if (move !== 'hold') {
          tier.current += move === 'down' ? 1 : -1
          applyScale()
          a.settleUntil = now + 600 // don't count the resize itself as a slow frame
        }
        a.frames = 0
        a.time = 0
      }
    }
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
    // A LONGER TAIL AND A BASELINE, because "I don't see confetti falling" was correct: this was
    // driven ONLY by mu.drop, which is a genuine drop detector firing once or twice in a whole
    // track, with a 4s decay. So confetti existed for about four seconds per song and was gone.
    // The tail is 11s now -- a cannon's worth of paper takes a while to come down -- and there is a
    // small constant fall underneath it, so the air is never completely empty. The drop still
    // produces the burst; it is no longer the only thing that produces anything.
    confettiRef.current = Math.max(mu.drop, confettiRef.current - dt / 11.0)
    // GATED ON PLAYBACK, not on mu.bpm. bpm is documented as "0 until enough beats are seen" and
    // NOTHING EVER ASSIGNS IT -- setTempoHint sets this.period, not m.bpm -- so it is permanently 0
    // and this baseline never once fired. Confetti has only ever appeared on mu.drop, which is a
    // genuine drop detector firing once or twice a track. That is the answer to "what triggers the
    // confetti, I do not see it": nothing did, most of the time.
    // 0.55 ambient, not 0.26. This is one of two multiplicative dimmers on the same effect -- the
    // shader also scales the flakes by (0.55 + uBeat*0.4) -- and 0.26 x 0.55 is 14%, so a fully lit
    // flake emitted 0.086 under a screen blend and simply did not appear over bright footage.
    // Reported as the confetti being almost transparent. Neither number was wrong on its own; they
    // were tuned in different passes and nothing looked at the product.
    u.uConfetti.value = Math.max(confettiRef.current, audioBus.playing ? 0.55 : 0.0)
    // Cursor history and the last click, straight through — no smoothing here, because the trail's
    // own spacing IS the smoothing and the click is meant to be instant.
    for (let i = 0; i < 8; i++) u.uTrail.value[i].set(trail[i].x, trail[i].y)
    u.uClickPos.value.set(click.x, click.y)
    u.uClickAge.value = performance.now() / 1000 - click.at

    // ---- THE FOOTAGE AS A TEXTURE ----
    // The rig composites over a DOM <video> and has never been able to see it, which is why the water
    // could only add light and never bend anything. THREE.VideoTexture wraps THE SAME ELEMENT, so it
    // reuses frames the decoder is already producing -- no second decode, no second network fetch.
    // Re-resolved each frame because Broadcast swaps scenes and the stills fallback removes the
    // element entirely; querySelector on a mounted document is cheap and this is the only place that
    // knows whether there is anything to sample at all.
    const vid = document.querySelector('video.bc-video') as HTMLVideoElement | null
    if (vid !== backdropElRef.current) {
      backdropElRef.current = vid
      if (backdropTexRef.current) backdropTexRef.current.dispose()
      backdropTexRef.current = vid ? new THREE.VideoTexture(vid) : null
      u.uBackdrop.value = backdropTexRef.current
    }
    // OFF unless there is genuinely something to refract AND the effect is switched on. Three gates,
    // because each answers a different question: is there a frame to sample, has the registry retired
    // it (the dial does this through minIntensity, and the panel through the same class), and is the
    // GPU already struggling. uIntensity scales the strength so the dial reads as a strength control
    // rather than an on/off, right up to the point the registry retires it entirely.
    const canRefract =
      !!vid &&
      vid.readyState >= 2 &&
      !document.documentElement.classList.contains(fxOffClass('dropRefraction'))
    u.uRefract.value = canRefract && tier.current < 3 ? Math.min(1.2, u.uIntensity.value) : 0
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
    // Section colour where a section owns it, otherwise the palette walked on the beat grid. The
    // rule lives in effectiveAccent() so this and the player's spectrum cannot drift apart -- they
    // did once, and the wall cycled while the player held magenta.
    const target = effectiveAccent(useSiteStore.getState().accent, mu.beatIndex)
    const k = 1 - Math.exp(-dt / 0.35)
    u.uAccent.value.x += (target[0] - u.uAccent.value.x) * k
    u.uAccent.value.y += (target[1] - u.uAccent.value.y) * k
    u.uAccent.value.z += (target[2] - u.uAccent.value.z) * k
    u.uTemp.value = (t.temperature - AMBIENT) / (MAXT - AMBIENT)
    u.uHumidity.value = t.humidity
    u.uDew.value = t.dewPointHit ? 1 : Math.max(0, u.uDew.value - dt * 1.5)
    u.uOverclock.value = t.overclock
    const st = useSiteStore.getState()
    // The MULTIPLIER, not the knob position — the same 0..1.4 number the CSS reads as --fx, so
    // the rig and the page are scaled by one value and cannot drift apart. (The old code fed the
    // raw knob straight in, which is why the shader's coefficients had to change with it.)
    u.uIntensity.value = getFxMultiplier()
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
  // Subscribed, not read once. This used to be PERF.noShader, parsed from the URL at load, so the
  // `shader` switch could only be honoured by reloading — which meant the benchmark's
  // effects-only leg measured a page with a full-viewport fragment shader still running in it.
  // Unmounting is the whole point: it releases the WebGL context and stops the rAF loop, neither
  // of which a root class can do.
  const shaderOn = useFxOn('shader')
  if (reduced || !shaderOn) return <div className="thermal-fallback" aria-hidden />
  return (
    <div className="thermal-canvas" aria-hidden>
      <Canvas
        gl={{
          antialias: false,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
        }}
        dpr={[1, MAX_SCALE]}
        // Phones render the rig at 30fps instead of 60. It is haze, beams and slow bloom —
        // nothing in it moves fast enough for 60fps to buy anything — and halving the frame
        // count halves the GPU work, which on a phone is felt as heat rather than smoothness.
        // 'demand' plus the metronome in Mainstage is how r3f expresses a capped rate.
        // 'demand' everywhere, driven by the metronome below. The beams sweep over seconds, not
        // frames: at 30fps they are visually identical to 60 and cost half as much. Rendering a
        // full-screen raymarch twice as often as anyone can perceive is the definition of work
        // that does not earn its place.
        frameloop="demand"
      >
        <Mainstage />
      </Canvas>
    </div>
  )
}
