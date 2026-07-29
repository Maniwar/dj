import { parseFxIds, type FxId } from '../perf/registry'

// Runtime perf switches, read from the URL query — used both for DATA (isolating the cost
// of each always-on subsystem while profiling) and as a real low-power escape hatch.
//   ?noshader   — skip the full-screen WebGL shader (ThermalRunaway)
//   ?noreact    — skip the per-frame CSS-variable pump (AudioReactive)
//   ?lowpower   — both of the above
const q = typeof location !== 'undefined' ? location.search : ''
const has = (k: string) => new RegExp(`[?&]${k}(?:=(?:1|true|on))?(?:&|$)`, 'i').test(q)
const val = (k: string, chars: string) =>
  new RegExp(`[?&]${k}=([${chars}]+)`, 'i').exec(q)?.[1] ?? ''

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
const mq = (query: string) => typeof matchMedia !== 'undefined' && matchMedia(query).matches
const isMobile = mq('(pointer: coarse)') || mq('(max-width: 768px)')
const low = has('lowpower')

// ============================================================================================
// THE EFFECT REGISTRY, FROM THE URL
// ============================================================================================
//   ?fxoff=<csv>   — switch these effects OFF   (ids from src/perf/registry.ts)
//   ?fxon=<csv>    — switch these back ON, whatever anything else asked for
//   ?profile=auto|full|balanced|lean|minimal
//   ?intensity=0..1  — the master dial POSITION, not a multiplier. 0.6 is the shipped look
//                      (multiplier 1.0), 1 is 1.4x, 0 switches every effect off. See
//                      src/perf/fxCurve.ts; ?intensity=0 is the fastest way to a clean page.
//
// This is the reload-based repro format: the panel and the benchmark emit exactly these, so a
// configuration that misbehaves on a tablet can be handed back as a URL rather than as a
// description of which switches to flip.
//
// EVERY OLD FLAG STILL WORKS, and is expressed in terms of the registry rather than kept as a
// parallel mechanism. Bookmarked bisect URLs are the accumulated result of weeks of manual
// testing on the two devices that actually exhibit the problem; breaking them would throw that
// away to save twelve lines. Two flags are deliberately NOT mapped:
//
//   ?live= and ?freeze=  — a different instrument entirely (which audio VARIABLE is live, not
//                          which effect is drawn), still useful, left exactly as they were.
//   ?nofx=               — likewise: it neutralises one CLASS of declaration (blur/alpha/
//                          transform/filter) across every rule, which does not correspond to any
//                          single effect. Mapping it onto registry ids would ALSO apply the
//                          existing :root.nofx-* block, so a bookmarked ?nofx=blur URL would
//                          quietly start measuring strictly more than it used to.
export type ProfileRequest = 'auto' | 'full' | 'balanced' | 'lean' | 'minimal'
const PROFILE_REQUESTS: readonly string[] = ['auto', 'full', 'balanced', 'lean', 'minimal']

const bcOff = new Set((val('bcoff', 'a-z,') || '').split(',').filter(Boolean))

/** ?bcoff= piece → registry id. 'stills' has no entry: it selects the fallback, it is not an effect. */
const BC_LEGACY: Record<string, FxId> = {
  strobe: 'bcStrobe',
  grain: 'bcGrain',
  scan: 'bcScan',
  vignette: 'bcVignette',
  rec: 'bcRec',
  video: 'bcVideo',
}

