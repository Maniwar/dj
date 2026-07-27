// Runtime perf switches, read from the URL query — used both for DATA (isolating the cost
// of each always-on subsystem while profiling) and as a real low-power escape hatch.
//   ?noshader   — skip the full-screen WebGL shader (ThermalRunaway)
//   ?noreact    — skip the per-frame CSS-variable pump (AudioReactive)
//   ?lowpower   — both of the above
const q = typeof location !== 'undefined' ? location.search : ''
const has = (k: string) => new RegExp(`[?&]${k}(?:=(?:1|true|on))?(?:&|$)`, 'i').test(q)

// The mobile flicker was isolated (via ?nobroadcast) to the FOOTAGE layer, not the shader —
// so keep the reactive lasers (shader) ON everywhere and instead calm the Broadcast on
// mobile (static frame, no blend-modes). ?noshader / ?lowpower still force it off.
// PERFORMANCE CLASS FOLLOWS THE HARDWARE, NOT THE WINDOW.
//
// This was `max-width: 768px` alone, which meant a tablet with its browser maximised measured as a
// desktop and got the full desktop workload — frameloop 'always', top shader tier, every effect
// promoted — on mobile-class silicon. The symptom was a Samsung Tab Ultra flickering violently at
// full width and running perfectly the moment the window was made smaller, which reads as
// nonsense until you notice that shrinking the window is what finally tripped the 768px test.
//
// `(pointer: coarse)` is the honest signal: phones and tablets report it at any window size, and
// it does not change when the user resizes, so the tier cannot thrash mid-session. Desktops report
// `fine` — including touchscreen laptops, whose PRIMARY pointer is still the trackpad.
//
// The width test is kept as well, so a genuinely tiny viewport is still treated gently.
// This is the same trap as the 900px frosted-glass guard and the 15vw city headline: viewport
// width keeps being used as a proxy for device capability, and it keeps being wrong.
const mq = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches
const isMobile = mq('(pointer: coarse)') || mq('(max-width: 768px)')
const low = has('lowpower')
export const PERF = {
  isMobile,
  noShader: low || has('noshader'),
  noReact: low || has('noreact'),
  noBroadcast: has('nobroadcast'),
  // ?nograin — drops ONLY .bc-grain, the full-screen mix-blend-mode: overlay layer that animates
  // forever inside the Broadcast. ?nobroadcast removes the video, the stills AND the grain at
  // once, so it cannot tell us which of them costs. This is the flag that separates them.
  noGrain: has('nograin'),
  // ?bcoff=strobe,scan,vignette,rec,grain,video,stills — switch off individual pieces of the
  // Broadcast. ?nobroadcast removes all of it at once and proved the layer is responsible;
  // ?nograin removed one overlay and changed nothing. There are three blended full-screen
  // overlays in there, not one, plus the video and the stills, and they have very different
  // costs — .bc-strobe blends with SCREEN and animates its opacity every frame, which forces a
  // framebuffer readback per frame, while .bc-grain's opacity is static. Guessing between them
  // has already cost several rounds.
  bcOff: new Set((/[?&]bcoff=([a-z,]+)/i.exec(q)?.[1] ?? '').split(',').filter(Boolean)),
  // ?freeze=beat | others — ISOLATION, not optimisation.
  //
  // ?noreact freezes all ten audio variables at once. It proved the pump is involved in the
  // jitter and told us nothing about WHICH part, and the two candidate causes have opposite
  // fixes: if freezing --m-beat alone stops it, the cause is the ~20 rules that read it; if it
  // takes freezing everything, the cause is the ACT of writing custom properties on :root, which
  // invalidates style for the whole document regardless of what any rule does with them.
  freeze: (/[?&]freeze=([a-z-]+)/i.exec(q)?.[1] ?? '') as '' | 'beat' | 'others',
  // ?nofx=blur|alpha|transform — neutralise one CLASS of beat-driven declaration at a time.
  nofx: (/[?&]nofx=([a-z]+)/i.exec(q)?.[1] ?? '') as '' | 'blur' | 'alpha' | 'transform' | 'filter',
}
