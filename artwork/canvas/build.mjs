// Build a Spotify Canvas from the 1080p VIDEO MASTERS, not from a screen recording.
//
// The first version screen-captured the running site. That pipeline cost quality three times
// over -- forced SwiftShader (software WebGL, so the rig juddered), Playwright's recordVideo
// (VP8 at low bitrate), and an upscale at the end -- and all of it was avoidable, because the
// footage already exists here at native 1920x1080.
//
// THE CROP DECISION. A 9:16 window out of one landscape master is only 608x1080 of real pixels,
// which then has to be blown up 1.78x to reach 1080x1920 -- soft, for the same reason the site
// serves an HD rendition to wide displays. Two scenes STACKED instead means each panel is a
// DOWNSCALE of native 1080p (1920x1080 -> 1707x960 -> centre-crop 1080x960), so nothing is ever
// enlarged. It also happens to be the composition the site itself uses in portrait, which is
// why the stacked framing read well in the first place.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const [top = 'club-floor', bottom = 'club-crowd', out = 'canvas-1080x1920'] = process.argv.slice(2)
const M = (s) => `video-masters/${s}.1080p.mp4`
mkdirSync('artwork/canvas/out', { recursive: true })

// 3.5s forward + the same reversed = a 7.0s rebound that returns to its first frame.
const SEG = 3.5
const panel = (i) =>
  `[${i}:v]trim=start=2:duration=${SEG},setpts=PTS-STARTPTS,scale=-2:960:flags=lanczos,crop=1080:960[p${i}]`

execFileSync('ffmpeg', [
  '-v', 'error',
  '-i', M(top), '-i', M(bottom),
  '-filter_complex',
  `${panel(0)};${panel(1)};[p0][p1]vstack=inputs=2[s];` +
    `[s]split[f][r];[r]reverse,setpts=PTS-STARTPTS[rv];[f][rv]concat=n=2:v=1[v]`,
  '-map', '[v]', '-an',
  // 24fps is the masters' native rate -- resampling to 30 would only duplicate frames and add
  // judder to footage that is already smooth.
  '-r', '24',
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20',
  '-pix_fmt', 'yuv420p',
  // Tag the colour explicitly. Untagged H.264 gets read as BT.601 by some players and BT.709 by
  // others, and the disagreement is exactly the washed-out, hue-shifted look.
  '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
  '-movflags', '+faststart',
  `artwork/canvas/out/${out}.mp4`, '-y',
])
console.log(`${out}.mp4  <- ${top} / ${bottom}`)
