import { useSyncExternalStore } from 'react'
import { readFxOff } from './fxClasses'
import type { FxId } from './registry'

// ============================================================================================
// REACT, SUBSCRIBED TO THE ROOT CLASSES — not to the state object
// ============================================================================================
// A component that has to STOP DOING WORK — release a WebGL context, take a <video> out of the
// DOM, cancel a rAF loop — cannot be served by CSS. It has to unmount, which means React has to
// know. The obvious wiring is to subscribe to fxState. That would be wrong, and the reason is
// the benchmark:
//
//   runBench applies each configuration by writing root classes DIRECTLY (applyFxOff), snapshots
//   the entry classes and restores them in a finally block. It never touches fxState, and it
//   must not — a matrix that mutated a persisted preference 42 times would leave the visitor's
//   device configured by whatever row happened to run last.
//
// So the subscription is to the DOM itself, via one MutationObserver on <html>'s class
// attribute. Every writer — fxState, the panel, the benchmark, a person typing in devtools — is
// then equally authoritative, which is the same principle the rest of this harness runs on: THE
// CLASS IS THE STATE. Before this existed, `shader`, `bcVideo` and `sectionVideo` changed a
// class and nothing else, which made the benchmark's headline video-versus-effects legs measure
// a page where the video was still playing.
//
// The observer fires only when the class attribute changes, which is a handful of times a
// session outside a benchmark run, so nothing here is in a per-frame path.

let current: Set<FxId> = new Set()
let observing = false
const listeners = new Set<() => void>()

function refresh(): void {
  const next = readFxOff()
  if (next.size === current.size) {
    let same = true
    for (const id of next) {
      if (!current.has(id)) {
        same = false
        break
      }
    }
    // Bail before notifying if nothing we care about moved. `calm`, `gated`, `glass-on` and the
    // boot-gate classes all live on the same attribute and change far more often than these do.
    if (same) return
  }
  current = next
  for (const fn of listeners) fn()
}

function ensureObserver(): void {
  if (observing || typeof MutationObserver === 'undefined') return
  observing = true
  current = readFxOff()
  new MutationObserver(refresh).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}

function subscribe(fn: () => void): () => void {
  ensureObserver()
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * True while this effect is switched ON. The inverse of the class, deliberately: a component
 * reads `useFxOn('bcVideo') ? <video/> : <stills/>`, which is the direction that stays readable.
 *
 * getSnapshot must be referentially stable between mutations or React will loop, which is why
 * the set is cached at module scope and only replaced when it genuinely differs.
 */
export function useFxOn(id: FxId): boolean {
  return useSyncExternalStore(
    subscribe,
    // Re-read from the DOM until the observer is live. The first render of the tree happens
    // before any subscription effect has run, and module init order puts this file's evaluation
    // BEFORE main.tsx applies the boot configuration — so a cached empty set would render one
    // frame of the full site on a device that stored `minimal`.
    () => !(observing ? current : readFxOff()).has(id),
    () => true, // server / pre-hydration: the site as designed
  )
}
