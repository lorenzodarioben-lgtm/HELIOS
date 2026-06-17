// Liquid cursor: the frame rate of the real Observatory while wheel-scrolling, with the production cursor and without it
// (?cursor=off), in a HEADED Edge window parked off-screen (occlusion throttling off), so the measurement goes through the
// real display compositor. The approved cursor is composited with mix-blend-mode: difference; blending a layer over
// content that moves costs compositor work during scrolling, and this tool records how much. Opt-in (it opens a
// browser window off-screen for about a minute).
//
//   node labs/liquid-cursor/tools/measure-scroll.mjs [--http URL] [--evidence] [--polish]
//
// --evidence writes labs/liquid-cursor/evidence/integration/scroll-performance.json.
// --polish measures the media-safe material instead, in one session: the normal interface (difference cursor) and the
// marked renders (the Overview hero, the Render Lab frame; the media-safe cursor), each with the cursor off, with the
// 7260ef8 cursor runtime (served from git: the difference material everywhere) and with this pass; with --evidence it
// writes labs/liquid-cursor/evidence/polish/scroll-performance.json.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve as presolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keep = setInterval(() => {}, 1000);
const argv = process.argv.slice(2), HTTP = (() => { const i = argv.indexOf("--http"); return i >= 0 ? argv[i + 1] : "http://127.0.0.1:8315/"; })(), rows = [];
const GLASS = argv.includes("--glass"), prepass = (() => { const i=argv.indexOf("--prepass"); return i>=0 ? argv[i+1] : ""; })();
const port = 9850 + Math.floor(Math.random() * 100), profile = mkdtempSync(join(tmpdir(), "lc-headed-"));
const proc = spawn(EDGE, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-position=-3200,0", "--window-size=1920,1080",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "about:blank"], { stdio: "ignore" });
let ver = null; for (let i = 0; i < 150 && !ver; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) ver = await r.json(); } catch {} if (!ver) await sleep(100); }
const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0, serveOld = null; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  // --polish: the 7260ef8 cursor runtime, served in place of the working tree's when asked
  if (d.method === "Fetch.requestPaused") send(serveOld ? "Fetch.fulfillRequest" : "Fetch.continueRequest", serveOld ? { requestId: d.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript" }, { name: "Cache-Control", value: "no-store" }], body: serveOld } : { requestId: d.params.requestId }, d.sessionId); };
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }).then((d) => d.result);
const fpsExpr = (ms) => `new Promise((r) => { let n = 0, worst = 0, last = 0; const t0 = performance.now(); (function f(t) { if (last) worst = Math.max(worst, t - last); last = t; n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else r([+(n / ((performance.now() - t0) / 1000)).toFixed(1), +worst.toFixed(1)]); })(); })`;
try {
  const targets = await send("Target.getTargets"); const page = targets.targetInfos.find((t) => t.type === "page");
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId), ev = async (e) => (await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  await s("Runtime.enable"); await s("Page.enable");
  const displayInfo = await ev("({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, vis: document.visibilityState })");
  console.log("display", JSON.stringify(displayInfo));
  if (argv.includes("--polish") || GLASS) {
    // [name, route, pointer x, y, wheel step px, variants]; small steps keep the pointer over the render while it scrolls
    const OLD = GLASS ? readFileSync(join(prepass,"liquid-cursor.js")).toString("base64") : execFileSync("git", ["-c", `safe.directory=${presolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replace(/\\/g, "/")}`, "show", "7260ef8:assets/observatory/liquid-cursor.js"], { cwd: presolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..") }).toString("base64");
    await s("Fetch.enable", { patterns: [{ urlPattern: "*/liquid-cursor.js*" }] }); await s("Network.enable"); await s("Network.setCacheDisabled", { cacheDisabled: true });
    const V = GLASS ? ["off", "pre-pass water", "Liquid Glass Balanced", "Liquid Glass Reference"] : ["off", "7260ef8", "this pass"];
    const scen = [["normal UI · Performance", "performance", 920, 610, 200, V], ["normal UI · Performance (small steps)", "performance", 920, 610, 15, V],
      ["media · Overview hero", "overview", 1300, 250, 15, V], ["media · Render Lab frame", "render", 690, 500, 15, V]];
    if (GLASS) scen.splice(1,1); // one normal-UI control, plus the two refractive surfaces
    let load = 0; // a unique query per load: a URL that differs only by its hash would not reload the page
    for (const [name, route, baseX, baseY, baseStep, variants] of scen) for (const rep of GLASS ? [1,2,3] : [1, 2, 3, 4, 5, 6]) for (const v of variants) {
      serveOld = v === "7260ef8" || v === "pre-pass water" ? OLD : null;
      const glassQuery = v === "Liquid Glass Reference" ? "glass=reference&" : GLASS ? "glass=balanced&" : "";
      await s("Page.navigate", { url: HTTP + "assets/observatory/index.html?" + (v === "off" ? "cursor=off&" : "") + glassQuery + "load=" + ++load + "#" + route }); await sleep(2200);
      let x=baseX,y=baseY,step=baseStep;
      if (GLASS && route === "render") {
        await ev("document.querySelector('#rl-img').scrollIntoView({block:'center',behavior:'instant'}),1"); await sleep(200);
        [x,y]=await ev("(() => { const r=document.querySelector('#rl-img').getBoundingClientRect(); return [Math.round(r.left+r.width/2),Math.round(r.top+Math.min(80,r.height/4))]; })()");
        step=5; // 100 px total: remain on the image at high-DPR/smaller viewports throughout the measured scroll
      }
      for (let i = 0; i < 6; i++) { await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: x - 20 + i * 4, y }); await sleep(16); } await sleep(300);
      const base = await ev(fpsExpr(800));
      const fp = ev(fpsExpr(1200)); for (let i = 0; i < 20; i++) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: step }); await sleep(40); }
      const r = await fp;
      const st = await ev("window.HeliosLiquidCursor.status ? (({ visible, material }) => ({ visible, material: material ? material.shown : 'difference (7260ef8)', media: material ? material.media : null }))(HeliosLiquidCursor.status()) : 'off'");
      rows.push({ scenario: name, rep, variant: v, step, stillFps: base[0], scrollFps: r[0], scrollWorstMs: r[1], after: st });
      console.log(name.padEnd(38), rep, v.padEnd(18), "still", base[0], "fps · wheel scroll", r[0], "fps, worst", r[1], "ms", JSON.stringify(st));
    }
    const med = (a) => { a = [...a].sort((m, n) => m - n); return a[Math.floor(a.length / 2)]; }, summary = {};
    for (const [name, , , , , variants] of scen) for (const v of variants) { const r = rows.filter((z) => z.scenario === name && z.variant === v); summary[`${name} · ${v}`] = { medianScrollFps: med(r.map((z) => z.scrollFps)), medianWorstMs: med(r.map((z) => z.scrollWorstMs)), medianStillFps: med(r.map((z) => z.stillFps)) }; }
    console.log(JSON.stringify(summary, null, 1));
    if (argv.includes("--evidence")) { const d = presolve(dirname(fileURLToPath(import.meta.url)), "..", "evidence", GLASS ? "glass" : "polish"); mkdirSync(d, { recursive: true }); writeFileSync(presolve(d, "scroll-performance.json"), JSON.stringify({ when: new Date().toISOString(), browser: ver.Browser, display: "headed Edge, off-screen window", viewport: displayInfo, method: GLASS ? "20 wheel steps 40 ms apart, 1.2 s frame measurement, 0.8 s still; three interleaved repetitions of cursor off, preserved pre-pass water, Liquid Glass Balanced and Reference; normal UI, hero and standalone render in one browser session" : "20 mouse-wheel steps (200 px, or 15 px to keep the pointer over a render) 40 ms apart, frame rate over 1.2 s, 6 repetitions with the three variants interleaved; 'still' is 0.8 s without input; '7260ef8' serves that commit's liquid-cursor.js from git (the difference material everywhere), 'this pass' is the working tree; all in one session, interleaved", summary, rows }, null, 1) + String.fromCharCode(10)); }
  } else
  for (const route of ["performance", "stress", "defence"]) for (const rep of [1, 2, 3]) for (const q of [`?cursor=off#${route}`, `#${route}`]) {
    await s("Page.navigate", { url: HTTP + "assets/observatory/index.html" + q }); await sleep(2200);
    for (let i = 0; i < 6; i++) { await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: 900 + i * 4, y: 600 }); await sleep(16); } await sleep(300);
    const base = await ev(fpsExpr(800));
    const fp = ev(fpsExpr(1200)); for (let i = 0; i < 20; i++) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: 920, y: 610, deltaX: 0, deltaY: 200 }); await sleep(40); }
    const r = await fp;
    const st = await ev("window.HeliosLiquidCursor.status ? (({ visible, draws }) => ({ visible, draws }))(HeliosLiquidCursor.status()) : 'off'");
    rows.push({ route, rep, cursor: !q.startsWith("?cursor=off"), stillFps: base[0], scrollFps: r[0], scrollWorstMs: r[1] });
    console.log(route.padEnd(12), rep, q.padEnd(26), "still", base[0], "fps · wheel scroll", r[0], "fps, worst", r[1], "ms", JSON.stringify(st));
  }
  if (!argv.includes("--polish") && !GLASS) {
  const med = (a) => { a = [...a].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }, summary = {};
  for (const route of ["performance", "stress", "defence"]) for (const cursor of [false, true]) { const r = rows.filter((x) => x.route === route && x.cursor === cursor); summary[`${route} · ${cursor ? "cursor on" : "cursor off"}`] = { medianScrollFps: med(r.map((x) => x.scrollFps)), medianWorstMs: med(r.map((x) => x.scrollWorstMs)), medianStillFps: med(r.map((x) => x.stillFps)) }; }
  console.log(JSON.stringify(summary, null, 1));
  if (argv.includes("--evidence")) { const d = presolve(dirname(fileURLToPath(import.meta.url)), "..", "evidence", "integration"); mkdirSync(d, { recursive: true }); writeFileSync(presolve(d, "scroll-performance.json"), JSON.stringify({ when: new Date().toISOString(), browser: ver.Browser, display: "headed Edge, off-screen window", viewport: displayInfo, method: "20 mouse-wheel steps of 200 px 40 ms apart, frame rate over 1.2 s; 'still' is 0.8 s without input", summary, rows }, null, 1) + String.fromCharCode(10)); }
  }
} finally { try { await send("Browser.close"); } catch {} ws.close(); await sleep(500); proc.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {} clearInterval(keep); }
