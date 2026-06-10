/* Liquid cursor lab page wiring: mode, mask and preset switches, the live tuning panel, and the native-cursor test controls.
   The engine (liquid-cursor.js) knows nothing about this page. URL overrides for automated checks:
   ?mode=A|B|C  ?mask=difference|plain  ?preset=phase1Disc|phase2Original|santioniRefined|current|tooSoft|tooViscous  ?cursor=off
   ?droplet=balanced|balancedOriginal|shortNeck|longNeck  (?preset=santioniClean, the Phase 2 name, opens the Phase 2 original)
   ?pool=connectedBalanced|connectedSparse|connectedHeavy|connectedBoundary|richBalanced|balanced|single|...  ?cap=3|4|5
   ?seed=N (pool snapshot, capacity override, droplet random seed). Mode B adds the liquid (the Phase 4.5 correction's
   connected goo by default; "richBalanced" is the droplet-centric first attempt, "balanced" the Phase 4 default, "single"
   the approved Phase 3 droplet); Mode C shows it with instrumentation, an on/off switch and a natural-emission switch.
   Keys 4-9 and 0 pick the pool comparison snapshots (Phase 4, rich goo, connected previous, reference sparse / balanced /
   heavy / boundary). The default is the reference goo (the curved metaball spine). */
"use strict";
(function () {
  const CFG = window.LIQUID_CURSOR_CONFIG;
  const $ = (s) => document.querySelector(s);
  const q = new URLSearchParams(location.search);
  const mode0 = /^[ABC]$/.test(q.get("mode") || "") ? q.get("mode") : CFG.lab.defaultMode;
  const mask0 = q.get("mask") === "plain" ? "plain" : CFG.render.mask;

  const engine = window.LiquidCursor.create(CFG, { mode: mode0 });
  const debug = window.LiquidCursorDebug.create(engine, $("#debug"), CFG);
  window.liquidCursorLab = { engine, CFG }; // for inspection from DevTools only
  const S = engine.state;

  if (!engine.state.webgl2) {
    const f = $("#gl-fail"); f.hidden = false;
    f.textContent = `WebGL2 unavailable (${engine.state.glError || "no context"}): the lab cursor is disabled and the native cursor is kept.`;
  }

  function setMode(m) {
    engine.setMode(m);
    $("#banner-b").hidden = m !== "B";
    $("#droplet-bar").hidden = m === "A";
    $("#drop-enable-wrap").hidden = m !== "C"; $("#drop-natural-wrap").hidden = m !== "C";
    debug.show(m === "C");
    document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === m; });
  }
  function setMask(m) {
    engine.setMask(m);
    document.querySelectorAll('input[name="mask"]').forEach((r) => { r.checked = r.value === m; });
  }
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => r.checked && setMode(r.value)));
  document.querySelectorAll('input[name="mask"]').forEach((r) => r.addEventListener("change", () => r.checked && setMask(r.value)));
  $("#opt-enabled").addEventListener("change", (e) => engine.setEnabled(e.target.checked));
  $("#opt-native").checked = !CFG.lab.hideNativeCursor;
  $("#opt-native").addEventListener("change", (e) => engine.setHideNative(!e.target.checked));
  if (q.get("cursor") === "off") { $("#opt-enabled").checked = false; engine.setEnabled(false); }
  setMode(mode0); setMask(mask0);

  // ---- presets and live tuning (lab-only development aids, not production features)
  const PRESETS = CFG.lab.presets, STORE = "liquid-cursor-lab.current-tuning.v1";
  const TUNE = [
    ["Main body"],
    ["radius", "Base radius", 16, 60, 1], ["followResponse", "Follow response", 8, 120, 1], ["maxStretch", "Max stretch", 1, 1.8, 0.01],
    ["compressionExponent", "Compression exponent", 0, 1.2, 0.05],
    ["stretchSpeed", "Stretch speed (63%)", 300, 3000, 10], ["stretchCurve", "Stretch curve", 0.8, 3, 0.05], ["velocitySmoothingMs", "Velocity smoothing ms", 5, 150, 1],
    ["stretchResponse", "Stretch response", 5, 90, 1], ["recoveryResponse", "Recovery response", 5, 90, 1], ["deformDamping", "Deform damping", 0.2, 1.2, 0.01],
    ["axisResponse", "Axis response", 4, 80, 1],
    ["Surface"],
    ["membrane", "Membrane model", ["field", "harmonic"]],
    ["baseNoise", "Noise at rest px", 0, 3, 0.05], ["maxNoise", "Noise moving px", 0, 6, 0.05], ["noiseCurve", "Noise curve", 0.5, 3, 0.05],
    ["noiseScale", "Field feature px", 8, 60, 1], ["noiseFrequency", "Harmonic k", 2, 8, 1], ["noiseSpeed", "Noise speed", 0, 4, 0.05],
    ["stillNoise", "Noise kept when still", 0, 1, 0.05],
    ["Interaction"],
    ["hoverScale", "Hover scale", 1, 1.5, 0.01], ["hoverNoiseMultiplier", "Hover noise ×", 0, 1, 0.05], ["hoverDeformMultiplier", "Hover deform ×", 0, 1, 0.05],
    ["clickCompression", "Click compression", 0, 0.3, 0.01], ["releaseDamping", "Release damping", 0.15, 1.2, 0.01],
    ["Droplet (Mode B / C)"],
    ["dropAccel", "Accel threshold px/s²", 10000, 200000, 1000], ["dropJerk", "Jerk threshold px/s³", 2e5, 1.2e7, 1e5],
    ["dropImpulse", "Velocity swing px/s", 400, 5000, 50], ["dropTurnGain", "Turn sensitivity", 0.5, 3, 0.05], ["dropMinSpeed", "Min speed px/s", 100, 3000, 50],
    ["dropCooldownMs", "Cooldown ms", 0, 3000, 50], ["dropRadius", "Radius px", 3, 10, 0.1], ["dropBudMs", "Bud ms", 5, 120, 1], ["dropNeckMs", "Neck ms", 5, 200, 1], ["dropThreadMs", "Thin thread ms", 0, 80, 1],
    ["dropUnion", "Neck / union strength", 0.3, 3, 0.05], ["dropPinchCurve", "Pinch decisiveness", 0.5, 4, 0.05], ["dropMomentum", "Momentum inheritance", 0, 1, 0.01],
    ["dropDrag", "Drag 1/s", 0, 20, 0.1], ["dropLifeMs", "Life ms", 150, 1500, 10], ["dropShrinkCurve", "Shrink curve", 0.3, 4, 0.05], ["dropFadeCurve", "Fade curve", 0.3, 4, 0.05],
    ["Droplet pool (Phase 4)"],
    ["poolMax", "Capacity (1 = Phase 3)", 1, 5, 1], ["poolBurst", "Events per burst", 1, 5, 1], ["poolSpacingMs", "Follow-up spacing ms", 0, 1000, 10],
    ["poolStep", "Follow-up strength step", 0, 0.6, 0.01], ["poolFollowScale", "Follow-up size ×", 0.5, 1, 0.01],
    ["poolSatellite", "Residual satellite (0/1)", 0, 1, 1], ["poolSatSwing", "Satellite swing ×", 1, 3, 0.05],
    ["Rich goo (Phase 4.5)"],
    ["gooSecSwing", "Secondary threshold ×", 0.9, 2.5, 0.01], ["gooMicroSwing", "Micro threshold ×", 0.9, 3, 0.01], ["gooBudget", "Burst budget (pieces)", 1, 8, 1],
    ["gooSpacingMs", "Min event spacing ms", 40, 400, 5], ["gooSecScale", "Secondary radius ×", 0.4, 1, 0.01], ["gooMicroScale", "Micro radius ×", 0.3, 0.8, 0.01],
    ["gooSecDelayMs", "Secondary delay ms", 20, 120, 1], ["gooMicroDelayMs", "Micro delay ms", 40, 200, 1], ["gooSecNeckMs", "Secondary neck ms", 30, 124, 1],
    ["gooWake", "Wake (tail stress) gain", 0, 5, 0.1], ["gooWakeLife", "Wake persistence ×", 0.5, 2, 0.05], ["gooMomentum", "Momentum inheritance ×", 0, 1.5, 0.05],
    ["gooDrag", "Drag ×", 0.3, 2.5, 0.05], ["gooLife", "Lifetime scale ×", 0.5, 2, 0.05], ["gooJoin", "Coalescence distance ×", 0.6, 1.5, 0.05], ["gooTaper", "Rear taper", 0, 0.2, 0.01],
    ["Connected goo (Phase 4.5 correction)"],
    ["wakeLenMin", "Tail length, trigger level px", 20, 160, 1], ["wakeLenMax", "Tail length, strongest px", 30, 190, 1], ["wakeStrand", "Strand radius px", 2, 12, 0.1],
    ["wakeBulb", "Bulb radius px", 4, 20, 0.1], ["wakeUnion", "Root fillet ×", 0.5, 3, 0.05], ["wakeHoldMs", "Hold before the neck ms", 30, 300, 5],
    ["wakeNeckMs", "Neck ms", 10, 120, 1], ["wakeSplash", "Splash beads", 0, 5, 0.1], ["wakeRelease", "Release share", 0, 1, 0.01],
    ["wakeBulbLife", "Free bulb life ×", 0.2, 2, 0.05], ["wakeOmega", "Strand stiffness rad/s", 8, 60, 1], ["wakeLag", "Left-behind lag", 0, 1, 0.01],
    ["Reference goo (Phase 4.5, default)"],
    ["spineLength", "Tail length px", 20, 180, 1], ["spineNodes", "Node count", 2, 4, 1], ["spineStiffness", "Tail stiffness rad/s", 8, 80, 1], ["spineLag", "Trajectory lag", 0, 0.9, 0.01],
    ["spineVOn", "Goo onset speed px/s", 400, 3000, 50], ["spineRoot", "Root radius ×", 0.3, 1.1, 0.01], ["spineBulb", "Bulb radius ×", 0.5, 1.2, 0.01], ["spineNeck", "Neck radius ×", 0.1, 0.6, 0.01], ["spineTaper", "Tail taper (gradual 1 · abrupt 0)", 0, 1, 0.01],
    ["spineTerminal", "Terminal lobe radius ×", 0.1, 0.7, 0.01], ["spineIrregular", "Irregularity ×", 0, 0.4, 0.01], ["spineUnion", "Smooth-union strength ×", 0.1, 1.2, 0.01], ["spineHoldMs", "Tail hold ms", 30, 400, 5],
    ["spineRetractMs", "Retract ms", 20, 300, 5], ["spineShedMin", "Break threshold (energy)", 0.1, 0.95, 0.01], ["spineShedRate", "Splash rate", 0, 80, 1], ["spineSplashCount", "Splash count (per burst)", 0, 8, 1],
    ["spineSplashMin", "Splash radius min px", 1, 6, 0.1], ["spineSplashMax", "Splash radius max px", 2, 12, 0.1], ["spineSplashLife", "Splash life ×", 0.3, 2.5, 0.05],
    ["spineSplashMomentum", "Splash momentum", 0, 1, 0.01],
  ];
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; } };
  const writeStore = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage unavailable: tuning still works for this visit */ } };
  const rows = $("#tuning-rows"), inputs = {};
  const changed = () => { selectPreset("current", false); writeStore(liveValues()); };
  TUNE.forEach(([k, label, min, max, step]) => {
    if (label === undefined) { const g = document.createElement("div"); g.className = "grp"; g.textContent = k; rows.appendChild(g); return; }
    const id = "tune-" + k, l = document.createElement("label"), o = document.createElement("output");
    l.htmlFor = id; l.textContent = label; o.htmlFor = id;
    let i;
    if (Array.isArray(min)) { // a named choice (the membrane model)
      i = document.createElement("select");
      min.forEach((v) => { const op = document.createElement("option"); op.value = op.textContent = v; i.appendChild(op); });
      i.addEventListener("change", () => { engine.setParams({ [k]: i.value }); changed(); });
    } else {
      i = document.createElement("input"); i.type = "range"; i.min = min; i.max = max; i.step = step;
      i.addEventListener("input", () => { engine.setParams({ [k]: +i.value }); o.textContent = i.value; changed(); });
    }
    i.id = id; rows.append(l, i, o); inputs[k] = [i, o];
  });
  const liveValues = () => { const v = {}; for (const k in window.LiquidCursor.PARAMS) v[k] = engine.params[k]; return v; };
  function syncInputs() {
    for (const k in inputs) {
      const [i, o] = inputs[k], v = engine.params[k];
      i.value = v; o.textContent = typeof v === "number" ? String(+v.toFixed(3)) : "";
    }
  }
  const sel = $("#preset"), compare = document.querySelectorAll('input[name="compare"]');
  [["phase1Disc"], ["phase2Original"], ["santioniRefined"], ["current", "Current tuning"], ["tooSoft"], ["tooViscous"]].forEach(([k, l]) => {
    const o = document.createElement("option"); o.value = k; o.textContent = l || PRESETS[k].label; sel.appendChild(o);
  });
  let presetKey = "";
  // Pool snapshots set pool and rich-goo tunables only; the capacity select can override the snapshot's capacity.
  // The comparison runs Phase 3 -> Phase 4 -> rich goo sparse / balanced / heavy -> the boundary; the other Phase 4
  // snapshots are kept as history.
  const POOLS = CFG.lab.poolPresets, poolSel = $("#pool-preset"), capSel = $("#pool-cap");
  const POOL_ORDER = ["balanced", "richBalanced", "connectedBalanced", "refSparse", "refBalanced", "refHeavy", "refBoundary"], POOL_KEYS = ["4", "5", "6", "7", "8", "9", "0"];
  [["Comparison (keys 4-9, 0)", POOL_ORDER], ["History", Object.keys(POOLS).filter((k) => !POOL_ORDER.includes(k))]].forEach(([label, keys]) => {
    const g = document.createElement("optgroup"); g.label = label;
    keys.forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = POOLS[k].label; g.appendChild(o); });
    poolSel.appendChild(g);
  });
  let poolKey = POOLS[q.get("pool")] ? q.get("pool") : CFG.lab.defaultPoolPreset;
  if (["3", "4", "5"].includes(q.get("cap"))) capSel.value = q.get("cap");
  const poolDefaults = () => { const v = {}, PR = window.LiquidCursor.PARAMS; for (const k in PR) if (/^(pool|goo|wake|spine)/.test(k)) v[k] = CFG[PR[k][0]][PR[k][1]]; return v; };
  const poolValues = () => ({ ...poolDefaults(), ...POOLS[poolKey].values, ...(capSel.value !== "preset" && poolKey !== "single" ? { poolMax: +capSel.value } : {}) });
  function selectPoolPreset(k) {
    poolKey = k in POOLS ? k : CFG.lab.defaultPoolPreset; poolSel.value = poolKey;
    engine.setParams(poolValues()); engine.state.poolPreset = POOLS[poolKey].label; syncInputs();
  }
  poolSel.addEventListener("change", () => selectPoolPreset(poolSel.value));
  capSel.addEventListener("change", () => selectPoolPreset(poolKey));
  // keys 4-9 and 0 switch the pool comparison while the other hand keeps whipping the mouse
  document.addEventListener("keydown", (e) => {
    const i = POOL_KEYS.indexOf(e.key), t = e.target;
    if (i < 0 || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["radio", "checkbox", "range", "button"].includes(t.type)))) return;
    if (S.mode !== "A") selectPoolPreset(POOL_ORDER[i]);
  });
  // Phase 3 droplet snapshots set droplet tunables only, on top of whatever body preset is selected
  const DROPS = CFG.lab.dropletPresets, dropSel = $("#drop-preset");
  Object.entries(DROPS).forEach(([k, v]) => { const o = document.createElement("option"); o.value = k; o.textContent = v.label; dropSel.appendChild(o); });
  let dropKey = DROPS[q.get("droplet")] ? q.get("droplet") : CFG.lab.defaultDropletPreset;
  const dropDefaults = () => { const v = {}; for (const k in window.LiquidCursor.PARAMS) if (k.startsWith("drop")) v[k] = CFG.droplets[window.LiquidCursor.PARAMS[k][1]]; return v; };
  const dropValues = () => ({ ...dropDefaults(), ...DROPS[dropKey].values });
  function selectDropletPreset(k) {
    dropKey = k in DROPS ? k : CFG.lab.defaultDropletPreset; dropSel.value = dropKey;
    engine.setParams(dropValues()); engine.state.dropletPreset = DROPS[dropKey].label; syncInputs();
  }
  dropSel.addEventListener("change", () => selectDropletPreset(dropSel.value));
  function selectPreset(k, apply = true) {
    k = CFG.lab.presetAliases[k] || k;
    if (!(k in PRESETS) && k !== "current") k = CFG.lab.defaultPreset;
    presetKey = k; sel.value = k;
    compare.forEach((r) => { r.checked = r.value === k; });
    if (apply) engine.resetParams(k === "current" ? readStore() || liveValues() : { ...poolValues(), ...DROPS[dropKey].values, ...PRESETS[k].values });
    engine.state.preset = k === "current" ? "Current tuning" : PRESETS[k].label;
    $("#tune-preset").textContent = "· " + engine.state.preset;
    syncInputs();
  }
  sel.addEventListener("change", () => selectPreset(sel.value));
  compare.forEach((r) => r.addEventListener("change", () => r.checked && selectPreset(r.value)));
  // keys 1, 2, 3 pick the comparison presets while the other hand keeps moving the mouse (not while typing or in a select)
  document.addEventListener("keydown", (e) => {
    const i = ["1", "2", "3"].indexOf(e.key), t = e.target;
    if (i < 0 || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["radio", "checkbox", "range", "button"].includes(t.type)))) return;
    selectPreset(CFG.lab.compare[i]);
  });
  $("#tune-reset").addEventListener("click", () => selectPreset(presetKey === "current" ? CFG.lab.defaultPreset : presetKey));
  $("#tune-copy").addEventListener("click", () => {
    const text = JSON.stringify(liveValues(), null, 1), out = $("#tune-out");
    const done = (ok) => { out.textContent = ok ? "copied" : "copy unavailable"; setTimeout(() => (out.textContent = ""), 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false);
  });
  selectPreset(q.get("preset") || CFG.lab.defaultPreset);
  dropSel.value = dropKey; engine.state.dropletPreset = DROPS[dropKey].label;
  if (dropKey !== CFG.lab.defaultDropletPreset && presetKey !== "current") selectDropletPreset(dropKey);
  poolSel.value = poolKey; engine.state.poolPreset = POOLS[poolKey].label;
  if ((poolKey !== CFG.lab.defaultPoolPreset || capSel.value !== "preset") && presetKey !== "current") selectPoolPreset(poolKey);
  if (q.get("seed") !== null) engine.setDropSeed(q.get("seed"));

  // ---- Phase 3: manual droplet trigger (lab only: the real lifecycle on demand; natural triggering stays rare)
  const dirSel = $("#drop-dir"), speedIn = $("#drop-speed"), speedOut = $("#drop-speed-out"), dropStatus = $("#drop-status");
  speedIn.addEventListener("input", () => { speedOut.textContent = speedIn.value + " px/s"; });
  // kind: "" the approved droplet (strength 0.5) · "strong" a strong flick · "extreme" an extreme flick (Phase 4: may leave
  // a residual satellite) · Phase 4.5 rich goo: the synthetic swing `peak` decides the residuals through the real scheduler,
  // and "goo" / "heavy" queue further primaries (a plan) that start as soon as the neck rules allow
  function shed(kind = "") {
    const a = dirSel.value === "auto" ? NaN : +dirSel.value, speed = +speedIn.value;
    const opts = kind === "extreme" ? { angleDeg: a, speed: speed * 1.6, strength: 1, extreme: true, peak: 2.05 }
      : kind === "strong" ? { angleDeg: a, speed: speed * 1.35, strength: 0.9, peak: 1.3 }
      : kind === "goo" ? { angleDeg: a, speed: speed * 1.2, strength: 0.6, peak: 1.6, plan: [{ ms: 140, deg: 75, peak: 1.35 }] }
      : kind === "heavy" ? { angleDeg: a, speed: speed * 1.5, strength: 1, peak: 2.1, plan: [{ ms: 120, deg: 70, peak: 1.8 }, { ms: 240, deg: -60, peak: 1.6 }] }
      : { angleDeg: a, speed };
    const ok = engine.triggerDroplet(opts);
    dropStatus.textContent = ok ? "shed" : engine.dropletsOn() ? "busy: a neck is attached or the pool is full" : "droplets are off in this mode";
  }
  $("#drop-trigger").addEventListener("click", () => shed());
  $("#drop-strong").addEventListener("click", () => shed("strong"));
  $("#drop-extreme").addEventListener("click", () => shed("extreme"));
  $("#drop-goo").addEventListener("click", () => shed("goo"));
  $("#drop-heavy").addEventListener("click", () => shed("heavy"));
  $("#drop-clear").addEventListener("click", () => engine.clearDroplets());
  $("#drop-enable").addEventListener("change", (e) => engine.setDroplets(e.target.checked));
  $("#drop-natural").addEventListener("change", (e) => engine.setNatural(e.target.checked));
  document.addEventListener("keydown", (e) => { // D sheds one droplet, G a rich goo burst, H a heavy burst, wherever the pointer is
    const t = e.target, k = { d: "", g: "goo", h: "heavy" }[e.key.toLowerCase()];
    if (k === undefined || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["radio", "checkbox", "range", "button"].includes(t.type)))) return;
    if (S.mode !== "A") shed(k);
  });
  setInterval(() => { // a quiet status line while the strip is visible (never from the animation loop)
    if ($("#droplet-bar").hidden) return;
    const D = S.drop, cap = window.LiquidDroplet.capacity(engine.params);
    const txt = D ? `${D.live} of ${cap} live · ${D.events} event${D.events === 1 ? "" : "s"}${D.suppressed ? ` · ${D.suppressed} suppressed` : ""}${D.cooldown > 0 ? ` · cooldown ${Math.ceil(D.cooldown)} ms` : ""}` : "unavailable";
    if (dropStatus.dataset.last !== txt) { dropStatus.dataset.last = txt; dropStatus.textContent = txt; }
  }, 250);

  // one-line policy readout, refreshed when anything relevant changes
  const policy = $("#policy");
  function showPolicy() {
    const txt = S.active ? `Custom cursor ACTIVE · pointer fine: yes · reduced motion: ${S.reducedMotion ? "yes (debug-static)" : "no"} · forced colours: no`
      : `Custom cursor OFF (${S.disabledReasons}) · native cursor in use`;
    if (policy.textContent !== txt) policy.textContent = txt;
  }
  ["(pointer: fine)", "(prefers-reduced-motion: reduce)", "(forced-colors: active)"].forEach((m) => matchMedia(m).addEventListener("change", showPolicy));
  document.addEventListener("change", showPolicy);
  showPolicy();

  // ---- E: interactives (clicks must reach the real controls)
  let clicks = 0;
  ["#btn-real", "#card"].forEach((s) => $(s).addEventListener("click", () => { clicks++; $("#inter-out").textContent = `clicks: ${clicks}`; }));
  $("#card").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#card").click(); } });

  // ---- F: copy-style field
  $("#copy").addEventListener("click", () => {
    const out = $("#copy-out"), text = $("#copy").textContent;
    const done = (ok) => { out.textContent = ok ? "copied" : "copy unavailable here"; setTimeout(() => (out.textContent = ""), 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); else done(false);
  });

  // ---- F: wipe control, same pattern as the Observatory's (pointer capture + preventDefault + stopPropagation on its own handle)
  const wipe = $("#wipe"), handle = $("#wipe-handle");
  let split = 50;
  const setSplit = (v) => { split = Math.max(0, Math.min(100, v)); wipe.style.setProperty("--split", split + "%"); handle.setAttribute("aria-valuenow", String(Math.round(split))); };
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
    const mv = (ev) => { const r = wipe.getBoundingClientRect(); setSplit((ev.clientX - r.left) / r.width * 100); };
    handle.addEventListener("pointermove", mv);
    handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", mv), { once: true });
  });
  handle.addEventListener("keydown", (e) => { const d = { ArrowLeft: -5, ArrowRight: 5 }[e.key]; if (d) { e.preventDefault(); setSplit(split + d); } });

  // ---- F: canvas precision target (DPR-aware 16 x 9 grid, hover and arrow keys select a cell)
  const pc = $("#precision"), pctx = pc.getContext("2d");
  const COLS = 16, ROWS = 9;
  let cell = -1;
  function sizePrecision() {
    const r = pc.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    pc.width = Math.round(r.width * d); pc.height = Math.round(r.height * d); drawPrecision();
  }
  function drawPrecision() {
    const w = pc.width, hgt = pc.height, cw = w / COLS, ch = hgt / ROWS;
    pctx.fillStyle = "#e2e5e8"; pctx.fillRect(0, 0, w, hgt);
    if (cell >= 0) { pctx.fillStyle = "#0f7479"; pctx.fillRect((cell % COLS) * cw, Math.floor(cell / COLS) * ch, cw, ch); }
    pctx.strokeStyle = "rgba(27,30,33,0.35)"; pctx.lineWidth = 1; pctx.beginPath();
    for (let i = 1; i < COLS; i++) { const x = Math.round(i * cw) + 0.5; pctx.moveTo(x, 0); pctx.lineTo(x, hgt); }
    for (let j = 1; j < ROWS; j++) { const y = Math.round(j * ch) + 0.5; pctx.moveTo(0, y); pctx.lineTo(w, y); }
    pctx.stroke();
    $("#prec-out").textContent = cell >= 0 ? `cell ${cell} (col ${cell % COLS}, row ${Math.floor(cell / COLS)})` : "no cell";
  }
  pc.addEventListener("mousemove", (e) => {
    const r = pc.getBoundingClientRect();
    const c = Math.min(COLS - 1, Math.floor((e.clientX - r.left) / r.width * COLS)), rw = Math.min(ROWS - 1, Math.floor((e.clientY - r.top) / r.height * ROWS));
    if (rw * COLS + c !== cell) { cell = rw * COLS + c; drawPrecision(); }
  });
  pc.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key];
    if (d !== undefined) { e.preventDefault(); cell = Math.max(0, Math.min(COLS * ROWS - 1, (cell < 0 ? 0 : cell) + d)); drawPrecision(); }
  });
  window.addEventListener("resize", sizePrecision);
  sizePrecision();
})();
