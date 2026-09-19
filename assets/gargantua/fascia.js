/* LA FASCIA DI GARGANTUA — in cima alla pagina, un quarto di schermo.
 * ---------------------------------------------------------------------------
 * Ordine di Angelo (19/09/2026): «nel sito vetrina la possibilita' di mettere
 * a schermo intero il buco nero Gargantua, che deve essere mostrato
 * orizzontale a 1/4 di schermo all'inizio del sito».
 *
 * Il buco nero e' VIVO: three.js in tempo reale, lo stesso codice del cielo
 * del tempio (`scena.js` + tre pezzi copiati INTATTI da
 * G:\A.T\Animazioni3d\sorgenti\tempio\cielo\gargantua\).
 *
 * Tre strade, in quest'ordine:
 *   worker   OffscreenCanvas + WebGL2 in un Worker: le texture (1-3 s di
 *            calcolo) e ogni fotogramma stanno fuori dal filo della pagina,
 *            quindi lo scroll non sente niente;
 *   pagina   dove l'OffscreenCanvas non fa WebGL (Safari < 17): stessa scena
 *            sul filo principale, texture a un quarto, avviata a pagina
 *            caricata e in un momento di calma;
 *   fermo    niente WebGL, o qualcosa e' andato storto: resta l'immagine
 *            ferma, che e' comunque sotto al canvas fin dal primo istante.
 *
 * Si disegna SOLO quando la fascia e' in vista e la scheda e' attiva (a
 * schermo intero sempre). `?garg=pagina|finto|fermo` forza una strada o lo
 * pseudo-schermo-intero: servono alle prove, non a chi guarda.
 *
 * Lo stato sta in `window.__gargantua` per le prove (sito_scatti.py).
 * --------------------------------------------------------------------------- */
const fascia = document.getElementById('gargantua');
const tela = fascia && fascia.querySelector('canvas');
const tasto = fascia && fascia.querySelector('.garg-pieno');
const chiudi = fascia && fascia.querySelector('.garg-chiudi');

const prova = new URLSearchParams(location.search).get('garg') || '';
const stato = window.__gargantua = {
  modo: 'attesa', pronto: false, pieno: false, finto: false, corre: false,
  fps: 0, buffer: [0, 0], css: [0, 0], errore: null, eventi: [],
};

if (fascia && tela) avvia();

