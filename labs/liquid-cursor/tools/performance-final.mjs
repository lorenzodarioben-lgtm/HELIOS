// Real compositor performance lab. No dependencies; isolated evidence, no renderer workloads.
// node .../performance-final.mjs --out NAME [--reps 2] [--cases hero,scroll] [--variants off,before,final,ripple-off] [--trace] [--memory]
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {sleep,EDGE} from './cdp.mjs';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const OUT=resolve('labs/liquid-cursor/evidence/performance-final'),NAME=arg('--out','run'),REPS=+arg('--reps','2');mkdirSync(OUT,{recursive:true});
const port=9600+Math.floor(Math.random()*200),profile=mkdtempSync(join(tmpdir(),'helios-perf-'));
const proc=spawn(EDGE,[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--window-position=-3200,0','--window-size=1440,980','--disable-features=CalculateNativeWinOcclusion,BackForwardCache','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','about:blank'],{stdio:'ignore',windowsHide:true});
let ver;for(let i=0;i<150&&!ver;i++){try{ver=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();}catch{}if(!ver)await sleep(100);}if(!ver)throw Error('No CDP');
const ws=new WebSocket(ver.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0,override=null,overrideApp=null;
const pending=new Map(),listeners=new Set();
const send=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++seq;pending.set(id,{r,j});ws.send(JSON.stringify({id,method,params,sessionId}));});
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}else{for(const f of listeners)f(m);if(m.method==='Fetch.requestPaused'){const body=m.params.request.url.includes('/app.js')?overrideApp:override;send(body?'Fetch.fulfillRequest':'Fetch.continueRequest',body?{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'},{name:'Cache-Control',value:'no-store'}],body}:{requestId:m.params.requestId},m.sessionId);}}};
const {targetInfos}=await send('Target.getTargets'),{sessionId}=await send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true});
const s=(m,p)=>send(m,p,sessionId),ev=async expression=>{const r=await s('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const preload=`(()=>{
const q={raf:{},events:{},observers:[],gl:{},long:[],listeners:{},rects:0,styles:0};window.__perf=q;
const record=(map,k,ms)=>{const a=map[k]||(map[k]={n:0,ms:0,max:0});a.n++;a.ms+=ms;a.max=Math.max(a.max,ms);};
const raf=requestAnimationFrame;window.requestAnimationFrame=function(cb){if(cb.name==='perfClock')return raf(cb);const key=cb.name||String(cb).slice(0,95);return raf(t=>{const a=performance.now();try{cb(t);}finally{record(q.raf,key,performance.now()-a);}});};
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,wrapped=new WeakMap();
EventTarget.prototype.addEventListener=function(type,fn,opt){if(!fn)return add.call(this,type,fn,opt);let w=wrapped.get(fn);if(!w){w=function(e){const a=performance.now();try{return typeof fn==='function'?fn.call(this,e):fn.handleEvent(e);}finally{record(q.events,e.type,performance.now()-a);}};wrapped.set(fn,w);}q.listeners[type]=(q.listeners[type]||0)+1;return add.call(this,type,w,opt);};
EventTarget.prototype.removeEventListener=function(type,fn,opt){return remove.call(this,type,wrapped.get(fn)||fn,opt);};
const MO=MutationObserver;window.MutationObserver=class extends MO{constructor(cb){const o={n:0,records:0,own:0,ms:0,max:0,root:'',options:null};q.observers.push(o);super((list,obs)=>{const a=performance.now();o.n++;o.records+=list.length;for(const m of list)if((m.target.nodeType===1?m.target:m.target.parentElement)?.closest('.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media,.lc-ripple'))o.own++;try{cb(list,obs);}finally{const ms=performance.now()-a;o.ms+=ms;o.max=Math.max(o.max,ms);}});this.o=o;}observe(root,opt){this.o.root=root.id||root.tagName;this.o.options=opt;return super.observe(root,opt);}};
const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){q.rects++;return rect.call(this);};const css=getComputedStyle;window.getComputedStyle=function(...a){q.styles++;return css(...a);};
const ctx=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,opt){const g=ctx.call(this,type,opt);if(!g||!type.startsWith('webgl')||g.__perf)return g;g.__perf=true;const k=this.className||this.id||'unnamed',a=q.gl[k]={draws:0,uploads:0,uploadMs:0,uploadMax:0,textures:0,programs:0};for(const n of ['drawArrays','texImage2D','texSubImage2D','createTexture','deleteTexture','createProgram','deleteProgram']){const f=g[n];g[n]=function(...v){const t=performance.now(),r=f.apply(this,v);if(n==='drawArrays')a.draws++;if(n.startsWith('tex')){a.uploads++;const ms=performance.now()-t;a.uploadMs+=ms;a.uploadMax=Math.max(a.uploadMax,ms);}if(n==='createTexture')a.textures++;if(n==='deleteTexture')a.textures--;if(n==='createProgram')a.programs++;if(n==='deleteProgram')a.programs--;return r;};}return g;};
if(typeof OffscreenCanvas==='function'){const off=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(type,opt){const g=off.call(this,type,opt);if(!g||!type.startsWith('webgl')||g.__perf)return g;g.__perf=true;const a=q.gl['offscreen-'+Object.keys(q.gl).length]={draws:0,uploads:0,uploadMs:0,uploadMax:0,textures:0,programs:0};for(const n of ['drawArrays','texImage2D','createTexture','deleteTexture','createProgram','deleteProgram']){const f=g[n];g[n]=function(...v){const t=performance.now(),r=f.apply(this,v);if(n==='drawArrays')a.draws++;if(n==='texImage2D'){a.uploads++;const ms=performance.now()-t;a.uploadMs+=ms;a.uploadMax=Math.max(a.uploadMax,ms);}if(n==='createTexture')a.textures++;if(n==='deleteTexture')a.textures--;if(n==='createProgram')a.programs++;if(n==='deleteProgram')a.programs--;return r;};}return g;};}
new PerformanceObserver(l=>{for(const e of l.getEntries())q.long.push({at:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});
window.__resetPerf=()=>{q.raf={};q.events={};q.long=[];q.rects=q.styles=0;for(const o of q.observers){o.n=o.records=o.own=o.ms=o.max=0;}for(const a of Object.values(q.gl)){a.draws=a.uploads=a.uploadMs=a.uploadMax=0;}};
window.__measure=ms=>new Promise(r=>{window.__workDone=false;const times=[],start=performance.now();q.frameTimeline=[];performance.mark('measure-start');let last=0;function perfClock(t){if(last){times.push(t-last);q.frameTimeline.push({at:t,ms:t-last});}last=t;if(performance.now()-start<ms||!window.__workDone)raf(perfClock);else{performance.mark('measure-end');r(times);}}raf(perfClock);});
})()`;
await s('Runtime.enable');await s('Page.enable');await s('Network.enable');await s('Network.setCacheDisabled',{cacheDisabled:true});await s('Fetch.enable',{patterns:[{urlPattern:'*/liquid-cursor.js*'},{urlPattern:'*/app.js*'}]});await s('Page.addScriptToEvaluateOnNewDocument',{source:preload});
const before=Buffer.from(readFileSync(join(OUT,'baseline-liquid-cursor.js'),'utf8')+'\nwindow.__perfBeforeCursor=true;').toString('base64');
const beforeApp=readFileSync(join(OUT,'baseline-app.js')).toString('base64');
const rows=[],info={browser:ver.Browser,method:'headed offscreen Edge, occlusion throttling disabled, real display compositor; production native pointer and wheel events; instrumented callbacks, same-session interleaved variants',viewport:[1440,900],rows};
try{info.gpu=await send('SystemInfo.getInfo');}catch{}
info.actualDisplay=await ev('({dpr:devicePixelRatio,width:screen.width,height:screen.height,visibility:document.visibilityState})');
const status=()=>ev('HeliosLiquidCursor.status?.()||null'),move=(x,y)=>s('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});
const click=async(x,y)=>{await s('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await s('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});};
const center=sel=>ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
let load=0;
async function open(variant,dpr,route='overview'){
 override=variant.startsWith('before')?before:null;
 if(variant==='pre-parallel')override=readFileSync(join(OUT,'pre-parallel-liquid-cursor.js')).toString('base64');
 if(variant==='final-high-gpu')override=Buffer.from(readFileSync(resolve('assets/observatory/liquid-cursor.js'),'utf8').replaceAll('powerPreference: "low-power"','powerPreference: "high-performance"')).toString('base64');
 if(variant==='final-no-source'){
  let source=readFileSync(resolve('assets/observatory/liquid-cursor.js'),'utf8');
  source=source.replace('function captureHero(z) {','function captureHero(z) { return;').replace('async function captureSource() {','async function captureSource() { return false;');
  override=Buffer.from(source).toString('base64');
 }
 overrideApp=variant.startsWith('before')?beforeApp:null;
 await s('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:dpr,mobile:false});
 const query=variant==='off'||variant==='before-off'?'cursor=off':variant.includes('ripple-off')?'ripple=off':variant==='final-ripple1.5'?'rippleDpr=1.5':variant==='final-ripple1'?'rippleDpr=1':'';
 const start=Date.now();await s('Page.navigate',{url:`http://127.0.0.1:8315/assets/observatory/index.html?${query}&glass=target&hero=b&perfRun=${++load}#${route}`});
 for(let i=0;i<150;i++){if(await ev('document.readyState==="complete"&&!!window.HeliosLiquidCursor&&(!!HeliosLiquidCursor.status||HeliosLiquidCursor.reason!=="not started")').catch(()=>false))break;await sleep(50);}
 (info.loads||=[]).push({variant,dpr,route,runtimeSha256:createHash('sha256').update(override?Buffer.from(override,'base64'):readFileSync(resolve('assets/observatory/liquid-cursor.js'))).digest('hex'),completeWallMs:Date.now()-start,page:await ev('({paint:performance.getEntriesByType("paint").map(e=>({name:e.name,ms:e.startTime})),navigation:performance.getEntriesByType("navigation").map(e=>({dom:e.domContentLoadedEventEnd,load:e.loadEventEnd})),heap:performance.memory?.usedJSHeapSize})')});await sleep(1400);
 if(variant==='final-noclip')await ev('document.head.insertAdjacentHTML("beforeend","<style>.lc-canvas,.lc-canvas-media{clip-path:none!important}</style>");1');
 if(await ev('!!window.__perfBeforeCursor')!==variant.startsWith('before'))throw Error('Runtime override identity mismatch: '+variant);
}
const stats=times=>{const a=[...times].sort((x,y)=>x-y),p=q=>a[Math.min(a.length-1,Math.floor(a.length*q))];return {frames:a.length,medianFps:1000/p(.5),fps:a.length*1000/a.reduce((n,x)=>n+x,0),p50:p(.5),p90:p(.9),p95:p(.95),p99:p(.99),max:p(1),low1Fps:1000/p(.99),over8_3:a.filter(x=>x>8.4).length,over12:a.filter(x=>x>12).length,over16_7:a.filter(x=>x>16.8).length,over25:a.filter(x=>x>25).length,over50:a.filter(x=>x>50).length};};
async function measure(name,variant,dpr,rep,fn,ms=2400){await ev('__resetPerf()');const pre=await status(),m=ev(`__measure(${ms})`);await fn();await ev('__workDone=true');const times=await m,post=await status(),telemetry=await ev('__perf'),canvases=await ev('[...document.querySelectorAll("canvas")].map(c=>({class:c.className,id:c.id,backing:[c.width,c.height],css:[c.clientWidth,c.clientHeight],display:getComputedStyle(c).display,blend:getComputedStyle(c).mixBlendMode,clip:c.style.clipPath,z:getComputedStyle(c).zIndex,pointerEvents:getComputedStyle(c).pointerEvents}))');const row={name,variant,dpr,rep,...stats(times),times,pre,post,telemetry,canvases};rows.push(row);console.log(JSON.stringify({name,variant,dpr,rep,fps:+row.fps.toFixed(1),p95:row.p95,max:row.max,captures:post?post.ripple.captures-(pre?.ripple.captures||0):0,raf:telemetry.raf,observers:telemetry.observers.map(o=>[o.n,o.records,o.own])}));writeFileSync(join(OUT,NAME+'.json'),JSON.stringify(info,null,2));return row;}
async function scenario(name,variant,dpr,rep){
 const isRipple=name.includes('ripple'),route=name==='normal'||name.startsWith('ripple')?'performance':name==='render'?'render':name==='workload'?'workload':'overview';await open(variant,dpr,route);let x=1050,y=340,amp=160,peak=0;
 if(name==='workload'){[x,y]=await center('#wm-canvas');amp=250;}
 if(name==='index'){await ev('document.querySelector(".toc a[data-route=workload]").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(800);[,y]=await center('.toc a[data-route=workload]');x=170;amp=85;}
 if(name==='sidebar'){await ev('document.querySelector("#nav").classList.add("open");1');await sleep(800);x=279;y=430;amp=70;}
 if(name==='summary'){[x,y]=await center('.evidence .lead .fig');amp=40;}
 if(name==='render'){await ev('document.querySelector("#rl-img").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(800);[x,y]=await center('#rl-img');amp=120;}
 await move(x,y);await sleep(550);
 if(name.startsWith('hero-ripple'))await ev('document.querySelector(".hero-count").dispatchEvent(new MouseEvent("mouseenter"));1');
 const duration=isRipple?3700:2400;
 const result=await measure(name,variant,dpr,rep,async()=>{
  if(name==='scroll'){for(let i=0;i<45;i++){const delta=[60,140,320,180,-220,-380,-90,-120][Math.floor(i/6)%8];await s('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:delta});await sleep(38);}return;}
  if(isRipple){const n=+name.split('ripple')[1];for(let i=0;i<n;i++){await click(name.startsWith('hero-')?700+i*35:1200+i*15,name.startsWith('hero-')?420+(i%3)*35:120+(i%3)*30);peak=Math.max(peak,(await status())?.ripple.count||0);await sleep(40);}return;}
  for(let i=0;i<90;i++){const t=i/89,phase=t<.35?t*4:t<.7?t*20:t*9;await move(Math.max(30,Math.min(1400,x+(name==='sidebar'?0:Math.sin(phase)*amp))),Math.max(45,Math.min(860,y+(name==='sidebar'?Math.sin(phase)*180:Math.cos(t*9)*amp*.4))));await sleep(20);}
 },duration);
 if(isRipple){result.peakWaves=peak;writeFileSync(join(OUT,NAME+'.json'),JSON.stringify(info,null,2));await sleep(500);await measure(name+'-idle',variant,dpr,rep,()=>sleep(1100),1100);}
}
try{
 if(args.includes('--journey')){
  for(const dpr of arg('--dprs','1,2').split(',').map(Number))for(const variant of arg('--variants','off,final').split(',')){
   await open(variant,dpr);const steps=[],note=async tag=>{await ev(`performance.mark(${JSON.stringify(tag)});1`);steps.push({tag,...await ev('({at:performance.now(),route:location.hash,state:HeliosLiquidCursor.status?.()||null})')});};
   const events=[];let traceDone;const traceListener=m=>{if(m.method==='Tracing.dataCollected')events.push(...m.params.value);if(m.method==='Tracing.tracingComplete')traceDone?.();};
   if(args.includes('--trace-journey')){listeners.add(traceListener);await s('Profiler.enable');await s('Profiler.setSamplingInterval',{interval:500});await s('Profiler.start');await send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',options:'record-as-much-as-possible'});}
   const result=await measure('journey',variant,dpr,1,async()=>{
    await note('Overview loaded');for(let i=0;i<15;i++){await move(400+i*55,350+Math.sin(i/2)*100);await sleep(30);}await note('hero motion');
    for(const delta of [80,180,320,-380,-200]){await s('Input.dispatchMouseEvent',{type:'mouseWheel',x:1000,y:350,deltaX:0,deltaY:delta});await sleep(80);}await ev('scrollTo({top:0,behavior:"instant"});1');await sleep(350);
    let [x,y]=await center('.evidence .lead .fig');await move(x,y);await sleep(400);await note('summary glass');
    await ev('document.querySelector(".toc a[data-route=workload]").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(400);[,y]=await center('.toc a[data-route=workload]');for(let i=0;i<10;i++){await move(160,y-120+i*24);await sleep(12);}await note('index flick');
    await ev('document.querySelector("#nav").classList.add("open");1');await sleep(400);for(let i=0;i<12;i++){await move(279,300+i*25);await sleep(18);}await note('sidebar flick');await ev('document.querySelector("#nav").classList.remove("open");scrollTo({top:0,behavior:"instant"});1');await sleep(600);await move(700,420);await click(700,420);await sleep(500);await note('hero ripple');
    await ev('location.hash="performance";1');await sleep(1600);await move(1280,150);await sleep(650);await click(1280,150);await sleep(500);await note('normal ripple');
    await ev('location.hash="workload";1');await sleep(700);await s('Input.dispatchMouseEvent',{type:'mouseWheel',x:1000,y:160,deltaX:0,deltaY:180});await sleep(300);await note('Workload scroll');
    await ev('location.hash="render";1');await sleep(700);await ev('document.querySelector("#rl-img").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(400);[x,y]=await center('#rl-img');for(let i=0;i<12;i++){await move(x-150+i*25,y);await sleep(25);}await note('render glass');
    await ev('location.hash="scheduler";1');await sleep(800);await move(1280,150);await sleep(200);await note('scheduler normal');await ev('document.querySelector("#sc-scrub").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(300);const pt=await center('#sc-scrub');await move(...pt);await sleep(200);await note('native precision');await move(1280,150);await sleep(200);await note('precision released');
    await ev('location.hash="overview";1');await sleep(700);await move(600,380);await sleep(600);await note('Overview return');
   },16000);result.steps=steps;writeFileSync(join(OUT,NAME+'.json'),JSON.stringify(info,null,2));
   if(args.includes('--trace-journey')){writeFileSync(join(OUT,NAME+'-'+variant+'-dpr'+dpr+'-cpu.json'),JSON.stringify(await s('Profiler.stop')));const finished=new Promise(r=>traceDone=r);await send('Tracing.end');await finished;listeners.delete(traceListener);writeFileSync(join(OUT,NAME+'-'+variant+'-dpr'+dpr+'-trace.json'),JSON.stringify({traceEvents:events}));}
  }
 }else if(args.includes('--trace')){
  const events=[];let done;listeners.add(m=>{if(m.method==='Tracing.dataCollected')events.push(...m.params.value);if(m.method==='Tracing.tracingComplete')done?.();});
  const traceCase=arg('--trace-case','workload'),traceVariant=arg('--trace-variant','before'),traceDpr=+arg('--dprs','2');
  await s('Profiler.enable');await s('Profiler.setSamplingInterval',{interval:500});await s('Profiler.start');await send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',options:'record-as-much-as-possible'});
  if(traceCase==='scroll')await scenario('scroll',traceVariant,traceDpr,1);
  else {
   await open(traceVariant,traceDpr,traceCase);
   await measure('trace-cold-capture',traceVariant,traceDpr,1,async()=>{await click(1000,150);for(let i=0;i<45;i++){if(traceCase==='overview')await s('Input.dispatchMouseEvent',{type:'mouseWheel',x:1050,y:340,deltaX:0,deltaY:[180,320,-220,-380][Math.floor(i/6)%4]});else await move(500+Math.sin(i/3)*330,300+Math.cos(i/4)*100);await sleep(38);}},3000);
  }
  const cpu=await s('Profiler.stop');writeFileSync(join(OUT,NAME+'-cpu.json'),JSON.stringify(cpu));
  await send('Tracing.end');await new Promise(r=>done=r);writeFileSync(join(OUT,NAME+'-trace.json'),JSON.stringify({traceEvents:events}));
 }else if(args.includes('--memory')){
  await open('final',2);const samples=[];const snapshot=async tag=>{await s('HeapProfiler.collectGarbage');const live={};for(const name of ['window','document','document.getElementById("main")','document.getElementById("nav")']){const obj=await s('Runtime.evaluate',{expression:name,objectGroup:'perf-listeners'});const list=await s('DOMDebugger.getEventListeners',{objectId:obj.result.objectId,depth:-1,pierce:true});live[name]=list.listeners.length;}await s('Runtime.releaseObjectGroup',{objectGroup:'perf-listeners'});samples.push({tag,heap:await s('Runtime.getHeapUsage'),dom:await s('Memory.getDOMCounters'),liveListeners:live,page:await ev('({resources:__perf.gl,registrations:__perf.listeners,canvases:document.querySelectorAll("canvas").length,status:HeliosLiquidCursor.status()})')});writeFileSync(join(OUT,NAME+'.json'),JSON.stringify({browser:ver.Browser,samples},null,2));console.log(tag,JSON.stringify(samples.at(-1).heap));};await snapshot('initial');
  const start=Date.now();let cycle=0;while(Date.now()-start<190000){for(const route of ['overview','render','workload','scheduler','overview']){await ev(`location.hash=${JSON.stringify(route)};1`);await sleep(600);await move(1000,160);await click(1000,160);await s('Input.dispatchMouseEvent',{type:'mouseWheel',x:1000,y:160,deltaX:0,deltaY:120});await sleep(200);}cycle++;if(cycle===8)await snapshot('mid');}await sleep(4500);await snapshot('final '+cycle+' cycles');
 }else{
 const cases=arg('--cases','normal,sidebar,index,hero,summary,render,scroll,ripple1,ripple3,ripple8').split(','),variants=arg('--variants','off,before,before-ripple-off').split(',');
 for(const dpr of arg('--dprs','1,2').split(',').map(Number))for(let rep=1;rep<=REPS;rep++)for(const name of cases)for(const variant of variants)await scenario(name,variant,dpr,rep);
 // Fully settled stationary state: exclude the measuring RAF from instrumentation.
 await open(variants.at(-1),2,'performance');await move(900,220);await sleep(6500);await measure('settled-idle',variants.at(-1),2,1,()=>sleep(1500),1500);
 }
}finally{try{await send('Browser.close');}catch{}ws.close();proc.kill();await sleep(600);try{const target=resolve(profile);if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('helios-perf-'))throw Error('Unexpected profile cleanup target');rmSync(target,{recursive:true,force:true});}catch{}}
