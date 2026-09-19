/* GARGANTUA NELLA FASCIA DEL SITO — la scena, e basta.
 * ---------------------------------------------------------------------------
 * Gira in DUE posti con lo stesso codice: dentro un Worker su un
 * OffscreenCanvas (la strada buona: la generazione delle texture, 1-3 s di
 * calcolo, non tocca mai il filo della pagina e lo scroll resta libero) e,
 * dove l'OffscreenCanvas non fa WebGL (Safari prima della 17), sul filo
 * principale con texture piu' piccole. Chi la chiama ha gia' messo
 * `self.THREE` (e nel worker `self.window = self`), perche' i tre pezzi
 * copiati da Animazioni3d leggono `window.THREE` all'import.
 *
 * I pezzi (`lens.js`, `model.js`, `plasma.js`) sono copie INTATTE: qui si fa
 * solo cio' che faceva `page.js` del file definitivo — tabella della lente,
 * uniform per fotogramma, avvezione limitata — piu' cio' che la fascia chiede:
 * inquadratura larga e bassa, tono e sRGB (gli shader escono in LINEARE,
 * vedi la testa di model.js: nel tempio li fa il composer, qui una passata
 * finale), pausa, dimensioni che cambiano, trascinamento a schermo intero.
 *
 * TRAPPOLE di Gargantua che valgono anche qui (LEGGIMI della cartella viva):
 *   5  esattamente sul piano del disco l'immagine degenera: l'elevazione non
 *      scende mai sotto 0,055 rad;
 *   7  l'avvezione del plasma va LIMITATA (flow a due copie), mai t illimitato;
 *   9  `plasma`/`filaments` dentro `lens` NON sono morti: senza, il disco
 *      sparisce senza un errore.
 * --------------------------------------------------------------------------- */
import { buildLensTable, lensTexture } from './lens.js';
import { buildBlackHole, buildStarfield, RADII } from './model.js';
import { plasmaTexture } from './plasma.js';

const THREE = self.THREE;

/* L'inquadratura. D fissa: la tabella della lente vale per UNA distanza, e il
   trascinamento a schermo intero cambia solo gli angoli. 30 r_s invece dei
   20,6 del file definitivo: una fascia 6:1 con un campo stretto vuole la
   camera piu' lontana, o i bordi si deformano. */
const VISTA = { D: 30, elev: 7 * Math.PI / 180, azim: 0.62 };
const ELEV_MIN = 0.07;            // > 0,055: trappola 5
const ELEV_MAX = 1.25;

