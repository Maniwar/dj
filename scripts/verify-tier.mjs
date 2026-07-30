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

const SLOW = 42
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
check('three slow windows are not enough — a hitch must not cost quality',
  run(rep(50, 3)).tier, 0)
check('four consecutive slow windows drop one tier',
  run(rep(50, 4)).tier, 1)
check('a fast window mid-run resets the strike count',
  run([50, 50, 50, 8, 50, 50, 50]).tier, 0)
check('sustained slowness walks down to the bottom tier and stops there',
  run(rep(50, 60)).tier, MAX)

console.log('\nCLIMBING BACK — the behaviour that did not exist before')
check('a transient hitch is undone: drop, then idle, and it returns to native',
  run([...rep(50,4), ...rep(5, 8)]).tier, 0)
check('climbing needs 8 good windows, not 7',
  run([...rep(50,4), ...rep(5, 7)]).tier, 1)
check('"not slow" is nowhere near enough — 30ms against a 42ms budget must NOT climb',
  run([...rep(50,4), ...rep(30, 40)]).tier, 1)

// The one that mattered. `dt` is wall-clock frame delta, so it is vsync-locked: a 60Hz display
// reports ~16.7ms when the GPU is completely idle. A climb threshold below that floor is never
// satisfiable and the whole recovery path is dead code on the commonest display there is -- which
// is exactly what shipped at HEADROOM 0.7 (15.4ms).
check('A HEALTHY 60Hz MACHINE CAN CLIMB — 16.7ms is the vsync floor, not a slow frame',
  run([...rep(50,4), ...rep(16.7, 20)]).tier, 0)
check('a healthy 120Hz machine climbs too',
  run([...rep(50,4), ...rep(8.3, 20)]).tier, 0)
check('a 30Hz-locked machine (33ms) holds its tier — not slow enough to drop, not fast enough to climb',
  run([...rep(50,4), ...rep(33.3, 60)]).tier, 1)
check('from the bottom tier it climbs all the way back given enough headroom',
  run(rep(5, 100), MAX).tier, 0)

console.log('\nCONVERGENCE — the property that stops it oscillating forever')
{
  // A machine that can hold tier 1 but never tier 0: every time it reaches tier 0 it is slow.
  const st = newTierState(MAX + 1)
  let tier = 0
  const seen = []
  for (let i = 0; i < 200; i++) {
    const t = tier === 0 ? 50 : 5 // slow at tier 0, comfortable anywhere else
    const m = tierMove(t, tier, MAX, SLOW, st)
    if (m === 'down') tier++
    else if (m === 'up') tier--
    seen.push(tier)
  }
  check('settles at tier 1 rather than sawtoothing between 0 and 1 forever', tier, 1)
  // NOT "never moves again". Forgiveness deliberately re-offers a tier after a long stretch of
  // headroom, because the alternative stranded fast machines at the bottom for a whole session.
  // What convergence means now is that retries are RARE -- the rig spends its time at the best
  // sustainable tier and dips above it occasionally, rather than hunting every few seconds.
  const atOne = seen.filter(t => t === 1).length / seen.length
  console.log(`    (spends ${(atOne * 100).toFixed(1)}% of windows at the sustainable tier)`)
  // NOT "never moves again". Forgiveness deliberately re-offers a tier after a long stretch of
  // headroom, and STRIKES_TO_DROP is 4, so each probe above the ceiling costs four windows before
  // it is given up. The property that matters is that probing is rare and the rig is at the best
  // sustainable tier the overwhelming majority of the time.
  check('and it is settled in practice — at the sustainable tier for >85% of windows',
    atOne > 0.85, true)
  check('tier 0 was tried exactly twice before being retired', st.failed[0], 2)
}

console.log('\nFORGIVENESS — a fast machine must not be stranded by a bad spell')
check('a machine pinned at the bottom with its retries spent still climbs back given time',
  run([...rep(50, 4), ...rep(5, 400)], MAX).tier, 0)
{
  // The counterpart: a machine that really cannot hold tier 0 must still settle, not oscillate.
  const st = newTierState(MAX + 1)
  let tier = 0, moves = 0
  for (let i = 0; i < 3000; i++) {
    const m = tierMove(tier === 0 ? 50 : 5, tier, MAX, SLOW, st)
    if (m === 'down') { tier++; moves++ } else if (m === 'up') { tier--; moves++ }
  }
  check('it still converges — forgiveness costs a rare retry, not constant hunting', tier, 1)
  check('and that retrying stays rare over 3000 windows', moves < 250, true)
}

{
  // A machine that cannot hold tier 0 must stop probing it, not stutter on a permanent loop.
  const st = newTierState(MAX + 1)
  let tier = 0
  const probes = []
  for (let i = 0; i < 4000; i++) {
    const m = tierMove(tier === 0 ? 50 : 5, tier, MAX, SLOW, st)
    if (m === 'down') tier++
    else if (m === 'up') { tier--; probes.push(i) }
  }
  const early = probes.filter(i => i < 1000).length
  const late = probes.filter(i => i >= 3000).length
  console.log(`    (probed tier 0 ${probes.length}x in 4000 windows; ${early} early, ${late} late)`)
  check('probing an unaffordable rung backs off instead of looping forever', late < early, true)
  check('and it stops entirely within a few thousand windows', late <= 1, true)
}

console.log('\nEDGES')
check('at the bottom tier it still samples instead of switching itself off (the old bug)',
  run(rep(40, 10), MAX).tier, MAX)
check('exactly at the slow threshold is not slow',
  run(rep(SLOW, 6)).tier, 0)
check('exactly at the fast line does not climb',
  run(rep(19, 40), 1).tier, 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
