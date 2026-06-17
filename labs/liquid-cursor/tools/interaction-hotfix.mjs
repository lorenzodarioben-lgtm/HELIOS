// Interaction hotfix lab: the three user reports (delayed summary rainbow, Goo lost over ordinary targets, choppy rapid
// sidebar hovering) reproduced in headed offscreen Edge with the real display compositor and native CDP pointer input.
// Variants run interleaved in one browser session: cursor off, the committed runtime (HEAD, served by request
// interception) and the working tree. Never loaded by the Observatory.
//
//   node labs/liquid-cursor/tools/interaction-hotfix.mjs --mode sidebar|rainbow|goo|cross [--variants off,head,work]
//        [--dprs 1,2] [--reps 2] [--out NAME]
// Needs the Observatory server on 127.0.0.1:8315. Results: labs/liquid-cursor/evidence/interaction-hotfix/NAME.json
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sleep, EDGE } from "./cdp.mjs";

const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MODE = arg("--mode", "sidebar"), VARIANTS = arg("--variants", "off,head,work").split(","), DPRS = arg("--dprs", "1").split(",").map(Number);
const REPS = +arg("--reps", "2"), NAME = arg("--out", MODE), OUT = resolve("labs/liquid-cursor/evidence/interaction-hotfix");
mkdirSync(OUT, { recursive: true });
const ROOT = resolve(".");
const HEAD_SRC = execFileSync("git", ["-c", `safe.directory=${ROOT.replace(/\\/g, "/")}`, "show", "HEAD:assets/observatory/liquid-cursor.js"], { maxBuffer: 1 << 26 });
const ALT = arg("--alt", "") ? readFileSync(resolve(arg("--alt"))) : null; // optional extra variant "alt"

// ---------------------------------------------------------------- browser (headed, offscreen, occlusion throttling off)
const port = 9400 + Math.floor(Math.random() * 300), profile = mkdtempSync(join(tmpdir(), "helios-hotfix-"));
const proc = spawn(EDGE, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-position=-3200,0", "--window-size=1440,980",
  "--disable-features=CalculateNativeWinOcclusion,BackForwardCache", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "about:blank"], { stdio: "ignore" });
