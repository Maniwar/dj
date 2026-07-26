// Build Spotify Canvases from the 1080p video masters.
//
// PER-TRACK, because the site already maps songs to scenes. src/video/broadcastFrames.ts binds
// four songs to a city and shows the mainstage for everything else; a Canvas that ignored that
// would put a different room behind the song than the site does.
//
// SINGLE SHOT, not the stacked pair the first build produced. That stack existed for a purely
// technical reason -- a 9:16 window out of a 1920x1080 master is only 608x1080 of real detail --
// and letting that drive the composition was backwards: a Canvas is conventionally one
// continuous vertical shot, and a stacked pair reads as split-screen.
//
// The constraint mostly evaporates at 720x1280, which Spotify accepts: 608x1080 -> 720x1280 is a
// 1.18x upscale, essentially native. Chasing 1080x1920 would mean a 1.78x blow-up for a size
// nobody's phone resolves anyway.
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'

// Mirrors CITY_TRACK in src/video/broadcastFrames.ts. Kept as data here rather than imported
// because that module is TypeScript and pulls in the app's asset helpers.
const TRACKS = {
  'touch-my-subwoofer': 'ibiza',
  'euro-airways': 'tokyo',
  'pump-my-iron': 'miami',
  'the-basement-vip': 'berlin',
}
const DEFAULT_SCENE = 'club-floor' // the mainstage: every other track, and the release itself

const SEG = 3.5 // x2 with the rebound = a 7.0s loop, inside Spotify's 3-8s
const W = 720
const H = 1280

function build(scene, out) {
  const src = `video-masters/${scene}.1080p.mp4`
  if (!existsSync(src)) return console.log(`SKIP ${out} — no ${src}`)
  execFileSync('ffmpeg', [
    '-v', 'error', '-i', src,
    '-filter_complex',
      // Crop the 9:16 window at native resolution FIRST, then scale once. Cropping after a
      // scale would resample twice for no reason.
      `[0:v]trim=start=2:duration=${SEG},setpts=PTS-STARTPTS,` +
      `crop=ih*9/16:ih,scale=${W}:${H}:flags=lanczos,` +
      `split[f][r];[r]reverse,setpts=PTS-STARTPTS[rv];[f][rv]concat=n=2:v=1[v]`,
    '-map', '[v]', '-an',
    '-r', '24', // the masters' native rate; resampling would only duplicate frames
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '19',
    '-pix_fmt', 'yuv420p',
    // x264 writes the colour tags; the plain -colorspace output flags silently did not stick
    // here and the file probed back color_primaries=unknown, which is the untagged case where
    // players disagree about BT.601 vs BT.709 and the picture washes out.
    '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
    '-movflags', '+faststart',
    `artwork/canvas/out/${out}.mp4`, '-y',
  ])
  console.log(`${out}.mp4  <- ${scene}`)
}

mkdirSync('artwork/canvas/out', { recursive: true })
const only = process.argv[2]
if (!only || only === 'default') build(DEFAULT_SCENE, 'canvas-default')
for (const [slug, scene] of Object.entries(TRACKS)) {
  if (!only || only === slug) build(scene, `canvas-${slug}`)
}
