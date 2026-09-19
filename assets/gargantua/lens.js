/* COPIA PER IL SITO VETRINA (19/09/2026). L'ORIGINALE VIVO E' QUESTO:
     G:\A.T\Animazioni3d\sorgenti\tempio\cielo\gargantua\lens.js
   Chi aggiorna Gargantua aggiorna la' e ricopia qui. Sotto questo commento il
   file e' identico all'originale, byte per byte: nessuna riga cambiata. */
/* copiato da Gargantua/_parti/lens.js il 29/08; l'originale non si tocca.
   UNICA modifica: ESM — la lista di export in fondo. Il corpo e' intatto.
   Non serve il globale THREE: `lensTexture(THREE, table)` se lo fa passare. */

/* ===== lensing.js ===== */
/* ------------------------------------------------------------------ *
 *  Gravitational lensing as GEOMETRY.
 *
 *  The relativistic image of the disk is not painted on: every vertex is
 *  moved to where its light actually arrives. For a photon leaving the
 *  disk at radius r and reaching the observer after sweeping an angle γ
 *  around the hole, general relativity fixes one number — the impact
 *  parameter b — and b IS the apparent radius of that point in the image.
 *  So the whole lensed picture is a per-vertex lookup of b(r, γ):
 *
 *    · γ ≈ 0     the near side, straight through, b ≈ 0   → in front of
 *                the shadow;
 *    · γ ≈ π     the far side, bent right over the top, b large → the
 *                arc above the shadow. That arc is the Interstellar
 *                silhouette, and it falls out of the integration;
 *    · γ = 2π−γ  the same disk seen the other way round → the second
 *                image, the thinner arc under the shadow;
 *    · γ → ∞     b → b_crit: every further winding piles onto the photon
 *                ring hugging the shadow's edge.
 *
 *  b(r, γ) has no elementary closed form, so it is integrated ONCE on the
 *  CPU into a table and read per vertex on the GPU. That is the whole
 *  trick: the physics is paid for at load time, not per pixel per frame,
 *  which is what lets the image run at native resolution instead of the
 *  quarter-res upscale a per-pixel geodesic march has to settle for.
 *
 *  Units: r_s = 2M = 1, so M = 0.5, the horizon sits at r = 1, the photon
 *  sphere at r = 1.5 and the shadow's apparent radius is b_crit = 3√3·M
 *  = 2.598 — two and a half times the horizon. That factor is the reason
 *  the naive "black sphere of radius 1" reads so much smaller than the
 *  real thing.
 * ------------------------------------------------------------------ */

const M = 0.5;
const B_CRIT = 3 * Math.sqrt(3) * M;      // 2.5980762 — apparent shadow radius
const TWO_PI = Math.PI * 2;

/** u'' = -u + 3M u², with u = 1/r and ' = d/dφ. */
function accel(u) {
  return -u + 3 * M * u * u;
}

/**
 * Solve b(r, γ) for every r on a log grid and every γ on a uniform grid,
 * for an observer at radius D.
 *
 * Strategy: shoot BACKWARDS. One trajectory per impact parameter, started
 * at the observer and integrated inwards; every time it crosses one of the
 * grid radii it deposits a sample (γ, b) for that radius. A few hundred
 * trajectories therefore fill the whole table, instead of one root-find
 * per table cell.
 *
 * Returns { data, nG, nR, gMax, rMin, rMax, D } with data as RGBA float:
 *   R = b, G = cos ψ at the source (signed: <0 means emitted inward),
 *   B = cos ξ at the observer (signed: <0 means the source is further out
 *       than the observer, i.e. behind us), A = 1 where solved.
 */
