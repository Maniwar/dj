// ============================================================================================
// DETERMINISTIC OFFLINE RENDER — the site, as a video file, with the music locked to the picture
// ============================================================================================
// Every real-time route to a 1080x1920 capture is blocked on this machine, and it is worth
// writing down why so nobody tries them again:
//
//   screencapture -v      caps at the DISPLAY's point size. The panel is 1363 points tall, so a
//                         1920-tall region does not physically exist. Best case 540x960.
//   Playwright recordVideo  records at viewport size with a low bitrate and NO audio track. It is
//                         a test artifact, not a capture tool.
//   Playwright screenshot   gives a true 1080x1920 (it honours deviceScaleFactor) but takes 517ms
//                         a frame -- 1.9fps. Hopeless for real time.
//
// So: stop trying to capture in real time. Drive the page frame by frame instead, and the 1.9fps
// screenshot rate stops mattering entirely, because capture speed no longer has any relationship
// to output frame rate. A 30s clip is 900 frames, about eight minutes of wall clock, and comes out
// as a perfect 30fps file.
//
// It also fixes everything else in one move: no pre-fullscreen state (we start in the state we
// want), no HUD (hidden with injected CSS), the URL present (injected as an element), and the audio
// EXACTLY in sync -- because the visuals are computed FROM the audio rather than recorded next to
// it. Frame 300 of the video is frame 300 of the analysis, always.
//
// HOW THE PAGE IS DRIVEN. No application code is changed. audioBus reads its spectrum from an
// AnalyserNode via getByteFrequencyData, and the app advances on requestAnimationFrame, so three
// overrides installed before any page script runs are enough to take control of both:
//
//   performance.now / Date.now   a virtual clock we step by exactly 1/fps
//   requestAnimationFrame        callbacks are queued, not scheduled; we flush them per frame
//   AnalyserNode.getByteFrequencyData   filled from the spectrum precomputed for this frame
//
//   node scripts/render-clip.mjs <audio.mp3> <out.mp4> [seconds] [startSeconds]

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [, , AUDIO, OUT, DUR = '20', START = '0'] = process.argv
if (!AUDIO || !OUT) {
  console.error('usage: node scripts/render-clip.mjs <audio.mp3> <out.mp4> [seconds] [startSeconds]')
  process.exit(2)
}
const FPS = 30
const SECONDS = Number(DUR)
const START_S = Number(START)
const FRAMES = Math.round(SECONDS * FPS)
const W = 540, H = 960          // CSS px; deviceScaleFactor 2 makes the screenshot 1080x1920
const FFT = 2048                // window size; 1024 usable bins, matching a default AnalyserNode
const SR = 44100

// ---- a minimal radix-2 FFT ----------------------------------------------------------------
// Small enough to keep here rather than take a dependency, and the shape of the spectrum is all
// that matters: audioBus only ever reads band averages out of it.
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k]
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ur + vr; im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
}

// ---- decode the audio and build one spectrum per output frame ------------------------------
// Byte values, 0..255, exactly as getByteFrequencyData would produce, so nothing downstream can
// tell the difference between this and a live analyser.
function spectraFor(file) {
  const tmp = mkdtempSync(join(tmpdir(), 'clip-'))
  const raw = join(tmp, 'a.f32')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR),
    '-f', 'f32le', raw], { stdio: ['ignore', 'ignore', 'inherit'] })
  const buf = readFileSync(raw)
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4))
  rmSync(tmp, { recursive: true, force: true })

  const hann = new Float32Array(FFT)
  for (let i = 0; i < FFT; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT - 1)))

  const out = []
  const bins = FFT / 2
  for (let f = 0; f < FRAMES; f++) {
    const centre = Math.floor((START_S + f / FPS) * SR)
    const re = new Float64Array(FFT), im = new Float64Array(FFT)
    for (let i = 0; i < FFT; i++) {
      const s = centre - FFT / 2 + i
      re[i] = (s >= 0 && s < pcm.length ? pcm[s] : 0) * hann[i]
    }
    fft(re, im)
    const bytes = new Uint8Array(bins)
    for (let i = 0; i < bins; i++) {
      const mag = Math.hypot(re[i], im[i]) / (FFT / 4)
      // dB, mapped over the same -100..-30 window an AnalyserNode uses by default
      const db = 20 * Math.log10(mag + 1e-9)
      bytes[i] = Math.max(0, Math.min(255, Math.round((db + 100) / 70 * 255)))
    }
    out.push(Array.from(bytes))
  }
  return out
}

