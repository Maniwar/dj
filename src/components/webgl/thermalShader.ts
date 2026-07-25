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
    float sweep = uBar * 6.2831853;
    float fan = 0.34 + uBuild*0.22 + uDown*0.16;   // rig opens up as the energy climbs
    for(int i=0;i<6;i++){
      float fi=float(i);
      float a = (fi-2.5)*fan + sin(sweep + fi*1.04)*(0.55 + uBuild*0.35);
      vec2 dir = vec2(cos(a), sin(a));
      float d = abs(dot(p, vec2(dir.y,-dir.x)));
      float w = 0.0030 + uBeat*0.012 + uBass*0.004 + uDrop*0.02; // fattens on the hit
      float streak = smoothstep(w, 0.0, d);
      vec3 lc = fi<0.5 ? vec3(1.0,0.12,0.56)
              : (fi<1.5 ? vec3(0.39,1.0,0.18)
              : (fi<2.5 ? vec3(0.08,0.88,1.0)
              : (fi<3.5 ? vec3(0.65,0.3,1.0)
              : (fi<4.5 ? vec3(1.0,0.12,0.56) : vec3(0.39,1.0,0.18)))));
      // Pull most beams toward the SECTION's colour so the rig belongs to whatever you're
      // reading — Kiki's pages go magenta, Dieter's cold blue, Ibiza sunrise gold. Alternating
      // beams keep their own hue so the fan still reads as multi-coloured rather than flat.
      lc = mix(lc, uAccent, mod(fi, 2.0) < 0.5 ? 0.78 : 0.30);
      col += lc * streak * (0.08 + uHat*0.5 + uBeat*1.25 + uBuild*0.5 + uDrop*1.6);
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
    // DROP = the whole room blows open
    col += vec3(1.0,0.55,0.9) * uDrop * 0.3 * (1.0 - r);

    // volumetric haze that breathes with the level, pulses on the kick, and THICKENS
    // through a build-up so the room feels like it's filling before the drop
    col += vec3(0.5,0.3,0.6) * fbm(uv*3.0 - uTime*0.05) * (uLevel*0.13 + uBeat*0.1 + uBuild*0.22);

    // CONDENSATION beading over the whole "lens" — the humidity signature
    float beads = droplets(uv, 0.04 + uHumidity*0.30);
    col += vec3(0.8,0.9,1.0) * beads * 0.35;

    // liquid-cooling wash on dew point
    float water = smoothstep(0.0,0.6, fbm(vec2(uv.x*8.0, uv.y*3.0 - uTime*4.0)))*uDew;
    col += vec3(0.6,0.85,1.0) * water * 0.5;

    // overclock shimmer
    col += vec3(0.4,1.0,0.6) * uOverclock * 0.1 * (0.5+0.5*sin(uTime*8.0));

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