function avvia() {
  /* ----------------------------------------------------- scelta del ramo -- */
  const url3 = indirizzoThree();
  const riduciMoto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const piccolo = Math.min(screen.width, screen.height) < 700;
  const tocco = matchMedia('(pointer: coarse)').matches;
  const basso = (piccolo && tocco) || (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  let porta = null;          // { manda(m) } — worker o scena locale
  let visibile = true;

  function dpr() {
    const d = window.devicePixelRatio || 1;
    if (stato.pieno) return Math.min(d, basso ? 1.25 : 1.5);
    return Math.min(d, basso ? 1.25 : 2);
  }
  function misura() {
    const r = fascia.getBoundingClientRect();
    return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
  }

  function fermo(perche) {
    stato.modo = 'fermo';
    stato.errore = perche || null;
    fascia.classList.add('garg-fermo');
    fascia.classList.remove('garg-vivo');
    if (perche) console.warn('Gargantua: immagine ferma —', perche);
  }

  function pronto(info) {
    stato.pronto = true;
    Object.assign(stato, info || {});
    fascia.classList.add('garg-vivo');
    aggiornaCorsa();
  }

  function ricevi(m) {
    if (m.tipo === 'pronto') pronto({ msPronto: m.ms, galleggia: m.galleggia, gpu: m.gpu });
    else if (m.tipo === 'stato') { stato.fps = m.fps; stato.frames = m.frames; stato.fattore = m.fattore; stato.buffer = m.buffer; }
    else if (m.tipo === 'dimensioni') { stato.buffer = m.buffer; stato.eventi.push('dim ' + m.buffer.join('x') + (m.pieno ? ' pieno' : '')); }
    else if (m.tipo === 'errore') fermo(m.msg);
  }

  function aggiornaCorsa() {
    const si = stato.pronto && !document.hidden && (stato.pieno || (visibile && !riduciMoto));
    if (si === stato.corre) return;
    stato.corre = si;
    if (porta) porta.manda({ tipo: 'corri', si });
  }

  function mandaDimensioni() {
    const { w, h } = misura();
    stato.css = [w, h];
    if (porta) porta.manda({ tipo: 'dimensioni', w, h, dpr: dpr(), pieno: stato.pieno });
  }

  /* ------------------------------------------------------------- i rami -- */
  const puoWorker = prova !== 'pagina' && 'transferControlToOffscreen' in tela &&
                    typeof OffscreenCanvas !== 'undefined' && webgl2Offscreen();

  if (prova === 'fermo' || !url3) {
    fermo(url3 ? 'forzato da ?garg=fermo' : 'manca la mappa d\'importazione di three');
  } else if (puoWorker) {
    stato.modo = 'worker';
    let w;
    try {
      w = new Worker(new URL('./worker.js?v=1', import.meta.url), { type: 'module' });
    } catch (e) { fermo('worker: ' + e); w = null; }
    if (w) {
      const off = tela.transferControlToOffscreen();
      const { w: cw, h: ch } = misura();
      stato.css = [cw, ch];
      w.onmessage = (e) => ricevi(e.data);
      w.onerror = (e) => fermo('worker: ' + (e.message || 'errore'));
      w.postMessage({ tipo: 'avvia', canvas: off, three: url3, basso, w: cw, h: ch, dpr: dpr() }, [off]);
      porta = { manda: (m) => w.postMessage(m) };
    }
  } else if (webgl2Pagina()) {
    stato.modo = 'pagina';
    /* sul filo principale il calcolo delle texture blocca: si aspetta che la
       pagina sia caricata e ferma, e si fanno texture a un quarto. */
    const via = () => (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(async () => {
      try {
        const THREE = await import('three');
        window.THREE = THREE;
        const { creaScena } = await import('./scena.js?v=1');
        const s = creaScena(tela, { basso: true, avviso: ricevi });
        porta = {
          manda: (m) => {
            if (m.tipo === 'dimensioni') s.dimensiona(m.w, m.h, m.dpr, m.pieno);
            else if (m.tipo === 'corri') s.corri(m.si);
            else if (m.tipo === 'gira') s.gira(m.dx, m.dy);
          },
        };
        mandaDimensioni();
        pronto({ msPronto: s.msPronto, galleggia: s.galleggia, gpu: s.gpu });
      } catch (e) { fermo('pagina: ' + e); }
    });
    if (document.readyState === 'complete') via(); else addEventListener('load', via, { once: true });
  } else {
    fermo('WebGL2 non disponibile');
  }

  tela.addEventListener('webglcontextlost', () => fermo('contesto WebGL perso'));

  /* ------------------------------------------- quando disegnare, e quanto -- */
  new IntersectionObserver((voci) => {
    visibile = stato.visibile = voci[voci.length - 1].isIntersecting;
    aggiornaCorsa();
  }, { threshold: 0 }).observe(fascia);
  document.addEventListener('visibilitychange', aggiornaCorsa);

  let attesa = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(attesa);
    attesa = requestAnimationFrame(mandaDimensioni);
  }).observe(fascia);

  /* ------------------------------------------------------- schermo intero --
     Fullscreen API sul contenitore dove c'e' (anche col prefisso webkit, che e'
     cio' che iPad ha); su iPhone Safari la API sugli elementi non esiste, e si
     ripiega su uno pseudo-schermo-intero: position fixed a 100vw x 100dvh, lo
     scroll della pagina bloccato, un tasto per chiudere ed Esc. */
  const vero = !!(fascia.requestFullscreen || fascia.webkitRequestFullscreen) && prova !== 'finto';
  const elPieno = () => document.fullscreenElement || document.webkitFullscreenElement;

  function segna(pieno, finto) {
    stato.pieno = pieno;
    stato.finto = !!(pieno && finto);
    fascia.classList.toggle('pieno', pieno);
    fascia.classList.toggle('pieno-finto', !!(pieno && finto));
    document.documentElement.classList.toggle('garg-bloccato', !!(pieno && finto));
    tasto.setAttribute('aria-pressed', String(pieno));
    tasto.querySelector('.garg-etichetta').textContent = pieno ? 'Exit full screen' : 'Full screen';
    chiudi.hidden = !pieno;
    stato.eventi.push(pieno ? (finto ? 'pieno-finto' : 'pieno') : 'fascia');
    mandaDimensioni();
    aggiornaCorsa();
  }

  function entra() {
    if (vero) {
      const r = fascia.requestFullscreen ? fascia.requestFullscreen({ navigationUI: 'hide' })
                                         : fascia.webkitRequestFullscreen();
      if (r && r.catch) r.catch(() => segna(true, true));   // rifiutata: ripiego
    } else segna(true, true);
  }
  function esci() {
    if (elPieno()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (stato.pieno) segna(false, true);
  }

  tasto.addEventListener('click', () => (stato.pieno ? esci() : entra()));
  chiudi.addEventListener('click', esci);
  const cambio = () => { const p = elPieno() === fascia; if (p !== stato.pieno || stato.finto) segna(p, false); };
  document.addEventListener('fullscreenchange', cambio);
  document.addEventListener('webkitfullscreenchange', cambio);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stato.finto) esci(); });

  /* ------------------------------------ trascinare, solo a schermo intero --
     Nella fascia il canvas non cattura niente: sul telefono lo scroll deve
     passarci sopra come su un'immagine. */
  let presa = null;
  tela.addEventListener('pointerdown', (e) => {
    if (!stato.pieno || !porta) return;
    presa = { x: e.clientX, y: e.clientY, id: e.pointerId };
    tela.setPointerCapture(e.pointerId);
  });
  tela.addEventListener('pointermove', (e) => {
    if (!presa || e.pointerId !== presa.id) return;
    porta.manda({ tipo: 'gira', dx: e.clientX - presa.x, dy: e.clientY - presa.y });
    presa.x = e.clientX; presa.y = e.clientY;
  });
  const lascia = () => { presa = null; };
  tela.addEventListener('pointerup', lascia);
  tela.addEventListener('pointercancel', lascia);
}

/* ------------------------------------------------------------- utilita' -- */
function indirizzoThree() {
  try {
    const m = document.querySelector('script[type="importmap"]');
    return new URL(JSON.parse(m.textContent).imports.three, document.baseURI).href;
  } catch (e) { return null; }
}
function webgl2Offscreen() {
  try {
    const c = new OffscreenCanvas(1, 1);
    const g = c.getContext('webgl2');
    if (!g) return false;
    const x = g.getExtension('WEBGL_lose_context');
    if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}
function webgl2Pagina() {
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2');
    if (!g) return false;
    const x = g.getExtension('WEBGL_lose_context');
    if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}
