// THE MOISTURE MAINSTAGE — an EDC-scale / Love-Parade festival spectacle rendered
// entirely in one fragment shader, gilded in farcical European gold-luxury.
// Layers: warm noir sky + gold horizon glow, volumetric god-rays, sweeping
// searchlights, a colossal stage with a LIVE LED spectrum wall (fed the real FFT),
// laser fans, pyro columns + fireworks on the drops, an ocean of crowd with
// phone-flashes, falling gold confetti, drifting steam, condensation, bloom.
// Everything reacts to the AudioBus.

export const thermalVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0); // camera-independent fullscreen
  }
`

export const thermalFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uRes;
  uniform vec2  uMouse;
  uniform float uBass;
  uniform float uLevel;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uSnare;   // backbeat  -> strobe
  uniform float uHat;     // hi-hats   -> sparkle
  uniform float uDown;    // every 4th -> the big accent
  uniform float uBar;     // 0..1 through the bar -> the SWEEP
  uniform float uBuild;   // rising energy -> the rig gets hotter
  uniform float uDrop;    // release   -> everything blows open
  uniform vec3  uAccent;  // the colour of the section you're currently in
  uniform float uQuality; // 1 = full rig, 0 = phone tier (skips the expensive passes)
  uniform float uSong;    // per-track lighting design: 0..1, derived from the track slug
  uniform float uTemp;
  uniform float uHumidity;
  uniform float uDew;
  uniform float uOverclock;
  uniform float uFriction;
  uniform float uSauna;
  uniform sampler2D uFreq;
  uniform float uFreqCount;

  // ============================================================
  // RAW OVERLAY: thin lasers + heavy CONDENSATION + grain over the
  // photoreal club footage. No cartoon stage geometry. Screen-blended.
  // ============================================================
  float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
  }
  float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
  float droplets(vec2 uv, float density){
    float acc=0.0;
    for(int layer=0; layer<2; layer++){
      float s = 15.0*(1.0+float(layer)*0.85);
      vec2 gv=uv*s; vec2 id=floor(gv); vec2 f=fract(gv)-0.5;
      float rnd=hash(id+float(layer)*31.7);
      if(rnd>1.0-density){
        float drip=fract(uTime*0.04+rnd*7.0);
        vec2 c=vec2((rnd-0.5)*0.5, 0.5-drip);
        float d=length(f-c);
        acc += smoothstep(0.15,0.0,d);
      }
    }
    return clamp(acc,0.0,1.0);
  }

  // The whole light rig evaluated at a point. Pulled into a function so the WET FLOOR can
  // evaluate it a second time at the mirrored position — an actual reflection rather than a
  // painted-on gradient.
  //
  // Each beam is drawn as a hard CORE plus a wide soft HALO. That halo is the trick that makes
  // the light read as real bloom: a true bloom pass means rendering to a target, downsampling,
  // blurring and compositing every frame. Because this rig is procedural, the "blurred" version
  // is just the same distance field with a fatter falloff — same look, no extra passes, no
  // render targets, no new dependency.
  vec3 rig(vec2 q, float sweep, float fan){
    vec3 c = vec3(0.0);
    for(int i=0;i<6;i++){
      float fi=float(i);
      float a = (fi-2.5)*fan + sin(sweep + fi*1.04)*(0.55 + uBuild*0.35);
      vec2 dir = vec2(cos(a), sin(a));
      float d = abs(dot(q, vec2(dir.y,-dir.x)));
      float w = 0.0030 + uBeat*0.012 + uBass*0.004 + uDrop*0.02; // fattens on the hit
      float core = smoothstep(w, 0.0, d);
      // Halo width/strength are deliberately restrained: the alpha of this whole layer is its
      // own luminance, so an over-bright halo turns the overlay opaque and BURIES the footage
      // underneath. The footage is the star; the rig lights it.
      float halo = smoothstep(w*9.0, 0.0, d);
      vec3 lc = fi<0.5 ? vec3(1.0,0.12,0.56)
              : (fi<1.5 ? vec3(0.39,1.0,0.18)
              : (fi<2.5 ? vec3(0.08,0.88,1.0)
              : (fi<3.5 ? vec3(0.65,0.3,1.0)
              : (fi<4.5 ? vec3(1.0,0.12,0.56) : vec3(0.39,1.0,0.18)))));
      // Pull most beams toward the SECTION's colour so the rig belongs to whatever you're
      // reading — Kiki's pages go magenta, Dieter's cold blue, Ibiza sunrise gold. Alternating
      // beams keep their own hue so the fan still reads as multi-coloured rather than flat.
      lc = mix(lc, uAccent, mod(fi, 2.0) < 0.5 ? 0.78 : 0.30);
      c += lc * (core + halo*0.07) * (0.08 + uHat*0.5 + uBeat*1.25 + uBuild*0.5 + uDrop*1.6);
    }
    return c;
  }

  // Per-light colour for the rig, blended toward the section's accent.
  vec3 rigColour(float fi){
    vec3 lc = fi<0.5 ? vec3(1.0,0.12,0.56)
            : (fi<1.5 ? vec3(0.39,1.0,0.18)
            : (fi<2.5 ? vec3(0.08,0.88,1.0)
            : (fi<3.5 ? vec3(0.65,0.3,1.0) : vec3(1.0,0.12,0.56))));
    return mix(lc, uAccent, mod(fi, 2.0) < 0.5 ? 0.78 : 0.30);
  }

  // ---- VOLUMETRIC MOVING HEADS ----
  // The flat rig draws beams as lines on glass. These are actual CONES of light in 3D: we
  // march a ray from the camera through a fog volume and accumulate how much of each cone it
  // passes through. That's what produces real god rays — beams that widen with distance, fade
  // into haze, cross each OTHER in depth, and land on the floor — which is the difference
  // between "lasers drawn on a photo" and "a room with lights in it".
  // The heads PAN with the bar and TILT down on the kick, like a real lighting desk.
  vec3 volumetric(vec2 p, float sweep){
    vec3 ro = vec3(0.0, 0.0, -1.7);
    vec3 rd = normalize(vec3(p.x, p.y, 1.0));
    vec3 acc = vec3(0.0);
    float t = 0.35;
    for(int s=0; s<20; s++){
      vec3 pos = ro + rd*t;
      // haze is thicker toward the floor and drifts slowly, so beams break up as they descend
      float dens = (0.55 + 0.45*noise(pos.xz*1.6 + uTime*0.05)) * smoothstep(1.3, -0.5, pos.y);
      for(int i=0; i<5; i++){
        float fi = float(i);
        vec3 lp = vec3((fi-2.0)*0.66, 1.05, 0.55);                  // truss above the stage
        float pan  = sin(sweep + fi*1.25) * (0.6 + uBuild*0.3);     // sweeps across the bar
        float tilt = -0.9 - uBeat*0.28;                             // punches down on the kick
        vec3 cd = normalize(vec3(sin(pan), tilt, cos(pan)*0.4));
        vec3 L = pos - lp;
        float dist = length(L);
        float cone = smoothstep(0.9885 - uBuild*0.012, 0.9997, dot(L/dist, cd));
        acc += rigColour(fi) * cone * dens / (1.0 + dist*dist*1.7);
      }
      t += 0.17;
    }
    return acc * (0.30 + uBeat*0.85 + uDrop*1.6);
  }

  void main(){
    vec2 uv = vUv;
    float aspect = uRes.x/max(1.0,uRes.y);
    vec2 p = vec2((uv.x-0.5)*aspect, uv.y-0.5);
    vec3 col = vec3(0.0);

    // thin sweeping laser streaks (magenta / acid-green / blue / cyan), HARD beat-reactive:
    // each kick jolts the sweep, fattens the beam, and flares its brightness so the lasers
    // visibly punch on the beat instead of drifting.
    // The beams used to sweep on sin(uTime) — wall-clock time, so they drifted against the
    // music no matter how hard they flashed. They now sweep in MUSICAL time: uBar carries the
    // position through the bar, so one full scissor of the rig == one bar, and the fan kicks
    // to a new spread on the downbeat. That's what makes it read as choreography.
    // PER-SONG LIGHTING DESIGN. uSong is a stable 0..1 hash of the track, so every song gets
    // its own rig: a different fan spread, a different sweep rate, and a different phase — the
    // way a lighting designer would program each track rather than running one look all night.
    // It's deterministic, so a song always looks like itself.
    float sweep = uBar * 6.2831853 * (1.0 + floor(uSong*3.0)*0.5) + uSong*6.283;
    float fan = (0.26 + uSong*0.22) + uBuild*0.22 + uDown*0.16;
    // Flat rig for the sharp beam cores (and the whole rig on phones); the volumetric heads add
    // the depth on top. Together: crisp beams that also occupy real space.
    vec3 beams = rig(p, sweep, fan);
    col += beams * (uQuality > 0.5 ? 0.72 : 1.0);
    if (uQuality > 0.5) {
      vec3 vol = volumetric(p, sweep);
      col += vol;
      beams += vol; // dust should glitter in the volumetric shafts too
    }

    // DUST hanging in the air. Motes drift slowly upward and are only visible where a beam
    // actually lands on them — which is what sells the beams as volumes of light rather than
    // lines drawn on glass.
    // Motes are placed at a RANDOM point inside each cell, not at its centre. Lighting cell
    // centres puts every mote on a regular lattice, which the eye reads as marching columns of
    // static rather than dust in the air. Jittering the position (and thinning them out) breaks
    // the grid up completely.
    vec2 dgrid = vec2(uv.x, uv.y + uTime*0.012) * 300.0;
    vec2 dcell = floor(dgrid);
    float mote = step(0.9975, hash(dcell));
    vec2 jitter = vec2(hash(dcell + 11.3), hash(dcell + 27.9));
    float dot2 = smoothstep(0.34, 0.0, length(fract(dgrid) - jitter));
    col += vec3(1.0) * mote * dot2 * dot(beams, vec3(0.36)) * 0.5;

    // WET FLOOR. This club is always soaked, so the stage floor mirrors the rig: the lights now
    // have something to land on. The reflection re-evaluates the ACTUAL rig at the mirrored
    // point (not a faded copy), smeared sideways by a ripple that swells with the bass, and
    // falls off with depth. Phones skip it — it doubles the beam maths.
    float horizon = 0.26;
    if (uQuality > 0.5 && uv.y < horizon) {
      float depth = (horizon - uv.y) / horizon;            // 0 at the floor line -> 1 at bottom
      vec2 muv = vec2(uv.x, horizon + (horizon - uv.y));   // mirror across the floor line
      vec2 mp = vec2((muv.x-0.5)*aspect, muv.y-0.5);
      mp.x += sin(uv.y*70.0 - uTime*1.8) * 0.008 * (0.35 + uBass) * depth; // ripple
      col += rig(mp, sweep, fan) * (1.0 - depth) * 0.5;
    }

    float r = length(p);
    // KICK = a physical shove: a ring blown outward through the haze on every kick. uBeat
    // decays 1->0, so the ring expands as the hit dies away.
    float ring = smoothstep(0.035, 0.0, abs(r - (1.0-uBeat)*0.55)) * uBeat;
    col += vec3(1.0,0.35,0.75) * ring * 0.5;
    // SNARE = the strobe answering the kick on the backbeat (a flat flash, no colour cast)
    col += vec3(1.0) * uSnare * 0.11;
    // HATS = fine sparkle in the air, resampled fast so it glitters rather than crawls
    float sp = step(0.997 - uHat*0.02, hash(floor(uv*vec2(240.0,150.0)) + floor(uTime*34.0)));
    col += vec3(0.85,1.0,1.0) * sp * uHat * 0.55;
    // FOLLOW SPOT — a head that tracks your cursor. uMouse was already being smoothed every
    // frame and never read by anything; now the rig acknowledges you're in the room.
    vec2 mpos = vec2((uMouse.x-0.5)*aspect, uMouse.y-0.5);
    col += uAccent * smoothstep(0.40, 0.0, length(p - mpos)) * (0.045 + uBeat*0.11);
    // DROP = the whole room blows open
    col += vec3(1.0,0.55,0.9) * uDrop * 0.3 * (1.0 - r);

    // volumetric haze that breathes with the level, pulses on the kick, and THICKENS
    // through a build-up so the room feels like it's filling before the drop
    col += vec3(0.5,0.3,0.6) * fbm(uv*3.0 - uTime*0.05) * (uLevel*0.13 + uBeat*0.1 + uBuild*0.22);

    // ---- LED WALL ----
    // The FFT is downsampled and uploaded to the GPU every frame, but nothing ever read it —
    // pure wasted work. It's now the stage's LED strip: real spectrum, one texture fetch.
    float spec = texture2D(uFreq, vec2(uv.x, 0.5)).r;
    float barH = 0.018 + spec * 0.11; // a strip along the stage lip, not a wall up the screen
    // Softened edges on the LED grid — hard step() gaps alias into harsh flickering squares.
    float ledGapY = smoothstep(0.18, 0.42, fract(uv.y * 90.0));
    float ledGapX = smoothstep(0.06, 0.26, fract(uv.x * 130.0));
    vec3 wallCol = mix(uAccent, vec3(1.0), 0.22);
    col += wallCol * step(uv.y, barH) * ledGapY * ledGapX * (0.32 + uBeat*0.45 + uDrop*0.7);
    // and the light the wall throws back up into the haze
    col += wallCol * step(uv.y, barH + 0.09) * smoothstep(barH + 0.09, barH, uv.y)
           * (0.04 + uLevel*0.05);

    // DROP = pyro. Rays fire out of the middle for the length of the release.
    if (uDrop > 0.01) {
      float ang = atan(p.y, p.x);
      float rays = pow(abs(sin(ang*9.0 + uTime*1.6)), 22.0);
      col += vec3(1.0,0.72,0.34) * rays * uDrop * (1.0 - smoothstep(0.0, 0.85, r)) * 1.15;
    }

    // CONDENSATION beading over the whole "lens" — the humidity signature.
    // droplets() is 3 nested layers of hashing, by far the most expensive thing here, so the
    // phone tier skips it entirely. Branching on a uniform is coherent across every pixel, so
    // the GPU really does skip the work rather than executing both sides.
    float beads = 0.0;
    if (uQuality > 0.5) beads = droplets(uv, 0.04 + uHumidity*0.30);
    col += vec3(0.8,0.9,1.0) * beads * 0.35;

    // liquid-cooling wash on dew point
    float water = smoothstep(0.0,0.6, fbm(vec2(uv.x*8.0, uv.y*3.0 - uTime*4.0)))*uDew;
    col += vec3(0.6,0.85,1.0) * water * 0.5;

    // overclock shimmer
    col += vec3(0.4,1.0,0.6) * uOverclock * 0.1 * (0.5+0.5*sin(uTime*8.0));

    // ---- CROWD ----
    // A silhouetted front row along the bottom that JUMPS on the kick. The whole site is shot
    // from inside the crowd, so having actual heads between you and the stage is what puts you
    // in the room rather than looking at a poster of it.
    float headX = uv.x * 26.0;
    float hid = floor(headX);
    float bob = (0.012 + 0.03*hash(vec2(hid, 3.0))) * uBeat;      // each head on its own scale
    float headTop = 0.055 + 0.05*hash(vec2(hid, 7.0)) + bob;
    float dHead = length(vec2((fract(headX)-0.5)*0.55, (uv.y - headTop)));
    // RIM light only. This layer's alpha is its own luminance, so it can add light but can
    // never darken what's underneath — a filled silhouette would just punch a transparent hole
    // in the rig. Backlit heads catching the stage light is what you'd actually see anyway.
    float rim = smoothstep(0.150, 0.132, dHead) - smoothstep(0.132, 0.112, dHead);
    col += uAccent * max(rim, 0.0) * (0.35 + uBeat*0.9);

    // ---- VHS ----
    // The whole site is framed as leaked bootleg footage, so it should carry the artefacts of
    // one: the head-switching noise band that lives at the very bottom of a VHS frame, tape
    // tracking that wobbles the picture, and chroma that doesn't quite line up.
    float headSwitch = smoothstep(0.018, 0.0, uv.y) * (0.35 + 0.65*hash(vec2(floor(uv.x*90.0), floor(uTime*24.0))));
    col += vec3(0.55) * headSwitch * 0.5;
    // tracking wobble — worst on the downbeat, like the tape is struggling to hold the picture
    float track = sin(uv.y*140.0 + uTime*5.0) * 0.5 + 0.5;
    col += vec3(0.35,0.32,0.4) * track * uDown * 0.10;
    // occasional dropout streak
    float drop = step(0.9975, hash(vec2(floor(uv.y*160.0), floor(uTime*6.0))));
    col += vec3(0.8) * drop * 0.16;

    // grain (friction) + scanlines
    float grain = (hash(uv*uRes + uTime)-0.5)*(0.05+uFriction*0.2);
    col += grain;
    col -= sin(uv.y*uRes.y*1.1)*0.015*uFriction;

    // alpha = luminance so dark areas are transparent (footage shows through)
    vec3 outc = max(col, 0.0);
    float a = clamp(dot(outc, vec3(0.34,0.5,0.16))*1.3, 0.0, 1.0);
    gl_FragColor = vec4(outc, a);
  }
`
