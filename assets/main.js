/* Leone Awakens Studio — la vetrina.
   ---------------------------------------------------------------------------
   I video di questa pagina sono ANTEPRIME FILIGRANATE prodotte da
   `tools/sito_vetrina.py` nel progetto A.T: 960 px di lato lungo contro i
   3840 del master, senza audio, con la scritta a tappeto. Chi scarica il file
   dalla rete si porta via qualcosa che non puo' usare — che e' il punto.
   Se qui si aggiunge una voce nuova, il file va prodotto da quello strumento,
   MAI copiato a mano dal master.

   `secondi` e `fotogrammi` sono misure vere dei master, lette con ffprobe:
   stanno in pagina perche' sono l'argomento di vendita («il loop chiude»), e
   un numero scritto a mano invecchia in silenzio.
   --------------------------------------------------------------------------- */

var LOOPS = [
  { file: "loop-merkaba", title: "Merkaba", secondi: 35.9, frames: 1077,
    desc: "Two counter-rotating tetrahedra in glass and gold, turning at rates quantised to the loop." },
  { file: "loop-saturn", title: "Saturn's rings", secondi: 30.0, frames: 900,
    desc: "NASA plate maps, rings with alpha and light transmission, the planet's shadow falling across them." },
  { file: "loop-lotus", title: "Golden lotus", secondi: 32.0, frames: 960,
    desc: "Petals laid out by phyllotaxis, each with its own curve, so none of them pass through another." },
  { file: "loop-tree-of-life", title: "Tree of life", secondi: 10.0, frames: 300,
    desc: "Ten glass spheres on twenty-two paths, breathing on a slow sway. Built from the layout, not traced." },
  { file: "loop-chakras", title: "Column of the seven chakras", secondi: 10.0, frames: 300,
    desc: "Seven wheels on one axis, each turning at its own rate, all landing together at the end." },
  { file: "loop-eye-of-horus", title: "Eye of Horus", secondi: 17.0, frames: 510,
    desc: "Carved gold on dark stone, on a push-in that arrives back where it started." },
  { file: "loop-singing-bowl", title: "Tibetan singing bowl", secondi: 24.0, frames: 720,
    desc: "Hammered bronze, with the standing wave on the water read off the bowl's own vibration mode." },
  { file: "loop-ankh", title: "Egyptian ankh", secondi: 9.2, frames: 276,
    desc: "Polished gold under a coherent light environment: the reflections come from the scene." },
  { file: "loop-seed", title: "Germinating seed", secondi: 22.0, frames: 660,
    desc: "A seed splits, roots reach down, the stem finds the light — and the frame returns to the seed." }
];

var MADE = [
  { file: "nebulosa", ratio: "v", title: "Nebula",
    desc: "A 3,000-star galaxy with differential rotation, drawn frame by frame to canvas." },
  { file: "scuola", ratio: "v", title: "Character test",
    desc: "Expression handled as configuration, and the stage treated as a body that reacts." },
  { file: "duesfere", ratio: "v", title: "Two spheres in fusion",
    desc: "Coupled oscillators in three.js. Cut the coupling and they never meet." },
  { file: "esplosione", ratio: "s", title: "Nuclear explosion in vacuum",
    desc: "Camera shake measured off real footage rather than invented." },
  { file: "triangolo", ratio: "16", title: "Thought, emotion, action",
    desc: "Plasma caged inside the shape, then the shape corrodes." },
  { file: "gag", ratio: "16", title: "BIT hits the target",
    desc: "Four seconds of character timing, in our own style. Silent by design." }
];

var YT = [
  { id: "dOgol2CtWO0", n: "174", title: "The State Comes First",
    desc: "28 cuts in 80 seconds, framing tracked to the speaker's face." },
  { id: "fdl7u3EXWfo", n: "191", title: "Your Body Already Wrote Tomorrow",
    desc: "Three in-house 3D objects cut into the edit: lattice, cymatics, flower of life." },
  { id: "8rtPojJ3YSU", n: "195", title: "The Money Belief You Never Chose",
    desc: "A circular structure, rebuilt by hand over eight edit revisions." },
  { id: "E5FQMQetIwg", n: "193", title: "He Said It In Black And White",
    desc: "Archive footage graded to sit beside material shot a year apart." },
  { id: "KUuS-hC3hrU", n: "185", title: "You Decide What Reality Even Means",
    desc: "An automatic first cut rewritten into four blocks of 11 to 15 seconds." },
  { id: "4W-LA9rkBkg", n: "186", title: "You Already Have Faith",
    desc: "An animation built for one sentence: the beam reverses on the word believing." },
  { id: "ZNKQz5Dta28", n: "184", title: "The Blessing Hidden In Your Breakdown",
    desc: "Pure clipping. No generated stills, no animation — quote choice, cuts and captions." },
  { id: "Wiz8XLk9tNE", n: "180", title: "Four Masters, One Method",
    desc: "Four speakers, one argument, in ninety seconds." }
];

/* --------------------------------------------------------------------- */
function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function misure(v) {
  return '<span class="r-name">' + v.title + "</span>" +
         "<span>" + v.secondi.toFixed(1) + " s</span>" +
         "<span>" + v.frames + " frames</span>" +
         "<span>3840 &times; 2160</span>" +
         "<span>30 fps</span>" +
         "<span>seamless</span>";
}

