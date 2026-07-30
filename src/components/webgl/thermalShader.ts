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
  // The canvas renders BELOW display resolution by design (PIXEL_BUDGET in ThermalRunaway), so
  // anything sized in "pixels" has to know which pixels it means. uRes is CANVAS pixels; multiply a
  // display-pixel size by uPxScale to get canvas pixels.
  uniform float uPxScale;
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
  uniform float uIntensity; // master dial, 0..1.4 (1.0 = the site as tuned)
  uniform float uSauna;
  uniform sampler2D uFreq;
  // THE FOOTAGE, as a texture, so water can actually bend it. This is the one thing the rig could
  // never do: it composites with mix-blend-mode: screen over a DOM <video>, so it can add light but
  // has no idea what is underneath. Handed the same video element as a THREE.VideoTexture -- the same
  // decoded frames, no second decoder -- the droplets can sample what is behind them and displace it.
  // uRefract is 0 whenever there is nothing to sample (stills, video switched off) or when the effect
  // is retired by the dial or the registry, and the two samples below are skipped entirely.
  uniform sampler2D uBackdrop;
  uniform float uRefract;
  // THE CURSOR, AS LIGHT IN THE ROOM. The trail and the click burst are DOM elements -- .glow-trail
  // and .click-burst -- drawn far above this canvas, so nothing in the rig could ever react to them:
  // move the pointer over a droplet and it stayed dark. These carry the same gesture into the shader
  // as actual light, so the water, the confetti and the dust answer to it. The DOM versions stay as
  // the crisp foreground cursor; this is the room responding, not a copy of them.
  uniform vec2  uTrail[8];   // recent pointer positions, 0 = newest
  uniform vec2  uClickPos;
  uniform float uClickAge;   // seconds since the last click, large when there has not been one
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
  // CONDENSATION BEADS, AND WHY THEY USED TO READ AS STATIC.
  //
  // Reported as "milky static crap ... doesn't look like water or dew", which was exactly right and
  // is a matter of SCALE, not strength. The grids were 46 and 85 cells across with a bead radius of
  // 0.085 OF A CELL -- so 0.085/46 of the screen, about two pixels, and the second layer about one.
  // At the humidities this actually runs at, density reaches ~0.28, which put on the order of 2,600
  // one-to-two-pixel pale dots over the frame. Nothing that small can read as a droplet; it reads as
  // sensor noise, and stacked on the film grain it read as a milky veil.
  //
  // Three changes, all about making a bead look like a bead:
  //   SCALE. 18 and 30 cells instead of 46 and 85, with radius 0.16-0.26 of a cell, so a bead is
  //     ~1% of screen width -- roughly 12px at 1200px, which is the size real condensation appears
  //     at on a lens. Big enough to have a shape.
  //   COUNT. Density falls from 0.04+0.30*h to 0.02+0.12*h. Around 140 beads instead of 2,600.
  //     Condensation is discrete drops on glass, not a field.
  //   FORM. A drop is a LENS, not a dot: bright rim where it refracts, darker through the middle.
  //     That is the whole difference between "water" and "speckle", and it costs one extra
  //     smoothstep. The body is kept faint and the rim carries the read.
  // Forward declaration: droplets() asks this whether a runner has swept a bead, but the runner
  // maths lives below it and GLSL requires a symbol to be declared before it is used.
  float runnerHeadY(float uvx, float layer, float amount, out float lane);

  float droplets(vec2 uv, float aspect, float density, float runAmount,
                 float ry0, float lane0, float ry1, float lane1, out vec2 disp){
    float acc=0.0;
    disp=vec2(0.0);
    for(int layer=0; layer<2; layer++){
      // THE SECOND LAYER IS THE ONE THAT GETS DROPPED ON WEAK HARDWARE, not the whole effect.
      // Beads used to be skipped outright once uQuality fell -- and uQuality is 0 as soon as the perf
      // tier reaches 2, which is ONE-WAY by design, so after two slow-frame strikes the condensation
      // vanished for the rest of the session and never came back. Reported exactly that way: the drops
      // come on at first, disappear, and never repeat.
      // Half the beads at half the cost is the right trade, and it matches the rule the rest of this
      // project runs on: the floor is allowed to be cheaper, never empty. Branching on a uniform is
      // coherent across every pixel, so the GPU genuinely skips this layer rather than executing both
      // sides of it.
      if(layer == 1 && uQuality < 0.5) continue;
      float s = 18.0*(1.0+float(layer)*0.65);
      vec2 gv=uv*s; vec2 id=floor(gv); vec2 f=fract(gv)-0.5;
      float rnd=hash(id+float(layer)*31.7);
      // A SOFT PRESENCE RAMP, not a binary test. the old if (rnd > 1.0 - density) is a hard threshold, and
      // the fog cycle moves density continuously -- so as the lens dried, each bead's hash crossed
      // the line and it popped out of existence in a single frame. Reported as "droplets just blink
      // away instead of fading and evaporating", which is precisely what a step function does when you
      // sweep it. Now a bead near the threshold FADES as the glass dries, over a 0.12-wide band of
      // density. The early-out is kept so beads that are fully absent still cost nothing.
      float pres = smoothstep(1.0 - density, 1.0 - density + 0.12, rnd);
      if(pres > 0.002){
        // A SECOND, INDEPENDENT HASH FOR SIZE. Deriving radius from rnd tied a bead's size to
        // whether it existed at all, so every bead in a layer landed in the same narrow band and the
        // field read as one repeated ring rather than as condensation. Squared, so the distribution
        // is mostly small beads with a few large ones -- which is how water actually beads on glass.
        float rnd2 = hash(id*1.7 + float(layer)*11.3 + 4.2);
        // A BEAD HAS A LIFE, and this is what was missing: drip only moved it within its cell and
        // wrapped, so a bead once formed was drawn forever. Reported as "they just stay there the whole
        // time and don't disappear ever". Condensation forms, sits, and evaporates -- and then that
        // patch of glass is dry for a while before it beads again.
        // Phases across one cycle: form over the first 8%, hold to 42%, evaporate to 72%, then ABSENT
        // for the last 28%. The phase offset is per-bead (rnd), so neighbours are at different points
        // in their lives rather than the whole field pulsing together.
        float drip=fract(uTime*0.04+rnd*7.0);
        // A LONGER, GENTLER EVAPORATION. The hold used to end at 0.42 and the bead was gone by 0.72;
        // it now holds to 0.34 and takes until 0.80 to vanish -- about 11.5s of a 25s cycle spent
        // visibly drying rather than 7.5s.
        // SIZE AND BRIGHTNESS ARE SEPARATE CURVES, which is what "get smaller and then fade away"
        // actually requires. Driving both off one envelope meant they hit zero together, and since a
        // typical bead is only about 9px across, scaling it to 18% put it at 1.7px -- SUB-PIXEL, where
        // it can only pop. That is the blink: not a missing fade, a shape too small to still be a
        // shape by the time the fade got going.
        // bLife is the shrink and it bottoms out at 55%, so a bead stays resolvable the whole way.
        // bFade is the brightness and it runs LATER and LONGER, so the sequence reads as: hold, get
        // noticeably smaller, then dim away at a size you can still see.
        float bLife = smoothstep(0.0, 0.10, drip) * smoothstep(0.72, 0.30, drip);
        float bFade = smoothstep(0.0, 0.08, drip) * smoothstep(0.94, 0.44, drip);
        // and it SHRINKS as it goes, because an evaporating drop gets smaller, it does not just dim.
        // Down to 0.18 rather than 0.45, so it visibly dwindles to almost nothing before it is gone.
        float bShrink = 0.55 + 0.45*bLife;
        vec2 c=vec2((rnd-0.5)*0.30, 0.32-drip*0.64); // stays clear of the cell edge
        // ISOTROPIC DISTANCE. gv = uv*s makes each cell (uRes.x/s) x (uRes.y/s) PIXELS, which is not
        // square -- 36x23 at a 660x420 render -- so length(f-c) was measuring in a stretched space and
        // every bead came out a squashed ellipse. Scaling x by the aspect makes the metric match
        // pixels, so a drop is round. Same fault the confetti had, fixed there and missed here.
        float d=length((f-c)*vec2(aspect,1.0));
        // Floored PER LAYER, in pixels. The radius is in cell units and the two layers have different
        // cell sizes, so one fixed minimum cannot serve both: at grid 18 a 0.055 radius is 2.8 canvas
        // px, but on the finer grid the same number is 1.7 px and the smallest beads aliased away.
        // 2.2*s/uRes.y is 2.2 canvas pixels expressed in THIS layer's cell units.
        // The pixel floor applies to the bead's FULL size, and the shrink is allowed to take it below
        // that on the way out. Flooring the shrunk value instead pinned every evaporating bead at
        // 2.2px and it stopped shrinking -- so it dimmed at a fixed size, which is not what drying
        // looks like. Going sub-pixel is fine here because bLife is fading it out at the same time.
        // Minimum raised 0.055 -> 0.085: at 18 cells over 1363px a cell is 76px, so 0.055 was a 4px
        // bead with nowhere to shrink to. 0.085 is ~6.5px at full size and ~3.6px shrunk, which stays
        // visible while it dims.
        // MUCH SMALLER. At 0.105-0.32 of a cell, and a cell being uRes.y/18 (76px at 1363), these
        // were 16 to 50 PIXELS ACROSS. Nothing that size reads as condensation -- it reads as bubbles,
        // which is exactly what was reported, twice. The rim/body balance was only half the problem;
        // the other half is that a 40px sphere with a bright edge IS a bubble however it is shaded.
        // Real lens condensation is fine: 0.038-0.115 of a cell puts these at 6 to 17px, and the
        // density below is raised so the glass is no less wet for it.
        // BEADS WERE 1-2 PIXELS. These radii are in CELL units and the grid is 18 cells across the
        // frame, so 0.038 of a cell is 0.002 of screen height -- about 1.4px on a 682px frame, a dot
        // rather than a drop. Rendered side by side they read as faint specks, not condensation.
        // 2.5x puts the range at roughly 3.5-11px: small beads still dominate (the term is squared),
        // but the big ones are now large enough to show their rim and specular, which is what makes
        // them look like water instead of noise. Still inside the cell -- max is 0.285 of a 0.5
        // half-cell -- so neighbouring beads do not overlap and the grid stays hidden.
        float radFull = max(0.095 + rnd2*rnd2*0.19, 2.2 * s / max(uRes.y, 1.0));
        float rad = radFull * bShrink;
        // A drop is a lens: it refracts at the edge and is nearly clear through the middle. The rim
        // carries the read and is deliberately SOFT -- a hard ring reads as a bubble outline, which
        // is what the first attempt at this looked like.
        // EDGES AT PIXEL SCALE, not at a fraction of the shape. This is what read as soft, and it is
        // independent of render scale: the body used to fade from rad to rad*0.35, i.e. over 65% of
        // its own radius -- a 28px bead with an 18px gradient is a smudge, however many pixels it is
        // drawn with. Same for the rim, which spanned rad*1.06 down to rad*0.40. A real drop has a
        // hard boundary; what is soft about it is the refraction inside, not the outline.
        // epx is 2 canvas pixels in THIS layer's cell units, so both edges are 2px wherever they land.
        // SOFT AGAIN, deliberately. These were given 2px pixel-scale edges in the same pass as the
        // laser cores, on the theory that "everything looks soft" applied to everything. It does not:
        // a hard-edged bright shape does not read as water, it reads as a white sticker, and the
        // running drops in particular came back as harsh streaks. Water's OUTLINE is defined but its
        // interior is a lens -- the softness is the whole point. Only the lasers wanted sharpening.
        // A DROP, NOT A RING. The rim used to carry 0.85 against a body of 0.16 -- five times the
        // weight -- so each bead rendered as an outline and the field read as soap bubbles rather than
        // condensation. Water on glass is a filled lens: a soft body, a brighter edge where it
        // refracts, and a small hard SPECULAR where the light source catches it. That specular is the
        // single thing that makes a blob read as wet, and it was missing entirely.
        // FILLED, NOT OUTLINED. The rim carried 0.46 against a body of 0.34 -- the outline outweighed
        // the fill, which is precisely what a soap bubble looks like, and is what "the droplets kind
        // of look like bubbles" was pointing at. A drop of water on glass is a solid little lens with
        // a bright edge, not a ring: the body now dominates and the rim is a highlight on it rather
        // than the thing you mostly see.
        float body = smoothstep(rad, rad*0.20, d) * 0.62;
        float rim  = (smoothstep(rad*1.03, rad*0.86, d) - smoothstep(rad*0.86, rad*0.62, d)) * 0.20;
        // Offset up-left, consistent for every bead, because one room has one key light.
        // THE HIGHLIGHT BELONGS AT THE BOTTOM. It sat at (-0.30, +0.30) -- upper left, lit like a
        // sphere -- which is what made these read as bubbles once they were big enough to see. A drop
        // on vertical glass is not a ball: it is a lens held by surface tension, thickest at the
        // bottom where gravity pools it, so that is where light concentrates and where the bright
        // spot sits. Smaller and tighter too, since a flatter surface makes a smaller caustic.
        float spec = smoothstep(rad*0.26, 0.0, length(((f - c) - vec2(-0.10, -0.34)*rad)*vec2(aspect,1.0))) * 0.80;
        // ABSORBED BY A PASSING RUNNER. The bead's own uv is (id + 0.5 + c)/s; if the runner in that
        // column is now BELOW it and the bead sits inside its lane, that water has already been swept
        // up. Faded over a short distance rather than cut, so a bead is taken as the drop arrives
        // instead of blinking off ahead of it.
        // The runner state is passed IN, not re-derived here. This block used to call runnerHeadY
        // twice, inside a loop that runs twice -- four calls of five hashes each, i.e. twenty extra
        // hashes per pixel, inside a divergent branch. That is what pushed a machine that had been
        // rendering at native down to tier 3 and half resolution, which is one-way for the session:
        // the rig went soft and the frame counter still read 59fps, because the tier system had
        // bought that back by throwing away pixels.
        // Hoisting costs nothing in accuracy: beads are 6-17px and the runner columns are 126-218px
        // wide, so evaluating at the pixel rather than at the bead's cell centre picks the same
        // column every time.
        vec2 buv = (id + 0.5 + c) / s;
        // ABSORBED AS THE DROP ARRIVES, not after it has gone past. The window used to be
        // smoothstep(0.02, -0.03, ...), i.e. the bead only began to go once the head was already
        // BELOW it -- so for the frames where they crossed, both were drawn on top of one another and
        // it read as a streak sliding over a bead rather than taking it. Reported exactly that way.
        // Now the fade starts while the head is still 0.07 above the bead and is complete by the time
        // it arrives, so the bead is gone INTO the drop rather than behind it.
        float swept =
            smoothstep(0.07, 0.005, ry0 - buv.y) * step(abs(fract(buv.x*11.0) - 0.5), lane0*11.0)
          + smoothstep(0.07, 0.005, ry1 - buv.y) * step(abs(fract(buv.x*19.0) - 0.5), lane1*19.0);
        float taken = clamp(swept, 0.0, 1.0);
        // THE MOMENT OF MERGING, which was missing. Fading a bead out as the drop arrives is correct
        // but invisible -- it looks like the bead happened to dry just then. Real coalescence is
        // sudden and bright: surface tension snaps the bead into the runner. So the instant it is
        // being taken, it FLARES. taken*(1-taken) peaks at the halfway point and is zero at both
        // ends, so the flash exists only during the transition and cannot leave a permanent mark.
        float merge = taken * (1.0 - taken) * 4.0;
        acc += (body + max(rim, 0.0) + spec) * bFade * pres * (1.0 - taken)
             + (body + spec) * bFade * pres * merge * 1.6;
        // LENS DISPLACEMENT. A drop is a converging lens: the further off its axis you look, the more
        // it bends, and it inverts -- so the offset points back toward the centre and grows with
        // distance from it. Accumulated rather than sampled here, so the whole field costs ONE pair of
        // texture reads per pixel further down instead of one per bead.
        // The mask is INSIDE-ness, not centre-ness. A first attempt used smoothstep(rad, rad*0.15, d),
        // which peaks at the drop's centre -- exactly where (f - c) is near zero -- and falls off at the
        // rim, where the bending should be strongest. The two cancelled and the whole effect measured
        // as 0.01 points of light. A lens bends most at its edge: (f - c) already supplies that
        // gradient, so the mask only has to say whether we are in the drop at all.
        float inside = smoothstep(rad, rad*0.86, d);
        disp += -(f - c) / s * inside * bFade * pres * (1.0 - taken) * 3.2;
      }
    }
    return clamp(acc,0.0,1.0);
  }

  // ---- HAS A RUNNER ALREADY SWEPT THIS SPOT? ----
  // A running drop that meets a clinging bead absorbs it and gets heavier -- which is most of what
  // makes real water on glass look alive. A fragment shader cannot simulate that: there is no state
  // between frames, so nothing can remember which beads have been eaten.
  //
  // It does not need to. Both are DETERMINISTIC functions of position and time -- the same column id
  // and the same clock produce the same runner every frame on every machine -- so a bead can ask
  // analytically "where is the runner in my column right now, and has it passed me?" and answer
  // without any accumulation at all. This re-derives one column's runner with the identical maths
  // used to draw it; the two cannot disagree because they are the same expressions.
  //
  // Returns the head's uv.y, and writes the lane half-width. A column with no runner returns 2.0,
  // i.e. above everything, so nothing is ever absorbed by a drop that does not exist.
  float runnerHeadY(float uvx, float layer, float amount, out float lane){
    float cols = 11.0 + layer*8.0;
    float id = floor(uvx*cols);
    float rnd = hash(vec2(id, layer*17.3));
    lane = 0.0;
    if(rnd <= 1.0 - amount) return 2.0;
    float rnd2 = hash(vec2(id*1.37 + 5.1, layer*7.9));
    float rnd3 = hash(vec2(id*2.11 + 13.7, layer*23.1));
    float sz = (0.55 + rnd3*rnd3*1.10) * (1.0 - layer*0.42);
    float speed = (0.05 + rnd2*0.09) * (0.70 + sz*0.45);
    float t = fract(rnd*4.7 + uTime*speed);
    float fall = 1.0 - (1.0 - t)*(1.0 - t);
    // The swept lane is the drop's own width, not the column's. At 0.055 this came out as roughly
    // 0.6 of a half-column, so a runner cleared nearly everything either side of it -- beads
    // disappeared in places the drop never went, which reads as random vanishing rather than as
    // something being picked up.
    // The lane has to be as wide as the drop VISIBLY is, or beads sitting under the head survive it
    // and you watch a runner pass straight over them -- which is what "they run over them and they
    // overlap" describes. The head is 0.085*sz*mass in ox units, i.e. 0.0051*sz*mass of the frame
    // width; the lane matches that with margin so anything the water touches is taken.
    float fallNow = 1.0 - (1.0 - t)*(1.0 - t);
    float massNow = 0.60 + fallNow * 1.60;
    lane = 0.016 * sz * massNow;
    return 1.08 - fall*1.00;
  }

  // ---- WATER RUNNING DOWN THE GLASS ----
  // Condensation does two things and the shader only ever did one of them. Beads CLING, and once a
  // bead gets heavy enough it BREAKS LOOSE and runs, clearing a wet track behind it. Without the
  // second half there is nothing to read as water -- which is why a static field of dots, at any
  // size, kept reading as noise.
  //
  // ONE CONSTRAINT SHAPES ALL OF THIS: the layer composites with mix-blend-mode: screen, so it can
  // only ADD light. It cannot refract the footage and it cannot darken, which is how a real droplet
  // mostly announces itself. So each runner is built from the two things that ARE additive on a dark
  // scene: a bright specular head where the light catches the meniscus, and a thin bright track above
  // it where the glass is wet. That is what you actually see of rain on a window at night.
  //
  // Columns rather than a square grid, because water runs in lanes. Two passes at different column
  // counts so the sizes vary without a second grid becoming visible.
  float runners(vec2 uv, float amount, float bigY, float bigLane, out vec2 disp){
    float acc = 0.0;
    disp = vec2(0.0);
    for(int c=0; c<2; c++){
      float cols = 11.0 + float(c)*8.0;
      float x = uv.x * cols;
      float id = floor(x);
      float fx = fract(x) - 0.5;
      float rnd  = hash(vec2(id, float(c)*17.3));
      float rnd2 = hash(vec2(id*1.37 + 5.1, float(c)*7.9));
      // SIZE, from its own hash. Every drop was the same size, which reads as a repeating pattern
      // rather than water -- and the cause was not just the missing randomisation. ox is normalised by
      // max(cols*0.06, 0.35), which CANCELS the column count out of the head radius entirely: the
      // head worked out to 0.085*0.06*screenWidth regardless of cols, so both layers drew identical
      // drops and adding a second layer bought nothing. Squared, so most drops are small and a few
      // are fat, which is how water beads; and an explicit per-layer scale so the two passes are
      // genuinely different calibres now that cols no longer does it.
      float rnd3 = hash(vec2(id*2.11 + 13.7, float(c)*23.1));
      float layerScale = 1.0 - float(c)*0.42;
      float sz = (0.55 + rnd3*rnd3*1.10) * layerScale;
      // A SOFT PRESENCE RAMP, the same fix the beads needed and the runners never got. This was
      // if(rnd > 1.0 - amount), a hard threshold -- and amount is driven by the fog cycle, so as the
      // lens dries every runner whose hash sits near the line switches off in the same frame. Reported
      // as "sometimes i see runners disappear all at once", which is precisely what a step function
      // does when you sweep it. Ramped over a 0.14 band, a runner near the edge of the density thins
      // out over several seconds instead, and because the band is wider than the fog cycle moves in one
      // run, a drop that has started is still there to finish.
      float rpres = smoothstep(1.0 - amount, 1.0 - amount + 0.14, rnd);
      if(rpres > 0.003){
        // t accelerates: a drop starts slow, gains speed as it gathers mass on the way down.
        // A FAT DROP FALLS FASTER, because it is heavier -- so size and speed are correlated rather
        // than independent, which is what stops the variety looking arbitrary.
        float speed = (0.05 + rnd2*0.09) * (0.70 + sz*0.45);
        float t = fract(uTime*speed + rnd*4.7);
        float fall = 1.0 - (1.0 - t)*(1.0 - t);   // ease-in, i.e. accelerating downward
        // Tuned so the head reaches the bottom edge at about t=0.88 and is just clear of it by t=1.0.
        // The ease-in means 94% of the journey is done by 75% of the time -- that acceleration is the
        // point -- so the constants have to be set against the CURVE, not against the endpoints: an
        // earlier attempt at 1.32 put the drop off-screen by t=0.70 and wasted a third of every run.
        float y = uv.y - (1.02 - fall*1.035);     // enters just above the frame, exits just below it

        // RUNNERS MERGE INTO EACH OTHER TOO. The two passes are computed independently, so a fine
        // stream and a heavy one could occupy the same lane and simply draw over one another --
        // reported as runners overlapping without merging. Rivulets do not do that: where two paths
        // converge, the smaller joins the larger and stops existing as a separate stream.
        // The finer pass (c == 1) asks the heavy pass where its runner in this column is, using the
        // same runnerHeadY() the beads use, and fades out as the two converge. One-directional on
        // purpose: the heavy stream is the one that survives, which is both the physical answer and
        // the one that avoids two drops each concluding the other should disappear.
        float merged = 1.0;
        if (c == 1) {
          // bigY/bigLane are passed in, not re-derived. This called runnerHeadY once per inner
          // iteration -- three more calls of five hashes each per pixel -- and it is the same
          // layer-0 lookup the bead absorption already needs, so it was being computed twice over
          // for no reason. Between this and the bead hoist, 25 hashes per pixel come back.
          float lanes = smoothstep(0.09, 0.02, abs(fract(uv.x*11.0) - 0.5) / 11.0);
          float near  = smoothstep(0.18, 0.0, abs(bigY - (uv.y - y)));
          merged = 1.0 - lanes * near * 0.92;
        }

        // LIFE ENVELOPE, and it is the fix for "the water just disappears into nothing randomly".
        // t is a fract(), so at the wrap the drop teleported from the bottom of its run back to the
        // top and its entire trail vanished in a single frame -- while the trail was still at 35%
        // brightness, so it was a hard cut, not an exit. This ramps a runner up as it enters and back
        // to ZERO before the wrap, so nothing ever blinks out mid-frame: it runs off and fades.
        // FADES BEFORE IT LEAVES, which it did not before: the head crosses the bottom of the frame
        // at about t=0.74, and the fade did not start until 0.80 -- so the drop simply exited and the
        // envelope was fading something already off-screen. Reported as "just leaves the screen
        // suddenly", and that is what it was doing. The fade now runs 0.60 -> 0.93, which is while the
        // head is still in the lower part of the picture, so a runner thins out and dissipates on the
        // glass instead of sliding off the edge.
        // A RUNNER LEAVES BY RUNNING OFF, never by fading out in the middle of the glass. This was
        // 0.93 -> 0.60, which starts dimming while the head is still 24% up the frame -- reported as
        // "sometimes runners disappear before they run off the screen", and it was a correction that
        // over-shot: the original fault was the opposite, a drop that vanished by exiting before its
        // fade began. The fall now carries the head clear of the bottom edge (below), and the envelope
        // only closes over the last 6% of the cycle, by which point it is already off-screen. So the
        // fade exists to prevent a pop at the wrap, not to remove a drop you can still see.
        float life = smoothstep(0.0, 0.07, t) * smoothstep(1.0, 0.94, t);

        // the track wanders -- water follows the imperfections in the glass, it does not fall straight
        float wob = sin((uv.y + rnd*6.283)*17.0)*0.010 + sin((uv.y + rnd2*4.0)*41.0)*0.004;
        float ox = (fx + wob) / max(cols*0.06, 0.35);
        // HEAD: the bead itself, slightly taller than wide because it is being pulled.
        // Floored at 2 canvas px in ox units -- one ox unit spans cols*0.06 of the frame width, so a
        // pixel is (1/uRes.x)/(cols*0.06) in these units.
        float oxPx = (1.0/max(uRes.x,1.0)) / max(cols*0.06, 0.35);
        // MASS ACCUMULATES ON THE WAY DOWN. A drop running over wet glass sweeps up what it crosses
        // and gets heavier, which is why real runners start as a bead and arrive at the bottom as a
        // fat one. fall is how far it has travelled, so the head grows 0.75x -> 1.55x across its
        // run. It also already falls faster as it goes (the ease-in on t), so the two compound the way
        // they do physically: heavier, therefore quicker.
        // 0.6x -> 2.2x across the run. The previous 0.75 -> 1.55 was a 2x diameter change spread over
        // the whole fall, which is real but not legible; a drop that arrives at the bottom visibly
        // fatter than it started is the whole point of the merge.
        float mass = 0.60 + fall * 1.60;
        float hr = max(0.085 * sz * mass, oxPx*2.0);
        // A RUNNER HEAD IS A BEAD THAT IS MOVING, and it has to be built like one. It used to be a
        // single soft blob -- smoothstep(hr, hr*0.30, ...) -- with none of the lens treatment the
        // clinging beads get, so runners and beads read as two different substances. That is why the
        // merging never registered: you cannot see one thing absorb another when they do not look
        // like the same thing. Body, refractive rim and a specular in the same up-left key light as
        // droplets() uses, so a runner is recognisably a drop, just a heavier one that is travelling.
        vec2 hq = vec2(ox, y*0.62);
        float hd = length(hq);
        float hBody = smoothstep(hr, hr*0.22, hd) * 0.80;
        float hRim  = (smoothstep(hr*1.02, hr*0.84, hd) - smoothstep(hr*0.84, hr*0.60, hd)) * 0.28;
        float hSpec = smoothstep(hr*0.30, 0.0, length(hq - vec2(-0.28, 0.30)*hr)) * 0.95;
        float head = hBody + max(hRim, 0.0) + hSpec;
        // TRACK: wet glass BEHIND the head, i.e. above it, evaporating as it ages.
        // The old version used smoothstep(-0.01, 0.16, y), which RISES with y -- so the trail was
        // brightest at its oldest end and faded toward the drop, backwards. Now a sharp mask keeps it
        // behind the head and an exponential decay evaporates it with distance, which is why a real
        // trail is a tail rather than a full-height line.
        float behind = smoothstep(-0.005, 0.028, y);
        float dry = exp(-max(y, 0.0) * 3.4);
        // The track scales with the drop but less than proportionally -- a fat drop leaves a wider
        // wet path, not a proportionally wider one. Floored at 2 canvas px like the head.
        float tw = max(0.030 * (0.60 + sz*0.40) * (0.85 + mass*0.35), oxPx*2.0);
        float track = smoothstep(tw, tw*0.25, abs(ox)) * behind * dry;
        // a couple of stragglers left along the track, so it is not a clean line
        float bead = smoothstep(tw, tw*0.30, length(vec2(ox, fract(y*7.0 + rnd*3.0) - 0.5)*vec2(1.0,0.55)));
        acc += (head + track*0.55 + bead*behind*dry*0.30) * life * rpres * merged;
        // A running drop lenses too, mostly across its width -- it is a cylinder of water, so it bends
        // horizontally far more than vertically. Scaled into uv by the column count.
        float rl = smoothstep(hr, hr*0.88, length(vec2(ox, y*0.62)));
        disp += vec2(-ox / cols * 0.26, -y * 0.10) * rl * life * rpres * merged * 2.4;
      }
    }
    return acc;
  }

  // ---- CONFETTI ----
  // The old version had three faults and all three are visible at a glance.
  //
  //   IT COULD NOT FALL. The flake position was fract(cg) - vec2(cx, 1.0 - fall), i.e. an offset
  //   INSIDE its own grid cell. With 20 rows a flake travelled one twentieth of the screen height and
  //   then wrapped, so it jiggled inside a 5%-tall box forever. Reported exactly: "it just kind of
  //   twists in place, shouldnt it be falling down".
  //
  //   IT WAS A LATTICE. There was no density test, so every one of the 34x20 = 680 cells held a
  //   flake -- a perfectly regular grid, which is the "all kinda of equally spaced".
  //
  //   THE SPIN WAS SHEARED. fract(cg) spans 0..1 on both axes but a cell is about 74 x 46 canvas
  //   pixels, so rotating in that space stretches the flake and changes its size with its angle. That
  //   is a good part of what read as pixelation, on top of the sub-pixel thin axis.
  //
  // Rebuilt: columns, each carrying a few flakes at independent phases that fall the FULL height of
  // the frame, drift sideways as paper does, spin rigidly in ISOTROPIC units (screen heights, so a
  // rotation is a rotation), and fade in and out so nothing pops at the wrap.
  vec3 confetti(vec2 uv, float aspect, float amount, vec3 accent){
    vec3 acc = vec3(0.0);
    for(int c=0; c<2; c++){
      float cols = 22.0 + float(c)*15.0;
      float x = uv.x*cols;
      float id = floor(x);
      float fx = fract(x) - 0.5;
      for(int k=0; k<3; k++){
        float fk = float(k);
        float h1 = hash(vec2(id*1.31 + fk*7.7,  float(c)*13.3));
        if(h1 < 1.0 - amount) continue;          // sparse and irregular, not a grid
        float h2 = hash(vec2(id*2.17 + fk*3.1,  float(c)*5.9));
        float h3 = hash(vec2(id*0.73 + fk*11.9, float(c)*19.1));
        float speed = 0.09 + h2*0.15;
        float t = fract(h1*3.1 + uTime*speed);
        float fy = uv.y - (1.10 - t*1.24);       // enters above the frame, exits below it
        // one canvas pixel, in screen-height units -- everything below is in these units
        float pxh = 1.0/max(uRes.y, 1.0);
        // fx is in column widths; convert to screen heights so x and y are the same scale
        vec2 q = vec2(fx * aspect / cols + sin(t*6.0 + h3*6.283)*0.018, fy);
        float spin = uTime*(1.6 + h3*2.8) + h1*6.283;
        vec2 rq = vec2(q.x*cos(spin) - q.y*sin(spin), q.x*sin(spin) + q.y*cos(spin));
        float aw = 0.010 + h2*0.006;                          // long axis, varied
        float ah = max(0.0032 + 0.0040*abs(sin(spin)), pxh*2.0); // thin axis, never sub-pixel
        float e  = pxh;                                       // one pixel of antialiased edge
        float fl = smoothstep(aw+e, aw-e, abs(rq.x)) * smoothstep(ah+e, ah-e, abs(rq.y));
        float life = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.88, t);
        acc += mix(vec3(1.0, 0.82, 0.35), accent, step(0.6, h3)) * fl * life;
      }
    }
    return acc;
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
    else if (fi < 3.5) g = 0.10 + uSnare*1.9 + uDrop*0.7;              // corners: SNAP on the backbeat
    else if (fi < 5.5) g = 0.02 + uBuild*1.9 + uBeat*0.55;              // floor: idle dark, swell on a build
    else if (fi < 6.5) g = (0.20 + uBeat*0.8) * step(1.0, mod(pat,2.0)); // side tower: alternate cues
    else               g = 0.06 + uDown*1.1 + uDrop*1.3 + uVocal*0.9;  // centre: accents + vocal

    // HERO BEAMS. Every fixture running at the same level is a wash, not a show — a real rig
    // has one or two heads punching far harder than the rest, and which ones changes with the
    // cue. Two fixtures per cue are picked deterministically from the song + cue, driven up
    // hard, while the rest sit back — so the eye has something to follow.
    float pick = mod(fi + floor(pat) * 2.0 + floor(uSong * 8.0), 8.0);
    float hero = step(pick, 1.5);                       // 2 of the 8 are heroes this cue
    g *= mix(0.38, 5.0, hero);                          // a hero is >13x the fill, not 5x
    // and the heroes flare harder still on the hit
    g += hero * (uBeat*2.2 + uDown*1.6 + uDrop*1.7);   // and it SLAMS on the hit
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
      // The rig is never perfectly still: the heads lose their footing and the beams judder,
      // which is what a worn bootleg of a light show would actually look like. The coefficient
      // is 0.06 rather than the old 0.34 because the dial that feeds it changed meaning — it
      // used to arrive as the friction knob's 0.12 default (0.12*0.34 = 0.041 of judder) and now
      // arrives as 1.0 at the same rest position. 0.06 keeps the shipped look and leaves the top
      // of the dial's travel to make it visibly worse, which is what the top of the dial is for.
      float jitter = (hash(vec2(fi, floor(uTime*22.0))) - 0.5) * uIntensity * 0.06;
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
      // FLOORED AT ~1.8 CANVAS PIXELS. beamWidth() narrows some groups hard -- 0.45 for the floor
      // uplights -- so the core came out at 0.0030*0.45 = 0.00135 in p units, and p.y spans 1.0 over
      // uRes.y, which is 1.08 pixels on a 1280x800 viewport at scale 1.0 and worse at 0.55. A
      // sub-pixel core cannot be anti-aliased by the smoothstep below it; it just flickers along the
      // beam, which is the residual "lasers still look pixelated". Floored, the narrow groups stay
      // visibly narrower than the rest without going below what the buffer can draw.
      // uDrop fattening halved: 0.02 in p units is about 18 canvas pixels of extra core on every one
      // of the eight beams at once, which ablation put at 11% of the drop wash. Halved, the beams still
      // visibly swell on the hit without the whole rig turning into a single bright mass.
      // The beat swells the beams and that is the effect, not a bug -- it was cut to a third for a
      // while and the rig lost its punch. Back near the original, trimmed only slightly (0.012 ->
      // 0.010 on the beat, drop 0.020 -> 0.014) because those two together were also feeding the
      // drop whiteout measured in the wash pass. The floor below keeps the narrow groups drawable.
      float wRaw = (0.0030 + uBeat*0.010 + uBass*0.0035 + uDrop*0.014) * beamWidth(fi);
      float w = max(wRaw, 2.0 / max(uRes.y, 1.0));
      // A SOFT-CORED BEAM, and this is deliberate -- it was briefly given a flat top with a hard
      // 1.5px edge, on the reasoning that a crisp edge reads as sharp. It does, and it looked wrong:
      // a flat-topped band of colour reads as a line DRAWN on the photo rather than as light passing
      // through haze. The gradient is not a defect to be sharpened, it is what makes the beam look
      // like a beam. Reverted, and left alone.
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
    for(int s=0; s<16; s++){
      vec3 pos = ro + rd*t;
      // haze is thicker toward the floor and drifts slowly, so beams break up as they descend
      float dens = (0.55 + 0.45*noise(pos.xz*1.6 + uTime*0.05)) * smoothstep(1.3, -0.5, pos.y);
      for(int i=0; i<4; i++){
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
      t += 0.21;   // steps cover the beam's depth
    }
    // SIXTEEN STEPS, and it stays sixteen. This was cut to 10 as a cost saving and the god rays
    // visibly banded: the march integrates a NOISY fog density, so halving the samples does not
    // soften the beams smoothly, it quantises them into steps you can see. The rig no longer needs
    // that saving -- tierPolicy drops resolution under load and climbs back out afterwards, so the
    // machine adapts at runtime instead of every machine paying a permanent quality tax for the
    // worst one. Cost control belongs in the tier, not in the beam.
    return acc * (0.22 + uBeat*0.6 + uDrop*0.6);
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
    // Kept before the volumetric is folded in, because the refraction pass below needs the rig as it
    // was at THIS pixel to difference against. beams stops being that one line later.
    vec3 rigStraight = beams;
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
    // Radius floored to just over a canvas pixel. At 300 cells across a ~700px canvas a cell is
    // 2.3px, so the old fixed 0.34-of-a-cell radius was 0.8px -- SUB-PIXEL, which is why the dust
    // shimmered and crawled instead of hanging in the air. Sub-pixel geometry cannot be drawn; it can
    // only alias.
    float mrad = max(0.34, 1.8 * 300.0 / max(uRes.y, 1.0));
    float dot2 = smoothstep(mrad, 0.0, length(fract(dgrid) - jitter));
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
    // FOLDED INTO THE LIGHT FIELD, not just added to the picture. The follow spot was written
    // straight into col, while beams -- which is what the water, the confetti and the dust read to
    // decide how lit they are -- was finalised further up. So the one light in the room that answers
    // to the visitor was the one light nothing reacted to: you could move the cursor over a drop and
    // it stayed dark. Adding it to beams as well as to col means condensation under the cursor
    // brightens, a flake crossing it flares, and the dust in it glitters -- the spot behaves like a
    // real head rather than a decal.
    // Weighted a little higher into the field than into the picture: the spot is soft and wide, so
    // the direct contribution has to stay subtle to avoid a milky patch, but the things it LIGHTS
    // should respond to it clearly.
    // ---- CURSOR TRAIL AS LIGHT ----
    // Eight recent positions, each dimmer and tighter than the last, so the path reads as something
    // that was dragged through the haze rather than eight separate lamps. Folded into the light field
    // the same way the follow spot is, so drops along the path brighten as the pointer goes by.
    vec3 trailLight = vec3(0.0);
    // Five of the eight samples, not all eight: each costs a length() and a smoothstep per pixel,
    // and the path reads the same from five points spaced wider along it.
    for (int i = 0; i < 5; i++) {
      float fi = float(i) * 1.6;
      vec2 tp = vec2((uTrail[i].x - 0.5) * aspect, uTrail[i].y - 0.5);
      float age = 1.0 - fi / 8.0;             // 1 at the head, fading back along the path
      float rad = 0.045 + fi * 0.016;         // older samples bloom wider as they dissipate
      trailLight += uAccent * smoothstep(rad, 0.0, length(p - tp)) * age * age * 0.16;
    }
    col += trailLight;
    beams += trailLight * 3.0;

    // ---- CLICK: A SHOCKWAVE THROUGH THE ROOM ----
    // A ring that expands and fades, plus a flash at the point of impact. uClickAge is seconds since
    // the click, so this costs nothing at all when nobody has clicked -- the branch is uniform, so the
    // GPU skips it coherently rather than executing both sides.
    if (uClickAge < 1.2) {
      vec2 cp = vec2((uClickPos.x - 0.5) * aspect, uClickPos.y - 0.5);
      float cd = length(p - cp);
      float k = uClickAge / 1.2;              // 0 at impact, 1 when spent
      float decay = (1.0 - k) * (1.0 - k);    // fades fast, the way a real shock does
      // the ring travels outward and thins as it goes
      float ringR = k * 0.75;
      float ringW = 0.010 + k * 0.045;
      vec3 clickLight =
          uAccent * smoothstep(ringW, 0.0, abs(cd - ringR)) * decay * 0.55
        + mix(uAccent, vec3(1.0), 0.5) * smoothstep(0.09, 0.0, cd) * decay * 0.85;
      col += clickLight;
      beams += clickLight * 2.6;
    }

    vec2 mpos = vec2((uMouse.x-0.5)*aspect, uMouse.y-0.5);
    vec3 spot = uAccent * smoothstep(0.40, 0.0, length(p - mpos)) * (0.045 + uBeat*0.11);
    col += spot;
    // 5x, not 2x. The spot itself is deliberately dim in the picture (0.045 + uBeat*0.11) so it does
    // not leave a milky patch, but that same value fed into the light field only made the water under
    // the cursor 20% brighter -- present in a measurement, invisible to a person. Weighted up, drops
    // under the cursor roughly double, which is what "the light interacts with them" has to look like
    // to be worth having. It only reaches the particles; the direct contribution to col is unchanged.
    beams += spot * 5.0;
    // DROP = the whole room blows open
    // ROOM FLASH, cut from 0.3 to 0.09. Measured by ablation on a standalone render of this shader
    // with the audio uniforms forced to a drop: this one term was 22% of the whole drop wash, and it is
    // the least defensible 22% -- a flat full-viewport magenta lift with no structure, so it reads as
    // the picture going pale rather than as anything happening in the room. The beams, the starburst
    // and the pyro all carry the drop with shape; this only carried brightness.
    col += vec3(1.0,0.55,0.9) * uDrop * 0.09 * (1.0 - r);

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
    // CELL SIZE IS IN DISPLAY PIXELS, which is what the note above claims but was not true: uRes is
    // CANVAS resolution, so dividing by a raw cellPx made the cell that many CANVAS pixels -- i.e.
    // cellPx/scale display pixels. At the 0.55 scale a wide viewport lands on, a "3px" cell rendered
    // at 5.5px and the panel changed size with the render scale rather than staying put.
    // Converted through uPxScale, then floored at 2 canvas pixels: below that the canvas physically
    // cannot resolve a cell and the grid just aliases, so the fine mode gets as close as the buffer
    // allows instead of asking for detail that does not exist.
    float cellDisplayPx = uPattern < 1.5 ? 4.0 : (uPattern < 3.5 ? 7.0 : 11.0);
    // FLOOR AT 5, NOT 2. A cell needs room for a cell AND a gap, and fract(pos/cellPx) only takes
    // cellPx distinct values -- so at 2 it is [0.00, 0.50] and at 3 it is [0.00, 0.33, 0.67]. Neither
    // can express a lit square with a dark edge; they collapse into a 1px checkerboard, which upscales
    // into stripes and moire. That is exactly what "not squares pattern at times" was: the fine mode
    // at 3 display px times a 0.67 render scale is 2.01, landing on the old floor. Reported and
    // measured. At 5 the samples are [0.00, 0.20, 0.40, 0.60, 0.80] and a square reads properly.
    // SNAPPED TO WHOLE PIXELS. This was a float, and that is why the wall was sharp at some cell
    // sizes and mushy at others: fract(uv.y * uRes.y / cellPx) only lands on pixel boundaries when
    // cellPx is an integer. At 5.3 or 7.4 the cell edges fall mid-pixel, so the 1px gap renders as 1px
    // in some rows and 2px in others and the whole grid beats against the pixel lattice -- a moire that
    // changes every time uPattern cycles the size. Reported as "sometimes the led still produce the
    // wrong pattern, sometimes it looks sharp other times not", which is exactly what a non-integer
    // grid does. floor(x + 0.5) rather than a round() call, which GLSL ES 1.0 does not have.
    // THE FLOOR IS IN DISPLAY PIXELS, NOT BUFFER PIXELS. It was max(..., 5.0), i.e. five pixels of
    // the BUFFER -- so the wall silently changed density with the render scale. At native the 4px
    // cell was inflated to 5 (the buffer cannot express a lit square with a dark edge in fewer);
    // supersampled 2x, 8 buffer px divided by 2 is 4 display px, so the same wall drew 25% more
    // cells. Two render scales, two different-looking walls, which is half of "sometimes the led
    // produces the wrong pattern". Scaling the floor by uPxScale pins the wall to a fixed DISPLAY
    // size and lets extra buffer resolution do what it should: resolve the same cell more finely.
    // BOTH TERMS FLOORED. Pinning the floor to display pixels was right, but writing it as
    // 5.0 * uPxScale threw away the integrality the outer floor() existed to guarantee: uPxScale
    // is 0.8, 0.65 or 0.5 at the degraded tiers, so max() would return a fractional cell like 3.25,
    // cell edges landed mid-pixel, and the grid beat against the pixel lattice -- the plaid moire,
    // back again, and only on machines that had stepped down. floor() on the floor term as well.
    float cellPx = max(floor(cellDisplayPx * uPxScale + 0.5), floor(5.0 * uPxScale + 0.5));
    // The gap is ONE canvas pixel wide whatever the cell size, instead of a fixed 0.12-0.40 fraction
    // that got narrower in absolute terms as cells grew and vanished as they shrank.
    // ONE DISPLAY PIXEL, not one buffer pixel. As a buffer pixel the gap survived native and then
    // thinned to 2/3 of a pixel at the 1.5x rung and half a pixel at 2x, where downsampling averages
    // it into its neighbours -- the grid washing out into soft uneven stripes exactly when the rig
    // had MORE resolution to draw it with. uPxScale keeps the dark edge one pixel of the picture
    // the viewer is actually looking at.
    // The gap has to be a WHOLE number of buffer pixels for the same reason. One display pixel is
    // uPxScale buffer pixels, which is 0.65 of a pixel at tier 3 -- a gap that cannot be drawn, so
    // it smeared across two pixels at different strengths depending on where each cell edge fell.
    // Rounded, and never below 1, so the dark edge always exists.
    float gapPx = max(floor(uPxScale + 0.5), 1.0);
    float gap = gapPx / cellPx;
    float cellY = smoothstep(gap*0.4, gap*1.4, fract(uv.y * uRes.y / cellPx));
    float cellX = smoothstep(gap*0.4, gap*1.4, fract(uv.x * uRes.x / cellPx));
    col += wallCol * step(uv.y, lip) * cellY * cellX * (0.34 + uBeat*0.42 + uDrop*0.6);
    // soft spill of light up off the strip
    col += wallCol * step(uv.y, lip + 0.075) * smoothstep(lip + 0.075, lip, uv.y) * (0.05 + uLevel*0.05);

    // CONFETTI — gold foil off the ceiling on a drop. Flakes fall on their own grid, each with
    // its own drift, fall speed and spin, so they scatter rather than march. Rectangles are the
    // point here (foil, not dust), but they're small and rotated so they never read as the grid
    // they came from. Rides its own slow envelope so the fall outlasts the drop itself.
    if (uConfetti > 0.01) {
      // LIT BY THE RIG, not by itself. Every particle in here used to carry its own colour and
      // ignore the lights entirely -- a gold flake was gold whether it fell through a beam or through
      // darkness, which is the main reason the effects read as stickers on the picture rather than as
      // objects in the room. beams and vol are already computed above, so the light reaching this
      // point in space costs nothing extra to look up.
      // A little self-colour remains so paper is still visible in the dark; the rest is reflection,
      // so a flake FLARES as it crosses a beam and goes dim between them.
      // beams already has the volumetric pass folded into it (see beams += vol above), so it IS
      // the total light arriving at this point -- no second lookup needed.
      vec3 lightHere = beams;
      vec3 flakes = confetti(uv, aspect, 0.34, uAccent);
      // Self-light raised 0.30 -> 0.60. Making the flakes beam-lit was right, but beams cover a small
      // share of the frame, so paper falling through the dark half of the shot was effectively
      // invisible -- the same mistake that hid the water. Foil catches SOME light from the room even
      // where no beam finds it.
      col += flakes * (0.60 + lightHere * 1.9) * uConfetti * (0.55 + uBeat * 0.4);
    }
    // DROP = pyro. Rays fire out of the middle for the length of the release.
    //
    // CONFINED AND DIMMED, and this was THE whitewash. Reported many times as the picture going
    // milky and unreadable -- "flashes on like this every dew cycle" -- and it reads as coincident
    // with dew because a drop and a dew-point hit ride the same musical peak.
    //
    // What it was: 18 spokes (sin(ang*9) doubled by abs) radiating from the exact centre, in warm
    // gold, spread across 85% of the frame RADIUS at 1.15 gain, additive under mix-blend-mode:
    // screen. Screen can only lighten, so a full-frame gold wash at that strength does not read as
    // pyro at all -- it lifts the entire image toward white and buries the footage, which is the one
    // thing the rig comments elsewhere in this file insist must not happen ("the footage is the
    // star; the rig lights it").
    //
    // The FIRST attempt at this cut the reach to 0.40 and the gain to 0.5, which threw the effect
    // away -- "you removed the cool center laser starburst". The starburst is wanted. What is not
    // wanted is the whiteout, and those are separable: the whiteout came from WIDE rays covering
    // most of the frame, not from the rays existing.
    //   RESOLUTION. 9 -> 16 in the angular term, so 32 spokes rather than 18, and pow 22 -> 44 so
    //     each is roughly half as wide. That is the "higher resolution" read: more, finer rays.
    //   ENERGY. Doubling the count while halving the width is roughly energy-neutral, so the reach
    //     goes back out to 0.82 -- nearly the original 0.85 -- and the gain to 0.95, and it still
    //     integrates to far less total light than the version that washed the frame out.
    //   CENTRE. A small inner hollow (falloff from 0.05) so the convergence point is a bright knot
    //     rather than one saturated pixel, which is what made the middle of the frame blow.
    //
    // NOT VERIFIABLE FROM A HEADLESS CAPTURE: uDrop only rises when audio is playing, and audio
    // does not play in headless Chrome, so this branch is never even entered in anything measured on
    // the build machine. That is why five earlier hypotheses about the wash all scored clean here.
    // FIRES ON THE BAR AS WELL AS ON DROPS. uDrop is a real drop detector in audioBus -- a rising
    // edge where the energy ratio crosses 1.18, decaying with a 1.2s constant -- so it lands once or
    // twice in a whole track. That is correct for "the room blows open", but it made the starburst so
    // rare it read as broken; what had actually been seen often was the dew wash that used to white
    // out the frame. So the downbeat now carries a smaller version of it -- the motif recurs every bar
    // at just over a third strength, and a genuine drop still slams at full. Nothing else that reads
    // uDrop changes, which is the point: lowering the detector's threshold would have moved the beam
    // gains, the volumetric pass and the room flash along with it.
    float burst = uDrop + uDown * 0.38;
    if (burst > 0.01) {
      // ANALYTIC ANTI-ALIASING, because the pixelation is not the spokes' fault -- it is that the
      // shader canvas renders BELOW display resolution by design (PIXEL_BUDGET in ThermalRunaway
      // caps it, and a wide viewport lands at 0.55-0.67 linear scale), and 32 spokes converging on a
      // point exceed the pixel rate near the centre no matter what that scale is. pow() cannot fix
      // that: it is a fixed angular width, so as the rays converge they go sub-pixel and alias.
      //
      // Instead the ray's width is derived from the PIXEL FOOTPRINT at this radius. p.y spans
      // -0.5..0.5, so one pixel is 1.0/uRes.y in p units, and the angle it subtends at radius r is
      // that over r. Multiplied by the spoke count that gives how much abs(sin(ang*k)) changes across
      // one pixel -- so a band that wide is exactly one pixel of edge, and never less. The rays
      // therefore widen automatically as they converge, which is both alias-free and physically
      // right, and stay razor thin further out. fwidth() would do the same job in one line but needs
      // a derivatives extension under Three's default GLSL ES 1.0, so this is computed by hand.
      float ang = atan(p.y, p.x);
      float k = 16.0;
      // SPIN THAT DECELERATES. It was uTime*1.6 flat, so the burst rotated at a constant rate whether
      // it had just fired or was three seconds into its decay -- which reads as a spinning texture
      // rather than as something that was thrown. burst is 1 at the hit and decays, so this starts
      // fast and eases off, the way a real pyro fan does as it loses energy.
      float spinRate = 1.0 + burst * 5.5;
      float sa = abs(sin(ang*k + uTime*spinRate));
      float apx = (1.0 / max(uRes.y, 1.0)) / max(r, 0.012);   // radians per pixel at this radius
      // 1.2 pixels, not 1.7, and gain 0.80 rather than 1.15. Widening the band to kill the aliasing
      // also ADDS light -- most of it near the centre where the band is widest -- and the first pass
      // at this overshot badly: measured over the frame it came out 16% brighter than the original
      // version that washed the picture out, which would have undone the whole fix. Crispness comes
      // from the band being pixel-width, not from the gain, so the band is trimmed to just over one
      // pixel (still alias-free) and the gain brought down with it. Total light now integrates to 32%
      // BELOW the washing version while the rays stay hard-edged at any render scale.
      float w = max(k * apx * 1.2, 0.012);                    // footprint of sa across one pixel
      float rays = smoothstep(1.0 - w, 1.0, sa);
      rays *= rays;                                           // tighten the core without hard edges
      // PER-RAY VARIATION. Thirty-two identical rays read as a test pattern rather than as pyro --
      // visible immediately at 3x magnification. Each ray gets a stable brightness from its own index,
      // so some punch and some are faint, and the set is reseeded per song so a track's burst is its
      // own. The index is derived from the same angle the rays are, so it cannot drift out of step.
      float rayId = floor((ang * k) / 3.14159265 + 0.5);
      float rh1 = hash(vec2(rayId, floor(uSong * 8.0) + 3.0));
      float rh2 = hash(vec2(rayId * 1.7 + 4.3, floor(uSong * 8.0) + 11.0));
      rays *= 0.45 + 0.75 * rh1;
      // PER-RAY REACH. Brightness alone still left every ray the same LENGTH, which is the giveaway
      // of a procedural fan -- real pyro throws some lances much further than others.
      float rayReach = 0.55 + 0.85 * rh2;
      // The inner term only exists to avoid a singularity where every ray converges. At 0.035 of the
      // frame height that is a 27px DARK HOLE at the convergence point, which magnification showed as
      // an obvious blob. 0.010 is enough to keep the centre from saturating without punching a hole in
      // the middle of the effect.
      float reach = (1.0 - smoothstep(0.05, 0.82 * rayReach, r)) * smoothstep(0.0, 0.010, r);
      // 0.66 rather than 0.80. Ablation on a standalone drop render put this one effect at 19% of the
      // remaining drop wash, and -- more to the point -- at MOST of the clipping: removing it takes
      // blown pixels from 4.99% to 1.22%. The rays are what saturate, because they land on a frame where
      // uBeat, uBass, uSnare and uLevel are already peaking together. Trimmed rather than reshaped,
      // since the reach and the spoke count are what make it read as a starburst and both were asked for.
      // COLOUR FROM THE ROOM, not a constant. This was a hardcoded vec3(1.0,0.72,0.34) -- fixed warm
      // gold -- which is why it looked stuck on one colour while the LED wall, the lasers and the
      // player's spectrum all walked the palette together. It takes uAccent now, so a burst in
      // Dieter's cold blue reads cold and one in Ibiza gold reads gold, and each RAY leans a different
      // amount toward the pyro white so the fan is not monochrome.
      vec3 rayCol = mix(uAccent, vec3(1.0, 0.86, 0.52), 0.25 + 0.55 * rh1);
      // A PULSE on the beat, so the fan breathes instead of sitting there decaying smoothly.
      float pulse = 0.78 + 0.42 * uBeat;
      col += rayCol * rays * burst * reach * pulse * 0.66;
      // A HOT CORE at the convergence. Every ray meets there and the eye expects a flash; without it
      // the middle of the burst is the dimmest part of it, which is backwards.
      col += mix(rayCol, vec3(1.0), 0.55) * smoothstep(0.075, 0.0, r) * burst * 0.55;
    }

    // CONDENSATION beading over the whole "lens" — the humidity signature.
    // droplets() is 3 nested layers of hashing, by far the most expensive thing here, so the
    // phone tier skips it entirely. Branching on a uniform is coherent across every pixel, so
    // the GPU really does skip the work rather than executing both sides.
    // No longer gated off entirely at low quality -- droplets() drops its second layer instead. The
    // density is raised a little when the cheap path is active so one layer still reads as wet glass
    // rather than as a handful of stray dots.
    // THE GLASS CAN BE DRY. The density used to be 0.03 + uHumidity*0.20, which never reaches zero --
    // so there were always beads somewhere no matter how cool and dry the rig got, and "there should be
    // a time there is none" was impossible. Now it is a threshold: below about 30% RH the glass is
    // clear, and it beads up as the room gets muggier. Combined with each bead's own life cycle, the
    // condensation genuinely comes and goes with the thermals instead of being permanent scenery.
    // A LENS-WIDE FOG CYCLE, so the glass genuinely clears. Per-bead lives were not enough on their
    // own: every bead runs on the same 25s rate with only its phase offset, so at any instant about
    // 72% of the eligible ones are on screen and there is never a moment with nothing. Reported as
    // "some of the water spots just stay, there is never a time where the glass is totally clear".
    // This is the missing global term -- the lens fogs, beads and runs, then dries out completely
    // before it starts again. ~55s period with roughly 14s of clear glass at the end of each one,
    // which is also just how a cold lens in a hot room behaves.
    float fogPh = fract(uTime * 0.018);
    float fog = smoothstep(0.05, 0.30, fogPh) * smoothstep(1.0, 0.75, fogPh);
    // THRESHOLD MOVED DOWN TO WHERE THE RIG ACTUALLY RUNS. 0.30-0.78 was chosen so the glass could
    // be genuinely dry, and it achieves that -- but the thermal sim sits at 44-48% RH through normal
    // play, which lands at 0.23 of full wetness, a quarter strength. Combined with the fog cycle
    // multiplying it down further for part of every 56s, there was often almost no water on screen at
    // all. 0.10-0.50 keeps a real dry state below ~15% RH while making ordinary humidity properly wet.
    float wetness = fog * smoothstep(0.10, 0.50, uHumidity);
    vec2 beadDisp;
    // DENSITY RAISED, because the problem was never brightness. Measured with the beams zeroed, a
    // single drop peaks at 0.465 and lifts a dark part of the frame by 0.418 -- plenty. Only 2.5% of
    // pixels had any water on them at all, so on a busy shot you had to hunt for it. The headroom is
    // enormous: at that coverage the water contributes about 0.01 of mean lift, against the 0.387 of
    // the dew wash that caused the milky problem, so this can roughly double without going near it.
    // The runner density is computed HERE, above the beads, because droplets() needs it to ask
    // whether a runner has swept a given bead. One expression feeding both passes, rather than a
    // uniform duplicating it on the CPU -- the absorption test has to be the same maths that draws
    // the runner or beads would vanish under drops that are not there.
    float wet = clamp((uHumidity*0.60 + uDew*0.80) * max(fog, uDew*0.7), 0.0, 1.0);
    float runAmount = 0.20 + wet*0.46;
    // Derived ONCE per pixel and handed to droplets(), rather than four times inside its loops.
    float bLane0; float bRy0 = runnerHeadY(uv.x, 0.0, runAmount, bLane0);
    float bLane1; float bRy1 = runnerHeadY(uv.x, 1.0, runAmount, bLane1);
    float beads = droplets(uv, aspect, wetness * 0.78 * (uQuality > 0.5 ? 1.0 : 1.45), runAmount,
                           bRy0, bLane0, bRy1, bLane1, beadDisp);
    // Water catches the light too. A droplet is a lens: in the dark it is nearly invisible, and when
    // a beam crosses it, it lights up. Same lookup as the confetti -- the field is already computed.
    // SELF-LIGHT RESTORED. Making the water beam-lit was right, but I took the self term from 0.44 to
    // 0.16 at the same time -- a 64% cut -- and the beams only cover a small share of the frame, so
    // most drops sat where there was no light to catch and simply vanished. Water in a dark room is
    // dim, not absent: enough self-light to read, with the beams still doing the flaring.
    col += beads * (vec3(0.8,0.9,1.0) * 0.40 + beams * 1.15);

    // ---- LIQUID COOLING: WATER ON THE LENS ----
    // This replaces a full-frame noise wash that was the reported milky static. That version ran
    // smoothstep(0.0, 0.6) over fbm, which saturated 77.5% of the frame at 0.5 gain -- a mean additive
    // lift of 0.387 under a screen blend, held for the ~0.67s uDew takes to decay. Fine, bright, fast
    // noise across the whole picture is the definition of static; it could never have read as water.
    //
    // Now it is actual water. Runners are always present in proportion to humidity -- the glass is
    // wetter the muggier the room gets -- and a dew-point hit opens the taps, which is the moment the
    // liquid cooling kicks in. Beads (droplets(), above) handle the clinging condensation; runners()
    // handles what breaks loose and streaks down.
    // STRENGTH IS SET BY COVERAGE, NOT BY CAUTION. The wash this replaced lifted the whole frame by
    // a mean of 0.387; runners touch on the order of 3% of pixels, so even a gain that makes each
    // streak clearly readable costs roughly a hundredth of that in total added light. The first pass
    // at these numbers was tuned as though the old cost still applied and the water was invisible.
    // Gated by the same fog cycle as the beads. Runners drying on a different schedule would leave
    // water streaking down a lens that had just been declared clear.
    vec2 runDisp;
    float run = runners(uv, runAmount, bRy0, bLane0, runDisp);
    // Dimmer as well as softer. 0.34 was set when the runners were barely visible at all, before the
    // edges were sharpened; sharpened AND at that gain they read as bright white lines drawn over the
    // footage. Soft edges plus a lower gain is what water on glass looks like against a dark scene.
    col += clamp(run, 0.0, 1.5) * (vec3(0.66,0.80,0.94) * 0.28 + beams * 1.0)
         * (0.55 + uDew*0.75);

    // ---- REFRACTION THROUGH THE WATER ----
    // ONE pair of samples for the whole field, using the displacement both water passes accumulated.
    //
    // The layer is mix-blend-mode: screen, so it can only ADD -- it cannot substitute the displaced
    // pixel for the one underneath, which is what real refraction does. What it CAN do honestly is
    // emit the positive difference: where the light bent through the drop is brighter than what is
    // already behind it, the drop lights up; where it is darker, the drop leaves it alone. The result
    // is lensing that genuinely tracks the footage -- a drop passing over a laser in the picture
    // flares, one over a dark jacket stays quiet -- rather than a painted-on highlight that looks the
    // same over everything.
    // The raw displacement, kept separate from the video's. uRefract gates the FOOTAGE pass because
    // it reports whether there is a frame to sample at all -- it is 0 on stills and with video off.
    // The rig is procedural and needs no texture, so gating the beam pass on it would have meant the
    // lasers bend only while a video happens to be playing and go rigid the moment a still comes up.
    vec2 wdisp = beadDisp + runDisp;
    vec2 duv = wdisp * uRefract;
    if (uRefract > 0.001) {
      vec3 behind = texture2D(uBackdrop, uv + duv).rgb;
      vec3 straight = texture2D(uBackdrop, uv).rgb;
      col += max(behind - straight, vec3(0.0)) * 1.6;
    }

    // ---- AND THE LIGHT RIG BENDS TOO ----
    // The footage refracted and the beams did not, so a drop sitting on a laser bent the picture
    // behind the beam while leaving the beam itself ruler-straight -- water on top of a photograph of
    // a light rather than water in front of a light. The beams are the highest-contrast thing on the
    // screen, so they are exactly where a lens would read most.
    //
    // The rig is procedural, so there is no buffer to re-sample the way uBackdrop is; "what does the
    // beam look like three pixels over" means evaluating rig() again. Hence the guard: only pixels
    // that actually carry displacement pay for it, which is a few percent of the frame, and dry
    // frames skip it entirely. The alternative -- hoisting droplets() and runners() 400 lines above
    // rig() so the UV could be perturbed once, for free -- is the cheaper design, but it reorders the
    // middle of the shader and GLSL is not type-checked by the build.
    //
    // Same honesty as the footage pass: screen blend can only ADD, so this emits the positive
    // difference rather than substituting. A drop over a beam flares where the bent light is
    // brighter, and stays quiet where it is not.
    float dmag = dot(wdisp, wdisp);
    if (dmag > 1e-9) {
      // wdisp is in uv space; p is aspect-corrected, so x has to be scaled to match.
      vec2 dp = vec2(wdisp.x * aspect, wdisp.y) * 0.55;
      vec3 bent = rig(p + dp, sweep, fan, uPattern);
      col += max(bent - rigStraight, vec3(0.0)) * 0.9;
    }

    // overclock shimmer
    col += vec3(0.4,1.0,0.6) * uOverclock * 0.1 * (0.5+0.5*sin(uTime*8.0));

    // (A crowd layer lived here as rim-lit heads. On screen it read as a row of pink arcs
    //  rather than people, so it's out — a fake crowd is worse than none over real footage.)

    // (A VHS pass lived here: head-switching band, tracking wobble, dropout streaks. Over
    //  photographic footage it just read as dirt on the screen, so it's out. The grain below
    //  carries the bootleg feel without the noise.)

    // GRAIN, and it is the last of the film-stock treatments left in here.
    // 0.09 at a multiplier of 1 is what (0.04 + 0.12*0.42) came to at the old knob's default, so
    // the shipped look is unchanged — but the constant floor is gone, so the dial can now reach
    // zero grain, which the previous form could not: 0.04 of it rendered however far down the
    // knob was turned.
    // NO PER-PIXEL GRAIN IN HERE ANY MORE, and this was the "soft and grainy" that survived every
    // resolution fix. It was (hash(uv*uRes + uTime) - 0.5) * uIntensity * 0.09 added straight to col:
    // per-canvas-pixel noise, re-rolled every frame, scaled by the dial -- so at the top of the dial
    // (uIntensity 1.4) it was +/-0.063 on EVERY pixel of the layer. A laser at 0.5 luminance was
    // therefore being modulated by about +/-12% per pixel, which is precisely the dithered speckle the
    // beams and the starburst rays showed. It also dithered the ALPHA, since the alpha of this layer
    // is its own luminance, so the transparency crawled as well.
    //
    // Film grain over the composite is a good thing and the site already has it -- .bc-grain, a CSS
    // layer that sits over the footage AND the rig, which is the right place for it because grain
    // belongs to the image as a whole rather than to one element inside it. Two grain sources stacked,
    // and this was the one degrading its own graphics. Removed rather than reduced: there is nothing
    // it was adding that the CSS layer does not do better and over more of the picture.
    // (TAPE SCANLINES and the CHROMATIC FRINGE lived here, both keyed to the friction knob, and
    //  both are deleted with it: they are the CRT treatment that cost legibility. The fringe is
    //  the better riddance of the two — it evaluated rig() twice more, i.e. three times the
    //  8-iteration beam maths per pixel, on every desktop and Surface pixel above a quarter
    //  turn. uQuality itself stays — it still gates four other passes — but nothing here reads
    //  it any more.)

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
