/* COPIA PER IL SITO VETRINA (19/09/2026). L'ORIGINALE VIVO E' QUESTO:
     G:\A.T\Animazioni3d\sorgenti\tempio\cielo\gargantua\plasma.js
   Chi aggiorna Gargantua aggiorna la' e ricopia qui. Sotto questo commento il
   file e' identico all'originale, byte per byte: nessuna riga cambiata. */
/* copiato da Gargantua/gargantua-definitivo.html (righe 559-776: costanti del
   modello + rumore + rampa + generatori di texture del plasma) il 29/08;
   l'originale non si tocca.
   UNICA modifica: ESM — THREE dal globale del motore invece di `import 'three'`,
   e la lista di export in fondo. Il corpo e' intatto. */
const THREE = window.THREE;

/* ===== gargantua-model.js ===== */
/* ------------------------------------------------------------------ *
 *  Gargantua-class supermassive rotating black hole.
 *
 *  Scale convention: horizon radius R = 1 (a real M ≈ 10⁸ M☉ hole is
 *  ~3×10¹¹ m across, so treat 1 unit ≈ 1.5×10¹¹ m). Spin axis = +Y.
 *  ISCO of a near-extremal Kerr hole sits just outside the horizon, so
 *  the disk's inner edge is close in and white-hot; the photon shell
 *  lives between them at ~1.3 R.
 * ------------------------------------------------------------------ */

const R = 1.0;                 // horizon: r_s = 2M = 1
const DISK_IN = 2.60;         // inner rim of the plasma
const DISK_OUT = 12.0;        // outer rim — the wide, bright accretion disk

/* ---------- value noise / fbm (seamless in azimuth by construction) ---------- */
function hash2(x, y) {
  // Integer mix instead of the sin trick: same character, about three times
  // faster, and the texture is a million-pixel loop on the load path.
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    norm += amp;
    f *= 2.07; amp *= 0.5;
  }
  return s / norm;
}

