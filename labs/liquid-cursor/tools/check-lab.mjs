// Liquid cursor lab: automated checks (Phase 1 plumbing, the Phase 2 primary body and its fidelity correction, the
// Phase 3 single-droplet experiment in check-droplet.mjs, the Phase 4 droplet pool in check-pool.mjs and the Phase 4.5
// rich goo in check-rich.mjs)
// in headless Edge over the Chrome DevTools Protocol. Node 22+ only (built-in fetch and WebSocket); no npm packages.
// Nothing here touches the Observatory.
//
//   node labs/liquid-cursor/tools/check-lab.mjs [--out DIR] [--evidence] [--http URL] [--skip-http]
//
// --evidence writes the captures and results.json into labs/liquid-cursor/evidence/phase4-reference/ instead of a temp dir
// (the committed sets in evidence/phase1/, evidence/phase2/ and evidence/phase2-refine/ are historical and are not rewritten;
// the droplet frame strips, clips and stills come from droplet-evidence.mjs).
// --http defaults to the Observatory server (python scripts/observatory/serve.py) at 127.0.0.1:8315.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, openPage, decodePNG, sheet, grid, labelledSheet, sleep } from "./cdp.mjs";
import { installHelpers } from "./silhouette.mjs";
import { phase3Checks } from "./check-droplet.mjs";
import { phase4Checks } from "./check-pool.mjs";
import { richChecks } from "./check-rich.mjs";
import { wakeChecks } from "./check-wake.mjs";
import { spineChecks } from "./check-spine.mjs";

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const EVIDENCE = argv.includes("--evidence");
const OUT = EVIDENCE ? join(LAB, "evidence", "phase4-reference") : opt("--out", mkdtempSync(join(tmpdir(), "lc-check-")));
// Phase 1 regression captures are only kept in temp runs; the committed Phase 1 set stays in evidence/phase1/.
const p1save = (name, b64) => { if (!EVIDENCE) writeFileSync(join(OUT, name), Buffer.from(b64, "base64")); };
const save = (name, buf) => writeFileSync(join(OUT, name), typeof buf === "string" ? Buffer.from(buf, "base64") : buf);
const HTTP = opt("--http", "http://127.0.0.1:8315/labs/liquid-cursor/");
const FILE = pathToFileURL(join(LAB, "index.html")).href;
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ results
const results = [];
function check(group, name, pass, detail = "") {
  results.push({ group, name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${group}] ${name}${detail !== "" ? "  ·  " + detail : ""}`);
}
const info = {};

// Pixel-exact difference test: with the cursor off, capture the backdrop; with it on, every pixel well inside the disc
// must equal 255 - backdrop per channel (small tolerance for colour management / rounding).
async function inversionAt(P, x, y, label, saveAs) {
  const R = 40, INNER = 28;
  await P.move(x, y); await sleep(250); await P.frames(3);
  const on = decodePNG(await P.shot(x - R, y - R, 2 * R, 2 * R));
  if (saveAs) p1save(saveAs, await P.shot(Math.max(0, x - 200), Math.max(0, y - 130), 400, 260));
  await P.ev("liquidCursorLab.engine.setEnabled(false)"); await P.frames(2);
  const off = decodePNG(await P.shot(x - R, y - R, 2 * R, 2 * R));
  await P.ev("liquidCursorLab.engine.setEnabled(true)"); await P.frames(2);
  let n = 0, sumErr = 0, maxErr = 0, lumOff = 0, lumOn = 0, changed = 0;
  for (let j = 0; j < 2 * R; j++) for (let i = 0; i < 2 * R; i++) {
    if (Math.hypot(i + 0.5 - R, j + 0.5 - R) > INNER) continue;
    const a = off.px(i, j), b = on.px(i, j);
    for (let k = 0; k < 3; k++) { const e = Math.abs(b[k] - (255 - a[k])); sumErr += e; if (e > maxErr) maxErr = e; }
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) changed++;
    lumOff += 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; lumOn += 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]; n++;
  }
  const mean = sumErr / (3 * n);
  return { label, meanErr: +mean.toFixed(2), maxErr, lumOff: +(lumOff / n).toFixed(1), lumOn: +(lumOn / n).toFixed(1), changedPct: +(100 * changed / n).toFixed(1) };
}

// Antialiased-edge width along the horizontal diameter, in device pixels: pixels that are neither backdrop nor inverted.
async function edgeWidth(P, x, y, dpr) {
  await P.move(x, y); await sleep(250); await P.frames(3);
  const R = 50, img = decodePNG(await P.shot(x - R, y - R, 2 * R, 2 * R));
  const row = Math.round(R * dpr), bg = img.px(1, row), inv = [255 - bg[0], 255 - bg[1], 255 - bg[2]];
  let partial = 0;
  for (let i = 0; i < img.w; i++) {
    const p = img.px(i, row), dB = Math.max(...p.map((v, k) => Math.abs(v - bg[k]))), dI = Math.max(...p.map((v, k) => Math.abs(v - inv[k])));
    if (dB > 6 && dI > 6) partial++;
  }
  return partial / 2; // two edges per diameter
}

// ------------------------------------------------------------------ run
const SURFACES = [
  ["paper heading", ".paper .big", "surface-paper.png"], ["paper body text", ".paper .body", "surface-text.png"], ["dark heading", ".dark .big", "surface-dark.png"],
  ["dark body text", ".dark p", null], ["teal", ".swatch.teal", "surface-teal.png"], ["amber", ".swatch.amber", "surface-amber.png"],
  ["grey", ".swatch.grey", "surface-grey.png"], ["image", ".image img", "surface-image.png"],
];
const allLogs = [];

async function basicAndInversion(B, url, origin, save) {
  const P = await openPage(B, url + (url.includes("?") ? "&" : "?") + "mode=A");
  let st = await P.state();
  info[`${origin}.renderer`] = st.renderer; info[`${origin}.docVisibility`] = st.docVisibility;
  check(origin, "page loads and engine boots", st.webgl2 !== undefined, `document ${st.docVisibility}`);
  check(origin, "WebGL2 available", st.webgl2, st.renderer || st.glError);
  check(origin, "cursor active (fine pointer, no reduced motion, no forced colours)", st.active, st.reasons || "active");
  check(origin, "canvas uses mix-blend-mode: difference", st.blend === "difference", st.blend);
  check(origin, "secure context · getCoalescedEvents", st.secure && st.coalesced, `secure ${st.secure}, coalesced ${st.coalesced}`);
  for (const [label, sel, file] of SURFACES) {
    const [x, y] = await P.center(sel);
    const r = await inversionAt(P, x, y, label, save ? file : null);
    info[`${origin}.inversion.${label}`] = r;
    check(origin, `difference inverts ${label}`, r.meanErr <= 2 && r.maxErr <= 6, `mean err ${r.meanErr}, max ${r.maxErr}, luminance ${r.lumOff} → ${r.lumOn}`);
  }
  st = await P.state();
  check(origin, "disc visible over plain surface", st.visible && st.canvasVisibility === "visible", st.suspended || "visible");
  allLogs.push(...P.logs.map((m) => `${origin}: ${m}`));
  check(origin, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

async function interaction(B) {
  const P = await openPage(B, HTTP + "?mode=A"), G = "interaction";
  for (const [sel, expect] of [["#btn-real", "btn-real"], ["#link-real", "link-real"], ["summary", "summary"], ["#card", "card"]]) {
    const [x, y] = await P.center(sel); await P.move(x, y); await P.frames(2);
    const st = await P.state();
    check(G, `interactive detected: ${sel}`, st.interactive === expect && st.visible, `target ${st.interactive}, disc ${st.canvasVisibility}`);
  }
  { const [x, y] = await P.center("#btn-real"); await P.move(x, y); await sleep(250); await P.frames(3); p1save("hover-button-ring.png", await P.shot(x - 200, y - 130, 400, 260)); }
  for (const sel of ["button[disabled]", "#sel", "#rng", ".paper .body"]) {
    const [x, y] = await P.center(sel); await P.move(x, y); await P.frames(2);
    const st = await P.state();
    check(G, `not interactive: ${sel}`, st.interactive === null && !st.ignore, `target ${st.interactive}, ignore ${st.ignore}`);
  }
  const natives = [[".select-text", "text"], ["pre.code", "text"], ["#copy", "copy"], ["#wipe-handle", "ew-resize"], ["#precision", "crosshair"]];
  for (const [sel, cur] of natives) {
    const [x, y] = await P.center(sel); await P.move(x, y); await P.frames(2);
    const st = await P.state(), css = await P.ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).cursor`);
    check(G, `ignored + native cursor: ${sel}`, !!st.ignore && st.canvasVisibility === "hidden" && css === cur, `ignore ${st.ignore}, disc ${st.canvasVisibility}, cursor ${css}`);
  }
  { const css = await P.ev("[getComputedStyle(document.querySelector('.paper')).cursor, getComputedStyle(document.querySelector('#btn-real')).cursor]");
    check(G, "native cursor hidden outside ignore regions", css[0] === "none" && css[1] === "none", css.join(", ")); }
  { const [x, y] = await P.center("#copy"); await P.press(x, y); await P.release(x, y); } // ignored button still clicks natively
  // clicks reach the real controls
  { const [x, y] = await P.center("#btn-real"); await P.move(x, y); await P.press(x, y); await P.release(x, y); await P.frames(1);
    const t = await P.ev("document.querySelector('#inter-out').textContent"); check(G, "real button receives the click", t === "clicks: 1", t); }
  { const [x, y] = await P.center("#card"); await P.press(x, y); await P.release(x, y); const t = await P.ev("document.querySelector('#inter-out').textContent"); check(G, "data-cursor-interactive card receives the click", t === "clicks: 2", t); }
  { const [x, y] = await P.center("#link-real"); await P.press(x, y); await P.release(x, y); await P.frames(2); const h = await P.ev("location.hash"); check(G, "link navigates natively", h === "#s-e", h); }
  // wipe drag with pointer capture: the disc stays suspended for the whole drag, even outside the ignore region
  { const [x, y] = await P.center("#wipe-handle"), [tx, ty] = await P.center(".paper .body");
    await P.move(x, y); await P.press(x, y);
    for (let i = 1; i <= 10; i++) { await P.move(Math.round(x + (tx - x) * i / 10), Math.round(y + (ty - y) * i / 10), 1); await sleep(10); }
    await P.frames(2);
    const mid = await P.state(), split = await P.ev("document.querySelector('#wipe-handle').getAttribute('aria-valuenow')");
    await P.release(tx, ty); await P.move(tx + 5, ty + 5); await P.frames(2);
    const after = await P.state();
    check(G, "wipe drag works with pointer capture (handle's own preventDefault/stopPropagation)", split !== "50", `aria-valuenow ${split}`);
    check(G, "disc stays suspended during captured drag outside the region", !!mid.ignore && mid.canvasVisibility === "hidden", `ignore ${mid.ignore}, disc ${mid.canvasVisibility}, pointer at ${mid.raw.map(Math.round)}`);
    check(G, "engine still tracked the pointer during capture", Math.abs(mid.raw[0] - tx) < 2 && Math.abs(mid.raw[1] - ty) < 2, `raw ${mid.raw.map(Math.round)} vs ${tx},${ty}`);
    check(G, "disc returns after release", !after.ignore && after.canvasVisibility === "visible", `ignore ${after.ignore}, disc ${after.canvasVisibility}`); }
  { const [x, y] = await P.center("#precision"); await P.move(x, y); await P.frames(1); const t = await P.ev("document.querySelector('#prec-out').textContent"); check(G, "precision canvas receives hover", t.startsWith("cell"), t); }
  // leaving the window hides the disc
  { await P.move(900, 600); await P.frames(1); await P.s("Input.dispatchMouseEvent", { type: "mouseMoved", x: -10, y: -10 }); await P.frames(2); const st = await P.state();
    check(G, "pointer leaving the viewport hides the disc", st.canvasVisibility === "hidden", `suspended: ${st.suspended}`); }
  allLogs.push(...P.logs.map((m) => `interaction: ${m}`));
  check(G, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

async function motionAndFps(B) {
  const P = await openPage(B, HTTP + "?mode=A"), G = "follow/fps";
  await P.move(200, 300); await sleep(200);
  // record lag every frame during a sweep
  await P.ev(`window.__lag = []; (function rec() { const S = liquidCursorLab.engine.state; window.__lag.push([performance.now(), Math.hypot(S.rawX - S.renderX, S.rawY - S.renderY), S.speed]); if (!window.__stopLag) requestAnimationFrame(rec); })(); 1`);
  const t0 = Date.now();
  for (let i = 1; i <= 50; i++) await P.move(200 + i * 30, 300); // as fast as CDP round trips allow
  const sweepMs = Date.now() - t0, tEnd = await P.ev("performance.now()");
  await sleep(400);
  const lag = await P.ev("window.__stopLag = true; window.__lag");
  const during = lag.filter((r) => r[0] <= tEnd).map((r) => r[1]).sort((a, b) => a - b);
  const settle = lag.find((r) => r[0] > tEnd && r[1] < 0.5);
  const peakSpeed = Math.max(...lag.map((r) => r[2]));
  const med = during[Math.floor(during.length / 2)] ?? NaN, p95 = during[Math.floor(during.length * 0.95)] ?? NaN;
  info.follow = { sweepPx: 1500, sweepMs, nominalSpeed: Math.round(1500 / (sweepMs / 1000)), peakMeasuredSpeed: Math.round(peakSpeed), medianLagPx: +med.toFixed(2), p95LagPx: +p95.toFixed(2), settleMs: settle ? +(settle[0] - tEnd).toFixed(1) : null };
  // exponential following trails a pointer moving at v by about v / response; anything well above that is extra lag
  const bound = peakSpeed / (await P.ev("liquidCursorLab.CFG.follow.response")) * 1.25 + 2;
  info.follow.lagBoundPx = +bound.toFixed(1);
  check(G, "render lag during a fast sweep matches the configured response (no extra lag)", p95 <= bound, `sweep ${info.follow.nominalSpeed} px/s nominal (peak measured ${info.follow.peakMeasuredSpeed}), median lag ${info.follow.medianLagPx} px, p95 ${info.follow.p95LagPx} px, bound ${info.follow.lagBoundPx} px`);
  check(G, "render settles on the pointer within 150 ms of stopping", settle && settle[0] - tEnd < 150, settle ? `${info.follow.settleMs} ms to < 0.5 px` : "did not settle");
  const st1 = await P.state();
  check(G, "velocity decays to zero when the pointer stops", st1.speed === 0, `speed ${st1.speed.toFixed(1)} px/s`);
  // idle FPS and draw rate
  { const [hx, hy] = await P.center(".paper .body"); await P.move(hx, hy); }
  const m0 = await P.state(); await sleep(500); const m1 = await P.state();
  info.membrane = { drawsFirst500ms: m1.draws - m0.draws };
  let stillMs = null; const tStill = Date.now();
  for (let i = 0; i < 80; i++) { if (await P.ev("liquidCursorLab.engine.state.body.life === 0")) { stillMs = Date.now() - tStill + 500; break; } await sleep(100); }
  info.membrane.stillAfterMs = stillMs;
  check(G, "membrane stays alive briefly after motion (redraws)", m1.visible && m1.draws - m0.draws > 0, `${m1.draws - m0.draws} draws in 500 ms, disc ${m1.canvasVisibility}`);
  check(G, "membrane stills at rest (no idle pulsing)", stillMs !== null && stillMs < 6000, stillMs === null ? "still animating after 8.5 s" : `still ~${stillMs} ms after the pointer stopped`);
  const a = await P.state(); await sleep(2000); const b = await P.state();
  const fps = (b.frames - a.frames) / 2, draws = (b.draws - a.draws) / 2;
  const worst = await P.ev("Math.max(...liquidCursorLab.engine.state.frameTimes)");
  info.fps = { idleLoopFps: fps, avgFpsReadout: +b.avgFps.toFixed(1), lastDtMs: +b.dtMs.toFixed(2), worstFrameMsInWindow: +worst.toFixed(2), idleDrawsPerSec: draws };
  check(G, "rAF loop runs at display rate", fps > 50, `${fps} frames/s measured, readout ${info.fps.avgFpsReadout}, worst frame ${info.fps.worstFrameMsInWindow} ms`);
  check(G, "no GL draws while the pointer is still (dirty skip, visible body)", draws === 0 && b.visible, `${draws} draws/s idle, disc ${b.canvasVisibility}`);
  // moving draw rate
  const c = await P.state(); for (let i = 0; i < 60; i++) { await P.move(600 + (i % 2 ? 40 : 0) + i * 3, 560); await sleep(16); } const d = await P.state();
  info.fps.movingDrawsPerFrame = +((d.draws - c.draws) / Math.max(1, d.frames - c.frames)).toFixed(2);
  check(G, "draws at most once per frame while moving", info.fps.movingDrawsPerFrame <= 1, `${info.fps.movingDrawsPerFrame} draws/frame`);
  allLogs.push(...P.logs.map((m) => `follow: ${m}`));
  await P.close();
}

async function dprAndResize(B) {
  const G = "dpr/resize";
  for (const dpr of [1, 1.25, 1.5, 2, 3, 4]) {
    const P = await openPage(B, HTTP + "?mode=A", { dpr });
    const [x, y] = await P.center(".paper .body"); await P.move(x, y); await P.frames(3);
    const cap = await P.ev("LIQUID_CURSOR_CONFIG.canvas.maxDpr");
    const st = await P.state(), expectBacking = Math.round(420 * Math.min(dpr, cap));
    const edge = await edgeWidth(P, x, y, dpr);
    info[`dpr.${dpr}`] = { backing: st.backing, effDpr: st.effDpr, cssRect: st.cssRect, edgeDevicePx: edge, cap };
    if (dpr <= cap) check(G, `DPR ${dpr}: backing ${expectBacking}² at 420 CSS px, edge ≤ 2.5 device px`, st.backing[0] === expectBacking && st.cssRect[0] === 420 && edge <= 2.5, `backing ${st.backing.join("×")}, css ${st.cssRect.join("×")}, AA edge ${edge} px`);
    else check(G, `DPR ${dpr} (above the cap ${cap}): backing capped at ${expectBacking}², edge ≤ 1 CSS px`, st.backing[0] === expectBacking && st.cssRect[0] === 420 && edge / dpr <= 1, `backing ${st.backing.join("×")}, css ${st.cssRect.join("×")}, AA edge ${edge} device px = ${(edge / dpr).toFixed(2)} CSS px`);
    if (dpr === 2) p1save("edge-dpr2.png", await P.shot(x - 60, y - 60, 120, 120));
    allLogs.push(...P.logs.map((m) => `dpr ${dpr}: ${m}`));
    await P.close();
  }
  const P = await openPage(B, HTTP + "?mode=A");
  await P.s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false }); await sleep(200);
  { const [x, y] = await P.center(".swatch.grey"); await P.move(x, y); } await P.frames(3);
  const st = await P.state();
  check(G, "resize + DPR change at runtime updates viewport and backing", st.vw === 1280 && st.vh === 720 && st.backing[0] === 630 && st.canvasVisibility === "visible", `viewport ${st.vw}×${st.vh}, dpr ${st.dpr}, backing ${st.backing.join("×")}, disc ${st.canvasVisibility}`);
  allLogs.push(...P.logs.map((m) => `resize: ${m}`));
  await P.close();
}

