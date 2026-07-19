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
const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches
const low = has('lowpower')
export const PERF = {
  isMobile,
  noShader: low || has('noshader'),
  noReact: low || has('noreact'),
  noBroadcast: has('nobroadcast'),
}
