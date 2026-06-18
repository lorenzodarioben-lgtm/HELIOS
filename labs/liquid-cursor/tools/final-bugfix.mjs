// Interaction-pass evidence and focused assertions; never loaded by the Observatory.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,sleep,labelledSheet,decodePNG,encodePNG} from './cdp.mjs';
const args=process.argv.slice(2),arg=(k,d='')=>args.includes(k)?args[args.indexOf(k)+1]:d;
const ROOT=process.cwd(),QA=arg('--qa'),OUT=resolve(arg('--out','labs/liquid-cursor/evidence/final-bugfix'));mkdirSync(OUT,{recursive:true});
const source=readFileSync('labs/liquid-cursor/tools/check-observatory.mjs','utf8');
const driver=source.slice(source.indexOf('function installDriver()'),source.indexOf('const around ='));
const HTTP='http://127.0.0.1:8315/assets/observatory/index.html',B=await launch(),keep=setInterval(()=>{},1000);
const results={when:new Date().toISOString(),browser:B.version,checks:[]};
function check(name,ok,detail={}){results.checks.push({name,ok,...detail});console.log(ok?'PASS':'FAIL',name,JSON.stringify(detail));if(!ok)process.exitCode=1;}
async function open(query='',old=null,{w=1440,h=900,dpr=1,media=[],touch=false}={}){
 if(arg('--ripple'))query=query.replace('ripple=reference','ripple='+arg('--ripple'));
 const {targetId}=await B.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await B.send('Target.attachToTarget',{targetId,flatten:true});
 const s=(m,p)=>B.send(m,p,sessionId),logs=[];
 const listener=m=>{if(m.sessionId!==sessionId)return;if(m.method==='Runtime.exceptionThrown')logs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Fetch.requestPaused')s('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(old).toString('base64')});};
 B.listeners.add(listener);await s('Page.enable');await s('Runtime.enable');if(old)await s('Fetch.enable',{patterns:[{urlPattern:'*/liquid-cursor.js*'}]});
 await s('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:dpr,mobile:false});if(media.length)await s('Emulation.setEmulatedMedia',{features:media});
 if(touch)await s('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 const ev=async expression=>{const r=await s('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await s('Page.navigate',{url:HTTP+'?cursor=test&glass=target&hero=b&'+query+'#overview'});
 for(let i=0;i<120;i++){if(await ev('document.readyState==="complete" && !!window.HeliosLiquidCursor?.test').catch(()=>false))break;await sleep(50);}
 await ev(`document.querySelector('.hero-count')?.dispatchEvent(new MouseEvent('mouseenter'));document.head.insertAdjacentHTML('beforeend','<style>.hero-frame img{animation:none!important}.hero-frame,.hero-stage{transition:none!important}</style>');1`);await sleep(500);
 return {ev,s,logs,w,h,dpr,shot:async(x=0,y=0,width=w,height=h)=>Buffer.from((await s('Page.captureScreenshot',{format:'png',clip:{x,y:y+await ev('scrollY'),width,height,scale:1}})).data,'base64'),close:async()=>{B.listeners.delete(listener);await B.send('Target.closeTarget',{targetId});}};
}
function changed(a,b){a=decodePNG(a.toString('base64'));b=decodePNG(b.toString('base64'));let pixels=0,max=0;for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const aa=a.px(x,y),bb=b.px(x,y),d=Math.max(...aa.map((v,i)=>Math.abs(v-bb[i])));if(d)pixels++;max=Math.max(max,d);}return {pixels,max};}
function stroke(buf,x0,x1,y,dpr=1){const im=decodePNG(buf.toString('base64'));let sum=0,weight=0,lo=1e9,hi=-1;for(let x=Math.floor(x0*dpr);x<Math.ceil(x1*dpr);x++){const p=im.px(x,Math.floor(y*dpr));if(p[0]+p[1]+p[2]<230){sum+=x;weight++;lo=Math.min(lo,x);hi=Math.max(hi,x);}}return {center:sum/Math.max(1,weight)/dpr,lo:lo/dpr,hi:hi/dpr};}

async function diagnose(){
 const P=await open('ripple=off'),states=[];
 await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:465,y:392,button:'none',buttons:0});await sleep(550);
 for(let i=0;i<12;i++){
  await P.ev('window.scrollTo(0,1100);1');await sleep(65);await P.ev('window.scrollTo(0,0);1');await sleep(i===11?600:65);
  states.push(await P.ev('(()=>{const a=HeliosLiquidCursor.status(),h=HeliosLiquidCursor.test.R.hero;return {color:getComputedStyle(document.querySelector(".wordmark")).color,material:a.material.value,shown:a.material.shown,media:a.material.media,refraction:a.material.refraction,dirty:h.dirty,ok:h.ok,gen:h.gen,scroll:h.scroll,current:scrollY,difference:getComputedStyle(HeliosLiquidCursor.test.canvas).display};})()'));
 }
 results.heroBefore=states;console.log('Hero cycles',JSON.stringify(states));
 const driverExpr=`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`;
 for(const id of ['overview','render','workload','scheduler','hardware','performance','correctness','stress']){
  await P.ev(`location.hash='${id}';1`);await sleep(550);await P.ev(driverExpr);
  const n=await P.ev(`__pv.run([{dx:1,dy:0,v:4200,ms:180,ramp:20},{dx:-1,dy:0,v:3600,ms:70}],1100,170,0)`);await P.ev(`__pv.stepTo(${n});1`);
  const st=await P.ev('(()=>{const T=HeliosLiquidCursor.test,a=HeliosLiquidCursor.status();return {id:document.querySelector(".section.active").id,mat:a.material.value,ignored:a.ignored,hover:a.interactive,tail:T.D.tailOut.on,length:T.D.spine.L,beads:a.goo.beads,render:a.render};})()');(results.routingBefore||=[]).push(st);console.log('Routing',JSON.stringify(st));
 }
 await P.close();
}

