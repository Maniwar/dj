// A backtick inside the GLSL terminates the JavaScript template literal holding it, so the shader
// stops being a string and the rest of the file is parsed as code. It has broken the build five
// times in one session, always from writing a variable name in prose backticks inside a comment.
// tsc reports it as a syntax error hundreds of lines away with no hint of the cause.
//
// This check has now been wrong twice itself, and both mistakes are worth keeping written down:
//
//   1. It looked for the closing delimiter as "\n`" and measured the body between. That is
//      circular -- a stray backtick IS the closing delimiter as far as the parser is concerned --
//      so it measured a truncated body and passed a file that would not compile.
//
//   2. It searched for THERMAL_FRAG and THERMAL_VERT. The exports are thermalFrag and thermalVert.
//      It therefore found nothing, checked nothing, and reported success. A verifier that passes
//      because it examined zero things is worse than no verifier, so it now FAILS if it cannot
//      find the literals it is supposed to be checking.
import { readFileSync } from 'node:fs'

const FILE = 'src/components/webgl/thermalShader.ts'
const src = readFileSync(FILE, 'utf8')
const lineOf = (i) => src.slice(0, i).split('\n').length
let bad = 0
let found = 0

for (const m of src.matchAll(/export const (\w+)\s*=\s*(?:\/\* glsl \*\/\s*)?`/g)) {
  found++
  const name = m[1]
  const open = m.index + m[0].length - 1
  const next = src.indexOf('`', open + 1)
  if (next < 0) { console.error(`${name}: literal is never closed`); bad++; continue }
  // From the opening backtick, the NEXT backtick terminates the literal, full stop. The intended
  // closer sits alone at the start of a line; anything else ends the string early.
  if (src[next - 1] !== '\n') {
    console.error(`${FILE}:${lineOf(next)}  stray backtick — ends ${name} here`)
    console.error(`    ${src.slice(src.lastIndexOf('\n', next) + 1, src.indexOf('\n', next)).trim()}`)
    bad++
  }
}

if (!found) {
  console.error(`${FILE}: found no GLSL template literals to check — the pattern is stale`)
  process.exit(2)
}
console.log(bad ? `\n${bad} stray backtick(s) in GLSL — the build will fail`
                : `GLSL literals are clean (${found} checked)`)
process.exit(bad ? 1 : 0)
