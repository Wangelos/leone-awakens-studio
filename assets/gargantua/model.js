/* COPIA PER IL SITO VETRINA (19/09/2026). L'ORIGINALE VIVO E' QUESTO:
     G:\A.T\Animazioni3d\sorgenti\tempio\cielo\gargantua\model.js
   Chi aggiorna Gargantua aggiorna la' e ricopia qui. Sotto questo commento il
   file e' identico all'originale, byte per byte: nessuna riga cambiata. */
/* copiato da Gargantua/_parti/model.js il 29/08; l'originale non si tocca.
   UNICHE modifiche: ESM — THREE dal globale del motore invece di `import 'three'`,
   import di cio' che nell'HTML stava nello stesso blocco (LENS_CHUNK, B_CRIT,
   le costanti e la rampa del plasma), e la lista di export in fondo.
   Il corpo — shader, geometrie, buildBlackHole — e' intatto. */
import { LENS_CHUNK, B_CRIT } from './lens.js';
import { R, DISK_IN, DISK_OUT, ramp, smooth, softSprite } from './plasma.js';
const THREE = window.THREE;

/* ---------- the lensed disk: one material, three images ---------- */
/*
 *  Everything the observer sees of the plasma is the SAME sheet of gas,
 *  drawn three times:
 *
 *    order 0  the direct image — the near side crossing in front of the
 *             shadow, the far side lifted right over the top of it;
 *    order 1  the light that went round the other way — the second image,
 *             the arc under the shadow;
 *    order 2  one more winding — a thread hugging the shadow's rim, which
 *             is what the photon ring is made of.
 *
 *  No layer is painted by hand: the arcs are the vertex positions the
 *  lensing table hands back, so they move correctly when the camera does.
 */

const DISK_VERT = `
uniform float uTime;
uniform float uSpin;
uniform float uBeam;
uniform float uFilWind;
uniform float uOmRigid;

varying float vBase;
varying float vBaseF;
varying float vShear;
varying float vV;
varying float vBoost;
varying float vBlue;
varying float vR;
varying float vFace;

void main() {
  vec3 P = (modelMatrix * vec4(position, 1.0)).xyz;
  Lensed L = lensApparent(P);
  vec2 beam = lensBeam(P, L.r, L.nEmit, uBeam);
  vBoost = beam.x;
  vBlue  = beam.y;
  vR = L.r;

  // An accretion disk is optically thick: from above you see its top face,
  // and the light that wrapped under the hole left from the bottom one.
  // Adding both sheets everywhere doubles the near side and fills the
  // shadow with a bowl of gas that should not be there. The photon's
  // departure direction says which face it can have come from.
  float side = sign(position.y + 1e-6);
  vFace = mix(0.09, 1.0, smoothstep(-0.02, 0.18, side * L.nEmit.y));

  // Keplerian rotation, split in two so the plasma can shear WITHOUT
  // dissolving. Winding a texture by Ω(r)·t forever is the obvious thing to
  // do and it is a trap: the spiral tightens without limit, the azimuthal
  // detail drops below one pixel, and after a minute the disk has quietly
  // flattened into concentric bands. Measured: unbounded winding costs the
  // whole structure in about two minutes.
  //   · the RIGID part turns everything as one body — no radial gradient,
  //     so it never smears however long you watch;
  //   · the DIFFERENTIAL part is what makes inner gas lap outer gas, and it
  //     is advected in a bounded cycle (see uFlow) so the shear winds up to
  //     a limit and then hands over instead of winding into invisibility.
  // The unbounded, honest differential rotation is carried by the
  // particulates, which are points and cannot blur.
  float om = 1.0 / pow(L.r, 1.5);
  vBase  = uv.x + uTime * uSpin * uOmRigid;
  vBaseF = uv.x * 1.31 + 0.137 + uTime * uSpin * uOmRigid * uFilWind;
  vShear = uSpin * (om - uOmRigid);
  vV = uv.y;

  gl_Position = projectionMatrix * viewMatrix * vec4(L.world, 1.0);
}
`;

