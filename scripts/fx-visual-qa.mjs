// ============================================================================================
// LOOK AT THE EFFECTS. Side by side. At the two render scales the rig can choose between.
// ============================================================================================
// Every previous attempt to judge the rig's sharpness failed for one of two reasons:
//
//   1. In the page, headless Chrome plays no audio, so uBeat/uDrop/uLevel sit at zero and the
//      shader draws an idle, nearly-black rig. The starburst is gated on `uDrop + uDown*0.38`, so
//      it had NEVER been rendered in any automated check. Screenshots of a quiet moment show
//      almost no effects and prove nothing about how they look when they fire.
//
//   2. Numeric proxies for "sharpness" don't work on this content. Counting hard 1px luminance
//      jumps conflates aliasing with detail: supersampling makes the LED cells crisper and the
//      dust finer, which RAISES the count while making the image better. That metric reported
//      "supersampling isn't helping" on an image where it visibly was.
//
// So this renders the effects with the audio uniforms forced to the moment each one fires, at
// native and at the supersampling rung, and writes magnified side-by-side crops. The judgement is
// made by looking, which is the only instrument that has been right about this so far.
//
//   node scripts/fx-visual-qa.mjs            all scenarios
//   node scripts/fx-visual-qa.mjs starburst  just one
//
// Needs real Chrome: Playwright's bundled Chromium reports webgl2:false on this machine, so the
// rig never mounts there.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = join(process.cwd(), '.fx-qa')
const W = 1000, H = 600

// The uniform state at the instant each effect is at its most visible. These are the moments a
// person actually sees, not the idle state an automated screenshot catches.
const SCENARIOS = {
  starburst: {
    why: 'gated on uDrop + uDown*0.38 — only exists on a drop, so it had never been rendered in a test',
    uni: { uDrop: 1, uDown: 1, uBeat: 1, uLevel: 0.9, uBass: 0.9, uSnare: 0.6, uBar: 0.5, uSong: 0.3 },
    crop: [0.5, 0.5], // fixed: the burst originates at screen centre by construction
  },
  lasers: {
    why: 'the sweeping beams and their volumetric god rays, mid-bar so they are spread across the frame',
    uni: { uBeat: 1, uLevel: 0.8, uBass: 0.8, uBar: 0.35, uBuild: 0.5, uSong: 0.3 },
    // no fixed crop: the beams sweep with uBar, so the hotspot scan finds them
  },
  ledwall: {
    why: 'the cell grid is snapped to whole pixels, so it is the effect most sensitive to render scale',
    uni: { uBeat: 1, uDown: 1, uLevel: 0.9, uBass: 0.9, uSong: 0.3 },
  },
  water: {
    why: 'beads and runners — fine curved edges and specular highlights, where aliasing shows worst',
    uni: { uDew: 1, uHumidity: 0.9, uLevel: 0.5, uBeat: 0.4, uSong: 0.3 },
    crop: [0.5, 0.5],
  },
  confetti: {
    why: 'small bright particles, the classic case where one sample per pixel produces blocky squares',
    uni: { uConfetti: 1, uDrop: 1, uBeat: 1, uLevel: 0.9, uSong: 0.3 },
  },
}

const SS = Number(process.env.SS || 1.5)
const want = process.argv[2]
const names = want ? [want] : Object.keys(SCENARIOS)
for (const n of names) if (!SCENARIOS[n]) { console.error(`unknown scenario "${n}"`); process.exit(2) }

// Bundle the shader so this script reads the SAME source the app ships.
const tmp = mkdtempSync(join(tmpdir(), 'fxqa-'))
const bundle = join(tmp, 'frag.mjs')
execFileSync('npx', ['esbuild', 'src/components/webgl/thermalShader.ts', '--bundle', '--format=esm',
  '--platform=neutral', `--outfile=${bundle}`], { stdio: ['ignore', 'ignore', 'inherit'] })
const { thermalFrag, thermalVert } = await import(bundle)

