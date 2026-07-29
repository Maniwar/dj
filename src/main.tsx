import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// AFTER index.css, always. Every rule in the kill sheet is !important so it does not depend on
// source order to win — but if it is ever imported first, a future non-important rule in it
// would lose silently, which is the failure this whole harness exists to stop happening.
import './fx-off.css'
import { BUILD_STAMP } from './version'
import { initPerfState } from './perf/fxState'

// Appended at runtime rather than baked into index.html on purpose: the static <title> and the
// og:/twitter: tags are what crawlers and pasted-link previews read, and those should stay clean.
// The tab is just for us — it's where you check which build you're looking at.
document.title = `${document.title} · ${BUILD_STAMP}`

// SYNCHRONOUSLY, BEFORE THE FIRST RENDER. Doing this in an effect would paint one frame with
// every effect on before switching them off — on a device that asked for none, or that stored
// `minimal` last visit, that frame is the most expensive one of the session and it is the first
// thing its owner sees.
//
// This resolves the whole precedence ladder (?fxoff/?fxon → stored switches → ?profile →
// stored profile → auto → full) into one set of root classes. Auto-detection is the only rung
// that cannot be decided here, because it has to watch the page run; it starts from App.
initPerfState()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
