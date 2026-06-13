// Liquid cursor lab tooling: headless Edge over the Chrome DevTools Protocol, plus a minimal PNG decoder/encoder.
// Node 22+ only (built-in fetch and WebSocket); no npm packages. Shared by check-lab.mjs and diagnose-silhouette.mjs.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

export const EDGE = process.env.EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ minimal PNG decoder (8-bit RGB/RGBA, as CDP produces)
export function decodePNG(b64) {
  const buf = Buffer.from(b64, "base64"); let p = 8, w = 0, h = 0, ct = 0, bd = 0; const chunks = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; } else if (type === "IDAT") chunks.push(d); else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported PNG (bit depth ${bd}, colour type ${ct})`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(chunks)), out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return { w, h, px: (x, y) => { const o = (y * w + x) * bpp; return [out[o], out[o + 1], out[o + 2]]; } };
}

// ------------------------------------------------------------------ minimal PNG writer (RGB) and contact sheets
export function encodePNG(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type, "latin1"), data]); len.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// images side by side (one row); grid() stacks rows. Both pad with white.
export function sheet(imgs, gap = 8) { return encodePNG(...compose([imgs], gap)); }
export function grid(rows, gap = 8) { return encodePNG(...compose(rows, gap)); }
function compose(rows, gap) {
  const rowW = rows.map((r) => r.reduce((s, i) => s + i.w, 0) + gap * (r.length - 1)), rowH = rows.map((r) => Math.max(...r.map((i) => i.h)));
  const w = Math.max(...rowW), h = rowH.reduce((s, x) => s + x, 0) + gap * (rows.length - 1), rgb = Buffer.alloc(w * h * 3, 255);
  let oy = 0;
  rows.forEach((r, ri) => {
    let ox = 0;
    for (const im of r) { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const p = im.px(x, y), o = ((oy + y) * w + ox + x) * 3; rgb[o] = p[0]; rgb[o + 1] = p[1]; rgb[o + 2] = p[2]; } ox += im.w + gap; }
    oy += rowH[ri] + gap;
  });
  return [w, h, rgb];
}
// nearest-neighbour enlargement, for inspecting an outline pixel by pixel
export function magnify(img, k) { return { w: img.w * k, h: img.h * k, px: (x, y) => img.px(Math.floor(x / k), Math.floor(y / k)) }; }

// Labelled contact sheet: rows of PNG buffers (shown at their native pixel size) with row and column captions, rendered
// as HTML in a throwaway tab and captured whole. Returns a PNG buffer.
export async function labelledSheet(B, { title, note = "", columns = [], rows }) {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const img = (buf) => `<img src="data:image/png;base64,${Buffer.from(buf).toString("base64")}">`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px 18px; background: #fff; color: #1b1e21; font: 13px/1.35 "Segoe UI", sans-serif; width: max-content; }
    h1 { font: 600 15px/1.2 "Segoe UI", sans-serif; margin: 0 0 4px; } p { margin: 0 0 10px; color: #4c565f; max-width: 1400px; }
    table { border-collapse: collapse; } th { font: 600 11px/1.2 Consolas, monospace; color: #4c565f; text-align: left; padding: 4px 6px; vertical-align: bottom; }
    td { padding: 3px; vertical-align: middle; } td.l { font: 12px/1.3 "Segoe UI", sans-serif; padding-right: 10px; max-width: 190px; }
    img { display: block; image-rendering: pixelated; outline: 1px solid #e2e5e8; }</style>
    <h1>${esc(title)}</h1>${note ? `<p>${esc(note)}</p>` : ""}<table>
    ${columns.length ? `<tr><th></th>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>` : ""}
    ${rows.map((r) => `<tr><td class="l">${esc(r.label)}</td>${r.cells.map((c) => `<td>${img(c)}</td>`).join("")}</tr>`).join("")}</table>`;
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => B.send(m, p, sessionId);
  try {
    await s("Page.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
    const { frameTree } = await s("Page.getFrameTree");
    await s("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    await sleep(150);
    const { result } = await s("Runtime.evaluate", { expression: "Promise.all([...document.images].map((i) => i.decode())).then(() => [document.body.scrollWidth, document.body.scrollHeight])", returnByValue: true, awaitPromise: true });
    const [w, h] = result.value;
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(100);
    const shot = await s("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: true });
    return Buffer.from(shot.data, "base64");
  } finally { await B.send("Target.closeTarget", { targetId }); }
}

// ------------------------------------------------------------------ CDP plumbing
export async function launch(extra = []) {
  const port = 9300 + Math.floor(Math.random() * 500), profile = mkdtempSync(join(tmpdir(), "lc-edge-"));
  const proc = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--mute-audio", "--window-size=1920,1080", ...extra, "about:blank"], { stdio: "ignore" });
  let ver = null;
  for (let i = 0; i < 150 && !ver; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) ver = await r.json(); } catch { /* not up yet */ } if (!ver) await sleep(100); }
  if (!ver) throw new Error("Edge did not expose the DevTools endpoint");
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id) { const pr = pending.get(msg.id); pending.delete(msg.id); if (msg.error) pr.rej(new Error(`${pr.method}: ${msg.error.message}`)); else pr.res(msg.result); }
    else listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}, sessionId) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params, sessionId })); return new Promise((res, rej) => pending.set(i, { res, rej, method })); };
  return {
    version: ver.Browser, send, listeners,
    async close() { try { await send("Browser.close"); } catch { /* already gone */ } ws.close(); await sleep(400); proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked briefly */ } },
  };
}