export function creaScena(canvas, { basso = false, avviso = () => {} } = {}) {
  const t0 = performance.now();
  THREE.ColorManagement.enabled = false;   // come il tempio (motore.js): i colori
                                           // degli shader sono tarati cosi'

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, depth: true, stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* --- il modello, come in page.js --- */
  const plasma = plasmaTexture(basso
    ? { w: 2048, h: 256, doppler: 0, shear: 0.95, streak: 1.30, detail: 1.5 }
    : { w: 4096, h: 512, doppler: 0, shear: 0.95, streak: 1.30, detail: 1.5 });
  plasma.premultiplyAlpha = false;
  const filaments = plasmaTexture(basso
    ? { w: 1024, h: 160, doppler: 0, shear: 0.70, filaments: true, detail: 1.4 }
    : { w: 2048, h: 320, doppler: 0, shear: 0.70, filaments: true, detail: 1.4 });
  filaments.premultiplyAlpha = false;

  const uniforms = {
    uLens: { value: null },
    uLensDim: { value: new THREE.Vector2(1, 1) },
    uLensLogR: { value: new THREE.Vector2(0, 1) },
    uLensGMax: { value: 1 },
    uObs: { value: new THREE.Vector3(0, 0, VISTA.D) },
    uObsD: { value: VISTA.D },
    uObsK: { value: Math.sqrt(1 - 1 / VISTA.D) / VISTA.D },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
  };
  const rMin = RADII.DISK_IN * 0.80;
  const rMax = RADII.DISK_OUT * 1.06;      // D > DISK_OUT: basta il bordo (gargantua.js)
  const tab = buildLensTable({ D: VISTA.D, rMin, rMax });
  uniforms.uLens.value = lensTexture(THREE, tab);
  uniforms.uLensDim.value.set(tab.nG, tab.nR);
  uniforms.uLensLogR.value.set(Math.log(rMin), 1 / (Math.log(rMax) - Math.log(rMin)));
  uniforms.uLensGMax.value = tab.gMax;

  const bh = buildBlackHole({ uniforms, plasma, filaments });   // trappola 9
  const cielo = buildStarfield();

  /* Sui telefoni, meno granelli: la GEOMETRIA resta quella (e' nel modulo
     intatto), se ne disegna una parte. I granelli sono in ordine casuale,
     quindi i primi N sono un campione uniforme del disco. */
  const polvere = bh.group.getObjectByName('plasma_particulates');
  if (basso && polvere) {
    const n = polvere.geometry.attributes.position.count;
    polvere.geometry.setDrawRange(0, Math.round(n * 0.42));
    bh.materials.dustMat.uniforms.uGain.value *= 1.45;   // stessa «materia» a vista
  }

  const scena = new THREE.Scene();
  scena.add(cielo);
  scena.add(bh.group);

  const camera = new THREE.PerspectiveCamera(20, 4, 0.05, 3000);
  let azim = VISTA.azim, elev = VISTA.elev;
  function piazza() {
    camera.position.set(
      Math.cos(azim) * Math.cos(elev) * VISTA.D,
      Math.sin(elev) * VISTA.D,
      Math.sin(azim) * Math.cos(elev) * VISTA.D);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }
  piazza();

  /* --- la passata finale: HDR lineare -> ACES -> sRGB ---
     Tutti gli strati sono additivi e superano 1: il tono va applicato DOPO la
     somma, quindi la scena si rende in un buffer a mezza virgola mobile e si
     comprime una volta sola (e' quello che fa il composer del tempio). */
  const gl = renderer.getContext();
  const galleggia = !!(gl.getExtension('EXT_color_buffer_float') ||
                       gl.getExtension('EXT_color_buffer_half_float'));
  const rt = new THREE.WebGLRenderTarget(4, 4, {
    type: galleggia ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: basso ? 0 : 4,
    depthBuffer: false,
  });
  const quadro = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: true, depthTest: false, depthWrite: false }));
  quadro.frustumCulled = false;
  const scenaQuadro = new THREE.Scene();
  scenaQuadro.add(quadro);
  const camQuadro = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* Il fondo: deve USCIRE come il #04050A del file definitivo (trappola 2 del
     LEGGIMI: il colore di sfondo lo decide la scena, non un canvas
     trasparente). Qui pero' il fondo passa dal tono: 0x04050a scritto tale e
     quale usciva blu notte (misurato: 7,9,19 gia' con una prima correzione).
     Con questi valori LINEARI l'ACES di three restituisce (5,6,13) sullo
     scatto, contro i (4,5,10) del definitivo: misurato, non stimato. */
  renderer.setClearColor(new THREE.Color(0.0072, 0.0085, 0.0145), 1);

  /* --- dimensioni --- */
  let cssW = 4, cssH = 4, dprChiesto = 1, fattore = 1, pieno = false;
  function applicaDimensioni() {
    const dpr = Math.max(0.5, dprChiesto * fattore);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
    const bw = Math.max(1, Math.round(cssW * dpr)), bh2 = Math.max(1, Math.round(cssH * dpr));
    rt.setSize(bw, bh2);
    const asp = cssW / cssH;
    /* Meta' altezza visibile, in r_s sul piano del buco: abbastanza per l'arco
       sopra e sotto l'ombra, e allargata dove la fascia e' stretta perche' il
       disco ci stia (sul telefono le ali sfumano oltre il bordo, ed e' giusto:
       dal 70 % del raggio il plasma si spegne da se'). */
    const mezza = pieno ? Math.max(5.6, (asp < 1 ? 11 : 14.5) / asp)   // in verticale le ali escono: il buco resta leggibile
                        : Math.max(4.6, 10.2 / asp);
    camera.aspect = asp;
    camera.fov = 2 * Math.atan(mezza / VISTA.D) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    bh.materials.dustMat.uniforms.uPix.value = bh2 / (2 * Math.tan(camera.fov * Math.PI / 360));
  }

  /* --- il fotogramma: cio' che page.js fa a ogni giro --- */
  const camUp = new THREE.Vector3();
  let t = 0;
  function disegna() {
    const D = camera.position.length();
    uniforms.uObs.value.copy(camera.position);
    uniforms.uObsD.value = D;
    uniforms.uObsK.value = Math.sqrt(Math.max(1e-4, 1 - 1 / D)) / D;
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    uniforms.uCamUp.value.copy(camUp);

    bh.uniforms.time.value = t;
    const ph = t / bh.flowCycle;                       // trappola 7
    const f0 = ph - Math.floor(ph);
    const f1 = (ph + 0.5) - Math.floor(ph + 0.5);
    bh.uniforms.flow.value.set(f0 * bh.flowCycle, f1 * bh.flowCycle, Math.abs(1 - 2 * f0));

    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scena, camera);
    renderer.setRenderTarget(null);
    renderer.render(scenaQuadro, camQuadro);
  }

  /* --- il giro: gira solo quando serve --- */
  const raf = self.requestAnimationFrame ? (f) => self.requestAnimationFrame(f)
                                         : (f) => setTimeout(() => f(performance.now()), 16);
  let corre = false, prenotato = false, ultimo = 0, frames = 0;
  let finestra = [], fps = 0, daRidurre = 0;
  function giro(ora) {
    prenotato = false;
    if (!corre) return;
    const dt = ultimo ? Math.min(0.1, (ora - ultimo) / 1000) : 0;
    ultimo = ora;
    t += dt;
    disegna();
    frames++;
    if (dt > 0) {
      finestra.push(dt);
      const somma = finestra.reduce((a, b) => a + b, 0);
      if (somma >= 1 && finestra.length >= 3) {      // una misura al secondo
        fps = finestra.length / somma;
        finestra = [];
        /* GPU debole: sotto i 40 fps per due finestre di fila si scende di
           risoluzione, fino a meta'. Lo scroll della pagina non si ferma per
           un buco nero. */
        if (fps < 40 && fattore > 0.55) {
          if (++daRidurre >= 2) { fattore = Math.max(0.5, fattore * 0.8); daRidurre = 0; applicaDimensioni(); }
        } else daRidurre = 0;
        avviso({ tipo: 'stato', fps: +fps.toFixed(1), frames, fattore: +fattore.toFixed(2),
                 buffer: [renderer.domElement.width, renderer.domElement.height] });
      }
    }
    prenota();
  }
  function prenota() { if (corre && !prenotato) { prenotato = true; raf(giro); } }

  const msPronto = performance.now() - t0;
  let gpu = '';
  try {
    const x = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) { /* non e' un guasto: e' solo un'etichetta per le prove */ }

  return {
    msPronto: +msPronto.toFixed(0),
    galleggia, gpu,
    dimensiona(w, h, dpr, eraPieno) {
      cssW = Math.max(1, w); cssH = Math.max(1, h); dprChiesto = dpr;
      if (eraPieno !== undefined && eraPieno !== pieno) {
        pieno = eraPieno;
        if (!pieno) { azim = VISTA.azim; elev = VISTA.elev; piazza(); }
      }
      applicaDimensioni();
      disegna();                   // mai un fotogramma stirato dopo un cambio
      avviso({ tipo: 'dimensioni', buffer: [renderer.domElement.width, renderer.domElement.height], pieno });
    },
    corri(si) {
      if (si === corre) return;
      corre = si; ultimo = 0; finestra = [];
      if (si) prenota();
    },
    gira(dx, dy) {
      azim += dx * 0.0055;
      elev = Math.min(ELEV_MAX, Math.max(ELEV_MIN, elev + dy * 0.0045));
      piazza();
      if (!corre) disegna();
    },
    disegna,
    stato() {
      return { fps: +fps.toFixed(1), frames, fattore,
               buffer: [renderer.domElement.width, renderer.domElement.height], pieno };
    },
  };
}
