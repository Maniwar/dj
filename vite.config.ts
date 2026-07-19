import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// The canonical audio library lives in /mp3 at the repo root (per project brief).
// We keep it there and serve/copy it to the web root so <audio src="/mp3/..."> works
// in both dev and production without duplicating the files into /public.
export default defineConfig({
  plugins: [
    react(),
    // /mp3 lives at the repo root (per brief); copy it to the web root. Everything in
    // /public (generated Gemini art, etc.) is served natively by Vite's publicDir.
    viteStaticCopy({
      targets: [{ src: 'mp3/*.mp3', dest: 'mp3' }],
      silent: true,
    }),
  ],
  server: { host: true },
})
