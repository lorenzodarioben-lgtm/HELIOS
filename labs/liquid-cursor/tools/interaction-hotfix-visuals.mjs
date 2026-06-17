// Interaction hotfix visual evidence: the committed runtime (HEAD, served by request interception) beside the working
// tree. (1) the performance summary's glass at its four values, settled: HEAD's approved source (the whole-page snapshot,
// retaken with the pointer resting on the card) against the hero composition the fix uses, with pixel statistics;
// (2) the strip entered straight from the sidebar while the pointer keeps moving; (3) a frame-exact flick through the
// sidebar's links, frozen mid-flick. Never loaded by the Observatory.
//   node labs/liquid-cursor/tools/interaction-hotfix-visuals.mjs [--dprs 1,2]
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { launch, sleep, decodePNG, labelledSheet } from "./cdp.mjs";

const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve("labs/liquid-cursor/evidence/interaction-hotfix"); mkdirSync(OUT, { recursive: true });
const ROOT = resolve(".").replace(/\\/g, "/");
const HEAD = execFileSync("git", ["-c", `safe.directory=${ROOT}`, "show", "HEAD:assets/observatory/liquid-cursor.js"], { maxBuffer: 1 << 26 }).toString("base64");
const B = await launch(), result = { summary: [], arrival: [], goo: [] };
function diff(a, b) { a = decodePNG(a.toString("base64")); b = decodePNG(b.toString("base64")); let pixels = 0, max = 0, total = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const p = a.px(x, y), q = b.px(x, y), d = Math.max(...p.map((v, i) => Math.abs(v - q[i]))); if (d) pixels++; max = Math.max(max, d); total += d; }
  return { pixels, share: +(pixels / (a.w * a.h)).toFixed(4), max, mean: +(total / (a.w * a.h)).toFixed(3) }; }
async function page(variant, dpr) {
  const { targetId } = await B.send("Target.createTarget", { url: "about:blank" }), { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true }), s = (m, p) => B.send(m, p, sessionId);
  const L = (m) => { if (m.sessionId === sessionId && m.method === "Fetch.requestPaused") s("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript" }], body: HEAD }); };
  B.listeners.add(L); await s("Runtime.enable"); await s("Page.enable"); await s("Network.enable"); await s("Network.setCacheDisabled", { cacheDisabled: true });
  if (variant === "head") await s("Fetch.enable", { patterns: [{ urlPattern: "*/liquid-cursor.js*" }] });
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: dpr, mobile: false });
  const ev = async (e) => { const r = await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await s("Page.navigate", { url: `http://127.0.0.1:8315/assets/observatory/index.html?cursor=test&glass=target&hero=b&v=${variant}${Math.random()}#overview` });
  for (let i = 0; i < 200; i++) { if (await ev('!!window.HeliosLiquidCursor?.test&&document.readyState==="complete"').catch(() => false)) break; await sleep(50); }
  await ev(`document.querySelector('.hero-count')?.dispatchEvent(new MouseEvent('mouseenter'));document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important;transition:none!important}</style>');1`); await sleep(900);
  const mv = (x, y) => s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  return { s, ev, mv, shot: async (x, y, w, h) => Buffer.from((await s("Page.captureScreenshot", { format: "png", clip: { x, y, width: w, height: h, scale: 1 } })).data, "base64"),
    close: async () => { B.listeners.delete(L); await B.send("Target.closeTarget", { targetId }); } };
}
const spotsJS = `(()=>{const f=[...document.querySelectorAll('#sec-overview .evidence li')];const sel=[['.fig','2.97×'],['.fig-m','2.45×'],['.fig-m','458/458'],['.fig-m','600.34 s']];
  return f.slice(0,4).map((li,i)=>{const r=li.querySelector(sel[i][0]).getBoundingClientRect();return [Math.round(r.left+Math.min(r.height*0.32,r.width*0.2)),Math.round(r.top+r.height*0.5),sel[i][1]];});})()`;
