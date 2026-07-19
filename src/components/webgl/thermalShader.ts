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
  uniform sampler2D uFreq;   // 1D spectrum (real FFT), sampled for the LED wall + lasers
  uniform float uFreqCount;

  // ---------- gold luxury palette ----------
  const vec3 GOLD_HI = vec3(1.0, 0.93, 0.66);
  const vec3 GOLD    = vec3(0.86, 0.66, 0.26);
  const vec3 GOLD_LO = vec3(0.45, 0.30, 0.08);
  const vec3 OXBLOOD = vec3(0.22, 0.03, 0.07);
  const vec3 NOIR    = vec3(0.035, 0.025, 0.02);
  const vec3 EMERALD = vec3(0.05, 0.55, 0.32);
  const vec3 CHAMP   = vec3(0.98, 0.92, 0.78);

  float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float hash1(float x){ return fract(sin(x*127.1)*43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
  }
  float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
  float spec(float x){ return texture2D(uFreq, vec2(clamp(x,0.0,1.0), 0.5)).r; }

  void main(){
    vec2 uv = vUv;
    float aspect = uRes.x/max(1.0,uRes.y);
    vec2 p = vec2((uv.x-0.5)*aspect, uv.y);      // centered, aspect-correct
    vec3 col = vec3(0.0);

    // ---- SKY: warm noir with a gold horizon glow behind the stage ----
    float horizon = 0.34;
    vec3 sky = mix(NOIR*0.7, OXBLOOD*0.9, smoothstep(1.0,horizon,uv.y));
    float glow = smoothstep(0.55,0.0,length(vec2(p.x, (uv.y-horizon)*1.6)));
    sky += GOLD*glow*(0.35+uLevel*0.7);
    sky += NOIR*0.5;
    col = sky;

    // ---- GOD-RAYS from the stage-top light ----
    vec2 lp = vec2(0.0, horizon+0.14);
    float ang = atan(p.y-lp.y, p.x-lp.x);
    float rays = pow(0.5+0.5*sin(ang*22.0), 6.0) * smoothstep(0.9,0.0,length(p-lp));
    col += GOLD_HI*rays*(0.10+uTreble*0.25);

    // ---- SEARCHLIGHTS sweeping the sky ----
    for(int i=0;i<4;i++){
      float fi=float(i);
      float base = (fi-1.5)*0.5;
      float sweep = base + sin(uTime*0.5 + fi*1.7)*0.5;
      vec2 dir = normalize(vec2(sin(sweep), cos(sweep)*0.8+0.4));
      float d = abs(dot(p-lp, vec2(dir.y,-dir.x)));
      float along = dot(p-lp, dir);
      float beam = smoothstep(0.05,0.0,d) * smoothstep(1.4,0.1,along) * step(0.0,along);
      col += mix(CHAMP, GOLD_HI, 0.5)*beam*(0.14+uTreble*0.3);
    }

    // ---- FIREWORKS bursts on the drops ----
    for(int i=0;i<3;i++){
      float fi=float(i);
      float t = uTime*0.6 + fi*3.3;
      float cyc = floor(t);
      vec2 fc = vec2((hash1(cyc+fi*7.0)-0.5)*aspect*0.9, 0.55+hash1(cyc*1.7+fi)*0.3);
      float life = fract(t);
      float r = length(p-fc);
      float ring = smoothstep(0.02,0.0,abs(r-life*0.4)) * (1.0-life);
      float sparks = pow(0.5+0.5*sin(atan(p.y-fc.y,p.x-fc.x)*40.0),8.0)*ring;
      col += mix(GOLD_HI,CHAMP,0.3)*(ring*0.6+sparks)*(0.4+uBeat);
    }

    // ---- STAGE: colossal dark trapezoid with a LIVE LED spectrum wall ----
    float stageTop = horizon+0.02;
    float halfW = mix(0.62, 0.30, smoothstep(0.0, stageTop, uv.y)); // perspective wings
    float inStage = step(abs(p.x), halfW) * step(uv.y, stageTop);
    // dark stage body
    col = mix(col, NOIR*0.25, inStage*0.96);
    // LED wall region
    float wallTop = stageTop; float wallBot = horizon-0.16;
    if(inStage>0.5 && uv.y>wallBot){
      float colx = (p.x/halfW)*0.5+0.5;            // 0..1 across wall
      float bins = 40.0;
      float bi = floor(colx*bins);
      float mag = spec(abs(bi/bins - 0.5)*2.0);    // mirror spectrum from center
      mag = pow(mag, 0.75);
      float barTop = wallBot + mag*(wallTop-wallBot);
      float gap = step(0.06, fract(colx*bins));
      float cell = step(0.12, fract((uv.y-wallBot)/0.02));
      if(uv.y < barTop){
        vec3 led = mix(EMERALD, GOLD_HI, mag);
        led = mix(led, vec3(1.0,0.2,0.5), step(0.9,mag)*0.5);
        col = mix(col, led*1.4, inStage*gap*cell);
      }
    }
    // gilded truss outline of the stage
    float edge = smoothstep(0.008,0.0,abs(abs(p.x)-halfW)) * step(uv.y,stageTop) * step(wallBot,uv.y);
    edge += smoothstep(0.008,0.0,abs(uv.y-stageTop))*step(abs(p.x),halfW);
    col += GOLD_HI*edge*(0.6+uBeat*0.4);

    // ---- LASER FANS from the truss ----
    vec2 tp = vec2(0.0, stageTop);
    for(int i=0;i<7;i++){
      float fi=float(i);
      float a = (fi-3.0)*0.16 + sin(uTime*1.3+fi)*0.05;
      vec2 dir = normalize(vec2(sin(a), -cos(a)));
      float d = abs(dot(p-tp, vec2(dir.y,-dir.x)));
      float along = dot(p-tp, dir);
      float lz = smoothstep(0.006,0.0,d)*step(0.0,along)*smoothstep(1.2,0.0,along);
      float m = spec(fi/7.0);
      vec3 lc = mix(GOLD_HI, EMERALD, fract(fi*0.37));
      lc = mix(lc, vec3(1.0,0.15,0.55), step(0.6,fract(fi*0.71))*0.6);
      col += lc*lz*(0.10+m*0.7+uBeat*0.4);
    }

    // ---- PYRO columns at the stage edges on the drop ----
    for(int s=-1;s<=1;s+=2){
      float ex = float(s)*halfW*0.86;
      float dx = abs(p.x-ex);
      float flame = smoothstep(0.05,0.0,dx) * smoothstep(0.0,0.5,uv.y-wallBot) * smoothstep(horizon+0.35, wallBot, uv.y);
      flame *= (0.4+fbm(vec2(p.x*20.0, uv.y*8.0-uTime*6.0)));
      col += mix(GOLD_HI, vec3(1.0,0.5,0.15), 0.5)*flame*uBeat*2.2;
    }

    // ---- CROWD: an ocean of silhouettes with phone-flashes ----
    if(uv.y < horizon){
      float depth = uv.y/horizon;                       // 0 front .. 1 back
      float density = mix(60.0, 200.0, depth);
      float bob = sin(uTime*6.0 + p.x*20.0)*0.004*(0.3+uBeat);
      float heads = step(0.55, fbm(vec2(p.x*density, (uv.y+bob)*density*0.5)));
      float silo = heads * (0.5+depth*0.5);
      col = mix(col, NOIR*0.15, silo*0.9);
      col += GOLD*silo*0.05*(1.0-depth);                // warm rim on the crowd
      // phone flashes twinkling
      float ph = step(0.995, hash(floor(vec2(p.x*140.0, uv.y*90.0)) + floor(uTime*3.0)));
      col += CHAMP*ph*(0.6);
    }

    // ---- GOLD CONFETTI drifting down ----
    for(int i=0;i<2;i++){
      float sc = 60.0+float(i)*40.0;
      vec2 gp = vec2(p.x*sc, (uv.y + uTime*(0.15+float(i)*0.1))*sc);
      vec2 id = floor(gp);
      float r = hash(id+float(i)*13.0);
      if(r>0.985){
        float d = length(fract(gp)-0.5);
        col += GOLD_HI*smoothstep(0.4,0.0,d)*(0.6+0.4*sin(uTime*10.0+r*30.0));
      }
    }

    // ---- STEAM / humidity haze ----
    float steam = fbm(vec2(uv.x*3.0, uv.y*2.0 - uTime*0.3));
    steam = smoothstep(0.5,1.0,steam)*uHumidity;
    col += CHAMP*steam*0.10;

    // ---- heat-haze warp near the cursor (you, dancing) ----
    vec2 m = uMouse; m.x=(m.x-0.5)*aspect;
    float md = length(p-m);
    col += GOLD*smoothstep(0.4,0.0,md)*(0.10+uBass*0.4)*uTemp;

    // ---- LIQUID-COOLING wash on dew point ----
    float water = smoothstep(0.0,0.6, fbm(vec2(uv.x*8.0, uv.y*3.0 - uTime*4.0)))*uDew;
    col = mix(col, vec3(0.7,0.9,1.0), water*0.4);

    // ---- overclock crisp cyan-gold rim ----
    col += mix(EMERALD, GOLD_HI, 0.5)*uOverclock*0.12*(0.5+0.5*sin(uTime*8.0));

    // ---- sauna mode: everything drips pinker & steamier ----
    col = mix(col, col*vec3(1.15,0.9,1.0)+CHAMP*0.05, uSauna*0.6);

    // ---- bloom-ish boost of the brightest bits ----
    float lum = dot(col, vec3(0.299,0.587,0.114));
    col += col*smoothstep(0.7,1.4,lum)*0.6;

    // ---- gold film grade + grain + vignette ----
    col = pow(col, vec3(0.92));                      // lift
    col *= mix(vec3(1.0), vec3(1.06,1.0,0.86), 0.5); // warm gold tint
    float grain = (hash(uv*uRes + uTime)-0.5)*(0.03+uFriction*0.16);
    col += grain;
    col -= sin(uv.y*uRes.y*1.2)*0.02*uFriction;      // scanlines with friction
    col *= smoothstep(1.25, 0.30, length(uv-0.5));   // vignette

    // Composite as a SCREEN-blend light layer over the Broadcast footage: dark areas
    // become transparent (video shows through), bright lights (lasers/pyro/LED/god-rays)
    // glow on top. A small base keeps a faint festival wash everywhere.
    vec3 outc = max(col, 0.0);
    float a = clamp(dot(outc, vec3(0.34, 0.5, 0.16)) * 1.2 + 0.08, 0.0, 1.0);
    gl_FragColor = vec4(outc, a);
  }
`
