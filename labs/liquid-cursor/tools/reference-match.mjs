// Temporary optical calibration/evidence. No public UI, no physics changes to production.
// --qa DIR holds the preserved rejected runtime and the external shader for isolated comparison only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep, labelledSheet, decodePNG, encodePNG } from './cdp.mjs';
const argv=process.argv.slice(2),arg=(k,d='')=>{const i=argv.indexOf(k);return i<0?d:argv[i+1];};
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),QA=arg('--qa'),OUT=join(ROOT,'labs/liquid-cursor/evidence/reference-match');
const mode=arg('--only','calibration'),HTTP='http://127.0.0.1:8315/assets/observatory/index.html';
mkdirSync(OUT,{recursive:true});
const OLD=readFileSync(join(QA,'prepass/liquid-cursor.js'),'utf8'),ref=readFileSync(join(QA,'reference-material.tsx'),'utf8');
const shaders={vert:ref.match(/const VERT = `([\s\S]*?)`/)[1],frag:ref.match(/const FRAG = `([\s\S]*?)`/)[1]};
const checkSource=readFileSync(join(ROOT,'labs/liquid-cursor/tools/check-observatory.mjs'),'utf8');
const driver=checkSource.slice(checkSource.indexOf('function installDriver()'),checkSource.indexOf('const around ='));
const B=await launch(),keep=setInterval(()=>{},1000),meta={when:new Date().toISOString(),browser:B.version,notes:'Native Helios diameter 68 CSS px; separate 240 px calibration only. External shader used only as isolated comparison.'};
async function open(q='',old=null,{w=900,h=620,dpr=1}={}) {
 const {targetId}=await B.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await B.send('Target.attachToTarget',{targetId,flatten:true});
 const s=(m,p)=>Promise.race([B.send(m,p,sessionId),new Promise((_,reject)=>setTimeout(()=>reject(Error('CDP '+m+' timeout')),20000))]);
 const logs=[],listener=(m)=>{if(m.sessionId!==sessionId)return;if(m.method==='Runtime.exceptionThrown')logs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
 if(m.method==='Fetch.requestPaused')s('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(old).toString('base64')});};
 B.listeners.add(listener);await s('Runtime.enable');await s('Page.enable');
 if(old)await s('Fetch.enable',{patterns:[{urlPattern:'*/liquid-cursor.js*'}]});
 await s('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:dpr,mobile:false});
 await s('Page.navigate',{url:HTTP+'?cursor=test&glass='+q+'&hero=b#overview'});
 const ev=async(expression)=>{const r=await s('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 for(let i=0;i<100;i++){if(await ev('document.readyState==="complete" && !!window.HeliosLiquidCursor?.test').catch(()=>false))break;await sleep(50);}
 await ev(`document.querySelector('.hero-count')?.dispatchEvent(new MouseEvent('mouseenter')),1`);await sleep(400);
 return {ev,logs,w,h,dpr,s,shot:async(x=0,y=0,cw=w,ch=h)=>{const sy=await ev('scrollY');return Buffer.from((await s('Page.captureScreenshot',{format:'png',clip:{x:Math.max(0,Math.min(x,w-cw)),y:sy+Math.max(0,Math.min(y,h-ch)),width:cw,height:ch,scale:1}})).data,'base64');},close:async()=>{B.listeners.delete(listener);await B.send('Target.closeTarget',{targetId});}};
}
async function plate(P) {
 await P.ev(`(() => { document.head.insertAdjacentHTML('beforeend','<style>#edge,#nav,.section.active{visibility:hidden!important}</style>');const c=document.createElement('canvas');c.id='match-plate';c.setAttribute('data-cursor-media','');c.width=innerWidth;c.height=innerHeight;c.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99';document.body.appendChild(c);const x=c.getContext('2d');x.fillStyle='#e8e6e2';x.fillRect(0,0,c.width,c.height);x.fillStyle='#1d1d1f';x.font='300 190px Bahnschrift';const out=[];for(const [ch,ox] of [['O',70],['S',330],['I',610],['E',720]]){x.fillText(ch,ox,310);const m=x.measureText(ch),y=Math.round(310-m.actualBoundingBoxAscent*(ch==='S'?0.27:0.5)),data=x.getImageData(0,y,c.width,1).data,runs=[];let start=-1;for(let p=ox;p<ox+m.width;p++){const dark=data[4*p]+data[4*p+1]+data[4*p+2]<200;if(dark&&start<0)start=p;if(!dark&&start>=0){runs.push([start,p-1]);start=-1;}}if(start>=0)runs.push([start,Math.floor(ox+m.width)-1]);const a=runs.at(-1)||[ox,ox+m.width];out.push([ch,Math.round((a[0]+a[1])/2-8),y]);}window.__calSpots=out;return out;})()`);
 await P.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);
}
async function at(P,x,y) {await P.ev(`__pv.ready(${x},${y}),__pv.hold(600),1`);await sleep(200);await P.ev('__pv.hold(600),1');await sleep(80);}
async function referenceRenderer(P,radius) {
 await P.ev(`(() => {HeliosLiquidCursor.kill();const src=document.getElementById('match-plate'),c=document.createElement('canvas');c.width=innerWidth;c.height=innerHeight;c.style.cssText='position:fixed;inset:0;z-index:101;width:100vw;height:100vh;pointer-events:none';document.body.appendChild(c);const g=c.getContext('webgl2',{alpha:false,preserveDrawingBuffer:true});const shader=(t,code)=>{const s=g.createShader(t);g.shaderSource(s,code);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s;};const p=g.createProgram();g.attachShader(p,shader(g.VERTEX_SHADER,${JSON.stringify(shaders.vert)}));g.attachShader(p,shader(g.FRAGMENT_SHADER,${JSON.stringify(shaders.frag)}));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.useProgram(p);g.bindVertexArray(g.createVertexArray());const u=n=>g.getUniformLocation(p,n);const t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,src);g.uniform1i(u('uTex'),0);g.uniform2f(u('uRes'),c.width,c.height);g.uniform1f(u('uDpr'),1);g.uniform1f(u('uMag'),1.12);g.uniform1f(u('uRefract'),.55);g.uniform1f(u('uFrost'),.18);g.uniform1f(u('uBgLum'),1);g.uniform4f(u('uMotion'),1,0,0,0);window.__reference=(x,y)=>{g.uniform4f(u('uLens'),x,c.height-y,${radius},1);g.viewport(0,0,c.width,c.height);g.drawArrays(g.TRIANGLES,0,3);g.finish();};return 1;})()`);
}
const spots=[['O',232,225],['S',461,260],['I',631,225],['E',791,205]];
async function calibration(baseline) {
 const cols=baseline?[['Rejected Helios Reference',OLD,34,false,'reference'],['Star shader, same diameter',null,34,true,'reference'],['Rejected Helios at 240 px',OLD.replace('radius: 34,','radius: 120,'),120,false,'reference'],['Star shader at 240 px',null,120,true,'reference']]
 :[['Rejected Reference',OLD,34,false,'reference'],['Match 1',null,34,false,'match1'],['Target',null,34,false,'target'],['Max',null,34,false,'max']];
 let actualSpots=spots;const rows=spots.map(([name])=>({label:name,cells:[]}));
 for(const [label,old,radius,isRef,q] of cols){const P=await open(q,old);await plate(P);actualSpots=await P.ev("__calSpots.map(([c,x,y])=>c==='E'?[c,x,y-16]:[c,x-8,y])");if(isRef)await referenceRenderer(P,radius);
  for(let i=0;i<actualSpots.length;i++){const [name,x,y]=actualSpots[i];if(isRef){await P.ev(`__reference(${x},${y})`);await sleep(80);}else await at(P,x,y);
   const cw=baseline?280:160,ch=baseline?280:160,shot=await P.shot(x-cw/2,y-ch/2,cw,ch);rows[i].cells.push(shot);writeFileSync(join(QA,`cal-${baseline?'baseline-':''}${label.replaceAll(' ','-')}-${name}.png`),shot);
   if(!isRef){const a=await P.ev(`(() => { const T=HeliosLiquidCursor.test,m=T.readMediaMask();let invalid=0,leak=0;for(let i=0;i<m.px.length;i+=4){const mx=Math.max(m.px[i],m.px[i+1],m.px[i+2]);if(mx>m.px[i+3]+1)invalid++;if(!m.px[i+3]&&mx)leak++;}return {invalid,leak,state:__pv.snap(),status:HeliosLiquidCursor.status().material};})()`);(meta.calibration||=[]).push({label,name,...a});}
  }meta[label+' console']=P.logs;await P.close();console.log('captured',label);}
 const title=baseline?'Radius diagnosis: rejected Helios vs isolated reference shader, at 68 and 240 CSS px diameter':'Native 68 CSS px optical calibration: rejected Reference / Match 1 / Target / Max';
 writeFileSync(join(OUT,baseline?'00-radius-diagnosis.png':'01-calibration.png'),await labelledSheet(B,{title,note:'Black O/S/I/E on the same pale canvas source. External shader runs only in this temporary diagnostic tab. Production physics and UI are unchanged.',columns:cols.map(c=>c[0]),rows}));
 if(!baseline){writeFileSync(join(OUT,'01-os-comparison.png'),await labelledSheet(B,{title:'Native O/S calibration: rejected Reference / Match 1 / Target / Max',note:'Same 68 CSS px silhouette; source-derived spectral refraction, neutral background.',columns:cols.map(c=>c[0]),rows:rows.slice(0,2)}));writeFileSync(join(OUT,'02-ei-comparison.png'),await labelledSheet(B,{title:'Native E/I calibration: rejected Reference / Match 1 / Target / Max',note:'Straight source strokes through the curved optical surface. No public calibration UI.',columns:cols.map(c=>c[0]),rows:rows.slice(2)}));}
}
async function realScene(render=false) {
 const cols=[['Rejected Reference',OLD,'reference'],['Match 1',null,'match1'],['Target',null,'target'],['Max',null,'max']],names=render?['metallic highlight boundary']:['O','S'],rows=names.map(label=>({label,cells:[]}));
 for(const [label,old,q] of cols){const P=await open(q,old,{w:1920,h:1080});
  await P.ev("document.head.insertAdjacentHTML('beforeend','<style>.hero-frame img{animation:none!important}.hero-frame,.hero-stage{transition:none!important}</style>'),document.querySelector('.hero-count')?.dispatchEvent(new MouseEvent('mouseenter')),1");
  if(render){await P.ev("location.hash='render',1");await sleep(900);}else{await P.ev("document.querySelectorAll('.hero-ticks button')[1].click(),1");await sleep(300);}
  await P.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);
  for(let i=0;i<names.length;i++){const name=names[i],point=render?await P.ev("(() => { const im=document.querySelector('#rl-img'),b=im.getBoundingClientRect();return [b.left+1215*b.width/im.naturalWidth,b.top+430*b.height/im.naturalHeight];})()")
   :await P.ev(`(() => {const e=document.querySelector('.wordmark'),t=[...e.childNodes].find(n=>n.nodeType===3),i=t.textContent.indexOf('${name}'),r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getBoundingClientRect(),w=b.width-(parseFloat(getComputedStyle(e).letterSpacing)||0);return [b.left+w*${name==='O'?.22:.5},b.top+b.height*.5];})()`);
   const [x,y]=point.map(Math.round);await at(P,x,y);await sleep(450);await P.ev('__pv.hold(300),1');const shot=await P.shot(x-90,y-80,180,160);rows[i].cells.push(shot);writeFileSync(join(QA,`${render?'render':'hero'}-${label.replaceAll(' ','-')}-${name.replaceAll(' / ','-')}.png`),shot);
  }meta[label+' console']=P.logs;await P.close();console.log('captured real',label);}
 writeFileSync(join(OUT,render?'04-render-comparison.png':'03-hero-comparison.png'),await labelledSheet(B,{title:render?'Actual Render Lab: rejected / Match 1 / Target / Max':'Actual HELIOS O/S, Hero B: rejected / Match 1 / Target / Max',note:'Native-resolution crops. Same source, cursor positions and physical geometry; optical sampling only differs.',columns:cols.map(c=>c[0]),rows}));
}
async function artifacts() {
 const text=readFileSync(join(ROOT,'labs/liquid-cursor/tools/polish-evidence.mjs'),'utf8'),defs=text.slice(text.indexOf('  function nearby('),text.indexOf('  // ---------------------------------------------------------------- 8.'));
 const classify=Function('decodePNG','encodePNG',defs+';return glassDarkness;')(decodePNG,encodePNG),results={},rows=[];
 const trajectories={horizontal:[[{dx:1,dy:0,v:4200,ms:200,ramp:20}],1000,560],diagonal:[[{dx:.7071,dy:.7071,v:4200,ms:200,ramp:20}],1250,720],curve:[[{dx:1,dy:0,v:4000,ms:240,ramp:20,turn:2.6}],1100,480],reversal:[[{dx:1,dy:0,v:4200,ms:140,ramp:20},{dx:-1,dy:0,v:4200,ms:140}],900,600],long:[[{dx:1,dy:-.1,v:5200,ms:260,ramp:15}],1550,430],title:[[{dx:-1,dy:.04,v:4600,ms:220,ramp:18}],420,548]};
 for(const dpr of [1,2])for(const q of ['target','max']){
  const w=dpr===1?1920:1440,h=dpr===1?1080:900,P=await open(q,null,{w,h,dpr});
  await P.ev("document.head.insertAdjacentHTML('beforeend','<style>.hero-frame img{animation:none!important}.hero-frame,.hero-stage{transition:none!important}</style>'),document.querySelector('.hero-count').dispatchEvent(new MouseEvent('mouseenter')),document.querySelectorAll('.hero-ticks button')[0].click(),1");await sleep(300);await P.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);await at(P,w-300,280);await sleep(400);const cfg=await P.ev('HeliosLiquidCursor.test.setWater(null)');
  for(const [name,[segs,X,Y]]of Object.entries(trajectories)){const x=Math.round(X*w/1920),y=Math.round(Y*h/1080),n=await P.ev(`__pv.run(${JSON.stringify(segs)},${x},${y},20)`),frames=[];
   for(const k of [n-26,n-20,n-10,n]){await P.ev(`__pv.run(${JSON.stringify(segs)},${x},${y},20)`);const sn=await P.ev(`__pv.stepTo(${k})`);await sleep(40);const halo=cfg.reach,cw=320+2*halo,ch=220+2*halo,clip=[Math.round(sn.x-cw/2),Math.round(sn.y-ch/2),cw,ch],a=await P.shot(...clip);
    await P.ev("document.head.insertAdjacentHTML('beforeend','<style id=__darkHidden>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>'),1");await sleep(40);const b=await P.shot(...clip);await P.ev("document.getElementById('__darkHidden').remove(),1");const m=classify(a,b,Math.ceil(halo*dpr),.04);frames.push({k,newDark:m.nNew,scalarDark:m.nScalarNew,isolatedColour:m.nColour,sourceColour:m.nChromatic,tail:sn.L,beads:sn.beads.length});
    if(dpr===1&&name==='title')rows.push({label:`${q} title whip, f${k}, new dark ${m.nNew}, isolated colour ${m.nColour}`,cells:[a,m.heat]});
   }
   results[`${q}-${name}-dpr${dpr}`]=frames;console.log('artifact',q,name,dpr,JSON.stringify(frames.map(f=>[f.newDark,f.isolatedColour])));
  }
  // Independent shading-only control, same aggressive title gesture.
  await P.ev('HeliosLiquidCursor.test.setWater({bend:0,mag:1,dispersion:0}),1');const [ss,X,Y]=trajectories.title,n=await P.ev(`__pv.run(${JSON.stringify(ss)},${Math.round(X*w/1920)},${Math.round(Y*h/1080)},20)`),sn=await P.ev(`__pv.stepTo(${n-20})`),clip=[Math.round(sn.x-160-cfg.reach),Math.round(sn.y-110-cfg.reach),320+2*cfg.reach,220+2*cfg.reach],a=await P.shot(...clip);
  await P.ev("document.head.insertAdjacentHTML('beforeend','<style id=__shadeHidden>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>'),1");await sleep(40);const b=await P.shot(...clip),m=classify(a,b,Math.ceil(cfg.reach*dpr),.04);results[`${q}-shading-dpr${dpr}`]={newDark:m.nNew,scalarDark:m.nScalarNew,isolatedColour:m.nColour};meta[q+' console '+dpr]=P.logs;await P.close();
 }
 meta.artifacts=results;writeFileSync(join(OUT,'05-fast-motion.png'),await labelledSheet(B,{title:'Focused Target / Max fast-motion strip',note:'Section 8 source-envelope method, unchanged 4% darkness threshold. Four frames per gesture, six gestures, DPR 1 and 2; candidate-specific legal reach and source halo. Independent shading-only control.',columns:['actual frame','source-compatible (cyan) / unexplained darkness (magenta) / isolated colour (orange)'],rows}));
}
async function normal() {
 const pictures=[],states=[];for(const [label,old,q]of [['Rejected',OLD,'reference'],['Target',null,'target']]){const P=await open(q,old,{w:1920,h:1080});await P.ev("location.hash='stress',1");await sleep(1000);await P.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);const ss=[{dx:1,dy:0,v:3000,ms:190,ramp:25}];await P.ev(`__pv.run(${JSON.stringify(ss)},1500,160,20),__pv.stepTo(20)`);await sleep(80);pictures.push(decodePNG((await P.shot(1150,60,520,240)).toString('base64')));states.push(await P.ev('JSON.stringify(__pv.snap())'));await P.close();}
 let changed=0,max=0;for(let y=0;y<pictures[0].h;y++)for(let x=0;x<pictures[0].w;x++){const a=pictures[0].px(x,y),b=pictures[1].px(x,y),d=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));if(d)changed++;max=Math.max(max,d);}meta.normal={changed,max,stateIdentical:states[0]===states[1]};console.log('normal',JSON.stringify(meta.normal));
}
try {const modes=new Set(mode.split(','));if(modes.has('baseline'))await calibration(true);if(modes.has('calibration'))await calibration(false);if(modes.has('hero'))await realScene(false);if(modes.has('render'))await realScene(true);if(modes.has('artifacts'))await artifacts();if(modes.has('normal'))await normal();writeFileSync(join(OUT,mode+'-metrics.json'),JSON.stringify(meta,null,2));}
finally{await B.close();clearInterval(keep);}
