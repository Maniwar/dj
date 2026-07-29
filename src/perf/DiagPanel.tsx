import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BUILD_STAMP } from '../version'
import { FX, FX_BY_ID, FX_GROUPS, FX_GROUP_LABEL, type FxId } from './registry'
import { clearFxOff, fxUrl, isLiveSwitchable, readFxOff, setFxOff, unhonoured } from './fxClasses'
import {
  appliedProfile,
  appliedProfileDef,
  perfState,
  resetPerfState,
  setIntensityPref,
  setOverride,
  setProfile,
  subscribePerfState,
} from './fxState'
import { PROFILES, PROFILE_BY_ID, type ProfileId } from './profiles'
import { getIntensity, setIntensity as writeIntensity, fxMultiplier, FX_DEFAULT } from './intensity'
import { SampleWindow, measureRefreshHz } from './sampler'
import { deviceSummary, primeDeviceInfo } from './deviceInfo'
import { analyse, benchPreconditions, runBench, type BenchConfig, type BenchProgress, type BenchRun } from './bench'
import { buildReport, copyReport, downloadReport } from './report'
import { PANEL_CSS } from './panelStyles'

// ============================================================================================
// THE DIAG PANEL
// ============================================================================================
// This is the instrument, and it is operated by a thumb on a Samsung tablet that is at that
// moment stuttering. Three things follow from that and everything else is detail:
//
//  1. IT LIVES IN A SHADOW ROOT, attached to <html> rather than <body>. The site is hostile to
//     anything rendered inside it: `body *` reach, `:root.gated *{animation-play-state:paused}`,
//     a z-index war topping out at 200, and — the one that shadow DOM alone would NOT have
//     survived — `body.sauna { filter: saturate(1.25) hue-rotate(-6deg) }`. A filter on an
//     ancestor is not a style rule the shadow boundary can block: it tints everything inside and
//     it makes body a containing block, so a position:fixed panel would stop being fixed to the
//     viewport. Hanging the host off <html> puts it out of reach of both.
//
//  2. IT MUST NOT PERTURB WHAT IT MEASURES. There is no React state anywhere in the per-frame
//     path. The live readout is three textContent writes at 2Hz on cached nodes, and during a
//     benchmark the whole 27-row tree unmounts down to one progress line — a React tree of that
//     size re-rendering over playing video is itself a measurable load, and a harness that
//     changes the number it is reporting is worth nothing.
//
//  3. NOTHING IT SHOWS MAY BE A GUESS. A switch that is read once at load changes a class here
//     and nothing else; such rows are marked RELOAD and offer a URL instead of pretending, because
//     a switch that silently does nothing reads as "this effect is free", which is a wrong answer
//     rather than a missing one. Four of the original five are now live — see RELOAD_REQUIRED —
//     and `hdRendition` is the one that remains, deliberately.
//
//  4. IT SHOWS WHERE EACH SETTING CAME FROM. A row can be off because the profile says so or
//     because someone switched it off, and those two are not the same fact: the first is undone by
//     choosing another profile, the second outranks every profile and every later measurement.
//     Overridden rows are marked and carry a control to hand them back to the profile.

const DIAG_KEY = 'so.diag'
const TAP_COUNT = 5
const TAP_WINDOW_MS = 1500
const READOUT_MS = 500
const READOUT_RECYCLE_MS = 2000
/** A manual segment shorter than this saw too few frames for p95 to mean anything. */
const MIN_SEGMENT_FRAMES = 90

function urlAsksForDiag(): boolean {
  return typeof location !== 'undefined' && /[?&]diag(?:&|=|$)/i.test(location.search)
}

/**
 * THE PANEL DOES NOT SURVIVE A RELOAD, DELIBERATELY.
 *
 * It used to: the open state was written to `so.diag` and read back at boot, so once anyone had
 * opened it once the panel came back on EVERY subsequent load of club-humidity.com, with no
 * `?diag` and no explanation. Reported from the tablet, where it had quietly become part of the
 * site. A developer tool that installs itself permanently after a single visit is a bug, not a
 * convenience — and the two ways in are already cheap: `?diag` in the URL, or five taps on the
 * crest, which exists precisely so this needs no keyboard on a tablet.
 *
 * The stored key is actively cleared rather than merely ignored, so anyone already carrying one
 * from an earlier build is released from it on their next load instead of having to find it in
 * devtools.
 */