const DISK_FRAG = `
precision highp float;

uniform sampler2D uMap;
uniform sampler2D uFil;
uniform vec3  uTint;
uniform float uGain;
uniform float uFil2;
uniform float uGlow;
uniform float uExposure;
uniform float uLineare;
uniform float uOrderGain;
uniform vec2  uRad;          // (rIn, rOut)
uniform vec3  uFlow;         // (offset A, offset B, cross-fade) — see below

varying float vBase;
varying float vBaseF;
varying float vShear;
varying float vV;
varying float vBoost;
varying float vBlue;
varying float vR;
varying float vFace;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  // Bounded advection. Two copies of the shear run half a cycle out of step;
  // whichever one is about to reset is faded out at the moment it resets, so
  // the flow reads as continuous while no copy is ever wound past one cycle.
  // uFlow = (turns for copy A, turns for copy B, cross-fade weight).
  vec2 uvA = vec2(vBase + vShear * uFlow.x, vV);
  vec2 uvB = vec2(vBase + vShear * uFlow.y, vV);
  vec4 s = mix(texture2D(uMap, uvA), texture2D(uMap, uvB), uFlow.z);
  vec3 emit = s.rgb * s.a;

  // Wispy over-layer on its own, slower shear: two incommensurate speeds
  // mean the pattern never visibly repeats.
  vec4 f = mix(texture2D(uFil, vec2(vBaseF + vShear * uFlow.x * 0.55, vV)),
               texture2D(uFil, vec2(vBaseF + vShear * uFlow.y * 0.55, vV)), uFlow.z);
  emit += f.rgb * f.a * uFil2;

  // Cheap volumetric spill — the same plasma read from a coarse mip, so
  // the bright lanes bleed instead of ending at a hard edge.
  vec4 g = texture2D(uMap, uvA, 4.5);
  emit += g.rgb * g.a * uGlow;

  // Radial envelope — the same one the exact solver uses, so the two
  // views grade alike; plus a fade to nothing at the rim, or the sheet
  // ends on a hard edge and draws a bright outline round the whole disk.
  float t = clamp((vR - uRad.x) / (uRad.y - uRad.x), 0.0, 1.0);
  emit *= mix(0.78, 1.15, pow(1.0 - t, 1.35));
  emit *= smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.70, 1.0, t));

  float mx = max(max(emit.r, emit.g), emit.b);
  emit = mix(emit, vec3(mx), vBlue);

  vec3 c = emit * uTint * (uGain * uOrderGain * vBoost * vFace);
  // copertura: il plasma denso NASCONDE il cielo dietro (prima era solo additivo e le stelle ci brillavano attraverso)
  float cop = clamp(max(s.a, g.a * 0.5) * 2.8, 0.0, 1.0) * smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.70, 1.0, t)) * vFace;
  gl_FragColor = vec4(c * uExposure * uLineare, cop); // LINEARE: tono e sRGB li fa il composer
}
`;

/* ---------- image-space pieces: shadow, photon ring, veils ---------- */

const BILLBOARD_VERT = `
uniform float uB0;
uniform float uB1;
varying vec2  vXY;
varying float vRad;
void main() {
  vRad = length(position.xy);                 // 0..1 across the disc/ring
  vXY  = position.xy;
  float b = mix(uB0, uB1, vRad);
  gl_Position = projectionMatrix * viewMatrix * vec4(lensBillboard(position.xy, b), 1.0);
}
`;

