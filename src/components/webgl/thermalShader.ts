// THERMAL RUNAWAY — full-viewport humidity/heat simulation shader.
// Bass heats the rig; humidity nucleates condensation beads that run down the glass;
// crossing the dew point triggers a liquid-cooling wash. Fed by the AudioBus each frame.

export const thermalVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // bypass projection -> always fills the clip space (camera-independent)
    gl_Position = vec4(position.xy, 0.0, 1.0);
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
  uniform float uTemp;      // 0..1 normalized temperature
  uniform float uHumidity;  // 0..1
  uniform float uDew;       // 0..1 meltdown / liquid-cooling wash
  uniform float uOverclock; // 0..1 reward window
  uniform float uFriction;  // 0..1

  // --- hash / noise / fbm ---
  float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i+vec2(1.,0.));
    float c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
    vec2 u = f*f*(3.-2.*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  // condensation droplets: hashed cells, each with a bead that drips downward.
  float droplets(vec2 uv, float density){
    float acc = 0.0;
    float scale = 14.0;
    for(int layer=0; layer<2; layer++){
      float s = scale * (1.0 + float(layer)*0.9);
      vec2 gv = uv * s;
      vec2 id = floor(gv);
      vec2 f  = fract(gv) - 0.5;
      float rnd = hash(id + float(layer)*31.7);
      if(rnd > 1.0 - density){
        // slow downward drift so beads "run"
        float drip = fract(uTime*0.05 + rnd*7.0);
        vec2 center = vec2((rnd-0.5)*0.5, 0.5 - drip);
        float d = length(f - center);
        float bead = smoothstep(0.16, 0.0, d);
        // a little tail above the bead
        float tail = smoothstep(0.05,0.0,abs(f.x-center.x)) * smoothstep(0.0,0.4,center.y - f.y) * 0.4;
        acc += bead + tail*bead;
      }
    }
    return clamp(acc, 0.0, 1.0);
  }

  void main(){
    vec2 uv = vUv;
    float aspect = uRes.x / max(1.0, uRes.y);
    vec2 auv = vec2(uv.x*aspect, uv.y);

    // heat-haze: displace sampling by rising noise, stronger when hot / loud
    float haze = fbm(auv*3.0 + vec2(0.0, -uTime*0.25));
    vec2 warp = vec2(
      fbm(auv*4.0 + uTime*0.15) - 0.5,
      fbm(auv*4.0 - uTime*0.2 + 5.0) - 0.5
    ) * (0.02 + uTemp*0.06 + uBass*0.05);
    vec2 suv = uv + warp;

    // base club gradient — deep violet -> magenta, breathing with level
    vec3 cool = vec3(0.03, 0.01, 0.09);
    vec3 hot  = vec3(0.55, 0.03, 0.35);
    vec3 base = mix(cool, hot, pow(suv.y, 1.4) * (0.5 + uTemp*0.9));
    base += vec3(0.15,0.02,0.25) * uLevel;

    // rising steam
    float steam = fbm(vec2(suv.x*3.0, suv.y*2.0 - uTime*0.3));
    steam = smoothstep(0.45, 1.0, steam) * uHumidity;
    base += vec3(0.8,0.85,0.95) * steam * 0.12;

    // laser streaks reacting to treble + beat
    float lasers = 0.0;
    for(int i=0;i<3;i++){
      float fi = float(i);
      float ang = 0.6 + fi*0.5;
      float line = abs(sin((suv.x*cos(ang)+suv.y*sin(ang))*40.0 + uTime*(1.0+fi) ));
      lasers += smoothstep(0.98, 1.0, line);
    }
    vec3 laserCol = mix(vec3(0.1,1.0,0.3), vec3(1.0,0.1,0.8), 0.5+0.5*sin(uTime));
    base += laserCol * lasers * (0.15 + uTreble*0.6 + uBeat*0.5);

    // heat glow toward the cursor (you dancing = local hotspot)
    vec2 m = uMouse; m.x *= aspect;
    float md = length(auv - m);
    base += hot * smoothstep(0.5, 0.0, md) * (0.15 + uBass*0.5) * uTemp;

    // condensation beads over everything
    float beads = droplets(uv, 0.05 + uHumidity*0.35);
    // beads refract: brighten edges, darken centers -> glassy
    base = mix(base, base*1.6 + 0.15, beads*0.7);

    // LIQUID-COOLING WASH (dew point hit): a bright sheet falling from the top
    float sheet = smoothstep(0.0, 0.3, uDew) * smoothstep(uv.y+ (1.0-uDew), uv.y+1.0, 1.0);
    float water = smoothstep(0.0,0.6, fbm(vec2(uv.x*8.0, uv.y*3.0 - uTime*4.0))) * uDew;
    base = mix(base, vec3(0.7,0.95,1.0), water*0.5 + sheet*0.4);

    // overclock reward: crisp cyan rim boost
    base += vec3(0.2,0.9,1.0) * uOverclock * 0.12 * (0.5+0.5*sin(uTime*8.0));

    // friction grain + scanlines
    float grain = (hash(uv*uRes + uTime) - 0.5) * (0.04 + uFriction*0.18);
    base += grain;
    float scan = sin(uv.y*uRes.y*1.2) * 0.02 * uFriction;
    base -= scan;

    // vignette
    float vig = smoothstep(1.1, 0.35, length(uv-0.5));
    base *= vig;

    gl_FragColor = vec4(base, 1.0);
  }
`