export async function openPage(B, url, { dpr = 1, w = 1920, h = 1080, media = [], touch = false } = {}) {
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => B.send(m, p, sessionId);
  const logs = [];
  const l = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(msg.params.type)) logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    if (msg.method === "Runtime.exceptionThrown") logs.push(`exception: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) logs.push(`${msg.params.entry.level}: ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  };
  B.listeners.add(l);
  await s("Runtime.enable"); await s("Log.enable"); await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  if (media.length) await s("Emulation.setEmulatedMedia", { features: media });
  if (touch) await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s("Page.navigate", { url });
  const ev = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}
  in: ${expression.replace(/\s+/g, " ").slice(0, 400)}`);
    return r.result.value;
  };
  for (let i = 0; i < 100; i++) { if (await ev("document.readyState === 'complete' && !!window.liquidCursorLab").catch(() => false)) break; await sleep(50); }
  await ev("document.querySelector('.image img').decode().catch(() => 0)");
  const P = {
    s, ev, logs, targetId, sessionId,
    frames: (n = 2) => ev(`new Promise(r => { let k = ${n}; const f = () => (--k > 0 ? requestAnimationFrame(f) : r(1)); requestAnimationFrame(f); })`),
    state: () => ev(`(() => { const S = liquidCursorLab.engine.state, c = liquidCursorLab.engine.canvas; return {
      active: S.active, reasons: S.disabledReasons, suspended: S.suspended, visible: S.visible, canvasVisibility: c.style.visibility, blend: c.style.mixBlendMode,
      webgl2: S.webgl2, renderer: S.glRenderer, glError: S.glError, coalesced: S.coalescedSupported, secure: isSecureContext,
      raw: [S.rawX, S.rawY], render: [S.renderX, S.renderY], v: [S.vx, S.vy], speed: S.speed, dtMs: S.dtMs, avgFps: S.avgFps,
      frames: S.frames, draws: S.draws, clamped: S.clampedFrames, loop: S.loopRunning, samples: S.samples, moveEvents: S.moveEvents,
      dpr: S.dpr, effDpr: S.effDpr, backing: [S.backingW, S.backingH], cssRect: [c.getBoundingClientRect().width, c.getBoundingClientRect().height], vw: S.vw, vh: S.vh,
      fine: S.finePointer, reduced: S.reducedMotion, forced: S.forcedColors, visibility: S.visibility, docVisibility: document.visibilityState,
      interactive: S.interactiveEl ? (S.interactiveEl.id || S.interactiveEl.tagName.toLowerCase()) : null,
      ignore: S.ignoreEl ? (S.ignoreEl.className || S.ignoreEl.tagName.toLowerCase()) : null,
      htmlClass: document.documentElement.className, mode: S.mode, mask: S.mask, pointerType: S.pointerType }; })()`),
    center: (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`),
    move: (x, y, buttons = 0) => s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: buttons ? "left" : "none", buttons }),
    press: (x, y) => s("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }),
    release: (x, y) => s("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }),
    key: async (key, code, vk, text) => { await s("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text }); await s("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); },
    // clip is clamped into the viewport: a clip that starts off-page makes Chromium capture the wrong region
    shot: async (x, y, w2, h2) => { x = Math.max(0, Math.min(x, w - w2)); y = Math.max(0, Math.min(y, h - h2)); return (await s("Page.captureScreenshot", { format: "png", clip: { x, y, width: w2, height: h2, scale: 1 } })).data; },
    async close() { B.listeners.delete(l); await B.send("Target.closeTarget", { targetId }); },
  };
  return P;
}