const fxOff = new Set<FxId>()
if (low || has('noshader')) fxOff.add('shader')
if (low || has('noreact')) fxOff.add('audioPump')
if (has('nograin')) fxOff.add('bcGrain')
if (has('nobroadcast')) {
  // ?nobroadcast removed the video, the stills AND all five overlays at once — which is what
  // proved the layer is responsible and what could never say WHICH part of it costs.
  for (const id of ['bcVideo', 'bcGrain', 'bcScan', 'bcStrobe', 'bcVignette', 'bcRec'] as FxId[]) {
    fxOff.add(id)
  }
}
for (const piece of bcOff) {
  const id = BC_LEGACY[piece]
  if (id) fxOff.add(id)
}
for (const id of parseFxIds(val('fxoff', 'A-Za-z0-9,'))) fxOff.add(id)
// ?fxon wins over everything, so a stored profile or a legacy flag can always be overridden from
// the address bar without having to know what it turned off.
//
// It is kept as its OWN set as well as being subtracted here, and the distinction is load-bearing
// now that profiles exist. `fxOff` answers "what did the URL switch off?"; `fxOn` answers "what
// did the URL insist stays on?" — and only the second can overrule a stored or auto-detected
// profile that the URL author never saw. Collapsing them into one set would make ?fxon a no-op
// against exactly the case it is for.
const fxOn = new Set<FxId>(parseFxIds(val('fxon', 'A-Za-z0-9,')))
for (const id of fxOn) fxOff.delete(id)

// Consumed by src/perf/fxState.ts at boot. `?profile=` outranks a stored profile and outranks
// auto-detection; the three legacy spellings below map onto the ladder rather than existing
// beside it, so a bookmarked ?calm URL still produces a lighter page and now says which one.
const rawProfile = val('profile', 'a-z').toLowerCase()
const profile: ProfileRequest | '' = PROFILE_REQUESTS.includes(rawProfile)
  ? (rawProfile as ProfileRequest)
  : low
    ? 'minimal'
    : has('calm')
      ? 'lean'
      : has('nocalm')
        ? 'full'
        : ''

const rawIntensity = val('intensity', '0-9.')
const intensity = rawIntensity === '' ? null : Math.max(0, Math.min(1, Number(rawIntensity) || 0))

export const PERF = {
  isMobile,
  // ?noshader / ?noreact / ?lowpower USED to be read from here by ThermalRunaway and
  // AudioReactive. They are not any more, and the derived booleans are gone with them: both
  // components now subscribe to the root class through perf/useFx.ts, so those flags reach them
  // the same way a profile or a panel switch does — as `fxOff` below, resolved once at boot.
  // There is one answer to "is the shader off?", and it is the class on <html>.
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
  bcOff,
  // ?freeze=beat | others — ISOLATION, not optimisation.
  //
  // ?noreact freezes all ten audio variables at once. It proved the pump is involved in the
  // jitter and told us nothing about WHICH part, and the two candidate causes have opposite
  // fixes: if freezing --m-beat alone stops it, the cause is the ~20 rules that read it; if it
  // takes freezing everything, the cause is the ACT of writing custom properties on :root, which
  // invalidates style for the whole document regardless of what any rule does with them.
  freeze: (/[?&]freeze=([a-z-]+)/i.exec(q)?.[1] ?? '') as '' | 'beat' | 'others',
  // ?live=beat,level,down,... — ALLOWLIST. Only the named variables update; every other one is
  // written once and then held. This is the bisect instrument: ?freeze=others (only --m-beat
  // live) has no jitter and the full set does, so no single variable causes it — it is a
  // combination, and the only way to find which is to add them back one at a time.
  // Empty means "all live", i.e. normal behaviour.
  live: new Set((/[?&]live=([a-z,]+)/i.exec(q)?.[1] ?? '').split(',').filter(Boolean)),
  // ?nofx=blur|alpha|transform — neutralise one CLASS of beat-driven declaration at a time.
  nofx: (/[?&]nofx=([a-z]+)/i.exec(q)?.[1] ?? '') as '' | 'blur' | 'alpha' | 'transform' | 'filter',

  /** Effects the URL asks to be switched off. Seeds the root classes; see perf/fxClasses.ts. */
  fxOff,
  /** Effects the URL insists stay ON, whatever a stored or auto-detected profile decided. */
  fxOn,
  /** '' when the URL says nothing, so a stored or auto-detected profile can still decide. */
  profile,
  /** null when the URL says nothing — 0 is a meaningful value and must not read as absent. */
  intensity,
}
