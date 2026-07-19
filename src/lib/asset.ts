// Resolve a root-absolute asset path (e.g. "/mp3/x.mp3", "/assets/y.jpg") against the
// site's configured base URL. Vite sets import.meta.env.BASE_URL from `base` in
// vite.config.ts — "/" for local dev, "/dj/" for the GitHub Pages project deploy. The data
// files store clean root-absolute paths; the presentation layer resolves the base here so
// the exact same code works at both "/" and "/dj/" without touching the data.
const BASE = import.meta.env.BASE_URL || '/'

export function withBase(path: string | null | undefined): string {
  if (!path) return ''
  // Leave already-absolute references untouched: http(s)://, protocol-relative //,
  // and data:/blob: URLs (e.g. AtlasCloud mp4s, embedded posters).
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE
  return path.startsWith('/') ? base + path : base + '/' + path
}