function clearStoredOpen(): void {
  try {
    localStorage.removeItem(DIAG_KEY)
  } catch {
    /* private mode — nothing was stored to begin with */
  }
}

export default function DiagPanel() {
  const [open, setOpen] = useState(urlAsksForDiag)
  useEffect(clearStoredOpen, [])

  // OPENING IT WITHOUT A KEYBOARD. ?diag works, but the tablet is the device with the problem and
  // typing a query string into Android Chrome mid-session is enough friction that the measurement
  // does not happen. Five taps on the crest, the same gesture vocabulary the site already uses.
  useEffect(() => {
    if (open) return
    let taps: number[] = []
    const onDown = (e: Event) => {
      const t = e.target as Element | null
      if (!t || typeof t.closest !== 'function' || !t.closest('.crest')) {
        taps = []
        return
      }
      const now = performance.now()
      taps = taps.filter((x) => now - x < TAP_WINDOW_MS)
      taps.push(now)
      if (taps.length >= TAP_COUNT) {
        taps = []
        /* not remembered — see clearStoredOpen */
        setOpen(true)
      }
    }
    document.addEventListener('pointerdown', onDown, { passive: true, capture: true })
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const [shadow, setShadow] = useState<ShadowRoot | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const host = document.createElement('div')
    host.id = 'so-diag-host'
    // <html>, not <body>. See note 1 at the top of this file.
    document.documentElement.appendChild(host)
    const sr = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = PANEL_CSS
    sr.appendChild(style)
    hostRef.current = host
    setShadow(sr)
    return () => {
      hostRef.current = null
      setShadow(null)
      host.remove()
    }
  }, [open])

  if (!open || !shadow) return null
  return createPortal(
    <Panel
      host={hostRef.current}
      onClose={() => {
        /* not remembered — see clearStoredOpen */
        setOpen(false)
      }}
    />,
    shadow,
  )
}

// --------------------------------------------------------------------------------------------

type Msg = { text: string; ok: boolean } | null

/** Which rung of the precedence ladder is in force, in four characters of tablet-readable prose. */
function sourceLabel(src: string): string {
  return src === 'url'
    ? 'from URL'
    : src === 'manual'
      ? 'your choice'
      : src === 'stored'
        ? 'remembered'
        : src === 'auto'
          ? 'measured'
          : 'default'
}