async function visibility(B) {
  const G = "visibility";
  const P = await openPage(B, HTTP + "?mode=A");
  await P.move(700, 500); await sleep(300);
  const before = await P.state();
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
  await B.send("Target.activateTarget", { targetId }); await sleep(600);
  const hidden = await P.state(); await sleep(500); const hidden2 = await P.state();
  await B.send("Target.activateTarget", { targetId: P.targetId }); await B.send("Target.closeTarget", { targetId }); await sleep(400);
  const back = await P.state();
  info.visibility = { before: before.docVisibility, whileOtherTab: hidden.docVisibility, loopWhileHidden: hidden.loop, framesAdvancedWhileHidden: hidden2.frames - hidden.frames, after: back.docVisibility, loopAfter: back.loop, clampedDelta: back.clamped - before.clamped };
  if (hidden.docVisibility === "hidden") {
    check(G, "loop stops while hidden", !hidden.loop && hidden2.frames === hidden.frames, `loop ${hidden.loop}, frames advanced ${hidden2.frames - hidden.frames}`);
    check(G, "loop resumes without a clamped catch-up frame", back.loop && back.clamped === before.clamped, `loop ${back.loop}, clamped frames +${back.clamped - before.clamped}`);
  } else check(G, "headless tab switch hides the page (else verify in the browser pane)", false, `document stayed ${hidden.docVisibility}`);
  await P.close();
}

