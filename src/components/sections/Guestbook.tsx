import { useEffect, useMemo, useState } from 'react'
import { GUESTBOOK_SEED, type GuestPost } from '../../data/guestbook.seed'

const LS_POSTS = 'ch_guestbook_posts'
const LS_LIKES = 'ch_guestbook_likes'

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
    setMine((m) => [post, ...m])
    setBody('')
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
          <button className="gb-submit" type="submit">
            POST ►
          </button>
        </form>

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
