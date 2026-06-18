// The Overview index: each of its nine rows, clicked under the liquid cursor, still navigates to its section.
import { launch, sleep } from "./cdp.mjs";
const B = await launch(); let ok = 0; const rows = [];
try { const { targetId } = await B.send("Target.createTarget", { url: "about:blank" }), { sessionId } = await B.send("Target.attachToTarget", { targetId, flatten: true }), s = (m, p) => B.send(m, p, sessionId);
  await s("Runtime.enable"); await s("Page.enable"); await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (e) => (await s("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  for (let i = 0; i < 9; i++) {
    await s("Page.navigate", { url: `http://127.0.0.1:8315/assets/observatory/index.html?cursor=test&glass=target&hero=b&r=${i}#overview` }); for (let k = 0; k < 200; k++) { if (await ev("!!window.HeliosLiquidCursor?.test")) break; await sleep(50); } await sleep(800);
    const p = await ev(`(()=>{const a=document.querySelectorAll('#sec-overview .toc a')[${i}];a.scrollIntoView({block:'center'});const r=a.getBoundingClientRect();return [r.left+r.width*0.7,r.top+r.height/2,a.dataset.route];})()`); await sleep(300);
    for (let k = 0; k < 10; k++) { await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: p[0] - 100 + k * 10, y: p[1], button: "none", buttons: 0 }); await sleep(16); }
    await s("Input.dispatchMouseEvent", { type: "mousePressed", x: p[0], y: p[1], button: "left", buttons: 1, clickCount: 1 }); await s("Input.dispatchMouseEvent", { type: "mouseReleased", x: p[0], y: p[1], button: "left", buttons: 0, clickCount: 1 }); await sleep(700);
    const st = await ev(`({hash:location.hash,active:document.querySelector('.section.active').id,cursor:HeliosLiquidCursor.status().material.presentation})`);
    const pass = st.hash === "#" + p[2] && st.active === "sec-" + p[2]; if (pass) ok++; rows.push({ route: p[2], ...st, pass }); console.log(pass ? "PASS" : "FAIL", p[2], JSON.stringify(st));
  }
} finally { await B.close(); }
console.log(`${ok}/9 index links navigate under the liquid cursor`); if (ok !== 9) process.exitCode = 1;
