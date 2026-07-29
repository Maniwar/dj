import { ALL_FX_IDS, isFxId, type FxId } from './registry'

// ============================================================================================
// THE ONE PLACE ROOT CLASSES ARE WRITTEN
// ============================================================================================
// Resolved perf state reaches the page through exactly one channel: `fx-off-<id>` classes on
// <html>. Not a second stylesheet, not inline styles, not a data-attribute — one channel, so
// "what is switched off right now?" has a single answer that the panel, the URL and the JSON
// export all read the same way.
//
// classList IS SAFE HERE; INLINE STYLE IS NOT.
// AudioReactive owns <html>'s inline style outright: it rebuilds `root.style.cssText` from
// scratch on every frame that any audio variable changes, which erases anything else written
// there. Root CLASSES are untouched by that, which is why the switches are classes and why the
// master-intensity value (a custom property) will have to be routed through AudioReactive's own
// map rather than set here. Do not add a setProperty() call to this file.

const PREFIX = 'fx-off-'

export function fxOffClass(id: FxId): string {
  return PREFIX + id
}

function root(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

/** Which effects are currently switched off, read back from the DOM rather than from memory. */
export function readFxOff(el: HTMLElement | null = root()): Set<FxId> {
  const out = new Set<FxId>()
  if (!el) return out
  el.classList.forEach((c) => {
    if (!c.startsWith(PREFIX)) return
    const id = c.slice(PREFIX.length)
    if (isFxId(id)) out.add(id)
  })
  return out
}

/**
 * Make <html> match `off` exactly, touching only the classes that actually changed.
 *
 * The diff matters more than it looks. This runs from a benchmark that reconfigures the page
 * every ~3.7 seconds, and a class mutation invalidates style for the whole document — so
 * removing and re-adding twenty-six classes to change one would put a style recalculation spike
 * inside the measurement window it is setting up. It also means the settle period only has to
 * absorb the layer churn from the effects that genuinely changed.
 *
 * Classes outside the `fx-off-` namespace (`calm`, `gated`, `glass-on`, `viz-on`, `nofx-*`) are
 * never read or written here.
 */
export function applyFxOff(off: Iterable<FxId>, el: HTMLElement | null = root()): void {
  if (!el) return
  const want = new Set<FxId>()
  for (const id of off) if (isFxId(id)) want.add(id)

  const have = readFxOff(el)
  for (const id of have) if (!want.has(id)) el.classList.remove(fxOffClass(id))
  for (const id of want) if (!have.has(id)) el.classList.add(fxOffClass(id))
}

/** Flip one effect without disturbing the rest. Returns the resulting full set. */
export function setFxOff(id: FxId, off: boolean, el: HTMLElement | null = root()): Set<FxId> {
  const next = readFxOff(el)
  if (off) next.add(id)
  else next.delete(id)
  applyFxOff(next, el)
  return next
}

/** Back to the shipped look. Used by the benchmark's `finally` and by the panel's Reset. */
export function clearFxOff(el: HTMLElement | null = root()): void {
  applyFxOff([], el)
}

/** Every effect off at once — the measurement floor the whole matrix is differenced against. */
export function fxFloor(): FxId[] {
  return [...ALL_FX_IDS]
}

// ============================================================================================
// WHICH SWITCHES ACTUALLY TAKE EFFECT WITHOUT A RELOAD
// ============================================================================================
// Adding or removing a root class is instant for anything fx-off.css neutralises. It is NOT
// instant for the switches that a component or a module reads once, at mount or at first call:
// those ids are read out of PERF (parsed from the URL at load) or cached for the session, so
// flipping the class mid-session changes the class and nothing else.
//
// This list is exported rather than left implicit because of registry rule 2 — a switch that does
// nothing shows up in a benchmark as "this effect is free", which is a WRONG answer rather than a
// missing one, and the two video ids are precisely the ones the headline video-vs-effects
// measurement depends on. So the panel greys them and offers a reload instead, and the benchmark
// records every unhonoured id alongside the numbers it produced.
//
// When the components subscribe to the store directly, delete entries from here and everything
// downstream — panel affordance, benchmark annotation, export field — corrects itself.
//
// FOUR OF THE ORIGINAL FIVE ARE GONE. ThermalRunaway, AudioReactive, Broadcast, Lore and
// TourJourney now read their switch through perf/useFx.ts, which subscribes to the root class
// itself rather than to the URL — so `shader`, `audioPump`, `bcVideo` and `sectionVideo` unmount
// live. That is what makes the benchmark's headline legs mean what they say: `effects-only`
// genuinely has no video in it now, and `video-only` genuinely has no shader.
export const RELOAD_REQUIRED: readonly FxId[] = [
  // videoRendition caches its HD/SD answer for the session, and deliberately does not swap the
  // src of a playing clip — a rendition change lands at the NEXT scene change, which is an
  // unpredictable point inside some later window. So this stays reload-required even though
  // fxState does call refreshRenditionChoice(): a benchmark row that changed rendition partway
  // through would be measuring two different pages and could not say which.
  'hdRendition',
]

const RELOAD_SET = new Set<FxId>(RELOAD_REQUIRED)

/** True when adding the root class is enough to change what the device renders, right now. */
export function isLiveSwitchable(id: FxId): boolean {
  return !RELOAD_SET.has(id)
}

/** Of a requested set, the ids that the class alone will NOT honour. */
export function unhonoured(off: Iterable<FxId>): FxId[] {
  const out: FxId[] = []
  for (const id of off) if (RELOAD_SET.has(id)) out.push(id)
  return out
}

/**
 * The same configuration expressed as a URL, which is the one form that always works: every id
 * is honoured on a fresh load whether or not its component subscribes to anything. This is what
 * the panel's "reload with this config" uses and what a repro is pasted into a message as.
 */
export function fxUrl(off: Iterable<FxId>, base = location.href): string {
  const u = new URL(base)
  // Legacy aliases are dropped rather than merged: they resolve INTO fxoff at load, so leaving
  // them alongside an explicit list would silently re-add effects the caller just turned off.
  for (const k of ['fxoff', 'fxon', 'noshader', 'noreact', 'lowpower', 'nograin', 'nobroadcast', 'bcoff', 'calm', 'nocalm']) {
    u.searchParams.delete(k)
  }
  const ids = [...off]
  if (ids.length) u.searchParams.set('fxoff', ids.join(','))
  u.searchParams.set('diag', '1')
  return u.toString()
}
