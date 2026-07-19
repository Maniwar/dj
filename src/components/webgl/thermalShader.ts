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

    // thin sweeping laser streaks (magenta / acid-green / blue), beat-reactive
    for(int i=0;i<3;i++){
      float fi=float(i);
      float a = (fi-1.0)*0.5 + sin(uTime*(0.5+fi*0.2))*0.6;
      vec2 dir = vec2(cos(a), sin(a));
      float d = abs(dot(p, vec2(dir.y,-dir.x)));
      float streak = smoothstep(0.004, 0.0, d);
      vec3 lc = fi<0.5 ? vec3(1.0,0.12,0.56) : (fi<1.5 ? vec3(0.39,1.0,0.18) : vec3(0.08,0.88,1.0));
      col += lc * streak * (0.25 + uTreble*0.5 + uBeat*0.5);
    }
    // faint volumetric haze bloom that breathes with the level
    col += vec3(0.5,0.3,0.6) * fbm(uv*3.0 - uTime*0.05) * uLevel * 0.12;

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