const SHADOW_FRAG = `
precision highp float;
varying vec2 vXY;
varying float vRad;
void main() {
  // The shadow is not a sphere: it is the set of directions whose light
  // never escaped. Flat, perfectly round, and 2.6 horizon radii across.
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const RING_FRAG = `
precision highp float;
uniform vec3  uColor;
uniform float uGain;
uniform float uWidth;
uniform float uBeamAsym;
uniform float uExposure;
uniform float uLineare;
varying vec2  vXY;
varying float vRad;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  // A hard inner cliff at the shadow's edge and a fast outer decay: the
  // photon ring is the pile-up of every high-order image, so it is bright,
  // narrow, and it stops dead where the light stops escaping.
  float t = vRad;
  float prof = exp(-pow(max(0.0, t) / uWidth, 1.35)) * smoothstep(0.0, 0.05, t);
  // Brightest where the gas is coming at us — the same asymmetry the disk has.
  float asym = 1.0 + uBeamAsym * (length(vXY) > 1e-5 ? normalize(vXY).x : 0.0);
  vec3 c = uColor * (uGain * prof * max(0.0, asym));
  gl_FragColor = vec4(c * uExposure * uLineare, 1.0); // LINEARE: tono e sRGB li fa il composer del tempio
}
`;

const VEIL_FRAG = `
precision highp float;
uniform vec3  uColor;
uniform float uGain;
uniform float uFall;
uniform float uExposure;
uniform float uLineare;
varying vec2  vXY;
varying float vRad;
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  float prof = pow(max(0.0, 1.0 - vRad), uFall);
  vec3 c = uColor * (uGain * prof);
  gl_FragColor = vec4(c * uExposure * uLineare, 1.0); // LINEARE: tono e sRGB li fa il composer del tempio
}
`;

const DUST_VERT = `
uniform float uTime;
uniform float uSpin;
uniform float uBeam;
uniform float uSize;
uniform float uPix;
attribute float aSeed;
varying float vBoost;
varying vec3  vCol;
void main() {
  vec3 p0 = position;
  float r  = length(p0.xz);
  // Each mote keeps its own orbit — Ω ∝ r^-3/2, exactly the gas it sits in.
  float a  = uTime * uSpin / pow(max(r, 1.05), 1.5) * 6.28318530718;
  float ca = cos(a), sa = sin(a);
  vec3 P = vec3(p0.x * ca - p0.z * sa, p0.y, p0.x * sa + p0.z * ca);
  Lensed L = lensApparent(P);
  vec2 beam = lensBeam(P, L.r, L.nEmit, uBeam);
  vBoost = beam.x;
  vCol = color;
  vec4 mv = viewMatrix * vec4(L.world, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uSize * uPix / max(0.5, -mv.z) * (aSeed > 0.80 ? 2.1 : 0.85));
}
`;

const DUST_FRAG = `
precision highp float;
uniform float uGain;
uniform float uExposure;
uniform float uLineare;
varying float vBoost;
varying vec3  vCol;
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = pow(max(0.0, 1.0 - length(d) * 2.0), 2.2);
  vec3 c = vCol * (uGain * vBoost * m);
  gl_FragColor = vec4(c * uExposure * uLineare, 1.0); // LINEARE: tono e sRGB li fa il composer del tempio
}
`;

/* ---------- thin flared annulus: u = azimuth, v = radius ---------- */
function diskSheet(rIn, rOut, sign, angular = 768, radial = 64, flare = 0.055) {
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= radial; j++) {
    const t = j / radial;
    const r = rIn + (rOut - rIn) * Math.pow(t, 1.12);
    const half = 0.012 + flare * Math.pow(t, 1.6);
    for (let i = 0; i <= angular; i++) {
      const th = (i / angular) * Math.PI * 2;
      pos.push(Math.cos(th) * r, sign * half, Math.sin(th) * r);
      uv.push(i / angular, t);
    }
  }
  const row = angular + 1;
  for (let j = 0; j < radial; j++) {
    for (let i = 0; i < angular; i++) {
      const a = j * row + i, b = a + 1, c = a + row, dd = c + 1;
      if (sign > 0) idx.push(a, c, b, b, c, dd);
      else idx.push(a, b, c, b, dd, c);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ================================================================== */

const RADII = { R, DISK_IN, DISK_OUT, B_CRIT };

/**
 * The whole black hole. `lens` carries the uniforms every lensed material
 * shares, so one camera update per frame moves every image at once.
 */
function buildBlackHole(lens) {
  const group = new THREE.Group();
  group.name = 'gargantua';

  const shared = lens.uniforms;
  const exposure = { value: 1.0 };
  const lineare = { value: 2.4 }; // guadagno: il composer applica ACES (piu' scuro dell'aces interno tolto)
  const beam = { value: 2.4 };
  const time = { value: 0 };
  const spin = { value: 0.62 };
  // Rate the whole plate turns at (the Keplerian rate at r ≈ 4.6). Everything
  // faster or slower than this is differential, and gets the bounded cycle.
  const omRigid = { value: 0.10 };
  const flow = { value: new THREE.Vector3(0, 0.5, 1) };
  const flowCycle = 4.2;                    // seconds per advection cycle

  const lensedMat = (name, opts) => {
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        uTime: time,
        uSpin: spin,
        uBeam: beam,
        uExposure: exposure, uLineare: lineare,
        uFilWind: { value: 0.62 },
        uOmRigid: omRigid,
        uFlow: flow,
        uMap: { value: opts.map },
        uFil: { value: opts.fil },
        uTint: { value: new THREE.Color(opts.tint || 0xffffff) },
        uGain: { value: opts.gain },
        uFil2: { value: opts.fil2 !== undefined ? opts.fil2 : 0.22 },
        uGlow: { value: opts.glow !== undefined ? opts.glow : 0.55 },
        uOrderGain: { value: opts.orderGain !== undefined ? opts.orderGain : 1 },
        uOrder: { value: opts.order },
        uRad: { value: new THREE.Vector2(DISK_IN, DISK_OUT) },
      }, shared),
      vertexShader: LENS_CHUNK + DISK_VERT,
      fragmentShader: DISK_FRAG,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor, // il disco e' opaco: copre le stelle lensate dietro (alpha = copertura)
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    m.name = name;
    m.color = new THREE.Color(opts.tint || 0xffc98a);   // keeps OBJ/MTL meaningful
    return m;
  };

  const billboardMat = (name, frag, uniforms, opts = {}) => {
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uExposure: exposure, uLineare: lineare }, uniforms, shared),
      vertexShader: LENS_CHUNK + BILLBOARD_VERT,
      fragmentShader: frag,
      transparent: opts.opaque !== true,
      blending: opts.opaque ? THREE.NoBlending : THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    m.name = name;
    m.color = new THREE.Color(opts.color || 0x000000);
    return m;
  };

  /* 1 — the shadow. Not the horizon: the horizon is r = 1, but light that
     grazes it is bent back into the hole, so the DARK patch on the sky is
     the photon capture cross-section, b_crit = 3√3·M = 2.598 — two and a
     half times wider. Drawing a sphere of radius 1 is the single reason a
     naive black hole reads as a small ball with a ring round it. */
  const shadowGeo = new THREE.CircleGeometry(1, 512);
  const shadow = new THREE.Mesh(shadowGeo, billboardMat('event_horizon', SHADOW_FRAG, {
    uB0: { value: 0 }, uB1: { value: B_CRIT },
    uOrder: { value: 0 },
  }, { opaque: true }));
  shadow.name = 'event_horizon';
  shadow.renderOrder = 4;
  shadow.frustumCulled = false;
  group.add(shadow);

  /* 2 — accretion disk, direct image. */
  const diskLayers = [];
  const addDisk = (order, opts) => {
    const mat = lensedMat(opts.name, Object.assign({ order }, opts));
    for (const s of opts.sheets) {
      const mesh = new THREE.Mesh(
        diskSheet(opts.rIn, opts.rOut, s, opts.angular, opts.radial, opts.flare),
        mat
      );
      mesh.name = opts.name + (s > 0 ? '_upper' : '_lower');
      mesh.renderOrder = opts.renderOrder;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    diskLayers.push(mat);
    return mat;
  };

  addDisk(0, {
    name: 'accretion_disk', map: lens.plasma, fil: lens.filaments,
    rIn: DISK_IN, rOut: DISK_OUT, angular: 1024, radial: 68, flare: 0.075,
    sheets: [1, -1], gain: 0.30, tint: 0xffe0b8, renderOrder: 20,
    fil2: 0.26, glow: 0.26,
  });

  /* 3 — second image: the same gas, seen the long way round the hole.
     This is the arc that closes under the shadow. It needs azimuthal
     detail (it is a long thin arc) but almost no radial detail. */
  addDisk(1, {
    name: 'accretion_disk_second_image', map: lens.plasma, fil: lens.filaments,
    rIn: DISK_IN, rOut: DISK_OUT * 0.94, angular: 1024, radial: 40, flare: 0.05,
    sheets: [1, -1], gain: 0.30, orderGain: 0.66, tint: 0xffd7a6,
    fil2: 0.16, glow: 0.12, renderOrder: 21,
  });

  /* 4 — third image: one more winding, squeezed onto the shadow's rim. */
  addDisk(2, {
    name: 'accretion_disk_third_image', map: lens.plasma, fil: lens.filaments,
    rIn: DISK_IN, rOut: DISK_OUT * 0.78, angular: 1024, radial: 16, flare: 0.03,
    sheets: [1], gain: 0.30, orderGain: 0.34, tint: 0xfff0d4,
    fil2: 0.0, glow: 0.0, renderOrder: 22,
  });

  /* 5 — photon ring: the limit every further image converges to. */
  const ringGeo = new THREE.RingGeometry(0.004, 1, 512, 1);
  const ringMat = billboardMat('photon_ring', RING_FRAG, {
    uB0: { value: B_CRIT }, uB1: { value: B_CRIT * 1.9 },
    uColor: { value: new THREE.Color(0xfff4e2) },
    uGain: { value: 0.42 },
    uWidth: { value: 0.048 },
    uBeamAsym: { value: 0.62 },
    uOrder: { value: 0 },
  }, { color: 0xfff4e2 });
  const photonRing = new THREE.Mesh(ringGeo, ringMat);
  photonRing.name = 'photon_ring';
  photonRing.renderOrder = 24;
  photonRing.frustumCulled = false;
  group.add(photonRing);

  /* 6 — bloom veil: what a real lens does with light this bright. */
  const veilMat = billboardMat('volumetric_emission', VEIL_FRAG, {
    uB0: { value: B_CRIT * 0.9 }, uB1: { value: DISK_OUT * 0.85 },
    uColor: { value: new THREE.Color(0xffbe80) },
    uGain: { value: 0.030 },
    uFall: { value: 3.4 },
    uOrder: { value: 0 },
  }, { color: 0xffbe80 });
  const veil = new THREE.Mesh(new THREE.RingGeometry(0.004, 1, 256, 1), veilMat);
  veil.name = 'volumetric_emission';
  veil.renderOrder = 26;
  veil.frustumCulled = false;
  group.add(veil);

  /* 7 — particulates. These carry the HONEST differential rotation: each
     mote is on its own Keplerian orbit, unbounded, and a point cannot blur
     however tightly the flow winds. Sheer numbers are the point — the disk
     reads as dense because there is a great deal of separately moving stuff
     in it, which is exactly what a texture cannot give you once the shear
     has wound past a pixel. */
  const N = 46000;
  const pp = new Float32Array(N * 3), pc = new Float32Array(N * 3), sd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.pow(Math.random(), 1.20);
    const r = DISK_IN * 1.12 + (DISK_OUT * 1.0 - DISK_IN * 1.12) * t;
    const th = Math.random() * Math.PI * 2;
    const halfH = 0.018 + 0.09 * Math.pow(t, 1.6);
    // Gaussian-ish across the plane: the mid-plane is where the gas piles up.
    const gy = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    pp[i * 3] = Math.cos(th) * r;
    pp[i * 3 + 1] = gy * halfH;
    pp[i * 3 + 2] = Math.sin(th) * r;
    // Same radial envelope as the gas, so the motes never outshine the plate
    // they are supposed to be made of.
    const env = (0.13 + 0.87 * Math.pow(1 - t, 2.0)) * (1 - smooth(0.70, 1.0, t) * 0.92);
    const seed = Math.random();
    // A fifth of them are hotter knots; the rest are fine and faint.
    const knot = seed > 0.80 ? 1.9 : 0.70;
    // Warmer than the gas ramp would give on its own: pure white motes read
    // as snow on the plate instead of gas inside it.
    const [cr, cg, cb] = ramp(Math.pow(t, 0.62) * 0.86 + 0.12);
    const k = env * knot / 255;
    pc[i * 3] = cr * k; pc[i * 3 + 1] = cg * k; pc[i * 3 + 2] = cb * k;
    sd[i] = seed;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  dg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uTime: time, uSpin: spin, uBeam: beam, uExposure: exposure, uLineare: lineare,
      uSize: { value: 0.016 }, uPix: { value: 800 },
      uGain: { value: 0.075 }, uOrder: { value: 0 },
    }, shared),
    vertexShader: LENS_CHUNK + DUST_VERT,
    fragmentShader: DUST_FRAG,
    vertexColors: true,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  dustMat.name = 'plasma_particulates';
  dustMat.color = new THREE.Color(0xffd9a0);
  const dust = new THREE.Points(dg, dustMat);
  dust.name = 'plasma_particulates';
  dust.renderOrder = 23;
  dust.frustumCulled = false;
  group.add(dust);

  /* 8 — the horizon itself. Never visible (the shadow is 2.6× wider and
     drawn over it) but it is the real surface, and it is what the OBJ/GLB
     export should carry. */
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  voidMat.name = 'event_horizon_surface';
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), voidMat);
  horizon.name = 'event_horizon_surface';
  horizon.renderOrder = 3;
  group.add(horizon);

  return {
    group,
    uniforms: { time, spin, beam, exposure, lineare, omRigid, flow },
    flowCycle,
    materials: { ringMat, veilMat, dustMat, diskLayers },
  };
}

/* ---------- starfield (scenery: rendered, not exported) ---------- */
function buildStarfield() {
  const N = 4200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = 160 + Math.random() * 180;
    const sr = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(th) * sr * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = Math.sin(th) * sr * r;
    const tint = Math.random();
    const b = 0.35 + Math.pow(Math.random(), 2.4) * 0.9;
    col[i * 3] = b * (tint > 0.85 ? 1.0 : 0.92);
    col[i * 3 + 1] = b * 0.94;
    col[i * 3 + 2] = b * (tint < 0.2 ? 1.0 : 0.88);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.1, sizeAttenuation: true, map: softSprite(32, 2.0),
    vertexColors: true, transparent: false, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false,
  }));
  stars.name = 'starfield';
  stars.renderOrder = -10;

  const sky = new THREE.Group();
  sky.name = 'deep_space';
  sky.add(stars);
  return sky;
}

export { RADII, buildBlackHole, buildStarfield, diskSheet };