function Panel({ host, onClose }: { host: HTMLDivElement | null; onClose: () => void }) {
  const [offSet, setOffSet] = useState<Set<FxId>>(() => readFxOff())
  const [intensity, setIntensityState] = useState(() => getIntensity())
  // One subscription for the whole panel. The perf state is written by four things — this panel,
  // the URL at boot, the auto-detector at T+3.5s and again at T+15s — and the detector's
  // downgrade is the one a user is most likely to be watching for. Reading it back through the
  // same channel means the switches move under their finger when the device is re-classified,
  // rather than showing a configuration that stopped being true fifteen seconds ago.
  const [ps, setPs] = useState(() => perfState())
  const [runs, setRuns] = useState<BenchRun[]>([])
  const [running, setRunning] = useState(false)
  // OPENS COLLAPSED, on every screen size. Measured: expanded it covers the player's transport in
  // both layouts — the bottom sheet sits on top of the minimized player, and the 380px rail
  // overlaps the right end of the expanded one. Pressing play is a hard precondition of the
  // benchmark, so a panel that opens over the play button makes its own headline feature
  // unreachable. Collapsed it is a badge in the opposite corner showing the live readout, which
  // is the single most useful thing here anyway, and one tap opens the rest.
  const [collapsed, setCollapsed] = useState(true)
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [deviceLine, setDeviceLine] = useState('measuring refresh rate…')

  const liveRef = useRef<HTMLDivElement | null>(null)
  const progTextRef = useRef<HTMLDivElement | null>(null)
  const progBarRef = useRef<HTMLElement | null>(null)
  const abortRef = useRef({ aborted: false })

  // ---- rolling readout -------------------------------------------------------------------
  // Two windows, both fed by the sampler's single rAF. The READOUT window is recycled every two
  // seconds so the number on screen describes the last two seconds rather than the whole session
  // — a p95 averaged over five minutes goes flat and stops responding to the switch you just
  // flipped, which makes the panel useless for exactly the thing it is for.
  const readoutRef = useRef<SampleWindow | null>(null)

  useEffect(
    () =>
      subscribePerfState(() => {
        setPs(perfState())
        setOffSet(readFxOff())
        setIntensityState(getIntensity())
      }),
    [],
  )

  useEffect(() => {
    let cancelled = false
    measureRefreshHz().then(() => {
      if (!cancelled) setDeviceLine(deviceSummary())
    })
    void primeDeviceInfo()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (running) return
    readoutRef.current = new SampleWindow()
    let age = 0
    const id = setInterval(() => {
      const w = readoutRef.current
      const el = liveRef.current
      if (!w || !el) return
      const s = w.peek()
      // textContent on ONE cached node. No React state, no re-render, no reconciliation — the
      // readout costs a string build and a text-node write twice a second.
      el.textContent = `fps ${s.fps}  p50 ${s.p50.toFixed(0)}  p95 ${s.p95.toFixed(0)}  max ${s.max.toFixed(0)}  n ${s.frames}`
      el.className = s.p95 > 50 ? 'live bad' : s.p95 > 26 ? 'live warn' : 'live'
      age += READOUT_MS
      if (age >= READOUT_RECYCLE_MS) {
        age = 0
        w.cancel()
        readoutRef.current = new SampleWindow()
      }
    }, READOUT_MS)
    return () => {
      clearInterval(id)
      readoutRef.current?.cancel()
      readoutRef.current = null
    }
  }, [running])

  // ---- manual segments -------------------------------------------------------------------
  // FREE DATA. The panel keeps a window open across whatever the user is doing by hand; every
  // time a switch flips, the segment that just ended is banked with the configuration it ran
  // under. Someone who never presses Run still comes away with usable measurements, and the
  // export is never empty.
  const segRef = useRef<SampleWindow | null>(null)
  const segCfgRef = useRef<{ off: FxId[]; intensity: number }>({ off: [], intensity: 0 })
  const segSeq = useRef(0)

  const openSegment = useCallback(() => {
    segCfgRef.current = { off: [...readFxOff()], intensity: getIntensity() }
    segRef.current = new SampleWindow()
  }, [])

  const closeSegment = useCallback(() => {
    const w = segRef.current
    segRef.current = null
    if (!w) return
    const stats = w.close()
    if (!stats.valid || stats.frames < MIN_SEGMENT_FRAMES) return
    const cfg = segCfgRef.current
    const config: BenchConfig = {
      id: `manual-${++segSeq.current}`,
      label: cfg.off.length ? `off: ${cfg.off.join(', ')}` : 'as loaded',
      off: cfg.off,
      intensity: cfg.intensity,
    }
    setRuns((rs) => {
      const rest = rs.filter((r) => r.matrix !== 'manual')
      const manual = rs.find((r) => r.matrix === 'manual')
      const configs = [...(manual?.configs ?? []), { config, stats, unhonoured: unhonoured(cfg.off), retried: false }]
      return [
        ...rest,
        {
          matrix: 'manual' as const,
          startedAt: manual?.startedAt ?? new Date().toISOString(),
          settleMs: 0,
          sampleMs: 0,
          // Capped. A panel left open for an hour would otherwise grow an export nobody can read.
          configs: configs.slice(-24),
        },
      ]
    })
  }, [])

  useEffect(() => {
    if (running) return
    openSegment()
    return () => {
      segRef.current?.cancel()
      segRef.current = null
    }
  }, [running, openSegment])

  // ---- switches ---------------------------------------------------------------------------
  // A flip writes an OVERRIDE, not a class. The class is the consequence. That distinction is the
  // whole requirement: an override is persisted and outranks both the chosen profile and anything
  // the auto-detector decides later, so a switch someone moved by hand is never quietly moved back
  // by a measurement taken twelve seconds afterwards.
  const flip = useCallback(
    (id: FxId, nextOn: boolean) => {
      closeSegment()
      setOverride(id, nextOn)
      setOffSet(readFxOff())
      setMsg(
        isLiveSwitchable(id)
          ? null
          : { text: `${FX_BY_ID[id].label} only takes effect on a fresh load — use "Reload with this config".`, ok: false },
      )
      // Let the layer churn from the change land before the next segment starts measuring it.
      setTimeout(openSegment, 700)
    },
    [closeSegment, openSegment],
  )

  const clearOverride = useCallback(
    (id: FxId) => {
      closeSegment()
      setOverride(id, undefined)
      setOffSet(readFxOff())
      setMsg({ text: `${FX_BY_ID[id].label} follows the profile again.`, ok: true })
      setTimeout(openSegment, 700)
    },
    [closeSegment, openSegment],
  )

  const chooseProfile = useCallback(
    (p: ProfileId | 'auto') => {
      closeSegment()
      setProfile(p)
      setOffSet(readFxOff())
      setIntensityState(getIntensity())
      setMsg({
        text:
          p === 'auto'
            ? 'Back to auto — but the stored choice is what is remembered, so this device will be measured again next visit.'
            : `${PROFILE_BY_ID[p].label}: ${PROFILE_BY_ID[p].blurb}`,
        ok: true,
      })
      setTimeout(openSegment, 700)
    },
    [closeSegment, openSegment],
  )

  const applyConfigFromRow = useCallback(
    (cfg: BenchConfig) => {
      closeSegment()
      clearFxOff()
      for (const id of cfg.off) setFxOff(id, true)
      writeIntensity(cfg.intensity)
      setOffSet(readFxOff())
      setIntensityState(cfg.intensity)
      setMsg({ text: `Applied "${cfg.label}".`, ok: true })
      setTimeout(openSegment, 700)
    },
    [closeSegment, openSegment],
  )

  // ---- the benchmark ----------------------------------------------------------------------
  const start = useCallback(
    async (matrix: 'quick' | 'full') => {
      const problems = benchPreconditions()
      if (problems.length) {
        setMsg({ text: problems.join(' '), ok: false })
        return
      }
      closeSegment()
      abortRef.current = { aborted: false }
      setMsg(null)
      setRunning(true)
      try {
        const run = await runBench({
          matrix,
          signal: abortRef.current,
          onProgress: (p: BenchProgress) => {
            // Two node writes per phase change — about four per configuration. This is the only
            // DOM the panel touches while a benchmark is in flight.
            const t = progTextRef.current
            if (t) {
              t.textContent = `${p.index + 1}/${p.total} · ${p.config.label} · ${p.phase} · ${Math.round(p.elapsedMs / 1000)}s`
            }
            const b = progBarRef.current
            if (b) b.style.width = `${Math.round((p.index / p.total) * 100)}%`
          },
        })
        setRuns((rs) => [...rs, run])
        setMsg(
          run.abortedEarly
            ? { text: 'Stopped early — partial results kept.', ok: false }
            : { text: `Done: ${run.configs.length} configurations.`, ok: true },
        )
      } catch (e) {
        setMsg({ text: `Benchmark failed: ${String(e)}`, ok: false })
      } finally {
        setRunning(false)
        setOffSet(readFxOff())
        setIntensityState(getIntensity())
      }
    },
    [closeSegment],
  )

  // ---- export ------------------------------------------------------------------------------
  const doExport = useCallback(() => {
    closeSegment()
    const name = downloadReport(buildReport(runs, notes))
    setMsg({ text: `Saved ${name}`, ok: true })
    setTimeout(openSegment, 100)
  }, [runs, notes, closeSegment, openSegment])

  const doCopy = useCallback(async () => {
    closeSegment()
    const ok = await copyReport(buildReport(runs, notes))
    setMsg({ text: ok ? 'JSON copied to clipboard.' : 'Copy blocked — use Export instead.', ok })
    setTimeout(openSegment, 100)
  }, [runs, notes, closeSegment, openSegment])

  const reload = useCallback(() => {
    location.href = fxUrl(readFxOff())
  }, [])

  useEffect(() => {
    host?.classList.toggle('collapsed', collapsed && !running)
  }, [host, collapsed, running])

  // ---- results -----------------------------------------------------------------------------
  const analysis = useMemo(() => analyse(runs), [runs])
  const configById = useMemo(() => {
    const m = new Map<string, BenchConfig>()
    for (const r of runs) for (const c of r.configs) m.set(c.config.id, c.config)
    return m
  }, [runs])
  const statsById = useMemo(() => {
    const m = new Map<string, BenchRun['configs'][number]>()
    for (const r of runs) for (const c of r.configs) m.set(c.config.id, c)
    return m
  }, [runs])

  if (running) {
    return (
      <div className="wrap">
        <div className="running">
          <div className="txt" ref={progTextRef}>
            starting…
          </div>
          <button
            className="act danger"
            onClick={() => {
              abortRef.current.aborted = true
            }}
          >
            Abort
          </button>
          <div className="bar">
            <i ref={progBarRef} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="head">
        <div className="stamp">{BUILD_STAMP}</div>
        <button className="iconbtn" onClick={() => setCollapsed((c) => !c)} aria-label="Collapse panel">
          {collapsed ? '▲' : '▼'}
        </button>
        <div className="dev">{deviceLine}</div>
        <div className="live" ref={liveRef}>
          measuring…
        </div>
      </div>

      <div className="body">
        <div className="field">
          <label>
            Profile
            <span className="val">{sourceLabel(ps.source)}</span>
          </label>
          <div className="seg" role="group" aria-label="Performance profile">
            {(['auto', ...PROFILES] as const).map((id) => (
              <button
                key={id}
                className={`segbtn${ps.profile === id ? ' on' : ''}`}
                aria-pressed={ps.profile === id}
                onClick={() => chooseProfile(id)}
              >
                {id === 'auto' ? 'auto' : PROFILE_BY_ID[id].label}
                {/* The detected value as a ghost label, so `auto` is never a black box: what this
                    device MEASURED is visible whether or not it is what is being applied. */}
                {id === 'auto' && ps.detected && <em>→ {ps.detected}</em>}
              </button>
            ))}
          </div>
          <p className="hint">
            {appliedProfileDef().blurb}
            {ps.verdict ? ` · detected from ${ps.verdict.reason}` : ' · not measured yet'}
          </p>
        </div>

        <div className="field">
          <label>
            Master intensity
            <span className="val">{Math.round(intensity * 100)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(intensity * 100)}
            aria-label="Master effect intensity"
            onChange={(e) => {
              const v = Number(e.target.value) / 100
              setIntensityState(v)
              // setIntensityPref, not the raw setter: this is a preference and is persisted.
              // applyConfigFromRow below uses the raw one on purpose — replaying a benchmark row
              // is a transient measurement state, and storing it would leave the device
              // configured by whichever row was tapped last.
              setIntensityPref(v)
            }}
          />
          {/* The scale is not obvious from the number alone, and getting it wrong makes every
              measurement below unreadable: 60 is the shipped look (multiplier 1.0), above it is
              headroom the site has never shipped, and below it effects are RETIRED at their
              thresholds rather than merely dimmed. */}
          <p className="hint">
            {Math.round(intensity * 100)} → {fxMultiplier(intensity).toFixed(2)}x ·{' '}
            {Math.round(FX_DEFAULT * 100)} is the shipped look · 0 switches everything off
          </p>
        </div>

        {FX_GROUPS.map((g) => {
          const items = FX.filter((f) => f.group === g)
          const onCount = items.filter((f) => !offSet.has(f.id)).length
          return (
            <details className="sec" key={g} open={g === 'blend' || g === 'blur'}>
              <summary>
                {FX_GROUP_LABEL[g]} <span className="count">{onCount}/{items.length}</span>
              </summary>
              {items.map((f) => {
                const on = !offSet.has(f.id)
                const live = isLiveSwitchable(f.id)
                const overridden = ps.overrides[f.id] !== undefined
                const fromProfile = !overridden && appliedProfileDef().off.includes(f.id)
                return (
                  <div className={`row${live ? '' : ' reload'}${overridden ? ' over' : ''}`} key={f.id}>
                    <div>
                      <div className="name">{f.label}</div>
                      <span className="meta">
                        {f.id} · {f.kind}
                        {live ? '' : ' · RELOAD'}
                        {overridden ? ' · YOURS' : fromProfile ? ` · ${appliedProfile()}` : ''}
                      </span>
                    </div>
                    {overridden && (
                      <button
                        className="clearbtn"
                        title="Follow the profile again"
                        aria-label={`Let ${f.label} follow the profile again`}
                        onClick={() => clearOverride(f.id)}
                      >
                        ↺
                      </button>
                    )}
                    <span className={`dots c${f.cost}`} title={f.why}>
                      {'●'.repeat(f.cost)}
                      {'○'.repeat(3 - f.cost)}
                    </span>
                    <label className="sw">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={on}
                        aria-label={f.label}
                        onChange={(e) => flip(f.id, e.target.checked)}
                      />
                      <i />
                    </label>
                  </div>
                )
              })}
            </details>
          )
        })}

        {analysis.interaction && <div className="verdict">{analysis.interaction.verdict}</div>}
        {analysis.caveats.map((c) => (
          <div className="caveat" key={c}>
            {c}
          </div>
        ))}

        {analysis.rankedByP95.length > 0 && (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th className="cfg">config</th>
                    <th>fps</th>
                    <th>p50</th>
                    <th>p95</th>
                    <th>p99</th>
                    <th>worst</th>
                    <th>LT</th>
                    <th>jank</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rankedByP95.map((r) => {
                    const s = statsById.get(r.config)?.stats
                    if (!s) return null
                    const cls = [
                      r.config === 'baseline' ? 'base' : '',
                      r.valid ? '' : 'invalid',
                      s.p95 > 50 ? 'bad' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <tr
                        key={r.config}
                        className={cls}
                        onClick={() => {
                          const cfg = configById.get(r.config)
                          if (cfg) applyConfigFromRow(cfg)
                        }}
                      >
                        <td className="cfg">{r.label}</td>
                        <td>{s.fps}</td>
                        <td>{s.p50.toFixed(0)}</td>
                        <td className="p95">{s.p95.toFixed(0)}</td>
                        <td>{s.p99.toFixed(0)}</td>
                        <td>{s.max.toFixed(0)}</td>
                        <td>{s.longTasks}</td>
                        <td>{Math.round(s.jankPct * 100)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Ranked by p95 frame time, worst first — the tail is what you see as a stutter, not the
              average. Tap a row to put the page back into that configuration.
            </p>
          </>
        )}

        <div className="field">
          <label>Notes (goes into the export)</label>
          <input
            type="text"
            value={notes}
            placeholder="e.g. Tab Ultra, browser maximised, Wi-Fi"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="foot">
        <button className="act primary" onClick={() => void start('quick')}>
          Run Quick · 40s
        </button>
        <button className="act primary" onClick={() => void start('full')}>
          Run Full · 2.5m
        </button>
        <button className="act" onClick={doExport}>
          Export JSON
        </button>
        <button className="act" onClick={() => void doCopy()}>
          Copy JSON
        </button>
        <button className="act wide" onClick={reload}>
          Reload with this config
        </button>
        <button
          className="act"
          onClick={() => {
            closeSegment()
            // Forgets the stored profile, the stored switches and the stored dial, and re-arms
            // auto-detection — which is the only way back for someone who has switched something
            // off and cannot remember what. It does NOT clear `detected`: that is a measurement of
            // this device and is still true, so the page lands on it immediately.
            resetPerfState()
            setOffSet(readFxOff())
            setIntensityState(getIntensity())
            setMsg({ text: 'Stored choices cleared — auto-detection is armed again.', ok: true })
            setTimeout(openSegment, 700)
          }}
        >
          Reset · re-arm auto
        </button>
        <button className="act danger" onClick={onClose}>
          Close
        </button>
        {msg && <div className={`msg${msg.ok ? ' ok' : ''}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
