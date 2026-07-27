import { useEffect, useMemo, useRef, useState } from 'react'
import { GUESTBOOK_SEED, type GuestPost } from '../../data/guestbook.seed'

const LS_POSTS = 'ch_guestbook_posts'
const LS_LIKES = 'ch_guestbook_likes'

const ENDPOINT = import.meta.env.VITE_GUESTBOOK_ENDPOINT as string | undefined
const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const RANDOM_HANDLES = ['xX_r4ver_Xx', 'moisture_maxx', 'euro_trash_420', 'dialup_deb', 'sub_woofer_stan']

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export default function Guestbook() {
  const [mine, setMine] = useState<GuestPost[]>(() => load(LS_POSTS, []))
  const [liked, setLiked] = useState<Record<string, boolean>>(() => load(LS_LIKES, {}))
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  // 'idle' | 'sending' | 'queued' | the error text
  const [status, setStatus] = useState<string>('idle')

  // TURNSTILE, RENDERED EXPLICITLY.
  //
  // The implicit mode — drop a .cf-turnstile div and let the script find it — scans the DOM when
  // the script loads and does not watch for later additions. This section mounts with React, well
  // after that scan, so the widget silently never appeared: no error, no iframe, and every
  // submission rejected 403 because the token was empty. Explicit render removes the race.
  //
  // The script itself is only loaded when the guestbook is actually wired up. Pulling in a
  // third-party script on a page with nowhere to post would be a request and a widget for nothing.
  const widgetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ENDPOINT || !TURNSTILE_KEY) return
    let cancelled = false

    const render = () => {
      const ts = (window as any).turnstile
      if (cancelled || !ts || !widgetRef.current) return
      if (widgetRef.current.childElementCount) return // already rendered
      ts.render(widgetRef.current, { sitekey: TURNSTILE_KEY, theme: 'dark' })
    }

    if ((window as any).turnstile) {
      render()
    } else if (!document.getElementById('cf-turnstile-script')) {
      const el = document.createElement('script')
      el.id = 'cf-turnstile-script'
      el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      el.async = true
      el.defer = true
      el.onload = render
      document.head.appendChild(el)
    } else {
      // script already in flight from an earlier mount — poll briefly for the global
      const t = window.setInterval(() => {
        if ((window as any).turnstile) {
          window.clearInterval(t)
          render()
        }
      }, 120)
      window.setTimeout(() => window.clearInterval(t), 8000)
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => localStorage.setItem(LS_POSTS, JSON.stringify(mine)), [mine])
  useEffect(() => localStorage.setItem(LS_LIKES, JSON.stringify(liked)), [liked])

  const posts = useMemo(() => [...mine, ...GUESTBOOK_SEED], [mine])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    const handle =
      name.trim() || RANDOM_HANDLES[Math.floor(Math.random() * RANDOM_HANDLES.length)]
    const now = new Date()
    const post: GuestPost = {
      id: `me-${now.getTime()}`,
      user: handle,
      flag: '💦',
      color: '#12e0c0',
      time: now.toISOString().slice(0, 16).replace('T', ' '),
      body: text,
      likes: 0,
    }
    // THE LOCAL ECHO STAYS. The submitter sees their own entry immediately, whether or not it is
    // ever approved — otherwise the form feels broken while they wait, and this is what has always
    // made the wall feel alive. What is public and what you can see are simply different things.
    setMine((m) => [post, ...m])
    setBody('')

    // With no endpoint configured the guestbook behaves exactly as it always has: a private,
    // per-device wall. That is a working feature, not a broken one, so the absence of a backend
    // must never surface as an error.
    if (!ENDPOINT) return

    setStatus('sending')
    const form = e.target as HTMLFormElement
    const token =
      (form.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? ''
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: handle,
        body: text,
        token,
        // honeypot: hidden from people, filled by bots that complete every field
        website: (form.querySelector('[name="website"]') as HTMLInputElement | null)?.value ?? '',
      }),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setStatus(ok && j.ok ? 'queued' : j.error || 'could not send'))
      .catch(() => setStatus('could not send'))
      .finally(() => {
        // reset the widget so a second entry gets a fresh token
        ;(window as any).turnstile?.reset?.()
      })
  }

  const like = (id: string) => setLiked((l) => ({ ...l, [id]: !l[id] }))

  return (
    <section className="guestbook" id="guestbook">
      <div className="gb-inner">
        <h2 className="section-title">◄ THE CYBER GUESTBOOK ►</h2>
        <p className="section-kicker">
          &gt;&gt; sign the book. mind the bass. no flaming (ok some flaming) &lt;&lt;
        </p>

        <form className="gb-form" onSubmit={submit}>
          <input
            className="gb-name"
            placeholder="ur h4ndle"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="gb-body"
            placeholder="drop a comment... (bass too loud? say so)"
            value={body}
            maxLength={280}
            onChange={(e) => setBody(e.target.value)}
          />
          {/* HONEYPOT. Hidden from people and from screen readers, present in the DOM for bots
              that fill every field. Not display:none — some bots skip those. */}
          <input
            name="website"
            className="gb-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <button className="gb-submit" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'SENDING…' : 'POST ►'}
          </button>
        </form>

        {ENDPOINT && TURNSTILE_KEY && <div ref={widgetRef} className="cf-turnstile" />}

        {status !== 'idle' && status !== 'sending' && (
          <p className="gb-status" role="status">
            {status === 'queued'
              ? '>> ENTRY RECEIVED. THE DOOR STAFF ARE REVIEWING IT. <<'
              : `>> ${status} <<`}
          </p>
        )}

        <div className="gb-list">
          {posts.map((p) => {
            const bonus = liked[p.id] ? 1 : 0
            return (
              <article className="gb-post" key={p.id}>
                <div className="gb-side" style={{ borderColor: p.color }}>
                  <span className="gb-flag">{p.flag}</span>
                  <span className="gb-user" style={{ color: p.color }}>
                    {p.user}
                  </span>
                  <span className="gb-time">{p.time}</span>
                  <button
                    className={`gb-like ${liked[p.id] ? 'on' : ''}`}
                    onClick={() => like(p.id)}
                    aria-pressed={!!liked[p.id]}
                  >
                    ♥ {p.likes + bonus}
                  </button>
                </div>
                <pre className="gb-text">{p.body}</pre>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