const ids=['overview','render','workload','scheduler','hardware','performance','correctness','stress'];
const drv=`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`;
async function routing(){
 const rows=[],old=readFileSync(join(QA,'prepass/liquid-cursor.js'),'utf8');
 for(const id of [...ids,'provenance','defence']){const cells=[],samples=[];
  for(const [label,override]of [['Pre-unification',old],['Corrected',null]]){
   const P=await open('ripple=reference',override);await P.ev(`location.hash='${id}';1`);await sleep(1000);await P.ev(drv);
   const n=await P.ev(`__pv.run([{dx:1,dy:0,v:4200,ms:180,ramp:20},{dx:-1,dy:0,v:3600,ms:70}],1100,170,0)`);await P.ev(`__pv.stepTo(${n});1`);
   const sn=await P.ev('(()=>{const T=HeliosLiquidCursor.test,s=__pv.snap(),mask=s.mat===1?T.readMediaMask():T.readMask();return {material:HeliosLiquidCursor.status().material.value,geometry:{x:s.x,y:s.y,E:s.E,L:s.L,tail:s.tail,hov:s.hov,pts:s.pts,beads:s.beads,body:{stretch:T.B.stretch,c:T.B.compression}},covered:Array.from(mask.px).filter((v,i)=>i%4===3&&v>0).length,difference:getComputedStyle(T.canvas).visibility};})()');samples.push(sn);
   check(id+' '+label+' full goo visible',sn.geometry.tail&&sn.geometry.L>30&&sn.geometry.beads.length>0&&sn.covered>1000,{material:sn.material,length:sn.geometry.L,beads:sn.geometry.beads.length,covered:sn.covered});
   cells.push(await P.shot(Math.round(sn.geometry.x-170),Math.round(sn.geometry.y-90),320,190));check(id+' '+label+' console',P.logs.length===0,{logs:P.logs});await P.close();
  }
  check(id+' preserves original material and exact goo state',samples[0].material===samples[1].material&&JSON.stringify(samples[0].geometry)===JSON.stringify(samples[1].geometry),{old:samples[0].material,current:samples[1].material,difference:samples[1].difference});
  (results.routing||={})[id]=samples;rows.push({label:id,cells});
 }
 writeFileSync(join(OUT,'02-original-routing.png'),await labelledSheet(B,{title:'Original routing restored outside the Overview index',note:'Same production hit-tests and deterministic flick. Hero glass; nine ordinary pages difference. Goo state exact.',columns:['Pre-unification baseline','Corrected'],rows}));
}
async function inspect(){
 const P=await open();await P.ev('document.querySelector("#sec-overview > section.index").scrollIntoView({block:"start"});1');await sleep(700);
 console.log('INDEX DOM',JSON.stringify(await P.ev('(()=>{const e=document.querySelector("#sec-overview > section.index"),rect=e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.width,b.height]},a=[...e.querySelectorAll(".toc a")].map(a=>({route:a.dataset.route,rect:rect(a),title:rect(a.querySelector(".t")),number:rect(a.querySelector(".n"))}));return {identity:e.outerHTML.slice(0,170),index:rect(e),scroll:scrollY,rows:a};})()')));await P.close();
}
async function index(){
 const rows=[],summaryShots=[],proof=[],old=readFileSync(join(QA,'prepass/liquid-cursor.js'),'utf8');
 const snapshot=`(()=>{const T=HeliosLiquidCursor.test,s=__pv.snap(),m=T.readMask(),tx=Math.round((T.S.renderX-210)*T.S.dpr)/T.S.dpr,ty=Math.round((T.S.renderY-210)*T.S.dpr)/T.S.dpr;let outside=0,total=0;for(let y=0;y<m.h;y++)for(let x=0;x<m.w;x++){if(!m.px[(y*m.w+x)*4+3])continue;total++;const dx=tx+x/T.S.effDpr-T.S.renderX,dy=ty+y/T.S.effDpr-T.S.renderY,lx=(dx*T.B.ax+dy*T.B.ay)/T.B.stretch,ly=(-dx*T.B.ay+dy*T.B.ax)/T.B.compression;if(Math.hypot(lx,ly)>T.P.radius*T.B.radiusScale+T.B.noiseAmp+3)outside++;}return {state:s,body:JSON.parse(JSON.stringify(T.B)),material:HeliosLiquidCursor.status().material,covered:total,outside,tiles:T.tiles().tiles.filter(t=>t.visible).length,canvas:{difference:getComputedStyle(T.canvas).visibility,media:getComputedStyle(T.M.canvas).visibility},seed:T.D.seed};})()`;
 // Diagnosis uses the preserved original difference runtime, before the mistaken glass expansion.
 for(const [label,override]of [['Original full-row hover',old],['Corrected local hover',null]]){
  const P=await open('ripple=reference',override);await P.ev('document.querySelector(".toc a[data-route=workload]").scrollIntoView({block:"center"});1');await sleep(600);await P.ev(drv);
  const y=await P.ev('(()=>{const b=document.querySelector(".toc a[data-route=workload]").getBoundingClientRect();return Math.round(b.top+b.height/2);})()');
  const n=await P.ev(`__pv.run([{dx:0,dy:1,v:4200,ms:100,ramp:20},{dx:0,dy:-1,v:3600,ms:60}],160,${y},0)`);await P.ev(`__pv.stepTo(${n});1`);const sn=await P.ev(snapshot);proof.push({label,...sn});
  rows.push({label,cells:[await P.shot(60,y-130,650,360)]});await P.close();
 }
 check('missing Goo cause is full-row hover suppression',proof[0].state.interactive&&!proof[0].state.tail&&proof[0].state.L===0&&proof[0].outside===0,{before:proof[0].state,coverage:proof[0].covered});
 check('empty clickable row now renders difference body, root, neck and bead',!proof[1].state.interactive&&proof[1].state.mat===0&&proof[1].state.tail&&proof[1].state.beads.length>0&&proof[1].outside>500&&proof[1].canvas.difference==='visible'&&proof[1].canvas.media==='hidden',{state:proof[1].state,outsideBodyPixels:proof[1].outside,canvas:proof[1].canvas});results.diagnosis=proof;
 const P=await open('ripple=reference');await P.ev('document.querySelector(".toc a[data-route=workload]").scrollIntoView({block:"center"});1');await sleep(700);
 const identity=await P.ev('(()=>{const e=document.querySelector("#sec-overview > #hero > ol.evidence");return {selector:"#sec-overview > #hero > ol.evidence",values:[...e.querySelectorAll(".fig,.fig-m,.fig-s")].map(e=>e.textContent),media:e.closest("[data-cursor-media]").id,index:document.querySelector("#sec-overview > section.index").parentElement.id};})()');
 check('exact summary DOM contains all four approved values',identity.media==='hero'&&['2.97×','2.45×','458/458','600.34 s'].every(v=>identity.values.includes(v)),identity);results.summaryDOM=identity;
 // Real pointer cases: CSS hover/thumb behaviour is not bypassed here.
 for(const [name,expr,wantHover]of [
  ['empty horizontal row space',`(()=>{const b=document.querySelector('.toc a[data-route=workload]').getBoundingClientRect();return [160,b.top+b.height/2];})()`,false],
  ['direct row text',`(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.toc a[data-route=workload] .t'));const b=r.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];})()`,true],
  ['divider between rows',`(()=>{const b=document.querySelector('.toc a[data-route=workload]').getBoundingClientRect();return [500,b.top+.3];})()`,false],
  ['right thumbnail',`(()=>{const b=document.querySelector('.toc a[data-route=workload] .thumb').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];})()`,true]]){
   const [x,y]=await P.ev(expr);await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:0,button:'none'});await sleep(350);
   const sn=await P.ev('HeliosLiquidCursor.status()');check('index '+name+' local hover and difference',sn.material.value===0&&sn.interactive===wantHover&&!sn.ignored,{interactive:sn.interactive,material:sn.material.value,visible:sn.visible});
 }
 // Same target element, different visible-content hit: guards the cached-target path in onMove.
 await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:83,y:450,buttons:0,button:'none'});await sleep(160);await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:160,y:450,buttons:0,button:'none'});await sleep(160);
 const cached=await P.ev('({target:document.elementFromPoint(160,450)?.className,interactive:HeliosLiquidCursor.status().interactive})');check('moving within the same number span rechecks local hover',!cached.interactive,cached);
 await P.ev(drv);const cy=await P.ev('(()=>{const b=document.querySelector(".toc a[data-route=workload]").getBoundingClientRect();return Math.round(b.top+b.height/2);})()');const n=await P.ev(`__pv.run([{dx:0,dy:1,v:4200,ms:100,ramp:20},{dx:0,dy:-1,v:3600,ms:60}],160,${cy},0)`);await P.ev(`__pv.stepTo(${n});1`);
 const live=await P.ev(snapshot);const text=await P.ev('(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector(".toc a[data-route=workload] .t"));const b=r.getBoundingClientRect();return [b.left+8,b.top+b.height/2];})()');await P.ev(`__pv.feed(${text[0]},${text[1]});1`);const entering=await P.ev(snapshot);
 check('text hover calms generation without hiding the existing outside trail',entering.state.interactive&&entering.state.tail&&entering.state.beads.length>0&&entering.outside>100&&entering.state.mat===0,{length:entering.state.L,beads:entering.state.beads.length,outside:entering.outside});results.hoverCarry=entering;
 rows.push({label:'Generated tail entering actual link text',cells:[await P.shot(60,cy-130,650,360)]});
 await P.ev('HeliosLiquidCursor.test.setFrozen(false);1');await P.s('Input.dispatchMouseEvent',{type:'mousePressed',x:160,y:cy,button:'left',buttons:1,clickCount:1});await P.s('Input.dispatchMouseEvent',{type:'mouseReleased',x:160,y:cy,button:'left',buttons:0,clickCount:1});await sleep(850);check('empty row space remains a clickable Workload link',await P.ev('location.hash==="#workload"'));await P.close();
 // All seven live row backgrounds: fast vertical movement, no forced material or synthetic hover override.
 for(const id of ids.slice(1)){
  const F=await open();await F.ev(`document.querySelector('.toc a[data-route="${id}"]').scrollIntoView({block:'center'});1`);await sleep(500);await F.ev(drv);
  const y=await F.ev(`(()=>{const b=document.querySelector('.toc a[data-route="${id}"]').getBoundingClientRect();return Math.round(b.top+b.height/2);})()`),n=await F.ev(`__pv.run([{dx:0,dy:1,v:4200,ms:100,ramp:20},{dx:0,dy:-1,v:3600,ms:60}],160,${y},0)`);await F.ev(`__pv.stepTo(${n});1`);const sn=await F.ev(snapshot);
  check(id+' index row shows full black Goo',sn.state.mat===0&&sn.state.tail&&sn.state.beads.length>0&&sn.outside>500,{L:sn.state.L,beads:sn.state.beads.length,outside:sn.outside});rows.push({label:id+' / real row background',cells:[await F.shot(60,y-130,650,360)]});(results.indexRows||=[]).push({id,...sn});await F.close();
 }
 writeFileSync(join(OUT,'01-index-difference-goo.png'),await labelledSheet(B,{title:'Overview numbered index: original difference + full Reference Goo',note:'Original full-row hover suppressed generation. Local text/thumb hover preserves controls; empty row background now generates the frozen body/root/neck/beads.',columns:['Actual page crop'],rows}));
 // Actual summary hover preserves its current RGB treatment at every requested value.
 const S=await open('ripple=reference');await S.ev('HeliosLiquidCursor.test.ripple.capture()');await S.ev(drv);
 for(const sel of ['.evidence .lead .fig','.evidence li:nth-child(2) .fig-m','.evidence li:nth-child(3) .fig-m','.evidence li:nth-child(4) .fig-m']){
  const [x,y,value]=await S.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}),b=e.getBoundingClientRect();return [Math.round(b.left+Math.min(24,b.width*.15)),Math.round(b.top+b.height*.5),e.textContent];})()`);await S.ev(`__pv.ready(${x},${y});__pv.hold(800);1`);await sleep(200);await S.ev('__pv.hold(300);1');
  const sn=await S.ev('(()=>{const T=HeliosLiquidCursor.test,m=T.readMediaMask();let rgb=0;for(let i=0;i<m.px.length;i+=4)if(m.px[i+3]>10&&Math.max(m.px[i],m.px[i+1],m.px[i+2])-Math.min(m.px[i],m.px[i+1],m.px[i+2])>10)rgb++;return {material:HeliosLiquidCursor.status().material,rgb};})()');check(value+' summary retains Target RGB refraction',sn.material.value===1&&sn.material.water==='target'&&sn.material.refraction===1&&sn.rgb>10,{rgb:sn.rgb,source:sn.material.refracting});summaryShots.push({label:value,cells:[await S.shot(Math.max(0,x-100),Math.max(0,y-70),260,180)]});
 }
 writeFileSync(join(OUT,'02-performance-summary-glass.png'),await labelledSheet(B,{title:'Performance summary remains approved Target glass with rainbow refraction',columns:['Unchanged material / actual values'],rows:summaryShots}));
 const centre=await S.ev('(()=>{const b=document.querySelector(".evidence").getBoundingClientRect();return Math.round(b.top+b.height*.5);})()');await S.close();
 const pairs=[];
 for(const [name,sel,scroll,material]of [['Performance summary','#sec-overview > #hero > ol.evidence',0,1],['Numbered index','#sec-overview > section.index',900,0]]){
  const F=await open('ripple=reference');await F.ev(`window.scrollTo(0,${scroll});const e=document.createElement('div');e.style.cssText='position:fixed;inset:0;z-index:95;pointer-events:auto;background:none';e.setAttribute('aria-hidden','true');document.querySelector(${JSON.stringify(sel)}).append(e);1`);await sleep(850);await F.ev('HeliosLiquidCursor.test.ripple.capture()');await F.ev(drv);
  const n=await F.ev(`__pv.run([{dx:1,dy:0,v:4200,ms:180,ramp:20},{dx:-1,dy:0,v:3600,ms:70}],1100,${centre},0)`);await F.ev(`__pv.stepTo(${n});1`);await sleep(150);const sn=await F.ev(snapshot);
  check(name+' controlled identical-input flick chooses intended material',sn.state.mat===material&&sn.state.tail&&sn.state.beads.length===3,{material:sn.state.mat,L:sn.state.L,beads:sn.state.beads.length});pairs.push({name,...sn,image:await F.shot(850,Math.max(0,centre-140),520,280)});await F.close();
 }
 const geometry=p=>JSON.stringify([p.state.x,p.state.y,p.state.E,p.state.L,p.state.tail,p.state.pts,p.state.beads,p.body,p.seed]);check('same summary/index input yields exact identical body/Goo/RNG',geometry(pairs[0])===geometry(pairs[1]),{L:pairs[0].state.L,beads:pairs[0].state.beads.length});
 results.materialPair=pairs.map(({image,...p})=>p);
 writeFileSync(join(OUT,'03-side-by-side-routing.png'),await labelledSheet(B,{title:'Same production state: summary glass / index difference',note:'Transparent hit-test children neutralize link hover only for this controlled comparison. Material remains automatic through actual DOM ancestry; real text/empty-space cases are checked separately.',columns:['Performance summary / Target','Numbered index / difference'],rows:[{label:'Same 50.95 px tail + three beads',cells:pairs.map(p=>p.image)}]}));
}
async function sidebar(){
 const prior=readFileSync(join(QA,'before-sidebar-routing/liquid-cursor.js'),'utf8'),comparisons=[],captures=[];
 const snap=`(()=>{const T=HeliosLiquidCursor.test,s=__pv.snap(),m=s.mat===0?T.readMask():T.readMediaMask();return {state:s,body:JSON.parse(JSON.stringify(T.B)),seed:T.D.seed,material:HeliosLiquidCursor.status().material,covered:m?Array.from(m.px).filter((v,i)=>i%4===3&&v>0).length:0,layers:{difference:getComputedStyle(T.canvas).visibility,media:getComputedStyle(T.M.canvas).visibility}};})()`;
 for(const [label,override,want]of [['Before / inherited hero glass',prior,1],['After / nav difference',null,0]]){
  const P=await open('ripple=reference',override);await P.ev('document.querySelector("#nav").classList.add("open");1');await sleep(650);await P.ev(drv);
  const n=await P.ev('__pv.run([{dx:0,dy:1,v:4200,ms:100,ramp:20},{dx:0,dy:-1,v:3600,ms:60}],279,430,0)');await P.ev(`__pv.stepTo(${n});1`);const sn=await P.ev(snap);comparisons.push(sn);captures.push({label,cells:[await P.shot(0,270,420,350)]});
  check(label+' full Goo and intended routing',sn.state.mat===want&&sn.state.tail&&sn.state.L>30&&sn.state.beads.length>0&&sn.covered>1000,{material:sn.state.mat,L:sn.state.L,beads:sn.state.beads.length,layers:sn.layers});await P.close();
 }
 const geo=s=>JSON.stringify([s.state.x,s.state.y,s.state.E,s.state.L,s.state.tail,s.state.pts,s.state.beads,s.state.hov,s.body,s.seed]);check('sidebar material change preserves exact body/Goo/RNG',geo(comparisons[0])===geo(comparisons[1]));results.sidebarComparison=comparisons;
 writeFileSync(join(OUT,'01-sidebar-goo.png'),await labelledSheet(B,{title:'Left sidebar only: inherited glass removed, black difference + unchanged Goo',note:'Same real sidebar background and deterministic flick; link-hover behavior is untouched.',columns:['Actual panel / body + connected neck + bead'],rows:captures}));
 const P=await open('ripple=reference');
 // Actual native mouse opens the panel through the rail.
 await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:180,buttons:0,button:'none'});await sleep(400);
 check('real rail hover opens the sidebar in difference',await P.ev('document.querySelector("#nav").classList.contains("open")&&HeliosLiquidCursor.status().material.value===0'));
 const rows=[];
 for(const [name,sel,wantHover]of [['brand','.navpanel .brand',false],['Overview row','.navpanel a[data-id=overview] .t',true],['Render row','.navpanel a[data-id=render] .t',true],['Workload row','.navpanel a[data-id=workload] .t',true],['numeric badge','.navpanel a[data-id=workload] kbd',true],['panel padding',null,false]]){
  const [x,y]=sel?await P.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];})()`):[279,480];await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:0,button:'none'});await sleep(200);const st=await P.ev('HeliosLiquidCursor.status()');
  check('sidebar '+name+' black/difference',st.material.value===0&&!st.material.media&&st.material.refraction===0&&st.interactive===wantHover,{value:st.material.value,hover:st.interactive,source:st.material.refracting});rows.push({label:name,cells:[await P.shot(0,0,365,680)]});
 }
 // Hero and every requested summary metric retain automatic Target/source routing.
 await P.ev('document.querySelector("#nav").classList.remove("open");1');await sleep(400);check('closing sidebar under a still pointer restores the underlying hero',await P.ev('HeliosLiquidCursor.status().material.value===1'));await P.ev('HeliosLiquidCursor.test.ripple.capture()');await P.ev(drv);
 for(const [name,sel]of [['hero title','.wordmark'],['hero render',null],['2.97×','.evidence .lead .fig'],['2.45×','.evidence li:nth-child(2) .fig-m'],['458/458','.evidence li:nth-child(3) .fig-m'],['600.34 s','.evidence li:nth-child(4) .fig-m']]){
  const [x,y]=sel?await P.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [Math.round(b.left+Math.min(24,b.width*.15)),Math.round(b.top+b.height*.5)];})()`):[1300,300];await P.ev(`__pv.ready(${x},${y});__pv.hold(700);1`);await sleep(250);await P.ev('__pv.hold(300);1');const st=await P.ev('HeliosLiquidCursor.status()');
  check(name+' keeps Target glass/source',st.material.value===1&&st.material.water==='target'&&st.material.refraction===1,{source:st.material.refracting,glass:st.material.water});
 }
 await P.ev('document.querySelector(".toc a[data-route=workload]").scrollIntoView({block:"center"});1');await sleep(600);const y=await P.ev('(()=>{const b=document.querySelector(".toc a[data-route=workload]").getBoundingClientRect();return Math.round(b.top+b.height/2);})()');const n=await P.ev(`__pv.run([{dx:0,dy:1,v:4200,ms:100,ramp:20},{dx:0,dy:-1,v:3600,ms:60}],160,${y},0)`);await P.ev(`__pv.stepTo(${n});1`);const idx=await P.ev(snap);check('numbered index keeps difference + full Goo',idx.state.mat===0&&idx.state.tail&&idx.state.beads.length>0,{L:idx.state.L,beads:idx.state.beads.length});await P.close();
 writeFileSync(join(OUT,'02-sidebar-surfaces.png'),await labelledSheet(B,{title:'Real mouse: nav brand, rows, right badges and panel background all remain difference',columns:['Actual opened nav'],rows}));
 // Two real nav/material boundaries and hero-summary-index scroll transitions, compared to forced difference geometry.
 const run=async force=>{const F=await open('ripple=reference');await F.ev('document.querySelector("#nav").classList.add("open");1');await sleep(650);await F.ev(drv);await F.ev(`HeliosLiquidCursor.test.setMaterial(${force});1`);
  const all=[],tests=[];for(const y of [430,790]){
   await F.ev(`__pv.ready(279,${y});__pv.hold(400);1`);const a=await F.ev(`(()=>{const H=__pv,T=HeliosLiquidCursor.test,fr=[];const put=()=>{const s=H.snap();fr.push({g:[s.x,s.y,s.E,s.L,s.tail,s.pts,s.beads,s.hov,T.D.seed],mat:s.mat,media:s.media,presence:s.presence,dv:getComputedStyle(T.canvas).visibility,mv:getComputedStyle(T.M.canvas).visibility,mt:T.M.tiles.tiles.some(t=>t.visible),dt:T.tiles().tiles.some(t=>t.visible)});};for(const target of [460,279,460,279]){const x0=T.S.rawX;for(let i=1;i<=30;i++){H.feed(x0+(target-x0)*i/30,${y});put();}H.hold(150);put();}return fr;})()`);all.push(...a);tests.push({y,end:a[a.length-1].mat});
  }
  // Keep a pointer through nav -> hero -> summary -> index -> hero with stationary re-hit-test on scroll.
  await F.ev('HeliosLiquidCursor.test.setFrozen(false);1');for(const [name,x,y,scroll,want]of [['nav',279,430,0,0],['hero',900,430,0,1],['summary',300,760,0,1],['index',160,430,1150,0],['hero return',900,430,0,1]]){
   await F.ev(`window.scrollTo(0,${scroll});1`);await F.s('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:0,button:'none'});await sleep(350);const m=await F.ev('HeliosLiquidCursor.status().material.value');if(force==='null')check('settled nav/hero/summary/index boundary '+name,m===want,{material:m});
  }await F.close();return {all,tests};};
 const auto=await run('null'),diff=await run('0');const identical=auto.all.every((f,i)=>JSON.stringify(f.g)===JSON.stringify(diff.all[i].g));const noMissing=auto.all.every(f=>f.dv==='visible'||f.mv==='visible');const noStale=auto.tests.every(t=>t.end===0)&&auto.all.every(f=>f.mat!==0||(!f.mt&&f.mv==='hidden'));
 check('nav/hero and nav/summary crossings preserve exact geometry and coverage',identical&&noMissing,{frames:auto.all.length,geometryIdentical:identical,noMissing});check('crossings settle difference without stale glass/bead tiles',noStale,{settled:auto.tests});results.boundaries={frames:auto.all.length,identical,noMissing,noStale};
}
async function hero(){
 const P=await open('ripple=reference');await P.ev('document.head.insertAdjacentHTML("beforeend","<style>.hero-stage{transform:none!important}</style>");1');await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:465,y:392,buttons:0,button:'none'});await sleep(800);
 const rows=[{label:'initial',cells:[await P.shot(70,315,570,160)]}],cycles=[];
 for(let i=0;i<50;i++){
  await P.ev('window.scrollTo(0,1150);1');await sleep(i%2?70:35);await P.ev('window.scrollTo(0,0);1');await sleep(i%2?240:160);
  const st=await P.ev('(()=>{const T=HeliosLiquidCursor.test,a=HeliosLiquidCursor.status();return {color:getComputedStyle(document.querySelector(".wordmark")).color,material:a.material.value,blend:getComputedStyle(T.canvas).display,gen:T.R.hero.gen,ok:T.R.hero.ok,dirty:T.R.hero.dirty};})()');cycles.push(st);
  if([0,1,9,49].includes(i)){await sleep(700);rows.push({label:'re-entry #'+(i+1),cells:[await P.shot(70,315,570,160)]});}
 }
 check('50 hero re-entry cycles restore glass and black text after the original material fade',cycles.every(x=>x.color==='rgb(27, 30, 33)'&&x.material===1&&x.blend==='none'),{cycles});await sleep(800);const final=await P.ev('HeliosLiquidCursor.status().material');check('hero fresh source settles ready',final.heroOptic.ok&&!final.heroOptic.dirty&&final.refraction===1,{final});
 writeFileSync(join(OUT,'01-hero-reentry.png'),await labelledSheet(B,{title:'Hero re-entry after repeated fast/slow scroll cycles',note:'Text styling is unchanged. The index is difference. After the original 100 ms fade, hero glass alone remains and fresh source generations own re-entry.',columns:['HELIOS re-entry'],rows}));await P.close();
}
async function reliability(){
 const logs=[],rows=[];
 for(const [id,x,y,count] of [['overview',390,392,30],['workload',700,170,25],['performance',800,170,25],['render',550,420,20]]){
  const P=await open('ripple=reference');await P.ev(`location.hash='${id}';1`);await sleep(1100);await P.ev('HeliosLiquidCursor.test.ripple.capture();');
  for(let i=0;i<count;i++){
   const v=await P.ev(`(async()=>{const T=HeliosLiquidCursor.test.ripple;T.cancel('case reset');await T.capture();const e=document.elementFromPoint(${x},${y});e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0,clientX:${x},clientY:${y}}));e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1,clientX:${x},clientY:${y}}));e.classList.add('__harmless-hover');e.style.setProperty('--hover-test','1');e.focus?.();await new Promise(r=>setTimeout(r,90));const a=HeliosLiquidCursor.status().ripple;T.freeze();T.at(120);const source=T.readSource();T.at(120);const data=T.readWave().px;let visible=0;for(let py=0;py<900;py++)for(let px=0;px<1440;px++){const n=((899-py)*1440+px)*4,ss=(py*1440+px)*4,a=data[n+3]/255;if(a>.1&&Math.max(...[0,1,2].map(c=>Math.abs(data[n+c]-source.px[ss+c]*a)))>8)visible++;}T.at(3100);T.freeze(false);e.classList.remove('__harmless-hover');return {instantiated:a.count>0,visible,latency:a.latencyMs,cancel:a.lastCancel,draws:a.draws};})()`);
   logs.push({id,i,...v});if(i===0){await P.ev(`HeliosLiquidCursor.test.ripple.freeze();HeliosLiquidCursor.test.ripple.trigger(${x},${y})`);await P.ev('HeliosLiquidCursor.test.ripple.at(180);1');rows.push({label:id+' / reliable click',cells:[await P.shot(Math.max(0,x-200),Math.max(0,y-90),400,190)]});await P.ev('HeliosLiquidCursor.test.ripple.at(3100);HeliosLiquidCursor.test.ripple.freeze(false);1');}
  }await P.close();
 }
 check('100 eligible stationary clicks establish visible waves despite harmless styles',logs.length===100&&logs.every(x=>x.instantiated&&x.visible>100),{issued:logs.length,visible:logs.filter(x=>x.visible>100).length,missed:logs.filter(x=>!x.instantiated||x.visible<=100)});results.clicks=logs;
 writeFileSync(join(OUT,'04-ripple-reliability.png'),await labelledSheet(B,{title:'100/100 eligible stationary clicks displace source pixels',note:'Hover, focus, transient style and internal cursor changes do not cancel the wave.',columns:['Actual page / pressure + recovery'],rows}));
 writeFileSync(join(OUT,'ripple-reliability.json'),JSON.stringify(logs,null,2));
}
async function temporal(){
 const rows=[],old=readFileSync(join(QA,'prepass/liquid-cursor.js'),'utf8');
 for(const [label,override] of [['Approved prior ripple',old],['Pressure + recovery',null]]){
  const P=await open('ripple=reference',override);await P.ev('document.head.insertAdjacentHTML("beforeend","<style>.hero-stage{transform:none!important}.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>");HeliosLiquidCursor.test.ripple.freeze();1');await sleep(650);await P.ev('HeliosLiquidCursor.test.ripple.capture();');await P.ev('HeliosLiquidCursor.test.ripple.trigger(390,392)');
  const shots=[];for(const t of [0,50,100,180,300,500,800,1200,3100]){await P.ev(`HeliosLiquidCursor.test.ripple.at(${t});1`);shots.push(await P.shot(90,275,650,265));}
  rows.push({label,cells:shots});await P.close();
 }
 writeFileSync(join(OUT,'05-ripple-temporal.png'),await labelledSheet(B,{title:'Same HELIOS source and origin: old wave / pressure + recovery',columns:['0 ms','50','100','180','300','500','800','1200','final'],rows}));
}

async function precision(){
 const P=await open('ripple=reference');await P.ev('location.hash="scheduler";1');await sleep(1000);await P.ev('document.querySelector("#sc-scrub").scrollIntoView({block:"center"});1');await sleep(700);
 const point=await P.ev('(()=>{const b=document.querySelector("#sc-scrub").getBoundingClientRect();return [b.left+b.width*.5,b.top+b.height*.5];})()'),rows=[];
 for(let i=0;i<20;i++)for(const [name,x,y,native]of [['ordinary difference',point[0],point[1]-65,false],['native range',...point,true],['restored difference',point[0],point[1]-65,false]]){
  await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:0,button:'none'});await sleep(30);const st=await P.ev('HeliosLiquidCursor.status()');
  check('precision cycle '+i+' '+name,native?st.ignored&&!st.visible:!st.ignored&&st.visible&&st.material.value===0,{mode:st.material.presentation,visible:st.visible});
  if(i===19)rows.push({label:name,cells:[await P.shot(Math.max(0,x-170),Math.max(0,y-85),340,170)]});
 }
 writeFileSync(join(OUT,'06-precision-zones.png'),await labelledSheet(B,{title:'Original difference / native range / difference restoration',columns:['Actual Scheduler UI'],rows}));await P.close();
}
async function surfaces(){
 const txt=readFileSync('labs/liquid-cursor/tools/polish-evidence.mjs','utf8'),defs=txt.slice(txt.indexOf('  function nearby('),txt.indexOf('  // ---------------------------------------------------------------- 8.'));
 const classify=Function('decodePNG','encodePNG',defs+';return glassDarkness;')(decodePNG,encodePNG),rows=[],targets=[];
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{w:1920,h:1080,dpr});await P.ev(drv);
  for(const [id,sel]of [['overview','.wordmark'],['overview','.evidence .lead'],['overview','.evidence li:nth-child(2) .fig-m'],['overview','.evidence li:nth-child(3) .fig-m'],['overview','.evidence li:nth-child(4) .fig-m'],['overview','.hero-sub'],['overview','.hero-desc'],['overview','.evidence li:nth-child(2) .fig-s'],['overview','.evidence li:nth-child(4) .fig-label']]){
   // Sticky hero descendants must be measured in their actual viewport. scrollIntoView can scroll the document into
   // the numbered index while leaving the requested hero child offscreen, accidentally testing difference instead.
   await P.ev(`location.hash='${id}';window.scrollTo({top:0,behavior:'instant'});1`);await sleep(1000);await P.ev('HeliosLiquidCursor.test.ripple.capture()');
   const [x,y]=await P.ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [Math.round(b.left+b.width*.5),Math.round(b.top+b.height*.5)];})()`);await P.ev(`__pv.ready(${x},${y});__pv.hold(800);1`);await sleep(500);await P.ev('__pv.hold(300);1');
   targets.push({sel,dpr,x,y,state:await P.ev('HeliosLiquidCursor.status().material')});
   const clip=[Math.max(0,Math.min(1640,x-140)),Math.max(0,Math.min(880,y-100)),280,200],a=await P.shot(...clip);
   await P.ev('document.head.insertAdjacentHTML("beforeend","<style id=__withoutCursor>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>");1');const b=await P.shot(...clip);await P.ev('document.getElementById("__withoutCursor").remove();1');const m=classify(a,b,32*dpr,.04);
   check(id+' '+sel+' bounded-source dark/RGB artifacts DPR'+dpr,m.nNew===0&&m.nColour===0,{dark:m.nNew,isolated:m.nColour,compatible:m.nChromatic});
   if(dpr===1)rows.push({label:id+' '+sel,cells:[a]});
  }await P.close();
 }
 check('all 18 artifact probes actually hit approved hero/summary Target glass',targets.every(t=>t.x>=0&&t.x<1920&&t.y>=0&&t.y<1080&&t.state.media&&t.state.value===1&&t.state.water==='target'),{targets});
 writeFileSync(join(OUT,'07-dark-light-surfaces.png'),await labelledSheet(B,{title:'Approved Target on hero and performance summary',note:'Source-derived RGB; unchanged 32 CSS px reach and 4% artifact envelope. Numbered index and other pages retain difference.',columns:['Native source + Target'],rows}));
}
async function perf(){
 for(const [id,dpr]of [['overview',1],['workload',1],['render',1],['overview',2],['workload',2],['render',2]]){
  const P=await open('ripple=reference',null,{dpr});await P.ev(`location.hash='${id}';1`);await sleep(1250);await P.ev('HeliosLiquidCursor.test.ripple.capture()');
  const before=await P.ev('HeliosLiquidCursor.status()');await P.ev(drv);await P.ev('__pv.ready(900,170);__pv.hold(600);1');const n=await P.ev('__pv.run([{dx:1,dy:0,v:3500,ms:200,ramp:20}],1100,170,20)');await P.ev(`__pv.stepTo(${n});1`);
  const after=await P.ev('HeliosLiquidCursor.status()');check(id+' no capture per simulated movement DPR'+dpr,before.ripple.captures===after.ripple.captures,{before:before.ripple.captures,after:after.ripple.captures});
  await P.ev('HeliosLiquidCursor.test.setFrozen(false);1');await sleep(1500);const a=await P.ev('HeliosLiquidCursor.status()');await sleep(500);const b=await P.ev('HeliosLiquidCursor.status()');
  check(id+' settled source/ripple quiet DPR'+dpr,a.ripple.captures===b.ripple.captures&&a.ripple.draws===b.ripple.draws&&!b.ripple.loop,{captures:b.ripple.captures,main:b.ripple.mainMs,total:b.ripple.captureMs});
  const f=await P.ev('(async()=>{const T=HeliosLiquidCursor.test.ripple,dt=[];let last=0,done=false;const sample=t=>{if(last)dt.push(t-last);last=t;if(!done)requestAnimationFrame(sample)};requestAnimationFrame(sample);await Promise.all(Array.from({length:8},(_,i)=>T.trigger(550+50*i,170)));await new Promise(r=>setTimeout(r,3100));done=true;return {fps:dt.length*1000/dt.reduce((a,b)=>a+b,0),state:HeliosLiquidCursor.status()};})()');
  (results.performance||=[]).push({id,dpr,...f});check(id+' active burst remains bounded and sleeps DPR'+dpr,f.fps>45&&!f.state.ripple.loop&&f.state.ripple.count===0,{fps:f.fps,callback:f.state.ripple.maxCallbackMs,latency:f.state.ripple.latencyMs});await P.close();
 }
}
async function navigation(){
 const P=await open('ripple=reference'),rows=[];await P.ev('HeliosLiquidCursor.test.ripple.capture()');
 await P.ev('HeliosLiquidCursor.test.ripple.trigger(390,392)');await sleep(100);const a=await P.ev('HeliosLiquidCursor.status().ripple');await P.ev('window.scrollTo(0,1);1');await sleep(30);const jitter=await P.ev('HeliosLiquidCursor.status().ripple');check('one-pixel scroll jitter retains visible ripple',a.active&&jitter.active,{count:jitter.count});
 await P.ev('window.scrollTo(0,140);1');await sleep(60);const moved=await P.ev('HeliosLiquidCursor.status().ripple');check('meaningful scroll cancels stale source',!moved.active&&!moved.loop&&moved.count===0,{reason:moved.lastCancel});await sleep(650);
 rows.push({label:'scroll / glass identity preserved',cells:[await P.shot(50,280,660,210)]});
 await P.ev('location.hash="workload";1');await sleep(1000);await P.ev('HeliosLiquidCursor.test.ripple.capture()');await P.ev('HeliosLiquidCursor.test.ripple.trigger(600,160)');await sleep(100);await P.ev('location.hash="scheduler";1');await sleep(100);const nav=await P.ev('HeliosLiquidCursor.status()');check('navigation cancels old source and retains original ordinary difference',nav.material.value===0&&!nav.ripple.active&&nav.ripple.count===0,{reason:nav.ripple.lastCancel});
 await sleep(1100);rows.push({label:'new Scheduler source',cells:[await P.shot(50,20,660,230)]});
 writeFileSync(join(OUT,'08-scroll-navigation.png'),await labelledSheet(B,{title:'Scroll / navigation retain intended materials and discard stale source',columns:['Actual destination'],rows}));await P.close();
}
async function bounds(){
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{w:1440,h:900,dpr});await sleep(700);
  await P.ev('HeliosLiquidCursor.test.ripple.freeze();HeliosLiquidCursor.test.ripple.capture()');
  await P.ev('Promise.all(Array.from({length:10},(_,i)=>HeliosLiquidCursor.test.ripple.trigger(i%2?1435:5,i%3?5:895)))');await P.ev('HeliosLiquidCursor.test.ripple.at(80);1');
  const burst=await P.ev('HeliosLiquidCursor.status().ripple');check('rapid burst bounded at eight DPR'+dpr,burst.count===8&&burst.origins.some(v=>v[0]===1435)&&burst.origins.some(v=>v[0]===5),{count:burst.count,origins:burst.origins});
  const proof=await P.ev(`(()=>{
   const T=HeliosLiquidCursor.test.ripple,g=T.gl(),p=g.getParameter(g.CURRENT_PROGRAM),src=T.readSource(),w=src.w,h=src.h;T.at(80);const frame=T.readWave().px;
   const n=g.getUniform(p,g.getUniformLocation(p,'uCount')),amp=g.getUniform(p,g.getUniformLocation(p,'uAmplitude')),rp=Array.from({length:n},(_,i)=>Array.from(g.getUniform(p,g.getUniformLocation(p,'uWave['+i+']'))));
   let worst=0,cap=0,invalid=0,covered=[0,0,0,0],tested=0;
   const ss=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
   const sample=(xx,yy,ch)=>{xx=Math.min(w-1,Math.max(0,xx));yy=Math.min(h-1,Math.max(0,yy));const x=Math.floor(xx),y=Math.floor(yy),fx=xx-x,fy=yy-y,at=(a,b)=>src.px[(Math.min(h-1,b)*w+Math.min(w-1,a))*4+ch];return (at(x,y)*(1-fx)+at(x+1,y)*fx)*(1-fy)+(at(x,y+1)*(1-fx)+at(x+1,y+1)*fx)*fy;};
   for(let y=0;y<h;y+=Math.max(1,Math.floor(h/70)))for(let x=0;x<w;x+=Math.max(1,Math.floor(w/100))){
    const cx=(x+.5)/${dpr},cy=(y+.5)/${dpr};let ox=0,oy=0;for(const a of rp){const dx=cx-a[0],dy=cy-a[1],r=Math.hypot(dx,dy),q=(r-a[2]*500)/110,tr=q+.65,primary=Math.sin(q*2*Math.PI)*Math.exp(-2*q*q),recovery=.24*Math.sin(tr*2*Math.PI)*Math.exp(-1.2*tr*tr-.8*a[2]),v=(primary+recovery)*Math.exp(-1.8*a[2]-r/1100)*ss(0,.055,a[2])*(1-ss(2.35,3,a[2]))*amp;ox+=dx/Math.max(1,r)*v;oy+=dy/Math.max(1,r)*v;}
    const length=Math.hypot(ox,oy),k=Math.min(1,24/Math.max(length,.0001));ox*=k;oy*=k;cap=Math.max(cap,Math.hypot(ox,oy));const alpha=ss(.03,.35,Math.hypot(ox,oy)),index=((h-1-y)*w+x)*4;
    for(let ch=0;ch<3;ch++)worst=Math.max(worst,Math.abs(frame[index+ch]-sample((cx+ox)*${dpr}-.5,(cy+oy)*${dpr}-.5,ch)*alpha));
    if(frame[index+3])covered[(y>=h/2?2:0)+(x>=w/2?1:0)]++;if(frame[index+3]<Math.max(frame[index],frame[index+1],frame[index+2])-1)invalid++;tested++;
   }return {worst,cap,invalid,covered,tested,rp};})()`);
  check('GPU is bounded neutral source displacement, all quadrants DPR'+dpr,proof.worst<4&&proof.cap<=24.0001&&proof.invalid===0&&proof.covered.every(v=>v>0),proof);
  await P.ev('HeliosLiquidCursor.test.ripple.cancel("test reset");1');await sleep(550);await P.ev('HeliosLiquidCursor.test.ripple.freeze(false);1');
  await P.ev('window.__nativePressMs=-1;window.__nativeClickMs=-1;window.__coldStart=performance.now();document.addEventListener("pointerdown",()=>{__nativePressMs=performance.now()-__coldStart},{once:true});document.addEventListener("click",()=>{__nativeClickMs=performance.now()-__coldStart},{once:true});HeliosLiquidCursor.test.ripple.cancel("cold click test");1');
  const cold=await P.ev('(()=>{__coldStart=performance.now();const e=document.elementFromPoint(700,400);e.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,pointerType:"mouse",clientX:700,clientY:400}));e.dispatchEvent(new MouseEvent("click",{bubbles:true,detail:1,clientX:700,clientY:400}));return {press:__nativePressMs,click:__nativeClickMs};})()');check('cold source does not delay native handlers DPR'+dpr,cold.press<20&&cold.click<20,cold);await sleep(120);await P.ev('HeliosLiquidCursor.test.ripple.cancel("cold click complete");1');await sleep(450);
  await P.ev('(()=>{HeliosLiquidCursor.test.ripple.cancel("cancelled press test");const e=document.elementFromPoint(700,400);e.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,pointerType:"mouse",clientX:700,clientY:400}));e.dispatchEvent(new PointerEvent("pointercancel",{bubbles:true,pointerType:"mouse"}));return 1;})()');await P.ev('HeliosLiquidCursor.test.ripple.capture()');await P.ev('(()=>{const e=document.elementFromPoint(800,400);e.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,pointerType:"mouse",clientX:800,clientY:400}));e.dispatchEvent(new MouseEvent("click",{bubbles:true,detail:1,clientX:800,clientY:400}));return 1;})()');await sleep(60);const cancel=await P.ev('HeliosLiquidCursor.status().ripple');check('cancelled cold press cannot add an old origin DPR'+dpr,cancel.count===1&&JSON.stringify(cancel.origins)==='[[800,400]]',{origins:cancel.origins});await P.ev('HeliosLiquidCursor.test.ripple.cancel("cancelled press complete");1');await sleep(450);
  await P.ev('HeliosLiquidCursor.test.ripple.trigger(700,400)');await sleep(70);await P.ev('window.scrollTo(0,160);1');await sleep(80);let st=await P.ev('HeliosLiquidCursor.status().ripple');check('click then scroll cancels immediately DPR'+dpr,!st.active&&!st.loop&&st.count===0,{lastCancel:st.lastCancel});
  await sleep(600);await P.ev('HeliosLiquidCursor.test.ripple.capture()');st=await P.ev('HeliosLiquidCursor.status().ripple');check('scrolled source uses current viewport DPR'+dpr,st.ready&&st.scroll===160,{scroll:st.scroll,captureMs:st.captureMs});
  await P.ev('HeliosLiquidCursor.test.ripple.trigger(700,400)');await sleep(30);await P.s('Emulation.setDeviceMetricsOverride',{width:1380,height:900,deviceScaleFactor:dpr,mobile:false});await sleep(80);st=await P.ev('HeliosLiquidCursor.status().ripple');check('resize cancels DPR'+dpr,!st.active&&!st.loop&&st.count===0,{lastCancel:st.lastCancel});
  await P.ev('document.querySelector("#nav").classList.add("open");1');await sleep(650);const point=await P.ev('(()=>{const b=document.querySelector(".navpanel a[data-id=scheduler]").getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];})()');
  await P.s('Input.dispatchMouseEvent',{type:'mousePressed',x:point[0],y:point[1],button:'left',buttons:1,clickCount:1});await P.s('Input.dispatchMouseEvent',{type:'mouseReleased',x:point[0],y:point[1],button:'left',buttons:0,clickCount:1});await sleep(120);
  const nav=await P.ev('({hash:location.hash,ripple:HeliosLiquidCursor.status().ripple})');check('native nav works with no stale Overview DPR'+dpr,nav.hash==='#scheduler'&&!nav.ripple.active&&nav.ripple.count===0,{hash:nav.hash,lastCancel:nav.ripple.lastCancel});
  await P.ev('document.querySelector("#sc-scrub").scrollIntoView({block:"center"});document.querySelector("#sc-scrub").value=650;document.querySelector("#sc-scrub").dispatchEvent(new Event("input",{bubbles:true}));1');await sleep(450);const precision=await P.ev('(()=>{const e=document.querySelector("#sc-scrub"),b=e.getBoundingClientRect();HeliosLiquidCursor.test.feed(b.left+b.width/2,b.top+b.height/2,performance.now());return {value:e.value,ignored:HeliosLiquidCursor.status().ignored};})()');check('Scheduler precision still native DPR'+dpr,precision.ignored&&Number(precision.value)===650,precision);
  await P.ev('location.hash="overview";window.scrollTo(0,0);1');await sleep(850);await P.ev('HeliosLiquidCursor.test.ripple.capture()');
  const loss=await P.ev('HeliosLiquidCursor.test.ripple.lose()');await sleep(550);st=await P.ev('HeliosLiquidCursor.status().ripple');check('ripple context loss cancels safely DPR'+dpr,loss&&st.enabled&&!st.active&&!st.ready&&st.count===0,{reason:st.lastCancel});await P.ev('HeliosLiquidCursor.test.ripple.restore();1');await sleep(750);await P.ev('HeliosLiquidCursor.test.ripple.capture()');st=await P.ev('HeliosLiquidCursor.status().ripple');check('ripple context restores DPR'+dpr,st.ready,{reason:st.reason});
  const killMs=await P.ev('(()=>{const t=performance.now();HeliosLiquidCursor.test.failNow();return performance.now()-t;})()');st=await P.ev('({r:HeliosLiquidCursor.status().ripple,canvases:document.querySelectorAll(".lc-ripple").length})');check('kill frees ripple texture/canvas/cache DPR'+dpr,st.canvases===0&&st.r.memoryBytes===0&&!st.r.loop&&st.r.cacheEntries===0,{...st,killMs});
  check('behavior console DPR'+dpr,P.logs.length===0,{logs:P.logs});await P.close();
 }
 const file=await open();await file.s('Page.navigate',{url:pathToFileURL(resolve('assets/observatory/index.html')).href+'?cursor=test'});await sleep(600);const f=await file.ev('({activated:HeliosLiquidCursor.test.ripple.trigger(400,400),r:HeliosLiquidCursor.status().ripple})');check('file:// ripple disabled with no capture',!f.r.enabled&&f.r.captures===0&&f.r.draws===0,{r:f.r});check('file:// no exceptions',file.logs.length===0,{logs:file.logs});await file.close();
 const large=await open('',null,{w:3840,h:2160,dpr:2});await large.ev('HeliosLiquidCursor.test.ripple.capture()');const cap=await large.ev('HeliosLiquidCursor.status().ripple');check('4K source allocation bounded',cap.ready&&cap.memoryBytes<135000000&&cap.dpr<1.01,{bytes:cap.memoryBytes,scale:cap.dpr});await large.close();
 for(const [name,media]of [['reduced',[{name:'prefers-reduced-motion',value:'reduce'}]],['forced',[{name:'forced-colors',value:'active'}]],['coarse',[{name:'pointer',value:'coarse'}]]]){
  const P=await open('',null,{media,touch:name==='coarse'});const activated=await P.ev('HeliosLiquidCursor.test.ripple.trigger(400,400)');const st=await P.ev('HeliosLiquidCursor.status().ripple');check(name+' disables travelling waves',!activated&&st.draws===0&&st.captures===0,{st});await P.close();
 }
}


