// Drives the render-scale policy through the situations that actually happen on a real machine.
// This exists because the rig itself cannot be tested in a page here — it needs WebGL2 and the
// headless Chromium available on this box reports `webgl2: false`, so the canvas never mounts and
// every page-based assertion about resolution silently measured nothing at all.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'tier-'))
const out = join(dir, 'policy.mjs')
execFileSync('npx', ['esbuild', 'src/perf/tierPolicy.ts', '--bundle', '--format=esm', `--outfile=${out}`],
  { stdio: ['ignore', 'ignore', 'inherit'] })
const { tierMove, newTierState } = await import(out)

const SLOW = 22
const MAX = 3
let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++; else { fail++; console.log(`  FAIL ${name}\n    want ${JSON.stringify(want)}\n    got  ${JSON.stringify(got)}`) }
}

/** Run a sequence of window frame-times and return the tier trace. */
function run(times, startTier = 0) {
  const st = newTierState(MAX + 1)
  let tier = startTier
  const trace = [tier]
  for (const t of times) {
    const m = tierMove(t, tier, MAX, SLOW, st)
    if (m === 'down') tier++
    else if (m === 'up') tier--
    trace.push(tier)
  }
  return { tier, trace, st }
}
const rep = (v, n) => new Array(n).fill(v)

console.log('\nDEGRADING')
check('one slow window is not enough — a single hitch must not cost quality',
  run([40]).tier, 0)
check('two consecutive slow windows drop one tier',
  run([40, 40]).tier, 1)
check('a fast window between two slow ones resets the strike count',
  run([40, 8, 40]).tier, 0)
check('sustained slowness walks down to the bottom tier and stops there',
  run(rep(40, 40)).tier, MAX)

console.log('\nCLIMBING BACK — the behaviour that did not exist before')
check('a transient hitch is undone: drop, then idle, and it returns to native',
  run([40, 40, ...rep(5, 8)]).tier, 0)
check('climbing needs 8 good windows, not 7',
  run([40, 40, ...rep(5, 7)]).tier, 1)
check('"not slow" is not enough — 20ms against a 22ms budget must NOT climb',
  run([40, 40, ...rep(20, 30)]).tier, 1)
check('from the bottom tier it climbs all the way back given enough headroom',
  run(rep(5, 100), MAX).tier, 0)

console.log('\nCONVERGENCE — the property that stops it oscillating forever')
{
  // A machine that can hold tier 1 but never tier 0: every time it reaches tier 0 it is slow.
  const st = newTierState(MAX + 1)
  let tier = 0
  const seen = []
  for (let i = 0; i < 200; i++) {
    const t = tier === 0 ? 40 : 5 // slow at tier 0, comfortable anywhere else
    const m = tierMove(t, tier, MAX, SLOW, st)
    if (m === 'down') tier++
    else if (m === 'up') tier--
    seen.push(tier)
  }
  check('settles at tier 1 rather than sawtoothing between 0 and 1 forever', tier, 1)
  const lastFifty = new Set(seen.slice(-50))
  check('and it is genuinely settled — no tier changes in the last 50 windows',
    [...lastFifty], [1])
  check('tier 0 was tried exactly twice before being retired', st.failed[0], 2)
}

console.log('\nEDGES')
check('at the bottom tier it still samples instead of switching itself off (the old bug)',
  run(rep(40, 10), MAX).tier, MAX)
check('exactly at the slow threshold is not slow',
  run([SLOW, SLOW]).tier, 0)
check('exactly at the headroom line does not climb',
  run([SLOW * 0.7, SLOW * 0.7], 1).tier, 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
