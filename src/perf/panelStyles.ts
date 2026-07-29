// ============================================================================================
// PANEL STYLES — a template string, not a .css file, and that is not an accident
// ============================================================================================
// Vite hoists an imported .css file into the document head. From there it could not reach a
// shadow tree at all, and it would have joined the fight this panel exists to avoid: a
// 3400-line stylesheet with `body *` reach, a `:root.gated *{animation-play-state:paused}` rule,
// a `body.sauna` filter that flattens the whole page, and a z-index war topping out at 200.
//
// Shadow DOM blocks all of that except INHERITED properties — font, color, letter-spacing,
// text-transform, cursor, visibility. Those are re-declared explicitly on :host below rather
// than relying on `all: initial`, which would also throw away the host's own positioning.
//
// One more constraint shapes everything here: this panel is operated with a thumb, on a tablet
// that is mid-stutter, by someone who is trying to read numbers off it. Every control is at
// least 44px tall, nothing depends on hover, and the numbers are monospaced so they stop
// jittering as they change.

export const PANEL_CSS = `
:host {
  /* Re-declare every inherited property the site sets globally. */
  all: initial;
  display: block;
  position: fixed;
  z-index: 2147483000;
  inset: auto 0 0 auto;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #e8eef6;
  letter-spacing: normal;
  text-transform: none;
  cursor: auto;
  /* The panel must not make the page it is measuring reflow or repaint. contain cuts it out of
     the document's layout and paint trees entirely. */
  contain: layout style paint;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; margin: 0; padding: 0; font: inherit; color: inherit; }

.wrap {
  display: flex;
  flex-direction: column;
  background: #0b0e14;
  border: 1px solid #263041;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -8px 40px rgba(0,0,0,0.6);
  overflow: hidden;
  /* dvh, not vh: the Android URL bar collapses and expands, and vh is measured against the
     LARGER viewport — so the action row would sit under the browser chrome exactly when the
     user reaches for it. */
  max-height: 76dvh;
  width: 100vw;
}
@media (min-width: 720px) {
  :host { inset: 0 0 0 auto; }
  .wrap { width: 380px; max-height: 100dvh; height: 100dvh; border-radius: 0; border-width: 0 0 0 1px; }
}
/* COLLAPSED MOVES TO THE TOP RIGHT, and that is not cosmetic.
   Expanded, this is a bottom sheet — which sits exactly on top of the minimized player, i.e. on
   top of the play button. Pressing play is a hard precondition of the benchmark, so a collapsed
   panel that still covered the transport would make the harness unusable on the one device it
   was built for. Collapsed it becomes a small badge in the opposite corner: the live readout
   stays visible, and nothing the user needs is underneath it. */
:host(.collapsed) { inset: 0 0 auto auto; }
:host(.collapsed) .wrap {
  width: auto; max-width: 100vw; max-height: none; height: auto;
  border-radius: 0 0 0 12px; border-width: 0 0 1px 1px;
}
:host(.collapsed) .dev { display: none; }

/* ---- header ---------------------------------------------------------------------------- */
.head {
  flex: 0 0 auto;
  padding: 8px 10px;
  background: #121826;
  border-bottom: 1px solid #263041;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 8px;
  align-items: center;
}
.stamp { font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; color: #7c8aa0; }
.dev   { grid-column: 1 / -1; font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; color: #7c8aa0; word-break: break-word; }
.live  { grid-column: 1 / -1; font: 700 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #8bff3b; letter-spacing: 0.02em; }
.live.warn { color: #ffc53b; }
.live.bad  { color: #ff5470; }

.iconbtn {
  min-width: 44px; min-height: 36px;
  background: #1b2333; border: 1px solid #2f3b4e; border-radius: 8px;
  color: #cfd9e6; font: 700 15px/1 ui-monospace, monospace;
  cursor: pointer; touch-action: manipulation;
}
.iconbtn:active { background: #2a3548; }

/* ---- scroll body ----------------------------------------------------------------------- */
.body {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 8px 10px 4px;
}
:host(.collapsed) .body, :host(.collapsed) .foot { display: none; }

.sec { margin: 0 0 10px; }
.sec > summary {
  list-style: none;
  min-height: 44px;
  display: flex; align-items: center; gap: 8px;
  padding: 0 8px;
  background: #151d2b; border: 1px solid #263041; border-radius: 8px;
  font: 600 12px/1 -apple-system, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.08em; text-transform: uppercase; color: #9db0c9;
  cursor: pointer; touch-action: manipulation;
}
.sec > summary::-webkit-details-marker { display: none; }
.sec > summary::after { content: '+'; margin-left: auto; font: 700 16px/1 ui-monospace, monospace; color: #63748c; }
.sec[open] > summary::after { content: '−'; }
.sec .count { color: #63748c; font-weight: 400; letter-spacing: 0; text-transform: none; }

/* ---- profile selector ------------------------------------------------------------------- */
/* Five stops on one row, and the whole ladder visible at once. A <select> would have hidden four
   of the five behind a tap and given no room for the ghost label — and "what did this device
   measure?" is the question the control exists to answer, not "which one is chosen". */
.seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.segbtn {
  min-height: 44px; padding: 4px 2px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: #151d2b; border: 1px solid #263041; border-radius: 8px;
  color: #9db0c9; font: 600 11px/1.1 -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: pointer; touch-action: manipulation;
}
.segbtn.on { background: #17402a; border-color: #2c6a45; color: #b6ffa0; }
.segbtn:active { background: #2a3548; }
.segbtn em { font: 400 9px/1 ui-monospace, monospace; font-style: normal; color: #63748c; }
.segbtn.on em { color: #8bff3b; }

/* ---- effect rows ----------------------------------------------------------------------- */
.row {
  display: grid;
  /* Four columns, and the switch is PINNED to the last one. The revert control only exists on
     overridden rows, and a switch that slid sideways depending on whether a row was overridden
     would be a moving target for a thumb on a device that is already stuttering. */
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 4px 8px;
  border-bottom: 1px solid #1a2130;
}
.row:last-child { border-bottom: 0; }
.row .name { font-size: 13px; line-height: 1.25; }
.row .meta { display: block; font: 10px/1.3 ui-monospace, monospace; color: #63748c; }
.row.reload .name { color: #9aa7b8; }
/* An override is the user's own decision and outranks the profile, so it is the one row state
   worth colouring: it is also the thing that will still be in force in a month. */
.row.over { background: #141c2c; box-shadow: inset 2px 0 0 #ff6cbd; }
.row.over .meta { color: #ff6cbd; }
.clearbtn {
  grid-column: 2;
  min-width: 36px; min-height: 36px;
  background: #1b2333; border: 1px solid #2f3b4e; border-radius: 8px;
  color: #ff6cbd; font: 700 15px/1 ui-monospace, monospace;
  cursor: pointer; touch-action: manipulation;
}
.clearbtn:active { background: #2a3548; }
.row .dots { grid-column: 3; font: 11px/1 ui-monospace, monospace; letter-spacing: 1px; }
.c1 { color: #3f6b4a; } .c2 { color: #b08a2e; } .c3 { color: #d4444f; }

/* A real checkbox with role=switch: keyboard- and screen-reader-operable on the Surface, and a
   44px hit area on the tablet. The visual is drawn on the label so the input itself can keep
   its native semantics. */
.sw { grid-column: 4; position: relative; display: inline-block; width: 52px; height: 32px; flex: 0 0 auto; }
.sw input {
  position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px);
  margin: 0; opacity: 0; cursor: pointer; z-index: 1; touch-action: manipulation;
}
.sw i {
  position: absolute; inset: 0; border-radius: 16px;
  background: #2b3548; border: 1px solid #3a4760; transition: background .12s linear;
  pointer-events: none;
}
.sw i::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px;
  border-radius: 50%; background: #8b98ab; transition: transform .12s linear, background .12s linear;
}
/* CHECKED MEANS ON — the switch shows whether the EFFECT is on, not whether it is suppressed.
   The class it writes is fx-off-*, i.e. the inverse, and getting that backwards in a panel used
   to run a benchmark would invert every row in the export. */
.sw input:checked + i { background: #17402a; border-color: #2c6a45; }
.sw input:checked + i::after { transform: translateX(20px); background: #8bff3b; }
.sw input:focus-visible + i { outline: 2px solid #4aa3ff; outline-offset: 2px; }
.sw input:disabled + i { opacity: .4; }

/* ---- controls -------------------------------------------------------------------------- */
.field { padding: 6px 8px 10px; }
.field label { display: block; font: 600 10px/1 -apple-system, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #7c8aa0; margin-bottom: 6px; }
input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; touch-action: manipulation;
}
input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: #2b3548; }
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%;
  background: #ff2e9a; border: 2px solid #0b0e14; margin-top: -11px;
}
input[type=range]::-moz-range-track { height: 6px; border-radius: 3px; background: #2b3548; }
input[type=range]::-moz-range-thumb { width: 28px; height: 28px; border: 2px solid #0b0e14; border-radius: 50%; background: #ff2e9a; }
input[type=text] {
  width: 100%; min-height: 44px; padding: 0 10px;
  background: #121826; border: 1px solid #2f3b4e; border-radius: 8px; color: #e8eef6;
}
.val { float: right; font: 700 12px/1 ui-monospace, monospace; color: #ff6cbd; }

/* ---- actions --------------------------------------------------------------------------- */
.foot {
  flex: 0 0 auto;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid #263041; background: #121826;
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
button.act {
  min-height: 44px; padding: 0 10px;
  background: #1b2333; border: 1px solid #2f3b4e; border-radius: 8px;
  color: #e8eef6; font: 600 13px/1 -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: pointer; touch-action: manipulation;
}
button.act:active { background: #2a3548; }
button.act:disabled { opacity: .4; }
button.act.primary { background: #17402a; border-color: #2c6a45; color: #b6ffa0; }
button.act.danger  { background: #3a1620; border-color: #6a2c3a; color: #ffb6c4; }
button.act.wide { grid-column: 1 / -1; }

.msg { grid-column: 1 / -1; font: 12px/1.35 ui-monospace, monospace; color: #ffc53b; }
.msg.ok { color: #8bff3b; }

/* ---- running strip --------------------------------------------------------------------- */
/* During a run the panel collapses to this ONE line and stops every other DOM write. A 27-row
   React tree re-rendering over playing video is itself a measurable load, and a harness that
   changes the number it is reporting is worth nothing. */
.running {
  padding: 12px 10px calc(12px + env(safe-area-inset-bottom, 0px));
  display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
}
.running .txt { font: 700 13px/1.35 ui-monospace, monospace; color: #8bff3b; }
.running .bar { grid-column: 1 / -1; height: 6px; border-radius: 3px; background: #2b3548; overflow: hidden; }
.running .bar > i { display: block; height: 100%; background: #8bff3b; width: 0; }

/* ---- results --------------------------------------------------------------------------- */
.verdict {
  margin: 0 0 8px; padding: 8px 10px;
  background: #1a1424; border: 1px solid #3a2a52; border-radius: 8px;
  font: 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #e5d6ff;
}
.caveat { margin: 0 0 6px; padding: 6px 8px; background: #241a10; border: 1px solid #4a3418; border-radius: 6px; font: 11px/1.4 -apple-system, sans-serif; color: #ffd9a0; }
.tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid #263041; border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
th, td { padding: 8px 6px; text-align: right; white-space: nowrap; border-bottom: 1px solid #1a2130; }
th { position: sticky; top: 0; background: #151d2b; color: #7c8aa0; font-weight: 600; }
td.cfg, th.cfg { text-align: left; white-space: normal; min-width: 130px; }
tbody tr { cursor: pointer; }
tbody tr:active { background: #1b2333; }
tr.base td { background: #14202c; }
tr.bad td.p95 { color: #ff5470; font-weight: 700; }
tr.invalid td { opacity: .45; font-style: italic; }
.hint { margin: 6px 0 0; font: 10px/1.4 -apple-system, sans-serif; color: #63748c; }
`