try {
  const sheetSummary = [], sheetArrival = [], sheetGoo = [];
  for (const dpr of arg("--dprs", "1,2").split(",").map(Number)) {
    // (1) settled summary glass: HEAD (its whole-page source retaken with the pointer resting there) vs the hero composition
    let P = await page("work", dpr); const spots = await P.ev(spotsJS); await P.close();
    for (const [x, y, name] of spots) {
      const settle = async (Q) => { for (let i = 0; i < 12; i++) { await Q.mv(x - 60 + i * 5, y); await sleep(16); } await Q.mv(x, y); await sleep(450); };
      const cells = [], states = [];
      for (const v of ["head", "work"]) {
        P = await page(v, dpr); await settle(P);
        if (v === "head") { await P.ev('HeliosLiquidCursor.test.ripple.cancel("evidence")'); await P.ev("HeliosLiquidCursor.test.ripple.capture()"); await sleep(200); await P.mv(x + 1, y); }
        await sleep(250); cells.push(await P.shot(x - 110, y - 110, 220, 220));
        states.push(await P.ev("(()=>{const m=HeliosLiquidCursor.status().material;return {presentation:m.presentation,refracting:m.refracting,refraction:m.refraction,glass:m.glass};})()")); await P.close();
      }
      const d = diff(cells[0], cells[1]); result.summary.push({ value: name, dpr, head: states[0], work: states[1], diff: d });
      sheetSummary.push({ label: `${name} DPR${dpr}`, cells });
      console.log("summary", name, "dpr", dpr, JSON.stringify(states), JSON.stringify(d));
    }
    // (2) the strip entered straight from the sidebar, the pointer moving throughout: crops as it goes
    for (const v of ["head", "work"]) {
      P = await page(v, dpr); const sp = await P.ev(spotsJS);
      await P.mv(60, 450); await sleep(60); await P.mv(2, 450); await sleep(60); await P.mv(40, 450); await sleep(650);
      for (let i = 0; i < 40; i++) { await P.mv(150 + 10 * Math.sin(i), 200 + (i % 20) * 22); await sleep(10); }
      const cells = []; let x = 300, y = sp[1][1];
      for (let i = 0; i < 22; i++) { x = 300 + i * 28; await P.mv(x, y - 120 + Math.min(120, i * 30)); await sleep(16); if (i === 6 || i === 11 || i === 16 || i === 21) { const st = await P.ev("HeliosLiquidCursor.status().material"); cells.push(await P.shot(x - 90, y - 90, 180, 180)); result.arrival.push({ variant: v, dpr, step: i, refraction: st.refraction, refracting: st.refracting, presentation: st.presentation }); } }
      sheetArrival.push({ label: `${v === "head" ? "HEAD" : "fixed"} DPR${dpr}`, cells }); await P.close();
    }
    // (3) a frame-exact flick through the sidebar's links, frozen mid-flick
    for (const v of ["head", "work"]) {
      P = await page(v, dpr);
      await P.mv(60, 450); await sleep(60); await P.mv(2, 450); await sleep(60); await P.mv(40, 450); await sleep(650);
      const g = await P.ev(`(()=>{const a=[...document.querySelectorAll('#nav .navpanel a')].map(e=>e.getBoundingClientRect());return {x:Math.round(a[0].left+a[0].width*0.45),y0:Math.round(a[0].top+4),y1:Math.round(a[a.length-1].bottom-4)};})()`);
      const cells = [];
      for (const stopAt of [16, 22, 28]) {
        const st = await P.ev(`(()=>{const T=HeliosLiquidCursor.test;T.setFrozen(true);T.resetBody();const t0=performance.now();T.feed(${g.x},${g.y0},t0);T.advance(200);
          for(let i=1;i<=${stopAt};i++){T.feed(${g.x},${g.y0}+i*32,t0+200+i*1000/120);T.advance(1000/120);}
          return {x:T.S.renderX,y:T.S.renderY,interactive:!!T.S.interactiveEl,tail:T.D.spine.on,L:+T.D.spine.L.toFixed(1),beads:T.D.slots.filter(d=>d.state!=="IDLE").length};})()`);
        await sleep(120); cells.push(await P.shot(Math.max(0, Math.round(st.x) - 150), Math.max(0, Math.round(st.y) - 230), 300, 300)); result.goo.push({ variant: v, dpr, frame: stopAt, ...st });
      }
      await P.ev("HeliosLiquidCursor.test.setFrozen(false);1");
      sheetGoo.push({ label: `${v === "head" ? "HEAD" : "fixed"} DPR${dpr}`, cells }); await P.close();
    }
  }
  writeFileSync(join(OUT, "visual-summary-glass.png"), await labelledSheet(B, { title: "Performance summary glass, settled: committed source vs the fix's hero composition", note: "Left: HEAD (whole-page source retaken with the pointer resting on the card). Right: the fix (live montage + hero overlay snapshot). Pixel statistics in visuals.json.", columns: ["HEAD", "fixed"], rows: sheetSummary }));
  writeFileSync(join(OUT, "visual-rainbow-arrival.png"), await labelledSheet(B, { title: "Entering the summary strip straight from the sidebar, the pointer moving throughout", note: "Crops at the 7th, 12th, 17th and 22nd pointer step after leaving the sidebar (states in visuals.json).", columns: ["step 7", "step 12", "step 17", "step 22"], rows: sheetArrival }));
  writeFileSync(join(OUT, "visual-goo-sidebar.png"), await labelledSheet(B, { title: "A frame-exact flick through the sidebar's links (3840 px/s), frozen at frames 16, 22 and 28", note: "HEAD: hovering a link disarms the goo. Fixed: the tail and beads follow the motion; hover still grows the body.", columns: ["frame 16", "frame 22", "frame 28"], rows: sheetGoo }));
  writeFileSync(join(OUT, "visuals.json"), JSON.stringify(result, null, 1));
} finally { await B.close(); }