// ---- the page-side driver, installed before any application script runs --------------------
function driver() {
  const state = { t: 0, spectrum: null, queue: [] }
  window.__clip = state

  const realNow = performance.now.bind(performance)
  performance.now = () => state.t
  const RealDate = Date
  // eslint-disable-next-line no-global-assign
  Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [state.t])) }
    static now() { return state.t }
  }

  // rAF callbacks are QUEUED rather than scheduled. Nothing advances until we flush, which is what
  // makes the render deterministic: the page cannot tick between our screenshots.
  window.requestAnimationFrame = (cb) => { state.queue.push(cb); return state.queue.length }
  window.cancelAnimationFrame = () => {}

  const proto = window.AnalyserNode && window.AnalyserNode.prototype
  if (proto) {
    proto.getByteFrequencyData = function (arr) {
      const s = state.spectrum
      for (let i = 0; i < arr.length; i++) arr[i] = s ? (s[i] ?? 0) : 0
    }
    proto.getByteTimeDomainData = function (arr) { arr.fill(128) }
  }

  window.__step = (t, spectrum) => {
    state.t = t
    state.spectrum = spectrum
    const q = state.queue
    state.queue = []
    for (const cb of q) { try { cb(t) } catch { /* a dead callback must not stall the render */ } }
  }
  window.__realNow = realNow
}

const clean = `
  .viz-hud .viz-controls, .viz-exit, .player, .diag-panel { display: none !important; }
  #clipurl { position: fixed; left: 0; right: 0; bottom: 26px; text-align: center; z-index: 99999;
    font-family: 'Oswald', Impact, sans-serif; font-size: 19px; letter-spacing: 0.22em;
    color: #fff; text-shadow: 0 2px 6px #000, 0 0 18px rgba(0,0,0,0.9); pointer-events: none; }
`

const main = async () => {
  console.log(`analysing ${AUDIO} — ${FRAMES} frames @ ${FPS}fps from ${START_S}s`)
  const spectra = spectraFor(AUDIO)

  const br = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=metal'],
  })
  const ctx = await br.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
  const pg = await ctx.newPage()
  await pg.addInitScript(driver)
  await pg.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' })

  // The page is frozen until stepped, so nudge it forward to let boot finish and the gate mount.
  for (let i = 0; i < 120; i++) await pg.evaluate((t) => window.__step(t, null), i * 33)
  for (const el of await pg.$$('button')) {
    const t = ((await el.textContent()) || '').toLowerCase()
    if (t.includes('log on')) { await el.dispatchEvent('click'); break }
  }
  for (let i = 120; i < 260; i++) await pg.evaluate((t) => window.__step(t, null), i * 33)
  await pg.keyboard.press('v')
  for (let i = 260; i < 300; i++) await pg.evaluate((t) => window.__step(t, null), i * 33)

  await pg.addStyleTag({ content: clean })
  await pg.evaluate(() => {
    if (!document.getElementById('clipurl')) {
      const d = document.createElement('div')
      d.id = 'clipurl'; d.textContent = 'CLUB-HUMIDITY.COM'
      document.body.appendChild(d)
    }
    // audioBus only runs its detectors while it believes something is playing.
    if (window.audioBus) window.audioBus.playing = true
  })

  const dir = mkdtempSync(join(tmpdir(), 'frames-'))
  const base = 300 * 33
  const t0 = Date.now()
  for (let f = 0; f < FRAMES; f++) {
    await pg.evaluate(([t, s]) => window.__step(t, s), [base + (f * 1000) / FPS, spectra[f]])
    await pg.screenshot({ path: join(dir, `${String(f).padStart(5, '0')}.png`) })
    if (f % 30 === 0) {
      const el = (Date.now() - t0) / 1000
      process.stdout.write(`\r  frame ${f}/${FRAMES}  ${el.toFixed(0)}s elapsed, ~${((el / Math.max(f, 1)) * (FRAMES - f)).toFixed(0)}s left   `)
    }
  }
  console.log('\n  assembling…')
  await br.close()

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS),
    '-i', join(dir, '%05d.png'), '-ss', String(START_S), '-t', String(SECONDS), '-i', AUDIO,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', OUT], { stdio: ['ignore', 'ignore', 'inherit'] })
  rmSync(dir, { recursive: true, force: true })
  console.log(`  wrote ${OUT}`)
}

main()
