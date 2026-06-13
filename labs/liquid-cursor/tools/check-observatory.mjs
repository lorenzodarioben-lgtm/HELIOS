// Liquid cursor: integration checks of the production cursor in the real Helios Observatory (assets/observatory/), over
// http://127.0.0.1 and file://, in headless Edge with real CDP input (and, where a frame-exact state is needed, the
// production runtime's ?cursor=test hooks). Initialisation and the kill switch, the native-cursor policy, every fallback
// (reduced motion, forced colours, coarse pointer, no WebGL2, a failed shader, context loss, a runtime failure), the
// interaction map (links, buttons, precision controls, drags), navigation, the Guided Tour, presentation and recording
// modes, scrolling, resize and DPR, a hidden tab, the goo itself, the water over artwork (its zone, boundaries and optics:
// refraction, the hero's snapshot, cleanliness in fast motion), performance and idle behaviour, and the console.
//
//   node labs/liquid-cursor/tools/check-observatory.mjs [--http URL] [--evidence] [--only group,group]
//
// --evidence also writes the integration QA captures (sections, surfaces, Guided Tour, precision control, a temporal
// strip and GIF) and check-results.json into labs/liquid-cursor/evidence/integration/ (never the Observatory's own
// screenshots). GIF clips need Python with Pillow (skipped otherwise). Exit code 1 on any failure.
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, sleep, labelledSheet, decodePNG } from "./cdp.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), ".."), ROOT = resolve(LAB, "..", "..");
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HTTP = opt("--http", "http://127.0.0.1:8315/") + "assets/observatory/index.html";
const FILE = pathToFileURL(join(ROOT, "assets", "observatory", "index.html")).href;
const EVIDENCE = argv.includes("--evidence"), OUT = join(LAB, "evidence", "integration");
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean), want = (g) => !ONLY.length || ONLY.includes(g);
if (EVIDENCE) mkdirSync(OUT, { recursive: true });
const PROD_SRC = readFileSync(join(ROOT, "assets", "observatory", "liquid-cursor.js"), "utf8");
// the Observatory's own pre-existing console message (Correctness: the live pixel diff reads a 2D canvas twice); not the cursor's
const PREEXISTING = /willReadFrequently/;

