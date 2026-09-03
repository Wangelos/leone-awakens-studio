/* Leone Awakens Studio — contact sheets.
   Nothing loads from a third party until the visitor clicks a frame. */

var OWN = [
  { file: "nebulosa", ratio: "v", title: "Nebula",
    desc: "A 3,000-star galaxy with differential rotation, drawn frame by frame to canvas." },
  { file: "scuola", ratio: "v", title: "Character test",
    desc: "Expression handled as configuration, and the stage treated as a body that reacts." },
  { file: "duesfere", ratio: "v", title: "Two spheres in fusion",
    desc: "Coupled oscillators in three.js. Cut the coupling and they never meet." }
];

/* the only landscape piece, so it gets its own frame rather than a cell
   in a sheet built for 9:16 */
var WIDE = [
  { file: "gag", ratio: "h", title: "BIT hits the target",
    desc: "Four seconds of character timing, in the studio's own 16:9 house style. Silent by design." }
];

/* Coro 234 is scheduled, not yet public, so its embed would be dead.
   After it goes live, add { id: "tOppBv10tUs", n: "234", ... } back to this list. */
var YT = [
  { id: "dOgol2CtWO0", n: "174", title: "The State Comes First",
    desc: "28 cuts in 85 seconds, framing tracked to the speaker's face." },
  { id: "fdl7u3EXWfo", n: "191", title: "Your Body Already Wrote Tomorrow",
    desc: "Three in-house 3D objects cut into the edit: lattice, cymatics, flower of life." },
  { id: "8rtPojJ3YSU", n: "195", title: "The Money Belief You Never Chose",
    desc: "A circular structure, rebuilt by hand over eight edit revisions." },
  { id: "E5FQMQetIwg", n: "193", title: "He Said It In Black And White",
    desc: "Format design: archive in black and white, a year stamp, a 3D seal on the close." },
  { id: "KUuS-hC3hrU", n: "185", title: "You Decide What Reality Even Means",
    desc: "An automatic first cut rewritten into four blocks of 11 to 15 seconds." },
  { id: "4W-LA9rkBkg", n: "186", title: "You Already Have Faith",
    desc: "An animation built for one sentence: the beam reverses on the word believing." },
  { id: "ZNKQz5Dta28", n: "184", title: "The Blessing Hidden In Your Breakdown",
    desc: "Pure clipping. No generated stills, no animation — quote choice, cuts and captions." },
  { id: "Wiz8XLk9tNE", n: "180", title: "Four Masters, One Method",
    desc: "Four speakers held together across 104 seconds, with three new animations." }
];

var PLAY_SVG = '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7-12 7z"/></svg>';

function frame(ratio, inner) {
  return '<div class="frame frame-' + ratio + '">' + inner + '</div>';
}
function caption(title, desc) {
  return '<p class="cap-t">' + title + '</p><p class="cap-d">' + desc + '</p>';
}

/* ---- in-house videos: click the poster, the file loads and plays ---- */
function renderLocal(hostId, list) {
  var host = document.getElementById(hostId);
  if (!host) return;
  list.forEach(function (v) {
    var fig = document.createElement("figure");
    fig.className = "item";
    fig.innerHTML =
      frame(v.ratio,
        '<img src="assets/work/' + v.file + '.jpg" alt="" loading="lazy">' +
        '<button class="play" type="button" aria-label="Play ' + v.title + '">' +
          '<span class="disc">' + PLAY_SVG + '</span>' +
        '</button>') +
      caption(v.title, v.desc);

    fig.querySelector(".play").addEventListener("click", function () {
      var box = fig.querySelector(".frame");
      var el = document.createElement("video");
      el.src = "assets/work/" + v.file + ".mp4";
      el.poster = "assets/work/" + v.file + ".jpg";
      el.controls = true;
      el.playsInline = true;
      el.loop = true;
      el.setAttribute("aria-label", v.title);
      box.innerHTML = "";
      box.appendChild(el);
      el.play();
    });
    host.appendChild(fig);
  });
}
renderLocal("sheet-own", OWN);
renderLocal("sheet-wide", WIDE);

/* ---- YouTube: poster only, the iframe appears on click ---- */
(function () {
  var host = document.getElementById("sheet-yt");
  if (!host) return;
  YT.forEach(function (v) {
    var fig = document.createElement("figure");
    fig.className = "item";
    fig.innerHTML =
      frame("v",
        '<img src="assets/work/yt-' + v.n + '.jpg" alt="" loading="lazy">' +
        '<button class="play" type="button" aria-label="Play ' + v.title + ' on YouTube">' +
          '<span class="disc">' + PLAY_SVG + '</span>' +
        '</button>') +
      caption(v.title, v.desc);

    fig.querySelector(".play").addEventListener("click", function () {
      var box = fig.querySelector(".frame");
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + v.id + "?autoplay=1&rel=0&playsinline=1";
      f.title = v.title;
      f.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen = true;
      box.innerHTML = "";
      box.appendChild(f);
    });
    host.appendChild(fig);
  });
})();

/* ---- respect reduced motion: the hero loop holds on its poster ---- */
(function () {
  if (!window.matchMedia) return;
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var hero = document.querySelector(".hero-frame video");
  if (hero) { hero.autoplay = false; hero.pause(); hero.controls = true; }
})();