function buildLensTable({ D, rMin, rMax, nR = 128, nG = 1536, gMax = Math.PI * 3.02 }) {
  const rGrid = new Float64Array(nR);     // ascending
  const uOf = new Float64Array(nR);       // descending
  const lnA = Math.log(rMin), lnB = Math.log(rMax);
  for (let j = 0; j < nR; j++) {
    rGrid[j] = Math.exp(lnA + (lnB - lnA) * (j / (nR - 1)));
    uOf[j] = 1 / rGrid[j];
  }
  // rows[j] = flat [γ, b, cosψ, cosξ] quadruples for radius rGrid[j]
  const rows = new Array(nR);
  for (let j = 0; j < nR; j++) rows[j] = [];

  const bMaxObs = D / Math.sqrt(1 - 1 / D);
  const bs = [];
  // (a) b < b_crit — these plunge, and they are the near side of the disk
  //     seen straight through, imaged INSIDE the shadow's outline.
  for (let k = 0; k < 300; k++) bs.push(B_CRIT * ((k + 0.5) / 300));
  // (b) b > b_crit — log-spaced in the excess over b_crit, because that is
  //     the coordinate in which the winding images are evenly spread.
  const e0 = Math.log(2e-7), e1 = Math.log(Math.max(1e-6, bMaxObs / B_CRIT - 1));
  for (let k = 0; k < 900; k++) bs.push(B_CRIT * (1 + Math.exp(e0 + (e1 - e0) * (k / 899))));

  const u0 = 1 / D;
  const uEsc = 1 / (rMax * 1.02);         // past the outer rim it can never come back
  const H = 0.0025;
  const outwardToo = rMax > D * 0.995;    // observer inside the disk's outer rim

  for (let bi = 0; bi < bs.length; bi++) {
    const b = bs[bi];
    const q0 = 1 / (b * b) - u0 * u0 + u0 * u0 * u0;
    if (q0 <= 0) continue;                // not reachable from the observer
    const sinXi = Math.min(1, b * Math.sqrt(1 - 1 / D) / D);
    const cosXiMag = Math.sqrt(Math.max(0, 1 - sinXi * sinXi));

    for (let leg = 0; leg < (outwardToo ? 2 : 1); leg++) {
      const inward = leg === 0;
      const cosXi = inward ? cosXiMag : -cosXiMag;
      let u = u0;
      let du = (inward ? 1 : -1) * Math.sqrt(q0);
      let phi = 0;
      let prevU = u, prevPhi = 0;
      // pointer into the radius grid: next index to be crossed going inward
      let ptr = nR - 1;
      while (ptr >= 0 && u >= uOf[ptr]) ptr--;
      let a = accel(u);

      for (let step = 0; step < 9000; step++) {
        // velocity Verlet — one force evaluation per step, and it sails
        // straight through the periastron where du passes through zero.
        prevU = u; prevPhi = phi;
        u += du * H + 0.5 * a * H * H;
        const a2 = accel(u);
        du += 0.5 * (a + a2) * H;
        a = a2;
        phi += H;

        if (du > 0) {
          while (ptr >= 0 && u >= uOf[ptr]) {
            const f = (uOf[ptr] - prevU) / (u - prevU);
            record(rows[ptr], prevPhi + f * H, b, rGrid[ptr], +1, cosXi);
            ptr--;
          }
        } else {
          while (ptr < nR - 1 && u <= uOf[ptr + 1]) {
            ptr++;
            const f = (uOf[ptr] - prevU) / (u - prevU);
            record(rows[ptr], prevPhi + f * H, b, rGrid[ptr], -1, cosXi);
          }
        }

        if (u >= 1) break;                       // swallowed
        if (phi > gMax + 0.08) break;
        if (du < 0 && u < uEsc) break;           // gone, and never coming back
        if (!inward && u < uEsc) break;
      }
    }
  }

  // ---- resample each radius onto the uniform γ grid ----
  const data = new Float32Array(nG * nR * 4);
  const scratch = [];
  for (let j = 0; j < nR; j++) {
    const raw = rows[j];
    scratch.length = 0;
    for (let k = 0; k < raw.length; k += 4) {
      scratch.push([raw[k], raw[k + 1], raw[k + 2], raw[k + 3]]);
    }
    // γ = 0 means the source sits exactly on the observer's radial line:
    // the light travels straight, b = 0. In front of us if the source is
    // nearer than we are, behind us if it is further out.
    const behind = rGrid[j] > D;
    scratch.push([0, 0, behind ? -1 : 1, behind ? -1 : 1]);
    scratch.sort((p, q) => p[0] - q[0]);

    let s = 0;
    for (let g = 0; g < nG; g++) {
      const gamma = gMax * (g / (nG - 1));
      while (s + 1 < scratch.length && scratch[s + 1][0] < gamma) s++;
      const A = scratch[s];
      const B = scratch[Math.min(s + 1, scratch.length - 1)];
      const span = B[0] - A[0];
      const f = span > 1e-9 ? Math.min(1, Math.max(0, (gamma - A[0]) / span)) : 0;
      const o = (j * nG + g) * 4;
      data[o] = A[1] + (B[1] - A[1]) * f;
      data[o + 1] = A[2] + (B[2] - A[2]) * f;
      data[o + 2] = A[3] + (B[3] - A[3]) * f;
      data[o + 3] = 1;
    }
  }
  return { data, nG, nR, gMax, rMin, rMax, D };
}