const results = [], info = {}, consoleAll = [], preexisting = new Set();
const check = (group, name, pass, detail = "") => { results.push({ group, name, pass: !!pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  [${group}] ${name}${detail !== "" ? "  ·  " + detail : ""}`); };

// the Observatory server must be up (python scripts/observatory/serve.py --no-browser)
try { const r = await fetch(HTTP, { method: "HEAD" }); if (!r.ok) throw new Error("HTTP " + r.status); }
catch (err) { console.log(`FAIL  the Observatory server is not reachable at ${HTTP} (${err.message}): start python scripts/observatory/serve.py --no-browser`); process.exit(1); }
const B = await launch();
const keepAlive = setInterval(() => {}, 1000); // CDP's WebSocket does not hold Node's event loop open while a reply is pending
async function open(url, { dpr = 1, w = 1920, h = 1080, media = [], touch = false, preload = "", label = "" } = {}) {
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
  await B.send("Target.activateTarget", { targetId });
  const { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true });
  // every call has a deadline: a reply that never comes fails a check instead of hanging the run
  const s = (m, p) => Promise.race([B.send(m, p, sessionId), new Promise((_, rej) => setTimeout(() => rej(new Error(`CDP ${m} timed out (20 s)`)), 20000))]), logs = [];
  const l = (msg) => {
    if (msg.sessionId !== sessionId) return;
    let t = "";
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(msg.params.type)) t = `${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`;
    if (msg.method === "Runtime.exceptionThrown") t = `exception: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`;
    if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) t = `${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`;
    if (!t) return;
    if (PREEXISTING.test(t)) preexisting.add(t.slice(0, 160)); else logs.push(t);
  };
  B.listeners.add(l);
  await s("Runtime.enable"); await s("Log.enable"); await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  if (media.length) await s("Emulation.setEmulatedMedia", { features: media });
  if (touch) await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  if (preload) await s("Page.addScriptToEvaluateOnNewDocument", { source: preload });
  await s("Page.navigate", { url });
  const ev = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  in: ${expression.replace(/\s+/g, " ").slice(0, 300)}`);
    return r.result.value;
  };
  for (let i = 0; i < 120; i++) { if (await ev("document.readyState === 'complete' && !!document.querySelector('.section.active') && !!window.HeliosLiquidCursor && (!!HeliosLiquidCursor.status || HeliosLiquidCursor.reason !== 'not started')").catch(() => false)) break; await sleep(50); }
  await sleep(250);
  const P = {
    s, ev, logs, targetId, label,
    // allDraws: both presentations (the difference canvas and the media-safe canvas)
    st: () => ev("window.HeliosLiquidCursor.status ? ((s) => Object.assign(s, { allDraws: s.draws + (s.material ? s.material.draws : 0) }))(HeliosLiquidCursor.status()) : { active: false, reason: HeliosLiquidCursor.reason, missing: true }"),
    move: (x, y, buttons = 0) => s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: buttons ? "left" : "none", buttons }),
    press: (x, y) => s("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }),
    release: (x, y) => s("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }),
    click: async (x, y) => { await P.move(x, y); await P.press(x, y); await P.release(x, y); },
    wheel: (x, y, dy) => s("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy }),
    key: async (key, code, vk) => { await s("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk }); await s("Input.dispatchKeyEvent", { type: "char", key, text: key.length === 1 ? key : undefined, windowsVirtualKeyCode: vk }); await s("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); },
    center: (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`),
    centerVisible: async (sel) => { // (retried briefly: a section's first render can lay out a moment after the route change)
      let c = null;
      for (let k = 0; k < 6 && !c; k++) { if (k) await sleep(250); c = await ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && getComputedStyle(x).visibility !== "hidden"; });
        if (!e) return null; const r0 = e.getBoundingClientRect(); if (r0.top < 70 || r0.bottom > innerHeight - 70) e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`); }
      await sleep(300); return c;
    },
    cursorAt: (x, y) => ev(`(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? getComputedStyle(e).cursor : null; })()`),
    frames: (n = 2) => ev(`new Promise(r => { let k = ${n}; const f = () => (--k > 0 ? requestAnimationFrame(f) : r(1)); requestAnimationFrame(f); })`),
    shot: async (x = 0, y = 0, w2 = w, h2 = h) => Buffer.from((await s("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, Math.min(x, w - w2)), y: Math.max(0, Math.min(y, h - h2)), width: w2, height: h2, scale: 1 } })).data, "base64"),
    go: async (hash) => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(450); },
    async close() { B.listeners.delete(l); consoleAll.push(...logs.map((m) => `${label}: ${m}`)); await B.send("Target.closeTarget", { targetId }); },
  };
  return P;
}
// a smooth real pointer path: n samples from (x0, y0) to (x1, y1), stepMs apart (CDP mouse events)
async function glide(P, x0, y0, x1, y1, n = 20, stepMs = 8) { for (let i = 1; i <= n; i++) { const u = i / n; await P.move(Math.round(x0 + (x1 - x0) * u), Math.round(y0 + (y1 - y0) * u)); await sleep(stepMs); } }
// a fast real flick (ease-in), then nothing
async function flick(P, x0, y, dx, n = 14) { let x = x0; for (let i = 1; i <= n; i++) { x += dx * Math.min(1, (i * i) / 25); await P.move(Math.round(x), y); await sleep(4); } return x; }
const maxZ = (P) => P.ev(`(() => { let m = -Infinity, who = ""; for (const e of document.querySelectorAll("body *")) { if ([...e.classList].some((c) => c.startsWith("lc-"))) continue; const z = parseInt(getComputedStyle(e).zIndex, 10); if (Number.isFinite(z) && z > m) { m = z; who = e.id || e.className || e.tagName; } } return [m, String(who)]; })()`);

// page-side frame-exact driver over the production ?cursor=test hooks (the lab helpers' 120 Hz stepping)
function installDriver() {
  const T = window.HeliosLiquidCursor.test, DT = 1000 / 120, H = (window.__pv = { t: 0, T });
  T.setFrozen(true); H.t = 1e5;
  H.feed = (x, y) => { H.t += DT; T.feed(x, y, H.t); T.advance(DT, DT); };
  H.hold = (ms) => { let left = ms; while (left > 1e-6) { const h = Math.min(DT, left); T.advance(h, DT); left -= h; } H.t += ms; };
  H.points = (segs, x1, y1) => { const pts = []; let x = 0, y = 0;
    for (const g of segs) { const nf = Math.round(g.ms / DT);
      for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1, v = g.v * k * k * (3 - 2 * k) / 1000, a = (g.turn || 0) * f / nf, dx = g.dx * Math.cos(a) - g.dy * Math.sin(a), dy = g.dx * Math.sin(a) + g.dy * Math.cos(a); x += dx * v * DT; y += dy * v * DT; pts.push([x, y]); } }
    const ox = x1 - x, oy = y1 - y; return { start: [ox, oy], pts: pts.map(([px, py]) => [px + ox, py + oy]) }; };
  H.ready = (x, y) => { H.hold(200); H.feed(x, y); H.hold(200); T.resetBody(); H.hold(T.P.dropArmMs + 20); };
  H.run = (segs, x1, y1, extra) => { const p = H.points(segs, x1, y1); H.ready(p.start[0], p.start[1]); H.pts = p.pts.concat(Array(extra || 0).fill(null)); H.i = 0; return H.pts.length; };
  H.stepTo = (f) => { while (H.i < f && H.i < H.pts.length) { const p = H.pts[H.i]; if (p) H.feed(p[0], p[1]); else H.hold(DT); H.i++; } return H.snap(); };
  H.snap = () => { const S = T.S, D = T.D, O = D.tailOut; return { x: S.renderX, y: S.renderY, visible: S.visible, E: D.spine.E, L: D.spine.L, tail: O.on, hov: T.B.hov.x, interactive: !!S.interactiveEl, ignored: !!S.ignoreEl,
    mat: S.mat, media: !!S.mediaEl, presence: S.presence,
    pts: O.on ? Array.from(O.x).map((v, i) => [v, O.y[i], O.r[i]]) : [], beads: D.slots.filter((q) => q.state !== "IDLE").map((q) => [q.x, q.y, q.r, q.alpha, q.layer]) }; };
  return 1;
}
const around = (sn, w = 520, h = 340) => { const xs = [sn.x, ...sn.pts.map((p) => p[0]), ...sn.beads.map((b) => b[0])], ys = [sn.y, ...sn.pts.map((p) => p[1]), ...sn.beads.map((b) => b[1])];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; return [Math.round(cx - w / 2), Math.round(cy - h / 2), w, h]; };

try {
  // ---------------------------------------------------------------- baseline and initialisation
  if (want("init")) try {
    const G = "init";
    const P = await open(HTTP, { label: "init" });
    const before = await P.st(), btn = await P.center("#btn-about");
    const pre = { native: before.nativeHidden, btnCursor: await P.cursorAt(...btn) };
    await glide(P, 900, 760, 980, 720); await sleep(300);
    const after = await P.st();
    const css = await P.ev(`(() => { const c = document.querySelector(".lc-canvas"), cs = getComputedStyle(c), tiles = [...document.querySelectorAll(".lc-bead")];
      return { parentIsBody: c.parentElement === document.body, position: cs.position, pe: cs.pointerEvents, blend: cs.mixBlendMode, z: cs.zIndex, aria: c.getAttribute("aria-hidden"), vis: cs.visibility,
        tiles: tiles.length, tilesOk: tiles.every((t) => t.parentElement === document.body && getComputedStyle(t).pointerEvents === "none" && getComputedStyle(t).mixBlendMode === "difference" && getComputedStyle(t).position === "fixed"),
        style: !!document.getElementById("lc-native-cursor"), bodyCursor: getComputedStyle(document.body).cursor, mvis: (document.querySelector(".lc-canvas-media") || {}).style?.visibility }; })()`);
    const [zTop, zWho] = await maxZ(P);
    info.init = { before, after, css, zTop, zWho, pre };
    check(G, "an eligible desktop (fine pointer, WebGL2) initialises the approved cursor at load", before.active && before.version === "reference-goo-balanced@9cce8a5" && before.webgl2 && before.loop !== undefined, `active ${before.active}, ${before.version}, WebGL2 ${before.webgl2}`);
    check(G, "one root-level cursor canvas plus five bead tiles: fixed, pointer-events none, mix-blend-mode difference, aria-hidden, above every Observatory layer",
      css.parentIsBody && css.position === "fixed" && css.pe === "none" && css.blend === "difference" && css.aria === "true" && css.tiles === 5 && css.tilesOk && +css.z > zTop,
      `parent body ${css.parentIsBody}, ${css.position}, pointer-events ${css.pe}, ${css.blend}, z-index ${css.z} > page max ${zTop} (${zWho}); ${css.tiles} tiles ok ${css.tilesOk}`);
    check(G, "the native cursor is kept until the liquid cursor has a pointer to follow, then hidden (the page's own button cursor before; none after)",
      !pre.native && pre.btnCursor === "pointer" && !before.visible && after.visible && after.nativeHidden && css.bodyCursor === "none" && (css.vis === "visible" || css.mvis === "visible"),
      `before: native hidden ${pre.native}, About cursor ${pre.btnCursor}, liquid visible ${before.visible}; after a move: liquid visible ${after.visible}, native hidden ${after.nativeHidden}, body cursor ${css.bodyCursor}`);
    await P.close();
    // the kill switch: nothing is created, before any native cursor change
    const K = await open(HTTP + "?cursor=off", { label: "kill switch" });
    await glide(K, 900, 760, 980, 720); await sleep(200);
    const ks = await K.ev(`({ api: window.HeliosLiquidCursor && { active: HeliosLiquidCursor.active, reason: HeliosLiquidCursor.reason, status: typeof HeliosLiquidCursor.status }, canvas: !!document.querySelector(".lc-canvas, .lc-bead, .lc-canvas-media, .lc-bead-media"), style: !!document.getElementById("lc-native-cursor"), cls: document.documentElement.className, cursor: getComputedStyle(document.querySelector("#btn-about")).cursor })`);
    info.killSwitch = ks;
    check(G, "kill switch ?cursor=off: no canvas, no style rule, no class, the native cursor untouched (also after pointer motion)", !ks.canvas && !ks.style && !/lc-/.test(ks.cls) && ks.api && !ks.api.active && /cursor=off/.test(ks.api.reason) && ks.cursor === "pointer",
      `canvas ${ks.canvas}, style ${ks.style}, html class "${ks.cls}", reason "${ks.api && ks.api.reason}", About cursor ${ks.cursor}`);
    await K.close();
  } catch (err) { check("init", "the init checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- modes: recording, presentation
  if (want("modes")) try {
    const G = "modes";
    const R = await open(HTTP + "?mode=recording", { label: "recording" });
    await glide(R, 900, 760, 980, 720); await sleep(200);
    const rs = await R.ev(`({ reason: HeliosLiquidCursor.reason, active: HeliosLiquidCursor.active, canvas: !!document.querySelector(".lc-canvas, .lc-canvas-media"), rec: document.body.classList.contains("recording"), cls: document.documentElement.className })`);
    await R.close();
    const R2 = await open(HTTP + "?mode=recording&cursor=on", { label: "recording on" });
    await glide(R2, 900, 760, 980, 720); await sleep(200);
    const rs2 = await R2.st();
    await R2.close();
    info.recording = { rs, rs2: { active: rs2.active, visible: rs2.visible } };
    check(G, "recording mode (?mode=recording, the author's capture tool) keeps the native cursor: no liquid cursor is created; ?mode=recording&cursor=on opts in",
      rs.rec && !rs.active && rs.reason === "recording mode" && !rs.canvas && !/lc-hide-native/.test(rs.cls) && rs2.active && rs2.visible, `recording: active ${rs.active}, reason "${rs.reason}", canvas ${rs.canvas}; with cursor=on: active ${rs2.active}, visible ${rs2.visible}`);
    const Pm = await open(HTTP + "?mode=present&item=4", { label: "present" });
    await glide(Pm, 900, 760, 980, 720); await sleep(200);
    const ps = await Pm.st(), pres = await Pm.ev("[document.body.classList.contains('presenting'), location.hash]");
    await Pm.close();
    check(G, "presentation mode (?mode=present&item=4) runs the cursor normally (over item 4's tile canvas it gives way to the native crosshair, as everywhere)", pres[0] && ps.active && (ps.visible || ps.ignored) && ps.nativeHidden, `presenting ${pres[0]} at ${pres[1]}; active ${ps.active}, visible ${ps.visible}, over an ignored control ${ps.ignored}`);
  } catch (err) { check("modes", "the modes checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- fallbacks
  if (want("fallback")) try {
    const G = "fallback";
    for (const [name, feature, value, reason] of [["reduced motion", "prefers-reduced-motion", "reduce", "reduced motion"], ["forced colours", "forced-colors", "active", "forced colours"]]) {
      const P = await open(HTTP, { media: [{ name: feature, value }], label: name });
      await glide(P, 900, 760, 980, 720); await sleep(200);
      const st = await P.st(), cur = await P.cursorAt(...(await P.center("#btn-about")));
      check(G, `${name} at load: the liquid cursor stays off and the native cursor is untouched`, !st.active && st.reason.includes(reason) && !st.visible && !st.nativeHidden && cur === "pointer", `reason "${st.reason}", visible ${st.visible}, native hidden ${st.nativeHidden}, About cursor ${cur}`);
      await P.s("Emulation.setEmulatedMedia", { features: [] }); await sleep(200); await glide(P, 980, 720, 900, 700); await sleep(200);
      const on = await P.st();
      await P.s("Emulation.setEmulatedMedia", { features: [{ name: feature, value }] }); await sleep(200);
      const off = await P.st();
      check(G, `${name} toggled live switches the cursor on and back off (native cursor restored at once)`, on.active && on.visible && !off.active && !off.visible && !off.nativeHidden && !off.loop, `off → on (visible ${on.visible}) → off (native hidden ${off.nativeHidden}, loop ${off.loop})`);
      await P.close();
    }
    const T = await open(HTTP, { touch: true, label: "coarse" });
    const ts = await T.st(), mq = await T.ev("[matchMedia('(pointer: fine)').matches, matchMedia('(pointer: coarse)').matches]");
    check(G, "a coarse pointer (touch emulation) keeps the native behaviour: no liquid cursor", mq[1] && !ts.active && ts.reason.includes("no fine pointer") && !ts.nativeHidden, `(pointer: coarse) ${mq[1]}, reason "${ts.reason}"`);
    await T.close();
    // no WebGL2 at all
    const noGl = `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return t === "webgl2" ? null : g.call(this, t, o); };
      if (window.OffscreenCanvas) { const o = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (t, a) { return t === "webgl2" ? null : o.call(this, t, a); }; } })();`;
    const N = await open(HTTP, { preload: noGl, label: "no webgl2" });
    await glide(N, 900, 760, 980, 720); await sleep(200);
    const ns = await N.st(), ncur = await N.cursorAt(...(await N.center("#btn-about")));
    await N.go("stress"); const nav = await N.ev("document.querySelector('.section.active').id");
    check(G, "WebGL2 unavailable: the native cursor stays, the page keeps working (navigation), no error", !ns.active && /WebGL2 unavailable/.test(ns.reason) && !ns.nativeHidden && ncur === "pointer" && nav === "sec-stress" && N.logs.length === 0, `reason "${ns.reason}", About cursor ${ncur}, navigated to ${nav}, console ${N.logs.length ? N.logs[0] : "clean"}`);
    await N.close();
    // a shader that fails to compile
    const badShader = `(() => { const p = WebGL2RenderingContext.prototype.getShaderParameter; WebGL2RenderingContext.prototype.getShaderParameter = function (s, n) { return n === this.COMPILE_STATUS ? false : p.call(this, s, n); }; })();`;
    const S = await open(HTTP, { preload: badShader, label: "bad shader" });
    await glide(S, 900, 760, 980, 720); await sleep(200);
    const ss = await S.st();
    check(G, "a shader compile failure: initialisation falls back to the native cursor, no exception, no blocking overlay", !ss.active && /WebGL2 unavailable \(/.test(ss.reason) && !ss.nativeHidden && !ss.visible && S.logs.length === 0, `reason "${ss.reason}", console ${S.logs.length ? S.logs[0] : "clean"}`);
    await S.close();
    // context loss and restoration; then a forced runtime failure
    const C = await open(HTTP + "?cursor=test", { label: "context loss" });
    await C.ev("HeliosLiquidCursor.test.setFrozen(false), 1");
    await glide(C, 900, 760, 980, 720); await sleep(200);
    const c0 = await C.st();
    await C.ev("HeliosLiquidCursor.test.loseContext()"); await sleep(300);
    const c1 = await C.st(), ccur = await C.cursorAt(...(await C.center("#btn-about")));
    await C.ev("HeliosLiquidCursor.test.restoreContext()"); await sleep(500); await glide(C, 980, 720, 900, 700); await sleep(300);
    const c2 = await C.st();
    check(G, "context loss: the native cursor returns at once; on restoration the liquid cursor resumes", c0.visible && c1.contextLost && !c1.active && !c1.visible && !c1.nativeHidden && ccur === "pointer" && c2.active && c2.visible && c2.nativeHidden && c2.allDraws > c0.allDraws,
      `lost: active ${c1.active}, native hidden ${c1.nativeHidden}, About cursor ${ccur}; restored: active ${c2.active}, visible ${c2.visible}, draws ${c0.allDraws} → ${c2.allDraws}`);
    await C.ev("HeliosLiquidCursor.test.failNow()"); await sleep(300);
    const f = await C.ev(`({ active: HeliosLiquidCursor.active, reason: HeliosLiquidCursor.reason, canvas: !!document.querySelector(".lc-canvas, .lc-bead, .lc-canvas-media, .lc-bead-media"), style: !!document.getElementById("lc-native-cursor"), cls: document.documentElement.className, cursor: getComputedStyle(document.querySelector("#btn-about")).cursor })`);
    await glide(C, 900, 700, 960, 740); await sleep(200);
    check(G, "a runtime failure tears everything down (canvases, rule, classes, listeners): the native cursor returns, no exception loop", !f.active && /^failed/.test(f.reason) && !f.canvas && !f.style && !/lc-/.test(f.cls) && f.cursor === "pointer" && C.logs.length === 0, `reason "${f.reason}", canvas ${f.canvas}, style ${f.style}, class "${f.cls}", console ${C.logs.length ? C.logs[0] : "clean"}`);
    await C.close();
  } catch (err) { check("fallback", "the fallback checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- the interaction map
  if (want("interaction")) try {
    const G = "interaction";
    const P = await open(HTTP, { label: "interaction" });
    await glide(P, 900, 760, 980, 720); await sleep(200);
    // links and buttons stay the real click targets
    const ab = await P.center("#btn-about");
    await glide(P, 980, 720, ab[0], ab[1], 16); await sleep(250);
    const hov = await P.st(), hit = await P.ev(`document.elementFromPoint(${ab[0]}, ${ab[1]}).id`);
    await P.press(...ab); await P.release(...ab); await sleep(250);
    const opened = await P.ev("document.querySelector('#btn-about').getAttribute('aria-expanded')");
    await P.key("Escape", "Escape", 27); await sleep(200);
    check(G, "buttons stay the click target (the cursor is never hit): About opens under the liquid cursor, which grows over it (hover) and, resting there, has no goo", hit === "btn-about" && opened === "true" && hov.interactive && hov.visible && !hov.goo.on,
      `hit ${hit}, aria-expanded ${opened}, interactive ${hov.interactive}, goo ${hov.goo.on}`);
    // a section link from the index (an a[href] with data-route)
    const link = await P.centerVisible('.toc a[data-route="stress"]');
    let navOk = false;
    if (link) { await glide(P, ab[0], ab[1], link[0], link[1], 16); await sleep(200); const lh = await P.st(); await P.press(...link); await P.release(...link); await sleep(500); navOk = (await P.ev("location.hash")) === "#stress" && lh.interactive; }
    check(G, "links navigate as before (Overview index → Stress & Limits), with hover growth over the link", navOk, `link ${link ? "found" : "missing"}, now at ${await P.ev("location.hash")}`);
    // precision and native controls: native cursor, no liquid
    const zones = [];
    async function zone(route, sel, label, want2, prep) {
      await P.go(route); if (prep) { await P.ev(prep); await sleep(350); }
      // (the section's reveal moves its content up to 14 px: a 22 px control is measured where it comes to rest)
      await P.ev(`Promise.all(document.getAnimations().filter((a) => ["rise", "fade", "pop"].includes(a.animationName)).map((a) => a.finished.catch(() => 0)))`);
      const c = await P.centerVisible(sel); if (!c) { zones.push({ label, ok: false, cursor: "missing" }); return; }
      const st0 = await P.st();
      await glide(P, Math.round(st0.raw[0]), Math.round(st0.raw[1]), c[0], c[1], 14); await sleep(200);
      const st = await P.st(), cur = await P.cursorAt(...c);
      zones.push({ label, ok: st.ignored && !st.visible && cur === want2, cursor: cur, ignored: st.ignored, visible: st.visible });
    }
    await zone("workload", "#wm-canvas", "Workload Microscope tile canvas", "crosshair");
    await zone("render", "#cv-view", "Render Lab convergence view", "crosshair");
    await zone("render", "#cv-handle", "Render Lab wipe handle (compare)", "ew-resize", "document.querySelector('#cv-mode').click()");
    await zone("workload?metric=owner", "#wm-own", "select (ownership run)", "pointer");
    await zone("scheduler", "#sc-scrub", "Scheduler scrubber (range)", "pointer");
    await zone("scheduler", "#sc-tl", "Scheduler timeline (click to seek)", "pointer");
    await zone("provenance?panel=code&snippet=render_tile", "pre.code", "source code block", "auto");
    await zone("workload", "[data-copy]", "copy-to-clipboard path", "copy");
    info.zones = zones;
    check(G, "precision and native controls keep their native cursor (the page's own, else the native default) and suppress the liquid: tile canvas, convergence view, wipe handle, select, scrubber, timeline, code, copy path",
      zones.every((z) => z.ok), zones.map((z) => `${z.label}: ${z.cursor}${z.ok ? "" : " ✗"}`).join(" · "));
    // the checkbox and the switches: hover growth
    await P.go("workload");
    const cb = await P.centerVisible("#wm-scene"), st1 = await P.st();
    await glide(P, Math.round(st1.raw[0]), Math.round(st1.raw[1]), cb[0], cb[1], 12); await sleep(250);
    const cbs = await P.st();
    check(G, "a checkbox reads as an ordinary control (hover growth, no goo)", cbs.interactive && cbs.visible && !cbs.ignored, `interactive ${cbs.interactive}, visible ${cbs.visible}`);
    await P.close();
  } catch (err) { check("interaction", "the interaction checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- drags, scrolling, resize, DPR, hidden tab
  if (want("sanitize")) try {
    const G = "sanitize";
    const P = await open(HTTP + "#render", { label: "sanitize" });
    await P.ev("document.querySelector('#cv-mode').click()"); await sleep(400);
    const hd = await P.centerVisible("#cv-handle");
    await glide(P, hd[0] - 200, hd[1], hd[0], hd[1], 10); await sleep(200);
    // drag the wipe handle hard across the view (pointer capture), release, then keep moving fast right away
    await P.press(...hd); let samples = [];
    for (let i = 1; i <= 14; i++) { await P.move(hd[0] + i * 28, hd[1], 1); await sleep(4); if (i % 4 === 0) samples.push(await P.st()); }
    await P.release(hd[0] + 14 * 28, hd[1]);
    const after = [];
    let x = hd[0] + 14 * 28;
    for (let i = 1; i <= 10; i++) { x -= 60; await P.move(x, hd[1] + 140 + i * 6); await sleep(4); after.push(await P.st()); }
    await sleep(150); after.push(await P.st());
    const split = await P.ev("document.querySelector('#cv-handle').getAttribute('aria-valuenow')");
    info.drag = { during: samples.map((s) => ({ visible: s.visible, ignored: s.ignored })), after: after.map((s) => ({ goo: s.goo.on, E: +s.goo.energy.toFixed(3), armed: s.armedMs })) };
    check(G, "wipe-handle drag (pointer capture): the liquid stays out during the drag, the wipe works, and no goo bursts on release even with fast motion right after",
      samples.every((s) => !s.visible) && after.every((s) => !s.goo.on && s.goo.energy === 0) && +split > 50, `split ${split}%, during visible ${samples.map((s) => s.visible).join("/")}, after goo ${after.map((s) => s.goo.on ? "on" : "-").join("")}`);
    // a pressed drag over ordinary content (text selection): no goo while pressed or just after
    await P.go("stress");
    await glide(P, 600, 700, 700, 700, 8); await sleep(250);
    await P.press(700, 700); const pd = [];
    for (let i = 1; i <= 12; i++) { await P.move(700 + i * 50, 700, 1); await sleep(4); pd.push(await P.st()); }
    await P.release(1300, 700);
    const rel = []; const tr = Date.now(); while (Date.now() - tr < 350) { rel.push(await P.st()); await sleep(20); }
    check(G, "a pressed drag over content (text selection): no goo while pressed, and none from the body catching up after the release", pd.every((s) => !s.goo.on) && rel.every((s) => !s.goo.on && s.goo.energy === 0),
      `while pressed ${pd.map((s) => s.goo.on ? "on" : "-").join("")}; after release ${rel.map((s) => s.goo.on ? "on" : "-").join("")}`);
    // scrolling under a still pointer is not pointer motion
    await P.go("performance"); await glide(P, 1300, 690, 900, 600, 10); await sleep(400);
    const s0 = await P.st(), sc = [];
    for (let i = 0; i < 12; i++) { await P.wheel(900, 600, 240); await sleep(25); sc.push(await P.st()); }
    await P.ev("window.scrollTo(0, 2400)"); await sleep(120); sc.push(await P.st());
    await P.ev("window.scrollTo(0, 0)"); await sleep(120); sc.push(await P.st());
    const scrolled = await P.ev("document.scrollingElement.scrollTop >= 0");
    info.scroll = sc.map((s) => ({ v: s.v.map((q) => +q.toFixed(2)), goo: s.goo.on, render: s.render.map((q) => +q.toFixed(1)) }));
    check(G, "wheel scrolling and page jumps under a still pointer: no pointer velocity, no goo, no body movement (positions are viewport coordinates)",
      scrolled && sc.every((s) => s.v[0] === 0 && s.v[1] === 0 && !s.goo.on && Math.abs(s.render[0] - s0.render[0]) < 0.01 && Math.abs(s.render[1] - s0.render[1]) < 0.01), `velocity ${[...new Set(sc.map((s) => s.v.join(",")))].join(" | ")}, goo ${sc.some((s) => s.goo.on)}, body moved ${Math.max(...sc.map((s) => Math.hypot(s.render[0] - s0.render[0], s.render[1] - s0.render[1]))).toFixed(3)} px`);
    // a re-hit-test after a scroll: a link scrolled under the still pointer gets hover without any pointer motion
    await P.go("overview"); await P.ev("window.scrollTo(0, 0)"); await sleep(200);
    const toc = await P.ev(`(() => { const a = document.querySelector('.toc a[data-route="render"] .t'), range = document.createRange(); range.selectNodeContents(a); const r = range.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.top + r.height / 2 + window.scrollY)]; })()`);
    const vy = 540; await glide(P, 900, 600, toc[0], vy, 8); await sleep(250);
    const pre = await P.st();
    await P.ev(`window.scrollTo(0, ${toc[2] - vy})`); await sleep(250);
    const post = await P.st();
    check(G, "after a scroll the cursor re-hit-tests under the still pointer (a link that scrolled under it gets hover growth at once)", !pre.interactive && post.interactive && !post.goo.on, `interactive ${pre.interactive} → ${post.interactive}`);
    await P.ev("window.scrollTo(0, 0)"); await sleep(150);
    // resize and DPR changes
    const r0 = await P.st();
    await P.s("Emulation.setDeviceMetricsOverride", { width: 1500, height: 860, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    const r1 = await P.st();
    await P.s("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false }); await sleep(400);
    await glide(P, Math.round(r1.raw[0]), Math.round(r1.raw[1]), 900, 620, 6); await sleep(250);
    const r2 = await P.st();
    await P.s("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    const r3 = await P.st();
    check(G, "resize and DPR changes: the canvas re-sizes its backing (420 CSS px × DPR), no goo, no teleport, still following",
      r1.backing[0] === 420 && r2.backing[0] === 840 && r3.backing[0] === 420 && !r1.goo.on && !r2.goo.on && !r3.goo.on && r2.visible && Math.abs(r2.render[0] - r2.raw[0]) < 1, `backing ${r0.backing[0]} → ${r1.backing[0]} → ${r2.backing[0]} (DPR 2) → ${r3.backing[0]}, goo ${[r1, r2, r3].some((s) => s.goo.on)}`);
    // a hidden tab: the loop stops; on return no catch-up frame, no goo, no teleport
    await glide(P, 900, 620, 960, 640, 6); await sleep(200);
    const h0 = await P.st();
    // the return is timed in the page itself (a CDP round trip can lag the page's visibility change by tens of ms)
    await P.ev("window.__visBack = 0, document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.__visBack = performance.now(); }), 1");
    const { targetId } = await B.send("Target.createTarget", { url: "about:blank" }); await B.send("Target.activateTarget", { targetId }); await sleep(700);
    const h1 = await P.st(), vis = await P.ev("document.visibilityState"); await sleep(400); const h1b = await P.st();
    await B.send("Target.activateTarget", { targetId: P.targetId }); await B.send("Target.closeTarget", { targetId }); await sleep(400);
    const h2 = await P.st(), since = Math.round(await P.ev("performance.now() - window.__visBack"));
    await glide(P, 960, 640, 1000, 650, 4); await sleep(200);
    const h3 = await P.st();
    check(G, "a hidden tab pauses the loop; on return: no giant step, no teleport, no goo, the motion history disarmed",
      vis === "hidden" && !h1.loop && h1b.frames === h1.frames && !h2.goo.on && !h3.goo.on && Math.abs(h3.render[0] - h3.raw[0]) < 3 && h2.armedMs <= since + 20, `while hidden: ${vis}, loop ${h1.loop}, frames +${h1b.frames - h1.frames}; after: goo ${h2.goo.on || h3.goo.on}, motion history ${h2.armedMs.toFixed(0)} ms old ${since} ms after the return`);
    void h0;
    await P.close();
  } catch (err) { check("sanitize", "the sanitize checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- navigation and the Guided Tour
  if (want("navigation")) try {
    const G = "navigation";
    const P = await open(HTTP, { label: "navigation" });
    await glide(P, 860, 900, 940, 940); await sleep(300);
    const keys = [["1", "overview"], ["2", "render"], ["3", "workload"], ["4", "scheduler"], ["5", "hardware"], ["6", "performance"], ["7", "correctness"], ["8", "stress"], ["9", "provenance"], ["0", "defence"]];
    const nav = [];
    for (const [k, id] of keys) {
      const pre = await P.st(); await P.key(k, "Digit" + k, 48 + +k); await sleep(40); const early = await P.st(); await sleep(460);
      const st = await P.st(), act = await P.ev("document.querySelector('.section.active').id");
      // a small pointer move after the page change: the cursor follows from where it is, without a jump
      await glide(P, 940, 940, 950, 935, 3); await sleep(120); const st2 = await P.st();
      nav.push({ k, id, active: act, goo: early.goo.on || st.goo.on || st2.goo.on, disarmed: early.disarms > pre.disarms, jump: Math.hypot(st2.render[0] - st2.raw[0], st2.render[1] - st2.raw[1]), visible: st2.visible || st2.ignored });
      await glide(P, 950, 935, 940, 940, 3); await sleep(80);
    }
    info.navigation = nav;
    check(G, "keys 1-9, 0 visit all ten sections (Observatory shortcuts unchanged); no goo, no stale motion history, no jump, the cursor stays with the pointer",
      nav.every((n) => n.active === "sec-" + n.id && !n.goo && n.jump < 2 && n.visible && n.disarmed), nav.map((n) => `${n.k}→${n.active.replace("sec-", "")}${n.goo ? " goo!" : ""}`).join(" "));
    // the rail: hover the left edge, pick a section in the panel
    await glide(P, 940, 940, 3, 400, 12); await sleep(400);
    const link = await P.center('.navpanel a[data-id="scheduler"]');
    await glide(P, 3, 400, link[0], link[1], 10); await sleep(200);
    const lst = await P.st();
    await P.press(...link); await P.release(...link); await sleep(500);
    check(G, "the navigation rail opens on hover and its links work under the liquid cursor (hover growth)", (await P.ev("location.hash")) === "#scheduler" && lst.interactive, `now ${await P.ev("location.hash")}, interactive over the link ${lst.interactive}`);
    // the Guided Tour: start, forward, back, keyboard, exit
    const gt = await P.center("#btn-present");
    await glide(P, link[0], link[1], gt[0], gt[1], 12); await sleep(200);
    await P.press(...gt); await P.release(...gt); await sleep(600);
    const t0 = await P.ev("[document.body.classList.contains('presenting'), location.hash, document.querySelector('#present-label').textContent]");
    await glide(P, gt[0], gt[1], 960, 600, 12); await sleep(200);
    const steps = [];
    for (let i = 0; i < 4; i++) { await P.key("ArrowRight", "ArrowRight", 39); await sleep(550); steps.push(await P.ev("document.querySelector('#present-label').textContent")); }
    await P.key("ArrowLeft", "ArrowLeft", 37); await sleep(550); steps.push(await P.ev("document.querySelector('#present-label').textContent"));
    const mid = await P.st();
    await P.key("Escape", "Escape", 27); await sleep(300);
    const t1 = await P.ev("document.body.classList.contains('presenting')"), end = await P.st();
    info.tour = { t0, steps, mid, end: { active: end.active, visible: end.visible } };
    check(G, "Guided Tour: the button starts it at item 1, ← → step through it, Esc exits; the cursor stays active and visible throughout, no goo bursts",
      t0[0] && /^01 \/ 11/.test(t0[2]) && /^05 \/ 11/.test(steps[3]) && /^04 \/ 11/.test(steps[4]) && !t1 && mid.active && (mid.visible || mid.ignored) && !mid.goo.on && end.active, `${t0[2]} → ${steps.join(" → ")} → exit ${!t1}; cursor active ${mid.active}`);
    await P.close();
    // no lab shortcuts, no lab UI, no keyboard handling at all
    const Q = await open(HTTP, { label: "no lab ui" });
    const lab = await Q.ev(`({ ids: ["tuning", "debug", "pool-preset", "drop-strong", "drop-clear", "banner-b", "tune-spineLength"].filter((i) => document.getElementById(i)).length, cls: document.querySelectorAll(".tuning, .dropstrip, .compare").length, api: Object.keys(HeliosLiquidCursor).sort().join(",") })`);
    const src = { keydown: /keydown|keyup|keypress/.test(PROD_SRC), lab: /liquidCursorLab|Tuning panel|setParams|poolPresets|triggerDroplet/.test(PROD_SRC), net: /https?:\/\/|fetch\(|XMLHttpRequest|import\(/.test(PROD_SRC.replace(/\/\*[\s\S]*?\*\//, "").split('"http://www.w3.org/2000/svg"').join("").split('"http://www.w3.org/1999/xhtml"').join("")) }; // (the hero snapshot's two XML namespace names are identifiers, never fetched)
    check(G, "production ships no lab UI, no lab shortcuts and no keyboard handling: no tuning/debug/preset elements, no key listeners, no network calls in the runtime",
      lab.ids === 0 && lab.cls === 0 && !src.keydown && !src.lab && !src.net && lab.api === "active,core,kill,reason,status,version", `lab elements ${lab.ids + lab.cls}, key listeners ${src.keydown}, lab APIs ${src.lab}, network ${src.net}; window API: ${lab.api}`);
    await Q.close();
  } catch (err) { check("navigation", "the navigation checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- the goo in the real site (frame-exact)
  if (want("goo")) try {
    const G = "goo";
    const P = await open(HTTP + "?cursor=test#stress", { label: "goo" });
    await P.ev(`(${installDriver.toString()})()`);
    const n = await P.ev(`__pv.run(${JSON.stringify([{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }])}, 1250, 760, 70)`);
    let peak = { L: 0, beads: 0, E: 0 }, last = null;
    for (let f = 2; f <= n; f += 2) { const sn = await P.ev(`__pv.stepTo(${f})`); peak = { L: Math.max(peak.L, sn.L), beads: Math.max(peak.beads, sn.beads.length), E: Math.max(peak.E, sn.E) }; last = sn; }
    info.gooStraight = { peak, end: { tail: last.tail, beads: last.beads.length } };
    check(G, "a strong flick over the real Stress & Limits page: the approved goo (energy ≥ 0.9, tail 55-75 px, 3-5 beads), caught up again afterwards", peak.E >= 0.9 && peak.L >= 55 && peak.L <= 75 && peak.beads >= 3 && peak.beads <= 5 && !last.tail,
      `peak energy ${peak.E.toFixed(2)}, tail ${peak.L.toFixed(0)} px, ${peak.beads} beads; at the end tail ${last.tail}`);
    // hovering a button never disarms the goo (the hover grows the body); it catches up naturally once the pointer rests
    await P.go("render");
    const b = await P.center("#btn-about");
    const m = await P.ev(`(() => { const p = __pv.run([{ dx: 1, dy: 0, v: 3200, ms: 160, ramp: 25 }], ${b[0]}, ${b[1]}, 40); let s, overTail = 0; for (let f = 1; f <= p; f++) { s = __pv.stepTo(f); if (s.interactive && s.tail) overTail++; } return Object.assign(s, { overTail }); })()`);
    check(G, "a flick that ends on a button: the goo stays connected while the drop arrives over it (hover grows the body, never disarms the goo) and catches up once the pointer rests", m.interactive && m.overTail > 0 && !m.tail && m.hov > 1.2, `interactive ${m.interactive}, frames with a tail over the button ${m.overTail}, tail at rest ${m.tail}, hover scale ${m.hov.toFixed(3)}`);
    await P.close();
  } catch (err) { check("goo", "the goo checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- the media-safe material over renders
  if (want("media")) try {
    const G = "media";
    const P = await open(HTTP, { label: "media" });
    await glide(P, 1260, 300, 1300, 300, 6); await sleep(300);
    const lay = await P.ev(`(() => { const one = (e) => { const cs = getComputedStyle(e); return { parentIsBody: e.parentElement === document.body, position: cs.position, pe: cs.pointerEvents, blend: cs.mixBlendMode, filter: cs.filter, backdrop: cs.backdropFilter || "none", shadow: cs.boxShadow, aria: e.getAttribute("aria-hidden"), z: +cs.zIndex }; };
      return { canvas: one(document.querySelector(".lc-canvas-media")), tiles: [...document.querySelectorAll(".lc-bead-media")].map(one) }; })()`);
    const [zTop] = await maxZ(P), m0 = await P.st();
    const plain = (l) => l.parentIsBody && l.position === "fixed" && l.pe === "none" && l.blend === "normal" && l.filter === "none" && l.backdrop === "none" && l.shadow === "none" && l.aria === "true" && l.z > zTop;
    info.mediaLayers = { lay, material: m0.material };
    check(G, "the media-safe presentation: one root-level canvas plus five bead tiles, fixed, pointer-events none, normal compositing (no blend, no filter, no backdrop blur, no shadow), aria-hidden, above the page; ready",
      m0.material.ok && plain(lay.canvas) && lay.tiles.length === 5 && lay.tiles.every(plain), `ok ${m0.material.ok}${m0.material.error ? " (" + m0.material.error + ")" : ""}; canvas ${JSON.stringify(lay.canvas)}; ${lay.tiles.length} tiles plain ${lay.tiles.every(plain)}`);
    // where the pointer is: the hero (one zone) and the renders take water; controls laid on a render elsewhere invert
    const layers = () => P.ev(`[document.querySelector(".lc-canvas").style.visibility, document.querySelector(".lc-canvas-media").style.visibility]`);
    const spots = [];
    async function spot(route, sel, label, want2, prep) {
      if (route !== null) await P.go(route); if (prep) { await P.ev(prep); await sleep(300); }
      const c = typeof sel === "string" ? await P.centerVisible(sel) : Array.isArray(sel) ? sel : await P.center(sel.at); if (!c) { spots.push({ label, ok: false, why: "missing" }); return; }
      const st0 = await P.st();
      await glide(P, Math.round(st0.raw[0]), Math.round(st0.raw[1]), c[0], c[1], 14); await sleep(260);
      if (sel === ".rail") { // the opened panel covers the rail with non-interactive padding
        await P.ev("Promise.all(document.querySelector('.navpanel').getAnimations().map(a => a.finished.catch(() => 0)))"); await sleep(140);
      }
      const st = await P.st(), [dv, mv] = await layers();
      const got = st.ignored ? "native" : `${st.material.shown === 1 ? "media" : st.material.shown === 0 ? "difference" : "mixed " + st.material.shown}${st.interactive ? " + hover" : ""}`;
      spots.push({ label, want: want2, got, ok: got === want2 && (st.ignored || (want2.startsWith("media") ? dv === "hidden" && mv === "visible" : dv === "visible" && mv === "hidden")), layers: [dv, mv] });
    }
    await spot("overview", [1300, 300], "Overview hero render", "media");
    await spot(null, { at: ".wordmark" }, "the HELIOS title", "media");
    await spot(null, { at: ".hero-sub" }, "the hero copy", "media");
    await spot(null, { at: ".evidence li:nth-child(2) .fig-label" }, "an evidence link in the hero", "media + hover");
    await spot(null, { at: ".evidence li.lead .fig" }, "the dark lead figure in the hero (a link)", "media + hover");
    await spot(null, { at: ".hero-ticks button:nth-child(3)" }, "a montage control in the hero", "media + hover");
    await spot(null, { at: "#btn-about" }, "the top bar's About button over the hero", "media + hover");
    await spot(null, ".rail", "the nav opened from the rail over the hero (pointer on panel padding)", "difference");
    await spot(null, { at: ".navpanel .brand" }, "the open navigation panel's brand over the hero", "difference", "document.querySelector('#nav').classList.add('open')");
    await spot(null, { at: '.navpanel a[data-id="render"] .t' }, "an open navigation row over the hero", "difference + hover");
    await P.ev("document.querySelector('#nav').classList.remove('open')"); await sleep(300);
    await spot(null, { at: ".index-head h2" }, "the index once it slides over the hero (interface)", "difference", "window.scrollTo(0, 700)");
    await spot("render", "#rl-img", "Render Lab render", "media");
    await spot(null, "#rl-thumbs .film img", "a film-strip frame (a render inside a button)", "media + hover");
    await spot(null, "#cv-view", "the convergence view (precision control)", "native");
    await spot(null, "#cv-loupe", "the convergence loupe", "media");
    await spot("correctness", "#cx-big", "Correctness backend render", "media");
    await spot(null, "#cx-ca", "Correctness render crop", "media");
    await spot(null, "#cx-cd", "the |A − B| difference image (data, not a render)", "difference");
    await spot("stress", [1500, 150], "paper (Stress & Limits opener)", "difference");
    await spot("performance", "[data-bar]", "a chart bar", "difference + hover");
    await spot(null, ".rail", "the nav opened from the rail outside the hero (pointer on panel padding)", "difference");
    await spot(null, { at: "#btn-about" }, "the top bar's About button outside the hero", "difference + hover");
    info.mediaSpots = spots;
    check(G, "the original material policy remains: hero and its summary plus marked renders take water; index, paper, charts, rail and controls elsewhere keep difference; precision controls remain native",
      spots.every((x) => x.ok), spots.map((x) => `${x.label}: ${x.got}${x.ok ? "" : ` ✗ (want ${x.want}, layers ${x.layers})`}`).join(" · "));
    await P.close();

    // frame-exact: the crossfade, and the simulation untouched by the material. A vertical flick from the opener (paper) into
    // the main render, so the goo crosses the boundary; each variant from a fresh page, so all three start from one state
    const flickSegs = [{ dx: 0.2, dy: 1, v: 3200, ms: 170, ramp: 25 }];
    const runFlick = async (force) => { const F = await open(HTTP + "?cursor=test#render", { label: `media frame-exact ${force}` }); await F.ev(`(${installDriver.toString()})()`);
      const out = await F.ev(`(() => { HeliosLiquidCursor.test.setMaterial(${force}); const n = __pv.run(${JSON.stringify(flickSegs)}, 1150, 520, 40); const out = [];
        for (let f = 1; f <= n; f++) { const s = __pv.stepTo(f); out.push(s); } return out; })()`); await F.close(); return out; };
    const auto = await runFlick("null"), diff = await runFlick(0), water = await runFlick(1);

    // the boundary cases, frame-exact over an artwork edge: the Render Lab frame's top edge (paper above, the render below)
    // and the hero's lower edge once the index slides over it (the hero above, the index below). Slow and fast entry and
    // exit, the tail and beads spanning the edge, a sharp turn exactly on it, stopping on it, repeated crossing. One
    // trajectory per edge, run with the material following the pointer and with it forced to difference (fresh pages)
    const EDGES = { render: { route: "render", prep: "", edge: `(() => { const r = document.querySelector(".frame[data-cursor-media]").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left + r.width * 0.5), 1]; })()` },
      hero: { route: "overview", prep: "window.scrollTo(0, 330)", edge: `[Math.round(document.querySelector(".index").getBoundingClientRect().top), 1300, -1]` } };
    const boundary = async (force, E) => { const F = await open(HTTP + `?cursor=test#${E.route}`, { label: `boundary ${E.route} ${force}` });
      if (E.prep) { await F.ev(E.prep); await sleep(300); }
      await F.ev("Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => 0)))"); await sleep(200);
      await F.ev(`(${installDriver.toString()})()`);
      const out = await F.ev(`(() => { const T = HeliosLiquidCursor.test, H = __pv, DT = 1000 / 120; T.setMaterial(${force});
        const [BY0, X, sgn] = ${E.edge}, BY = BY0, Y = (o) => BY + sgn * o; // o > 0: into the artwork
        const pts = [], cases = [];
        const add = (name, ...parts) => { const a = pts.length; for (const part of parts) for (const q of typeof part === "function" ? part() : part) pts.push(q); cases.push({ name, a, b: pts.length }); };
        const at = () => { for (let i = pts.length - 1; i >= 0; i--) if (pts[i]) return pts[i]; return [X, Y(-150)]; };
        const line = (x1, y1, n) => { const [x0, y0] = at(), o = []; for (let i = 1; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; };
        const hold = (n) => Array(n).fill(null);
        const flick = (segs) => { let [x, y] = at(); const o = [];
          for (const g of segs) { const nf = Math.round(g.ms / DT); for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1, v = g.v * k * k * (3 - 2 * k) / 1000; x += g.dx * v * DT; y += g.dy * sgn * v * DT; o.push([x, y]); } }
          return o; };
        const disp = (segs) => { let d = 0; for (const g of segs) { const nf = Math.round(g.ms / DT); for (let f = 1; f <= nf; f++) { const k = g.ramp ? Math.min(1, f * DT / g.ramp) : 1; d += g.v * k * k * (3 - 2 * k) / 1000 * DT; } } return d; };
        add("start", [[X, Y(-150)]], hold(30));
        add("slow entry", () => line(X, Y(130), 70), hold(40));
        add("slow exit", () => line(X, Y(-150), 70), hold(40));
        add("fast entry, the tail spanning the boundary", () => line(X - 300, Y(-215), 20), hold(30), () => flick([{ dx: 0.8, dy: 0.6, v: 3200, ms: 170, ramp: 25 }]), hold(60));
        add("fast exit", hold(10), () => flick([{ dx: -0.6, dy: -0.8, v: 3200, ms: 140, ramp: 25 }]), hold(60));
        const down = [{ dx: 0.92, dy: 0.39, v: 3600, ms: 120, ramp: 20 }], along = [{ dx: -1, dy: 0, v: 3200, ms: 130 }]; // a 157° turn
        add("a sharp turn exactly on the boundary, beads spanning it", () => line(X - 100 - disp(down) * 0.92, Y(1 - disp(down) * 0.39), 30), hold(30), () => flick(down), () => flick(along), hold(60));
        add("stopping on the boundary", () => line(X, BY, 40), hold(120));
        add("repeated back-and-forth crossing", Array.from({ length: 150 }, (_, f) => [X + f * 0.5, Y(45 * Math.sin(2 * Math.PI * (f + 1) / 29))]), hold(60));
        H.ready(pts[0][0], pts[0][1]);
        const fr = [], tl = T.tiles(), mt = T.M.tiles;
        for (const q of pts) { if (q) H.feed(q[0], q[1]); else H.hold(DT); const s = H.snap(), c = T.canvas.style, m = T.M.cs;
          fr.push({ g: [s.x, s.y, s.E, s.L, s.tail, s.pts, s.beads, s.hov], mat: s.mat, media: s.media, vis: s.visible, dv: c.visibility, dop: c.opacity, mv: m.visibility, mop: m.opacity,
            dT: tl.tiles.filter((t) => t.visible).length, mT: mt.tiles.filter((t) => t.visible).length, beads: s.beads.length, tail: s.tail }); }
        return { fr, cases, BY }; })()`);
      await F.close(); return out; };
    const sm = (x) => x * x * (3 - 2 * x), dop = (x) => (1 - sm(x)) ** 3, op = (v, dflt) => (v === "" ? dflt : +v);
    info.mediaBoundary = {};
    for (const [ename, E] of Object.entries(EDGES)) {
      const bAuto = await boundary("null", E), bDiff = await boundary(0, E), bad = [];
      const geoSame = bAuto.fr.every((f, i) => JSON.stringify(f.g) === JSON.stringify(bDiff.fr[i].g));
      bAuto.fr.forEach((f, i) => { const x = f.mat, d = dop(x);
        if (f.vis && f.dv !== "visible" && f.mv !== "visible") bad.push(`f${i}: no layer shown`);
        if (f.vis && f.dv === "visible" && Math.abs(op(f.dop, 1) - (x > 0 ? d : 1)) > 1e-4) bad.push(`f${i}: difference opacity ${f.dop} vs ${d}`);
        if (f.vis && f.mv === "visible" && Math.abs(op(f.mop, 1) - (x < 1 ? 1 - d : 1)) > 1e-4) bad.push(`f${i}: water opacity ${f.mop} vs ${1 - d}`);
        if (x === 1 && f.dT) bad.push(`f${i}: a difference bead tile left over the artwork`);
        if (x === 0 && f.mT) bad.push(`f${i}: a water bead tile left over the interface`);
        if (i && Math.abs(d - dop(bAuto.fr[i - 1].mat)) > 0.21) bad.push(`f${i}: the opacity jumped ${dop(bAuto.fr[i - 1].mat).toFixed(3)} → ${d.toFixed(3)}`); });
      const per = bAuto.cases.filter((c) => c.name !== "start").map((c) => { const fs = bAuto.fr.slice(c.a, c.b), sw = fs.findIndex((f, i) => i && f.media !== fs[i - 1].media);
        const flips = fs.filter((f, i) => i && f.media !== fs[i - 1].media).length;
        return { name: c.name, frames: fs.length, flips, endMat: +fs[fs.length - 1].mat.toFixed(3), tailAtSwitch: sw > 0 ? fs[sw].tail : null, beadsDuringFade: Math.max(0, ...fs.filter((f) => f.mat > 0 && f.mat < 1).map((f) => f.beads)),
          settled: fs.slice(-100).every((f) => f.mat === fs[fs.length - 1].mat) }; });
      const byName = (k) => per.find((c) => c.name.startsWith(k));
      info.mediaBoundary[ename] = { frames: bAuto.fr.length, edgeY: bAuto.BY, geometryIdentical: geoSame, violations: bad.slice(0, 20), cases: per };
      check(G, `boundary cases at ${ename === "hero" ? "the hero's edge (the index sliding over it)" : "a render's edge (the Render Lab frame)"} (slow and fast entry and exit, tail and beads spanning the edge, a sharp turn on it, stopping on it, repeated crossing): one material at a time, no flash, no popping, no vanished mask, no leftover bead, no physics reset`,
        geoSame && bad.length === 0 && byName("slow entry").endMat === 1 && byName("slow exit").endMat === 0 && byName("fast entry").tailAtSwitch && byName("fast exit").tailAtSwitch && byName("a sharp turn").beadsDuringFade >= 1
          && byName("stopping").settled && byName("repeated").flips >= 8,
        `${bAuto.fr.length} frames; geometry identical to the forced-difference run ${geoSame}; ${bad.length ? bad.slice(0, 3).join("; ") : "no violation"}; ` + per.map((c) => `${c.name}: ${c.flips} switch${c.flips === 1 ? "" : "es"}, ends ${c.endMat}${c.tailAtSwitch !== null ? `, tail at switch ${c.tailAtSwitch}` : ""}${c.beadsDuringFade ? `, ${c.beadsDuringFade} beads during a fade` : ""}`).join(" · "));
    }
    // inside the hero the liquid never inverts: a frame-exact path across the sky, the HELIOS title, the copy, an evidence
    // link, the dark lead figure, the montage ticks and the top bar, and back
    {
      const F = await open(HTTP + "?cursor=test#overview", { label: "hero zone path" });
      await F.ev(`(${installDriver.toString()})()`);
      const res = await F.ev(`(() => { const T = HeliosLiquidCursor.test, H = __pv, c = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        const way = [[1300, 300], c(".wordmark"), c(".hero-sub"), c(".hero-desc"), c(".evidence li:nth-child(2) .fig-label"), c(".evidence li.lead .fig"), c(".hero-ticks button:nth-child(2)"), c("#btn-about"), [1300, 300]];
        H.ready(way[0][0], way[0][1]); H.hold(300); const fr = [];
        for (let w = 1; w < way.length; w++) for (let i = 1; i <= 40; i++) { const u = i / 40; H.feed(way[w - 1][0] + (way[w][0] - way[w - 1][0]) * u, way[w - 1][1] + (way[w][1] - way[w - 1][1]) * u);
          const s = H.snap(); fr.push({ mat: s.mat, media: s.media, hov: s.interactive, dv: T.canvas.style.visibility, dT: T.tiles().tiles.filter((t) => t.visible).length }); }
        return { n: fr.length, water: fr.filter((f) => f.media && f.mat === 1 && f.dv === "hidden" && f.dT === 0).length, hover: fr.filter((f) => f.hov).length }; })()`);
      await F.close();
      info.heroZonePath = res;
      check(G, "inside the hero the liquid stays water everywhere: across the sky, the HELIOS title, the copy, the links, the dark lead figure, the montage ticks and the top bar (hover growth where there is a control), with no difference layer at any frame",
        res.water === res.n && res.hover > 0, `${res.water}/${res.n} frames water with the difference canvas hidden; ${res.hover} frames over a control (hover growth)`);
    }
    const T = await open(HTTP + "?cursor=test#render", { label: "media context" });
    const geo = (a) => JSON.stringify(a.map((s) => [s.x, s.y, s.E, s.L, s.tail, s.pts, s.beads, s.hov, s.presence]));
    const sw = auto.findIndex((s) => s.media), done = auto.findIndex((s, i) => i > sw && s.mat === 1);
    const tailAt = sw >= 0 ? [auto[sw - 1] && auto[sw - 1].L, auto[sw].L] : [];
    const peak = Math.max(...auto.map((s) => s.L)), beadsMax = Math.max(...auto.map((s) => s.beads.length)), mats = auto.slice(sw, done + 1).map((s) => +s.mat.toFixed(3));
    const steps = done - sw + 1; // the frame that crosses takes the first step
    info.mediaFrameExact = { switchFrame: sw, fadeSteps: steps, mats, tailAt, peak, beadsMax };
    check(G, "the simulation never reads the material: a flick from paper into a render gives bit-identical body, goo, tail and beads whether the material follows the pointer, is forced to difference, or forced to water",
      geo(auto) === geo(diff) && geo(auto) === geo(water) && peak >= 55 && beadsMax >= 1, `${auto.length} frames compared; goo peak ${peak.toFixed(0)} px, up to ${beadsMax} beads; identical ${geo(auto) === geo(diff)}/${geo(auto) === geo(water)}`);
    check(G, "crossing into a render mid-flick: the original 100 ms crossfade moves body, tail and beads together without resetting their state",
      sw > 0 && steps >= 11 && steps <= 14 && auto[sw - 1].tail && auto[sw].tail && auto[sw].L >= auto[sw - 1].L - 1 && auto[sw].presence === auto[sw - 1].presence, `switch at frame ${sw}, water after ${steps} frames (${(steps * 1000 / 120).toFixed(0)} ms): ${mats.join(" ")}; tail ${tailAt.map((v) => v.toFixed(1)).join(" → ")} px across it`);
    // media context loss: back to the difference material everywhere, no error; restored: the water again
    await T.ev("HeliosLiquidCursor.test.setFrozen(false), 1");
    const rl = await T.centerVisible("#rl-img"); await glide(T, rl[0] - 60, rl[1], rl[0], rl[1], 8); await sleep(300);
    const q0 = await T.st();
    await T.ev("window.__mlose = HeliosLiquidCursor.test.M.gl.getExtension('WEBGL_lose_context'), __mlose.loseContext(), 1"); await sleep(300); await glide(T, rl[0], rl[1], rl[0] + 30, rl[1], 6); await sleep(250);
    const q1 = await T.st(), l1 = await T.ev(`[document.querySelector(".lc-canvas").style.visibility, document.querySelector(".lc-canvas-media").style.visibility]`);
    await T.ev("__mlose.restoreContext(), 1"); await sleep(500); await glide(T, rl[0] + 30, rl[1], rl[0], rl[1], 6); await sleep(300);
    const q2 = await T.st();
    check(G, "a lost media context falls back to the difference material (the cursor stays), and the water returns on restoration; no error",
      q0.material.shown === 1 && !q1.material.ok && q1.active && q1.visible && l1[0] === "visible" && l1[1] === "hidden" && q2.material.ok && q2.material.shown === 1 && T.logs.length === 0,
      `before ${q0.material.shown}; lost: ok ${q1.material.ok}, active ${q1.active}, layers ${l1}; restored: ok ${q2.material.ok}, shown ${q2.material.shown}; console ${T.logs.length ? T.logs[0] : "clean"}`);
    await T.close();
  } catch (err) { check("media", "the media checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- the water's optics: refraction, the hero snapshot, cleanliness
  if (want("optics")) try {
    const G = "optics";
    const FREEZE_HERO = `(() => { const st = document.createElement("style"); st.textContent = ".hero-frame img { animation: none !important; } .hero-frame, .hero-stage { transition: none !important; }"; document.head.appendChild(st);
      const c = document.querySelector(".hero-count"); if (c) { c.dispatchEvent(new MouseEvent("mouseenter")); document.querySelectorAll(".hero-ticks button")[0].click(); } return 1; })()`;
    const SHADE_OFF = { body: 0, rim: 0, spec: 0, sheen: 0, rimLine: 0, men: 0, edge: 0 }; // (diagnostics: refraction alone)
    const lumOf = (p) => (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
    const prep = async (url, label) => { const P = await open(url, { label }); await P.ev(FREEZE_HERO); await sleep(400); await P.ev(`(${installDriver.toString()})()`); return P; };
    const restAt = (x, y) => `(__pv.ready(${x - 40}, ${y}), [1,2,3,4,5,6,7,8,9,10].forEach((i) => __pv.feed(${x - 40} + 4 * i, ${y})), __pv.hold(300), 1)`;
    const withWithout = async (P, clip) => { const a = decodePNG((await P.shot(clip.x, clip.y, clip.w, clip.h)).toString("base64"));
      await P.ev(`document.head.insertAdjacentHTML("beforeend", "<style id='__h'>.lc-canvas, .lc-canvas-media, .lc-bead, .lc-bead-media { visibility: hidden !important; }</style>"), 1`); await sleep(120);
      const b = decodePNG((await P.shot(clip.x, clip.y, clip.w, clip.h)).toString("base64")); await P.ev(`document.getElementById("__h").remove(), 1`); await sleep(60); return [a, b]; };

    // the hero snapshot: taken once in idle time, reused while the drop moves, retaken when the hero's overlay changes
    const P = await prep(HTTP + "?cursor=test#overview", "optics hero");
    await P.ev(restAt(1300, 300)); await sleep(1200); await P.ev("__pv.hold(400), 1");
    const s0 = (await P.st()).material;
    await P.ev(`(() => { for (let i = 0; i < 240; i++) __pv.feed(500 + 900 * (0.5 + 0.5 * Math.sin(i / 19)), 300 + 300 * (0.5 + 0.5 * Math.cos(i / 23))); return 1; })()`); await sleep(900);
    const s1 = (await P.st()).material;
    await P.ev(`document.querySelectorAll(".hero-ticks button")[2].click(), 1`); await sleep(300); await P.ev(restAt(1250, 320)); await sleep(1300); await P.ev("__pv.hold(400), 1");
    const s2 = (await P.st()).material;
    info.heroOptic = { first: s0.heroOptic, after240Frames: s1.heroOptic, afterMontageChange: s2.heroOptic };
    check(G, "the hero's optical snapshot exists, is taken once (idle time), is not retaken while the drop moves (240 frames across the hero), and is retaken when the hero's overlay changes (a montage step)",
      s0.heroOptic.ok && s0.heroOptic.captures === 1 && s0.refracting === "hero" && s0.refraction === 1 && s1.heroOptic.captures === 1 && s2.heroOptic.captures === 2 && s2.heroOptic.ok,
      `captures ${s0.heroOptic.captures} → ${s1.heroOptic.captures} after 240 frames → ${s2.heroOptic.captures} after a montage step; snapshot ${Math.round(s0.heroOptic.ms)} ms (main thread ${Math.round(s0.heroOptic.mainMs)} ms); refracting ${s0.refracting} ${s0.refraction}`);
    // the snapshot is the page: its text lies exactly where the page draws it (else a stroke shows twice inside the drop:
    // the snapshot's, bent, and the page's own through the clear crown). Ink boxes of each HELIOS glyph, the subtitle and the
    // scene label, in the snapshot (over the hero's colour) and in a screenshot without the frames and the cursor
    const snapB64 = await P.ev(`(async () => { const H = HeliosLiquidCursor.test.R.hero, source = H.snapshots?.size ? Array.from(H.snapshots.values()).at(-1) : H.cv; if (!source) return null; const c = new OffscreenCanvas(source.width, source.height), x = c.getContext("2d");
      // transferToImageBitmap clears its staging canvas. Inspect the actual raster uploaded to the hero texture.
      x.fillStyle = getComputedStyle(document.querySelector("#hero")).backgroundColor; x.fillRect(0, 0, c.width, c.height); x.drawImage(source, 0, 0);
      const u8 = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return [btoa(s), source.width / H.w]; })()`);
    await P.ev(`document.head.insertAdjacentHTML("beforeend", "<style id='__ns'>.lc-canvas, .lc-canvas-media, .lc-bead, .lc-bead-media, .hero-stage { visibility: hidden !important; }</style>"), 1`); await sleep(150);
    const live = decodePNG((await P.shot(0, 0, 1920, 1080)).toString("base64")); await P.ev(`document.getElementById("__ns").remove(), 1`); await sleep(80);
    const probes = await P.ev(`(() => { const w = document.querySelector("#hero .wordmark"), t = [...w.childNodes].find((n) => n.nodeType === 3), ls = parseFloat(getComputedStyle(w).letterSpacing) || 0, out = [];
      for (let i = 0; i < t.length; i++) { const g = document.createRange(); g.setStart(t, i); g.setEnd(t, i + 1); const r = g.getBoundingClientRect(); out.push([t.textContent[i], r.left + 2, r.top - 12, r.right - ls, r.top + r.height * 0.75]); }
      for (const sel of [".hero-sub", ".hero-count .scene"]) { const r = document.querySelector(sel).getBoundingClientRect(); out.push([sel, r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]); } return out; })()`);
    let worstShift = 99; const shifts = {};
    if (snapB64) { const sn = decodePNG(snapB64[0]), k = snapB64[1], dark = (img, sc) => (x, y) => { const p = img.px(Math.round(x * sc), Math.round(y * sc)); return p[0] + p[1] + p[2] < 200; };
      const ink = (d, [, x0, y0, x1, y1]) => { let a = [1e9, 1e9, -1, -1]; for (let y = Math.max(0, Math.floor(y0)); y < Math.min(1080, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(1920, x1); x++) if (d(x, y)) { a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], y); a[2] = Math.max(a[2], x); a[3] = Math.max(a[3], y); } return a; };
      worstShift = 0; for (const pr of probes) { const a = ink(dark(live, 1), pr), b = ink(dark(sn, k), pr), d = Math.max(...[0, 1, 2, 3].map((i) => Math.abs(a[i] - b[i]))); shifts[pr[0]] = d; worstShift = Math.max(worstShift, d); } }
    info.heroSnapshotAlignment = shifts;
    check(G, "the hero's snapshot lies exactly on the page: every HELIOS glyph, the subtitle and the scene label have the same ink box in the snapshot as on screen (within 1 px), so no stroke shows twice inside the drop",
      snapB64 && worstShift <= 1, `worst ink-box difference ${worstShift} px · ${Object.entries(shifts).map(([kk, v]) => `${kk} ${v}`).join(", ")}`);
    // refraction alone (the shading switched off): the rim bends a letter, the crown hardly; over uniform sky nothing changes
    await P.ev(`HeliosLiquidCursor.test.setWater(${JSON.stringify(SHADE_OFF)}), 1`);
    const ring = (a, b, cx, cy, r0, r1) => { let n = 0, t = 0; for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) { const r = Math.hypot(x - cx, y - cy); if (r < r0 || r > r1) continue; const p = a.px(x, y), q = b.px(x, y); t += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n++; } return t / n / 3; };
    const prof = {};
    for (const [name, x, y] of [["a HELIOS letter (the I)", 505, 548], ["a HELIOS letter (the O)", 640, 548], ["uniform sky", 1300, 300]]) {
      await P.ev(restAt(x, y)); await sleep(300); await P.ev("__pv.hold(300), 1");
      const sn = await P.ev("__pv.snap()"), [a, b] = await withWithout(P, { x: Math.round(sn.x) - 60, y: Math.round(sn.y) - 60, w: 120, h: 120 }), R0 = 34;
      prof[name] = { crown: +ring(a, b, 60, 60, 0, R0 * 0.3).toFixed(2), rim: +ring(a, b, 60, 60, R0 * 0.72, R0 * 0.95).toFixed(2), whole: +ring(a, b, 60, 60, 0, R0 * 0.95).toFixed(2) };
    }
    info.refractionProfile = prof;
    const L1 = prof["a HELIOS letter (the I)"], L2 = prof["a HELIOS letter (the O)"], SK = prof["uniform sky"];
    check(G, "refraction bends what lies beneath: over a HELIOS letter the rim changes the page clearly and the crown far less (restrained centre); over uniform sky the rebuilt hero matches the page (no colour shift, nothing invalid)",
      Math.max(L1.rim, L2.rim) > 6 && L1.crown < L1.rim * 0.6 && L2.crown < L2.rim * 0.6 && SK.whole < 1.5,
      Object.entries(prof).map(([k, v]) => `${k}: crown ${v.crown}, rim ${v.rim} (mean level change)`).join(" · "));
    // scrolling the hero under a resting drop: no snapshot while it scrolls (refraction simply pauses), one once it settles
    await P.ev(`HeliosLiquidCursor.test.setWater(null), 1`); await P.ev(restAt(1300, 300)); await sleep(700); await P.ev("__pv.hold(300), 1");
    const c0 = (await P.st()).material.heroOptic.captures, during = [];
    for (let i = 0; i < 14; i++) { await P.ev("window.scrollBy(0, 5), 1"); await sleep(40); const q = (await P.st()).material; during.push(q.refraction); }
    const c1 = (await P.st()).material.heroOptic.captures;
    await sleep(900); await P.ev("__pv.hold(300), 1"); await sleep(200);
    const s3 = (await P.st()).material;
    info.heroScroll = { before: c0, afterScrolling: c1, afterSettling: s3.heroOptic.captures, refractionDuring: during, refractionAfter: s3.refraction };
    check(G, "scrolling the hero takes no snapshot while it scrolls (14 wheel-sized steps 40 ms apart; refraction pauses rather than showing a stale image) and one once the page settles, after which the water refracts again",
      c1 === c0 && s3.heroOptic.captures >= c0 + 1 && s3.heroOptic.captures <= c0 + 2 && s3.refraction === 1 && s3.refracting === "hero",
      `captures ${c0} → ${c1} while scrolling → ${s3.heroOptic.captures} settled; refraction ${s3.refraction} (${s3.refracting}); snapshot ${Math.round(s3.heroOptic.ms)} ms`);
    await P.close();

    // a render's edge: refraction samples only inside the render (never black, nothing drawn past the image); the water's
    // pixels are validly premultiplied (no colour without coverage: no dark fringe)
    const Rl = await prep(HTTP + "?cursor=test#render", "optics render edge");
    await Rl.ev(`HeliosLiquidCursor.test.setWater(${JSON.stringify(SHADE_OFF)}), 1`);
    const fr = await Rl.ev(`(() => { const r = document.querySelector("#rl-img").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })()`);
    await Rl.ev(restAt(fr[0] + 600, fr[1] + 12)); await sleep(700); await Rl.ev("__pv.hold(400), 1");
    const se = await Rl.ev("__pv.snap()"), [ea, eb] = await withWithout(Rl, { x: Math.round(se.x) - 60, y: fr[1] - 40, w: 120, h: 100 });
    let outside = 0, blackNew = 0; for (let y = 0; y < ea.h; y++) for (let x = 0; x < ea.w; x++) { const p = ea.px(x, y), q = eb.px(x, y), d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
      if (y < 40 - 1 && d > 3) outside++; if (lumOf(p) < 0.05 && lumOf(q) > 0.15) blackNew++; }
    const pm = await Rl.ev(`(() => { HeliosLiquidCursor.test.setWater(null); const m = HeliosLiquidCursor.test.readMediaMask(); if (!m) return null; let bad = 0, cov = 0; const p = m.px; for (let i = 0; i < p.length; i += 4) { if (p[i + 3] > 0) cov++; if (Math.max(p[i], p[i + 1], p[i + 2]) > p[i + 3] + 1) bad++; } return { bad, cov }; })()`);
    const rlState = (await Rl.st()).material;
    info.refractionEdge = { outsideChanged: outside, newBlack: blackNew, premultiplied: pm, refracting: rlState.refracting };
    check(G, "at a render's edge the refraction never samples or draws outside the image (nothing changes past its edge, no black appears), and every water pixel is validly premultiplied (no colour without coverage: no dark fringe)",
      rlState.refracting === "rl-img" && outside === 0 && blackNew === 0 && pm && pm.cov > 500 && pm.bad === 0,
      `pixels changed past the image's edge ${outside}; new near-black pixels ${blackNew}; premultiplied ${pm ? `${pm.bad} invalid of ${pm.cov} covered` : "no readback"}; refracting ${rlState.refracting}`);
    await Rl.close();

    // a fast whip over the pale hero: the water's shading darkens nothing noticeably (the old smear), frame by frame
    const Dk = await prep(HTTP + "?cursor=test#overview", "optics dark");
    await Dk.ev(`HeliosLiquidCursor.test.setWater({ bend: 0, mag: 1 }), 1`); // (refraction moves dark strokes legitimately: measure the shading alone)
    let worstDark = 0, framesSeen = 0, tailSeen = 0;
    for (const [segs, x1, y1] of [[[{ dx: 1, dy: 0, v: 4200, ms: 200, ramp: 20 }], 1000, 560], [[{ dx: 0.7071, dy: 0.7071, v: 4200, ms: 200, ramp: 20 }], 1250, 720], [[{ dx: 1, dy: 0, v: 4000, ms: 240, ramp: 20, turn: 2.6 }], 1100, 480]]) {
      const n = await Dk.ev(`__pv.run(${JSON.stringify(segs)}, ${x1}, ${y1}, 16)`);
      for (let k = Math.max(4, n - 24); k <= n; k += 5) {
        await Dk.ev(`__pv.run(${JSON.stringify(segs)}, ${x1}, ${y1}, 16)`); const sn = await Dk.ev(`__pv.stepTo(${k})`); tailSeen = Math.max(tailSeen, sn.L);
        const [a, b] = await withWithout(Dk, { x: Math.round(sn.x) - 200, y: Math.round(sn.y) - 120, w: 360, h: 240 }); let dark = 0;
        for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (lumOf(b.px(x, y)) - lumOf(a.px(x, y)) > 0.04) dark++;
        worstDark = Math.max(worstDark, dark); framesSeen++;
      }
    }
    info.darkArtifact = { worstPixelsDarkerBy4pc: worstDark, frames: framesSeen, tail: tailSeen };
    check(G, "fast whips over the pale hero (goo out): the water's shading darkens no pixel by more than 4% in any sampled frame (the old dark smear is gone)",
      worstDark === 0 && tailSeen > 40, `${framesSeen} frames sampled, goo up to ${tailSeen.toFixed(0)} px; worst frame: ${worstDark} pixels darker than the page by >4%`);
    await Dk.close();

    // the optics never touch the simulation: shading terms switched off, and each of the three candidates
    const geoRun = async (q, over) => { const F = await prep(HTTP + `?cursor=test${q}#overview`, `optics geometry ${q}`); if (over) await F.ev(`HeliosLiquidCursor.test.setWater(${JSON.stringify(over)}), 1`);
      const out = await F.ev(`(() => { const n = __pv.run(${JSON.stringify([{ dx: 1, dy: -0.1, v: 4200, ms: 220, ramp: 20, turn: 1.4 }])}, 1200, 480, 40), o = []; for (let f = 1; f <= n; f++) { const s = __pv.stepTo(f); o.push([s.x, s.y, s.E, s.L, s.tail, s.pts, s.beads, s.hov]); } return JSON.stringify(o); })()`);
      await F.close(); return out; };
    const gB = await geoRun("&glass=target"), gOff = await geoRun("&glass=target", { body: 0, rim: 0, spec: 0, sheen: 0, rimLine: 0, men: 0, edge: 0, bend: 0, mag: 1 }), gS = await geoRun("&glass=match1"), gSt = await geoRun("&glass=max");
    check(G, "the optics never touch the simulation: the same whip gives bit-identical body, goo, tail and beads with every optical term switched off, and with each of the three candidates (Match 1, Target, Max)",
      gB === gOff && gB === gS && gB === gSt, `terms off ${gB === gOff}, Subtle ${gB === gS}, Strong ${gB === gSt} (${JSON.parse(gB).length} frames)`);

    // file://: the page may not read its own stylesheet rules or images there, so the water keeps its non-refractive look
    const Fp = await open(FILE + "#overview", { label: "optics file://" });
    await glide(Fp, 1260, 300, 1300, 300, 6); await sleep(1500); await glide(Fp, 1300, 300, 1320, 310, 4); await sleep(600);
    const fs = await Fp.st();
    check(G, "file://: the hero's snapshot is refused by the browser (no access to the page's own stylesheet rules there), so the water falls back to its non-refractive presentation; still water, no error",
      fs.active && fs.material.shown === 1 && fs.material.refraction === 0 && !fs.material.heroOptic.ok && Fp.logs.length === 0,
      `material ${fs.material.shown}, refraction ${fs.material.refraction}, snapshot ${fs.material.heroOptic.ok ? "ok" : `refused (${fs.material.heroOptic.failed.slice(0, 80)})`}; console ${Fp.logs.length ? Fp.logs[0] : "clean"}`);
    await Fp.close();
  } catch (err) { check("optics", "the optics checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- Liquid Glass: actual channel separation, clean empty space, alpha and departure
  if (want("dispersion")) try {
    const G = "dispersion", rows = [], states = [];
    const split = (a, b) => { let rim = 0, centre = 0, peak = 0;
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const p = a.px(x, y), q = b.px(x, y), rb = Math.abs((p[0] - q[0]) - (p[2] - q[2]));
        peak = Math.max(peak, rb); const r = Math.hypot(x - a.w / 2, y - a.h / 2); if (rb > 20) { if (r > 24 && r < 35) rim++; if (r < 9) centre++; } }
      return { rim, centre, peak }; };
    for (const name of ["match1", "target", "max"]) {
      const P = await open(HTTP + `?cursor=test&glass=${name}#overview`, { label: `dispersion ${name}` });
      await P.ev(`document.head.insertAdjacentHTML("beforeend", "<style>.hero-frame img { animation:none!important } .hero-frame, .hero-stage { transition:none!important }</style>"), document.querySelector('.hero-count').dispatchEvent(new MouseEvent('mouseenter')), document.querySelectorAll('.hero-ticks button')[0].click(), 1`);
      await sleep(400); await P.ev(`(${installDriver.toString()})()`);
      await P.ev("__pv.ready(465,548), [1,2,3,4,5,6,7,8,9,10].forEach(i=>__pv.feed(465+4*i,548)), __pv.hold(700), 1"); await sleep(800); await P.ev("__pv.hold(400), 1");
      const cfg = await P.ev("HeliosLiquidCursor.test.setWater(null)"), sn = await P.ev("__pv.snap()"), clip = [Math.round(sn.x)-60, Math.round(sn.y)-60,120,120];
      const withSplit = decodePNG((await P.shot(...clip)).toString("base64"));
      await P.ev("HeliosLiquidCursor.test.setWater({dispersion:0}), __pv.hold(100), 1"); await sleep(100);
      const withoutSplit = decodePNG((await P.shot(...clip)).toString("base64"));
      await P.ev("HeliosLiquidCursor.test.setWater(null), __pv.hold(100), 1"); await sleep(100);
      const alpha = await P.ev(`(() => { const T=HeliosLiquidCursor.test, m=T.readMediaMask(); let invalid=0, uncoveredColour=0; for(let i=0;i<m.px.length;i+=4) { const mx=Math.max(m.px[i],m.px[i+1],m.px[i+2]); if(mx>m.px[i+3]+1) invalid++; if(m.px[i+3]===0 && mx>0) uncoveredColour++; } return {invalid,uncoveredColour,reach:T.M.gl.getUniform(T.M.prog,T.M.U.uReach)}; })()`);
      await P.ev("document.head.insertAdjacentHTML('beforeend', '<style id=__glassHidden>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media {visibility:hidden!important}</style>'),1"); await sleep(100);
      const barePNG = await P.shot(...clip), bare = decodePNG(barePNG.toString("base64")); await P.ev("document.getElementById('__glassHidden').remove(), __pv.ready(1300,300), __pv.hold(1000),1"); await sleep(200);
      const departedPNG = await P.shot(...clip), departed = decodePNG(departedPNG.toString("base64")); let residue=0, residueMax=0; for(let y=0;y<bare.h;y++) for(let x=0;x<bare.w;x++) { const a=bare.px(x,y),b=departed.px(x,y),delta=Math.max(...a.map((v,i)=>Math.abs(v-b[i]))); residueMax=Math.max(residueMax,delta); if(delta>1) residue++; }
      const qaDir = opt("--qa-dir", ""); if (qaDir) { writeFileSync(join(qaDir, `departure-${name}-before.png`), barePNG); writeFileSync(join(qaDir, `departure-${name}-after.png`), departedPNG); }
      const skyA = decodePNG((await P.shot(1240,240,120,120)).toString("base64"));
      await P.ev("HeliosLiquidCursor.test.setWater({dispersion:0}), __pv.hold(100),1"); await sleep(100);
      const skyB = decodePNG((await P.shot(1240,240,120,120)).toString("base64"));
      rows.push({ name, cfg, glyph:split(withSplit,withoutSplit), sky:split(skyA,skyB), alpha, residue, residueMax });
      const segs = [{dx:1,dy:-0.1,v:4200,ms:220,ramp:20,turn:1.4}];
      states.push(await P.ev(`(() => { const n=__pv.run(${JSON.stringify(segs)},1200,480,40),out=[]; for(let f=1;f<=n;f++){const s=__pv.stepTo(f);out.push([s.x,s.y,s.E,s.L,s.tail,s.pts,s.beads,s.hov]);} return JSON.stringify(out); })()`));
      await P.close();
    }
    info.dispersion = rows;
    check(G,"all three candidates visibly separate source R/B near a HELIOS rim while the centre stays comparatively aligned", rows.every(r=>r.glyph.rim>10 && r.glyph.centre<r.glyph.rim*0.2),JSON.stringify(rows.map(r=>({name:r.name,...r.glyph}))));
    check(G,"Max > Target > Match 1 dispersion uniforms; every channel has the candidate-specific reach cap and the water stays validly premultiplied with zero uncovered colour",rows[0].cfg.dispersion<rows[1].cfg.dispersion && rows[1].cfg.dispersion<rows[2].cfg.dispersion && rows.every(r=>r.alpha.reach===r.cfg.reach && r.alpha.invalid===0 && r.alpha.uncoveredColour===0),JSON.stringify(rows.map(r=>({name:r.name,dispersion:r.cfg.dispersion,...r.alpha}))));
    check(G,"empty pale sky has no dispersion-generated RGB blob, and HELIOS returns to its original pixels once the liquid leaves",rows.every(r=>r.sky.peak<3 && r.residue===0),JSON.stringify(rows.map(r=>({name:r.name,sky:r.sky.peak,residue:r.residue,maxDelta:r.residueMax}))));
    check(G,"Match 1, Target and Max keep bit-identical motion, body, tail and bead geometry",states.every(s=>s===states[0]),"66 deterministic frames per candidate");
  } catch (err) { check("dispersion","the focused channel-separation checks ran to completion",false,String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- performance and idle behaviour (real time)
  if (want("performance")) try {
    const G = "performance";
    const fpsExpr = (ms) => `new Promise((r) => { let n = 0, worst = 0, last = 0; const t0 = performance.now(); (function f(t) { if (last) worst = Math.max(worst, t - last); last = t; n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r([+(n / ((performance.now() - t0) / 1000)).toFixed(1), +worst.toFixed(1)]); })(); })`;
    const P = await open(HTTP + "#correctness", { label: "performance" });
    const off = await open(HTTP + "?cursor=off#correctness", { label: "performance off" });
    const fOff = await off.ev(fpsExpr(1500));
    await off.close();
    await glide(P, 860, 700, 920, 720); await sleep(3800); // let the membrane still
    const i0 = await P.st(); const fIdle = await P.ev(fpsExpr(1500)); const i1 = await P.st();
    // ordinary motion: a steady 600 px/s sweep for 1.5 s
    const mv = P.ev(fpsExpr(1500));
    let x = 400; for (let i = 0; i < 180; i++) { x += 5; await P.move(Math.round(x), 700 + Math.round(40 * Math.sin(i / 20))); await sleep(8); }
    const fMove = await mv; const m1 = await P.st();
    // strong motion: real flicks back and forth (goo and beads)
    const fl = P.ev(fpsExpr(1500));
    let gooSeen = 0, beadsSeen = 0;
    for (let k = 0; k < 4; k++) { const xe = await flick(P, k % 2 ? 1500 : 500, 650, k % 2 ? -70 : 70); const st = await P.st(); if (st.goo.on) gooSeen++; beadsSeen = Math.max(beadsSeen, st.goo.beads); await sleep(60); void xe; }
    const fFlick = await fl; const s1 = await P.st();
    // scrolling with the cursor running
    await P.go("performance"); await glide(P, 900, 600, 920, 610, 4);
    const sc = P.ev(fpsExpr(1200)); for (let i = 0; i < 20; i++) { await P.wheel(920, 610, 200); await sleep(40); } const fScroll = await sc;
    await P.ev("window.scrollTo(0, 0)");
    await P.close();
    // forced draw cost with the goo out and four beads (frame-exact, ?cursor=test); gl.finish-bounded wall clock, not a GPU timer
    const T = await open(HTTP + "?cursor=test#correctness", { label: "draw cost" });
    await T.ev(`(${installDriver.toString()})()`);
    const bench = await T.ev(`(() => { const T = HeliosLiquidCursor.test; const idle = (__pv.ready(700, 650), T.benchDraw(200)); const p = __pv.run([{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], 900, 600, 0);
      let best = null; for (let f = 1; f <= p; f++) { const s = __pv.stepTo(f); if (!best || s.beads.length > best.n || (s.tail && s.beads.length >= best.n)) best = { n: s.beads.length, f, tail: s.tail }; }
      const goo = T.benchDraw(200), L = T.tiles(); return { idle: +idle.toFixed(4), goo: +goo.toFixed(4), beads: best.n, tail: best.tail, tiles: L ? L.tiles.filter((t) => t.visible).length : 0 }; })()`);
    const work = await T.ev(`(() => { const T = HeliosLiquidCursor.test; const t0 = performance.now(); for (let i = 0; i < 240; i++) T.advance(1000 / 120, 1000 / 120); return +((performance.now() - t0) / 240).toFixed(4); })()`);
    await T.close();
    info.performance = { fpsCursorOff: fOff, idle: { fps: fIdle, framesWhileIdle: i1.frames - i0.frames, drawsWhileIdle: i1.allDraws - i0.allDraws, sleeping: i1.sleeping, workMs: i0.workMs },
      motion: { fps: fMove, workMs: m1.workMs }, flicks: { fps: fFlick, workMs: s1.workMs, gooSeen, beadsSeen }, scroll: { fps: fScroll }, forcedDraw: bench, stepPlusDrawMs: work };
    check(G, "idle: once the membrane has stilled the cursor loop sleeps (0 cursor frames and 0 draws over 1.5 s), and the page keeps its frame rate",
      i1.sleeping && i1.frames === i0.frames && i1.allDraws === i0.allDraws && fIdle[0] >= 0.9 * fOff[0], `cursor frames +${i1.frames - i0.frames}, draws +${i1.allDraws - i0.allDraws}; page ${fIdle[0]} fps (cursor off: ${fOff[0]})`);
    check(G, "ordinary motion and strong flicks keep the page's frame rate; the cursor's frame callback stays well under 1 ms of CPU",
      fMove[0] >= 0.9 * fOff[0] && fFlick[0] >= 0.9 * fOff[0] && m1.workMs < 1 && s1.workMs < 1, `motion ${fMove[0]} fps (worst ${fMove[1]} ms, callback ${m1.workMs.toFixed(3)} ms), flicks ${fFlick[0]} fps (worst ${fFlick[1]} ms, callback ${s1.workMs.toFixed(3)} ms, goo seen ${gooSeen}/4, up to ${beadsSeen} beads), scrolling ${fScroll[0]} fps`);
    check(G, "the fullest goo (tail plus beads in tiles) stays cheap to draw", bench.goo < 1 && work < 1, `forced draw ${bench.idle} ms idle → ${bench.goo} ms with ${bench.beads} beads (${bench.tiles} tiles) and tail ${bench.tail}; integrate + draw per frame ${work} ms`);
  } catch (err) { check("performance", "the performance checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- file://
  if (want("file")) try {
    const G = "file";
    const P = await open(FILE, { label: "file://" });
    await glide(P, 900, 760, 980, 720); await sleep(300);
    const st = await P.st(), proto = await P.ev("location.protocol");
    await P.go("render"); await glide(P, 980, 720, 1000, 700, 4); await sleep(200); const st2 = await P.st();
    check(G, "file://: the cursor initialises without a server (inline shaders, no fetch), follows the pointer, console clean", proto === "file:" && st.active && st.visible && st.nativeHidden && st2.visible && P.logs.length === 0, `${proto}, active ${st.active}, visible ${st.visible}, console ${P.logs.length ? P.logs[0] : "clean"}`);
    await P.close();
  } catch (err) { check("file", "the file checks ran to completion", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }

  // ---------------------------------------------------------------- integration QA captures (separate evidence directory)
  if (EVIDENCE && want("evidence")) try {
    const files = [];
    const keep = (name, buf) => { writeFileSync(join(OUT, name), buf); files.push(name); };
    const P = await open(HTTP + "?cursor=test", { label: "evidence" });
    await P.ev(`(${installDriver.toString()})()`);
    // the goo mid-gesture over each section (frame-exact; the real page under it)
    const scenes = [
      ["overview", "01-overview", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1500, 560, 18, "strong flick over the hero render"],
      ["render", "02-render-lab", [{ dx: 0.5817, dy: -0.8134, v: 3200, ms: 260, ramp: 25, turn: 1.9 }], 1400, 760, 26, "curved flick over the Render Lab"],
      ["workload", "03-workload-microscope", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1700, 170, 20, "strong flick over the Workload Microscope opener"],
      ["scheduler", "04-scheduler-lab", [{ dx: 1, dy: 0, v: 4600, ms: 150, ramp: 18 }, { dx: -0.95, dy: 0.31, v: 4200, ms: 120 }], 1100, 420, 24, "extreme whip over the Scheduler Lab"],
      ["performance", "05-performance-lab", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1700, 180, 20, "strong flick over the Performance Lab opener"],
      ["correctness", "06-correctness", [{ dx: 0.5817, dy: -0.8134, v: 3200, ms: 260, ramp: 25, turn: 1.9 }], 1500, 700, 26, "curved flick over the correctness wall (dark and render surfaces)"],
      ["stress", "07-stress-limits", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1300, 560, 20, "strong flick over Stress & Limits"],
      ["defence", "08-technical-qna", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1500, 520, 20, "strong flick over the Technical Q&A"],
    ];
    const rows = [];
    for (const [route, file, segs, x1, y1, at, label] of scenes) {
      await P.go(route); await P.ev("window.scrollTo(0, 0)"); await sleep(250);
      const n = await P.ev(`__pv.run(${JSON.stringify(segs)}, ${x1}, ${y1}, 40)`); void n;
      const sn = await P.ev(`__pv.stepTo(${at})`); await P.frames(2);
      const full = await P.shot(); keep(`${file}.png`, full);
      rows.push({ label: `${label} · tail ${sn.L.toFixed(0)} px · ${sn.beads.length} beads`, cells: [await P.shot(...around(sn))] });
    }
    keep("00-sections-goo.png", await labelledSheet(B, { title: "The production cursor in the real Helios Observatory: the approved Reference goo · balanced over each section", note: "Integration QA (not the Observatory's official screenshots). Headless Edge, 1920×1080, DPR 1, frame-exact 120 Hz gestures through the production runtime's ?cursor=test hooks, the real page underneath (difference blending). Native pixels, crops around the cursor; the full frames are 01-08.", rows }));
    // surfaces and states
    const states = [];
    async function stateShot(route, prepJs, segs, x1, y1, at, label) {
      await P.go(route); if (prepJs) { await P.ev(prepJs); await sleep(350); } await P.ev("window.scrollTo(0, 0)"); await sleep(200);
      await P.ev(`__pv.run(${JSON.stringify(segs)}, ${x1}, ${y1}, 60)`); const sn = await P.ev(`__pv.stepTo(${at})`); await P.frames(2);
      states.push({ label: `${label} · ${sn.ignored ? "liquid hidden (native cursor)" : sn.interactive ? "hover growth" : sn.tail ? "goo" : "body"}`, cells: [await P.shot(...around(sn, 460, 300))] });
    }
    await stateShot("overview", "", [{ dx: 1, dy: 0, v: 900, ms: 300, ramp: 60 }], 330, 960, 50, "dark surface: the lead evidence figure (a link)");
    await stateShot("stress", "", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1500, 150, 20, "paper surface (opener)");
    await stateShot("render", "", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1100, 620, 20, "render image (the Render Lab frame)");
    await stateShot("performance", "", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 900, 700, 18, "chart");
    await stateShot("overview", "", [{ dx: 1, dy: 0, v: 900, ms: 300, ramp: 60 }], ...(await P.center("#btn-about")), 50, "hover over the About button");
    await stateShot("workload", "", [{ dx: 1, dy: 0, v: 900, ms: 300, ramp: 60 }], ...(await (async () => { await P.go("workload"); return P.center("#wm-canvas"); })()), 50, "precision control: the Workload tile canvas (native crosshair)");
    await P.ev("document.querySelector('#btn-present').click()"); await sleep(600);
    await stateShot("overview", "", [{ dx: 1, dy: 0, v: 3200, ms: 200, ramp: 25 }], 1300, 420, 20, "Guided Tour (item 1, its HUD at the foot: 11-guided-tour.png)");
    keep("11-guided-tour.png", await P.shot());
    await P.ev("(document.body.classList.remove('presenting'), 1)");
    keep("09-surfaces-and-states.png", await labelledSheet(B, { title: "Surfaces and states in the real Observatory", note: "Difference blending over dark, paper, render and chart surfaces; hover growth over a button; a precision control hides the liquid and keeps the native cursor (the native cursor itself is not drawn in headless captures); the Guided Tour. DPR 1, native pixels.", rows: states.map((s) => ({ label: s.label, cells: s.cells })) }));
    // temporal strip (Workload Microscope, all above the fold): ordinary motion → a curved flick → the connected goo → beads
    // breaking off → slowing and rejoining → onto a toolbar switch (hover growth) → onto the tile canvas (native crosshair)
    await P.go("workload"); await P.ev("window.scrollTo(0, 0)"); await sleep(300);
    const btn = await P.center("#wm-metric button"), cvs = [600, 640];
    const segs = [{ dx: 1, dy: 0, v: 700, ms: 300, ramp: 80 }, { dx: 0.5817, dy: -0.8134, v: 3200, ms: 260, ramp: 25, turn: 1.9 }];
    const nT = await P.ev(`__pv.run(${JSON.stringify(segs)}, 1650, 250, 46)`);
    const frames = [];
    const crop = (sn) => around(sn, 640, 360);
    for (let f = 2; f <= nT; f += 4) { const sn = await P.ev(`__pv.stepTo(${f})`); await P.frames(1); frames.push({ sn, png: await P.shot(...crop(sn)), label: `${(f * 1000 / 120).toFixed(0)} ms` }); }
    const glideTo = async (tx, ty, nn, label, every) => { for (let i = 1; i <= nn; i++) { const sn = await P.ev(`(() => { const s = __pv.snap(), k = ${1 / nn} / Math.max(1e-6, 1 - ${(i - 1) / nn}); __pv.feed(s.x + (${tx} - s.x) * k, s.y + (${ty} - s.y) * k); return __pv.snap(); })()`);
      if (i % every === 0 || i === nn) { await P.frames(1); frames.push({ sn, png: await P.shot(...crop(sn)), label }); } } };
    await glideTo(btn[0], btn[1], 140, "onto a switch (ordinary speed)", 14);
    for (let i = 0; i < 2; i++) { await P.ev("__pv.hold(1000 / 120 * 6)"); await P.frames(1); const sn = await P.ev("__pv.snap()"); frames.push({ sn, png: await P.shot(...crop(sn)), label: "on the switch" }); }
    await glideTo(cvs[0], cvs[1], 60, "onto the tile canvas", 10);
    const tRows = []; for (let k = 0; k < frames.length; k += 4) tRows.push({ label: frames.slice(k, k + 4).map((f) => `${f.label}${f.sn.ignored ? " · liquid hidden (native crosshair)" : f.sn.interactive ? " · hover growth" : f.sn.tail ? ` · goo ${f.sn.L.toFixed(0)} px` : ""}${f.sn.beads.length ? ` · ${f.sn.beads.length} beads` : ""}`).join(" | "), cells: frames.slice(k, k + 4).map((f) => f.png) });
    keep("10-temporal-strip.png", await labelledSheet(B, { title: "Temporal QA in the real Observatory (Workload Microscope): ordinary motion, a curved flick, the connected goo, beads breaking off, slowing and rejoining, hover growth on a switch, the liquid giving way to the native crosshair on the tile canvas", note: "Frame-exact 120 Hz through the production runtime (every fourth frame of the gesture; the glides at ordinary speed, every tenth to fourteenth frame); 640×360 crops around the cursor, DPR 1, native pixels; left to right, then down.", rows: tRows }));
    try {
      const dir = mkdtempSync(join(tmpdir(), "lc-int-gif-")), list = frames.map((f, i) => { const p = join(dir, `f${String(i).padStart(4, "0")}.png`); writeFileSync(p, f.png); return [p, f.label]; });
      writeFileSync(join(dir, "list.json"), JSON.stringify(list));
      const py = `import json, sys\nfrom PIL import Image, ImageDraw\nitems = json.load(open(sys.argv[1])); ims = []\nfor p, t in items:\n    im = Image.open(p).convert("RGB"); d = ImageDraw.Draw(im); d.rectangle([0, 0, im.width, 22], fill=(255, 255, 255)); d.text((8, 5), t, fill=(27, 30, 33)); ims.append(im.quantize(colors=96))\nims[0].save(sys.argv[2], save_all=True, append_images=ims[1:], duration=60, loop=0, optimize=True)`;
      execFileSync("python", ["-c", py, join(dir, "list.json"), join(OUT, "10-temporal.gif")], { stdio: "pipe" }); files.push("10-temporal.gif"); rmSync(dir, { recursive: true, force: true });
    } catch (e) { console.log("GIF skipped: " + String(e.message).split("\n")[0]); }
    info.evidence = files;
    await P.close();
  } catch (err) { check("evidence", "the integration QA captures were written", false, String(err && err.message || err).split(String.fromCharCode(10))[0]); }
} finally {
  await B.close(); clearInterval(keepAlive);
}
check("console", "no console errors or warnings from the cursor on any page (the Observatory's own pre-existing willReadFrequently warning is listed separately)", consoleAll.length === 0, consoleAll.slice(0, 3).join(" | ") || "none");
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} integration checks passed${preexisting.size ? ` · pre-existing (not the cursor): ${[...preexisting].join(" | ")}` : ""}`);
if (EVIDENCE) writeFileSync(join(OUT, "check-results.json"), JSON.stringify({ when: new Date().toISOString(), passed, total: results.length, results, info, preexistingConsole: [...preexisting] }, null, 1) + "\n");
process.exit(passed === results.length ? 0 : 1);
