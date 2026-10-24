/* Helios Observatory. Vanilla JS, offline. All measured values come from window.HELIOS (data/bundle.js),
   which scripts/observatory/build_observatory.py generates from saved evidence. Only explanatory labels
   are written here; no measurement is typed into this file. */
"use strict";
(function () {
  const D = window.HELIOS;
  if (!D) { document.getElementById("main").innerHTML = "<p>data/bundle.js missing: run python scripts/observatory/build_observatory.py</p>"; return; }

  // ------------------------------------------------------------------------------------------ helpers
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // china-marker worker colours: coordinator silver, then teal, steel, graphite, stone (always paired with a text label)
  const W = ["#8a939b", "#13847f", "#3d5f80", "#4a5158", "#a08f78"];
  const AMBER = "#c3821f", TEAL = "#0f7479", STONE_INK = "#6f6252", INK = "#1b1e21", INK2 = "#4c565f", INK3 = "#646e77", INK4 = "#9aa2a9";
  const PAPER = "#f6f5f1", PAPER3 = "#e2e5e8", FAIL = "#b24a36";
  const POLCOL = { static: "#a08f78", dynamic: "#13847f", adaptive: "#3d5f80" };
  const mono = (v) => `<span class="mono">${esc(v)}</span>`;
  const TF = (px, w = 400) => `${w} ${px}px "Segoe UI Variable Text", "Segoe UI", sans-serif`;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CREDIT = "Lorenzo Dario Ben · SIT315 Concurrent Programming";
  const pct = (v, d = 2) => (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + "%";
  const ciTxt = (c, d = 2) => `${pct(c[0], d)} to ${pct(c[1], d)}`;
  const sec = (v, d = 3) => `${Number(v).toFixed(d)} s`;
  const int = (v) => Number(v).toLocaleString("en-US");
  const pad = (n) => String(n).padStart(2, "0");
  const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k" : String(v);
  const cls = (c) => { const k = String(c).split(" ")[0].toLowerCase().replace(/[^a-z]/g, ""); return `<span class="cls cls-${k}">${esc(c)}</span>`; };
  const copyPath = (p) => `<span class="path copy" data-copy="${esc(p)}" title="Click to copy the repository-relative path">${esc(p)}</span>`;
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const svgi = (d, fill) => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${fill ? `<path d="${d}" fill="currentColor"/>` : `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`}</svg>`;
  const ICON = {
    play: svgi("M5 3.2v9.6l7.6-4.8z", true), pause: svgi("M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z", true),
    restart: svgi("M3.2 8.4a4.9 4.9 0 1 0 1.6-3.7M3 2.6v3.1h3.1"), prev: svgi("M4.2 3.5v9M12 3.5 6.6 8l5.4 4.5"), next: svgi("M11.8 3.5v9M4 3.5 9.4 8 4 12.5"),
    arrow: svgi("M2.5 8h10.5M9.2 4.2 13 8l-3.8 3.8"), check: svgi("M3 8.6l3.1 3L13 4.6"), cross: svgi("M4 4l8 8M12 4l-8 8"),
    split: svgi("M8 2v12M2.5 4.5h3.5v7H2.5zM10 4.5h3.5v7H10z"), left: svgi("M10 3.5 5.5 8l4.5 4.5"), right: svgi("M6 3.5 10.5 8 6 12.5"),
  };
  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const c = e.target.closest("[data-copy]");
    if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => { c.classList.add("copied"); setTimeout(() => c.classList.remove("copied"), 900); }).catch(() => {}); }
    const r = e.target.closest("[data-route]");
    if (r) { e.preventDefault(); go(r.dataset.route); }
  });
  // light "film density" ramp: clear base for cheap tiles, deep petrol for expensive ones
  function ramp(f) {
    const st = [[0, [236, 241, 240]], [0.3, [176, 214, 210]], [0.56, [72, 158, 154]], [0.8, [22, 92, 102]], [1, [16, 37, 46]]];
    f = Math.min(1, Math.max(0, f));
    for (let i = 1; i < st.length; i++) if (f <= st[i][0]) {
      const [a, ca] = st[i - 1], [b, cb] = st[i], t = (f - a) / (b - a);
      return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(",")})`;
    }
    return "rgb(16,37,46)";
  }
  const lum = (rgb) => { const m = rgb.match(/\d+/g).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  function img(src) { const i = new Image(); i.decoding = "async"; i.src = src; return i; }
  const hexA = (hex, a) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
  // text switches with a sliding ink underline
  const sw = (id, items, cur, extra = "") => `<div class="switch ${extra}" role="tablist" id="${id}">${items.map(([k, l]) => `<button role="tab" data-k="${esc(k)}" aria-selected="${String(k) === String(cur)}">${esc(l)}</button>`).join("")}<span class="ink"></span></div>`;
  function inkSwitch(root = document) {
    $$(".switch", root).forEach((s) => {
      const b = $('button[aria-selected="true"]', s), ink = $(".ink", s);
      if (!ink) return;
      if (!b || !b.offsetWidth) { ink.style.opacity = "0"; return; }
      ink.style.opacity = "1"; ink.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop + b.offsetHeight - s.offsetHeight}px) scaleX(${b.offsetWidth})`;
    });
  }
  const setSel = (root, sel, key) => { $$(`${sel} button`, root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.k === String(key)))); inkSwitch(root); };

  // ------------------------------------------------------------------------------------------ sections & routing
  const SECTIONS = [
    { id: "overview", num: "00", title: "Overview", key: "1" },
    { id: "render", num: "01", title: "Render Lab", key: "2" },
    { id: "workload", num: "02", title: "Workload Microscope", key: "3" },
    { id: "scheduler", num: "03", title: "Scheduler Lab", key: "4" },
    { id: "hardware", num: "04", title: "Hardware & Hybrid", key: "5" },
    { id: "performance", num: "05", title: "Performance Lab", key: "6" },
    { id: "correctness", num: "06", title: "Correctness", key: "7" },
    { id: "stress", num: "07", title: "Stress & Limits", key: "8" },
    { id: "provenance", num: "08", title: "Provenance", key: "9" },
    { id: "defence", num: "09", title: "Technical Q&A", key: "0" },
  ];
  const nav = $("#nav"), main = $("#main");
  nav.innerHTML = `<div class="rail" aria-hidden="true"><span class="rail-mark"></span><span class="rail-ticks">${SECTIONS.map((s) => `<i data-id="${s.id}"></i>`).join("")}</span></div>
    <div class="navpanel"><div class="brand"><b>HELIOS</b><span class="edge">Observatory</span></div>
    ${SECTIONS.map((s) => `<a href="#${s.id}" data-id="${s.id}"><span class="n">${s.num}</span><span class="t">${esc(s.title)}</span><kbd>${s.key}</kbd></a>`).join("")}
    <div class="navfoot edge">Keys 1–9, 0 jump · P guided tour · T trace<br>Offline · data built ${esc(D.about.build_utc.slice(0, 16).replace("T", " "))} UTC</div></div>`;
  let navTimer = null;
  const openNav = () => { clearTimeout(navTimer); nav.classList.add("open"); };
  const closeNav = (delay = 350) => { clearTimeout(navTimer); navTimer = setTimeout(() => { if (!nav.contains(document.activeElement)) nav.classList.remove("open"); }, delay); };
  $(".rail", nav).addEventListener("mouseenter", openNav);
  $(".rail", nav).addEventListener("click", openNav);
  $(".navpanel", nav).addEventListener("mouseenter", openNav);
  nav.addEventListener("mouseleave", () => closeNav());
  nav.addEventListener("focusin", openNav);
  nav.addEventListener("focusout", () => closeNav(160));
  $$(".navpanel a", nav).forEach((a) => a.addEventListener("click", () => { a.blur(); nav.classList.remove("open"); }));
  document.addEventListener("mousemove", (e) => { if (e.clientX <= 4 && !nav.classList.contains("open")) openNav(); }, { passive: true });
  document.addEventListener("pointerdown", (e) => { if (nav.classList.contains("open") && e.target instanceof Node && !nav.contains(e.target)) nav.classList.remove("open"); });

  SECTIONS.forEach((s) => main.appendChild(h(`<section class="section" id="sec-${s.id}" aria-labelledby="h-${s.id}"></section>`)));
  const R = {}; // section controllers: {render(el, params), update(params), toggle(), leave()}
  let current = null;
  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, "")) || "overview";
    const [rawId, qs] = raw.split("?");
    const id = rawId === "qna" ? "defence" : rawId;
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    return { id: SECTIONS.some((s) => s.id === id) ? id : "overview", params };
  }
  function go(route) { if ("#" + route === location.hash) show(); else location.hash = route; }
  function show() {
    const { id, params } = parseHash();
    const changed = current !== id;
    closeAbout(false);
    if (current && changed && R[current]?.leave) R[current].leave();
    SECTIONS.forEach((s) => {
      $("#sec-" + s.id).classList.toggle("active", s.id === id);
      const a = $(`.navpanel a[data-id="${s.id}"]`, nav);
      if (s.id === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      $(`.rail-ticks i[data-id="${s.id}"]`, nav).classList.toggle("on", s.id === id);
    });
    const el = $("#sec-" + id);
    if (!el.dataset.rendered) { R[id].render(el, params); el.dataset.rendered = "1"; }
    else if (R[id].update) R[id].update(params);
    if (changed) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); window.scrollTo(0, 0); }
    current = id;
    requestAnimationFrame(() => inkSwitch(el));
    updatePresentHud();
  }
  window.addEventListener("hashchange", show);
  window.addEventListener("resize", () => { if (current) { inkSwitch($("#sec-" + current)); R[current]?.relayout?.(); } });
  // section opener: large pale number, condensed title, one statement, the ID the section rests on locked to the corner
  const opener = (id, title, statement, edgeId = "", tools = "") => {
    const s = SECTIONS.find((x) => x.id === id);
    return `<header class="opener"><span class="opener-num" aria-hidden="true" data-in style="--i:0">${s.num}</span>
      <div data-in style="--i:1"><h1 id="h-${id}">${esc(title)}</h1><p class="statement">${statement}</p></div>
      ${edgeId ? `<span class="edge edge-id" data-in style="--i:2">${edgeId}</span>` : ""}${tools ? `<div class="tools" data-in style="--i:2">${tools}</div>` : ""}</header>`;
  };

  // ------------------------------------------------------------------------------------------ edge line & about
  const A = D.about;
  $("#sb-frozen").textContent = A.frozen_source.slice(0, 7);
  $("#sb-platform").textContent = `${A.cpu.match(/i\d-\w+/)?.[0] || A.cpu} ${A.cores}C/${A.logical}T`;
  $("#sb-verified").innerHTML = A.formal_verified ? `<span class="ok">VERIFIED</span>` : `<span class="bad">NOT VERIFIED</span>`;
  const about = $("#about");
  about.innerHTML = `<h2 class="about-mark">HELIOS</h2><p class="about-sub">${esc(D.overview.subtitle)}</p>
    <p class="about-desc">${esc(D.overview.description)}</p>
    <p>The rendering algorithm implemented by Helios is Monte Carlo path tracing. MPI distributes tiles between processes in the distributed-memory model; every measurement here was taken on one machine, so no multi-node or network behaviour is claimed.</p>
    <h3>This build</h3><dl class="kv">
    <dt>Helios frozen source</dt><dd>${mono(A.frozen_source)}</dd><dt>Repository HEAD at data build</dt><dd>${mono(A.presentation_head)}</dd>
    <dt>Observatory data build</dt><dd>${esc(A.build_utc)}</dd><dt>Formal protocol</dt><dd>${esc(A.protocol)}</dd>
    <dt>Environment</dt><dd>${esc(A.environment)}</dd><dt>CPU</dt><dd>${esc(A.cpu)}</dd></dl>
    <p style="margin-top:18px">The Observatory is an offline evidence explorer around the finished C++20 engine. It never runs experiments; every value comes from saved evidence through <span class="mono">scripts/observatory/build_observatory.py</span>.</p>
    <h3>Evidence classes</h3><div class="cls-legend">${cls("FORMAL")}<span>Protocol V2 evidence on the frozen source</span>${cls("DIAGNOSTIC")}<span>exploratory runs, not formal</span>
    ${cls("HISTORICAL")}<span>pre-fix formal runs, superseded</span>${cls("PRESENTATION")}<span>renders made for show; runtimes are not benchmarks</span>
    ${cls("ILLUSTRATIVE")}<span>explanation only, not measured</span></div>
    <h3>Keys</h3><p>1 Overview · 2 Render · 3 Workload · 4 Scheduler · 5 Hardware · 6 Performance · 7 Correctness · 8 Stress · 9 Provenance · 0 Technical Q&A · P guided tour · T trace inspector (Scheduler Lab) · Space play/pause · ←/→ in the guided tour · Esc close</p>
    <h3>Reproduce</h3><p>Live check (about 10 s, temp directory only): ${copyPath("scripts/helios_demo.ps1")} runs the core tests and backend validator, renders hybrid-adaptive and sequential with the same settings and compares hashes.
    Rebuild this page's data: ${copyPath("scripts/observatory/build_observatory.py")} · validate: ${copyPath("scripts/observatory/validate_observatory.py")}</p>
    <p>Machine-readable capsule: ${copyPath("assets/observatory/data/experiment_capsule.json")}</p><p class="edge" style="margin-top:22px">${esc(CREDIT)}</p>`;
  const aboutBtn = $("#btn-about"), scrim = $("#about-scrim");
  function openAbout() {
    about.classList.add("open"); aboutBtn.setAttribute("aria-expanded", "true");
    scrim.hidden = false; document.body.classList.add("about-open"); nav.classList.remove("open");
    about.focus({ preventScroll: true });
  }
  function closeAbout(restoreFocus = true) {
    if (!about.classList.contains("open")) return;
    const had = about.contains(document.activeElement);
    about.classList.remove("open"); aboutBtn.setAttribute("aria-expanded", "false");
    scrim.hidden = true; document.body.classList.remove("about-open");
    if (restoreFocus && had) aboutBtn.focus({ preventScroll: true });
  }
  aboutBtn.addEventListener("click", () => (about.classList.contains("open") ? closeAbout() : openAbout()));
  scrim.addEventListener("click", () => closeAbout());
  // any press outside the drawer (other than its own toggle) closes it at once
  document.addEventListener("pointerdown", (e) => {
    if (about.classList.contains("open") && e.target instanceof Node && !about.contains(e.target) && !aboutBtn.contains(e.target)) closeAbout(false);
  }, true);

  // ------------------------------------------------------------------------------------------ 00 overview
  const MONTAGE = ["reflective", "bvh_stress", "uniform", "showcase", "imbalanced"];
  const EXPLORE = {
    render: `Real renders, convergence from ${D.convergence.frames[0].spp} to ${D.convergence.frames[D.convergence.frames.length - 1].spp} samples per pixel, and the rendering pipeline.`,
    workload: "The measured cost of every tile: why equal areas are not equal work.",
    scheduler: "Static, dynamic and adaptive scheduling replayed from recorded traces.",
    hardware: `${D.hardware.physical_cores} cores, ${D.hardware.logical_processors} logical processors, and what CPU Sets revealed about affinity.`,
    performance: "Final scaling, paired intervals, the optimisation A/B and the anomaly case file.",
    correctness: `${D.correctness.backends.length} backends, one hash, and the full validation stack.`,
    stress: `The ${D.stress.timeout_seconds} s controlled DNF and the limits of the evaluation.`,
    provenance: "Every headline number traced from source commit to report table.",
    defence: "Design decisions, trade-offs and lessons, each answer linked to its evidence.",
  };
  const THUMB = { render: "reflective", workload: "imbalanced", scheduler: "scheduler_stress", hardware: "bvh_stress", performance: "uniform", correctness: "showcase", stress: "scheduler_stress", provenance: "showcase", defence: "reflective" };
  R.overview = {
    render(el, params) {
      const O = D.overview, G = D.scenes.gallery;
      this.el = el; this.frames = MONTAGE.map((s) => G.find((g) => g.scene === s)).filter(Boolean); this.fi = 0; this.paused = false;
      el.innerHTML = `<div class="hero" id="hero" data-cursor-media="zone"${/^[ac]$/.test(new URLSearchParams(location.search).get("hero") || "") ? ` data-wash="${new URLSearchParams(location.search).get("hero")}"` : ""}></div>
        <section class="index" aria-labelledby="idx-h"><div class="index-head"><h2 id="idx-h">One engine, examined from nine angles.</h2>
          <p>Every page is built from saved evidence: formal Protocol V2 runs on the frozen source, labelled diagnostic and historical runs, and real renders. Nothing here is rerun or typed in by hand.</p></div>
          <ol class="toc">${SECTIONS.slice(1).map((s) => { const g = G.find((x) => x.scene === THUMB[s.id]) || G[0]; return `<li><a href="#${s.id}" data-route="${s.id}"><span class="n">${s.num}</span><span class="t">${esc(s.title)}</span><span class="d">${esc(EXPLORE[s.id])}</span><kbd class="k edge">${s.key}</kbd><img class="thumb" data-src="${esc(g.image)}" alt="" decoding="async"></a></li>`; }).join("")}</ol>
          <div class="index-foot"><span class="edge">Frozen source ${esc(D.about.frozen_source.slice(0, 7))} · strong scaling ${esc(O.strong_experiment)} · sequential median ${sec(O.sequential_median)}</span>
          <a class="act" href="#overview?panel=close" data-route="overview?panel=close"><span>Closing frame</span>${ICON.arrow}</a></div></section>`;
      $$(".toc a", el).forEach((a) => { const load = () => { const t = $(".thumb", a); if (!t.src) t.src = t.dataset.src; }; a.addEventListener("mouseenter", load); a.addEventListener("focus", load); });
      const hero = $("#hero", el);
      hero.addEventListener("mousemove", (e) => {
        if (REDUCED) return;
        const r = hero.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width - 0.5) * 2, py = ((e.clientY - r.top) / r.height - 0.5) * 2;
        cancelAnimationFrame(this.praf); this.praf = requestAnimationFrame(() => { hero.style.setProperty("--px", px.toFixed(3)); hero.style.setProperty("--py", py.toFixed(3)); });
      });
      window.addEventListener("scroll", () => {
        if (current !== "overview") return;
        cancelAnimationFrame(this.sraf); this.sraf = requestAnimationFrame(() => hero.style.setProperty("--sc", Math.min(1, Math.max(0, window.scrollY / window.innerHeight)).toFixed(3)));
      }, { passive: true });
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.stop(); else if (current === "overview") this.start(); });
      this.update(params);
    },
    update(params) {
      const closing = params.panel === "close";
      if (closing !== this.closing || !this.drawn) { this.closing = closing; this.drawn = true; this.drawHero(); }
      $(".index", this.el).style.display = closing ? "none" : "";
      this.start();
    },
    drawHero() {
      const O = D.overview, M = O.metrics, hero = $("#hero", this.el), f0 = this.frames[0];
      hero.classList.toggle("closing", this.closing);
      if (this.closing) {
        hero.innerHTML = `<div class="hero-stage" aria-hidden="true"><div class="hero-frame on"><img src="${esc(O.hero)}" alt="" decoding="async"></div></div><div class="hero-scrim"></div>
          <div class="hero-copy"><h1 class="wordmark" id="h-overview">${esc(O.title)}</h1><p class="hero-sub">${esc(O.subtitle)}</p>
          <ul class="closing-stack">${["C++20", "Ray tracing", "Monte Carlo light transport", "BVH", "OpenMP", "MPI"].map((t) => `<li>${t}</li>`).join("")}</ul>
          <ul class="closing-stack minor">${["Hybrid parallelism", "Adaptive scheduling"].map((t) => `<li>${t}</li>`).join("")}</ul></div>
          <div class="closing-foot"><span class="edge">Frozen source <b>${esc(D.about.frozen_source)}</b></span><span class="edge">${esc(CREDIT)}</span><span class="edge">Real render · reflective · 2400×1000 · 1024 SPP · presentation</span></div>`;
        this.stop();
        return;
      }
      const ev = (m, cls2, inner, detail = esc(m.detail)) => `<li class="${cls2}"><a href="#${esc(m.route)}" data-route="${esc(m.route)}">${inner}<div class="edge">${cls(m.classification)} ${detail}</div></a></li>`;
      hero.innerHTML = `<div class="hero-stage" aria-hidden="true">${this.frames.map((g, i) => `<div class="hero-frame${i === 0 ? " on" : ""}"><img src="${esc(g.image)}" alt="" decoding="async"></div>`).join("")}</div>
        <div class="hero-scrim"></div>
        <div class="hero-copy"><h1 class="wordmark" id="h-overview">${esc(O.title)}</h1><p class="hero-sub">${esc(O.subtitle)}</p>
          <p class="hero-tag">${esc(O.tagline)}</p><p class="hero-desc">${esc(O.description)}</p><p class="hero-credit edge">${esc(CREDIT)}</p></div>
        <div class="hero-count" role="group" aria-label="Real-render montage"><div class="scene" id="hc-scene"></div><div class="num" aria-hidden="true"><span id="hc-n">01</span> <small>/ ${pad(this.frames.length)}</small></div>
          <div class="hero-ticks" role="group" aria-label="Montage frames">${this.frames.map((g, i) => `<button data-i="${i}" aria-label="Show the ${esc(g.scene)} render" aria-current="${i === 0}"></button>`).join("")}</div>
          <div class="edge" id="hc-meta"></div><div class="edge frozen"><a href="#${esc(M[5].route)}" data-route="${esc(M[5].route)}">${esc(M[5].label)} ${mono(M[5].value)}</a> ${cls(M[5].classification)}</div></div>
        <ol class="evidence">
          ${ev(M[0], "lead", `<div class="fig reveal-wipe">${esc(M[0].value)}</div><div class="fig-label">${esc(M[0].label)}, speedup over sequential</div>`)}
          ${ev(M[2], "", `<div class="pair"><span class="fig-m">${esc(M[2].value)}</span><span class="fig-s">${esc(M[1].value)}</span></div><div class="fig-label">${esc(M[2].label)} · ${esc(M[1].label)}</div>${this.ruler()}`)}
          ${ev(M[3], "", `<div class="fig-m">${esc(M[3].value)}</div><div class="fig-label">${esc(M[3].label)}</div>${this.tally()}`)}
          ${ev(M[4], "", `<div class="fig-m">${esc(M[4].value)}</div><div class="fig-label">${esc(M[4].label)}: controlled DNF</div>${this.limitBar()}`)}
        </ol>`;
      $$(".hero-ticks button", hero).forEach((b) => b.addEventListener("click", () => { this.showFrame(+b.dataset.i); this.start(); }));
      const cnt = $(".hero-count", hero);
      cnt.addEventListener("mouseenter", () => (this.paused = true)); cnt.addEventListener("mouseleave", () => (this.paused = false));
      cnt.addEventListener("focusin", () => (this.paused = true)); cnt.addEventListener("focusout", () => (this.paused = false));
      this.showFrame(0);
      void f0;
    },
    // Hero figure forms, all drawn from the bundle: a speedup ruler, the verified tally and the limit bar.
    ruler() {
      const SC = D.performance.strong.conditions, sp = (id) => SC.find((c) => c.id === id).speedup, X = (v) => (6 + (v - 1) / 2.2 * 300).toFixed(1);
      const marks = [["mpi-static:4x1", INK3, 2], ["hybrid-static:1x4", INK, 3.5], ["openmp:1x8", INK4, 2]];
      return `<svg viewBox="0 0 320 34" aria-hidden="true"><line x1="6" x2="306" y1="12" y2="12" stroke="${INK4}"/>${[1, 2, 3].map((v) => `<line x1="${X(v)}" x2="${X(v)}" y1="12" y2="17" stroke="${INK3}"/><text x="${X(v)}" y="31" text-anchor="middle">${v}×</text>`).join("")}
        ${marks.map(([id, c, w]) => `<rect x="${(X(sp(id)) - w / 2).toFixed(1)}" y="0" width="${w}" height="12" fill="${c}"><title>${esc(id)} ${sp(id).toFixed(2)}×</title></rect>`).join("")}</svg>`;
    },
    tally() {
      const E = D.experiments.experiments.filter((e) => e.classification === "FORMAL" && e.verification), tot = E.reduce((n, e) => n + e.verification.ppm_images_checked, 0);
      let x = 0;
      return `<svg viewBox="0 0 320 34" aria-hidden="true">${E.map((e) => { const v = e.verification, w = v.ppm_images_checked / tot * (320 - 2 * (E.length - 1)), x0 = x; x += w + 2;
        return `<rect x="${x0.toFixed(1)}" y="3" width="${w.toFixed(1)}" height="18" fill="${v.failed ? FAIL : TEAL}"><title>${esc(e.experiment)} ${esc(e.id)}: ${v.ppm_images_checked} rehashed, ${v.failed} failed</title></rect>${w > 22 ? `<text class="tally-n" x="${(x0 + w / 2).toFixed(1)}" y="16" text-anchor="middle">${v.ppm_images_checked}</text>` : ""}`; }).join("")}
        <text x="0" y="33">${E.length} final experiments</text></svg>`;
    },
    limitBar() {
      const S = D.stress, X = (v) => (v / (S.timeout_seconds * 1.1) * 320).toFixed(1);
      return `<svg viewBox="0 0 320 34" aria-hidden="true"><line x1="0" x2="320" y1="12" y2="12" stroke="${INK4}"/><rect x="0" y="8.5" width="${X(S.elapsed_seconds)}" height="7" fill="${W[2]}"/>
        <line x1="${X(S.timeout_seconds)}" x2="${X(S.timeout_seconds)}" y1="1" y2="22" stroke="${INK}" stroke-width="2"/><text x="${X(S.timeout_seconds)}" y="33" text-anchor="end">${S.timeout_seconds} s limit</text><text x="0" y="33">0 s</text></svg>`;
    },
    showFrame(i) {
      const hero = $("#hero", this.el), g = this.frames[i], frames = $$(".hero-frame", hero), im = $("img", frames[i]);
      // a change of render waits until the next image is decoded; the first frame is labelled immediately
      if (this.fi !== i && (!im.complete || !im.naturalWidth)) { im.decode?.().then(() => { if (this.fi !== i) this.showFrame(i); }).catch(() => {}); return; }
      const prev = frames[this.fi];
      if (prev && this.fi !== i) { prev.classList.add("out"); clearTimeout(prev.outT); prev.outT = setTimeout(() => prev.classList.remove("out"), 1100); }
      this.fi = i;
      frames.forEach((f, k) => { f.classList.toggle("on", k === i); if (k === i) f.classList.remove("out"); });
      $$(".hero-ticks button", hero).forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
      const name = g.scene.replace(/_/g, " ");
      $("#hc-scene", hero).textContent = name;
      $("#hc-scene", hero).setAttribute("aria-label", `Showing the ${name} render, ${i + 1} of ${this.frames.length}`);
      $("#hc-n", hero).textContent = pad(i + 1);
      $("#hc-meta", hero).textContent = `Real render · ${g.width}×${g.height} · ${g.spp} SPP · presentation`;
      const next = $("img", frames[(i + 1) % frames.length]); next.decode?.().catch(() => {});
    },
    // 4.6 s per render, 0.9 s crossfade (styles.css); static under reduced motion, with the ticks for manual changes
    start() {
      this.stop();
      if (REDUCED || this.closing) return;
      this.timer = setInterval(() => { if (!this.paused && current === "overview" && !document.hidden) this.showFrame((this.fi + 1) % this.frames.length); }, 4600);
    },
    stop() { clearInterval(this.timer); this.timer = null; },
    toggle() { if (this.timer) this.stop(); else this.start(); },
    leave() { this.stop(); },
  };

  // ------------------------------------------------------------------------------------------ 01 render lab
  const PIPE = [
    ["Camera", "Camera::ray", "A pinhole camera built from the scene's camera_from / camera_at and a 40° vertical field of view maps (u, v) to a ray."],
    ["Sample", "Rng{mix64(…)}", "Each sample creates its own generator from (seed, pixel, sample) and jitters (u, v) inside the pixel. Nothing depends on which thread or rank renders it."],
    ["Primary ray", "trace()", "The camera ray enters trace(), which loops over bounces up to max_depth (8 in the formal workloads)."],
    ["BVH traversal", "Scene::hit", "A depth-first walk over a median-split BVH with a fixed 64-slot stack; a missed box skips its whole subtree. A brute-force path (--no-bvh) validates it."],
    ["Hit", "intersect", "The nearest sphere or triangle hit along the ray; the counters record node visits and primitive tests."],
    ["Material", "diffuse · metal · glass", "Diffuse scatters around the normal, metal reflects with 0.06 roughness, glass refracts or reflects (index 1.5), and hitting the light adds emission."],
    ["Secondary ray", "bounce + shadow ray", "The scattered ray continues the path; at diffuse hits a shadow ray samples the triangle light (next-event estimation)."],
    ["Accumulate", "throughput × radiance", "Radiance is weighted by the path throughput and summed over samples in a fixed order."],
    ["Pixel", "encode → tile bytes", "The average over SPP is encoded to 8-bit RGB inside the tile; MPI sends these bytes, so no floating-point reduction can reorder."],
  ];
  R.render = {
    render(el, params) {
      const G = D.scenes.gallery, C = D.convergence;
      el.innerHTML = opener("render", "Render Lab", "One renderer, seven execution paths. Every image here is its unmodified output.", `Frozen engine ${mono(D.about.frozen_source.slice(0, 7))} · presentation renders`) +
        `<div class="g g-main" data-in style="--i:3"><div><div class="frame" data-cursor-media><img id="rl-img" src="${esc(G[0].image)}" alt="Helios render"></div><div class="frame-edge"><span class="edge" id="rl-edge"></span><span id="rl-cls"></span></div>
          <div class="filmstrip" id="rl-thumbs">${G.map((g) => `<button class="film" data-scene="${esc(g.scene)}" aria-pressed="false"><img src="${esc(g.image)}" alt="${esc(g.scene)} render" loading="lazy" data-cursor-media><span class="edge">${esc(g.scene)}</span></button>`).join("")}</div></div>
          <div class="rl-meta" id="rl-info"></div></div>
        <section class="band" data-in style="--i:4" id="cv-band"><div class="band-head"><div><h2>Monte Carlo convergence</h2>
          <p>Nine separate renders of the same scene, camera, seed, depth and resolution. Only the samples per pixel change: no interpolation, no denoising. ${cls("PRESENTATION")}</p></div>
          <div class="toolbar"><button class="act ink" id="cv-play" aria-pressed="false"></button><button class="act ink" id="cv-mode" aria-pressed="false"></button></div></div>
          <div class="g g-main cv-wrap" id="cv-wrap"><div><div id="cv-main"></div>
            <div class="scale" id="cv-scale" role="group" aria-label="Samples per pixel">${C.frames.map((f, i) => `<button data-i="${i}" aria-label="${f.spp} samples per pixel">${f.spp}</button>`).join("")}</div>
            <div class="scale-cap"><span class="edge">samples per pixel</span><span class="edge" id="cv-note"></span></div></div>
            <div class="loupe-col"><h3 class="h">Loupe · 2× pixel zoom</h3><canvas id="cv-loupe" data-cursor-media width="480" height="270" aria-label="Magnified detail of the current frame"></canvas>
            <p class="tiny muted" style="margin-top:10px">Click on the render to move the loupe.</p><dl class="kv" id="cv-facts" style="margin-top:14px"></dl></div>
            <svg class="leaders" id="cv-lead" aria-hidden="true"><path d=""/><circle r="3" cx="-9" cy="-9"/></svg></div></section>
        <section data-in style="--i:5; margin-top:84px"><div class="band-head" style="margin-bottom:0"><div><h2 class="h" style="font-size:1.9rem">Ray-tracing pipeline ${cls("ILLUSTRATIVE")}</h2>
          <p>Stages follow the actual code in src/core.cpp at ${esc(D.about.frozen_source.slice(0, 7))}. The light-transport algorithm is Monte Carlo path tracing. An explanation of the code path, not recorded ray telemetry.</p></div>
          <div class="toolbar"><a class="act" href="#provenance?panel=code&snippet=render_tile" data-route="provenance?panel=code&snippet=render_tile">render_tile ${ICON.arrow}</a><a class="act" href="#provenance?panel=code&snippet=scene_hit" data-route="provenance?panel=code&snippet=scene_hit">Scene::hit ${ICON.arrow}</a></div></div>
          <div class="pipe" id="pipe">${PIPE.map((p, i) => `<button data-i="${i}" aria-pressed="false"><span class="dot"></span><span class="pl">${esc(p[0])}</span><span class="pc">${esc(p[1])}</span></button>`).join("")}</div>
          <p class="pipe-text" id="pipe-text"></p></section>`;
      this.el = el; this.G = G; this.C = C;
      $$("#rl-thumbs .film", el).forEach((b) => b.addEventListener("click", () => this.scene(b.dataset.scene)));
      $$("#pipe button", el).forEach((b) => { const f = () => this.pipe(+b.dataset.i); b.addEventListener("mouseenter", f); b.addEventListener("focus", f); b.addEventListener("click", f); });
      $$("#cv-scale button", el).forEach((b) => {
        b.addEventListener("click", () => { if (this.timer) this.toggle(); this.pick(+b.dataset.i); });
        b.addEventListener("keydown", (e) => { const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (d) { e.preventDefault(); this.pick(Math.max(0, Math.min(this.C.frames.length - 1, (this.side ? this.pair[1] : this.idx) + d))); $$("#cv-scale button", this.el)[this.side ? this.pair[1] : this.idx].focus(); } });
      });
      this.pipe(3);
      this.frames = C.frames.map((f) => img(f.image));
      this.idx = Math.max(0, C.frames.findIndex((f) => String(f.spp) === String(params.spp || "")));
      this.pair = [0, C.frames.length - 1]; this.split = 50;
      this.side = false; this.center = [640, 360];
      $("#cv-mode", el).addEventListener("click", () => { this.side = !this.side; this.drawConv(); });
      $("#cv-play", el).addEventListener("click", () => this.toggle());
      this.scene(params.scene || "reflective");
      this.update(params);
    },
    update(params) {
      if (params.scene) this.scene(params.scene);
      if (params.spp) { const i = this.C.frames.findIndex((f) => String(f.spp) === String(params.spp)); if (i >= 0) { this.idx = i; this.side = false; } }
      if (params.compare) { const [a, b] = params.compare.split(","); const ia = this.C.frames.findIndex((f) => String(f.spp) === a), ib = this.C.frames.findIndex((f) => String(f.spp) === b); if (ia >= 0 && ib >= 0) { this.pair = [ia, ib]; this.side = true; } }
      this.drawConv();
      if (params.autoplay === "1" && !this.timer) this.toggle();
      if (params.panel === "pipeline") setTimeout(() => $("#pipe", this.el).scrollIntoView({ block: "center" }), 200);
      if (params.panel === "convergence") setTimeout(() => $("#cv-band", this.el).scrollIntoView({ block: "start" }), 200);
    },
    relayout() { this.leader(); },
    scene(name) {
      const g = this.G.find((x) => x.scene === name) || this.G[0];
      const im = $("#rl-img", this.el); im.src = g.image; im.alt = `Helios render of the ${g.scene} scene`;
      $$("#rl-thumbs .film", this.el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === g.scene)));
      $("#rl-edge", this.el).innerHTML = `${esc(g.scene)} · ${g.width}×${g.height} · ${g.spp} SPP · depth ${g.max_depth} · seed ${g.seed} · hash ${mono(g.hash)}`;
      $("#rl-cls", this.el).innerHTML = cls("PRESENTATION");
      $("#rl-info", this.el).innerHTML = `<h2>${esc(g.scene)}</h2><p class="composition">${esc(g.composition)}</p><p class="soft">${esc(g.purpose)}</p>
        <dl class="kv" style="margin-top:18px"><dt>Resolution</dt><dd>${g.width}×${g.height}</dd><dt>Samples per pixel</dt><dd>${g.spp}</dd><dt>Max depth · seed</dt><dd>${g.max_depth} · ${g.seed}</dd>
        <dt>Backend</dt><dd>${esc(g.backend)}</dd><dt>Image hash</dt><dd>${mono(g.hash)} ${g.hash_recomputed === g.hash ? `<span class="pass">recomputed ${ICON.check}</span>` : ""}</dd>
        <dt>Render time</dt><dd>${sec(g.runtime_seconds, 1)} (informational)</dd></dl>
        <p class="note"><b>Presentation render</b>Not formal benchmark data: a single run, and several renders overlapped other work.</p>
        <p class="tiny muted" style="margin-top:16px">Command</p><div class="path">${esc(g.command)}</div>`;
    },
    pick(i) { if (this.side) this.pair[1] = i; else this.idx = i; this.drawConv(); },
    drawConv() {
      const C = this.C, box = $("#cv-main", this.el);
      $("#cv-play", this.el).innerHTML = this.timer ? `${ICON.pause}<span>Pause</span>` : `${ICON.play}<span>Autoplay</span>`;
      $("#cv-play", this.el).setAttribute("aria-pressed", String(!!this.timer));
      $("#cv-mode", this.el).innerHTML = this.side ? `${ICON.split}<span>Single frame</span>` : `${ICON.split}<span>Compare ${C.frames[this.pair[0]].spp} and ${C.frames[this.pair[1]].spp} SPP</span>`;
      $("#cv-mode", this.el).setAttribute("aria-pressed", String(this.side));
      const cur = this.side ? this.pair[1] : this.idx;
      $$("#cv-scale button", this.el).forEach((b, i) => b.setAttribute("aria-current", String(i === cur)));
      if (!this.side) {
        const f = C.frames[this.idx];
        box.innerHTML = `<div class="frame cv-view" id="cv-view"><img id="cv-img" src="${esc(f.image)}" alt="Reflective scene at ${f.spp} samples per pixel"><span class="spp-tag">${f.spp} SPP</span><div class="loupe-box" id="cv-box"></div></div>`;
        $("#cv-note", this.el).textContent = `frame ${this.idx + 1} of ${C.frames.length}`;
      } else {
        const [a, b] = this.pair, opts = (sel) => C.frames.map((x, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${x.spp} SPP</option>`).join("");
        box.innerHTML = `<div class="frame cv-view" id="cv-view" style="--split:${this.split}%"><img class="cv-pair" data-k="1" src="${esc(C.frames[b].image)}" alt="${C.frames[b].spp} SPP">
          <div class="wipe-top"><img class="cv-pair" data-k="0" src="${esc(C.frames[a].image)}" alt="${C.frames[a].spp} SPP"></div>
          <span class="spp-tag">${C.frames[a].spp} SPP</span><span class="spp-tag r">${C.frames[b].spp} SPP</span>
          <div class="wipe-handle" id="cv-handle" tabindex="0" role="slider" aria-label="Wipe position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(this.split)}"></div><div class="loupe-box" id="cv-box"></div></div>
          <div class="toolbar" style="margin-top:14px"><label>Left <select class="cv-sel" data-k="0">${opts(a)}</select></label><label>Right <select class="cv-sel" data-k="1">${opts(b)}</select></label><span class="edge">drag the divider · left half of the loupe shows the left frame</span></div>`;
        $$(".cv-sel", box).forEach((s) => s.addEventListener("change", () => { this.pair[+s.dataset.k] = +s.value; this.drawConv(); }));
        const view = $("#cv-view", box), handle = $("#cv-handle", box);
        const setSplit = (v) => { this.split = Math.max(0, Math.min(100, v)); view.style.setProperty("--split", this.split + "%"); handle.setAttribute("aria-valuenow", String(Math.round(this.split))); };
        handle.addEventListener("pointerdown", (e) => {
          e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
          const mv = (ev) => { const r = view.getBoundingClientRect(); setSplit((ev.clientX - r.left) / r.width * 100); };
          handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", mv), { once: true });
        });
        handle.addEventListener("keydown", (e) => { const d = { ArrowLeft: -5, ArrowRight: 5 }[e.key]; if (d) { e.preventDefault(); setSplit(this.split + d); } });
        $("#cv-note", this.el).textContent = `wipe ${C.frames[a].spp} against ${C.frames[b].spp} SPP`;
      }
      const f = C.frames[cur];
      $("#cv-facts", this.el).innerHTML = `<dt>Scene</dt><dd>${esc(C.scene)}</dd><dt>Resolution</dt><dd>${C.width}×${C.height}</dd><dt>Depth · seed</dt><dd>${C.max_depth} · ${C.seed}</dd>
        <dt>Backend</dt><dd>${esc(C.backend)}</dd><dt>Only SPP changes</dt><dd>${C.only_spp_changes ? "verified" : "NOT verified"}</dd><dt>Hash</dt><dd>${mono(f.hash)}</dd><dt>Render time</dt><dd>${sec(f.runtime_seconds, 2)} (informational)</dd>`;
      const view = $("#cv-view", box);
      view.addEventListener("click", (e) => { if (e.target.closest(".wipe-handle")) return; const r = view.getBoundingClientRect(); this.center = [(e.clientX - r.left) / r.width * C.width, (e.clientY - r.top) / r.height * C.height]; this.loupe(); });
      $$("img", view).forEach((im) => { if (!im.complete) im.addEventListener("load", () => this.loupe(), { once: true }); });
      this.loupe();
    },
    region() { const sw = 240, sh = 135, [cx, cy] = this.center, W0 = this.C.width, H0 = this.C.height; return [Math.max(0, Math.min(W0 - sw, cx - sw / 2)), Math.max(0, Math.min(H0 - sh, cy - sh / 2)), sw, sh]; },
    loupe() {
      const cv = $("#cv-loupe", this.el), ctx = cv.getContext("2d"), [sx, sy, sw, sh] = this.region();
      const view = $("#cv-view", this.el); if (!view) return;
      const ims = this.side ? [$('.cv-pair[data-k="0"]', view), $('.cv-pair[data-k="1"]', view)] : [$("#cv-img", view)];
      ctx.imageSmoothingEnabled = false; ctx.fillStyle = PAPER3; ctx.fillRect(0, 0, cv.width, cv.height);
      if (ims.length === 1) { if (ims[0].complete) ctx.drawImage(ims[0], sx, sy, sw, sh, 0, 0, 480, 270); }
      else ims.forEach((i, k) => { if (i.complete) ctx.drawImage(i, sx + k * sw / 2, sy, sw / 2, sh, k * 240, 0, 240, 270); });
      if (ims.length === 2) { ctx.fillStyle = "#ffffff"; ctx.fillRect(239, 0, 2, 270); }
      const bx = $("#cv-box", view);
      bx.style.left = (sx / this.C.width * 100) + "%"; bx.style.top = (sy / this.C.height * 100) + "%"; bx.style.width = (sw / this.C.width * 100) + "%"; bx.style.height = (sh / this.C.height * 100) + "%";
      requestAnimationFrame(() => this.leader());
    },
    leader() {
      const wrap = $("#cv-wrap", this.el), bx = $("#cv-box", this.el), cv = $("#cv-loupe", this.el), svg = $("#cv-lead", this.el);
      if (!wrap || !bx || !svg || !wrap.offsetWidth) return;
      const w = wrap.getBoundingClientRect(), b = bx.getBoundingClientRect(), c = cv.getBoundingClientRect(), path = $("path", svg), dot = $("circle", svg);
      if (c.left < b.right) { path.setAttribute("d", ""); dot.setAttribute("cx", -9); return; }
      const x1 = b.right - w.left, y1 = b.top + b.height / 2 - w.top, x2 = c.left - w.left, y2 = c.top + c.height / 2 - w.top, xm = x2 - 22;
      path.setAttribute("d", `M${x1},${y1} H${Math.max(x1 + 10, xm)} L${x2},${y2}`); dot.setAttribute("cx", x1); dot.setAttribute("cy", y1);
    },
    toggle() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      else { this.side = false; this.timer = setInterval(() => { this.idx = (this.idx + 1) % this.C.frames.length; this.drawConv(); }, 900); }
      this.drawConv();
    },
    leave() { if (this.timer) this.toggle(); },
    pipe(i) {
      $$("#pipe button", this.el).forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
      $("#pipe-text", this.el).innerHTML = `<b>${esc(PIPE[i][0])}</b> <span class="mono small muted">${esc(PIPE[i][1])}</span>: ${esc(PIPE[i][2])}`;
    },
  };

  // ------------------------------------------------------------------------------------------ 02 workload microscope
  const METRICS = {
    compute_ms: { label: "Compute time", unit: "ms", fmt: (v) => v.toFixed(1), log: true },
    rays: { label: "Rays", unit: "rays", fmt: short, log: true },
    node_visits: { label: "BVH node visits", unit: "visits", fmt: short, log: true },
    primitive_tests: { label: "Primitive tests", unit: "tests", fmt: short, log: false },
    owner: { label: "Worker ownership", unit: "", fmt: (v) => v, log: false },
  };
  R.workload = {
    render(el, params) {
      const Wd = D.workload, S = Wd.summary;
      const tools = `<div class="toolbar">${sw("wm-metric", Object.entries(METRICS).map(([k, m]) => [k, m.label]), "compute_ms")}${sw("wm-overlay", [["none", "Tile cost"], ["2", "Static ×2"], ["4", "Static ×4"]], "none")}
        <label id="wm-own-l">Ownership run <select id="wm-own">${Object.entries(Wd.ownership).map(([k, o]) => `<option value="${k}">${esc(o.label)}</option>`).join("")}</select></label>
        <label><input type="checkbox" id="wm-scene"> Render underlay</label></div>`;
      el.innerHTML = opener("workload", "Workload Microscope", `Equal tile counts, unequal work: every one of the 144 tiles, measured. ${cls(Wd.classification)}`, `${mono("results/protocol-v2/" + Wd.experiment)} · ${esc(Wd.scene)} · ${Wd.width}×${Wd.height} · ${Wd.spp} SPP`, tools) +
        `<div class="g g-main wm-stage" id="wm-stage" data-in style="--i:3"><div><div class="field"><canvas id="wm-canvas" width="1280" height="720" tabindex="0" aria-label="Tile grid; move the pointer or use arrow keys to inspect a tile"></canvas></div>
            <div class="legend" id="wm-legend"></div></div>
          <div><div class="inspector" id="wm-detail" aria-live="polite"></div>
            <div class="insight"><div class="fig">${S.ratio.toFixed(1)}<span>×</span></div><div class="fig-label">the most expensive tile (#${S.dearest_tile}, ${S.dearest_ms.toFixed(1)} ms) against the cheapest (#${S.cheapest_tile}, ${S.cheapest_ms.toFixed(1)} ms)</div></div>
            <div class="hist" style="margin-top:36px"><h3 class="h">Distribution of tile compute time</h3><div id="wm-hist"></div><p class="tiny muted">Log-spaced bins; hover a bin to isolate its tiles. Median ${S.median_ms.toFixed(1)} ms, total ${(S.total_ms / 1000).toFixed(3)} s.</p></div></div>
          <svg class="leaders" id="wm-lead" aria-hidden="true"><path d=""/><circle r="3.5" cx="-9" cy="-9"/></svg></div>
        <section class="rule-top" data-in style="--i:4; margin-top:64px"><div class="band-head" style="margin-bottom:6px"><div><h2 class="h" style="font-size:1.9rem">Why static partitions cap the speedup</h2>
          <p>Equal-count contiguous ranges (OpenMP static, static MPI, hybrid static). The busiest range sets the time, even with perfectly efficient workers.</p></div>
          <a class="act" href="#scheduler?policy=compare" data-route="scheduler?policy=compare">See dynamic scheduling fix this ${ICON.arrow}</a></div><div class="parts" id="wm-parts"></div></section>
        <p class="meta">Sources: ${copyPath(Wd.sources[0].replace("b0", "b{0..6}"))} and the recorded ownership runs ${Object.values(Wd.ownership).map((o) => copyPath(o.source)).join(" · ")}. ${esc(Wd.metric_note)}. Code: <a href="#provenance?panel=code&snippet=render_tile" data-route="provenance?panel=code&snippet=render_tile">render_tile</a></p>`;
      this.el = el; this.Wd = Wd; this.metric = "compute_ms"; this.overlay = "none"; this.own = "static4"; this.sel = null; this.hi = null; this.loopT = 0;
      this.controlsKey = this.legendMarkup = this.detailKey = null;
      this.bg = img(Wd.tile_image); this.bg.onload = () => this.draw();
      $$("#wm-metric button", el).forEach((b) => b.addEventListener("click", () => { this.metric = b.dataset.k; this.draw(); }));
      $$("#wm-overlay button", el).forEach((b) => b.addEventListener("click", () => { this.overlay = b.dataset.k; this.draw(); }));
      $("#wm-own", el).addEventListener("change", (e) => { this.own = e.target.value; this.draw(); });
      $("#wm-scene", el).addEventListener("change", () => this.draw());
      const cv = $("#wm-canvas", el);
      const tileAt = (e) => { const r = cv.getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / r.width * 16), rw = Math.floor((e.clientY - r.top) / r.height * 9); return Math.min(143, Math.max(0, rw * 16 + c)); };
      cv.addEventListener("mousemove", (e) => { if (!this.locked) this.select(tileAt(e)); });
      cv.addEventListener("click", (e) => { const t = tileAt(e); this.locked = !this.locked || t !== this.lockedTile; this.lockedTile = t; this.select(t, true); });
      cv.addEventListener("keydown", (e) => {
        const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[e.key];
        if (d !== undefined) { e.preventDefault(); this.locked = true; this.select(Math.min(143, Math.max(0, (this.sel ?? 0) + d)), true); }
      });
      this.hist();
      this.parts();
      this.update(params);
    },
    update(params) {
      if (params.metric && METRICS[params.metric]) this.metric = params.metric;
      if (params.overlay) this.overlay = params.overlay;
      if (params.tile) { this.sel = +params.tile; this.locked = true; }
      if (this.sel === null) this.sel = this.Wd.summary.dearest_tile;
      this.draw();
    },
    relayout() { this.leader(); },
    leave() { cancelAnimationFrame(this.drawRaf); cancelAnimationFrame(this.leaderRaf); this.drawRaf = this.leaderRaf = 0; },
    select(t, force) { if (t === this.sel && !force) return; this.sel = t; this.loopT = performance.now(); this.draw(); },
    value(t) { return this.metric === "owner" ? this.Wd.ownership[this.own].worker[t.id] : t[this.metric]; },
    draw() {
      cancelAnimationFrame(this.drawRaf); this.drawRaf = 0;
      let animate = false;
      const el = this.el, Wd = this.Wd, cv = $("#wm-canvas", el), ctx = cv.getContext("2d"), m = METRICS[this.metric], T = 80;
      const controlsKey = this.metric + ':' + this.overlay;
      if (controlsKey !== this.controlsKey) { this.controlsKey = controlsKey; setSel(el, "#wm-metric", this.metric); setSel(el, "#wm-overlay", this.overlay); $("#wm-own-l", el).style.display = this.metric === "owner" ? "" : "none"; }
      const vals = Wd.tiles.map((t) => this.value(t));
      const pos = vals.filter((v) => v > 0);
      const lo = Math.min(...pos), hi = Math.max(...vals);
      const f = (v) => m.log ? (v <= 0 ? 0 : (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1)) : v / (hi || 1);
      const under = $("#wm-scene", el).checked && this.bg.complete;
      ctx.fillStyle = "#fbfbfa"; ctx.fillRect(0, 0, 1280, 720);
      Wd.tiles.forEach((t) => {
        const x = (t.id % 16) * T, y = Math.floor(t.id / 16) * T, v = vals[t.id];
        const fill = this.metric === "owner" ? (W[v] || W[0]) : ramp(f(v));
        if (under) { ctx.drawImage(this.bg, (t.id % 16) * 120, Math.floor(t.id / 16) * 120, 120, 120, x + 1, y + 1, T - 2, T - 2); ctx.globalAlpha = 0.6; }
        else if (this.metric === "owner") ctx.globalAlpha = 0.86;
        ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, T - 2, T - 2); ctx.globalAlpha = 1;
        const dim = this.hi && !this.hi.has(t.id);
        if (dim) { ctx.fillStyle = "rgba(246,245,241,0.86)"; ctx.fillRect(x + 1, y + 1, T - 2, T - 2); return; }
        const dark = this.metric === "owner" || under || lum(fill) < 150;
        ctx.fillStyle = dark ? "#ffffff" : INK; ctx.font = TF(18, 600); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(this.metric === "owner" ? (this.own === "openmp4" ? "T" : "R") + v : m.fmt(v), x + T / 2, y + T / 2);
      });
      if (this.overlay !== "none") {
        const P = Wd.partitions[this.overlay];
        P.ranges.forEach(([a, b], k) => {
          ctx.strokeStyle = W[k + 1]; ctx.lineWidth = 4;
          for (let i = a; i <= b; i++) {
            const x = (i % 16) * T, y = Math.floor(i / 16) * T; ctx.beginPath();
            if (i - 16 < a) { ctx.moveTo(x, y); ctx.lineTo(x + T, y); }
            if (i + 16 > b) { ctx.moveTo(x, y + T); ctx.lineTo(x + T, y + T); }
            if (i === a || i % 16 === 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + T); }
            if (i === b || i % 16 === 15) { ctx.moveTo(x + T, y); ctx.lineTo(x + T, y + T); }
            ctx.stroke();
          }
          const mid = Math.floor((a + b) / 2), mx = Math.min(1280 - 80, Math.max(80, (mid % 16) * T + T)), my = Math.floor(mid / 16) * T + 5;
          ctx.fillStyle = "rgba(255,255,255,0.94)"; ctx.fillRect(mx - 76, my, 152, 22); ctx.strokeStyle = W[k + 1]; ctx.lineWidth = 1; ctx.strokeRect(mx - 75.5, my + 0.5, 151, 21);
          ctx.fillStyle = INK; ctx.font = "600 13px Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(`range ${k + 1} · ${(P.sum_ms[k] / 1000).toFixed(3)} s`, mx, my + 11.5);
        });
      }
      // the slowest tile is circled like a china-marker note on the table; the selection is a teal loop
      const dt = Wd.summary.dearest_tile, lp = (id, col, w, prog = 1) => {
        const x = (id % 16) * T - 4, y = Math.floor(id / 16) * T - 4, s = T + 8, per = 4 * s;
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash([per * prog, per]); ctx.beginPath(); ctx.roundRect(x, y, s, s, 6); ctx.stroke(); ctx.restore();
      };
      const cx = (dt % 16 + 0.5) * T, cy = (Math.floor(dt / 16) + 0.5) * T;
      ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.beginPath();
      for (let k = 0; k <= 64; k++) { const a = -2.1 + k / 64 * 2 * Math.PI * 1.08, r = 1 + 0.035 * Math.sin(k * 0.7); ctx.lineTo(cx + Math.cos(a) * T * 0.78 * r, cy + Math.sin(a) * T * 0.62 * r); }
      ctx.stroke(); ctx.restore();
      if (this.sel !== null && this.sel !== dt) {
        const p = REDUCED ? 1 : Math.min(1, (performance.now() - this.loopT) / 300);
        lp(this.sel, TEAL, 3, 1 - Math.pow(1 - p, 3));
        animate = p < 1;
      }
      const legend = this.metric === "owner"
        ? Array.from(new Set(vals)).sort().map((v) => `<span><i style="background:${W[v]}"></i>${this.own === "openmp4" ? "thread" : "rank"} ${v}</span>`).join("") + `<span class="muted">recorded worker column of ${esc(Wd.ownership[this.own].run)}</span>`
        : `<span>${esc(m.label)} · ${m.log ? "log" : "linear"} scale</span><span>${m.fmt(lo)} ${esc(m.unit)}<i class="ramp" style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((q) => ramp(q)).join(",")})"></i>${m.fmt(hi)} ${esc(m.unit)}</span><span><i style="background:none;outline:2px solid ${INK};border-radius:50%;outline-offset:-2px"></i>circled: slowest tile</span>`;
      if (this.legendMarkup !== legend) { this.legendMarkup = legend; $("#wm-legend", el).innerHTML = legend; }
      const detailKey = this.sel + ':' + this.locked;
      if (detailKey !== this.detailKey) { this.detailKey = detailKey; this.detail(); }
      if (!this.leaderRaf) this.leaderRaf = requestAnimationFrame(() => { this.leaderRaf = 0; if (current === "workload") this.leader(); });
      if (animate) this.drawRaf = requestAnimationFrame(() => { this.drawRaf = 0; if (current === "workload") this.draw(); });
    },
    detail() {
      const t = this.Wd.tiles[this.sel], S = this.Wd.summary, Wd = this.Wd;
      const rank = [...Wd.tiles].sort((a, b) => b.compute_ms - a.compute_ms).findIndex((x) => x.id === t.id) + 1;
      $("#wm-detail", this.el).innerHTML = `<h3>Tile ${t.id}</h3><div class="edge">pixels x ${t.x0}–${t.x1 - 1} · y ${t.y0}–${t.y1 - 1}${this.locked ? " · locked, click again to release" : ""}</div><dl class="kv">
        <dt>Compute time</dt><dd>${t.compute_ms.toFixed(3)} ms · median of 7</dd><dt>Rays</dt><dd>${int(t.rays)}</dd><dt>BVH node visits</dt><dd>${int(t.node_visits)}</dd><dt>Primitive tests</dt><dd>${int(t.primitive_tests)}</dd>
        <dt>Relative cost</dt><dd>${(t.compute_ms / S.cheapest_ms).toFixed(1)}× cheapest · rank ${rank} of 144</dd>
        ${Object.entries(Wd.ownership).map(([k, o]) => `<dt>${esc(o.label)}</dt><dd>${k === "openmp4" ? "thread" : "rank"} ${o.worker[t.id]}</dd>`).join("")}</dl>
        <p class="tiny muted" style="margin:12px 0 0">Rays include bounces and shadow rays. Counters are deterministic; compute time is measured.</p>`;
    },
    leader() {
      const st = $("#wm-stage", this.el), cv = $("#wm-canvas", this.el), ins = $("#wm-detail", this.el), svg = $("#wm-lead", this.el);
      if (!st || !st.offsetWidth || this.sel === null) return;
      const s = st.getBoundingClientRect(), c = cv.getBoundingClientRect(), i = ins.getBoundingClientRect(), path = $("path", svg), dot = $("circle", svg);
      if (i.left < c.right) { path.setAttribute("d", ""); dot.setAttribute("cx", -9); return; }
      const x1 = c.left - s.left + ((this.sel % 16) + 1) * c.width / 16, y1 = c.top - s.top + Math.floor(this.sel / 16) * c.height / 9;
      const x2 = i.left - s.left, y2 = i.top - s.top + 34, xm = c.right - s.left + 14;
      path.setAttribute("d", `M${x1},${y1} H${xm} L${x2},${y2}`); dot.setAttribute("cx", x1); dot.setAttribute("cy", y1);
    },
    hist() {
      const tiles = this.Wd.tiles, v = tiles.map((t) => t.compute_ms), lo = Math.min(...v), hi = Math.max(...v), nb = 14;
      const edges = Array.from({ length: nb + 1 }, (_, i) => Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * i / nb));
      const bins = Array.from({ length: nb }, (_, i) => tiles.filter((t) => t.compute_ms >= edges[i] && (i === nb - 1 ? t.compute_ms <= edges[i + 1] : t.compute_ms < edges[i + 1])));
      const mx = Math.max(...bins.map((b) => b.length)), w = 360, hh = 140, bw = w / nb;
      const X = (val) => (Math.log(val) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * w;
      const S = this.Wd.summary;
      const svg = `<svg viewBox="-8 -10 ${w + 16} ${hh + 48}" role="img" aria-label="Histogram of tile compute times">
        ${bins.map((b, i) => `<g class="hist-bin" data-i="${i}"><rect x="${i * bw + 1}" y="${hh - b.length / mx * hh}" width="${bw - 2}" height="${b.length / mx * hh}" fill="${ramp((i + 0.5) / nb)}"></rect>
          <rect x="${i * bw}" y="0" width="${bw}" height="${hh}" fill="transparent"></rect><text x="${i * bw + bw / 2}" y="${hh - b.length / mx * hh - 4}" text-anchor="middle" font-size="9">${b.length || ""}</text></g>`).join("")}
        <line x1="0" x2="${w}" y1="${hh}" y2="${hh}" stroke="${INK4}"/>
        ${[["min", S.cheapest_ms], ["median", S.median_ms], ["max", S.dearest_ms]].map(([l, val]) => `<line x1="${X(val)}" x2="${X(val)}" y1="-4" y2="${hh + 5}" stroke="${l === "max" ? INK : INK3}" stroke-dasharray="3 3"/>
          <text x="${Math.min(w - 16, Math.max(16, X(val)))}" y="${hh + 19}" text-anchor="middle" font-size="10">${l}</text><text x="${Math.min(w - 16, Math.max(16, X(val)))}" y="${hh + 32}" text-anchor="middle" font-size="10" class="mono-t">${val.toFixed(1)} ms</text>`).join("")}</svg>`;
      $("#wm-hist", this.el).innerHTML = svg;
      $$("#wm-hist .hist-bin", this.el).forEach((g) => {
        g.addEventListener("mouseenter", () => { this.hi = new Set(bins[+g.dataset.i].map((t) => t.id)); this.draw(); });
        g.addEventListener("mouseleave", () => { this.hi = null; this.draw(); });
      });
    },
    parts() {
      const P = this.Wd.partitions, total = this.Wd.summary.total_ms;
      $("#wm-parts", this.el).innerHTML = ["2", "4"].map((k) => `<div><div class="cap">${P[k].cap.toFixed(2)}<span>×</span></div>
        <div class="fig-label">speedup cap for ${k} equal-count static workers = ${(total / 1000).toFixed(3)} s ÷ ${(Math.max(...P[k].sum_ms) / 1000).toFixed(3)} s</div>
        <div style="margin-top:16px">${P[k].ranges.map(([a, b], i) => `<div class="part-row"><span class="muted">tiles ${a}–${b}</span><span class="bar" style="background:${W[i + 1]};width:${P[k].sum_ms[i] / total * 100}%"></span><span class="val">${(P[k].sum_ms[i] / 1000).toFixed(3)} s</span></div>`).join("")}</div></div>`).join("");
    },
  };

  // ------------------------------------------------------------------------------------------ 03 scheduler lab
  const POLICIES = ["static", "dynamic", "adaptive"];
  const Sch = D.scheduler;
  const prep = {};
  POLICIES.forEach((p) => {
    const P = Sch.policies[p];
    const byW = {}; P.workers.forEach((w) => (byW[w] = P.tiles.filter((t) => t.w === w).sort((a, b) => a.s - b.s)));
    const ev = new Set([0, P.derived_end_seconds]);
    P.tiles.forEach((t) => { ev.add(t.s); ev.add(t.e); });
    P.batches.forEach((b) => { ev.add(b.dispatched); ev.add(b.received); });
    prep[p] = { P, byW, events: Array.from(ev).sort((a, b) => a - b), end: P.derived_end_seconds, batchOf: (t) => (t.b >= 0 ? P.batches[t.b] : null) };
  });
  function tileState(t, time) { if (time < t.a) return 0; if (time < t.s) return 1; if (time < t.e) return 2; return 3; }
  function workerAt(pp, w, time) {
    const list = pp.byW[w];
    const cur = list.find((t) => t.s <= time && time < t.e);
    const done = list.filter((t) => t.e <= time);
    const assigned = list.filter((t) => t.a <= time).length;
    const busy = list.reduce((s, t) => s + Math.max(0, Math.min(time, t.e) - t.s) * (t.s < time), 0);
    const last = list[list.length - 1].e;
    let status = cur ? "RENDERING" : time >= last ? (this.policy === "static" && time < pp.end ? "IDLE" : "DONE") : "WAITING";
    if (!cur && time < last && pp.P.batches.length) {
      const nextT = list.find((t) => t.s > time);
      if (nextT && nextT.a > time) status = "WAITING";
    }
    return { cur, done: done.length, assigned, busy, last, status, batch: cur ? pp.batchOf(cur) : null };
  }
  // Presentation of the recorded trace only: every pulse, develop and loop is keyed to a recorded time (a, s, e, dispatched).
  function drawGrid(ctx, pp, time, bg, x0, y0, T, labels) {
    ctx.fillStyle = "#fbfbfa"; ctx.fillRect(x0, y0, 16 * T, 9 * T);
    const pulses = [];
    pp.P.tiles.forEach((t) => {
      const c = t.id % 16, r = Math.floor(t.id / 16), x = x0 + c * T + 1, y = y0 + r * T + 1, s = T - 2, st = tileState(t, time), col = W[t.w];
      if (st === 0) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, s, s); if (labels) { ctx.fillStyle = INK4; ctx.font = "12px Consolas"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(t.id, x + 5, y + 4); } return; }
      if (time - t.a < 0.09 && time >= t.a) pulses.push([x, y, s, col, (time - t.a) / 0.09]);
      if (st === 1) { ctx.fillStyle = hexA(col, 0.16); ctx.fillRect(x, y, s, s); ctx.strokeStyle = hexA(col, 0.75); ctx.lineWidth = 1.5; ctx.strokeRect(x + 1, y + 1, s - 2, s - 2); if (labels) { ctx.fillStyle = col; ctx.font = "12px Consolas"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(t.id, x + 5, y + 4); } return; }
      const frac = st === 2 ? (time - t.s) / Math.max(1e-9, t.e - t.s) : 1;
      if (st === 2) { ctx.fillStyle = hexA(col, 0.14); ctx.fillRect(x, y, s, s); }
      if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, c * 120, r * 120, 120, 120 * frac, x, y, s, s * frac);
      if (st === 2) { ctx.strokeStyle = AMBER; ctx.lineWidth = Math.max(2, T * 0.05); ctx.strokeRect(x + 1, y + 1, s - 2, s - 2); }
      else {
        const age = time - t.e;
        if (age < 0.06) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - age / 0.06)})`; ctx.fillRect(x, y, s, s); }
        const e = Math.max(2, Math.round(T * 0.04));
        ctx.fillStyle = col; ctx.fillRect(x, y + s - e, s, e);
      }
      const b = pp.batchOf(t);
      if (b && b.count > 1 && time >= b.dispatched && time - b.dispatched < 0.18) { ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, s + 4, s + 4); ctx.restore(); }
    });
    pulses.forEach(([x, y, s, col, k]) => { ctx.strokeStyle = hexA(col, 1 - k); ctx.lineWidth = 2; const g = k * T * 0.14; ctx.strokeRect(x - g, y - g, s + 2 * g, s + 2 * g); });
  }
  function drawTimeline(ctx, pp, time, x0, y0, w, lane, axisMax, opts = {}) {
    const X = (s) => x0 + w * Math.min(s, axisMax) / axisMax, fs = opts.fontScale || 1;
    pp.P.workers.forEach((wk, i) => {
      const y = y0 + i * (lane + 10);
      ctx.fillStyle = "#e8ebee"; ctx.fillRect(x0, y, w, lane);
      pp.byW[wk].forEach((t) => { ctx.fillStyle = hexA(W[wk], t.s < time ? 1 : 0.24); ctx.fillRect(X(t.s), y + 2, Math.max(1, X(Math.min(t.e, t.s < time ? Math.min(t.e, time) : t.e)) - X(t.s)), lane - 4); });
      pp.P.idle.filter((g) => g.w === wk).forEach((g) => { if (g.to - g.from > 0.01) { ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = hexA(INK, g.from < time ? 0.8 : 0.3); ctx.lineWidth = 1.5; ctx.strokeRect(X(g.from) + 0.75, y + 1.75, X(g.to) - X(g.from) - 1.5, lane - 3.5); ctx.restore(); } });
      if (opts.ticks) pp.P.batches.filter((b) => b.w === wk).forEach((b) => { ctx.fillStyle = b.dispatched <= time ? INK : INK4; ctx.fillRect(X(b.dispatched), y - 4, 1.5, 6); });
      if (opts.labels) { ctx.fillStyle = INK2; ctx.font = TF(Math.round(13 * fs), 600); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText("rank " + wk, x0 - 12, y + lane / 2);
        ctx.fillStyle = W[wk]; ctx.fillRect(x0 - 8, y + lane / 2 - 3, 4, 6); }
    });
    const hgt = pp.P.workers.length * (lane + 10) - 10;
    ctx.fillStyle = INK4; for (let s = 0; s <= axisMax + 1e-9; s += 0.1) ctx.fillRect(X(s), y0 + hgt + 3, 1, 3);
    ctx.fillStyle = INK3; ctx.font = TF(Math.round(11.5 * fs)); ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let s = 0; s <= axisMax + 1e-9; s += 0.5) { ctx.fillRect(X(s), y0 + hgt + 2, 1, 7); ctx.fillText(s.toFixed(1) + " s", X(s), y0 + hgt + 11); }
    const px = X(time); ctx.fillStyle = AMBER; ctx.fillRect(px - 1, y0 - 7, 2, hgt + 14);
    ctx.beginPath(); ctx.moveTo(px - 5, y0 - 12); ctx.lineTo(px + 5, y0 - 12); ctx.lineTo(px, y0 - 6); ctx.fill();
  }
  const MODES = [["static", "Static partition", ""], ["dynamic", "Fixed dynamic", "Formal trace"], ["adaptive", "Adaptive batching", "Formal trace"], ["compare", "Compare", "Three runs, one timebase"]];
  R.scheduler = {
    render(el, params) {
      el.innerHTML = opener("scheduler", "Scheduler Lab", "Three ways to hand out 144 tiles, replayed from the recorded traces.", `${mono("results/protocol-v2/" + Sch.experiment)} · ${esc(Sch.scene)} · ${esc(Sch.preset)} · rank 0 coordinates`) +
        `<div class="modes" role="tablist" id="sc-modes" data-in style="--i:3">${MODES.map(([k, n, p]) => `<button class="mode" role="tab" data-p="${k}" aria-selected="false"><span class="m-name">${n}</span><span class="m-prov edge">${p}</span></button>`).join("")}</div>
        <div class="provline" id="sc-prov" data-in style="--i:3"></div><div id="sc-body" data-in style="--i:4"></div>
        <details class="disclose" id="sc-adaptive"><summary><h2 class="h">How adaptive batching decides</h2><span class="plus" aria-hidden="true"></span></summary><div class="body" id="sc-adaptive-body"></div></details>
        <p class="meta">Press T for the raw trace inspector. Code: <a href="#provenance?panel=code&snippet=coordinator" data-route="provenance?panel=code&snippet=coordinator">coordinator</a> ·
        <a href="#provenance?panel=code&snippet=worker_loop" data-route="provenance?panel=code&snippet=worker_loop">worker loop</a> · <a href="#provenance?panel=code&snippet=batch_size" data-route="provenance?panel=code&snippet=batch_size">batch_size</a></p>`;
      this.el = el; this.bg = img(Sch.tile_image); this.bg.onload = () => this.frame();
      this.time = 0; this.playing = false; this.speed = 0.5;
      $$("#sc-modes .mode", el).forEach((b) => b.addEventListener("click", () => go("scheduler?policy=" + b.dataset.p)));
      this.adaptiveText();
      this.update(params);
    },
    update(params) {
      const p = ["static", "dynamic", "adaptive", "compare"].includes(params.policy) ? params.policy : this.policy || "static";
      if (p !== this.policy) { this.policy = p; this.build(); }
      if (params.t !== undefined) this.time = Math.max(0, +params.t);
      if (params.play === "1" && !this.playing) this.toggle();
      this.frame();
    },
    maxT() { return this.policy === "compare" ? Math.max(...POLICIES.map((p) => prep[p].end)) : prep[this.policy].end; },
    build() {
      const el = this.el, compare = this.policy === "compare";
      $$("#sc-modes .mode", el).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.p === this.policy)));
      this.time = Math.min(this.time, this.maxT());
      const P = Sch.policies[this.policy];
      $("#sc-prov", el).innerHTML = compare
        ? `<span><b>${esc(Sch.alignment)}</b> Dynamic and adaptive replay the recorded dispatch trace.</span>`
        : `${P.classification ? cls(P.classification) : ""}<span>${this.policy === "static" ? "" : "Replayed from the recorded dispatch trace plus tile telemetry."}</span>
          <span class="edge">run ${esc(P.run_id)} · block ${P.block}, the median-time run of 7</span><span class="hide-rec">${P.sources.map(copyPath).join(" · ")}</span>`;
      const consoleHtml = `<div class="console" id="sc-console"><button class="ibtn big" id="sc-play" aria-pressed="false" aria-label="Play">${ICON.play}</button>
        <button class="ibtn" id="sc-restart" aria-label="Restart">${ICON.restart}</button><button class="ibtn" id="sc-prev" aria-label="Previous recorded event">${ICON.prev}</button><button class="ibtn" id="sc-next" aria-label="Next recorded event">${ICON.next}</button>
        <div class="speed">${sw("sc-speed", [["0.25", "0.25×"], ["0.5", "0.5×"], ["1", "1×"]], String(this.speed), "small")}</div>
        <input type="range" class="scrub" id="sc-scrub" min="0" max="1000" value="0" aria-label="Replay time">
        <div class="clock" aria-live="off"><small>t</small><span id="sc-clock">0.000</span> s</div></div>`;
      if (!compare) {
        $("#sc-body", el).innerHTML = `<div class="sc-stage"><div class="sc-field"><canvas id="sc-grid" width="1280" height="720" aria-label="Tile grid replay"></canvas>
          <div class="legend"><span><i style="background:#ffffff"></i>unassigned</span><span><i style="background:${hexA(W[1], 0.16)};outline-color:${W[1]}"></i>assigned, queued</span>
          <span><i style="background:none;outline:2px solid ${AMBER};outline-offset:-2px"></i>rendering now</span><span><i style="background:linear-gradient(to top,${W[1]} 0 3px,#dfe4e8 3px)"></i>done · rank 1 edge</span><span><i style="background:linear-gradient(to top,${W[2]} 0 3px,#dfe4e8 3px)"></i>done · rank 2 edge</span><span class="muted">tile imagery: presentation render of the same scene</span></div></div>
          <div id="sc-cards"></div></div>
          <div class="tl"><canvas id="sc-tl" width="1600" height="138" aria-label="Worker timeline; click to jump"></canvas>
          <div class="legend"><span>blocks = recorded per-tile compute</span>${P.batches.length ? `<span>ticks = recorded dispatches</span>` : ""}<span>dashed outline = idle or waiting</span><span class="muted">click to jump</span></div></div>${consoleHtml}`;
      } else {
        $("#sc-body", el).innerHTML = `<div class="cmp">${POLICIES.map((p) => `<div class="cmp-col"><h3><span>${esc(Sch.policies[p].label)}</span>${Sch.policies[p].classification ? cls(Sch.policies[p].classification) : ""}</h3><canvas class="sc-cmp" data-p="${p}" width="640" height="470"></canvas>
          <div class="cmp-stat" id="sc-cmp-${p}"></div></div>`).join("")}</div>${consoleHtml}
          <div class="prog"><h3 class="h">Tiles rendered over time</h3><canvas id="sc-prog" width="1600" height="300"></canvas></div>`;
      }
      $("#sc-play", el).addEventListener("click", () => this.toggle());
      $("#sc-restart", el).addEventListener("click", () => { this.time = 0; this.frame(); });
      $$("#sc-speed button", el).forEach((b) => b.addEventListener("click", () => { this.speed = +b.dataset.k; setSel(el, "#sc-speed", b.dataset.k); }));
      $("#sc-scrub", el).addEventListener("input", (e) => { this.time = +e.target.value / 1000 * this.maxT(); if (this.playing) this.toggle(); this.frame(); });
      const step = (dir) => {
        const evs = compare ? Array.from(new Set(POLICIES.flatMap((p) => prep[p].events))).sort((a, b) => a - b) : prep[this.policy].events;
        const n = dir > 0 ? evs.find((v) => v > this.time + 1e-7) : [...evs].reverse().find((v) => v < this.time - 1e-7);
        if (n !== undefined) { this.time = n; this.frame(); }
      };
      $("#sc-prev", el).addEventListener("click", () => step(-1)); $("#sc-next", el).addEventListener("click", () => step(1));
      const tl = $("#sc-tl", el);
      if (tl) tl.addEventListener("click", (e) => { const r = tl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 1600; this.time = Math.max(0, Math.min(this.maxT(), (x - 130) / 1440 * 3.5)); this.frame(); });
      requestAnimationFrame(() => inkSwitch(el));
      this.syncPlay();
    },
    syncPlay() { const b = $("#sc-play", this.el); if (!b) return; b.innerHTML = this.playing ? ICON.pause : ICON.play; b.setAttribute("aria-pressed", String(this.playing)); b.setAttribute("aria-label", this.playing ? "Pause" : "Play"); },
    toggle() {
      this.playing = !this.playing; this.syncPlay();
      if (this.playing) { if (this.time >= this.maxT() - 1e-6) this.time = 0; this.last = performance.now(); requestAnimationFrame((ts) => this.tick(ts)); }
    },
    tick(ts) {
      if (!this.playing || current !== "scheduler") { this.playing = false; this.syncPlay(); return; }
      this.time += (ts - this.last) / 1000 * this.speed; this.last = ts;
      if (this.time >= this.maxT()) { this.time = this.maxT(); this.frame(); this.toggle(); return; }
      this.frame(); requestAnimationFrame((t2) => this.tick(t2));
    },
    leave() { if (this.playing) this.toggle(); },
    frame() {
      const el = this.el, time = this.time;
      if (!$("#sc-clock", el)) return;
      $("#sc-clock", el).textContent = time.toFixed(3);
      const sc = $("#sc-scrub", el); sc.value = Math.round(time / this.maxT() * 1000); sc.style.setProperty("--p", (time / this.maxT() * 100).toFixed(2) + "%");
      const big = document.documentElement.classList.contains("recording");
      if (this.policy !== "compare") {
        const pp = prep[this.policy], ctx = $("#sc-grid", el).getContext("2d");
        drawGrid(ctx, pp, time, this.bg, 0, 0, 80, true);
        const tl = $("#sc-tl", el).getContext("2d"); tl.clearRect(0, 0, 1600, 138);
        drawTimeline(tl, pp, time, 130, 22, 1440, 34, 3.5, { ticks: true, labels: true, fontScale: big ? 1.5 : 1.25 });
        this.cards(pp, time);
      } else {
        POLICIES.forEach((p) => {
          const pp = prep[p], t = Math.min(time, pp.end), c = $(`.sc-cmp[data-p="${p}"]`, el).getContext("2d");
          c.clearRect(0, 0, 640, 470);
          drawGrid(c, pp, t, this.bg, 0, 0, 40, false);
          // Recording mode (screen capture, report figures) draws the small canvas labels larger.
          drawTimeline(c, pp, t, big ? 100 : 66, 386, big ? 508 : 560, 22, 3.5, { labels: true, fontScale: big ? 1.8 : 1.15 });
          const done = pp.P.tiles.filter((x) => x.e <= t).length, busy = pp.P.workers.map((w) => workerAt(pp, w, t).busy.toFixed(2));
          const asg = pp.P.batches.length ? ` · ${pp.P.batches.filter((b) => b.dispatched <= t).length} assignments` : "";
          $("#sc-cmp-" + p, el).innerHTML = t >= pp.end
            ? `<span class="fig-s done">${pp.end.toFixed(2)} s</span><span class="small soft">all 144 tiles done · busy r1 ${busy[0]} s · r2 ${busy[1]} s${asg}</span>`
            : `<span class="fig-s">${done}</span><span class="small soft">of 144 tiles · busy r1 ${busy[0]} s · r2 ${busy[1]} s${asg}</span>`;
        });
        this.progress(time);
      }
      if ($("#trace").classList.contains("open")) trace();
    },
    progress(time) {
      const cv = $("#sc-prog", this.el), ctx = cv.getContext("2d"), x0 = 70, w = 1500, y0 = 22, hgt = 220, ax = 3.5;
      const X = (s) => x0 + w * s / ax, Y = (n) => y0 + hgt - hgt * n / 144;
      ctx.clearRect(0, 0, 1600, 300);
      ctx.lineWidth = 1; [0, 36, 72, 108, 144].forEach((n) => { ctx.strokeStyle = n % 72 ? "rgba(27,30,33,0.07)" : "rgba(27,30,33,0.16)"; ctx.beginPath(); ctx.moveTo(x0, Y(n)); ctx.lineTo(x0 + w, Y(n)); ctx.stroke(); ctx.fillStyle = INK3; ctx.font = TF(13); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(n, x0 - 10, Y(n)); });
      ctx.textAlign = "center"; ctx.textBaseline = "top"; for (let s = 0; s <= ax; s += 0.5) ctx.fillText(s.toFixed(1) + " s", X(s), y0 + hgt + 10);
      POLICIES.forEach((p, i) => {
        const ends = prep[p].P.tiles.map((t) => t.e).sort((a, b) => a - b);
        ctx.strokeStyle = POLCOL[p]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); let n = 0;
        for (const e of ends) { if (e > time) break; n++; ctx.lineTo(X(e), Y(n)); }
        ctx.lineTo(X(Math.min(time, prep[p].end)), Y(n)); ctx.stroke();
        ctx.fillStyle = POLCOL[p]; ctx.fillRect(x0 + 24 + i * 290, y0 + 4, 22, 3); ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = TF(15);
        ctx.fillText(Sch.policies[p].label + (time >= prep[p].end ? `  ·  done ${prep[p].end.toFixed(2)} s` : ""), x0 + 54 + i * 290, y0 + 6);
      });
      ctx.fillStyle = AMBER; ctx.fillRect(X(Math.min(time, ax)) - 1, y0 - 4, 2, hgt + 8);
    },
    cards(pp, time) {
      const P = pp.P, stc = { RENDERING: "st-rendering", WAITING: "st-waiting", IDLE: "st-idle", DONE: "st-done" };
      const sent = P.batches.filter((b) => b.dispatched <= time).length;
      const unassigned = P.tiles.filter((t) => t.a > time).length;
      const lane = (col, who, st, stc2, big, small, busy, rows) => `<div class="lane"><span class="sw" style="background:${col}"></span><span class="who">${who}</span><span class="st ${stc2}">${st}</span>
        <div class="big">${big}<small>${small}</small></div>${busy === null ? "" : `<div class="busy"><i style="width:${busy}%;background:${col}"></i></div>`}<div class="rows">${rows}</div></div>`;
      let html = `<div class="lanes">` + (P.batches.length
        ? lane(W[0], "Rank 0 · coordinator", sent < P.batches.length ? "DISPATCHING" : "DONE", sent < P.batches.length ? "st-rendering" : "st-done", sent, `of ${P.batches.length} assignments sent`, null, `Tiles not yet assigned <b>${unassigned}</b>`)
        : lane(W[0], "Rank 0 · coordinator", "GATHERS AT END", "st-waiting", "0", "tiles rendered", null, "Each worker's range was fixed before rendering; results are gathered at the end."));
      P.workers.forEach((w) => {
        const s = workerAt(pp, w, time), b = s.batch;
        const rng = b ? (b.count === 1 ? `tile ${b.first}` : `tiles ${b.first}–${b.first + b.count - 1}`) + ` (batch of ${b.count})` : P.batches.length ? (s.status === "DONE" ? "none (stop received)" : "waiting for next assignment") : `static range ${Math.min(...pp.byW[w].map((t) => t.id))}–${Math.max(...pp.byW[w].map((t) => t.id))}`;
        const busyPct = time > 0 ? Math.round(100 * Math.min(1, s.busy / time)) : 0;
        let rows = `Current <b>${esc(rng)}</b><br>Busy <b>${s.busy.toFixed(2)} s</b> (${busyPct}% of elapsed)`;
        if (s.status === "IDLE") rows += `<br>Idle <b>${(time - s.last).toFixed(2)} s</b> since its last tile`;
        if (b && b.rate_estimate) rows += `<br>Coordinator estimate <b>${(b.rate_estimate / 1000).toFixed(1)} k px/s</b> at dispatch (recorded)`;
        if (b && this.policy === "adaptive") rows += `<br>Adaptive batch <b>${b.count} tile${b.count > 1 ? "s" : ""}</b>`;
        html += lane(W[w], `Rank ${w} · worker`, s.status, stc[s.status], s.done, `tiles done · ${s.assigned} assigned`, busyPct, rows);
      });
      html += `</div><dl class="kv small" style="margin-top:18px"><dt>Recorded wall time</dt><dd>${P.wall_seconds.toFixed(3)} s</dd><dt>Tiles per worker</dt><dd>${Object.entries(P.tiles_per_worker).map(([k, v]) => `r${k}: ${v}`).join(" · ")}</dd>
        <dt>Validation</dt><dd>${P.validation.every_tile_exactly_once ? `<span class="pass">${ICON.check}</span> every tile once` : `<span class="fail">${ICON.cross}</span> tile coverage`}${P.batches.length ? ` · ${P.validation.trace_worker_matches_tiles_csv ? `<span class="pass">${ICON.check}</span>` : `<span class="fail">${ICON.cross}</span>`} trace matches tiles.csv` : ""}</dd></dl>`;
      $("#sc-cards", this.el).innerHTML = html;
    },
    adaptiveText() {
      const code = Sch.adaptive_code, rows = D.performance.scheduler.rows;
      const ad = rows.filter((x) => x.candidate === "hybrid-adaptive" && x.reference === "mpi-dynamic");
      const incl = ad.filter((x) => !x.excludes_zero).length, ex = ad.filter((x) => x.excludes_zero);
      const asg = rows.filter((x) => x.median_of === "hybrid-adaptive" && x.set !== "heterogeneity").map((x) => x.assignments);
      $("#sc-adaptive-body", this.el).innerHTML = `<div class="g g-half" style="padding-bottom:24px"><div><p class="lede">After each returned batch the coordinator measures that worker's throughput (pixels per second of tile render time) and smooths it:
        <span class="mono small">${esc(Sch.adaptive_update.text)}</span> (src/main.cpp line ${Sch.adaptive_update.line}). The next batch is the smallest of:</p>
        <ul class="lim" style="margin-top:12px"><li><b>observed</b>: tiles that fill about 50 ms at the estimated throughput, clamped to 1–8;</li><li><b>fair</b>: remaining ÷ (2 × workers), shrinking the batch as the queue empties;</li>
        <li>the remaining tiles, and a hard cap of 8.</li></ul><p class="small soft" style="margin-top:14px">Before the first observation a worker gets 2 tiles. No completion-time prediction is made: the policy reacts to measured rate and remaining work only.</p>
        <p class="note"><b>Result</b>Adaptive kept the balance but did not win on time. Assignments ${Math.min(...asg)}–${Math.max(...asg)} instead of 144, yet ${incl} of ${ad.length} adaptive-vs-fixed intervals include zero.
        The two that exclude zero point in opposite directions (${ex.map((x) => `${esc(x.set.replace("scheduler-", ""))} ${esc(x.scene)} ${pct(x.change)}`).join("; ")}). No consistent wall-clock advantage on this machine.
        <a href="#defence?q=q08" data-route="defence?q=q08">Why?</a></p></div>
        <div><div class="edge" style="margin-bottom:8px">${esc(code.file)} lines ${code.first_line}–${code.last_line} · commit ${esc(code.commit)}</div>${codeBlock(code.text, code.first_line, [3, 4, 5])}</div></div>`;
    },
  };
  function codeBlock(text, first, hl = []) {
    return `<pre class="code">${text.split("\n").map((l, i) => `<span class="${hl.includes(i) ? "hl" : ""}"><span class="ln">${first + i}</span>${esc(l)}</span>`).join("\n")}</pre>`;
  }
  function trace() {
    const o = $("#trace"), S = R.scheduler;
    const p = S.policy === "compare" || !S.policy ? "adaptive" : S.policy, pp = prep[p], t = S.time || 0;
    const inflight = pp.P.tiles.filter((x) => x.s <= t && t < x.e), recent = pp.P.batches.filter((b) => b.dispatched <= t).slice(-4);
    o.innerHTML = `<div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:18px"><div><h3 class="h" style="font-size:1.6rem">Trace inspector · ${esc(Sch.policies[p].label)} · t = ${t.toFixed(3)} s</h3>
      <div class="edge" style="margin-top:6px">Raw event JSON from ${esc(pp.P.sources.join(" + "))}. ${pp.P.batches.length ? "Batches are recorded trace rows." : "Static has no trace."}</div></div><button class="textbtn" id="trace-close">Close · T / Esc</button></div>
      <div class="g g-half"><div><h3 class="h">Tiles in flight</h3><pre class="code">${esc(JSON.stringify(inflight, null, 1))}</pre></div>
      <div><h3 class="h">${pp.P.batches.length ? "Last dispatched batches (recorded)" : "Recorded fields"}</h3><pre class="code">${esc(JSON.stringify(pp.P.batches.length ? recent : pp.P.recorded_fields, null, 1))}</pre></div></div>`;
    $("#trace-close").onclick = () => o.classList.remove("open");
  }

  // ------------------------------------------------------------------------------------------ 04 hardware & hybrid
  R.hardware = {
    render(el, params) {
      const Hd = D.hardware;
      const tabs = [...Hd.configurations.map((c) => [c.id, c.label]), ["affinity", "Measured affinity"], ["layers", "Parallelism layers"]];
      el.innerHTML = opener("hardware", "Hardware & Hybrid", `${Hd.physical_cores} physical cores, ${Hd.logical_processors} logical processors, and how each execution layout uses them.`, `${esc(Hd.cpu)} · ${(Hd.ram_bytes / 2 ** 30).toFixed(1)} GiB · ${esc(Hd.os)}`, sw("hw-tabs", tabs, "openmp4")) +
        `<div id="hw-body" data-in style="--i:3"></div><p class="meta">Topology from the Windows CPU Set table ${cls("FORMAL")} · sources: ${copyPath(Hd.env_source)} · ${copyPath(Hd.placement.source)} · ${copyPath(Hd.affinity_study.source)}</p>`;
      this.el = el; this.Hd = Hd;
      $$("#hw-tabs button", el).forEach((b) => b.addEventListener("click", () => go("hardware?config=" + b.dataset.k)));
      this.update(params);
    },
    update(params) {
      const ok = ["affinity", "layers", ...this.Hd.configurations.map((c) => c.id)], want = params.config === "hierarchy" ? "layers" : params.config;
      this.cfg = ok.includes(want) ? want : this.cfg || "openmp4"; this.draw();
    },
    coresHtml(lpInfo = () => ({})) {
      return `<div class="cores">${this.Hd.cores.map((c, i) => `<div class="core"><div class="cn"><span class="edge"><b>Core ${i}</b></span><span class="edge">CoreIndex ${c.core_index}</span></div><div class="lps">
        ${c.logical.map((lp) => { const info = lpInfo(lp); return `<div class="lp ${info.hot ? "hot" : ""}">${info.load !== undefined ? `<div class="fill" style="height:${info.load * 100}%"></div>` : ""}<div class="id">${lp}</div>
          <div>${info.tag ? `<div class="tag">${esc(info.tag)}</div>` : ""}<div class="load">${info.load !== undefined ? Math.round(info.load * 100) + "%" : `<span class="muted">logical ${lp}</span>`}</div></div></div>`; }).join("")}</div></div>`).join("")}</div>`;
    },
    draw() {
      const el = this.el, Hd = this.Hd, id = this.cfg, body = $("#hw-body", el);
      setSel(el, "#hw-tabs", id);
      if (id === "layers") {
        const L = [["Image", "One deterministic result; the same bytes from every backend."], ["Tiles", "16×16 pixels with stable IDs: the unit of scheduling and of MPI messages."],
          ["MPI ranks", "Separate processes; rank 0 coordinates in the dynamic modes, the others render."], ["OpenMP threads", "Inside a rank, threads split one tile's pixels (hybrid). OpenMP-only splits the tile list instead."],
          ["Pixels × samples", "Per-sample generator seeded from (seed, pixel, sample): order-independent."], ["Rays", "Camera ray, bounces and shadow rays, each a BVH query."]];
        body.innerHTML = `<div class="band-head"><div><h2 class="h" style="font-size:1.9rem">From one image to billions of rays ${cls("ILLUSTRATIVE")}</h2><p>How Helios nests its parallelism. A description of the code structure, not a measurement.</p></div></div>
          <ol class="layers">${L.map(([t, d], i) => `<li style="--d:${i};${i === 0 ? "--show:none" : ""}" data-in><span class="lt">${t}</span><span class="ld">${d}</span></li>`).join("")}</ol>`;
        return;
      }
      if (id === "affinity") {
        const pl = Hd.placement, runs = pl.runs, keys = Object.keys(runs);
        const panel = (k) => {
          const r = runs[k], label = pl.mode_labels[k] || k, sets = {};
          const procs = [...r.processes].sort((a, b) => b.process_cpu_seconds - a.process_cpu_seconds);
          procs.forEach((p, i) => p.process_default_cpu_sets_logical.forEach((s) => s.forEach((lp) => (sets[lp] = i === 0 ? "heavy rank" : "light rank"))));
          const hasSets = Object.keys(sets).length > 0;
          return `<div><h3 class="h" style="font-size:1.35rem">${esc(label)} ${cls(pl.classification)}</h3>${this.coresHtml((lp) => ({ load: r.per_logical_cpu_busy_fraction[lp], hot: sets[lp] === "heavy rank", tag: sets[lp] ? `CPU Set: ${sets[lp]}` : "" }))}
            <p class="tiny muted" style="margin-top:8px">Fill: fraction of 50 ms samples each logical processor was busy (whole system, including background load).</p>
            <dl class="kv small" style="margin-top:12px"><dt>Process affinity masks</dt><dd>${mono(procs.map((p) => p.process_masks.join("/")).join(", "))} (255 = all 8 CPUs)</dd>
            <dt>Process default CPU Sets</dt><dd>${hasSets ? procs.map((p, i) => `${i === 0 ? "heavy" : "light"} rank → logical ${esc(p.process_default_cpu_sets_logical.filter((s) => s.length).map((s) => s.join(",")).join(" ") || "none")}`).join("; ") : "none assigned (unbound)"}</dd>
            <dt>Rank compute</dt><dd>${r.rank_compute_seconds.map((v) => sec(v)).join(" / ")} (perturbed by sampling)</dd><dt>Image hash</dt><dd>${r.hash_matches_reference ? "matches reference" : "MISMATCH"}</dd></dl></div>`;
        };
        const med = Hd.affinity_study.medians;
        body.innerHTML = `<p class="note" style="margin:0 0 34px;max-width:118ch"><b>Measured placement</b>Diagnostic run ${esc(pl.experiment)} on the pre-fix source ${esc(pl.git_sha.slice(0, 7))}. ${esc(pl.caveat)}.
          Under <span class="mono">-affinity_layout spr:p</span> MS-MPI bound each two-thread rank to one physical core through process default CPU Sets, which affinity masks do not show: both threads of the heavy rank shared the SMT siblings of one core.</p>
          <div class="g g-half">${keys.map(panel).join("")}</div>
          <section class="rule-top" style="margin-top:56px"><div class="g g-main"><div><h3 class="h" style="font-size:1.35rem">Effect on hybrid 2×2 render time ${cls("DIAGNOSTIC")}</h3><div class="chart chart-grow">${hbars([
            ["default launch", med["hybrid-static-2x2"]], ["affinity disabled", med["hybrid-static-2x2-noaffinity"]], ["spr:p (one physical core per rank)", med["hybrid-static-2x2-physicalcore"]]].map(([l, v], i) => ({ label: l, value: v, color: i === 2 ? W[3] : W[2], text: sec(v) })), { w: 900, lw: 300 })}</div></div>
          <div><p class="small soft">Pre-fix source, ${Hd.affinity_study.n["hybrid-static-2x2"]} measured runs each. Logical processors are not independent cores: two threads on SMT siblings share one core's execution resources. This explained why requested affinity hurt; it did not explain the original anomaly, which happened with unbound ranks.</p>
          <a class="act" href="#performance?view=case" data-route="performance?view=case">Case file ${ICON.arrow}</a></div></div></section>`;
        return;
      }
      const c = Hd.configurations.find((x) => x.id === id), nthr = c.ranks * c.threads;
      const procs = Array.from({ length: c.ranks }, (_, r) => `<div class="proc"><span class="pt edge"><b>${c.ranks > 1 ? `MPI rank ${r}` : "one process"}</b></span>
        <div>${Array.from({ length: c.threads }, (_, t) => `<span class="thr" style="background:${W[(r % 4) + 1]};--i:${r * c.threads + t}">${c.threads > 1 ? "t" + t : "r" + r}</span>`).join("")}</div></div>`).join("");
      const S = D.performance.strong.conditions.find((x) => x.id === { openmp4: "openmp:1x4", openmp8: "openmp:1x8", mpi4: "mpi-static:4x1", hybrid22: "hybrid-static:2x2", hybrid14: "hybrid-static:1x4" }[id]);
      body.innerHTML = `<div class="hw-stage"><div><h2 class="h" style="font-size:1.6rem">${esc(c.label)} · execution structure ${cls("ILLUSTRATIVE")}</h2><div class="procs" style="margin-top:22px">${procs}</div>
          <div class="meter" aria-hidden="true">${Array.from({ length: Hd.logical_processors }, (_, i) => `<i class="${i < nthr ? "on" : ""}"></i>`).join("")}</div>
          <p class="small soft">${nthr} rendering threads requested on ${Hd.logical_processors} logical processors (${Hd.physical_cores} physical cores). ${id === "openmp8" ? "Eight threads exceed the four physical cores, so SMT siblings must be shared." : id === "hybrid14" ? "One rank; four threads split every tile's pixels, so the tile list is never partitioned." : id === "hybrid22" ? "Two ranks each own half the tiles; two threads split each tile." : id === "mpi4" ? "Four processes each own a quarter of the tile IDs." : "Four threads each take a contiguous quarter of the tile IDs (schedule static)."}</p>
          <p class="note"><b>Illustrative</b>${esc(Hd.configuration_note)}</p></div>
        <div>${this.coresHtml()}<p class="tiny muted" style="margin-top:10px">Unbound runs: which logical processor ran each thread was not observed, so no slot is marked.</p>
          <div class="nums"><div><div class="fig-s">${sec(S.median)}</div><div class="fig-label">median render time</div></div><div><div class="fig-s">${S.speedup.toFixed(2)}×</div><div class="fig-label">speedup over sequential</div></div><div><div class="fig-s">${S.efficiency.toFixed(2)}</div><div class="fig-label">efficiency per slot</div></div></div>
          <p class="small muted" style="margin-top:14px">${cls("FORMAL")} medium imbalanced workload · ${S.n_valid}/${S.n_measured} valid runs · <a href="#performance?view=speedup" data-route="performance?view=speedup">all configurations</a></p></div></div>`;
    },
  };

  // ------------------------------------------------------------------------------------------ charts (svg)
  function hbars(rows, o = {}) { // rows: {label, value, ci?, color, text, id?}
    const w = o.w || 1000, lw = o.lw || 210, rh = o.rh || 36, max = o.max || Math.max(...rows.map((r) => (r.ci ? r.ci[1] : r.value))) * 1.08, pw = w - lw - (o.tw || 150);
    const X = (v) => lw + pw * v / max, H = rows.length * rh + 34;
    let s = `<svg viewBox="0 0 ${w} ${H}" role="img">`;
    rows.forEach((r, i) => {
      const y = i * rh + 6, sel = o.sel && r.id === o.sel;
      s += `<g class="bar${sel ? " sel" : ""}" ${r.id ? `data-bar="${esc(r.id)}"` : ""}><rect x="0" y="${y}" width="${w}" height="${rh}" fill="${sel ? "rgba(27,30,33,0.045)" : "transparent"}"></rect>
        <text class="lbl" x="${lw - 14}" y="${y + rh / 2}" text-anchor="end" dominant-baseline="middle" font-size="14">${esc(r.label)}</text>
        <rect class="b" style="--i:${i}" x="${lw}" y="${y + 9}" width="${Math.max(1, X(r.value) - lw)}" height="${rh - 18}" fill="${r.color}"></rect>
        ${r.ci ? `<line x1="${X(r.ci[0])}" x2="${X(r.ci[1])}" y1="${y + rh / 2}" y2="${y + rh / 2}" stroke="${INK}" stroke-width="1.5"/><line x1="${X(r.ci[0])}" x2="${X(r.ci[0])}" y1="${y + rh / 2 - 5}" y2="${y + rh / 2 + 5}" stroke="${INK}"/><line x1="${X(r.ci[1])}" x2="${X(r.ci[1])}" y1="${y + rh / 2 - 5}" y2="${y + rh / 2 + 5}" stroke="${INK}"/>` : ""}
        <text x="${X(r.ci ? r.ci[1] : r.value) + 10}" y="${y + rh / 2}" dominant-baseline="middle" font-size="13.5" class="mono-t">${esc(r.text)}</text></g>`;
    });
    s += `<line x1="${lw}" x2="${lw}" y1="0" y2="${rows.length * rh + 8}" stroke="${INK3}"/>`;
    (o.refs || []).forEach((ref) => { s += `<line x1="${X(ref.v)}" x2="${X(ref.v)}" y1="0" y2="${rows.length * rh + 8}" stroke="${ref.color}" stroke-width="2" stroke-dasharray="${ref.dash || "0"}"/><text x="${X(ref.v) + 6}" y="${rows.length * rh + 24}" font-size="12.5" style="fill:${ref.ink || ref.color}">${esc(ref.label)}</text>`; });
    return s + "</svg>";
  }
  function forest(rows, o = {}) { // rows: {label, change, ci}
    const w = o.w || 1000, lw = o.lw || 260, rh = o.rh || 32, lo = o.lo, hi = o.hi, pw = w - lw - 250, X = (v) => lw + pw * (v - lo) / (hi - lo), H = rows.length * rh + 42;
    let s = `<svg viewBox="0 0 ${w} ${H}" role="img"><line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${rows.length * rh}" stroke="${INK3}"/>`;
    rows.forEach((r, i) => {
      const y = i * rh + rh / 2, ex = !(r.ci[0] <= 0 && 0 <= r.ci[1]), col = ex ? (r.change < 0 ? TEAL : FAIL) : INK4;
      s += `<line x1="${lw}" x2="${lw + pw}" y1="${y + rh / 2}" y2="${y + rh / 2}" stroke="rgba(27,30,33,0.07)"/><text x="${lw - 14}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="13">${esc(r.label)}</text>
        <line x1="${X(Math.max(lo, r.ci[0]))}" x2="${X(Math.min(hi, r.ci[1]))}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="3"/><circle cx="${X(r.change)}" cy="${y}" r="5.5" fill="${ex ? col : "#ffffff"}" stroke="${col}" stroke-width="2"/>
        <text x="${lw + pw + 16}" y="${y}" dominant-baseline="middle" font-size="12.5" class="mono-t">${pct(r.change)} [${ciTxt(r.ci, 1)}]</text>
        <text x="${w - 4}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11.5" style="fill:${ex ? col : INK3}">${ex ? (r.change < 0 ? "faster" : "slower") : "no clear difference"}</text>`;
    });
    for (let t = Math.ceil(lo * 10) / 10; t <= hi + 1e-9; t += o.step || 0.1) s += `<text x="${X(t)}" y="${rows.length * rh + 20}" text-anchor="middle" font-size="11.5" class="mono-t" style="fill:${INK3}">${(t * 100).toFixed(0)}%</text>`;
    return s + `</svg>`;
  }

  // ------------------------------------------------------------------------------------------ 05 performance lab
  const VIEWS = [["runtime", "Runtime"], ["speedup", "Speedup"], ["efficiency", "Efficiency"], ["uncertainty", "Uncertainty"], ["weak", "Weak scaling"], ["scheduler", "Scheduler"], ["ab", "Optimisation A/B"], ["case", "Case file"]];
  const famColor = (b) => ({ sequential: W[0], openmp: W[1], "mpi-static": W[4], "hybrid-static": W[2] }[b] || W[0]);
  R.performance = {
    render(el, params) {
      el.innerHTML = opener("performance", "Performance Lab", `Final results on the frozen source ${esc(D.about.frozen_source.slice(0, 7))}, with every uncertainty left visible.`, `${mono("results/protocol-v2/" + D.performance.strong.experiment)} · protocol V2`, sw("pf-tabs", VIEWS, "runtime")) +
        `<div class="pf-stage" data-in style="--i:3"><div id="pf-main"></div><aside class="pf-side" id="pf-side"></aside></div>`;
      this.el = el;
      $$("#pf-tabs button", el).forEach((b) => b.addEventListener("click", () => go("performance?view=" + b.dataset.k)));
      this.update(params);
    },
    update(params) {
      this.view = VIEWS.some(([k]) => k === params.view) ? params.view : this.view || "runtime";
      this.era = ["historical", "final"].includes(params.era) ? params.era : this.era || "final"; this.draw();
    },
    side(html) { $("#pf-side", this.el).innerHTML = html; },
    strongDetail(id) {
      const S = D.performance.strong, c = S.conditions.find((x) => x.id === id), v = this.view;
      this.sel = id;
      $$("#pf-main [data-bar]", this.el).forEach((g) => g.classList.toggle("sel", g.dataset.bar === id));
      $$("#pf-main [data-bar] rect:first-child", this.el).forEach((r) => r.setAttribute("fill", r.parentNode.dataset.bar === id ? "rgba(27,30,33,0.045)" : "transparent"));
      const head = v === "speedup" ? [`${c.speedup.toFixed(2)}×`, "speedup over sequential"] : v === "efficiency" ? [c.efficiency.toFixed(2), "parallel efficiency per rendering slot"] : [sec(c.median), "median render time"];
      this.side(`<div class="open-fig"><div class="fig reveal-wipe">${head[0]}</div><div class="fig-label">${esc(c.label)} · ${head[1]}</div><div style="margin-top:14px">${cls("FORMAL")}</div></div>
        <dl class="kv"><dt>Configuration</dt><dd>${esc(c.backend)} · ${c.ranks} rank(s) × ${c.threads} thread(s) · ${c.slots} slot(s)</dd>
        <dt>Median</dt><dd>${sec(c.median)}</dd><dt>95% bootstrap CI</dt><dd>${sec(c.ci[0])} to ${sec(c.ci[1])}</dd><dt>Speedup</dt><dd>${c.speedup.toFixed(3)}×</dd><dt>Efficiency</dt><dd>${c.efficiency.toFixed(3)}</dd>
        <dt>Compute imbalance</dt><dd>${c.imbalance.toFixed(3)}</dd><dt>Runs</dt><dd>${c.n_valid} valid of ${c.n_measured} measured (+1 warm-up)</dd><dt>Experiment</dt><dd>${mono(S.experiment)}</dd></dl>
        <p class="tiny muted" style="margin-top:12px">Verification: ${S.verification.ppm_images_checked} images rehashed, ${S.verification.failed} failed. ${copyPath(S.source)}</p>`);
    },
    draw() {
      const el = this.el, P = D.performance, v = this.view, main = $("#pf-main", el);
      setSel(el, "#pf-tabs", v);
      const S = P.strong.conditions, cap4 = D.workload.partitions["4"].cap;
      const why = (q, t) => `<a class="act" href="#defence?q=${q}" data-route="defence?q=${q}">Why ${esc(t)} ${ICON.arrow}</a>`;
      if (["runtime", "speedup", "efficiency"].includes(v)) {
        const rows = S.map((c) => ({ id: c.id, label: c.label, color: famColor(c.backend),
          value: v === "runtime" ? c.median : v === "speedup" ? c.speedup : c.efficiency, ci: v === "runtime" ? c.ci : null,
          text: v === "runtime" ? sec(c.median) : v === "speedup" ? c.speedup.toFixed(2) + "×" : c.efficiency.toFixed(2) }));
        const refs = v === "speedup" ? [{ v: cap4, label: `${cap4.toFixed(2)}× cap of an equal 4-way static split`, color: INK2, ink: INK, dash: "6 4" }] : v === "efficiency" ? [{ v: 1, label: "linear (1.0)", color: INK3, dash: "4 4" }] : [];
        const def = v === "speedup" ? "openmp:1x8" : "hybrid-static:1x4";
        main.innerHTML = `<h2 class="h" style="font-size:1.9rem">Strong scaling · ${v === "runtime" ? "median render time" : v === "speedup" ? "speedup over sequential" : "parallel efficiency"} ${cls("FORMAL")}</h2>
          <p class="small soft">Medium imbalanced workload, 7 randomised measured blocks per condition${v === "runtime" ? "; whiskers are 95% bootstrap intervals" : ""}. Select a bar for its record.</p>
          <div class="chart chart-grow">${hbars(rows, { refs, max: v === "efficiency" ? 1.1 : undefined, sel: this.sel && S.some((c) => c.id === this.sel) ? this.sel : def })}</div>
          <div class="legend"><span><i style="background:${W[0]}"></i>sequential</span><span><i style="background:${W[1]}"></i>OpenMP</span><span><i style="background:${W[4]}"></i>MPI static</span><span><i style="background:${W[2]}"></i>hybrid static</span>
          ${v === "efficiency" ? `<span class="muted">OpenMP 8 counts 8 logical processors on 4 cores</span>` : ""}</div>
          <div class="toolbar" style="margin-top:22px;gap:10px 30px">${why("q09", "only ~2× at four slots")}${why("q04", "OpenMP 8 is faster but less efficient")}${why("q06", "Hybrid 1×4 is strongest")}</div>`;
        $$("[data-bar]", main).forEach((g) => g.addEventListener("click", () => this.strongDetail(g.dataset.bar)));
        this.strongDetail(this.sel && S.some((c) => c.id === this.sel) ? this.sel : def);
      } else if (v === "uncertainty") {
        const rows = P.strong.paired.map((p) => ({ label: `${p.candidate} vs ${p.reference}`, change: p.change, ci: p.ci }));
        main.innerHTML = `<h2 class="h" style="font-size:1.9rem">Paired comparisons ${cls("FORMAL")}</h2><p class="small soft">Median of per-block changes with 95% bootstrap intervals. Each block ran both conditions, so their ratio cancels drift within the block.</p>
          <div class="chart">${forest(rows, { lo: -0.45, hi: 0.15, lw: 290 })}</div><div class="toolbar" style="margin-top:18px">${why("q11", "hybrid 2×2 matches OpenMP 4 and MPI 4")}</div>`;
        this.side(`<p class="fig-s" style="margin-bottom:14px">An interval that crosses zero means <b>no clear difference</b>, not equality.</p><ul class="lim"><li>7 blocks: a bootstrap median is always one of the 7 observed values, so intervals are coarse.</li><li>Runs on one machine may be serially correlated.</li>
          <li>No multiple-comparison correction; an effect counts as resolved only if the interval excludes zero and most blocks agree.</li></ul><p class="meta">${copyPath(P.strong.paired_source)}</p>`);
      } else if (v === "weak") {
        const rows = P.weak.conditions.map((c) => ({ label: `${c.backend} ${c.ranks}×${c.threads} (${c.spp} SPP)`, value: c.weak_efficiency, color: famColor(c.backend), text: c.weak_efficiency.toFixed(2) }));
        main.innerHTML = `<h2 class="h" style="font-size:1.9rem">Single-host weak scaling ${cls("FORMAL")}</h2><p class="small soft">Samples per pixel rise in proportion to rendering slots (64 → 128 → 256) on one laptop; weak efficiency = T₁(W) ÷ T_p(p·W). This is not multi-node or cluster behaviour.</p>
          <div class="chart chart-grow">${hbars(rows, { max: 1.1, refs: [{ v: 1, label: "ideal 1.0", color: INK3, dash: "4 4" }] })}</div>
          <table class="reg" style="margin-top:22px"><thead><tr><th>Condition</th><th>Final median</th><th>Final weak eff.</th><th>Historical (pre-fix) ${cls("HISTORICAL")}</th></tr></thead><tbody>
          ${P.weak.conditions.map((c) => `<tr><td>${esc(c.backend)} ${c.ranks}×${c.threads}</td><td>${sec(c.median)}</td><td>${c.weak_efficiency.toFixed(2)}</td><td class="muted">${c.historical_weak_efficiency ?? "–"}</td></tr>`).join("")}</tbody></table>
          <div class="toolbar" style="margin-top:18px">${why("q12", "it is called single-host")}</div>`;
        this.side(`<h3 class="h">Limitations</h3><p class="small soft">Every slot shares one machine's cores, caches and memory. The same equal-count partitions are used at every SPP, so these values mostly re-measure the spatial imbalance. A dynamically scheduled weak-scaling run was not part of the formal matrix.</p><p class="meta">${copyPath(P.weak.source)} · historical ${esc(P.weak.historical_experiment)}</p>`);
      } else if (v === "scheduler") {
        const rs = P.scheduler.rows, lab = (x) => `${x.set.replace("scheduler-", "").replace("heterogeneity", "hetero 2×")} ${x.scene}`;
        const dyn = rs.filter((x) => x.candidate === "mpi-dynamic" && x.reference === "mpi-static").map((x) => ({ label: lab(x), change: x.change, ci: x.ci }));
        const ad = rs.filter((x) => x.candidate === "hybrid-adaptive" && x.reference === "mpi-dynamic").map((x) => ({ label: lab(x), change: x.change, ci: x.ci }));
        const ex = ad.filter((x) => !(x.ci[0] <= 0 && 0 <= x.ci[1]));
        main.innerHTML = `<h2 class="h" style="font-size:1.9rem">Fixed dynamic vs static ${cls("FORMAL")}</h2><div class="chart">${forest(dyn, { lo: -0.4, hi: 0.05, lw: 250 })}</div>
          <h2 class="h" style="font-size:1.9rem;margin-top:34px">Adaptive vs fixed dynamic ${cls("FORMAL")}</h2><div class="chart">${forest(ad, { lo: -0.08, hi: 0.1, lw: 250, step: 0.02 })}</div>
          <p class="note"><b>No consistent direction</b>${ad.length - ex.length} of ${ad.length} intervals include zero; the two that exclude it point in opposite directions (${ex.map((x) => `${esc(x.label)} ${pct(x.change)}`).join("; ")}). With ten uncorrected comparisons, chance cannot be excluded. <a href="#defence?q=q08" data-route="defence?q=q08">Why adaptive did not win</a></p>`;
        this.side(`<p class="fig-s" style="margin-bottom:16px">Dynamic beat static on every natural scene.</p><p class="small soft">Every dynamic-vs-static interval excludes zero. Under a synthetic 2× slow worker the gain is smaller.</p>
          <p class="small soft">Adaptive batching reduced assignments while keeping the balance, but gave no consistent wall-clock advantage over one-tile dynamic scheduling on this single host.</p>
          <a class="act" href="#scheduler?policy=compare" data-route="scheduler?policy=compare">Replay the traces ${ICON.arrow}</a><p class="meta">${Object.values(P.scheduler.experiments).map(copyPath).join("<br>")}</p>`);
      } else if (v === "ab") {
        const G = P.ab.groups, mx = Math.max(...G.map((g) => g.prefix_median)) * 1.05, w = 1000, lw = 150, pw = 560;
        let s = `<svg viewBox="0 0 ${w} ${G.length * 112 + 20}" role="img">`;
        G.forEach((g, i) => {
          const y0 = i * 112 + 8;
          s += `<text x="${lw - 14}" y="${y0 + 44}" text-anchor="end" dominant-baseline="middle" font-size="15" style="fill:${INK}">${esc(g.label)}</text>`;
          [["prefix", "pre-fix", INK4, g.prefix_median, null], ["counter-only", "counter fix", W[2], g["counter-only"].median, g["counter-only"]], ["fixed", "both fixes", TEAL, g.fixed.median, g.fixed]].forEach(([k, l, col, val, ch], j) => {
            const y = y0 + j * 30;
            s += `<g class="chart-grow"><rect class="b" style="--i:${i * 3 + j}" x="${lw}" y="${y}" width="${pw * val / mx}" height="22" fill="${col}"/></g><text x="${lw + pw * val / mx + 10}" y="${y + 11}" dominant-baseline="middle" font-size="13" class="mono-t">${sec(val)}</text>`;
            if (ch) { const exz = !(ch.ci[0] <= 0 && 0 <= ch.ci[1]); s += `<text x="${lw + pw + 110}" y="${y + 11}" dominant-baseline="middle" font-size="13" class="mono-t" style="fill:${exz ? TEAL : INK3}">${pct(ch.change)} ${exz ? `(${ch.faster_blocks}/7 faster)` : "no change resolved"}</text>`; }
          });
        });
        main.innerHTML = `<h2 class="h" style="font-size:1.9rem">Optimisation A/B: two fixes, two signatures ${cls("DIAGNOSTIC")}</h2><p class="small soft">One randomised session, 7 paired blocks per build; all runs pixel- and counter-identical. Builds: pre-fix ${esc(P.ab.builds.prefix)} · counter fix ${esc(P.ab.builds["counter-only"])} · both fixes ${esc(P.ab.builds.fixed)}.</p>
          <div class="chart">${s}</svg></div><div class="legend"><span><i style="background:${INK4}"></i>pre-fix</span><span><i style="background:${W[2]}"></i>counter fix only</span><span><i style="background:${TEAL}"></i>both fixes</span></div>`;
        this.side(`<p class="small"><b style="color:${W[2]}">Counter fix</b>: only the hybrid rows move; sequential, OpenMP 4 and MPI 4 act as controls.</p>
          <p class="small"><b style="color:${TEAL}">BVH stack fix</b>: every row drops by about 45% or more, sequential included, so it removed a serial cost. It is not a parallelism improvement.</p>
          <a class="act" href="#performance?view=case" data-route="performance?view=case">Case file ${ICON.arrow}</a><p class="meta">${copyPath(P.ab.source)}</p>`);
      } else if (v === "case") this.caseFile(main);
    },
    caseFile(main) {
      const C = D.performance.case, P = D.performance, ab = Object.fromEntries(P.ab.groups.map((g) => [g.id, g]));
      const pr = C.address_probe, warm = pr.find((x) => x.warmup), meas = pr.filter((x) => !x.warmup);
      const eff = C.per_tile_efficiency;
      const steps = [
        ["Observation", "HISTORICAL", `Hybrid 2×2 ${sec(C.hybrid22_hist)} vs OpenMP 4 ${sec(C.openmp4_hist)}: ${pct(C.hist_pair_vs_openmp4.change)} (CI ${ciTxt(C.hist_pair_vs_openmp4.ci)}), slower in ${7 - C.hist_pair_vs_openmp4.faster_blocks}/7 blocks. Formal run ${C.historical_strong}, pre-fix source ${C.historical_source}.`],
        ["Hypothesis · work partition", "HISTORICAL", `Not sufficient: the ideal 2×2 time from per-tile costs is ${sec(C.partition.ideal_2x2_s, 2)} (heaviest half ${sec(C.partition.heaviest_half_s)} ÷ 2), no worse than MPI 4's heaviest quarter ${sec(C.partition.heaviest_quarter_s)}. MPI send time of the heavy rank: median ${(C.max_rank_send_s_median * 1000).toFixed(1)} ms.`],
        ["Locating the loss", "HISTORICAL", `Per-tile efficiency: one thread per tile (MPI 4) ${eff["mpi-static-r4-t1"].toFixed(2)}; two threads per tile (2×2) ${eff["hybrid-static-r2-t2"].toFixed(2)}; four (1×4) ${eff["hybrid-static-r1-t4"].toFixed(2)}. Two threads inside a tile were barely faster than one.`],
        ["Hypothesis · CPU placement", "DIAGNOSTIC", `Some placement effects observed: unbound ranks had no CPU Sets; requested spr:p bound each rank to one core and was slower. Not the cause of the original anomaly (it happened unbound).`],
        ["Hypothesis · counter false sharing", "DIAGNOSTIC", `Real issue. Address probe: light rank ${sec(warm.rank0_compute_s)} at offset ${warm.rank0_offset} (no shared line) vs ${sec(Math.min(...meas.map((x) => x.rank0_compute_s)))}–${sec(Math.max(...meas.map((x) => x.rank0_compute_s)))} at offset ${meas[0].rank0_offset} (shared line). Counter fix: hybrid 1×4 ${pct(ab["hybrid-static-1x4"]["counter-only"].change)}, 2×2 ${pct(ab["hybrid-static-2x2"]["counter-only"].change)}; sequential ${pct(ab.sequential["counter-only"].change)} (no change resolved).`],
        ["Discovery", "DIAGNOSTIC", `Scene::hit allocated a std::vector traversal stack on every BVH query: ${int(C.rays_per_image)} queries per image in the medium workload.`, true],
        ["Fix", "DIAGNOSTIC", `A bounded fixed-size traversal stack (int stack[64]); build_bvh checks the depth once. <a href="#provenance?panel=code&snippet=scene_hit" data-route="provenance?panel=code&snippet=scene_hit">Scene::hit</a>`],
        ["Validation", "DIAGNOSTIC", `A/B with identical pixels and counters: both fixes make sequential ${pct(ab.sequential.fixed.change)}, OpenMP 4 ${pct(ab["openmp-4"].fixed.change)}, hybrid 2×2 ${pct(ab["hybrid-static-2x2"].fixed.change)}.`],
        ["Freeze", "FORMAL", `Source frozen at ${esc(D.about.frozen_source.slice(0, 7))}.`],
        ["Formal rerun", "FORMAL", `All six experiment families rerun. Hybrid 2×2 ${sec(C.final_hybrid22)} vs OpenMP 4 ${sec(C.final_openmp4)}: ${pct(C.final_pair_vs_openmp4.change)} (CI ${ciTxt(C.final_pair_vs_openmp4.ci)}), no clear difference established.`],
      ];
      const ccol = { HISTORICAL: STONE_INK, DIAGNOSTIC: W[2], FORMAL: TEAL };
      const hist = P.historical_strong.conditions, fin = P.strong.conditions, era = this.era;
      const rows = (era === "final" ? fin : hist).filter((c) => ["openmp:1x4", "mpi-static:4x1", "hybrid-static:1x4", "hybrid-static:2x2", "hybrid-static:4x1"].includes(c.id))
        .map((c) => ({ label: c.label, value: c.median, color: era === "final" ? famColor(c.id.split(":")[0]) : "#b9ad9c", text: sec(c.median) }));
      main.innerHTML = `<h2 class="h" style="font-size:1.9rem">Case 001 · the hybrid 2×2 anomaly</h2><p class="small soft" style="margin-bottom:22px">From a historical formal result to a frozen, re-measured source: each step with the class of evidence it rests on.</p>
        <ol class="inv">${steps.map(([t, c, txt, key], i) => `<li class="${key ? "key" : ""}" style="--c:${ccol[c]}" data-in><div class="step">${esc(t)}${cls(c)}</div><div class="txt">${txt}</div></li>`).join("")}</ol>
        <p class="note"><b>Caveat</b>The historical ${sec(C.hybrid22_hist)} was not reproduced when the pre-fix source was rebuilt later (${Math.min(...C.rebuild_prefix_seconds).toFixed(2)}–${Math.max(...C.rebuild_prefix_seconds).toFixed(2)} s in diagnostic runs), so the full size of the historical penalty was never attributed to these fixes.</p>`;
      this.side(`<h3 class="h">Four-slot medians</h3>${sw("pf-era", [["historical", "Historical"], ["final", "Final"]], era, "small")}
        <div style="margin-top:14px">${cls(era === "final" ? "FORMAL" : "HISTORICAL")} <span class="small soft">${era === "final" ? `frozen source, ${esc(P.strong.experiment)}` : `pre-fix source, ${esc(P.historical_strong.experiment)}, superseded`}</span></div>
        <div class="chart chart-grow" style="margin-top:10px">${hbars(rows, { w: 360, lw: 104, tw: 74, max: 5.2 })}</div>
        <p class="tiny muted">Separate sessions; not a paired comparison.</p><p class="meta">${copyPath(C.address_probe_source)} · ${copyPath(C.rebuild_source)}</p>`);
      $$("#pf-era button", this.el).forEach((b) => b.addEventListener("click", () => go("performance?view=case&era=" + b.dataset.k)));
      requestAnimationFrame(() => inkSwitch(this.el));
    },
  };

  // ------------------------------------------------------------------------------------------ 06 correctness
  R.correctness = {
    render(el) {
      const C = D.correctness, B = C.backends, cfg = C.configuration;
      el.innerHTML = opener("correctness", "Correctness", `Seven execution backends. One image, byte for byte. ${cls(C.classification)}`, `${esc(cfg.scene)} · ${cfg.width}×${cfg.height} · ${cfg.spp} SPP · depth ${cfg.depth} · seed ${cfg.seed} · frozen binaries`) +
        `<div class="cx-top" data-in style="--i:3"><div><div class="frame" data-cursor-media><img id="cx-big" src="${esc(B[0].image)}" alt="${esc(B[0].label)} output"></div><div class="frame-edge"><span class="edge" id="cx-edge"></span></div></div>
          <div><div class="cx-hash">${esc(B[0].hash)}</div><div class="fig-label">${C.all_identical ? `the FNV-1a image hash of all ${B.length} backends, recomputed independently from each saved image. It matches the recorded end-to-end run, report Figure 13 (${esc(C.figure11_hash)}).` : "hashes differ"}</div>
          <ul class="blist">${B.map((b, i) => `<li><button data-i="${i}" aria-pressed="${i === 0}"><b>${esc(b.label)}</b><span class="edge">${b.ranks > 1 ? `${b.ranks} ranks × ` : ""}${b.threads} thread${b.threads > 1 ? "s" : ""}</span><span class="${b.hash_recomputed_now === b.hash ? "pass" : "fail"}">${b.hash_recomputed_now === b.hash ? ICON.check : ICON.cross}</span></button></li>`).join("")}</ul></div></div>
        <div class="diff-lead" data-in style="--i:4"><div class="zero"><span class="fig" id="cx-n">…</span><span class="per">/ ${int(C.pixels_per_image)} pixels differ</span></div>
          <div><div class="toolbar"><label>A <select id="cx-a">${B.map((b, i) => `<option value="${i}">${esc(b.label)}</option>`).join("")}</select></label>
          <label>B <select id="cx-b">${B.map((b, i) => `<option value="${i}" ${i === B.length - 1 ? "selected" : ""}>${esc(b.label)}</option>`).join("")}</select></label><button class="act ink" id="cx-run">Compare ${ICON.arrow}</button></div>
          <p class="small soft" id="cx-out" style="margin-top:12px"></p></div></div>
        <div class="diff-row" data-in style="--i:5"><div><canvas id="cx-ca" data-cursor-media width="480" height="270"></canvas><div class="cap-l"><span class="edge" id="cx-la"></span></div></div>
          <div><canvas id="cx-cb" data-cursor-media width="480" height="270"></canvas><div class="cap-l"><span class="edge" id="cx-lb"></span></div></div>
          <div><canvas id="cx-cd" width="480" height="270" style="background:#000"></canvas><div class="cap-l"><span class="edge">|A − B| × 16</span></div></div></div>
        <section class="rule-top" style="margin-top:72px"><div class="g g-main"><div><h2 class="h" style="font-size:1.9rem">Validation stack</h2><ul class="vlist" id="cx-stack"></ul></div>
          <div><p class="small soft">Re-run by the Observatory build at ${esc(C.validation_stack.ran_utc)}. Validators write only to temporary directories. The seven renders above illustrate the property; the evidence is this stack and the independent rehash of every formal image.</p>
          <p class="meta">${copyPath(C.source)} · ${copyPath(C.figure11_source)}</p></div></div></section>`;
      this.el = el;
      $("#cx-run", el).addEventListener("click", () => this.compare());
      $$(".blist button", el).forEach((b) => b.addEventListener("click", () => this.pick(+b.dataset.i)));
      $("#cx-stack", el).innerHTML = C.validation_stack.layers.map((l, i) => `<li><span class="muted">${pad(i + 1)}</span>
        <div><b>${esc(l.label)}</b><div class="tiny muted">${esc(l.source)}${l.evidence_line ? ` · “${esc(l.evidence_line)}”` : ""}</div></div>
        <div class="res ${l.passed ? "pass" : "fail"}">${l.passed ? "PASS" : "FAIL"}<span>${l.count !== null ? `${l.count}${l.records ? "/" + l.records : ""} ${esc(l.unit || "")}` : ""}</span></div></li>`).join("");
      this.pick(0);
      this.compare();
    },
    pick(i) {
      const b = D.correctness.backends[i];
      $("#cx-big", this.el).src = b.image; $("#cx-big", this.el).alt = `${b.label} output`;
      $("#cx-edge", this.el).innerHTML = `${esc(b.label)} · ${b.ranks > 1 ? `${b.ranks} ranks × ` : ""}${b.threads} thread${b.threads > 1 ? "s" : ""} · hash ${esc(b.hash)} · presentation render`;
      $$(".blist button", this.el).forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.i === i)));
    },
    compare() {
      const C = D.correctness, B = C.backends, a = +$("#cx-a", this.el).value, b = +$("#cx-b", this.el).value;
      const key = [B[a].backend, B[b].backend], pre = C.pairwise_different_pixels[key.join("|")] ?? C.pairwise_different_pixels[key.slice().reverse().join("|")];
      const ia = img(B[a].image), ib = img(B[b].image);
      $("#cx-la", this.el).textContent = `A · ${B[a].label}`; $("#cx-lb", this.el).textContent = `B · ${B[b].label}`;
      const done = () => {
        if (!ia.complete || !ib.complete) return;
        const ca = $("#cx-ca", this.el).getContext("2d"), cb = $("#cx-cb", this.el).getContext("2d"), cd = $("#cx-cd", this.el).getContext("2d");
        ca.drawImage(ia, 0, 0, 480, 270); cb.drawImage(ib, 0, 0, 480, 270);
        let live = null;
        try {
          const w = ia.naturalWidth, hgt = ia.naturalHeight, off = document.createElement("canvas"); off.width = w; off.height = hgt; const o = off.getContext("2d");
          o.drawImage(ia, 0, 0); const da = o.getImageData(0, 0, w, hgt).data; o.drawImage(ib, 0, 0); const db = o.getImageData(0, 0, w, hgt).data;
          const out = o.createImageData(w, hgt); let diff = 0;
          for (let i = 0; i < da.length; i += 4) { const d0 = Math.abs(da[i] - db[i]), d1 = Math.abs(da[i + 1] - db[i + 1]), d2 = Math.abs(da[i + 2] - db[i + 2]); if (d0 || d1 || d2) diff++; out.data[i] = Math.min(255, d0 * 16); out.data[i + 1] = Math.min(255, d1 * 16); out.data[i + 2] = Math.min(255, d2 * 16); out.data[i + 3] = 255; }
          o.putImageData(out, 0, 0); cd.drawImage(off, 0, 0, 480, 270); live = diff;
          if (diff === 0) { cd.textAlign = "center"; cd.fillStyle = "#e6e9ec"; cd.font = "600 17px Segoe UI, sans-serif"; cd.fillText("all black: no pixel differs", 240, 128); cd.fillStyle = "#8f99a2"; cd.font = "13px Segoe UI, sans-serif"; cd.fillText("difference amplified ×16", 240, 152); }
        } catch (e) { cd.fillStyle = "#16191c"; cd.fillRect(0, 0, 480, 270); cd.fillStyle = "#8f99a2"; cd.font = "14px Segoe UI"; cd.textAlign = "center"; cd.fillText("live difference unavailable (file:// security)", 240, 135); }
        $("#cx-n", this.el).textContent = int(live !== null ? live : pre ?? 0);
        $("#cx-out", this.el).innerHTML = live !== null
          ? `<b>Different pixels: ${int(live)}</b> of ${int(C.pixels_per_image)}, computed in the browser from the lossless PNG data. The build's byte-level count from the PPMs agrees: ${pre === undefined ? "n/a" : int(pre)}.`
          : `<b>Different pixels: ${pre === undefined ? "n/a" : int(pre)}</b> of ${int(C.pixels_per_image)}, counted by the build from the raw PPM bytes. Open via <span class="mono">python scripts/observatory/serve.py</span> to compute it live in the browser.`;
      };
      ia.onload = ib.onload = done; if (ia.complete && ib.complete) done();
    },
  };

  // ------------------------------------------------------------------------------------------ 07 stress & limits
  R.stress = {
    render(el, params) {
      const S = D.stress, span = S.timeout_seconds * 1.1, X = (s) => (s / span * 100).toFixed(3) + "%";
      el.innerHTML = opener("stress", "Stress & Limits", `A workload that did not finish, recorded once and not rerun. ${cls(S.classification)}`, `${mono("results/stress/" + S.run_id)} · supervised run`) +
        `<div class="st-hero" data-in style="--i:3"><div><div class="fig reveal-wipe">${S.elapsed_seconds.toFixed(2)}<span style="font-size:0.42em;letter-spacing:0"> s</span></div><div class="fig-label">elapsed wall time before the supervisor killed the process tree</div></div>
          <div><div class="st-stamp" aria-label="Did not finish">DNF</div><div class="fig-label">terminated at the planned ${S.timeout_seconds} s limit</div></div>
          <div><p class="lede" style="margin:0">${esc(S.scene)}, ${esc(S.backend)}, one thread. <span class="mono small">timed_out = ${S.timed_out}</span> · exit code ${S.exit_code === null ? "null (process tree killed)" : S.exit_code}.</p></div></div>
        <p class="st-set" data-in style="--i:4">A <b>${S.width} × ${S.height}</b> image (${int(S.pixels)} pixels) at <b>${int(S.spp)}</b> samples per pixel and bounce depth <b>${S.max_depth}</b>:
          <b>${(S.camera_samples / 1e9).toFixed(3)}</b> billion camera samples (${int(S.camera_samples)}), before any bounce or shadow ray.</p>
        <div class="gratic" data-in style="--i:5" aria-label="Elapsed time against the time limit"><div class="track"></div>${Array.from({ length: 12 }, (_, i) => i * 60).map((s) => `<div class="tick" style="left:${X(s)}">${s === S.timeout_seconds ? "" : `<span>${s}${s ? "" : " s"}</span>`}</div>`).join("")}
          <div class="run" style="width:${X(S.elapsed_seconds)}"></div><div class="limit" style="left:${X(S.timeout_seconds)}"><span>${S.timeout_seconds} s limit · terminated</span></div></div>
        <ul class="outcomes" data-in style="--i:5"><li><b><span class="pass">${ICON.check}</span>No crash</b><span>Ran until killed; stdout ${S.stdout_bytes} B, stderr ${S.stderr_bytes} B.</span></li>
          <li><b><span class="pass">${ICON.check}</span>No out-of-memory error</b><span>No error output. Memory use was not recorded; the 8-bit image buffer is about ${(S.width * S.height * 3 / 1e6).toFixed(1)} MB.</span></li>
          <li><b><span class="fail">${ICON.cross}</span>No partial image</b><span>Helios writes its image only on completion (ppm: ${String(S.output_files_exist.ppm)}, stats: ${String(S.output_files_exist.stats_json)}).</span></li>
          <li><b><span class="muted">${ICON.restart}</span>Not rerun</b><span>Shown from the recorded manifest and logs, exactly as captured.</span></li></ul>
        <div class="evidence-panel" style="margin-top:56px" data-in><h3 class="h">Recorded evidence</h3><div class="g g-half" style="gap:40px"><dl class="kv"><dt>Started (UTC)</dt><dd>${esc(S.started_utc)}</dd><dt>Ended (UTC)</dt><dd>${esc(S.ended_utc)}</dd>
          <dt>Source · binary</dt><dd>git ${mono(S.git_sha.slice(0, 7))} (source identical to ${mono(D.about.frozen_source.slice(0, 7))}) · ${mono(S.executable_sha256.slice(0, 16) + "…")}</dd><dt>Host</dt><dd>${esc(S.host.cpu)} · ${S.host.cores}C/${S.host.logical}T · ${(S.host.ram_bytes / 2 ** 30).toFixed(1)} GiB</dd></dl>
          <dl class="kv"><dt>Supervisor</dt><dd>${mono(S.command)}</dd><dt>Renderer (recorded)</dt><dd>${mono("helios.exe " + S.renderer_arguments)}</dd></dl></div>
          <p class="meta">${S.sources.map(copyPath).join(" · ")}</p></div>
        <section style="margin-top:72px" id="limits"><div class="band-head" style="margin-bottom:14px"><div><h2 class="h" style="font-size:1.9rem">Threats to validity and how each is handled</h2>
          <p>Paired as in the final report, Section 11. The pairs describe the evaluation's limits; they add no measurement.</p></div></div>
          <table class="threats"><thead><tr><th><span class="edge">Threat</span></th><th><span class="edge">What it limits</span></th><th><span class="edge">How it is handled</span></th></tr></thead><tbody><tr><td>One machine</td><td>Four physical cores with SMT; MPI ran through shared memory on one host, so no network effect was measured.</td><td>Claims are scoped to this host: weak scaling is labelled single-host and no cluster behaviour is claimed.</td></tr><tr><td>Uncontrolled system state</td><td>Windows with background activity; no CPU isolation, fixed frequency, pinning or temperature telemetry.</td><td>Randomised block order, a warm-up per condition, seven measured blocks, medians and paired comparisons within blocks; no slow run removed.</td></tr><tr><td>Scheduling and affinity</td><td>Windows placed unbound threads, and which CPU a thread ran on cannot be observed.</td><td>Formal runs were deliberately left unbound; requested affinity was studied separately as a diagnostic.</td></tr><tr><td>Statistical power</td><td>Seven blocks give coarse intervals; no multiple-comparison correction; effects of a few percent are near the resolution.</td><td>An effect counts only when its interval excludes zero and most blocks agree; an interval containing zero is not read as equality.</td></tr><tr><td>Workload representativeness</td><td>Small procedural scenes; the imbalanced ones were designed to be uneven, which favours dynamic scheduling.</td><td>Stated as a limit on generalisation; comparisons inside an experiment share the machine, binary, session and block structure.</td></tr><tr><td>Synthetic heterogeneity</td><td>The slow worker is a busy-wait on the same host, not a slower machine.</td><td>Labelled synthetic wherever it is reported.</td></tr><tr><td>Build reproducibility</td><td>Rebuilt executables differ in their PE header timestamp and checksum.</td><td>Each manifest records the hash of the exact binary that ran; the claim is identical image hashes, not bit-identical binaries.</td></tr></tbody></table></section>`;
      if (params.panel === "limits") setTimeout(() => $("#limits").scrollIntoView(), 50);
    },
    update(params) { if (params.panel === "limits") $("#limits").scrollIntoView(); },
  };

  // ------------------------------------------------------------------------------------------ 08 provenance
  R.provenance = {
    render(el, params) {
      const P = D.provenance, E = D.experiments.experiments, SN = D.snippets.snippets;
      el.innerHTML = opener("provenance", "Provenance", "Follow any number back to the file it came from.", "source → binary → experiment → raw runs → verify → aggregate → report",
        sw("pv-tabs", [["chains", "Evidence chains"], ["experiments", "Experiment browser"], ["code", "Source inspector"]], "chains")) + `<div id="pv-body" data-in style="--i:3"></div>`;
      this.el = el; this.P = P; this.E = E; this.SN = SN;
      $$("#pv-tabs button", el).forEach((b) => b.addEventListener("click", () => go("provenance?panel=" + b.dataset.k)));
      this.update(params);
    },
    update(params) { this.panel = ["chains", "experiments", "code"].includes(params.panel) ? params.panel : this.panel || "chains"; this.params = params; this.draw(); },
    draw() {
      const el = this.el, body = $("#pv-body", el), p = this.params;
      setSel(el, "#pv-tabs", this.panel);
      if (this.panel === "chains") {
        const cid = p.chain || this.cid || "strong"; this.cid = cid;
        const ch = this.P.chains.find((c) => c.id === cid) || this.P.chains[0];
        this.stage = this.stageFor === ch.id ? this.stage : 2; this.stageFor = ch.id;
        body.innerHTML = `<div class="g g-side"><ol class="claims">${this.P.chains.map((c, i) => `<li><button data-c="${c.id}" aria-pressed="${c.id === ch.id}"><span class="cn">${pad(i + 1)}</span><span class="ct">${esc(c.claim)}</span>${cls(c.classification)}</button></li>`).join("")}</ol>
          <div><h2 class="chain-title">${esc(ch.claim)}</h2><p class="small soft">Report: ${esc(ch.report.reference)} · ${ch.report.verified_in_report_text ? `<span class="pass">value found in the report text ${ICON.check}</span>` : `<span class="fail">value not found in report text</span>`}</p>
          <ol class="chainline">${ch.stages.map((s, i) => `<li class="${i === this.stage ? "sel" : ""}" data-i="${i}"><button aria-expanded="${i === this.stage}"><span class="edge sk">${esc(s.kind)}</span><span class="sl">${esc(s.label)}</span>${s.detail ? `<span class="sd">${esc(s.detail)}</span>` : ""}</button>
            <div class="more">${s.path ? `${copyPath(s.path)}<div class="small ${s.exists ? "pass" : "fail"}" style="margin-top:8px">${s.exists ? `file exists ${ICON.check}` : "MISSING"}</div>` : `<span class="small muted">No file link for this stage.</span>`}</div></li>`).join("")}</ol></div></div>`;
        $$(".claims button", body).forEach((b) => b.addEventListener("click", () => go("provenance?panel=chains&chain=" + b.dataset.c)));
        $$(".chainline li", body).forEach((li) => $("button", li).addEventListener("click", () => {
          this.stage = +li.dataset.i;
          $$(".chainline li", body).forEach((x) => { const on = +x.dataset.i === this.stage; x.classList.toggle("sel", on); $("button", x).setAttribute("aria-expanded", String(on)); });
        }));
      } else if (this.panel === "experiments") {
        const id = p.exp || this.eid || this.E[0].id; this.eid = id;
        const x = this.E.find((e) => e.id === id) || this.E[0];
        body.innerHTML = `<div class="g g-main"><div><table class="reg"><thead><tr><th>Experiment ID</th><th>Design</th><th>Class</th><th>Records</th><th>Verified</th></tr></thead><tbody>
          ${this.E.map((e) => `<tr class="row" tabindex="0" data-e="${e.id}" aria-selected="${e.id === x.id}"><td class="mono">${esc(e.id)}</td><td>${esc(e.experiment)} · ${esc(e.preset)}</td><td>${cls(e.classification)}</td><td>${e.records}</td><td>${e.verification ? `${e.verification.ppm_images_checked}/${e.verification.records}` : "–"}</td></tr>`).join("")}</tbody></table></div>
          <div><h2 class="mono" style="font-size:1.2rem;margin-bottom:10px">${esc(x.id)}</h2>${cls(x.classification)}${x.superseded_by ? `<p class="note"><b>Historical</b>Pre-fix renderer. Superseded by ${esc(x.superseded_by)}.</p>` : ""}
          <dl class="kv" style="margin-top:16px"><dt>Design</dt><dd>${esc(x.experiment)} · ${esc(x.preset)} · scenes ${esc((x.scenes || []).join(", "))}</dd><dt>Source SHA</dt><dd>${mono(x.git_sha)}</dd><dt>Created</dt><dd>${esc(x.created_utc)}</dd>
          <dt>Conditions · records</dt><dd>${x.conditions} conditions · ${x.records} records · ${x.failures} failures</dd><dt>Repeats</dt><dd>${x.warmups} warm-up + ${x.repeats} measured · order seed ${x.order_seed}</dd><dt>Status</dt><dd>${esc(x.status)}</dd>
          <dt>Binaries</dt><dd>${mono((x.executable_sha256 || "not recorded").slice(0, 16) + "…")} · ${mono((x.mpi_executable_sha256 || "not recorded").slice(0, 16) + "…")}</dd>
          <dt>Verification</dt><dd>${x.verification ? `${x.verification.ppm_images_checked} images rehashed, ${x.verification.failed} failed, ${x.verification.errors} errors (rerun at build)` : "not recorded"}</dd>
          <dt>Manifest</dt><dd>${copyPath(x.manifest)}</dd><dt>Aggregate</dt><dd>${copyPath(x.aggregate)}</dd><dt>Raw</dt><dd>${copyPath(x.raw_dir)}</dd><dt>Plots</dt><dd>${x.plots.map(copyPath).join("<br>")}</dd></dl></div></div>`;
        $$("tr.row", body).forEach((r) => { const f = () => go("provenance?panel=experiments&exp=" + r.dataset.e); r.addEventListener("click", f); r.addEventListener("keydown", (e) => { if (e.key === "Enter") f(); }); });
      } else {
        const sid = p.snippet || this.sid || "render_tile"; this.sid = sid;
        const s = this.SN.find((x) => x.id === sid) || this.SN[0];
        const link = { render_tile: ["workload", "Workload Microscope"], scene_hit: ["performance?view=case", "BVH case file"], batch_size: ["scheduler?policy=adaptive", "Adaptive trace"], coordinator: ["scheduler?policy=dynamic", "Dynamic trace"], worker_loop: ["scheduler?policy=dynamic", "Scheduler replay"], mpi_static: ["workload?overlay=4&metric=owner", "Static ownership"], openmp_loop: ["workload?metric=owner", "OpenMP ownership"] }[s.id];
        body.innerHTML = `<div class="g g-side"><ol class="snips">${this.SN.map((x) => `<li><button data-s="${x.id}" aria-pressed="${x.id === s.id}"><b>${esc(x.id)}</b><span class="edge">${esc(x.file)}:${x.first_line}–${x.last_line}</span></button></li>`).join("")}</ol>
          <div><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:14px"><div><h2 class="mono" style="font-size:1.15rem">${esc(s.file)} · lines ${s.first_line}–${s.last_line} · commit ${esc(s.commit)}</h2>
          <p class="small soft" style="margin:6px 0 0">${esc(s.note)} ${s.matches_frozen_commit ? `<span class="pass">identical to the frozen commit ${ICON.check}</span>` : `<span class="fail">differs from frozen commit</span>`}</p></div>
          ${link ? `<a class="act" href="#${link[0]}" data-route="${link[0]}">Evidence: ${esc(link[1])} ${ICON.arrow}</a>` : ""}</div>${codeBlock(s.text, s.first_line)}</div></div>`;
        $$(".snips button", body).forEach((b) => b.addEventListener("click", () => go("provenance?panel=code&snippet=" + b.dataset.s)));
      }
    },
  };

  // ------------------------------------------------------------------------------------------ 09 technical Q&A (route: defence, alias qna)
  R.defence = {
    render(el, params) {
      const Df = D.defence;
      el.innerHTML = opener("defence", "Technical Q&A", "Design decisions, trade-offs and lessons from building Helios.", `${Df.questions.length} questions · ${Df.categories.length} topics`) +
        `<p class="lede qa-intro" data-in style="--i:2">Explore the engineering decisions, performance behaviour, trade-offs and limitations behind Helios. Every answer links to the evidence it rests on.</p>
        <div id="df-body" data-in style="--i:3"></div><p class="meta">${esc(Df.source_note)}</p>`;
      this.el = el; this.cat = "All";
      this.update(params);
    },
    update(params) {
      if (params.topic && D.defence.categories.includes(params.topic)) this.cat = params.topic;
      if (params.q) { this.q = params.q; const f = D.defence.questions.find((x) => x.id === params.q); if (f && this.cat !== "All" && f.category !== this.cat) this.cat = "All"; }
      this.draw();
    },
    draw() {
      const Df = D.defence, body = $("#df-body", this.el);
      const qs = Df.questions.filter((q) => this.cat === "All" || q.category === this.cat), q = qs.find((x) => x.id === this.q) || qs[0];
      body.innerHTML = `<div class="df-stage"><div><div class="cats" role="group" aria-label="Topics">${["All", ...Df.categories].map((c) => `<button data-c="${esc(c)}" aria-pressed="${c === this.cat}">${esc(c)}</button>`).join("")}</div>
          <ol class="qlist">${qs.map((x) => `<li><button data-q="${x.id}" aria-pressed="${x.id === q.id}"><span class="qn">${esc(x.id.toUpperCase())}</span><span>${esc(x.question)}</span><span class="qc">${esc(x.category)}</span></button></li>`).join("")}</ol></div>
        <article class="answer" aria-live="polite"><h2 class="q">${esc(q.question)}</h2>
          <div class="ab short"><span class="al">Short answer</span><div class="body">${esc(q.short)}</div></div>
          <div class="ab"><span class="al">Evidence</span><ul>${q.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
          <div class="ab caveat"><span class="al">${esc(q.caveat_label || "Limitation")}</span><div>${esc(q.caveat)}</div></div>
          <div class="go"><a class="act" href="#${esc(q.route)}" data-route="${esc(q.route)}">Show evidence ${ICON.arrow}</a><span class="edge">${esc(q.category)} · sources: ${q.sources.map(esc).join(" · ")}</span></div></article></div>`;
      $$(".cats button", body).forEach((b) => b.addEventListener("click", () => { this.cat = b.dataset.c; this.q = null; this.draw(); $(`.cats button[data-c="${CSS.escape(this.cat)}"]`, body)?.focus(); }));
      $$(".qlist button", body).forEach((b) => b.addEventListener("click", () => { this.q = b.dataset.q; this.draw(); $(`.qlist button[data-q="${this.q}"]`, body)?.focus(); $(".answer", body).animate?.([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: REDUCED ? 1 : 360, easing: "cubic-bezier(.2,.7,.2,1)" }); }));
    },
  };

  // ------------------------------------------------------------------------------------------ presentation, recording, keys
  // Same order as the video (docs/VIDEO_PLAN.md); the code and terminal segments happen between Scheduler and Strong scaling.
  const PRESENT = [["overview", "Hero"], ["render?autoplay=1", "Convergence"], ["hardware?config=layers", "Architecture & hybrid layers"], ["workload?overlay=4", "Workload microscope"],
    ["scheduler?policy=compare&t=0&play=1", "Scheduler"], ["performance?view=speedup", "Strong scaling"], ["performance?view=case", "Investigation case"], ["correctness", "Correctness"],
    ["stress", "Stress & limits"], ["provenance?panel=chains&chain=strong", "Provenance"], ["overview?panel=close", "Conclusion"]];
  let presenting = -1, hudTimer = null;
  function present(i) {
    closeAbout(false);
    presenting = Math.max(0, Math.min(PRESENT.length - 1, i));
    document.body.classList.add("presenting");
    go(PRESENT[presenting][0]);
    updatePresentHud();
  }
  function stopPresent() { presenting = -1; document.body.classList.remove("presenting"); }
  function wakeHud() { const hud = $("#present-hud"); hud.classList.remove("idle"); clearTimeout(hudTimer); hudTimer = setTimeout(() => hud.classList.add("idle"), 2200); }
  function updatePresentHud() {
    if (presenting < 0) return;
    $("#present-label").textContent = `${pad(presenting + 1)} / ${pad(PRESENT.length)} · ${PRESENT[presenting][1]}`;
    $("#present-dots").style.setProperty("--pp", ((presenting + 1) / PRESENT.length).toFixed(4));
    wakeHud();
  }
  $("#pnav-prev").innerHTML = ICON.left; $("#pnav-next").innerHTML = ICON.right;
  $("#pnav-prev").addEventListener("click", () => present(presenting - 1)); $("#pnav-next").addEventListener("click", () => present(presenting + 1));
  $("#btn-present").addEventListener("click", () => present(0));
  // Recording mode is an author tool for screen capture: ?mode=recording only, no public control.
  function setRecording(on) { document.body.classList.toggle("recording", on); document.documentElement.classList.toggle("recording", on); if (current) { R[current]?.frame?.(); requestAnimationFrame(() => inkSwitch($("#sec-" + current))); } }
  if (new URLSearchParams(location.search).get("mode") === "recording") setRecording(true);
  if (new URLSearchParams(location.search).get("mode") === "present") present(Math.max(0, (+new URLSearchParams(location.search).get("item") || 1) - 1));
  document.addEventListener("keydown", (e) => {
    const tg = e.target instanceof Element ? e.target : document.body;
    if (tg.closest("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (presenting >= 0) wakeHud();
    if (k === "Escape") { if ($("#trace").classList.contains("open")) $("#trace").classList.remove("open"); else if (about.classList.contains("open")) closeAbout(); else if (nav.classList.contains("open")) nav.classList.remove("open"); else stopPresent(); return; }
    if (presenting >= 0 && (k === "ArrowRight" || k === "PageDown")) { e.preventDefault(); present(presenting + 1); return; }
    if (presenting >= 0 && (k === "ArrowLeft" || k === "PageUp")) { e.preventDefault(); present(presenting - 1); return; }
    if (k === " ") { const c = R[current]; if (c && c.toggle && !tg.closest("button, a")) { e.preventDefault(); c.toggle(); } return; }
    if (k === "t" || k === "T") { if (current === "scheduler") { $("#trace").classList.toggle("open"); if ($("#trace").classList.contains("open")) trace(); } return; }
    if (k === "p" || k === "P") { presenting >= 0 ? stopPresent() : present(0); return; }
    const s = SECTIONS.find((x) => x.key === k);
    if (s && tg.closest("canvas") === null) go(s.id);
  });
  document.addEventListener("mousemove", () => { if (presenting >= 0) wakeHud(); }, { passive: true });

  show();
})();
