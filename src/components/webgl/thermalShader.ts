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
  uniform float uPattern; // which rig look is up: 0 overhead, 1 corners, 2 floor, 3 sides
  uniform float uVocal;   // a sung WORD just landed
  uniform float uConfetti; // 0..1, fires on a drop and falls for a few seconds after
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
  // Condensation beading on the lens. Two faults made these read as big grey squares snowing
  // across the club rather than water on glass:
  //   • the grid was only 15 divisions wide — ~85px cells on a 1280px screen, so each "bead"
  //     was enormous;
  //   • the distance test runs inside a single cell, so any bead drifting near a cell edge got
  //     sliced flat by it — which is where the square edges came from.
  // Fixed by making the cells far finer and the bead small relative to its cell, so a bead
  // never reaches the boundary that would clip it.
  float droplets(vec2 uv, float density){
    float acc=0.0;
    for(int layer=0; layer<2; layer++){
      float s = 46.0*(1.0+float(layer)*0.85);
      vec2 gv=uv*s; vec2 id=floor(gv); vec2 f=fract(gv)-0.5;
      float rnd=hash(id+float(layer)*31.7);
      if(rnd>1.0-density){
        float drip=fract(uTime*0.04+rnd*7.0);
        vec2 c=vec2((rnd-0.5)*0.34, 0.34-drip*0.68); // stays clear of the cell edge
        float d=length(f-c);
        acc += smoothstep(0.085,0.0,d);
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
  // WHERE each head is rigged, and which way it points. Everything used to pivot around the
  // centre of the screen, so the lasers were forever a star bursting out of the middle. A real
  // room has heads on the overhead truss, on the corners, uplights along the floor lip and
  // towers at the sides — and the desk CHANGES the look every few bars. uPattern cycles those.
  vec2 beamOrigin(float fi, float pat){
    // Fixed rig positions — 2 overhead, 2 corners, 2 floor uplights, 1 side tower, 1 centre.
    // Origins sit OUTSIDE the frame (except the centre burst, which is meant to be seen from
    // the middle); a light source inside the picture puts a blown-out hotspot on screen.
    if (fi < 1.5) return vec2(fi < 0.5 ? -0.45 : 0.45, 1.05);       // overhead truss L/R
    if (fi < 3.5) return vec2(fi < 2.5 ? -1.35 : 1.35, 1.00);       // corner trusses
    if (fi < 5.5) return vec2(fi < 4.5 ? -0.55 : 0.55, -1.00);      // floor uplights
    if (fi < 6.5) return vec2(mod(pat,2.0) < 1.0 ? -1.5 : 1.5, 0.10); // side tower (swaps side)
    return vec2(0.0, 0.0);                                          // centre burst
  }
  float beamAim(float fi, float pat){
    if (fi < 1.5) return -1.5708;                                    // down
    if (fi < 3.5) return fi < 2.5 ? -0.95 : -2.19;                   // inward + down
    if (fi < 5.5) return 1.5708;                                     // up
    if (fi < 6.5) return mod(pat,2.0) < 1.0 ? 0.0 : 3.1416;          // across
    return fi * 1.2566;                                              // radiating
  }
  // WHICH FIXTURES ARE LIVE, and how hard — this is the cue list. Everything used to be on all
  // the time, which is why it read as a constant wash instead of a show. Now each group answers
  // to a different part of the kit, so lights come in and drop out with the music.
  float beamGain(float fi, float pat){
    // Base level per group — which part of the kit each fixture answers to.
    float g;
    if (fi < 1.5)      g = 0.30 + uBeat*1.15;                          // overhead: on the kick
    else if (fi < 3.5) g = 0.10 + uSnare*1.9 + uDrop*1.2;              // corners: SNAP on the backbeat
    else if (fi < 5.5) g = 0.02 + uBuild*1.9 + uBeat*0.55;              // floor: idle dark, swell on a build
    else if (fi < 6.5) g = (0.20 + uBeat*0.8) * step(1.0, mod(pat,2.0)); // side tower: alternate cues
    else               g = 0.06 + uDown*1.1 + uDrop*2.2 + uVocal*0.9;  // centre: accents + vocal

    // HERO BEAMS. Every fixture running at the same level is a wash, not a show — a real rig
    // has one or two heads punching far harder than the rest, and which ones changes with the
    // cue. Two fixtures per cue are picked deterministically from the song + cue, driven up
    // hard, while the rest sit back — so the eye has something to follow.
    float pick = mod(fi + floor(pat) * 2.0 + floor(uSong * 8.0), 8.0);
    float hero = step(pick, 1.5);                       // 2 of the 8 are heroes this cue
    g *= mix(0.38, 5.0, hero);                          // a hero is >13x the fill, not 5x
    // and the heroes flare harder still on the hit
    g += hero * (uBeat*2.2 + uDown*1.6 + uDrop*3.0);   // and it SLAMS on the hit
    return g;
  }

  // Beam width per fixture. The floor uplights read as a wash because they were as wide as
  // everything else while travelling the full height of the frame — a broad, near-vertical
  // column of haze rather than a shaft of light. Narrow them right down.
  float beamWidth(float fi){
    if (fi > 3.5 && fi < 5.5) return 0.45;  // floor uplights: tight shafts
    if (fi > 6.5) return 0.75;              // centre burst: crisper
    return 1.0;
  }

  vec3 rig(vec2 q, float sweep, float fan, float pat){
    vec3 c = vec3(0.0);
    for(int i=0;i<8;i++){
      float fi=float(i);
      vec2 org = beamOrigin(fi, pat);
      // FRICTION shakes the rig itself: the heads lose their footing and the beams judder,
      // which is what a worn bootleg of a light show would actually look like.
      float jitter = (hash(vec2(fi, floor(uTime*22.0))) - 0.5) * uFriction * 0.34;
      float a = beamAim(fi, pat) + (fi-2.5)*fan*0.34
              + sin(sweep + fi*1.04)*(0.5 + uBuild*0.32) + jitter;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 rel = q - org;
      float d = abs(dot(rel, vec2(dir.y,-dir.x)));
      // A head throws a RAY, not an infinite line — mask to what's in front of the lens, and
      // fall off with throw distance so the far end of the beam dies into the haze.
      float fwd = smoothstep(-0.04, 0.18, dot(rel, dir));
      // Fade IN away from the lens as well as out with distance: without the near-field term
      // the pixels closest to each head saturate to white.
      float len = length(rel);
      // Small near-field radius only: enough to stop a blown-out blob AT the lens, but not so
      // wide that it erases the centre-burst look (whose origin is the middle of the screen).
      float att = fwd * smoothstep(0.0, 0.10, len) / (1.0 + len*0.9);
      float w = (0.0030 + uBeat*0.012 + uBass*0.004 + uDrop*0.02) * beamWidth(fi); // fattens on the hit
      float core = smoothstep(w, 0.0, d) * att;
      // Halo width/strength are deliberately restrained: the alpha of this whole layer is its
      // own luminance, so an over-bright halo turns the overlay opaque and BURIES the footage
      // underneath. The footage is the star; the rig lights it.
      float halo = smoothstep(w*9.0, 0.0, d) * att;
      vec3 lc = fi<1.5 ? vec3(1.0,0.12,0.56)
              : (fi<3.5 ? vec3(0.08,0.88,1.0)
              : (fi<5.5 ? vec3(0.39,1.0,0.18)
              : (fi<6.5 ? vec3(0.65,0.3,1.0) : vec3(1.0,0.12,0.56))));
      // Pull most beams toward the SECTION's colour so the rig belongs to whatever you're
      // reading — Kiki's pages go magenta, Dieter's cold blue, Ibiza sunrise gold. Alternating
      // beams keep their own hue so the fan still reads as multi-coloured rather than flat.
      lc = mix(lc, uAccent, mod(fi, 2.0) < 0.5 ? 0.78 : 0.30);
      c += lc * (core + halo*0.06) * beamGain(fi, pat) * (0.9 + uHat*0.5);
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
        // the volumetric heads move with the look too, so the god rays come from wherever
        // the rig currently is rather than always hanging over the middle
        vec2 o2 = beamOrigin(fi, uPattern);
        vec3 lp = vec3(o2.x*1.5, 0.35 + o2.y*1.1, 0.55);
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
    return acc * (0.22 + uBeat*0.6 + uDrop*1.1);
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
    vec3 beams = rig(p, sweep, fan, uPattern);
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
      col += rig(mp, sweep, fan, uPattern) * (1.0 - depth) * 0.5;
    }

    float r = length(p);
    // KICK = a physical shove: a ring blown outward through the haze on every kick. uBeat
    // decays 1->0, so the ring expands as the hit dies away.
    float ring = smoothstep(0.035, 0.0, abs(r - (1.0-uBeat)*0.55)) * uBeat;
    col += vec3(1.0,0.35,0.75) * ring * 0.5;
    // SNARE = the strobe answering the kick on the backbeat (a flat flash, no colour cast)
    col += vec3(1.0) * uSnare * 0.11;
    // HATS = fine sparkle in the air. THIS was the pale grey squares drifting over the whole
    // page: step() on a cell hash lights the ENTIRE cell, and the cells were ~9x7px, so every
    // sparkle was a hard-edged rectangle. Now each one is a small round point at a random spot
    // inside its cell, on a much finer grid — glitter rather than tiles.
    vec2 sgrid = uv * uRes / 5.0;
    vec2 scell = floor(sgrid);
    float sHash = hash(scell + floor(uTime * 26.0));
    float sp = step(0.9975 - uHat * 0.02, sHash);
    vec2 sJit = vec2(hash(scell + 5.1), hash(scell + 19.7));
    float sDot = smoothstep(0.42, 0.0, length(fract(sgrid) - sJit));
    col += vec3(0.85,1.0,1.0) * sp * sDot * uHat * 0.6;
    // THE VOCAL LIGHTS THE ROOM: every sung word throws a bloom up off the lyric line and
    // shoves a ring outward, so the rig is answering the singing and not only the drum kit.
    float ly = uv.y - 0.075;
    col += uAccent * uVocal * 0.5 * exp(-abs(ly)*9.0) * (0.4 + uHat);
    float vr = length(p - vec2(0.0, -0.42));
    col += mix(uAccent, vec3(1.0), 0.4) * uVocal
         * smoothstep(0.05, 0.0, abs(vr - (1.0-uVocal)*0.5)) * 0.45;
    // FOLLOW SPOT — a head that tracks your cursor. uMouse was already being smoothed every
    // frame and never read by anything; now the rig acknowledges you're in the room.
    vec2 mpos = vec2((uMouse.x-0.5)*aspect, uMouse.y-0.5);
    col += uAccent * smoothstep(0.40, 0.0, length(p - mpos)) * (0.045 + uBeat*0.11);
    // DROP = the whole room blows open
    col += vec3(1.0,0.55,0.9) * uDrop * 0.3 * (1.0 - r);

    // volumetric haze that breathes with the level, pulses on the kick, and THICKENS
    // through a build-up so the room feels like it's filling before the drop
    col += vec3(0.5,0.3,0.6) * fbm(uv*3.0 - uTime*0.05) * (uLevel*0.13 + uBeat*0.1 + uBuild*0.22);

    // ---- STAGE LIP GLOW ----
    // The FFT still drives the front of the stage, but as a soft SPECTRUM GLOW rather than a
    // grid of LED cells — the cell pattern read as a pink checkerboard sitting on top of the
    // photo instead of as part of the room.
    float spec = texture2D(uFreq, vec2(uv.x, 0.5)).r;
    float lip = 0.018 + spec * 0.165; // taller: the data spans its full range now
    vec3 wallCol = mix(uAccent, vec3(1.0), 0.24);
    // the LED CELLS are back — this is the bottom spectrum you liked. Soft-edged so they don't
    // alias into harsh flicker, and nothing is drawn on top of them any more.
    // Cell size is set in DEVICE PIXELS, not in UV space. Fixed UV divisions made each cell
    // ~10px wide on a 1280px screen — chunky enough to read as huge pixels rather than an LED
    // strip — and worse, they resized with the window. 4px cells look like a real LED matrix
    // and stay that size at any resolution.
    // You liked the fine cells AND the chunky ones, so the panel changes resolution with the
    // rig cue — fine 3px dots, mid 6px, chunky 10px blocks — cycling on the bar line like the
    // rest of the show rather than sitting at one size forever.
    float cellPx = uPattern < 1.5 ? 3.0 : (uPattern < 3.5 ? 6.0 : 10.0);
    float cellY = smoothstep(0.12, 0.40, fract(uv.y * uRes.y / cellPx));
    float cellX = smoothstep(0.12, 0.40, fract(uv.x * uRes.x / cellPx));
    col += wallCol * step(uv.y, lip) * cellY * cellX * (0.34 + uBeat*0.42 + uDrop*0.6);
    // soft spill of light up off the strip
    col += wallCol * step(uv.y, lip + 0.075) * smoothstep(lip + 0.075, lip, uv.y) * (0.05 + uLevel*0.05);

    // CONFETTI — gold foil off the ceiling on a drop. Flakes fall on their own grid, each with
    // its own drift, fall speed and spin, so they scatter rather than march. Rectangles are the
    // point here (foil, not dust), but they're small and rotated so they never read as the grid
    // they came from. Rides its own slow envelope so the fall outlasts the drop itself.
    if (uConfetti > 0.01) {
      vec2 cg = vec2(uv.x * 34.0, uv.y * 20.0);
      vec2 cid = floor(cg);
      float r1 = hash(cid), r2 = hash(cid + 3.7), r3 = hash(cid + 9.1);
      float fall = fract(r1 + uTime * (0.16 + r2 * 0.24));
      vec2 f = fract(cg) - vec2(0.5 + (r2 - 0.5) * 0.6, 1.0 - fall);
      float spin = uTime * (1.4 + r3 * 2.6) + r1 * 6.28;
      vec2 rf = vec2(f.x * cos(spin) - f.y * sin(spin), f.x * sin(spin) + f.y * cos(spin));
      // a thin flake: wide in one axis, nearly flat in the other, and it flickers edge-on
      float flake = step(abs(rf.x), 0.085) * step(abs(rf.y), 0.028 + 0.03 * abs(sin(spin)));
      vec3 gold = mix(vec3(1.0, 0.82, 0.35), uAccent, step(0.65, r3));
      col += gold * flake * uConfetti * (0.55 + uBeat * 0.4);
    }
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

    // (A crowd layer lived here as rim-lit heads. On screen it read as a row of pink arcs
    //  rather than people, so it's out — a fake crowd is worse than none over real footage.)

    // (A VHS pass lived here: head-switching band, tracking wobble, dropout streaks. Over
    //  photographic footage it just read as dirt on the screen, so it's out. The existing
    //  grain + scanlines below already carry the bootleg feel without the noise.)

    // grain (friction) + scanlines
    float grain = (hash(uv*uRes + uTime)-0.5)*(0.04+uFriction*0.42);
    col += grain;
    // Tape scanlines — absent at friction 0, heavy at 1. They were removed as a permanent
    // fixture because they read as dirt; as something the viewer dials in, they're the point.
    col -= sin(uv.y*uRes.y*0.85) * 0.05 * uFriction;
    // Chromatic fringe: the rig's red and blue pull apart, like a mistracked head.
    // GATED, because this evaluates the whole rig twice more — three times the beam maths per
    // pixel. Only past a quarter turn of the knob, and never on the phone tier, so the default
    // setting costs nothing and only someone deliberately cranking it pays for it.
    if (uQuality > 0.5 && uFriction > 0.25) {
      float fr = uFriction * 0.012;
      col.r += dot(rig(p + vec2(fr, 0.0), sweep, fan, uPattern), vec3(0.33)) * uFriction * 0.55;
      col.b += dot(rig(p - vec2(fr, 0.0), sweep, fan, uPattern), vec3(0.33)) * uFriction * 0.55;
    }

    // alpha = luminance so dark areas are transparent (footage shows through)
    // Hard ceiling on both brightness and alpha. Whatever the rig does, the footage underneath
    // must stay readable — "sometimes you can't see anything" is never an acceptable state.
    vec3 outc = min(max(col, 0.0), vec3(1.6));
    // Ceiling raised from 0.62: that cap was added to stop a white-out caused by light sources
    // sitting INSIDE the frame, which was fixed by moving every origin off-screen. Keeping it
    // that low was capping how intense a hero beam could ever get. The colour clamp below still
    // prevents a blow-out.
    float a = clamp(dot(outc, vec3(0.34,0.5,0.16))*1.25, 0.0, 0.80);
    gl_FragColor = vec4(outc, a);
  }
`