mkdirSync(OUT, { recursive: true })
const br = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=metal'] })
const page = await br.newPage()
await page.goto('about:blank')

const pngs = await page.evaluate(async ({ vs, fs, W, H, scenarios, names, SS }) => {
  const draw = (w, h, pxScale, over) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }
    const pr = gl.createProgram()
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec3 position;\nattribute vec2 uv;\n' + vs))
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr))
    gl.useProgram(pr)
    const bind = (n, d, c) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b)
      gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, n)
      if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, c, gl.FLOAT, false, 0, 0) }
    bind('position', new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, 1,1,0]), 3)
    bind('uv', new Float32Array([0,0, 1,0, 0,1, 1,1]), 2)
    const N = 64, td = new Uint8Array(N * 4)
    for (let i = 0; i < N; i++) { const v = Math.round(255 * Math.pow(1 - i / N, 1.6) * 0.8)
      td[i*4] = v; td[i*4+1] = v; td[i*4+2] = v; td[i*4+3] = 255 }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, td)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    const U = n => gl.getUniformLocation(pr, n)
    const base = { uTime: 12.5, uPxScale: pxScale, uQuality: 1, uIntensity: 1, uPattern: 0,
      uFreqCount: N, uTemp: 0.5, uHumidity: 0.35, uRefract: 0, uClickAge: 9,
      uLevel: 0, uBeat: 0, uBass: 0, uTreble: 0, uHat: 0, uSnare: 0, uDown: 0, uDrop: 0,
      uBuild: 0, uBar: 0, uVocal: 0, uConfetti: 0, uDew: 0, uOverclock: 0, uSauna: 0, uSong: 0 }
    for (const [k, v] of Object.entries({ ...base, ...over })) {
      const l = U(k); if (l) gl.uniform1f(l, v)
    }
    if (U('uRes')) gl.uniform2f(U('uRes'), w, h)
    if (U('uMouse')) gl.uniform2f(U('uMouse'), 0.5, 0.5)
    if (U('uClickPos')) gl.uniform2f(U('uClickPos'), 0.5, 0.5)
    if (U('uAccent')) gl.uniform3f(U('uAccent'), 1, 0.12, 0.56)
    gl.uniform1i(U('uFreq'), 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    const px = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return { px, w, h }
  }

  // Proper AREA-WEIGHTED downsample. A naive box filter at a 1.5 ratio covers 1 or 2 source pixels
  // alternately and injects aliasing of its own -- which is what made an earlier measurement of
  // this look like supersampling was making things WORSE. Fractional edge weights fix it, so what
  // comes out is the filtering a browser does when it scales the backing store to the CSS size.
  const down = (img, W, H) => {
    const out = new Uint8ClampedArray(W * H * 4)
    const sx = img.w / W, sy = img.h / H
    for (let y = 0; y < H; y++) {
      const y0 = y * sy, y1 = y0 + sy
      for (let x = 0; x < W; x++) {
        const x0 = x * sx, x1 = x0 + sx
        let r = 0, g = 0, b = 0, wsum = 0
        for (let j = Math.floor(y0); j < Math.min(img.h, Math.ceil(y1)); j++) {
          const wy = Math.min(j + 1, y1) - Math.max(j, y0)
          for (let i = Math.floor(x0); i < Math.min(img.w, Math.ceil(x1)); i++) {
            const wx = Math.min(i + 1, x1) - Math.max(i, x0)
            const wgt = wx * wy, o = (j * img.w + i) * 4
            r += img.px[o] * wgt; g += img.px[o+1] * wgt; b += img.px[o+2] * wgt; wsum += wgt
          }
        }
        const o = (y * W + x) * 4
        out[o] = r / wsum; out[o+1] = g / wsum; out[o+2] = b / wsum; out[o+3] = 255
      }
    }
    return { px: out, w: W, h: H }
  }

  // Magnified nearest-neighbour crop, so individual pixels are visible and a staircase reads as
  // a staircase rather than being hidden by the viewer's own scaling.
  const crop = (img, cx, cy, cw, ch, zoom) => {
    const x0 = Math.max(0, Math.min(img.w - cw, Math.round(cx * img.w - cw / 2)))
    const y0 = Math.max(0, Math.min(img.h - ch, Math.round(cy * img.h - ch / 2)))
    const out = new Uint8ClampedArray(cw * zoom * ch * zoom * 4)
    for (let y = 0; y < ch * zoom; y++) for (let x = 0; x < cw * zoom; x++) {
      const s = ((y0 + (y / zoom | 0)) * img.w + (x0 + (x / zoom | 0))) * 4
      const d = (y * cw * zoom + x) * 4
      out[d] = img.px[s]; out[d+1] = img.px[s+1]; out[d+2] = img.px[s+2]; out[d+3] = 255
    }
    return { px: out, w: cw * zoom, h: ch * zoom }
  }

  const compose = (a, b, labelA, labelB) => {
    const gap = 10, c = document.createElement('canvas')
    c.width = a.w + b.w + gap; c.height = a.h + 26
    const g = c.getContext('2d')
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height)
    const put = (img, x) => { const d = new ImageData(img.px, img.w, img.h)
      const t = document.createElement('canvas'); t.width = img.w; t.height = img.h
      t.getContext('2d').putImageData(d, 0, 0); g.drawImage(t, x, 26) }
    put(a, 0); put(b, a.w + gap)
    g.fillStyle = '#fff'; g.font = 'bold 15px monospace'
    g.fillText(labelA, 6, 18); g.fillText(labelB, a.w + gap + 6, 18)
    return c.toDataURL('image/png')
  }

  // FIND THE EFFECT INSTEAD OF GUESSING WHERE IT IS. Hand-picked crop coordinates put the `lasers`
  // frame on an empty patch of sky -- the beams sweep with uBar, so where they are depends on the
  // uniforms, and a fixed coordinate cannot track that. This scans for the tile with the most edge
  // energy (summed neighbour differences), which is by definition where the sharpest structure is,
  // and therefore where a difference in render scale would show. `crop` in a scenario overrides it.
  const hotspot = (img, cw, ch) => {
    let best = null
    for (let y = 0; y + ch <= img.h; y += Math.round(ch / 3)) {
      for (let x = 0; x + cw <= img.w; x += Math.round(cw / 3)) {
        let e = 0
        for (let j = y; j < y + ch; j += 2) for (let i = x; i < x + cw; i += 2) {
          const o = (j * img.w + i) * 4
          e += Math.abs(img.px[o] - img.px[o + 4]) + Math.abs(img.px[o] - img.px[o + img.w * 4])
        }
        if (!best || e > best.e) best = { e, cx: (x + cw / 2) / img.w, cy: (y + ch / 2) / img.h }
      }
    }
    return best
  }

  const CW = 150, CH = 100, ZOOM = 4
  const res = {}
  for (const name of names) {
    const sc = scenarios[name]
    const nat = draw(W, H, 1, sc.uni)
    // 1.5x is the actual top rung of TIERS in ThermalRunaway, not a round number chosen for the test.
    const sup = down(draw(Math.round(W * SS), Math.round(H * SS), SS, sc.uni), W, H)
    // Located on the NATIVE frame and reused for both, so the two panels show the same region.
    const at = sc.crop || (h => [h.cx, h.cy])(hotspot(nat, CW, CH))
    res[name] = compose(
      crop(nat, at[0], at[1], CW, CH, ZOOM),
      crop(sup, at[0], at[1], CW, CH, ZOOM),
      'NATIVE 1.0x', `SUPERSAMPLED ${SS}x`)
  }
  return res
}, { vs: thermalVert, fs: thermalFrag, W, H, scenarios: SCENARIOS, names, SS })

for (const [name, dataUrl] of Object.entries(pngs)) {
  const f = join(OUT, `${name}.png`)
  writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(`${name.padEnd(11)} ${f}`)
  console.log(`            ${SCENARIOS[name].why}`)
}
await br.close()