async function residue(){
 for(const id of ['overview','workload','render']){
  const P=await open('ripple=reference');await P.ev(`location.hash='${id}';1`);await sleep(1200);await P.ev('document.head.insertAdjacentHTML("beforeend","<style>.hero-stage{transform:none!important}</style>");1');await P.ev('HeliosLiquidCursor.test.ripple.capture()');await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:170,buttons:0,button:'none'});await sleep(300);
  await P.ev('window.dispatchEvent(new PointerEvent("pointerout",{bubbles:true,pointerType:"mouse",relatedTarget:null}));1');await sleep(150);const baseline=await P.shot();
  await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:600,y:170,buttons:0,button:'none'});await sleep(250);await P.ev('HeliosLiquidCursor.test.ripple.freeze();HeliosLiquidCursor.test.ripple.trigger(600,170)');await P.ev('HeliosLiquidCursor.test.ripple.at(180);1');
  await P.ev('HeliosLiquidCursor.test.ripple.at(3100);window.dispatchEvent(new PointerEvent("pointerout",{bubbles:true,pointerType:"mouse",relatedTarget:null}));1');await sleep(120);const final=await P.shot(),delta=changed(baseline,final);
  check(id+' glass/ripple departure has no source residue',delta.max<=2&&delta.pixels<1500,{...delta,overlay:await P.ev('getComputedStyle(HeliosLiquidCursor.test.ripple.canvas()).display')});await P.close();
 }
}
try{const modes=new Set(arg('--only','routing,hero').split(','));if(modes.has('inspect'))await inspect();if(modes.has('index'))await index();if(modes.has('sidebar'))await sidebar();if(modes.has('diagnose'))await diagnose();if(modes.has('routing'))await routing();if(modes.has('hero'))await hero();if(modes.has('reliability'))await reliability();if(modes.has('temporal'))await temporal();if(modes.has('precision'))await precision();if(modes.has('surfaces'))await surfaces();if(modes.has('perf'))await perf();if(modes.has('navigation'))await navigation();if(modes.has('bounds'))await bounds();if(modes.has('residue'))await residue();writeFileSync(join(OUT,arg('--report','focused-metrics.json')),JSON.stringify(results,null,2));console.log(results.checks.filter(c=>c.ok).length+'/'+results.checks.length+' passed');}finally{await B.close();clearInterval(keep);}
