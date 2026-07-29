import { isFxId, type FxId } from './registry'
import { isProfileId, type ProfileId } from './profiles'

// ============================================================================================
// WHAT SURVIVES A RELOAD
// ============================================================================================
// The rule this file exists to enforce: A VISITOR'S EXPLICIT CHOICE IS NEVER OVERRIDDEN BY A
// LATER MEASUREMENT. Auto-detection is a guess made from 1.8 seconds of frame times; a person
// dragging a switch is not a guess. So anything chosen by hand is written here immediately and
// read back before the first paint, and the auto-detector is required to check for it and stand
// down (see fxState.setProfile / setOverride and autoProfile.startAutoProfile).
//
// Three keys, matching the three things a person can choose, deliberately NOT one blob:
//
//   so.perfProfile    'auto' | 'full' | 'balanced' | 'lean' | 'minimal'
//   so.perfOverrides  { <fxId>: true|false }  — true means FORCE ON, false means FORCE OFF
//   so.intensity      0..1 — the master dial POSITION (0.6 = the shipped look; see fxCurve.ts)
//
// `so.intensity` carries a second fact by existing at all: it is written ONLY when a person moves
// the dial, so at boot its presence is what tells fxState the position was chosen rather than
// derived from a profile's cap. That is why setProfile does not write it — see the note there.
//
// Separate keys because they are cleared separately (Reset re-arms auto-detection but a future
// build may want to keep the dial) and because a corrupt value in one must not lose the other
// two. Everything is validated on read against the registry and the profile list — the values
// come from a device the code has no control over, and an unknown id would produce a root class
// that no rule matches, which reads in the panel and the export as "this effect is off" while
// changing nothing on screen.
//
// Every access is wrapped: localStorage throws outright in Android Chrome's private mode and in
// a cross-origin iframe, and a perf preference is never worth taking the site down for.

const K_PROFILE = 'so.perfProfile'
const K_OVERRIDES = 'so.perfOverrides'
const K_INTENSITY = 'so.intensity'

export type StoredProfile = ProfileId | 'auto'
export type Overrides = Partial<Record<FxId, boolean>>

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode — the choice holds for this session and no longer */
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* as above */
  }
}

export function readStoredProfile(): StoredProfile | null {
  const v = read(K_PROFILE)
  if (!v) return null
  if (v === 'auto') return 'auto'
  return isProfileId(v) ? v : null
}

export function writeStoredProfile(p: StoredProfile): void {
  write(K_PROFILE, p)
}

export function readStoredOverrides(): Overrides {
  const raw = read(K_OVERRIDES)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Overrides = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Both the id and the value are checked. A stored `{"cardGlass": "off"}` from some future
      // format must not become a truthy "force on".
      if (isFxId(k) && typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeStoredOverrides(o: Overrides): void {
  const keys = Object.keys(o)
  if (keys.length === 0) drop(K_OVERRIDES)
  else write(K_OVERRIDES, JSON.stringify(o))
}

export function readStoredIntensity(): number | null {
  const v = read(K_INTENSITY)
  if (v === null) return null
  const n = Number(v)
  // 0 is a meaningful stored value — the whole point of the dial's bottom end — so this cannot
  // be a truthiness test.
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null
}

export function writeStoredIntensity(v: number): void {
  write(K_INTENSITY, String(Math.max(0, Math.min(1, v))))
}

/** Reset: forget every stored choice, which re-arms auto-detection on the next load. */
export function clearStoredPerf(): void {
  drop(K_PROFILE)
  drop(K_OVERRIDES)
  drop(K_INTENSITY)
}