let ver; for (let i = 0; i < 150 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { /* starting */ } if (!ver) await sleep(100); }
if (!ver) throw Error("no CDP endpoint");
const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0, override = null; const pending = new Map(), traceSinks = new Set();
const send = (method, params = {}, sessionId) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); return; }
  if (m.method === "Tracing.dataCollected" || m.method === "Tracing.tracingComplete") for (const f of traceSinks) f(m);
  if (m.method === "Fetch.requestPaused") send(override ? "Fetch.fulfillRequest" : "Fetch.continueRequest", override ? { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript" }], body: override } : { requestId: m.params.requestId }, m.sessionId);
};
const { targetInfos } = await send("Target.getTargets"), { sessionId } = await send("Target.attachToTarget", { targetId: targetInfos.find((t) => t.type === "page").targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

// ---------------------------------------------------------------- in-page instrumentation (attributed by registering script)
const preload = `(()=>{
const q={cb:{},mo:{},calls:{efp:0,efps:0,rect:0,css:0,range:0},long:[],loaf:[],frames:[]};window.__hf=q;
const origin=()=>{const s=new Error().stack||'';return s.includes('liquid-cursor.js')?'cursor':s.includes('app.js')?'app':'other';};
const rec=(k,ms)=>{const a=q.cb[k]||(q.cb[k]={n:0,ms:0,max:0});a.n++;a.ms+=ms;a.max=Math.max(a.max,ms);};
const add=EventTarget.prototype.addEventListener,rem=EventTarget.prototype.removeEventListener,wrapped=new WeakMap();
EventTarget.prototype.addEventListener=function(type,fn,opt){if(!fn)return add.call(this,type,fn,opt);let w=wrapped.get(fn);if(!w){const o=origin();w=function(e){const a=performance.now();try{return typeof fn==='function'?fn.call(this,e):fn.handleEvent(e);}finally{rec(o+':'+e.type,performance.now()-a);}};wrapped.set(fn,w);}return add.call(this,type,w,opt);};
EventTarget.prototype.removeEventListener=function(type,fn,opt){return rem.call(this,type,wrapped.get(fn)||fn,opt);};
const MO=window.MutationObserver;window.MutationObserver=class extends MO{constructor(cb){const o=origin();super((l,obs)=>{const a=performance.now();try{return cb(l,obs);}finally{const k=q.mo[o]||(q.mo[o]={n:0,records:0,ms:0,max:0});k.n++;k.records+=l.length;const d=performance.now()-a;k.ms+=d;k.max=Math.max(k.max,d);}});}};
const raf=window.requestAnimationFrame;window.__raf=raf;window.requestAnimationFrame=function(cb){const o=origin();return raf(t=>{const a=performance.now();try{cb(t);}finally{rec(o+':raf',performance.now()-a);}});};
const ric=window.requestIdleCallback;if(ric)window.requestIdleCallback=function(cb,opt){const o=origin();return ric(d=>{const a=performance.now();try{cb(d);}finally{rec(o+':idle',performance.now()-a);}},opt);};
const st=window.setTimeout;window.setTimeout=function(cb,ms,...r){if(typeof cb!=='function')return st(cb,ms,...r);const o=origin();return st(function(){const a=performance.now();try{cb.apply(this,arguments);}finally{rec(o+':timeout',performance.now()-a);}},ms,...r);};
const efp=Document.prototype.elementFromPoint,efps=Document.prototype.elementsFromPoint;Document.prototype.elementFromPoint=function(...a){q.calls.efp++;return efp.apply(this,a);};Document.prototype.elementsFromPoint=function(...a){q.calls.efps++;return efps.apply(this,a);};
const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){q.calls.rect++;return rect.call(this);};
const gcs=window.getComputedStyle;window.getComputedStyle=function(...a){q.calls.css++;return gcs(...a);};
const rr=Range.prototype.getClientRects;Range.prototype.getClientRects=function(){q.calls.range++;return rr.call(this);};
try{new PerformanceObserver(l=>{for(const e of l.getEntries())q.long.push([Math.round(e.startTime),Math.round(e.duration)]);}).observe({type:'longtask',buffered:true});}catch{}
try{new PerformanceObserver(l=>{for(const e of l.getEntries())q.loaf.push({at:Math.round(e.startTime),ms:Math.round(e.duration),block:Math.round(e.blockingDuration||0),style:Math.round(e.styleAndLayoutStart?e.startTime+e.duration-e.styleAndLayoutStart:0),scripts:(e.scripts||[]).map(s=>({src:(s.sourceURL||'').split('/').pop(),fn:s.sourceFunctionName,inv:s.invoker,ms:Math.round(s.duration),layout:Math.round(s.forcedStyleAndLayoutDuration||0)}))});}).observe({type:'long-animation-frame',buffered:true});}catch{}
window.__hfReset=()=>{q.cb={};q.mo={};for(const k in q.calls)q.calls[k]=0;q.long=[];q.loaf=[];q.frames=[];};
window.__hfClock=(on)=>{q.clock=on;if(!on)return;let last=0;const f=t=>{if(last)q.frames.push(t-last);last=t;if(q.clock)raf(f);};raf(f);};
})()`;
await s("Runtime.enable"); await s("Page.enable"); await s("Performance.enable", { timeDomain: "timeTicks" });
// the HTTP cache is off: a cached runtime would skip the interception and silently replace one variant with another
await s("Network.enable"); await s("Network.setCacheDisabled", { cacheDisabled: true });
await s("Fetch.enable", { patterns: [{ urlPattern: "*/liquid-cursor.js*" }] });
await s("Page.addScriptToEvaluateOnNewDocument", { source: preload });

// ---------------------------------------------------------------- helpers
const display = await ev("({dpr:devicePixelRatio,screen:[screen.width,screen.height]})");
const info = { browser: ver.Browser, mode: MODE, viewport: [1440, 900], display, method: "headed offscreen Edge, real compositor, CDP mouse events paced in real time, interleaved variants", rows: [] };
let loads = 0;
async function open(variant, dpr, route = "overview", extra = "") {
  override = variant === "head" ? HEAD_SRC.toString("base64") : variant === "alt" && ALT ? ALT.toString("base64") : null;
  await s("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: dpr, mobile: false });
  const q = variant === "off" ? "cursor=off" : "cursor=test";
  await s("Page.navigate", { url: `http://127.0.0.1:8315/assets/observatory/index.html?${q}&glass=target&hero=b&hf=${++loads}${extra}#${route}` });
  for (let i = 0; i < 200; i++) { if (await ev(`document.readyState==="complete"&&!!window.HeliosLiquidCursor&&(${variant === "off"}||!!HeliosLiquidCursor.status)`).catch(() => false)) break; await sleep(50); }
  await sleep(1200);
  if (arg("--css", "")) await ev(`document.head.insertAdjacentHTML("beforeend", ${JSON.stringify("<style>" + arg("--css") + "</style>")});1`); // (diagnostics only)
}
const move = (x, y) => s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
const click = async (x, y) => { await s("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }); await s("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }); };
const yieldIO = () => new Promise((r) => setImmediate(r));
// a pointer path sampled at 125 Hz in real time (a gaming-class mouse); fn(tSeconds) -> [x, y] or null to stop
async function drive(fn, hz = 125) {
  const t0 = performance.now(); let n = 0;
  for (;;) { const t = (performance.now() - t0) / 1000, p = fn(t); if (!p) break; await move(p[0], p[1]); n++;
    const next = t0 + n * 1000 / hz; while (performance.now() < next) await yieldIO(); }
  return n;
}
const metrics = async () => Object.fromEntries((await s("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
function pct(a, p) { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; }
function frameStats(fr) {
  const med = pct(fr, 0.5) || 16.7;
  return { frames: fr.length, p50: +pct(fr, 0.5).toFixed(2), p95: +pct(fr, 0.95).toFixed(2), p99: +pct(fr, 0.99).toFixed(2), max: +Math.max(0, ...fr).toFixed(1),
    dropped: fr.reduce((n, f) => n + Math.max(0, Math.round(f / med) - 1), 0), over25: fr.filter((f) => f > 25).length, over50: fr.filter((f) => f > 50).length };
}
const cursorStatus = () => ev("window.HeliosLiquidCursor&&HeliosLiquidCursor.status?(()=>{const s=HeliosLiquidCursor.status();return {ripple:{captures:s.ripple.captures,uploads:s.ripple.uploads,cancellations:s.ripple.cancellations,busy:s.ripple.busy,ready:s.ripple.ready,dirty:s.ripple.dirty,lastInvalidation:s.ripple.lastInvalidation},hero:s.material.heroOptic,draws:s.draws,mediaDraws:s.material.draws,frames:s.frames};})():null");
// ---------------------------------------------------------------- optional trace: thread busy time and compositor frame verdicts
const TRACE = args.includes("--trace");
async function traced(body) {
  const events = []; let done; const finished = new Promise((r) => { done = r; });
  const sink = (m) => { if (m.method === "Tracing.dataCollected") events.push(...m.params.value); else done(); };
  traceSinks.add(sink);
  await send("Tracing.start", { traceConfig: { recordMode: "recordAsMuchAsPossible", includedCategories: ["cc", "viz", "gpu", "benchmark", "toplevel", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing"] }, transferMode: "ReportEvents" });
  const result = await body();
  await send("Tracing.end"); await finished; traceSinks.delete(sink);
  const names = {}; for (const e of events) if (e.ph === "M" && e.name === "thread_name") names[e.pid + ":" + e.tid] = e.args.name;
  const spans = {};
  for (const e of events) if (e.ph === "X" && e.dur) { const n = names[e.pid + ":" + e.tid] || "?"; const k = /CrRendererMain/.test(n) ? "renderer" : /^Compositor$/.test(n) ? "compositor" : /VizCompositor/.test(n) ? "viz" : /CrGpuMain/.test(n) ? "gpu" : null; if (k) (spans[k] ||= []).push([e.ts, e.ts + e.dur]); }
  const busy = {}; for (const [k, a] of Object.entries(spans)) { a.sort((x, y) => x[0] - y[0]); let t = 0, s0 = -1, e0 = -1; for (const [b, c] of a) { if (b > e0) { if (e0 > s0) t += e0 - s0; s0 = b; e0 = c; } else e0 = Math.max(e0, c); } if (e0 > s0) t += e0 - s0; busy[k] = +(t / 1000).toFixed(1); }
  // self time by event name on the GPU and viz threads (where the cursor's compositing and WebGL work lands)
  const self = { gpu: {}, viz: {} }, byThread = {};
  for (const e of events) if (e.ph === "X" && e.dur) { const n = names[e.pid + ":" + e.tid] || ""; const k = /CrGpuMain/.test(n) ? "gpu" : /VizCompositor/.test(n) ? "viz" : null; if (k) (byThread[e.pid + ":" + e.tid + ":" + k] ||= []).push(e); }
  for (const [key, list] of Object.entries(byThread)) { const k = key.split(":")[2]; list.sort((a, b) => a.ts - b.ts || b.dur - a.dur); const stack = [];
    for (const e of list) { while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop(); const parent = stack[stack.length - 1]; if (parent) parent.child += e.dur; const rec = { e, end: e.ts + e.dur, child: 0 }; stack.push(rec); e.__rec = rec; }
    for (const e of list) { const v = (e.dur - e.__rec.child) / 1000; self[k][e.name] = (self[k][e.name] || 0) + v; } }
  for (const k of ["gpu", "viz"]) self[k] = Object.fromEntries(Object.entries(self[k]).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => [n, +v.toFixed(1)]));
  const verdict = {}; for (const e of events) if (e.name === "PipelineReporter" && e.ph === "b") { const st = e.args?.chrome_frame_reporter?.state || "?"; verdict[st] = (verdict[st] || 0) + 1; }
  return { result, trace: { busyMs: busy, frames: verdict, self, events: events.length } };
}
async function measured(label, body) {
  if (TRACE && /veryFast|bursts|pause|summary|index rapid titles|scroll into/.test(label)) { const { result, trace } = await traced(() => measured0(label, body)); result.trace = trace; return result; }
  return measured0(label, body);
}
async function measured0(label, body) {
  const m0 = await metrics(), c0 = await cursorStatus();
  await ev("__hfReset();__hfClock(true);1");
  const t0 = performance.now(); const events = await body(); const wall = performance.now() - t0;
  await sleep(250);
  const page = await ev("(()=>{__hfClock(false);const q=__hf;return {frames:q.frames,cb:q.cb,mo:q.mo,calls:q.calls,long:q.long,loaf:q.loaf};})()");
  const m1 = await metrics(), c1 = await cursorStatus();
  const d = (k) => +((m1[k] || 0) - (m0[k] || 0)).toFixed(4);
  const cb = Object.entries(page.cb).map(([k, v]) => ({ k, n: v.n, ms: +v.ms.toFixed(2), max: +v.max.toFixed(2) })).sort((a, b) => b.ms - a.ms);
  return { label, events, wallMs: Math.round(wall), frame: frameStats(page.frames),
    cdp: { recalcStyle: d("RecalcStyleCount"), recalcStyleMs: +(d("RecalcStyleDuration") * 1000).toFixed(1), layout: d("LayoutCount"), layoutMs: +(d("LayoutDuration") * 1000).toFixed(1), scriptMs: +(d("ScriptDuration") * 1000).toFixed(1), taskMs: +(d("TaskDuration") * 1000).toFixed(1) },
    callbacks: cb.slice(0, 14), cursorMs: +cb.filter((c) => c.k.startsWith("cursor:")).reduce((n, c) => n + c.ms, 0).toFixed(1), mutation: page.mo, calls: page.calls,
    longTasks: page.long, loaf: page.loaf.slice(0, 12),
    cursor: c0 && c1 ? { rippleCaptures: c1.ripple.captures - c0.ripple.captures, rippleUploads: c1.ripple.uploads - c0.ripple.uploads, rippleCancellations: c1.ripple.cancellations - c0.ripple.cancellations, heroCaptures: c1.hero.captures - c0.hero.captures, heroHits: c1.hero.cacheHits - c0.hero.cacheHits, draws: c1.draws - c0.draws, mediaDraws: c1.mediaDraws - c0.mediaDraws, lastInvalidation: c1.ripple.lastInvalidation } : null };
}

// ---------------------------------------------------------------- the sidebar workload (bug C)
async function navRows() { return ev(`(()=>{const a=[...document.querySelectorAll('#nav .navpanel a')].map(e=>e.getBoundingClientRect());return {x:Math.round(a[0].left+a[0].width*0.45),y0:Math.round(a[0].top+4),y1:Math.round(a[a.length-1].bottom-4),n:a.length};})()`); }
async function openSidebar() { await move(60, 450); await sleep(80); await move(2, 450); await sleep(80); await move(40, 450); await sleep(700); return navRows(); }
const sweep = (g, v, secs) => (t) => { if (t > secs) return null; const span = g.y1 - g.y0, d = (t * v) % (2 * span), y = d < span ? g.y0 + d : g.y1 - (d - span); return [g.x + 26 * Math.sin(t * 7), y]; };
const BURSTS = [[0.5, 5000], [0.25, 0], [0.4, 7000], [0.55, 0], [0.6, 3000], [0.2, 0], [0.35, 9000], [0.7, 0], [0.5, 4500], [0.3, 0], [0.45, 6000], [0.9, 0], [0.5, 5000]];
const bursts = (g) => { let y = g.y0, dir = 1, last = 0; const plan = []; let t = 0; for (const [d, v] of BURSTS) { plan.push([t, t + d, v]); t += d; }
  return (tt) => { const seg = plan.find((p) => tt >= p[0] && tt < p[1]); if (!seg) return null; const dt = tt - last; last = tt;
    if (seg[2]) { y += dir * seg[2] * dt; if (y > g.y1) { y = g.y1 - (y - g.y1); dir = -1; } if (y < g.y0) { y = g.y0 + (g.y0 - y); dir = 1; } }
    return [g.x + 20 * Math.sin(tt * 5), Math.round(y)]; }; };
// rapid passes separated by reading pauses long enough for idle-time source work to begin
const sweepPause = (g) => { const f = sweep(g, 6000, 1e9); return (t) => { if (t > 7) return null; const c = t % 1.75; return c < 0.55 ? f(c + Math.floor(t / 1.75) * 0.13) : f(0.55 + Math.floor(t / 1.75) * 0.13); }; };
async function sidebarRun(variant, dpr) {
  await open(variant, dpr, "overview");
  const out = [];
  let g = await openSidebar();
  for (const [name, v] of [["slow", 400], ["medium", 1500], ["fast", 4000], ["veryFast", 8000]]) out.push(await measured("sidebar " + name, () => drive(sweep(g, v, 2.5))));
  // a person: rapid passes and reversals separated by short, irregular pauses (where idle-time work gets scheduled)
  out.push(await measured("sidebar bursts", () => drive(bursts(g))));
  out.push(await measured("sidebar sweep+pause", () => drive(sweepPause(g))));
  // the active entry changes: navigate through the panel, reopen, sweep again (after visiting other sections)
  for (const id of ["workload", "render", "overview"]) {
    const p = await ev(`(()=>{const r=document.querySelector('#nav .navpanel a[data-id="${id}"]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
    await move(p[0], p[1]); await sleep(60); await click(p[0], p[1]); await sleep(900);
    g = await openSidebar();
    out.push(await measured(`sidebar fast after ${id}`, () => drive(sweep(g, 4000, 2))));
  }
  // back to the hero and the summary strip
  const sum = await ev(`(()=>{const r=document.querySelector('.evidence').getBoundingClientRect();return [r.left+40,r.top+r.height/2,r.right-40];})()`);
  out.push(await measured("return hero + summary", () => drive((t) => (t > 2 ? null : t < 0.6 ? [60 + t * 1200, 450] : [sum[0] + ((t - 0.6) * 900) % (sum[2] - sum[0]), sum[1] + 6 * Math.sin(t * 9)]))));
  return out;
}

// ---------------------------------------------------------------- the summary-strip rainbow (bug A)
// a per-frame record of what the liquid shows: [t, material, refraction drawn, refraction wanted, over the zone,
// over an interactive element, source kind (2 hero snapshot, 3 viewport, 1 render), ripple source ready]
const RECORDER = `(()=>{const T=HeliosLiquidCursor.test;window.__rb=[];window.__rbOn=true;const f=()=>{if(!__rbOn)return;const R=T.R,S=T.S,st=HeliosLiquidCursor.status();
  __rb.push([performance.now(),+S.mat.toFixed(3),+R.rf[0].toFixed(3),R.want,S.mediaEl&&S.mediaEl.matches('[data-cursor-media="zone"]')?1:0,S.interactiveEl?1:0,R.rf[22]>0?2:R.rf[0]>0&&R.el?1:R.rf[0]>0?3:0,st.ripple.ready?1:0,st.ripple.dirty?1:0,st.material.heroOptic.ok?1:0]);__raf(f);};__raf(f);return 1;})()`;
async function summaryGeometry() { return ev(`(()=>{const a=[...document.querySelectorAll('#sec-overview .evidence li a')].map(e=>e.getBoundingClientRect());return {x0:Math.round(a[0].left+30),x1:Math.round(a[a.length-1].right-40),y:Math.round(a[0].top+a[0].height*0.42),top:Math.round(a[0].top)};})()`); }
// move from a hero point into the strip and along it for `secs`, at a person's pace
const intoSummary = (from, g, secs) => (t) => { if (t > secs) return null; const k = Math.min(1, t / 0.35); if (k < 1) return [from[0] + (g.x0 - from[0]) * k, from[1] + (g.y - from[1]) * k];
  const span = g.x1 - g.x0, d = ((t - 0.35) * 650) % (2 * span); return [d < span ? g.x0 + d : g.x1 - (d - span), g.y + 10 * Math.sin(t * 6)]; };
async function entry(label, from, secs = 2.2) {
  const g = await summaryGeometry();
  await ev("__rb.length=0;1"); await drive(intoSummary(from, g, secs));
  const rec = await ev("__rb.slice()");
  const over = rec.findIndex((r) => r[4] && r[5]); if (over < 0) return { label, over: false };
  const t0 = rec[over][0], first = rec.slice(over).find((r) => r[2] > 0 && r[4] && r[5]);
  const tail = rec.slice(over).filter((r) => r[4] && r[5]);
  const kinds = {}; for (const r of tail) kinds[r[6]] = (kinds[r[6]] || 0) + 1;
  // disappearance after arrival: frames over the strip, after the first refracted frame, that draw no refraction
  const after = first ? tail.filter((r) => r[0] > first[0]) : [];
  return { label, arrivalMs: first ? Math.round(first[0] - t0) : null, refractedShare: +(tail.filter((r) => r[2] > 0).length / Math.max(1, tail.length)).toFixed(3),
    dropouts: after.filter((r) => r[2] === 0).length, frames: tail.length, kinds, glassShare: +(tail.filter((r) => r[1] === 1).length / Math.max(1, tail.length)).toFixed(3),
    sourceAtEntry: { rippleReady: rec[over][7], rippleDirty: rec[over][8], heroOk: rec[over][9] } };
}
async function rainbowRun(variant, dpr) {
  const out = [];
  await open(variant, dpr, "overview"); await ev(RECORDER);
  const hero = [700, 260];
  out.push(await entry("cold load", hero));
  for (let i = 0; i < 6; i++) { await drive((t) => (t > 0.45 ? null : [700 + 200 * Math.sin(t * 4), 300 - 120 * t])); out.push(await entry("warm re-entry " + (i + 1), [700, 250])); }
  for (let i = 0; i < 3; i++) { const g = await openSidebar(); await drive(sweep(g, 5000, 1)); await move(400, 450); await sleep(150); out.push(await entry("after sidebar " + (i + 1), [420, 420])); }
  for (let i = 0; i < 3; i++) { await s("Input.dispatchKeyEvent", { type: "keyDown", key: "2", code: "Digit2", text: "2" }); await s("Input.dispatchKeyEvent", { type: "keyUp", key: "2", code: "Digit2" }); await sleep(700);
    await s("Input.dispatchKeyEvent", { type: "keyDown", key: "1", code: "Digit1", text: "1" }); await s("Input.dispatchKeyEvent", { type: "keyUp", key: "1", code: "Digit1" }); await sleep(450); out.push(await entry("after navigation " + (i + 1), [700, 250])); }
  for (let i = 0; i < 3; i++) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 400, deltaX: 0, deltaY: 120 }); await sleep(300); await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 400, deltaX: 0, deltaY: -120 }); await sleep(250); out.push(await entry("after scroll " + (i + 1), [700, 250])); }
  await ev("__rbOn=false;1");
  return out;
}

// ---------------------------------------------------------------- Goo over ordinary targets (bug B)
// frame-exact: one 120 Hz flick trajectory (vertical passes with reversals, 1800-4200 px/s) fed through the test hooks,
// over the open sidebar's links and over a surface with nothing interactive under it; per frame the goo's state
const FLICK = `((x0, y0, y1) => { const pts = []; let t = 0, y = y0, dir = 1; const speeds = [2600, 4200, 1800, 3600, 3000];
  for (let k = 0; k < 5; k++) { const v = speeds[k]; for (let i = 0; i < 40; i++) { y += dir * v / 120; if (y > y1) { y = y1; dir = -1; } if (y < y0) { y = y0; dir = 1; } t += 1000 / 120; pts.push([x0 + 8 * Math.sin(t / 90), y, t]); } for (let i = 0; i < 12; i++) { t += 1000 / 120; pts.push([pts[pts.length - 1][0], y, t]); } }
  return pts; })`;
const GOO_RUN = `(async (pts) => { const T = HeliosLiquidCursor.test; T.setFrozen(true); T.resetBody(); const out = [];
  const t0 = performance.now(); T.feed(pts[0][0], pts[0][1], t0); T.advance(200);
  for (const [x, y, t] of pts) { T.feed(x, y, t0 + 200 + t); T.advance(1000 / 120); const D = T.D, B = T.B, S = T.S;
    out.push([+Math.hypot(S.vx, S.vy).toFixed(0), S.interactiveEl ? 1 : 0, D.spine.on ? 1 : 0, +D.spine.E.toFixed(4), +D.spine.L.toFixed(2), D.slots.filter((d) => d.state !== "IDLE").length, Math.round(D.trig.armedMs), +B.hoverProgress.toFixed(3), +B.radiusScale.toFixed(4)]); }
  T.setFrozen(false); return out; })`;
function gooSummary(rows) {
  const fast = rows.filter((r) => r[0] > 1500), on = (a) => a.filter((r) => r[2]).length;
  return { frames: rows.length, interactiveShare: +(rows.filter((r) => r[1]).length / rows.length).toFixed(3), fastFrames: fast.length, gooOnFast: on(fast), gooOnShare: +(on(fast) / Math.max(1, fast.length)).toFixed(3),
    maxTail: Math.max(0, ...rows.map((r) => r[4])), beadFrames: rows.filter((r) => r[5] > 0).length, maxBeads: Math.max(0, ...rows.map((r) => r[5])), armedResets: rows.filter((r, i) => i && r[6] === 0 && rows[i - 1][6] > 0).length };
}
async function gooRun(variant, dpr) {
  const out = [];
  await open(variant, dpr, "overview");
  // deterministic: sidebar links vs the same path over the hero's sky (nothing interactive), both with the nav state fixed
  const g = await openSidebar();
  const navRows = await ev(`${GOO_RUN}(${FLICK}(${g.x}, ${g.y0}, ${g.y1}))`);
  await move(900, 300); await sleep(700);
  const sky = await ev(`${GOO_RUN}(${FLICK}(1120, 150, ${150 + g.y1 - g.y0}))`); // the same path shape, nothing interactive under it
  const a = gooSummary(navRows), b = gooSummary(sky);
  // the goo's energy, frame by frame, on the two paths (hover still grows the body, so radii differ; the energy that
  // decides when tail and beads exist depends on the pointer's motion alone)
  let sameE = 0; for (let i = 0; i < navRows.length; i++) if (Math.abs(navRows[i][3] - sky[i][3]) < 1e-9 && navRows[i][2] === sky[i][2]) sameE++;
  out.push({ label: "deterministic flicks: sidebar links", ...a });
  out.push({ label: "deterministic flicks: free surface", ...b });
  out.push({ label: "deterministic: goo energy/state identical frame by frame", identical: sameE, of: navRows.length });
  // the numbered index (scrolled into view) and the summary strip, same trajectory
  await ev(`(()=>{const e=document.querySelector('#sec-overview .toc');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-140);return 1;})()`); await sleep(600);
  const idx = await ev(`(()=>{const a=[...document.querySelectorAll('#sec-overview .toc a')].map(e=>e.getBoundingClientRect()).filter(r=>r.top>0&&r.bottom<innerHeight);return {x:Math.round(a[0].left+60),y0:Math.round(a[0].top+6),y1:Math.round(a[a.length-1].bottom-6)};})()`);
  out.push({ label: "deterministic flicks: numbered index", ...gooSummary(await ev(`${GOO_RUN}(${FLICK}(${idx.x}, ${idx.y0}, ${idx.y1}))`)) });
  await ev("window.scrollTo(0,0);1"); await sleep(600);
  const sg = await summaryGeometry();
  const horiz = `((x0, x1, y) => ${FLICK}(0, x0, x1).map(([a, b, t]) => [b, y + a, t]))`;
  out.push({ label: "deterministic flicks: summary strip", ...gooSummary(await ev(`${GOO_RUN}(${horiz}(${sg.x0}, ${sg.x1}, ${sg.y}))`)) });
  // real input: flicks through the sidebar entries, recorded per displayed frame
  const g2 = await openSidebar();
  await ev(`(()=>{const T=HeliosLiquidCursor.test;window.__gr=[];window.__grOn=true;const f=()=>{if(!__grOn)return;__gr.push([T.S.interactiveEl?1:0,T.D.spine.on?1:0,+T.D.spine.L.toFixed(1),T.D.slots.filter(d=>d.state!=="IDLE").length,Math.round(Math.hypot(T.S.vx,T.S.vy))]);__raf(f);};__raf(f);return 1;})()`);
  await drive(sweep(g2, 3400, 3));
  const real = await ev("(()=>{__grOn=false;return __gr;})()");
  const fastReal = real.filter((r) => r[4] > 1500);
  out.push({ label: "real input: sidebar flicks", frames: real.length, interactiveShare: +(real.filter((r) => r[0]).length / real.length).toFixed(3), fastFrames: fastReal.length, gooOnShare: +(fastReal.filter((r) => r[1]).length / Math.max(1, fastReal.length)).toFixed(3), maxTail: Math.max(0, ...real.map((r) => r[2])), beadFrames: real.filter((r) => r[3] > 0).length });
  return out;
}

// ---------------------------------------------------------------- cross-material boundaries (test D)
// The page scrolled so the hero (lower part), its summary strip and the numbered index share the viewport: continuous
// fast passes sidebar (black) -> hero (glass) -> summary (glass) -> index (black) and back. Per frame: where the pointer
// is, the material the liquid shows, refraction, the goo, leftover overlays; cursor-off runs the same path for pacing.
const CROSS_REC = `(()=>{const T=HeliosLiquidCursor.test;window.__cx=[];window.__cxOn=true;const f=t=>{if(!__cxOn)return;const S=T.S,R=T.R,D=T.D;
  const el=document.elementFromPoint(S.rawX,S.rawY),where=!el?'-':el.closest('#nav')?'nav':el.closest('#sec-overview .evidence')?'summary':el.closest('[data-cursor-media="zone"]')?'hero':el.closest('#sec-overview .index')?'index':'other';
  const mc=document.querySelector('.lc-canvas-media'),rp=document.querySelector('.lc-ripple');
  __cx.push([t,where,+S.mat.toFixed(3),+R.rf[0].toFixed(3),D.spine.on?1:0,D.slots.filter(d=>d.state!=="IDLE").length,Math.round(Math.hypot(S.vx,S.vy)),mc&&mc.style.display!=="none"&&mc.style.visibility!=="hidden"?1:0,rp&&rp.style.display!=="none"?1:0]);__raf(f);};__raf(f);return 1;})()`;
async function crossRun(variant, dpr) {
  await open(variant, dpr, "overview");
  const g = await openSidebar(), mid = Math.round((g.y0 + g.y1) / 2);
  const sg = await summaryGeometry();
  if (variant !== "off") await ev(CROSS_REC);
  const at = { x: 2, y: mid };
  const go = (pts, v = 2600) => { const seg = []; let L = 0, p0 = [at.x, at.y]; for (const p of pts) { const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]); seg.push([L, d, p0, p]); L += d; p0 = p; }
    return drive((t) => { const d = t * v; if (d > L) return null; const s0 = seg.find((x) => d >= x[0] && d < x[0] + x[1]) || seg[seg.length - 1], k = Math.min(1, (d - s0[0]) / Math.max(1, s0[1])); at.x = s0[2][0] + (s0[3][0] - s0[2][0]) * k; at.y = s0[2][1] + (s0[3][1] - s0[2][1]) * k; return [at.x, at.y]; }); };
  const wheel = async (dy, steps) => { for (let i = 0; i < steps; i++) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY: dy }); await go([[at.x + (i % 2 ? -40 : 40), at.y + (dy > 0 ? 25 : -25)]], 1600); } };
  const row = await measured("cross-material laps", async () => {
    let n = 0;
    for (let lap = 0; lap < 3; lap++) {
      // the left edge opens the sidebar (it closes 350 ms after the pointer leaves); black sidebar -> glass hero -> glass summary
      n += await go([[2, mid + 1], [g.x, g.y0], [g.x, g.y1], [g.x, mid], [760, 300], [sg.x0 + 60, sg.y], [sg.x1 - 80, sg.y]]);
      // scrolling while moving: the numbered index (black) comes up over the strip; flicks across its rows
      await wheel(120, 5);
      const ix = await ev(`(()=>{const a=[...document.querySelectorAll('#sec-overview .toc a')].map(e=>e.getBoundingClientRect()).filter(r=>r.top>40&&r.bottom<innerHeight-20);return a.length?{x:Math.round(a[0].left+90),y0:Math.round(a[0].top+a[0].height/2),y1:Math.round(a[a.length-1].top+a[a.length-1].height/2)}:null;})()`);
      if (ix) n += await go([[ix.x, ix.y0], [ix.x + 500, ix.y1], [ix.x, ix.y0], [ix.x + 700, ix.y0]]);
      // back up to the strip and the hero, then the sidebar again
      await wheel(-120, 6); await ev("window.scrollTo(0,0);1");
      n += await go([[sg.x1 - 120, sg.y], [sg.x0 + 40, sg.y], [760, 300], [2, mid]]);
    }
    return n; });
  if (variant === "off") return [row];
  const rec = await ev("(()=>{__cxOn=false;return __cx;})()");
  // material: the target from position (nav/index/other black 0; hero/summary glass 1); count frames still off target
  // more than 150 ms after the pointer entered that region (the approved crossfade is 100 ms)
  let since = 0, prev = null, wrong = 0, judged = 0, glassFrames = 0, glassRefracted = 0, staleMedia = 0, staleRipple = 0;
  for (const r of rec) { if (r[1] !== prev) { since = r[0]; prev = r[1]; } const want = r[1] === "hero" || r[1] === "summary" ? 1 : r[1] === "nav" || r[1] === "index" ? 0 : null;
    if (want === null || r[0] - since < 150) continue; judged++; if (r[2] !== want) wrong++;
    if (want === 1) { glassFrames++; if (r[3] > 0) glassRefracted++; } else { if (r[7]) staleMedia++; } if (r[8]) staleRipple++; }
  const fast = rec.filter((r) => r[6] > 1500);
  Object.assign(row, { material: { judged, wrong, glassFrames, glassRefractedShare: +(glassRefracted / Math.max(1, glassFrames)).toFixed(3), staleMediaCanvas: staleMedia, rippleOverlayFrames: staleRipple },
    goo: { fastFrames: fast.length, gooOnShare: +(fast.filter((r) => r[4]).length / Math.max(1, fast.length)).toFixed(3), beadFrames: rec.filter((r) => r[5] > 0).length },
    regions: Object.fromEntries(["nav", "hero", "summary", "index", "other"].map((k) => [k, rec.filter((r) => r[1] === k).length])) });
  return [row];
}

// ---------------------------------------------------------------- the Overview index (nine full-width rows)
async function indexRows() { return ev(`(()=>{const a=[...document.querySelectorAll('#sec-overview .toc a')].map(e=>e.getBoundingClientRect());return {left:Math.round(a[0].left),right:Math.round(a[0].right),y0:Math.round(a[0].top+6),y1:Math.round(a[a.length-1].bottom-6),n:a.length,title:Math.round(a[0].left+170),desc:Math.round(a[0].left+(a[0].right-a[0].left)*0.55),empty:Math.round(a[0].right-30)};})()`); }
async function indexRun(variant, dpr) {
  await open(variant, dpr, "overview");
  const toIndex = () => ev(`(()=>{const t=document.querySelector('#sec-overview .toc');window.scrollTo(0,t.getBoundingClientRect().top+scrollY-24);return 1;})()`);
  await move(700, 400); await toIndex(); await sleep(900);
  let g = await indexRows(); const out = [];
  const vsweep = (x, v, secs) => (t) => { if (t > secs) return null; const span = g.y1 - g.y0, d = (t * v) % (2 * span); return [x + 18 * Math.sin(t * 6), d < span ? g.y0 + d : g.y1 - (d - span)]; };
  out.push(await measured("index rapid titles", () => drive(vsweep(g.title, 3600, 2.5))));
  out.push(await measured("index rapid descriptions", () => drive(vsweep(g.desc, 3600, 2.5))));
  out.push(await measured("index rapid empty space", () => drive(vsweep(g.empty, 3600, 2.5))));
  out.push(await measured("index reversals", () => drive(bursts({ x: g.desc, y0: g.y0, y1: g.y1 }))));
  out.push(await measured("index slow + pauses", () => drive((t) => { if (t > 6) return null; const c = t % 1.5; const k = c < 0.9 ? c / 0.9 : 1; const lap = Math.floor(t / 1.5); return [g.title + lap * 120, g.y0 + (g.y1 - g.y0) * ((lap % 2) ? 1 - k : k)]; })));
  // scrolling into and out of the index while the pointer moves; the sticky hero above it
  out.push(await measured("scroll into/out of index", async () => { let n = 0; for (let i = 0; i < 4; i++) { await ev("window.scrollTo(0,0);1");
      for (let k = 0; k < 8; k++) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 500, deltaX: 0, deltaY: 140 }); n += await drive((t) => (t > 0.06 ? null : [700 + 60 * Math.sin(k + t * 20), 500])); }
      for (let k = 0; k < 8; k++) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 500, deltaX: 0, deltaY: -140 }); n += await drive((t) => (t > 0.06 ? null : [700 + 60 * Math.cos(k + t * 20), 500])); } } return n; }));
  await toIndex(); await sleep(700); g = await indexRows();
  out.push(await measured("hero <-> index", async () => { let n = 0; for (let i = 0; i < 4; i++) { await ev("window.scrollBy(0,-260);1"); n += await drive((t) => (t > 0.5 ? null : [400 + t * 1600, 300 + t * 500])); await ev("window.scrollBy(0,260);1"); n += await drive((t) => (t > 0.5 ? null : [1200 - t * 1600, g.y0 + t * 600])); } return n; }));
  return out;
}

// ---------------------------------------------------------------- main
try {
  for (let rep = 0; rep < REPS; rep++) for (const dpr of DPRS) for (const variant of VARIANTS) {
    let rows;
    if (MODE === "sidebar") rows = await sidebarRun(variant, dpr);
    else if (MODE === "index") rows = await indexRun(variant, dpr);
    else if (MODE === "rainbow") rows = await rainbowRun(variant, dpr);
    else if (MODE === "goo") rows = await gooRun(variant, dpr);
    else if (MODE === "cross") { rows = await crossRun(variant, dpr); for (const r of rows) { r.variant = variant; r.dpr = dpr; r.rep = rep; info.rows.push(r); console.log(`${variant.padEnd(5)} dpr${dpr} r${rep} ${r.label} p50 ${r.frame.p50} p95 ${r.frame.p95} p99 ${r.frame.p99} max ${r.frame.max} drop ${r.frame.dropped} LT ${r.longTasks.length} cursor ${r.cursorMs}ms ${JSON.stringify({ material: r.material, goo: r.goo, regions: r.regions, cap: r.cursor })}`); } continue; }
    else throw Error("unknown mode " + MODE);
    if (MODE !== "sidebar" && MODE !== "index") { for (const r of rows) { r.variant = variant; r.dpr = dpr; r.rep = rep; info.rows.push(r); console.log(`${variant.padEnd(5)} dpr${dpr} r${rep} ${JSON.stringify(r)}`); } continue; }
    for (const r of rows) { r.variant = variant; r.dpr = dpr; r.rep = rep; info.rows.push(r);
      const loafCursor = r.loaf.reduce((n, f) => n + f.scripts.filter((x) => x.src.includes("liquid-cursor")).reduce((m, x) => m + x.ms, 0), 0);
      r.loafCursorMs = loafCursor;
      if (r.trace) console.log("      trace", JSON.stringify(r.trace.busyMs), JSON.stringify(r.trace.frames));
      console.log(`${variant.padEnd(5)} dpr${dpr} r${rep} ${r.label.padEnd(28)} p50 ${r.frame.p50} p95 ${r.frame.p95} p99 ${r.frame.p99} max ${r.frame.max} drop ${r.frame.dropped} >50 ${r.frame.over50} LT ${r.longTasks.length}/${r.longTasks.reduce((n, l) => n + l[1], 0)}ms style ${r.cdp.recalcStyle}/${r.cdp.recalcStyleMs}ms layout ${r.cdp.layout}/${r.cdp.layoutMs}ms script ${r.cdp.scriptMs}ms cursor ${r.cursorMs}ms cap ${r.cursor ? r.cursor.rippleCaptures + "/" + r.cursor.heroCaptures + " cancel " + r.cursor.rippleCancellations : "-"} loafCursor ${loafCursor}ms LoAF ${r.loaf.length}`); }
  }
} finally {
  writeFileSync(join(OUT, NAME + ".json"), JSON.stringify(info, null, 1));
  // Edge hands its windows to a process tree: close the browser over CDP (killing the launcher alone leaks it)
  try { await Promise.race([send("Browser.close"), sleep(3000)]); } catch { /* already closing */ }
  try { ws.close(); } catch { /* closed */ } proc.kill(); await sleep(800); try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
}