/* ------------------------------------------------- il lettore in testa -- */
(function lettore() {
  var video = document.getElementById("stage-video");
  var strip = document.getElementById("strip");
  var readout = document.getElementById("readout");
  if (!video || !strip || !readout) return;

  function scegli(i) {
    var v = LOOPS[i];
    video.src = "assets/work/" + v.file + ".mp4";
    video.poster = "assets/work/" + v.file + ".jpg";
    video.setAttribute("aria-label", v.title + ", a seamless 4K loop");
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay negato: resta il poster */ });
    readout.innerHTML = misure(v);
    Array.prototype.forEach.call(strip.querySelectorAll("button"), function (b, k) {
      b.setAttribute("aria-current", k === i ? "true" : "false");
    });
  }

  LOOPS.forEach(function (v, i) {
    var li = el("li");
    var b = el("button");
    b.type = "button";
    b.setAttribute("aria-label", "Play " + v.title);
    var img = el("img");
    img.src = "assets/work/" + v.file + ".jpg";
    img.alt = "";
    img.loading = "lazy";
    b.appendChild(img);
    b.addEventListener("click", function () { scegli(i); });
    li.appendChild(b);
    strip.appendChild(li);
  });

  scegli(0);
})();

/* ------------------------------------- le griglie di clip locali (mp4) -- */
function cella(v, ratio, conMisure) {
  var fig = el("figure", "cell ratio-" + ratio);
  var btn = el("button", "fr");
  btn.type = "button";
  btn.setAttribute("aria-label", "Play " + v.title);

  var img = el("img");
  img.src = "assets/work/" + v.file + ".jpg";
  img.alt = "";
  img.loading = "lazy";
  btn.appendChild(img);
  btn.appendChild(el("span", "play"));

  /* Il video nasce al PRIMO contatto — passaggio del mouse o tocco — e poi
     resta li'. Una griglia di nove fermi immagine e' una brutta vetrina per
     uno studio di movimento; nove video che partono da soli sono 5 MB e una
     ventola che gira. Cosi' si muove quello che la persona sta guardando, e
     nient'altro. Uscendo si mette in pausa: il fotogramma resta, la CPU no. */
  var vid = null;
  function accendi() {
    if (!vid) {
      vid = el("video");
      vid.src = "assets/work/" + v.file + ".mp4";
      vid.poster = "assets/work/" + v.file + ".jpg";
      vid.loop = vid.muted = vid.playsInline = true;
      vid.setAttribute("muted", "");
      vid.setAttribute("playsinline", "");
      vid.setAttribute("aria-label", v.title);
      btn.innerHTML = "";
      btn.appendChild(vid);
    }
    fig.classList.add("live");
    var pr = vid.play();
    if (pr && pr.catch) pr.catch(function () {});
  }
  function spegni() { if (vid) vid.pause(); }

  btn.addEventListener("pointerenter", function (e) {
    if (e.pointerType === "mouse") accendi();
  });
  btn.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "mouse") spegni();
  });
  btn.addEventListener("click", accendi);
  btn.addEventListener("focus", accendi);

  fig.appendChild(btn);
  var cap = el("figcaption", "cap");
  cap.appendChild(el("h3", null, v.title));
  cap.appendChild(el("p", null, v.desc));
  if (conMisure) {
    cap.appendChild(el("p", "meta",
      "<span>" + v.secondi.toFixed(1) + " s</span>" +
      "<span>" + v.frames + " frames</span>" +
      "<span>4K</span>" +
      "<span>ProRes 422 HQ</span>"));
  }
  fig.appendChild(cap);
  return fig;
}

(function griglie() {
  var gl = document.getElementById("grid-loops");
  if (gl) LOOPS.forEach(function (v) { gl.appendChild(cella(v, "16", true)); });

  /* I sei lavori in casa non hanno la stessa forma, e in una griglia sola le
     tre verticali diventavano torri da 675 px accanto a clip larghe e basse.
     Quindi due blocchi: il trittico verticale (che E' il formato del
     telefono, e va visto cosi'), e sotto una striscia dove i fotogrammi
     hanno tutti la STESSA ALTEZZA e larghezze diverse — un foglio di
     contatto, non una griglia storta. */
  var gv = document.getElementById("made-v");
  var gh = document.getElementById("made-h");
  MADE.forEach(function (v) {
    var dove = v.ratio === "v" ? gv : gh;
    if (dove) dove.appendChild(cella(v, v.ratio, false));
  });
})();

/* ------------------------------------------------------------- YouTube -- */
/* L'iframe si crea solo al clic: finche' nessuno sceglie una clip, YouTube
   non sa che questa pagina esiste — ed e' quello che il piede dichiara. */
(function youtube() {
  var host = document.getElementById("grid-yt");
  if (!host) return;

  YT.forEach(function (v) {
    var fig = el("figure", "cell ratio-v");
    var btn = el("button", "fr");
    btn.type = "button";
    btn.setAttribute("aria-label", "Play " + v.title + " from YouTube");

    var img = el("img");
    img.src = "assets/work/yt-" + v.n + ".jpg";
    img.alt = "";
    img.loading = "lazy";
    btn.appendChild(img);
    btn.appendChild(el("span", "play"));

    btn.addEventListener("click", function () {
      if (btn.querySelector("iframe")) return;
      var f = el("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + v.id + "?autoplay=1&rel=0";
      f.title = v.title;
      f.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
      f.allowFullscreen = true;
      f.style.width = "100%";
      f.style.height = "100%";
      f.style.border = "0";
      btn.innerHTML = "";
      btn.appendChild(f);
    });

    fig.appendChild(btn);
    var cap = el("figcaption", "cap");
    cap.appendChild(el("h3", null, v.title));
    cap.appendChild(el("p", null, v.desc));
    fig.appendChild(cap);
    host.appendChild(fig);
  });
})();