async function mediaPolicies(B) {
  const G = "accessibility";
  for (const [name, feature, value, reason] of [["reduced motion", "prefers-reduced-motion", "reduce", "reduced motion"], ["forced colours", "forced-colors", "active", "forced colours"]]) {
    for (const mode of ["A", "C"]) {
      const P = await openPage(B, HTTP + "?mode=" + mode, { media: [{ name: feature, value }] });
      const [x, y] = await P.center(".paper .body"); await P.move(x, y); await P.frames(3);
      const st = await P.state(), css = await P.ev("getComputedStyle(document.querySelector('.paper')).cursor");
      check(G, `${name} (mode ${mode}) disables the cursor at load`, !st.active && st.reasons.includes(reason) && st.canvasVisibility === "hidden" && !st.htmlClass.includes("lc-hide-native") && css === "auto", `reasons "${st.reasons}", disc ${st.canvasVisibility}, native cursor ${css}`);
      allLogs.push(...P.logs.map((m) => `${name}: ${m}`));
      await P.close();
    }
    const P = await openPage(B, HTTP + "?mode=A");
    const [x, y] = await P.center(".paper .body"); await P.move(x, y); await P.frames(2);
    const on = await P.state();
    await P.s("Emulation.setEmulatedMedia", { features: [{ name: feature, value }] }); await sleep(150);
    const off = await P.state();
    await P.s("Emulation.setEmulatedMedia", { features: [] }); await sleep(150);
    const again = await P.state();
    check(G, `${name} toggled live switches the cursor off and back on`, on.active && !off.active && again.active && off.canvasVisibility === "hidden" && !off.loop, `active ${on.active} → ${off.active} → ${again.active}, loop while off ${off.loop}`);
    if (name === "forced colours") p1save("forced-colours-off.png", await (async () => { await P.s("Emulation.setEmulatedMedia", { features: [{ name: feature, value }] }); await sleep(150); return P.shot(0, 0, 960, 540); })());
    await P.close();
  }
  // coarse pointer via touch emulation
  const P = await openPage(B, HTTP + "?mode=A", { touch: true });
  const st = await P.state(), mq = await P.ev("[matchMedia('(pointer: fine)').matches, matchMedia('(pointer: coarse)').matches, matchMedia('(any-pointer: fine)').matches]");
  info.coarse = { pointerFine: mq[0], pointerCoarse: mq[1], anyPointerFine: mq[2], active: st.active, reasons: st.reasons };
  check(G, "coarse pointer (touch emulation) disables the cursor", mq[1] && !st.active && st.reasons.includes("no fine pointer"), `(pointer: fine) ${mq[0]}, (pointer: coarse) ${mq[1]}, reasons "${st.reasons}"`);
  await P.close();
  // a touch on a fine-pointer device (hybrid laptop) suspends the disc
  const Q = await openPage(B, HTTP + "?mode=A");
  const [x, y] = await Q.center(".paper .body"); await Q.move(x, y); await Q.frames(2);
  await Q.s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x + 50, y }] }); await Q.s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await Q.frames(2);
  const t = await Q.state();
  check(G, "touch input on a fine-pointer device suspends the disc", t.canvasVisibility === "hidden" && t.suspended === "touch input", `pointerType ${t.pointerType}, suspended "${t.suspended}"`);
  await Q.move(x, y); await Q.frames(2); const t2 = await Q.state();
  check(G, "mouse movement brings it back", t2.canvasVisibility === "visible", `pointerType ${t2.pointerType}`);
  await Q.close();
}

async function keyboardAndModes(B) {
  const G = "keyboard/modes";
  const P = await openPage(B, HTTP);
  const seen = [];
  for (let i = 0; i < 24; i++) {
    await P.key("Tab", "Tab", 9);
    seen.push(await P.ev("(() => { const a = document.activeElement; return (a.id || a.name || a.tagName.toLowerCase()) + (a.matches(':focus-visible') && getComputedStyle(a).outlineStyle !== 'none' ? '' : '!nofocusring'); })()"));
  }
  info.tabOrder = seen;
  const inPage = seen.filter((t) => !t.startsWith("body")); // Tab past the last control leaves the document
  const need = ["compare", "preset", "mode", "mask", "opt-enabled", "opt-native", "btn-real", "link-real", "summary", "sel", "rng", "card", "copy", "wipe-handle", "precision"];
  check(G, "every lab control is reachable by Tab with a visible focus ring", need.every((n) => inPage.includes(n)) && !inPage.some((t) => t.includes("!nofocusring")), seen.join(" → "));
  await P.ev("document.querySelector('input[name=mode][value=A]').focus()");
  await P.key("ArrowRight", "ArrowRight", 39);
  const b = await P.ev("[liquidCursorLab.engine.state.mode, document.querySelector('#banner-b').hidden, document.querySelector('#banner-b').textContent, document.querySelector('#droplet-bar').hidden, liquidCursorLab.engine.dropletsOn()]");
  check(G, "arrow key selects Mode B; banner reads PHASE 4.5 — REFERENCE GOO; droplet strip shown, droplets on", b[0] === "B" && !b[1] && b[2].startsWith("PHASE 4.5 — REFERENCE GOO") && !b[3] && b[4] === true, `mode ${b[0]}, banner hidden ${b[1]}, strip hidden ${b[3]}, droplets ${b[4]}`);
  await P.key("ArrowRight", "ArrowRight", 39);
  const c = await P.ev("[liquidCursorLab.engine.state.mode, document.querySelector('#debug').hidden, document.querySelectorAll('#debug dd').length]");
  check(G, "arrow key selects Mode C; debug panel shown", c[0] === "C" && !c[1] && c[2] >= 20, `mode ${c[0]}, panel hidden ${c[1]}, ${c[2]} rows`);
  await P.ev("document.querySelector('#opt-enabled').focus()"); await P.key(" ", "Space", 32, " ");
  const e = await P.state();
  check(G, "Space on 'Custom cursor' switches the cursor off", !e.active && e.reasons.includes("switched off"), e.reasons);
  await P.key(" ", "Space", 32, " ");
  await P.ev("document.querySelector('input[name=mask][value=difference]').focus()"); await P.key("ArrowRight", "ArrowRight", 39);
  const m = await P.state();
  check(G, "arrow key switches to the plain diagnostic mask", m.mask === "plain" && m.blend === "normal", `mask ${m.mask}, blend ${m.blend}`);
  await P.ev("document.querySelector('#wipe-handle').focus()"); await P.key("ArrowRight", "ArrowRight", 39);
  const w = await P.ev("document.querySelector('#wipe-handle').getAttribute('aria-valuenow')");
  await P.ev("document.querySelector('#precision').focus()"); await P.key("ArrowDown", "ArrowDown", 40);
  const pc = await P.ev("document.querySelector('#prec-out').textContent");
  check(G, "wipe slider and precision canvas work from the keyboard", w === "55" && pc.startsWith("cell"), `wipe ${w}, ${pc}`);
  // evidence: plain mask over paper, then the debug view
  { const [x, y] = await P.center(".paper .body"); await P.move(x, y); await sleep(250); await P.frames(3); p1save("mask-plain.png", await P.shot(x - 200, y - 130, 400, 260)); }
  await P.ev("document.querySelector('input[name=mask][value=difference]').click()");
  { const [x, y] = await P.center(".swatch.teal"); await P.move(x - 60, y); await sleep(60);
    for (let i = 0; i < 6; i++) { await P.move(x - 60 + i * 12, y + i * 3); await sleep(12); } await P.frames(1);
    p1save("mode-c-debug-full.png", await P.shot(0, 0, 1920, 1080)); }
  allLogs.push(...P.logs.map((mm) => `keyboard: ${mm}`));
  check(G, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

async function fullPage(B) {
  const P = await openPage(B, HTTP + "?mode=A");
  const [x, y] = await P.center(".dark .big"); await P.move(x - 120, y + 10); await sleep(250); await P.frames(3);
  save("lab-1920x1080.png", await P.shot(0, 0, 1920, 1080));
  await P.close();
}

// ================================================================== Phase 2: primary body
const BODY = `(() => { const S = liquidCursorLab.engine.state, B = S.body; return { stretch: B.stretch, compression: B.compression,
  angle: Math.atan2(B.ay, B.ax) * 180 / Math.PI, def: B.def.x, amount: B.amount, sspeed: B.sspeed, hov: B.hov.x, hp: B.hoverProgress, clk: B.clk.x,
  noise: B.noiseAmp, life: B.life, state: B.state, presence: S.presence, visible: S.visible, speed: S.speed, gapResets: S.gapResets,
  render: [S.renderX, S.renderY], raw: [S.rawX, S.rawY], preset: S.preset }; })()`;
// per-frame recorder: [t, stretch, compression, axis angle, deformation, smoothed speed, hover scale, click scale, noise, raw speed, visible]
const REC_START = `window.__rec = []; window.__recOn = true; (function r() { const S = liquidCursorLab.engine.state, B = S.body;
  window.__rec.push([performance.now(), B.stretch, B.compression, Math.atan2(B.ay, B.ax) * 180 / Math.PI, B.def.x, B.sspeed, B.hov.x, B.clk.x, B.noiseAmp, S.speed, S.visible ? 1 : 0]);
  if (window.__recOn) requestAnimationFrame(r); })(); 1`;
const REC_STOP = "window.__recOn = false; window.__rec";
const R = { t: 0, s: 1, c: 2, ang: 3, def: 4, sspeed: 5, hov: 6, clk: 7, noise: 8, speed: 9, vis: 10 };
const axis180 = (a) => ((a % 180) + 180) % 180;
const angDiff = (a, b) => { let d = axis180(a) - axis180(b); if (d > 90) d -= 180; if (d < -90) d += 180; return d; }; // an axis is a line
const line = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n]);
async function sweep(P, pts) { for (const [x, y] of pts) await P.move(Math.round(x), Math.round(y)); return P.ev("performance.now()"); }
const maxOf = (rows, k) => rows.reduce((m, r) => Math.max(m, r[k]), -Infinity);
const minOf = (rows, k) => rows.reduce((m, r) => Math.min(m, r[k]), Infinity);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const f3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : v);
const rectOf = (P, sel) => P.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);

