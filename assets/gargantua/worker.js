/* IL WORKER DI GARGANTUA — tutto il peso lontano dal filo della pagina.
 *
 * La mappa d'importazione di index.html NON vale dentro un worker, quindi
 * l'indirizzo di three arriva dalla pagina (che lo legge proprio da quella
 * mappa: una sola verita' sulla versione).
 *
 * I pezzi copiati da Animazioni3d leggono `window.THREE` e creano le texture
 * con `document.createElement('canvas')`: qui non ci sono ne' window ne'
 * document, e si danno loro un globale e un OffscreenCanvas 2D. Nessuna riga
 * dei pezzi cambia. */
let scena = null;
const coda = [];

function manda(m) { self.postMessage(m); }

self.onmessage = async (e) => {
  const m = e.data;
  if (m.tipo !== 'avvia') {
    if (!scena) { coda.push(m); return; }
    esegui(m);
    return;
  }
  try {
    const THREE = await import(m.three);
    self.window = self;
    self.THREE = THREE;
    if (!self.document) {
      self.document = { createElement: () => new OffscreenCanvas(1, 1) };
    }
    const { creaScena } = await import('./scena.js?v=1');
    scena = creaScena(m.canvas, { basso: m.basso, avviso: manda });
    scena.dimensiona(m.w, m.h, m.dpr, false);
    manda({ tipo: 'pronto', ms: scena.msPronto, galleggia: scena.galleggia, gpu: scena.gpu });
    while (coda.length) esegui(coda.shift());
  } catch (err) {
    manda({ tipo: 'errore', msg: String(err && err.stack || err) });
  }
};

function esegui(m) {
  if (m.tipo === 'dimensioni') scena.dimensiona(m.w, m.h, m.dpr, m.pieno);
  else if (m.tipo === 'corri') scena.corri(m.si);
  else if (m.tipo === 'gira') scena.gira(m.dx, m.dy);
}