/* ---------- plasma temperature ramp: white → pale yellow → gold → amber ---------- */
const RAMP = [
  [0.00, 255, 255, 253],
  [0.07, 255, 253, 236],
  [0.20, 255, 242, 189],
  [0.38, 255, 214, 132],
  [0.58, 253, 172,  78],
  [0.78, 226, 118,  34],
  [0.92, 158,  70,  16],
  [1.00,  86,  33,   6],
];
function ramp(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const a = RAMP[i - 1], b = RAMP[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      return [
        a[1] + (b[1] - a[1]) * k,
        a[2] + (b[2] - a[2]) * k,
        a[3] + (b[3] - a[3]) * k,
      ];
    }
  }
  const l = RAMP[RAMP.length - 1];
  return [l[1], l[2], l[3]];
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ---------- accretion-disk texture: u = azimuth, v = radius ---------- */
function plasmaTexture({ w = 2048, h = 512, doppler = 0.62, filaments = false, shear: shearAmt = 1, streak: streakAmt = 1, radialBlur = 0, detail = 1 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);                       // 0 = inner edge, 1 = outer edge
    const rn = 1.4 + t * 6.5;                    // noise domain radius
    // Keplerian shear: inner annuli wind much further round than outer ones.
    const shear = (4.6 / Math.sqrt(0.20 + t) - 3.2) * shearAmt;
    // Density / brightness envelope: sharp hot inner rim, long outer falloff.
    const env =
      smooth(0.0, 0.035, t) *
      (0.13 + 0.87 * Math.pow(1 - t, 2.0)) *
      (1 - smooth(0.86, 1.0, t) * 0.85);
    const [cr, cg, cb] = ramp(Math.pow(t, 0.58));

    for (let x = 0; x < w; x++) {
      const th = (x / w) * Math.PI * 2 + shear;
      const cs = Math.cos(th), sn = Math.sin(th);

      // turbulent cells
      const turb = fbm(cs * rn * 1.7 * detail, sn * rn * 1.7 * detail, detail < 0.8 ? 3 : 5);
      // fine radial/azimuthal streaking, sheared with the flow
      const streak = fbm(cs * rn * 13.0 * detail, sn * rn * 13.0 * detail + t * 9.0, 3);
      // large-scale density waves
      const wave = fbm(cs * rn * 0.55 * detail, sn * rn * 0.55 * detail, 2);

      // A third, much finer strand layer. This is the one that reads as
      // DENSITY: the eye judges how much gas is there from how much fine
      // structure survives, not from how bright the average is.
      const fine = fbm(cs * rn * 31.0 * detail, sn * rn * 31.0 * detail + t * 19.0, 2);
      // Spiral overdensities — real disks have them, and they are what makes
      // the plate read as matter piled up rather than a painted gradient.
      const arms = 0.45 + 1.05 * Math.pow(Math.max(0, wave), 1.5);

      let lum;
      if (filaments) {
        const f = Math.pow(Math.max(0, turb * 0.42 + streak * 0.72 + fine * 0.5 - 0.60), 1.75);
        lum = f * 8.4 * env;
      } else {
        lum =
          env * arms *
          (0.17 + 0.44 * turb + 0.52 * streakAmt * streak + 0.40 * fine);
      }

      // Relativistic Doppler beaming + gravitational blueshift of the inner
      // annuli: the approaching limb (−sin θ side) is far brighter and bluer.
      const beam = Math.pow(
        1 + doppler * (-sn) * (0.45 + 0.55 * Math.pow(1 - t, 0.7)),
        2.15
      );
      lum *= beam;
      // Soft highlight rolloff so the beamed limb keeps its structure
      // instead of clipping to a flat white blob.
      lum = (lum / (1 + 0.62 * lum)) * 1.34;

      // Blueshift on the fast approaching side pushes colour toward white.
      const blue = Math.min(1, Math.max(0, (beam - 1) * 0.34));
      let r = cr + (255 - cr) * blue;
      let g = cg + (255 - cg) * blue;
      let b = cb + (255 - cb) * blue * 1.15;

      const a = Math.min(1, Math.max(0, lum));
      const boost = Math.min(1.2, 0.84 + lum * 0.5);
      const i = (y * w + x) * 4;
      d[i]     = Math.min(255, r * boost);
      d[i + 1] = Math.min(255, g * boost);
      d[i + 2] = Math.min(255, b * boost);
      d[i + 3] = a * 255;
    }
  }
  if (radialBlur > 0) {
    // Box blur along v only. The lensed image squeezes the disk's whole
    // radial range into a few dozen pixels, so row-scale detail turns into
    // moiré; smoothing v keeps the azimuthal streaks and drops the moiré.
    const src = new Uint8ClampedArray(d);
    const k = Math.round(radialBlur);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - k), y1 = Math.min(h - 1, y + k);
      const n = y1 - y0 + 1;
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let yy = y0; yy <= y1; yy++) {
          const i = (yy * w + x) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
        }
        const o = (y * w + x) * 4;
        d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = a / n;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false; // v = 0 must be the inner edge (canvas row 0)
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = true;
  return tex;
}

function softSprite(size = 128, hardness = 2.6) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const dd = img.data;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const a = Math.pow(Math.max(0, 1 - r), hardness);
      const i = (y * size + x) * 4;
      dd[i] = dd[i + 1] = dd[i + 2] = 255;
      dd[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blurredCopy(srcCanvas, px) {
  const cv = document.createElement('canvas');
  cv.width = srcCanvas.width; cv.height = srcCanvas.height;
  const ctx = cv.getContext('2d');
  ctx.filter = 'blur(' + px + 'px)';
  ctx.drawImage(srcCanvas, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.anisotropy = 8;
  return tex;
}

export { R, DISK_IN, DISK_OUT, hash2, vnoise, fbm, ramp, smooth, plasmaTexture, softSprite, blurredCopy };