/** One (γ, b) sample for a radius. `dir` is +1 when the photon leaves the
 *  disk outwards (ψ < 90°) and −1 when it is launched inwards and has to
 *  swing round its periastron first. */
function record(out, gamma, b, r, dir, cosXi) {
  if (!(gamma > 0) || !isFinite(gamma)) return;
  const sinPsi = Math.min(1, b * Math.sqrt(Math.max(1e-6, 1 - 1 / r)) / r);
  const cosPsi = dir * Math.sqrt(Math.max(0, 1 - sinPsi * sinPsi));
  out.push(gamma, b, cosPsi, cosXi);
}

function lensTexture(THREE, table) {
  const tex = new THREE.DataTexture(
    table.data, table.nG, table.nR, THREE.RGBAFormat, THREE.FloatType
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---------- the GLSL half of the same idea ---------- */

/**
 * Shared vertex-shader chunk. `lensApparent(P)` takes a point in the
 * model's own space and returns where the observer actually sees it,
 * together with the numbers the shading needs.
 *
 * The table is sampled with NEAREST and interpolated by hand: b crosses
 * three orders of magnitude between the outer disk and the photon ring,
 * and hardware float filtering is not guaranteed on WebGL2 without an
 * extension. Four taps and a mix cost nothing at vertex rate.
 */
const LENS_CHUNK = `
uniform sampler2D uLens;
uniform vec2  uLensDim;      // (nG, nR)
uniform vec2  uLensLogR;     // (log rMin, 1 / (log rMax - log rMin))
uniform float uLensGMax;
uniform vec3  uObs;          // observer, in the hole's frame
uniform float uObsD;         // |uObs|
uniform float uObsK;         // sqrt(1 - 1/D) / D
uniform vec3  uCamUp;
uniform float uOrder;        // 0 direct · 1 the way round · 2 once more

const float TAU = 6.28318530718;

vec4 lensFetch(float r, float gamma) {
  vec2 tc = vec2(
    clamp(gamma / uLensGMax, 0.0, 1.0) * (uLensDim.x - 1.0),
    clamp((log(r) - uLensLogR.x) * uLensLogR.y, 0.0, 1.0) * (uLensDim.y - 1.0)
  );
  vec2 f  = fract(tc);
  vec2 p0 = (floor(tc) + 0.5) / uLensDim;
  vec2 p1 = (min(floor(tc) + 1.0, uLensDim - 1.0) + 0.5) / uLensDim;
  vec4 a = texture2D(uLens, vec2(p0.x, p0.y));
  vec4 b = texture2D(uLens, vec2(p1.x, p0.y));
  vec4 c = texture2D(uLens, vec2(p0.x, p1.y));
  vec4 d = texture2D(uLens, vec2(p1.x, p1.y));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

struct Lensed {
  vec3  world;    // where to draw it
  float r;        // emission radius
  float b;        // apparent radius in the image
  vec3  nEmit;    // direction the photon actually left in
  vec3  ehat;     // image-plane direction (already flipped for order 1)
};

Lensed lensApparent(vec3 P) {
  Lensed L;
  float r  = max(length(P), 1.02);
  vec3  Pn = P / r;
  vec3  u  = uObs / uObsD;
  float cg = clamp(dot(Pn, u), -1.0, 1.0);
  float gamma = acos(cg);

  vec3 perp = Pn - u * cg;
  float pl  = length(perp);
  // Dead on the observer's axis the image-plane direction is undefined —
  // b is ~0 there anyway, so any consistent direction does.
  vec3 e = pl > 1e-4 ? perp / pl : normalize(uCamUp - u * dot(uCamUp, u));

  float side = 1.0;
  float g = gamma;
  if (uOrder > 1.5)      { g = TAU + gamma; }
  else if (uOrder > 0.5) { g = TAU - gamma; side = -1.0; }

  vec4 T = lensFetch(r, g);
  float b = T.r;

  float sinXi = clamp(b * uObsK, -1.0, 1.0);
  float cosXi = sign(T.b + 1e-6) * sqrt(max(0.0, 1.0 - sinXi * sinXi));
  vec3  eImg  = e * side;
  vec3  dir   = normalize(-u * cosXi + eImg * sinXi);

  float cosPsi = clamp(T.g, -1.0, 1.0);
  float sinPsi = sqrt(max(0.0, 1.0 - cosPsi * cosPsi));
  vec3  that   = pl > 1e-4 ? normalize(u - Pn * cg) : e;

  L.world = uObs + dir * uObsD;
  L.r     = r;
  L.b     = b;
  L.nEmit = normalize(Pn * cosPsi + that * (side * sinPsi));
  L.ehat  = eImg;
  return L;
}

/* Doppler beaming + gravitational redshift of gas on a circular orbit.
   Returns (boost, blueness). The plasma is prograde about +Y. */
vec2 lensBeam(vec3 P, float r, vec3 nEmit, float beamPow) {
  vec3  vdir = normalize(cross(vec3(0.0, 1.0, 0.0), P));
  float v    = min(0.72, sqrt(0.5 / max(r - 1.0, 0.35)));
  vec3  beta = vdir * v;
  float G    = 1.0 / sqrt(max(1e-4, 1.0 - v * v));
  float dop  = 1.0 / max(0.07, G * (1.0 - dot(beta, nEmit)));
  float grav = sqrt(max(0.02, 1.0 - 1.0 / max(r, 1.02)));
  return vec2(pow(dop, beamPow) * grav, clamp((dop - 1.0) * 0.30, 0.0, 0.85));
}

/* Image-space billboard: a point given as a radius in the image and a
   direction in the observer's screen plane. Shadow, photon ring and the
   bloom veils are built this way — they exist only as an image. */
vec3 lensBillboard(vec2 xy, float b) {
  vec3 u     = uObs / uObsD;
  vec3 right = normalize(cross(uCamUp, u));
  vec3 up    = cross(u, right);
  vec2 d     = length(xy) > 1e-6 ? normalize(xy) : vec2(1.0, 0.0);
  vec3 e     = right * d.x + up * d.y;
  float sinXi = clamp(b * uObsK, -1.0, 1.0);
  float cosXi = sqrt(max(0.0, 1.0 - sinXi * sinXi));
  return uObs + normalize(-u * cosXi + e * sinXi) * uObsD;
}
`;

export { M, B_CRIT, buildLensTable, lensTexture, LENS_CHUNK };
