// Runtime perf switches, read from the URL query — used both for DATA (isolating the cost
// of each always-on subsystem while profiling) and as a real low-power escape hatch.
//   ?noshader   — skip the full-screen WebGL shader (ThermalRunaway)
//   ?noreact    — skip the per-frame CSS-variable pump (AudioReactive)
//   ?lowpower   — both of the above
const q = typeof location !== 'undefined' ? location.search : ''
const has = (k: string) => new RegExp(`[?&]${k}(?:=(?:1|true|on))?(?:&|$)`, 'i').test(q)

// An always-on full-screen TRANSPARENT WebGL layer is the classic cause of both jank AND
// flicker on mobile GPUs, so default it OFF on phones (CSS fallback takes over). Force it
// back on with ?shader for testing. Desktop is unaffected.
const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 768px)').matches
const low = has('lowpower')
export const PERF = {
  isMobile,
  noShader: !has('shader') && (low || has('noshader') || isMobile),
  noReact: low || has('noreact'),
  noBroadcast: has('nobroadcast'),
}
