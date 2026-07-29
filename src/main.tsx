import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { BUILD_STAMP } from './version'

// Appended at runtime rather than baked into index.html on purpose: the static <title> and the
// og:/twitter: tags are what crawlers and pasted-link previews read, and those should stay clean.
// The tab is just for us — it's where you check which build you're looking at.
document.title = `${document.title} · ${BUILD_STAMP}`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