function axisSvg(rows, title) { // lab-only chart of the stretch axis angle and stretch during the sharp turn
  const W = 640, H = 240, t0 = rows[0][R.t], t1 = rows[rows.length - 1][R.t], X = (t) => 40 + (t - t0) / Math.max(1, t1 - t0) * (W - 60), Y = (a) => H - 30 - a / 180 * (H - 60);
  const pts = rows.map((r) => `${X(r[R.t]).toFixed(1)},${Y(axis180(r[R.ang])).toFixed(1)}`).join(" ");
  const sp = rows.map((r) => `${X(r[R.t]).toFixed(1)},${(H - 30 - (r[R.s] - 1) / 0.5 * (H - 60)).toFixed(1)}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Consolas, monospace" font-size="11"><rect width="${W}" height="${H}" fill="#f6f5f1"/>
<text x="40" y="18" fill="#1b1e21">${title}</text><line x1="40" x2="${W - 20}" y1="${Y(0)}" y2="${Y(0)}" stroke="#9aa2a9"/><line x1="40" x2="${W - 20}" y1="${Y(90)}" y2="${Y(90)}" stroke="#9aa2a9" stroke-dasharray="3 3"/>
<text x="4" y="${Y(0) + 4}" fill="#646e77">0°</text><text x="4" y="${Y(90) + 4}" fill="#646e77">90°</text>
<polyline points="${pts}" fill="none" stroke="#0f7479" stroke-width="1.8"/><polyline points="${sp}" fill="none" stroke="#c3821f" stroke-width="1.2"/>
<text x="40" y="${H - 8}" fill="#0f7479">axis angle (°)</text><text x="170" y="${H - 8}" fill="#c3821f">stretch − 1 (0 to 0.5 over the same height)</text><text x="${W - 120}" y="${H - 8}" fill="#646e77">time →</text></svg>\n`;
}

async function phase2Body(B) {
  const G = "body";
  const P = await openPage(B, HTTP + "?mode=A");
  const cfg = await P.ev("({ ...liquidCursorLab.engine.params })");
  info.phase2Params = cfg;
  const [hx, hy] = await P.center(".paper .body");
  await P.move(hx, hy); await sleep(700);
  let b = await P.ev(BODY);
  info.rest = { stretch: f3(b.stretch), membranePx: f3(b.noise), presence: b.presence };
  check(G, "A · rest: near-circle, faint membrane, fully present", Math.abs(b.stretch - 1) < 0.005 && b.noise > cfg.baseNoise * 0.9 && b.noise < cfg.baseNoise * 1.1 && b.presence === 1,
    `stretch ${b.stretch.toFixed(4)}, membrane ±${b.noise.toFixed(2)} px, presence ${b.presence}`);

  // B · slow
  await P.move(80, 300); await sleep(500);
  await P.ev(REC_START);
  for (let i = 1; i <= 40; i++) { await P.move(80 + i * 3, 300); await sleep(20); }
  let rec = await P.ev(REC_STOP);
  const slowPeak = maxOf(rec, R.s), slowSpeed = maxOf(rec, R.sspeed);
  info.slow = { peakStretch: f3(slowPeak), peakSmoothedSpeed: Math.round(slowSpeed), membranePx: f3(maxOf(rec, R.noise)) };
  check(G, "B · slow movement: almost circular", slowPeak < 1.06, `peak stretch ${slowPeak.toFixed(3)} at ≤ ${Math.round(slowSpeed)} px/s smoothed`);

  // C/G · fast horizontal sweep and stop (y = 300 crosses paper, dark, swatches and the render; nothing ignored)
  await P.move(100, 300); await sleep(500);
  await P.ev(REC_START);
  const tEnd = await sweep(P, line(100, 300, 1750, 300, 55));
  await sleep(500);
  rec = await P.ev(REC_STOP);
  const during = rec.filter((r) => r[R.t] <= tEnd), after = rec.filter((r) => r[R.t] > tEnd);
  const fastPeak = maxOf(during, R.s), fastSpeed = maxOf(during, R.sspeed), gam = cfg.compressionExponent;
  const compErr = rec.reduce((m, r) => Math.max(m, Math.abs(r[R.c] - Math.pow(r[R.s], -gam))), 0), areaAtPeak = fastPeak * Math.pow(fastPeak, -gam);
  const rec2 = after.find((r) => r[R.s] < 1.02), rec1 = after.find((r) => r[R.s] < 1.01), squash = minOf(after, R.s);
  const signs = after.map((r) => r[R.s] - 1).filter((d) => Math.abs(d) > 0.002).map(Math.sign);
  let flips = 0; for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) flips++;
  info.fast = { peakStretch: f3(fastPeak), peakSmoothedSpeed: Math.round(fastSpeed), peakMembranePx: f3(maxOf(during, R.noise)), recoveryTo2pctMs: rec2 ? Math.round(rec2[0] - tEnd) : null,
    recoveryTo1pctMs: rec1 ? Math.round(rec1[0] - tEnd) : null, minStretchAfterStop: f3(squash), signFlipsAfterStop: flips, compressionExponent: gam, maxCompressionError: compErr, areaFactorAtPeak: f3(areaAtPeak) };
  check(G, "C · fast sweep: clear directional stretch", fastPeak >= 1.3, `peak stretch ${fastPeak.toFixed(3)} at ${Math.round(fastSpeed)} px/s smoothed`);
  check(G, "speed increases stretch (fast well above slow)", fastPeak > slowPeak + 0.2, `slow ${slowPeak.toFixed(3)} → fast ${fastPeak.toFixed(3)}`);
  check(G, "stretch never exceeds the configured cap", fastPeak <= cfg.maxStretch + 1e-6, `peak ${fastPeak.toFixed(4)} ≤ cap ${cfg.maxStretch}`);
  check(G, "perpendicular compression follows the selected model (stretch^−exponent)", compErr < 1e-9 && gam > 0 && gam <= 1,
    `exponent ${gam}: max |compression − stretch^−${gam}| = ${compErr.toExponential(1)}; area × ${areaAtPeak.toFixed(3)} at peak stretch ${fastPeak.toFixed(3)}${gam === 1 ? " (exact)" : " (not area-preserving)"}`);
  check(G, "G · stop: back toward a circle in ~100–250 ms (accepted 60–300)", !!rec2 && rec2[0] - tEnd >= 60 && rec2[0] - tEnd <= 300,
    rec2 ? `within 2% after ${Math.round(rec2[0] - tEnd)} ms, within 1% after ${rec1 ? Math.round(rec1[0] - tEnd) : "–"} ms` : "never recovered");
  check(G, "stop: at most a tiny squash, no jelly bounce", squash > 0.95 && flips <= 2, `min stretch after stop ${squash.toFixed(3)}, ${flips} crossings of round`);

  // D · very fast
  await P.move(100, 300); await sleep(400);
  await P.ev(REC_START); await sweep(P, line(100, 300, 1800, 300, 19)); await sleep(100); rec = await P.ev(REC_STOP);
  const vfPeak = maxOf(rec, R.s), vfSpeed = maxOf(rec, R.sspeed), vfNoise = maxOf(rec, R.noise);
  info.veryFast = { peakStretch: f3(vfPeak), peakSmoothedSpeed: Math.round(vfSpeed), peakMembranePx: f3(vfNoise) };
  check(G, "D · very fast sweep: strong but bounded", vfPeak <= cfg.maxStretch + 1e-6 && vfPeak >= 1.38, `peak ${vfPeak.toFixed(3)} at ${Math.round(vfSpeed)} px/s smoothed, membrane ±${vfNoise.toFixed(2)} px`);
  check(G, "membrane amplitude within the refined guide (rest 0.2–0.4 px, very fast ≤ 1.4 px)", info.rest.membranePx >= 0.2 && info.rest.membranePx <= 0.4 && vfNoise <= 1.4,
    `rest ±${info.rest.membranePx} px, very fast ±${vfNoise.toFixed(2)} px`);

  // E · diagonals over the dark panel
  const rd = await rectOf(P, ".dark"), Ld = Math.min(rd[2], rd[3]) - 40;
  for (const [name, x0, y0, x1, y1, want] of [["↘", rd[0] + 20, rd[1] + 20, rd[0] + 20 + Ld, rd[1] + 20 + Ld, 45], ["↗", rd[0] + 20, rd[1] + 20 + Ld, rd[0] + 20 + Ld, rd[1] + 20, 135]]) {
    await P.move(x0, y0); await sleep(400);
    await P.ev(REC_START); await sweep(P, line(x0, y0, x1, y1, 20)); await sleep(20); rec = await P.ev(REC_STOP);
    const angs = rec.filter((r) => r[R.s] > 1.15).map((r) => axis180(r[R.ang])), med = angs.length ? median(angs) : NaN, err = Math.abs(angDiff(med, want));
    info[`diagonal${want}`] = { medianAxisDeg: f3(med), errorDeg: f3(err), frames: angs.length, peakStretch: f3(maxOf(rec, R.s)) };
    check(G, `E · diagonal ${name}: axis aligns with the motion (${want}°)`, angs.length >= 3 && err < 6, `median axis ${med.toFixed(1)}° over ${angs.length} stretched frames, error ${err.toFixed(1)}°`);
  }

  // F · sharp turn over the render: right, then down
  const ri = await rectOf(P, ".image"), tx0 = ri[0] + 40, ty0 = ri[1] + 50;
  await P.move(tx0, ty0); await sleep(400);
  await P.ev(REC_START);
  await sweep(P, line(tx0, ty0, tx0 + 330, ty0, 22)); const tTurn = await P.ev("performance.now()");
  await sweep(P, line(tx0 + 330, ty0, tx0 + 330, ty0 + 250, 17)); await sleep(30);
  rec = await P.ev(REC_STOP);
  const moving = rec.filter((r) => r[R.s] > 1.05);
  let maxStep = 0, rev = 0, lastD = 0;
  for (let i = 1; i < moving.length; i++) { const d = angDiff(moving[i][R.ang], moving[i - 1][R.ang]); maxStep = Math.max(maxStep, Math.abs(d)); if (Math.abs(d) > 1.5) { if (lastD && Math.sign(d) !== Math.sign(lastD)) rev++; lastD = d; } }
  const endAngs = rec.filter((r) => r[R.t] > tTurn + 120 && r[R.s] > 1.1).map((r) => axis180(r[R.ang])), endMed = endAngs.length ? median(endAngs) : NaN;
  const hit = rec.find((r) => r[R.t] > tTurn && Math.abs(angDiff(r[R.ang], 90)) < 10), turnMs = hit ? Math.round(hit[R.t] - tTurn) : null;
  info.sharpTurn = { maxAxisStepDegPerFrame: f3(maxStep), directionReversals: rev, finalAxisDeg: f3(endMed), msToWithin10deg: turnMs, trace: rec.map((r) => [Math.round(r[R.t] - rec[0][R.t]), f3(axis180(r[R.ang])), f3(r[R.s])]) };
  save("sharp-turn-axis.svg", Buffer.from(axisSvg(rec, "Sharp turn (right, then down): stretch axis and stretch per frame")));
  check(G, "F · sharp turn: axis turns smoothly the short way, no jitter", maxStep <= 25 && rev <= 1 && Math.abs(angDiff(endMed, 90)) < 8,
    `max ${maxStep.toFixed(1)}°/frame, ${rev} reversals, final ${endMed.toFixed(1)}°, within 10° of the new direction after ${turnMs} ms`);

  // H · hover
  const [bx, by] = await P.center("#btn-real");
  await P.move(hx, hy); await sleep(400);
  await P.ev(REC_START); await P.move(bx, by); await sleep(450); rec = await P.ev(REC_STOP);
  b = await P.ev(BODY);
  const hs = cfg.hoverScale, hovPeak = maxOf(rec, R.hov), t95 = rec.find((r) => r[R.hov] >= 1 + 0.95 * (hs - 1));
  info.hover = { settledScale: f3(b.hov), peakScale: f3(hovPeak), msTo95pct: t95 ? Math.round(t95[R.t] - rec[0][R.t]) : null, membranePx: f3(b.noise), progress: f3(b.hp) };
  check(G, "H · hover: grows into the 1.20–1.30× range (configured 1.27×)", b.hov >= 1.2 && b.hov <= 1.3 && Math.abs(b.hov - hs) < 0.01, `settled ${b.hov.toFixed(3)}×`);
  check(G, "hover transition: fast, no giant overshoot", !!t95 && t95[R.t] - rec[0][R.t] < 260 && hovPeak <= hs + 0.03, `95% after ${info.hover.msTo95pct} ms, peak ${hovPeak.toFixed(3)}×`);
  check(G, "hover calms the membrane", b.hp > 0.95 && b.noise < cfg.baseNoise * 0.6, `membrane ±${b.noise.toFixed(2)} px (rest ±${cfg.baseNoise})`);
  await P.move(hx, hy); await sleep(450); b = await P.ev(BODY);
  check(G, "leaving the target returns to the normal radius", Math.abs(b.hov - 1) < 0.01, `scale ${b.hov.toFixed(3)}`);

  // I · click
  await P.move(bx, by); await sleep(450);
  const clicks0 = await P.ev("document.querySelector('#inter-out').textContent");
  await P.press(bx, by); await sleep(180); b = await P.ev(BODY);
  const pressed = b.clk;
  check(G, "I · pointer down compresses slightly", Math.abs(pressed - (1 - cfg.clickCompression)) < 0.015, `click scale ${pressed.toFixed(3)} (target ${(1 - cfg.clickCompression).toFixed(2)})`);
  await P.ev(REC_START); await P.release(bx, by); await sleep(450); rec = await P.ev(REC_STOP); b = await P.ev(BODY);
  const cPeak = maxOf(rec, R.clk), clicks1 = await P.ev("document.querySelector('#inter-out').textContent");
  info.click = { pressedScale: f3(pressed), releasePeak: f3(cPeak), settled: f3(b.clk), hoverAfter: f3(b.hov) };
  check(G, "release: one small elastic rebound, then the hover size", cPeak > 1.002 && cPeak < 1.04 && Math.abs(b.clk - 1) < 0.004 && Math.abs(b.hov - hs) < 0.01, `rebound peak ${cPeak.toFixed(3)}, settled ${b.clk.toFixed(4)}, hover ${b.hov.toFixed(3)}`);
  check(G, "the real button still receives the click", clicks1 !== clicks0, `${clicks0} → ${clicks1}`);

  // J · ignored region: hide on entry, no smear or spike on the way out
  await P.move(hx, hy); await sleep(300);
  const [px, py] = await P.center("pre.code");
  await sweep(P, line(hx, hy, px, py, 10)); await P.frames(2); b = await P.ev(BODY);
  check(G, "J · entering an ignored region hides the body at once", !b.visible, `visible ${b.visible}`);
  await sleep(300);
  const g0 = b.gapResets;
  await P.ev(REC_START); await P.move(hx, hy); await sleep(150); rec = await P.ev(REC_STOP); b = await P.ev(BODY);
  const vis = rec.filter((r) => r[R.vis]);
  check(G, "J · leaving it after a pause: no velocity spike, no stretch", b.visible && maxOf(vis, R.s) < 1.05 && maxOf(rec, R.speed) < 300 && b.gapResets > g0,
    `max stretch ${maxOf(vis, R.s).toFixed(3)}, max raw speed ${Math.round(maxOf(rec, R.speed))} px/s, gap resets +${b.gapResets - g0}`);
  // continuous exit: the body reappears round and centred, then deforms normally
  await sweep(P, line(hx, hy, px, py, 6)); await P.frames(2);
  await P.ev(REC_START); await sweep(P, line(px, py, px - 500, py - 250, 12)); await sleep(60); rec = await P.ev(REC_STOP);
  const firstVis = rec.find((r) => r[R.vis]);
  check(G, "J · leaving it in motion: reappears round, deformation stays bounded", !!firstVis && firstVis[R.s] < 1.05 && maxOf(rec, R.s) <= cfg.maxStretch + 1e-6,
    firstVis ? `first visible frame stretch ${firstVis[R.s].toFixed(3)}, peak ${maxOf(rec, R.s).toFixed(3)}` : "never visible");
  // leaving the window and re-entering elsewhere
  await P.s("Input.dispatchMouseEvent", { type: "mouseMoved", x: -10, y: -10 }); await sleep(300);
  await P.ev(REC_START); await P.move(1500, 300); await sleep(150); rec = await P.ev(REC_STOP);
  const visW = rec.filter((r) => r[R.vis]);
  check(G, "re-entering the window elsewhere: no velocity spike", visW.length > 0 && maxOf(visW, R.s) < 1.05 && maxOf(rec, R.speed) < 300, `max stretch ${maxOf(visW, R.s).toFixed(3)}, max raw speed ${Math.round(maxOf(rec, R.speed))} px/s`);

  // numeric hygiene
  const u = await P.ev("liquidCursorLab.engine.readUniforms()"), snap = await P.ev(BODY);
  const flat = Object.values(u).flat(), bad = flat.filter((v) => typeof v === "number" && !Number.isFinite(v)).length + Object.values(snap).flat().filter((v) => typeof v === "number" && !Number.isFinite(v)).length;
  check(G, "no NaN/Infinity in shader uniforms or telemetry", bad === 0 && flat.length > 20, `${flat.length} uniform values, ${bad} non-finite`);
  allLogs.push(...P.logs.map((m) => `body: ${m}`));
  check(G, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

async function phase2Timing(B) {
  const G = "frame-rate";
  const P = await openPage(B, HTTP + "?mode=A");
  const r = await P.ev(`(() => {
    const L = LiquidCursor, CFG = LIQUID_CURSOR_CONFIG, F = CFG.follow, P = liquidCursorLab.engine.params;
    function sim(V, hz) { // raw-velocity model identical to the engine: per-sample smoothing, then stale decay after the stop
      const B = L.createBodyState(), dt = 1 / hz, inp = { vx: 0, vy: 0, hover: false, pressed: false };
      let t = 0, vx = 0, since = 0, peak = 1, rec = null, stopT = 0.4;
      while (t < 1.5) {
        if (t < stopT) { vx += (V - vx) * (1 - Math.exp(-dt * 1000 / F.velocitySmoothingMs)); since = 0; }
        else { since += dt; if (since * 1000 > F.velocityStaleMs) vx *= Math.exp(-F.velocityDecay * dt); if (Math.abs(vx) < 0.5) vx = 0; }
        inp.vx = vx; L.stepBody(B, P, F.maxSubstep, inp, dt); t += dt;
        if (t < stopT) peak = Math.max(peak, B.stretch); else if (rec === null && B.stretch < 1.02) rec = t - stopT;
      }
      return { hz, peak, recMs: rec * 1000 };
    }
    return [60, 120, 144, 165].map((hz) => sim(2500, hz));
  })()`);
  info.frameRate = r.map((x) => ({ hz: x.hz, peakStretch: f3(x.peak), recoveryTo2pctMs: Math.round(x.recMs) }));
  const peaks = r.map((x) => x.peak), recs = r.map((x) => x.recMs);
  check(G, "same peak stretch at 60 / 120 / 144 / 165 Hz", Math.max(...peaks) - Math.min(...peaks) < 0.01, info.frameRate.map((x) => `${x.hz} Hz ${x.peakStretch}`).join(", "));
  check(G, "same recovery at 60 / 120 / 144 / 165 Hz, inside 100–250 ms", Math.max(...recs) - Math.min(...recs) < 30 && Math.min(...recs) >= 100 && Math.max(...recs) <= 250, info.frameRate.map((x) => `${x.hz} Hz ${x.recoveryTo2pctMs} ms`).join(", "));
  // regression (found at the start of Phase 3): the resting membrane must reach zero on the frame the membrane stills, or
  // one late draw lands after the body is reported still
  const late = await P.ev(`(() => { const L = LiquidCursor, B = L.createBodyState(), P = liquidCursorLab.engine.params, inp = { vx: 0, vy: 0, hover: false, pressed: false };
    for (let i = 0; i < 1200; i++) { L.stepBody(B, P, 1 / 240, inp, 1 / 120); if (B.life === 0) return [i, B.noiseAmp]; } return [-1, NaN]; })()`);
  check(G, "the resting membrane reaches zero on the same frame it stills (no late idle draw)", late[0] > 0 && late[1] === 0, `life 0 at frame ${late[0]}, amplitude then ${late[1]} px`);
  await P.close();
}

async function phase2Presets(B) {
  const G = "presets";
  const P = await openPage(B, HTTP + "?mode=A");
  await P.ev("localStorage.clear(), 1");
  const pick = (k) => P.ev(`(() => { const s = document.querySelector('#preset'); s.value = '${k}'; s.dispatchEvent(new Event('change')); return liquidCursorLab.engine.state.preset; })()`);
  const fastPeak = async () => { await P.move(100, 300); await sleep(350); await P.ev(REC_START); await sweep(P, line(100, 300, 1500, 300, 40)); await sleep(60); return maxOf(await P.ev(REC_STOP), R.s); };
  const [bx, by] = await P.center("#btn-real");
  await pick("phase1Disc");
  const p1 = await fastPeak(); await P.move(bx, by); await sleep(400); const h1 = (await P.ev(BODY)).hov;
  check(G, "Phase 1 disc preset reproduces the undeformed disc", p1 === 1 && Math.abs(h1 - 1) < 1e-6, `peak stretch ${p1}, hover scale ${h1}`);
  // the three comparison presets: header switch, keys 1 / 2 / 3, and the Phase 2 original kept value for value
  const sig = "(() => { const p = liquidCursorLab.engine.params; return [liquidCursorLab.engine.state.preset, p.maxStretch, p.membrane, p.compressionExponent, p.baseNoise, p.maxNoise, document.querySelector('input[name=compare]:checked')?.value || '']; })()";
  const cfgRef = await P.ev("({ ...LIQUID_CURSOR_CONFIG.body, ...LIQUID_CURSOR_CONFIG.surface })");
  const want = { phase1Disc: ["Phase 1 disc", 1, cfgRef.membrane, cfgRef.compressionExponent, 0, 0], phase2Original: ["Phase 2 original", 1.42, "harmonic", 1, 0.7, 2.2],
    santioniRefined: ["Santioni refined", 1.42, "field", cfgRef.compressionExponent, cfgRef.baseNoise, cfgRef.maxNoise] };
  const same = (a, k) => want[k].every((v, i) => a[i] === v) && a[6] === k;
  const viaRadio = {}, viaKey = {};
  for (const k of Object.keys(want)) viaRadio[k] = await P.ev(`document.querySelector('input[name=compare][value=${k}]').click(), ${sig}`);
  check(G, "compare switch selects Phase 1 disc, Phase 2 original and Santioni refined", Object.keys(want).every((k) => same(viaRadio[k], k)), Object.values(viaRadio).map((a) => `${a[0]}: stretch ${a[1]}, ${a[2]}, exponent ${a[3]}, noise ${a[4]}–${a[5]}`).join(" · "));
  await P.ev("document.activeElement && document.activeElement.blur(), 1");
  for (const [i, k] of Object.keys(want).entries()) { const d = String(i + 1); await P.key(d, "Digit" + d, 48 + i + 1, d); viaKey[k] = await P.ev(sig); }
  check(G, "keys 1, 2 and 3 select the same three presets", Object.keys(want).every((k) => same(viaKey[k], k)), Object.values(viaKey).map((a) => a[0]).join(" → "));
  await P.ev("document.querySelector('#preset').focus(), 1"); await P.key("1", "Digit1", 49, "1");
  const inSelect = await P.ev(sig); await P.ev("document.activeElement.blur(), 1");
  check(G, "keys are ignored while a select has focus (no accidental switch)", inSelect[0] === "Santioni refined", `preset after "1" in the select: ${inSelect[0]}`);
  // 2fff2cc defaults, spelled out: the Phase 2 original preset must stay this body whatever the new defaults are
  const ORIGINAL = { followResponse: 60, radius: 34, maxStretch: 1.42, stretchSpeed: 1300, stretchCurve: 1.6, compressionExponent: 1, velocitySmoothingMs: 28, stretchResponse: 38,
    recoveryResponse: 36, deformDamping: 0.6, axisResponse: 28, axisMinSpeed: 40, axisFullSpeed: 300, membrane: "harmonic", baseNoise: 0.7, maxNoise: 2.2, noiseCurve: 1.5,
    noiseFrequency: 4, noiseSpeed: 0.9, noiseSpeedGain: 2.5, idleFadeMs: 1400, stillNoise: 1, hoverScale: 1.27, hoverResponse: 32, hoverDamping: 0.7, hoverNoiseMultiplier: 0.45,
    hoverDeformMultiplier: 0.6, clickCompression: 0.1, clickResponse: 48, releaseDamping: 0.45, presenceResponse: 22, hoverRing: false };
  const orig = await P.ev("document.querySelector('input[name=compare][value=phase2Original]').click(), ({ ...liquidCursorLab.engine.params })");
  const diffs = Object.keys(ORIGINAL).filter((k) => orig[k] !== ORIGINAL[k]);
  check(G, "Phase 2 original preset holds every 2fff2cc tunable", diffs.length === 0, diffs.length ? diffs.map((k) => `${k}: ${orig[k]} ≠ ${ORIGINAL[k]}`).join(", ") : `${Object.keys(ORIGINAL).length} values match`);
  await pick("santioniRefined");
  const t = await P.ev("(() => { const i = document.querySelector('#tune-maxStretch'); i.value = '1.2'; i.dispatchEvent(new Event('input')); return [liquidCursorLab.engine.params.maxStretch, liquidCursorLab.engine.state.preset]; })()");
  const pT = await fastPeak();
  check(G, "a tuning slider changes the live cursor (max stretch 1.2)", t[0] === 1.2 && t[1] === "Current tuning" && pT <= 1.2 + 1e-6 && pT > 1.15, `param ${t[0]}, preset "${t[1]}", peak ${pT.toFixed(3)}`);
  await P.s("Page.navigate", { url: HTTP + "?mode=A&preset=current" }); await sleep(300);
  for (let i = 0; i < 100; i++) { if (await P.ev("document.readyState === 'complete' && !!window.liquidCursorLab").catch(() => false)) break; await sleep(50); }
  const kept = await P.ev("[liquidCursorLab.engine.params.maxStretch, liquidCursorLab.engine.state.preset]");
  check(G, "current tuning survives a reload (per-viewer localStorage)", kept[0] === 1.2 && kept[1] === "Current tuning", `max stretch ${kept[0]}, preset "${kept[1]}"`);
  for (const [q, label] of [["", "Santioni refined"], ["&preset=santioniClean", "Phase 2 original"]]) {
    await P.ev("localStorage.clear(), 1");
    await P.s("Page.navigate", { url: HTTP + "?mode=A" + q }); await sleep(300);
    for (let i = 0; i < 100; i++) { if (await P.ev("document.readyState === 'complete' && !!window.liquidCursorLab").catch(() => false)) break; await sleep(50); }
    const got = await P.ev("liquidCursorLab.engine.state.preset");
    check(G, q ? "the Phase 2 URL name (?preset=santioniClean) opens the Phase 2 original" : "Santioni refined is the default preset", got === label, `${q || "no ?preset"} → ${got}`);
  }
  // the body must fit the bounded canvas even at the panel's extremes
  await P.ev("liquidCursorLab.engine.setParams({ radius: 60, maxStretch: 1.8, hoverScale: 1.5, maxNoise: 6, stretchSpeed: 300 }), 1");
  await P.move(bx, by); await sleep(400); await sweep(P, line(bx, by, bx + 400, by - 250, 8));
  const u = await P.ev("(() => { const u = liquidCursorLab.engine.readUniforms(), e = liquidCursorLab.engine.state.effDpr; return [(u.uRadius * u.uStretch + u.uNoiseAmp) / e, liquidCursorLab.engine.state.radiusClamped]; })()");
  check(G, "extreme tuning is clamped inside the 420 px canvas", u[0] <= 210 - 6 + 1e-3, `body extent ${u[0].toFixed(1)} px of 204 available, clamped ${u[1]}`);
  await P.ev("localStorage.clear(), 1");
  allLogs.push(...P.logs.map((m) => `presets: ${m}`));
  check(G, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

async function phase2Perf(B) {
  const G = "performance";
  const out = {};
  for (const preset of ["phase1Disc", "phase2Original", "santioniRefined"]) {
    const P = await openPage(B, HTTP + `?mode=A&preset=${preset}`);
    await P.move(1220, 280); await sleep(500);
    const a = await P.state();
    for (let i = 0; i <= 240; i++) { const th = i / 240 * 4 * Math.PI; await P.move(Math.round(1100 + 120 * Math.cos(th)), Math.round(280 + 120 * Math.sin(th))); }
    const b = await P.state();
    const work = await P.ev("liquidCursorLab.engine.state.workMs"), worst = await P.ev("Math.max(...liquidCursorLab.engine.state.frameTimes)");
    // GPU-inclusive cost of one draw of the body mid-stretch (forced draws, then gl.finish); a lab measurement, not a frame
    const drawMs = await P.ev("(() => { const E = liquidCursorLab.engine; E.setFrozen(true); const ms = E.benchDraw(300); E.setFrozen(false); return ms; })()");
    await sleep(1000); const c = await P.state();
    for (let i = 0; i < 80; i++) { if (await P.ev("liquidCursorLab.engine.state.body.life === 0")) break; await sleep(100); }
    const d = await P.state(); await sleep(1000); const e = await P.state();
    out[preset] = { avgFps: +b.avgFps.toFixed(1), movingDrawsPerFrame: +((b.draws - a.draws) / Math.max(1, b.frames - a.frames)).toFixed(2), frameWorkMsEMA: +work.toFixed(4), drawMsGpuInclusive: +drawMs.toFixed(4),
      worstFrameMs: +worst.toFixed(2), drawsFirstSecondAfterStop: c.draws - b.draws, drawsPerSecondAtRest: e.draws - d.draws, visible: e.visible };
    allLogs.push(...P.logs.map((m) => `perf ${preset}: ${m}`));
    await P.close();
  }
  info.performance = out;
  const p1 = out.phase1Disc, po = out.phase2Original, p2 = out.santioniRefined, all = [p1, po, p2];
  const line3 = (k, u = "") => `Phase 1 disc ${p1[k]}${u} · Phase 2 original ${po[k]}${u} · Santioni refined ${p2[k]}${u}`;
  check(G, "Phase 2 frame callback stays cheap (< 1 ms CPU)", p2.frameWorkMsEMA < 1 && po.frameWorkMsEMA < 1, line3("frameWorkMsEMA", " ms") + " per frame (EMA)");
  check(G, "frame rate unchanged by the Phase 2 body", p2.avgFps >= 0.95 * p1.avgFps && po.avgFps >= 0.95 * p1.avgFps, `${line3("avgFps", " fps")}, worst frame ${p1.worstFrameMs} / ${po.worstFrameMs} / ${p2.worstFrameMs} ms`);
  check(G, "no redraws once the body and membrane are still (visible body)", all.every((x) => x.drawsPerSecondAtRest === 0 && x.visible), line3("drawsPerSecondAtRest", "/s"));
  check(G, "refined membrane draw stays cheap (GPU-inclusive < 1 ms per draw)", p2.drawMsGpuInclusive < 1, line3("drawMsGpuInclusive", " ms") + " per forced draw");
}

async function phase2Evidence(B) {
  const G = "evidence";
  const P = await openPage(B, HTTP + "?mode=A");
  const files = [];
  const keep = (name, data) => { save(name, data); files.push(name); };
  const centre = () => P.ev("[liquidCursorLab.engine.state.renderX, liquidCursorLab.engine.state.renderY]");
  const crop = async (w = 360, h = 240) => { const [x, y] = await centre(); return P.shot(Math.round(x - w / 2), Math.round(y - h / 2), w, h); };
  const freeze = (on) => P.ev(`liquidCursorLab.engine.setFrozen(${on}), 1`);
  const advance = (ms) => P.ev(`liquidCursorLab.engine.advance(${ms}), 1`);
  const settle = async (x, y, ms = 700) => { await P.move(x, y); await sleep(ms); };
  const [hx, hy] = await P.center(".paper .body"), [gx, gy] = await P.center(".paper .big");
  await settle(hx, hy); keep("rest.png", await crop());
  await settle(hx - 70, hy, 400); for (let i = 1; i <= 25; i++) { await P.move(hx - 70 + i * 3, hy); await sleep(20); }
  await freeze(true); await P.frames(1); keep("slow-move.png", await crop()); await freeze(false);
  // fast horizontal over the HELIOS heading, then the stop-recovery sequence from that exact state
  await settle(40, gy, 400); await sweep(P, line(40, gy, gx + 40, gy, 12)); await freeze(true); await P.frames(1);
  keep("fast-horizontal.png", await crop());
  const T = [0, 40, 80, 120, 160, 200, 250], seq = [], stretches = []; let prevT = 0;
  for (const t of T) { await advance(t - prevT); prevT = t; await P.frames(1); seq.push(decodePNG(await crop(180, 140))); stretches.push(f3((await P.ev(BODY)).stretch)); }
  keep("stop-recovery.png", sheet(seq)); info.stopRecoverySequence = { msAfterFreeze: T, stretch: stretches };
  await freeze(false);
  // paper body text, then the same frozen motion state rendered as the Phase 1 disc and the Phase 2 original
  await settle(40, hy, 400); await sweep(P, line(40, hy, hx + 20, hy, 12)); await freeze(true); await P.frames(1);
  const santB64 = await crop(300, 180); keep("paper.png", santB64);
  const threeWay = [];
  for (const k of ["phase1Disc", "phase2Original"]) {
    const vals = await P.ev(`LIQUID_CURSOR_CONFIG.lab.presets.${k}.values`);
    await P.ev(`liquidCursorLab.engine.resetParams(${JSON.stringify(vals)}), liquidCursorLab.engine.advance(0.01), 1`); await P.frames(1);
    threeWay.push(decodePNG(await crop(300, 180)));
  }
  keep("phase1-original-refined.png", sheet([...threeWay, decodePNG(santB64)]));
  await P.ev("liquidCursorLab.engine.resetParams(), 1"); await freeze(false);
  // diagonal over the paper heading and body
  await settle(70, 150, 400); await sweep(P, line(70, 150, 330, 410, 12)); await freeze(true); await P.frames(1); keep("fast-diagonal.png", await crop()); await freeze(false);
  // dark panel and the real render, mid-sweep
  const rd = await rectOf(P, ".dark"), ri = await rectOf(P, ".image");
  await settle(rd[0] + 10, rd[1] + rd[3] / 2, 400); await sweep(P, line(rd[0] + 10, rd[1] + rd[3] / 2, rd[0] + rd[2] / 2, rd[1] + rd[3] / 2, 10)); await freeze(true); await P.frames(1); keep("dark.png", await crop()); await freeze(false);
  await settle(ri[0] + 10, ri[1] + ri[3] * 0.45, 400); await sweep(P, line(ri[0] + 10, ri[1] + ri[3] * 0.45, ri[0] + ri[2] * 0.4, ri[1] + ri[3] * 0.45, 12)); await freeze(true); await P.frames(1); keep("image.png", await crop()); await freeze(false);
  // sharp turn, frozen mid-turn
  await settle(ri[0] + 40, ri[1] + 50, 400); await sweep(P, line(ri[0] + 40, ri[1] + 50, ri[0] + 370, ri[1] + 50, 22)); await sweep(P, line(ri[0] + 370, ri[1] + 50, ri[0] + 370, ri[1] + 130, 5));
  await freeze(true); await P.frames(1); keep("sharp-turn.png", await crop()); await freeze(false);
  // hover and click: settled hover | pressed | 40 ms after release (rebound)
  const [bx, by] = await P.center("#btn-real");
  await settle(bx, by, 600); const hovB64 = await crop(220, 150); keep("hover-button.png", await crop());
  await P.press(bx, by); await sleep(200); const down = decodePNG(await crop(220, 150));
  await P.release(bx, by); await freeze(true); await advance(40); await P.frames(1); const up = decodePNG(await crop(220, 150)); await freeze(false);
  keep("click-state.png", sheet([decodePNG(hovB64), down, up]));
  // Mode C, frozen in a diagonal flick over the dark panel
  await P.ev("document.querySelector('input[name=mode][value=C]').click(), 1");
  await settle(rd[0] + 20, rd[1] + 20, 400); await sweep(P, line(rd[0] + 20, rd[1] + 20, rd[0] + 240, rd[1] + 240, 11)); await freeze(true); await P.frames(2);
  await sleep(250); // let the readout refresh
  keep("debug-mode.png", await P.shot(0, 0, 1920, 1080)); await freeze(false);
  info.evidenceFiles = files.concat(["sharp-turn-axis.svg", "lab-1920x1080.png", "results.json"]);
  check(G, "Phase 2 lab evidence captured (13 captures + axis chart)", files.length === 13, files.join(", "));
  allLogs.push(...P.logs.map((m) => `evidence: ${m}`));
  check(G, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

// ================================================================== Phase 2 fidelity correction: silhouette and comparison
// Deterministic scripted trajectories (exact 120 Hz frames with synthetic mouse samples, tools/silhouette.mjs), so every
// preset sees the same motion, and measurements of the actual shader output (engine.readMask) at DPR 2.
const PRESET3 = [["phase1Disc", "Phase 1 disc"], ["phase2Original", "Phase 2 original"], ["santioniRefined", "Santioni refined"]];
const WHITE = [520, 870], DG = Math.SQRT1_2; // body centre over the blank white panel E
const SC = {
  rest: [`__lc.rest(${WHITE}, 700)`, "rest (0.7 s)"],
  ordinary: [`__lc.path([{ dx: 1, dy: 0, v: 800, ms: 350, ramp: 100 }], ${WHITE})`, "→ 800 px/s"],
  horizontal: [`__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], ${WHITE})`, "→ 2600 px/s"],
  diagonal: [`__lc.path([{ dx: ${DG}, dy: ${DG}, v: 2600, ms: 300, ramp: 120 }], ${WHITE})`, "↘ 2600 px/s"],
  turn: [`__lc.path([{ dx: 1, dy: 0, v: 2200, ms: 220, ramp: 120 }, { dx: 0, dy: 1, v: 2200, ms: 50 }], ${WHITE})`, "sharp turn → ↓ (+50 ms)"],
  stop40: [`(__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], ${WHITE}), __lc.hold(40))`, "40 ms after a stop"],
  stop120: [`(__lc.path([{ dx: 1, dy: 0, v: 2600, ms: 300, ramp: 120 }], ${WHITE}), __lc.hold(120))`, "120 ms after a stop"],
};
const usePreset = (P, k, extra = {}) => P.ev(`(() => { const s = document.querySelector('#preset'); s.value = '${k}'; s.dispatchEvent(new Event('change')); liquidCursorLab.engine.setParams(${JSON.stringify(extra)}); return 1; })()`);
const bodyCrop = async (P, w, h) => { const [x, y] = await P.ev("[liquidCursorLab.engine.state.renderX, liquidCursorLab.engine.state.renderY]"); return Buffer.from(await P.shot(Math.round(x - w / 2), Math.round(y - h / 2), w, h), "base64"); };

async function phase2Silhouette(B) {
  const G = "silhouette";
  const P = await openPage(B, HTTP + "?mode=A", { dpr: 2 });
  await P.ev(`(${installHelpers.toString()})(), __lc.begin()`);
  const M = {}, strip = {};
  for (const k of ["santioniRefined", "phase2Original"]) {
    await usePreset(P, k); M[k] = {};
    for (const [name, [script]] of Object.entries(SC)) { await P.ev(`${script}, 1`); M[k][name] = await P.ev("__lc.analyse()"); }
    // the resting membrane over its alive window, frame-to-frame change at rest, then once it has stilled
    await P.ev(`__lc.rest(${WHITE}, 0)`); strip[k] = []; let prev = 0;
    for (const t of [350, 700, 1050, 1350]) { await P.ev(`__lc.hold(${t - prev})`); prev = t; strip[k].push(await P.ev("__lc.analyse({ profile: true })")); }
    await P.ev("__lc.hold(1000 / 120)"); const nextFrame = await P.ev("__lc.analyse({ profile: true })");
    strip[k].frameStepCss = Math.max(...nextFrame.profile.map((v, i) => Math.abs(v - strip[k][3].profile[i])));
    await P.ev(`__lc.rest(${WHITE}, 3600)`); M[k].still = await P.ev("__lc.analyse()");
  }
  const R3 = M.santioniRefined, O3 = M.phase2Original, rs = strip.santioniRefined, os = strip.phase2Original;
  const motion = ["ordinary", "horizontal", "diagonal", "turn", "stop40", "stop120"];
  const topK3 = (m) => m.top.filter((t) => t.k >= 3)[0] || { k: 0, pct: 0, css: 0 };
  const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
  info.silhouette = { dpr: 2, refined: R3, original: O3, restStrip: { refined: rs.map((m) => ({ ...m, profile: undefined })), original: os.map((m) => ({ ...m, profile: undefined })) },
    restFrameStepCss: { refined: rs.frameStepCss, original: os.frameStepCss } };

  const restAll = [R3.rest, ...rs];
  const restMax = Math.max(...restAll.map((m) => m.maxResidualCss)), restAsp = Math.max(...restAll.map((m) => Math.abs(m.aspect.measured - 1)));
  check(G, "rest: near-circular outline (within 0.3 px of a circle, aspect within 1.2%)", restMax <= 0.3 && restAsp <= 0.012,
    `measured max deviation ${f(restMax, 3)} px, aspect error ${f(100 * restAsp)}% over 0.35–1.35 s (Phase 2 original ${f(O3.rest.maxResidualCss, 3)} px)`);
  const restPoly = Math.max(...restAll.map((m) => topK3(m).pct)), restCurv = Math.max(...restAll.map((m) => m.curvature.maxDev));
  check(G, "rest: no polygonal harmonics (no k ≥ 3 lobe pattern above 0.5% of the radius, curvature ripple ≤ 0.4)", restPoly < 0.5 && restCurv <= 0.4,
    `largest k ≥ 3 component ${f(restPoly)}% of radius, curvature ripple ${f(restCurv)} (Phase 2 original: k${topK3(O3.rest).k} ${f(topK3(O3.rest).pct)}%, ripple ${f(O3.rest.curvature.maxDev)})`);
  check(G, "rest: once the membrane stills the body is a true circle (≤ 0.06 px)", R3.still.maxResidualCss <= 0.06 && R3.still.ampCss === 0,
    `max deviation ${f(R3.still.maxResidualCss, 3)} px at 3.6 s, membrane ${R3.still.ampCss} px (Phase 2 original keeps ${f(O3.still.maxResidualCss, 3)} px frozen)`);
  const restArea = restAll.map((m) => m.areaCss), areaVar = (Math.max(...restArea) - Math.min(...restArea)) / Math.min(...restArea);
  check(G, "rest: the living membrane neither pulses nor jitters (area ±0.5%, ≤ 0.02 px per frame)", areaVar <= 0.005 && rs.frameStepCss <= 0.02,
    `area varies ${f(100 * areaVar)}% over the alive window, outline moves ${f(rs.frameStepCss, 4)} px per frame`);
  const mPoly = Math.max(...motion.map((n) => topK3(R3[n]).pct)), mCurv = Math.max(...motion.map((n) => R3[n].curvature.maxDev)), mCurvRms = Math.max(...motion.map((n) => R3[n].curvature.rmsDev));
  check(G, "motion: no polygonal perimeter pattern (k ≥ 3 below 1.2% of radius, curvature ripple ≤ 1.0)", mPoly < 1.2 && mCurv <= 1.0 && mCurvRms <= 0.35,
    `worst over ${motion.length} states: k ≥ 3 ${f(mPoly)}%, ripple max ${f(mCurv)} rms ${f(mCurvRms)} (Phase 2 original: ${f(Math.max(...motion.map((n) => topK3(O3[n]).pct)))}%, ${f(Math.max(...motion.map((n) => O3[n].curvature.maxDev)))})`);
  const bound = motion.every((n) => R3[n].maxResidualCss <= R3[n].ampCss + 0.06);
  check(G, "motion: smooth deformation (outline within the membrane amplitude of the ideal ellipse)", bound,
    motion.map((n) => `${n} ${f(R3[n].maxResidualCss)}/${f(R3[n].ampCss)} px`).join(", "));
  const oriErr = Math.abs(R3.diagonal.orientationDeg - 45), axErr = Math.abs(R3.diagonal.axisDeg - 45);
  check(G, "diagonal: silhouette orientation within 1.5° of 45° (mask moments)", oriErr < 1.5 && axErr < 0.5,
    `mask orientation ${f(R3.diagonal.orientationDeg)}°, stretch axis ${f(R3.diagonal.axisDeg)}°, stretch ${f(R3.diagonal.stretch, 3)}`);
  check(G, "no NaN/Infinity in any measured outline", [...Object.values(R3), ...Object.values(O3)].every((m) => m.nonFinite === 0), "all rays found a finite boundary");
  // compression model, membrane off: measured aspect and area against the model, for both presets
  const cmp = {};
  for (const k of ["santioniRefined", "phase2Original"]) {
    await usePreset(P, k, { baseNoise: 0, maxNoise: 0 }); await P.ev(`${SC.horizontal[0]}, 1`); const m = await P.ev("__lc.analyse()");
    const g = await P.ev("liquidCursorLab.engine.params.compressionExponent");
    cmp[k] = { exponent: g, stretch: m.stretch, aspect: m.aspect.measured, aspectModel: +Math.pow(m.stretch, 1 + g).toFixed(4), area: m.areaCss, areaModel: +(Math.PI * 34 * 34 * Math.pow(m.stretch, 1 - g)).toFixed(1), residual: m.maxResidualCss, edge: m.edgePartialPx };
  }
  info.silhouette.compression = cmp;
  const cr = cmp.santioniRefined, co = cmp.phase2Original, rel = (a, b) => Math.abs(a / b - 1);
  check(G, "compression matches the selected model: refined stretch^−exponent (aspect and area within 0.5%)", rel(cr.aspect, cr.aspectModel) < 0.005 && rel(cr.area, cr.areaModel) < 0.005,
    `exponent ${cr.exponent}: aspect ${cr.aspect} vs ${cr.aspectModel}, area ${cr.area} vs ${cr.areaModel} px² (× ${f(cr.area / (Math.PI * 34 * 34), 3)} of rest, not area-preserving)`);
  check(G, "compression matches the selected model: Phase 2 original 1/stretch (area preserved within 0.3%)", co.exponent === 1 && rel(co.aspect, co.aspectModel) < 0.005 && rel(co.area, Math.PI * 34 * 34) < 0.003,
    `aspect ${co.aspect} vs ${co.aspectModel}, area ${co.area} vs ${f(Math.PI * 34 * 34, 1)} px²`);
  check(G, "crisp antialiasing: ≤ 2 partially covered device px per edge, tips and flanks, SDF exact to 0.06 px", !!cr.edge && cr.edge.tip <= 2 && cr.edge.flank <= 2 && R3.rest.edgePartialPx.tip <= 2 && cr.residual <= 0.06 && co.residual <= 0.06,
    `stretched ${cr.edge ? `${cr.edge.tip} / ${cr.edge.flank}` : "–"} px, rest ${R3.rest.edgePartialPx.tip} / ${R3.rest.edgePartialPx.flank} px (DPR 2), noise-free outline error ${f(cr.residual, 3)} / ${f(co.residual, 3)} px`);
  // the same metrics must flag the body the user rejected, or they prove nothing
  const flagged = [topK3(O3.rest).pct >= 0.5, O3.still.maxResidualCss > 0.3, Math.max(...motion.map((n) => O3[n].curvature.maxDev)) > 1.0];
  check(G, "metric sensitivity: the same tests flag the Phase 2 original (rest harmonics, frozen lobes, motion ripple)", flagged.every(Boolean),
    `rest k${topK3(O3.rest).k} ${f(topK3(O3.rest).pct)}% · still ${f(O3.still.maxResidualCss, 3)} px · motion ripple ${f(Math.max(...motion.map((n) => O3[n].curvature.maxDev)))}`);
  allLogs.push(...P.logs.map((m) => `silhouette: ${m}`));
  check(G, "no console errors or warnings", P.logs.length === 0, P.logs.slice(0, 3).join(" | ") || "none");
  await P.close();
}

// Fair visual comparison: the three presets through identical trajectories, at DPR 1 and 2, as labelled native-size sheets.
async function phase2Compare(B) {
  const G = "compare", made = [], logs = [];
  for (const dpr of [1, 2]) {
    const P = await openPage(B, HTTP + "?mode=A", { dpr });
    await P.ev(`(${installHelpers.toString()})(), __lc.begin()`);
    const [bx, by] = await P.center("#btn-real");
    const rows = [], rec = [], T = [0, 40, 80, 120, 160, 200, 250];
    for (const [k, label] of PRESET3) {
      await usePreset(P, k); const cells = [];
      for (const name of ["rest", "ordinary", "horizontal", "diagonal", "turn"]) { await P.ev(`${SC[name][0]}, 1`); await P.frames(2); cells.push(await bodyCrop(P, 150, 110)); }
      await P.ev(`__lc.rest(${bx}, ${by}, 600)`); await P.frames(2); cells.push(await bodyCrop(P, 150, 110)); // hover over the real button
      rows.push({ label, cells });
      await P.ev(`${SC.horizontal[0]}, 1`); const seq = []; let prev = 0;
      for (const t of T) { await P.ev(`__lc.hold(${t - prev})`); prev = t; await P.frames(2); seq.push(await bodyCrop(P, 130, 100)); }
      rec.push({ label, cells: seq });
    }
    const cols = ["rest (0.7 s)", "→ 800 px/s", "→ 2600 px/s", "↘ 2600 px/s", "sharp turn → ↓ (+50 ms)", "hover (0.6 s)"];
    const note = `Identical scripted 120 Hz trajectories for each preset; headless Edge at DPR ${dpr}, difference mask; crops are native pixels. Motion states sit over the blank white panel, hover over the real button.`;
    save(`compare-dpr${dpr}.png`, await labelledSheet(B, { title: `Phase 1 disc · Phase 2 original · Santioni refined (DPR ${dpr})`, note, columns: cols, rows }));
    save(`recovery-dpr${dpr}.png`, await labelledSheet(B, { title: `Recovery after a 2600 px/s stop (DPR ${dpr})`, note: "The same stop for each preset, frozen and stepped in exact 120 Hz frames.", columns: T.map((t) => `+${t} ms`), rows: rec }));
    made.push(`compare-dpr${dpr}.png`, `recovery-dpr${dpr}.png`);
    logs.push(...P.logs.map((m) => `compare dpr ${dpr}: ${m}`));
    await P.close();
  }
  info.compareFiles = made;
  check(G, "three-preset comparison sheets captured (rest, ordinary, horizontal, diagonal, sharp turn, hover, recovery; DPR 1 and 2)", made.length === 4, made.join(", "));
  allLogs.push(...logs);
  check(G, "no console errors or warnings", logs.length === 0, logs.slice(0, 3).join(" | ") || "none");
}

const t0 = Date.now();
let B = await launch();
info.browser = B.version;
try {
  if (!argv.includes("--skip-http")) {
    await basicAndInversion(B, HTTP, "http", true);
    await interaction(B);
    await motionAndFps(B);
    await dprAndResize(B);
    await visibility(B);
    await mediaPolicies(B);
    await keyboardAndModes(B);
    await fullPage(B);
    await phase2Body(B);
    await phase2Timing(B);
    await phase2Presets(B);
    await phase2Perf(B);
    await phase2Silhouette(B);
    await phase2Compare(B);
    await phase3Checks(B, { check, info, HTTP, FILE, allLogs });
    await phase4Checks(B, { check, info, HTTP, FILE, allLogs });
    await richChecks(B, { check, info, HTTP, FILE, allLogs });
    await wakeChecks(B, { check, info, HTTP, FILE, allLogs });
    await spineChecks(B, { check, info, HTTP, FILE, allLogs });
    await phase2Evidence(B);
  }
  await basicAndInversion(B, FILE, "file", false);
} finally { await B.close(); }
// the Observatory's own capture scripts run Edge with --disable-gpu: record what the lab does there
B = await launch(["--disable-gpu"]);
try {
  const P = await openPage(B, FILE + "?mode=A");
  const st = await P.state();
  info.disableGpu = { webgl2: st.webgl2, renderer: st.renderer, glError: st.glError, active: st.active, reasons: st.reasons };
  if (st.webgl2) { const [x, y] = await P.center(".paper .body"); const r = await inversionAt(P, x, y, "paper body (--disable-gpu)"); info.disableGpu.inversion = r; }
  const banner = await P.ev("document.querySelector('#gl-fail').hidden ? '' : document.querySelector('#gl-fail').textContent");
  check("disable-gpu", "graceful under --disable-gpu (WebGL2 works or a clear diagnostic is shown)", st.webgl2 ? info.disableGpu.inversion.meanErr <= 2 : banner.includes("WebGL2 unavailable"), st.webgl2 ? `WebGL2 via ${st.renderer}` : banner);
  allLogs.push(...P.logs.map((m) => `disable-gpu: ${m}`));
  await P.close();
} finally { await B.close(); }

const failed = results.filter((r) => !r.pass);
const summary = { when: new Date().toISOString(), seconds: +((Date.now() - t0) / 1000).toFixed(1), browser: info.browser, passed: results.length - failed.length, total: results.length, results, info, consoleMessages: allLogs };
writeFileSync(join(OUT, "results.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\n${summary.passed}/${summary.total} checks passed in ${summary.seconds} s · ${info.browser} · output ${OUT}`);
process.exit(failed.length ? 1 : 0);
