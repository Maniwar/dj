import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Version stamp, resolved at BUILD time so what the page reports is always what was actually
// compiled — you can read the tab title (or the boot console) and know exactly which build is
// live, instead of guessing whether a deploy landed. The git SHA is the unambiguous part; the
// semver is the human-readable one.
const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version
let gitSha = 'dev'
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
} catch {
  // not a git checkout (or git missing) — the semver alone still identifies the build
}

// The canonical audio library lives in /mp3 at the repo root (per project brief).
// We keep it there and serve/copy it to the web root so <audio src="/mp3/..."> works
// in both dev and production without duplicating the files into /public.
export default defineConfig({
  // Base public path. "/" for local dev/preview; the GitHub Pages project deploy sets
  // BASE_PATH=/dj/ (repo name) so absolute asset URLs resolve under maniwar.github.io/dj/.
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    // /mp3 lives at the repo root (per brief); copy it to the web root. Everything in
    // /public (generated Gemini art, etc.) is served natively by Vite's publicDir.
    viteStaticCopy({
      targets: [{ src: 'mp3/*.mp3', dest: 'mp3' }],
      silent: true,
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __BUILD_SHA__: JSON.stringify(gitSha),
  },
  server: { host: true },
})
