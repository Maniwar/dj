// A backtick inside the GLSL source terminates the JavaScript template literal that holds it, so
// the shader stops being a string and the rest of the file is parsed as code. It has broken the
// build four times in one session, always from a comment written in prose habit -- `amount`,
// `beams`, `auto`. tsc catches it, but only as a syntax error hundreds of lines away with no hint
// of the cause, so it costs a diagnosis every time. This names it directly.
import { readFileSync } from 'node:fs'
const src = readFileSync('src/components/webgl/thermalShader.ts', 'utf8')
let bad = 0
for (const name of ['THERMAL_FRAG', 'THERMAL_VERT']) {
  const at = src.indexOf(`export const ${name}`)
  if (at < 0) continue
  const open = src.indexOf('`', at)
  const close = src.indexOf('\n`', open + 1)
  if (open < 0 || close < 0) { console.error(`${name}: could not find its template literal`); bad++; continue }
  const body = src.slice(open + 1, close)
  const hits = [...body.matchAll(/`/g)]
  if (hits.length) {
    bad += hits.length
    for (const h of hits) {
      const line = src.slice(0, open + 1 + h.index).split('\n').length
      console.error(`thermalShader.ts:${line}  backtick inside ${name} — terminates the literal`)
    }
  }
}
console.log(bad ? `\n${bad} stray backtick(s) in GLSL` : 'GLSL literals are clean')
process.exit(bad ? 1 : 0)
