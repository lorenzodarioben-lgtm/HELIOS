// Interaction-pass evidence and focused assertions; never loaded by the Observatory.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,sleep,labelledSheet,decodePNG,encodePNG} from './cdp.mjs';
const args=process.argv.slice(2),arg=(k,d='')=>args.includes(k)?args[args.indexOf(k)+1]:d;
const ROOT=process.cwd(),QA=arg('--qa'),OUT=resolve('labs/liquid-cursor/evidence/interaction-final');mkdirSync(OUT,{recursive:true});
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
async function motion(){
 const rows=[],states={},masks={},pictures={},before=readFileSync(join(QA,'prepass/liquid-cursor.js'),'utf8');
 const scenarios={rest:[],low:[{dx:1,dy:0,v:300,ms:200,ramp:20}],medium:[{dx:1,dy:0,v:1100,ms:200,ramp:20}],horizontal:[{dx:1,dy:0,v:2800,ms:200,ramp:20}],diagonal:[{dx:.7071,dy:.7071,v:2800,ms:200,ramp:20}],reversal:[{dx:1,dy:0,v:2800,ms:140,ramp:20},{dx:-1,dy:0,v:2800,ms:80}],stop50:[{dx:1,dy:0,v:2800,ms:200,ramp:20}],stop120:[{dx:1,dy:0,v:2800,ms:200,ramp:20}],stop250:[{dx:1,dy:0,v:2800,ms:200,ramp:20}]};
 const columns=['Approved difference / physical mask','Pre-fix Target','Coupled Target'];
 for(const [label,old,query,material] of [['physical',null,'ripple=off',0],['legacy',before,'ripple=off',1],['coupled',null,'ripple=off&motionOptics=coupled',1]]){
  const P=await open(query,old,{w:1440,h:900});
  await P.ev(`(()=>{const c=document.createElement('canvas');c.id='motion-plate';c.setAttribute('data-cursor-media','');c.width=innerWidth;c.height=innerHeight;c.style.cssText='position:fixed;inset:0;z-index:99;width:100vw;height:100vh';document.body.appendChild(c);const x=c.getContext('2d');x.fillStyle='#e8e6e2';x.fillRect(0,0,c.width,c.height);x.fillStyle='#1d1d1f';x.font='300 200px Bahnschrift';x.fillText('O S I E',600,510);return 1;})()`);
  await P.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);await P.ev(`HeliosLiquidCursor.test.setMaterial(${material});__pv.ready(780,430);__pv.hold(600);1`);await sleep(400);
  for(const [name,segs]of Object.entries(scenarios)){
   if(!segs.length)await P.ev('__pv.ready(780,430);__pv.hold(2500);1');else{const n=await P.ev(`__pv.run(${JSON.stringify(segs)},780,430,0)`);await P.ev(`__pv.stepTo(${n});${name.startsWith('stop')?`__pv.hold(${name.slice(4)});`:''}1`);}
   await sleep(40);const sn=await P.ev(`(()=>{const T=HeliosLiquidCursor.test;return {state:__pv.snap(),body:{stretch:T.B.stretch,compression:T.B.compression,ax:T.B.ax,ay:T.B.ay,def:T.B.def.x},mask:Array.from(T.readMask().px),optical:T.readMediaMask()?Array.from(T.readMediaMask().px):null};})()`);
   if(label==='coupled'&&name==='rest'){const proof=await P.ev('(()=>{const T=HeliosLiquidCursor.test;T.setMotionOptics(false);const a=T.readMediaMask().px;T.setMotionOptics(true);const b=T.readMediaMask().px;let delta=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])delta++;return {delta,stretch:T.B.stretch,compression:T.B.compression};})()');check('rest coupling is exactly pixel-neutral in the same context',proof.delta===0,proof);}
   const {x,y}=sn.state,shot=await P.shot(Math.round(x-130),Math.round(y-95),260,190);pictures[label+'-'+name]=shot;
   states[label+'-'+name]=JSON.stringify({state:sn.state,body:sn.body});masks[label+'-'+name]=sn.mask;delete sn.mask;delete sn.optical;(results.motion||={})[label+'-'+name]=sn;
  }check(label+' console',P.logs.length===0,{logs:P.logs});await P.close();
 }
 for(const name of Object.keys(scenarios)){
  check(name+' simulation identical',states['legacy-'+name]===states['coupled-'+name]);check(name+' mask identical',JSON.stringify(masks['legacy-'+name])===JSON.stringify(masks['coupled-'+name]));
  rows.push({label:name,cells:['physical','legacy','coupled'].map(c=>pictures[c+'-'+name])});
 }
 check('rest Target output equivalent (compiler rounding <=2)',changed(pictures['legacy-rest'],pictures['coupled-rest']).max<=2,changed(pictures['legacy-rest'],pictures['coupled-rest']));
 check('deformed optical output changes',changed(pictures['legacy-horizontal'],pictures['coupled-horizontal']).pixels>100,changed(pictures['legacy-horizontal'],pictures['coupled-horizontal']));
 writeFileSync(join(OUT,'01-motion.png'),await labelledSheet(B,{title:'Approved physics / pre-fix Target / Target with liquid-local optics',note:'Identical deterministic input and physical coverage; no second motion state. Native resolution, 68 px rest diameter. Stop frames read the existing recovery spring.',columns,rows}));
}
async function normals(){
 // Instrument the actual production fragment output in a temporary Fetch override; no diagnostic shader ships.
 const live=readFileSync('assets/observatory/liquid-cursor.js','utf8'),diagnostic=live.replace('outColor = water(col, N, g, d, W) * m;','outColor = vec4((N * 0.5 + 0.5) * m, m);'),P=await open('ripple=off',diagnostic),rows=[],fields={};
 await P.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);await P.ev('HeliosLiquidCursor.test.setMaterial(1);__pv.ready(780,430);1');
 const scenarios={rest:[],low:[{dx:1,dy:0,v:300,ms:200,ramp:20}],medium:[{dx:1,dy:0,v:1100,ms:200,ramp:20}],horizontal:[{dx:1,dy:0,v:2800,ms:200,ramp:20}],diagonal:[{dx:.7071,dy:.7071,v:2800,ms:200,ramp:20}],reversal:[{dx:1,dy:0,v:2800,ms:140,ramp:20},{dx:-1,dy:0,v:2800,ms:80}],stop50:[{dx:1,dy:0,v:2800,ms:200,ramp:20}],stop120:[{dx:1,dy:0,v:2800,ms:200,ramp:20}],stop250:[{dx:1,dy:0,v:2800,ms:200,ramp:20}]};
 for(const [name,segs]of Object.entries(scenarios)){
  if(!segs.length)await P.ev('__pv.ready(780,430);__pv.hold(2500);1');else{const n=await P.ev(`__pv.run(${JSON.stringify(segs)},780,430,0)`);await P.ev(`__pv.stepTo(${n});${name.startsWith('stop')?`__pv.hold(${name.slice(4)});`:''}1`);}
  const f=await P.ev(`(()=>{const T=HeliosLiquidCursor.test,s=T.readMediaMask(),g=T.M.gl,p=T.M.prog,center=g.getUniform(p,T.M.U.uCenter),radius=g.getUniform(p,T.M.U.uRadius),axis=g.getUniform(p,T.M.U.uAxis),stretch=T.B.stretch,compression=T.B.compression;let sw=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
   for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){const dx=x+.5-center[0],dy=y+.5-center[1],a=(dx*axis[0]+dy*axis[1])/stretch,b=(-dx*axis[1]+dy*axis[0])/compression;if(Math.hypot(a,b)>radius*.8)continue;const i=(y*s.w+x)*4;if(s.px[i+3]<254)continue;const weight=Math.max(0,s.px[i+2]/255*2-1-.88);sw+=weight;sx+=dx*weight;sy+=dy*weight;sxx+=dx*dx*weight;syy+=dy*dy*weight;sxy+=dx*dy*weight;}
   const vx=sxx/sw-(sx/sw)**2,vy=syy/sw-(sy/sw)**2,cov=sxy/sw-(sx/sw)*(sy/sw),disc=Math.hypot(vx-vy,2*cov),aspect=Math.sqrt((vx+vy+disc)/(vx+vy-disc)),angle=.5*Math.atan2(2*cov,vx-vy),physicalAngle=Math.atan2(axis[1],axis[0]),error=Math.abs(Math.atan2(Math.sin(2*(angle-physicalAngle)),Math.cos(2*(angle-physicalAngle))))/2;
   const c=document.createElement('canvas');c.width=c.height=140;const bytes=new Uint8ClampedArray(140*140*4);for(let yy=0;yy<140;yy++)for(let xx=0;xx<140;xx++){const xx0=Math.floor(center[0])-70+xx,yy0=Math.floor(center[1])+70-yy,index=(yy0*s.w+xx0)*4,out=(yy*140+xx)*4;for(let j=0;j<3;j++)bytes[out+j]=s.px[index+j]+232*(1-s.px[index+3]/255);bytes[out+3]=255;}c.getContext('2d').putImageData(new ImageData(bytes,140,140),0,0);return {aspect,angle,physicalAngle,error,stretch,compression,normal:c.toDataURL('image/png').split(',')[1]};})()`);
  rows.push({label:name+': optical crown aspect '+f.aspect.toFixed(2),cells:[Buffer.from(f.normal,'base64')]});delete f.normal;fields[name]=f;
 }
 check('optical principal axis follows horizontal / diagonal physical axis',fields.horizontal.error<.12&&fields.diagonal.error<.12,{horizontal:fields.horizontal,diagonal:fields.diagonal});
 check('optical aspect responds before the tail and at speed',fields.low.aspect>fields.rest.aspect&&fields.medium.aspect>1.2&&fields.horizontal.aspect>1.5,{fields});
 check('optical field relaxes with the approved spring',Math.abs(fields.stop250.aspect-1)<Math.abs(fields.stop50.aspect-1)&&fields.stop120.aspect<fields.stop50.aspect,{stop50:fields.stop50,stop120:fields.stop120,stop250:fields.stop250});
 writeFileSync(join(OUT,'04-normal-field.png'),await labelledSheet(B,{title:'Actual deformed shader normal field (diagnostic colours)',note:'Temporary fragment-output instrumentation only. Crown PCA reads N.z inside the physical body. The displayed colours are normal directions, not the Target material.',columns:['N mapped to RGB'],rows}));results.normalFields=fields;await P.close();
}
async function ripple(){
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{w:1440,h:900,dpr});
  await P.ev(`document.head.insertAdjacentHTML('beforeend','<style>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}.hero-stage{transform:none!important}</style>');HeliosLiquidCursor.test.setFrozen(true);1`);await sleep(700);
  await P.ev('HeliosLiquidCursor.test.ripple.freeze();HeliosLiquidCursor.test.ripple.capture()');await sleep(120);
  const status=await P.ev('HeliosLiquidCursor.status().ripple');check('viewport source ready DPR'+dpr,status.ready&&!status.busy,{status});
  const baseline=await P.shot();writeFileSync(join(QA,'ripple-baseline-dpr'+dpr+'.png'),baseline);
  const captured=await P.ev(`(()=>{const s=HeliosLiquidCursor.test.ripple.readSource();if(!s)return null;const c=document.createElement('canvas');c.width=s.w;c.height=s.h;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.px),s.w,s.h),0,0);return c.toDataURL('image/png').split(',')[1];})()`);
  if(!captured)throw Error('No viewport source');const source=Buffer.from(captured,'base64');writeFileSync(join(QA,'ripple-source-dpr'+dpr+'.png'),source);
  const diff=changed(baseline,source);results['source-dpr'+dpr]=diff;console.log('source difference',dpr,JSON.stringify(diff));
  const glyphs=await P.ev(`(()=>{const e=document.querySelector('.wordmark'),t=[...e.childNodes].find(n=>n.nodeType===3);return [...'HELIOS'].map(ch=>{const i=t.textContent.indexOf(ch),r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getBoundingClientRect();return [ch,b.left,b.right,b.top+b.height*.5];});})()`);
  let worst=0;for(const [ch,x0,x1,y]of glyphs){const a=stroke(baseline,x0,x1,y,dpr),b=stroke(source,x0,x1,y,dpr);worst=Math.max(worst,Math.abs(a.lo-b.lo),Math.abs(a.hi-b.hi));}check('all HELIOS glyphs aligned DPR'+dpr,worst<=1,{worstCSS:worst});
  const [x,y]=await P.ev(`(()=>{const b=document.querySelector('.wordmark').getBoundingClientRect();return [Math.round(b.left+b.width*.53),Math.round(b.top+b.height*.5)];})()`);
  await P.ev('window.__clicks=0;document.addEventListener("click",()=>{__clicks++});1');
  await P.s('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await P.s('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});await sleep(100);
  const click=await P.ev('({clicks:__clicks, ripple:HeliosLiquidCursor.status().ripple})');check('actual click origin / passthrough DPR'+dpr,click.clicks===1&&JSON.stringify(click.ripple.origins[0])===JSON.stringify([x,y]),click);
  const rows=[],times=[0,80,180,350,650,1000,1600,3100],ink=[],I=glyphs.find(v=>v[0]==='I'),original=stroke(baseline,I[1]-10,I[2]+10,I[3]-28,dpr).center;
  for(const t of times){await P.ev(`HeliosLiquidCursor.test.ripple.at(${t});1`);const shot=await P.shot();writeFileSync(join(QA,`ripple-dpr${dpr}-${t}.png`),shot);
   if(dpr===1)rows.push({label:t+' ms',cells:[await P.shot(Math.max(0,x-360),Math.max(0,y-140),720,280)]});
   if(t===180)check('source content visibly displaces DPR'+dpr,changed(baseline,shot).pixels>100,changed(baseline,shot));
   ink.push({t,...stroke(shot,original-18,original+18,I[3]-28,dpr)});
   if(t===3100){const delta=changed(baseline,shot);check('departure: no overlay and only <=2 compositor rounding DPR'+dpr,delta.max<=2&&delta.pixels<1500,{...delta,display:await P.ev('getComputedStyle(HeliosLiquidCursor.test.ripple.canvas()).display')});const again=await P.shot();check('settled departure within compositor rounding DPR'+dpr,changed(shot,again).max<=1,changed(shot,again));}
  }
  const baseInk=stroke(baseline,original-18,original+18,I[3]-28,dpr),peak=Math.max(...ink.map(v=>Math.max(Math.abs(v.lo-baseInk.lo),Math.abs(v.hi-baseInk.hi))));check('actual I stroke edge moves and returns DPR'+dpr,peak>=2&&Math.abs(ink.at(-1).center-original)<.1,{peakEdgeCSS:peak,original,ink});
  if(dpr===1)writeFileSync(join(OUT,'02-ripple.png'),await labelledSheet(B,{title:'Viewport refraction travelling through HELIOS',note:'Neutral source-derived displacement; actual click origin. Cursor hidden only for this proof. The overlay is removed at the final frame.',columns:['Actual page pixels'],rows}));
  await sleep(650); // the contact-sheet tab causes a deliberate visibility/settle cache refresh
  const a=await P.ev('HeliosLiquidCursor.status().ripple');await sleep(300);const b=await P.ev('HeliosLiquidCursor.status().ripple');check('no idle RAF / draws / uploads DPR'+dpr,!b.loop&&a.draws===b.draws&&a.uploads===b.uploads,{a,b});check('ripple console DPR'+dpr,P.logs.length===0,{logs:P.logs});await P.close();
 }
}
async function behavior(){
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{w:1440,h:900,dpr});await sleep(700);
  await P.ev('HeliosLiquidCursor.test.ripple.freeze();HeliosLiquidCursor.test.ripple.capture()');
  await P.ev('Promise.all(Array.from({length:10},(_,i)=>HeliosLiquidCursor.test.ripple.trigger(i%2?1435:5,i%3?5:895)))');await P.ev('HeliosLiquidCursor.test.ripple.at(80);1');
  const burst=await P.ev('HeliosLiquidCursor.status().ripple');check('rapid burst bounded at eight DPR'+dpr,burst.count===8&&burst.origins.some(v=>v[0]===1435)&&burst.origins.some(v=>v[0]===5),{count:burst.count,origins:burst.origins});
  const proof=await P.ev(`(()=>{
   const T=HeliosLiquidCursor.test.ripple,g=T.gl(),p=g.getParameter(g.CURRENT_PROGRAM),src=T.readSource(),w=src.w,h=src.h,frame=new Uint8Array(w*h*4);T.at(80);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,frame);
   const n=g.getUniform(p,g.getUniformLocation(p,'uCount')),amp=g.getUniform(p,g.getUniformLocation(p,'uAmplitude')),rp=Array.from({length:n},(_,i)=>Array.from(g.getUniform(p,g.getUniformLocation(p,'uWave['+i+']'))));
   let worst=0,cap=0,invalid=0,covered=[0,0,0,0],tested=0;
   const ss=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
   const sample=(xx,yy,ch)=>{xx=Math.min(w-1,Math.max(0,xx));yy=Math.min(h-1,Math.max(0,yy));const x=Math.floor(xx),y=Math.floor(yy),fx=xx-x,fy=yy-y,at=(a,b)=>src.px[(Math.min(h-1,b)*w+Math.min(w-1,a))*4+ch];return (at(x,y)*(1-fx)+at(x+1,y)*fx)*(1-fy)+(at(x,y+1)*(1-fx)+at(x+1,y+1)*fx)*fy;};
   for(let y=0;y<h;y+=Math.max(1,Math.floor(h/70)))for(let x=0;x<w;x+=Math.max(1,Math.floor(w/100))){
    const cx=(x+.5)/${dpr},cy=(y+.5)/${dpr};let ox=0,oy=0;for(const a of rp){const dx=cx-a[0],dy=cy-a[1],r=Math.hypot(dx,dy),q=(r-a[2]*520)/90,v=Math.sin(q*2*Math.PI)*Math.exp(-3*q*q-2.2*a[2]-r/900)*amp;ox+=dx/Math.max(1,r)*v;oy+=dy/Math.max(1,r)*v;}
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
async function performance(){
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{w:1440,h:900,dpr});await sleep(650);await P.ev('HeliosLiquidCursor.test.ripple.capture()');
  const before=await P.ev('HeliosLiquidCursor.status().ripple');await sleep(400);const idle=await P.ev('HeliosLiquidCursor.status().ripple');check('performance idle zero DPR'+dpr,idle.draws===before.draws&&idle.captures===before.captures&&idle.uploads===before.uploads&&!idle.loop);
  await P.ev('HeliosLiquidCursor.test.setFrozen(true);HeliosLiquidCursor.test.feed(465,392,100000);HeliosLiquidCursor.test.advance(1000);1');await sleep(400);
  await P.ev('HeliosLiquidCursor.test.advance(400);1');await sleep(250);const targetMs=await P.ev('HeliosLiquidCursor.test.benchDraw(30)'),target=await P.ev('HeliosLiquidCursor.status()');check('performance includes active refracting Target DPR'+dpr,target.visible&&target.material.value===1&&target.material.refraction===1,{material:target.material});
  const bench=async n=>P.ev(`(async()=>{const T=HeliosLiquidCursor.test.ripple,initial=HeliosLiquidCursor.status().ripple,dt=[],start=performance.now();let last=0,done=false;function watch(t){if(last)dt.push(t-last);last=t;if(!done)requestAnimationFrame(watch);}requestAnimationFrame(watch);await Promise.all(Array.from({length:${n}},(_,i)=>T.trigger(450+i*55,392+(i%2)*65)));await new Promise(r=>setTimeout(r,3150));done=true;const end=HeliosLiquidCursor.status().ripple;return {initial,end,elapsed:performance.now()-start,fps:dt.length*1000/dt.reduce((a,b)=>a+b,0),p95:dt.sort((a,b)=>a-b)[Math.floor(dt.length*.95)]};})()`);
  const single=await bench(1),eight=await bench(8);results['performance-dpr'+dpr]={targetMs,single,eight};check('single / eight expire and sleep DPR'+dpr,!single.end.active&&!eight.end.active&&!eight.end.loop&&eight.end.count===0,{targetMs,singleFPS:single.fps,eightFPS:eight.fps,latencySingle:single.end.latencyMs,latencyEight:eight.end.latencyMs,maxCallbackMs:eight.end.maxCallbackMs,captureMs:eight.end.captureMs,mainMs:eight.end.mainMs,memoryBytes:eight.end.memoryBytes});
  const gpu=await P.ev('(async()=>{const T=HeliosLiquidCursor.test.ripple;T.freeze();await Promise.all(Array.from({length:8},(_,i)=>T.trigger(450+i*55,392)));const ms=T.bench(30),draws=HeliosLiquidCursor.status().ripple.benchDraws;T.at(3100);T.freeze(false);return {ms,draws};})()');results['performance-dpr'+dpr].eightGpuFinishedMs=gpu.ms;check('eight-wave GPU-finished draw budget DPR'+dpr,gpu.ms<16.7&&gpu.draws===30,gpu);
  const a=await P.ev('HeliosLiquidCursor.status().ripple');await sleep(300);const b=await P.ev('HeliosLiquidCursor.status().ripple');check('no work after final wave DPR'+dpr,a.draws===b.draws&&a.uploads===b.uploads&&a.captures===b.captures&&!b.loop);
  await P.close();
 }
}
async function alignment(){
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{dpr});await P.ev('HeliosLiquidCursor.test.setFrozen(true);document.head.insertAdjacentHTML("beforeend","<style>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>");1');
  for(const [hash,scroll]of [['overview',700],['hardware',250],['render',220],['scheduler',300]]){
   await P.ev(`location.hash=${JSON.stringify(hash)};1`);await sleep(650);await P.ev(`window.scrollTo(0,${scroll});1`);await sleep(600);await P.ev('HeliosLiquidCursor.test.ripple.capture()');const base=await P.shot();
   const source=Buffer.from(await P.ev(`(()=>{const s=HeliosLiquidCursor.test.ripple.readSource(),c=document.createElement('canvas');c.width=s.w;c.height=s.h;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.px),s.w,s.h),0,0);return c.toDataURL('image/png').split(',')[1];})()`),'base64');
   writeFileSync(join(QA,`alignment-${hash}-dpr${dpr}-page.png`),base);writeFileSync(join(QA,`alignment-${hash}-dpr${dpr}-source.png`),source);
   const fields=await P.ev(`(()=>{const out=[];const walk=document.createTreeWalker(document.querySelector('.section.active'),NodeFilter.SHOW_TEXT);while(walk.nextNode()&&out.length<30){const n=walk.currentNode;if(!n.textContent.trim()||n.parentElement.closest('script,style,svg'))continue;const r=document.createRange();r.selectNodeContents(n);const b=r.getBoundingClientRect();if(b.top>60&&b.bottom<innerHeight-20&&b.left>30&&b.width>20&&b.height<30){const cs=getComputedStyle(n.parentElement),color=cs.color.match(/[\\d.]+/g).slice(0,3).map(Number);if(color.reduce((a,b)=>a+b,0)<250)out.push([n.textContent.trim().slice(0,30),b.left,b.right,b.top,b.bottom]);}}return out;})()`);
   const inkBox=(buf,b)=>{const im=decodePNG(buf.toString('base64')),out=[1e9,1e9,-1,-1];for(let y=Math.max(0,Math.floor(b[3]*dpr));y<Math.min(im.h,Math.ceil(b[4]*dpr));y++)for(let x=Math.floor(b[1]*dpr);x<Math.min(im.w,Math.ceil(b[2]*dpr));x++){const p=im.px(x,y);if(p.reduce((a,b)=>a+b,0)<250){out[0]=Math.min(out[0],x);out[1]=Math.min(out[1],y);out[2]=Math.max(out[2],x);out[3]=Math.max(out[3],y);}}return out;};
   let worst=0,count=0;const boxes=[];for(const field of fields){const a=inkBox(base,field),b=inkBox(source,field);if(a[2]<0||b[2]<0)continue;const delta=Math.max(...a.map((v,i)=>Math.abs(v-b[i])))/dpr;worst=Math.max(worst,delta);count++;boxes.push({text:field[0],delta});}check(`scrolled ${hash} text/source alignment DPR${dpr}`,count>0&&worst<=1,{count,worst,boxes,capture:await P.ev('HeliosLiquidCursor.status().ripple.captureMs')});
   const before=await P.ev('HeliosLiquidCursor.status().ripple');await P.ev('HeliosLiquidCursor.test.ripple.trigger(750,450)');await sleep(60);const after=await P.ev('HeliosLiquidCursor.status().ripple');check(`cached ${hash} click avoids capture DPR${dpr}`,after.captures===before.captures&&after.draws>before.draws,{latency:after.latencyMs,captureMs:after.captureMs,mainMs:after.mainMs});await P.ev('HeliosLiquidCursor.test.ripple.cancel("alignment case complete");1');
  }
  await P.ev('window.__canvasProbe=document.createElement("canvas");__canvasProbe.width=80;__canvasProbe.height=60;__canvasProbe.style.cssText="position:fixed;left:600px;top:150px;width:80px;height:60px;z-index:70";document.body.appendChild(__canvasProbe);__canvasProbe.getContext("2d").fillRect(0,0,80,60);1');await sleep(550);await P.ev('HeliosLiquidCursor.test.ripple.capture()');const before=await P.ev('HeliosLiquidCursor.status().ripple.captures');await P.ev('__canvasProbe.getContext("2d").fillStyle="red";__canvasProbe.getContext("2d").fillRect(0,0,80,60);HeliosLiquidCursor.test.ripple.trigger(650,170)');const after=await P.ev('HeliosLiquidCursor.status().ripple.captures');check('canvas-only pixels invalidate on click DPR'+dpr,after===before+1,{before,after});await P.ev('__canvasProbe.remove();1');
  await P.close();
 }
}
async function nested(){
 const P=await open('ripple=reference');await P.ev('location.hash="provenance?panel=code&snippet=render_tile";1');await sleep(700);
 await P.ev('(()=>{const pre=document.querySelector("pre.code");pre.style.maxHeight="140px";pre.style.overflow="auto";pre.scrollIntoView({block:"center"});pre.scrollTop=80;pre.scrollLeft=30;return 1;})()');await sleep(550);await P.ev('HeliosLiquidCursor.test.ripple.capture()');
 const original=await P.shot(),base=decodePNG(original.toString('base64')),b=await P.ev('(()=>{const b=document.querySelector("pre.code").getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height,scroll:document.querySelector("pre.code").scrollTop};})()'),data=await P.ev('(()=>{const s=HeliosLiquidCursor.test.ripple.readSource(),c=document.createElement("canvas");c.width=s.w;c.height=s.h;c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(s.px),s.w,s.h),0,0);return c.toDataURL("image/png").split(",")[1];})()'),src=decodePNG(data);
 writeFileSync(join(QA,'nested-page.png'),original);writeFileSync(join(QA,'nested-source.png'),Buffer.from(data,'base64'));
 const bright=(im,x,y)=>im.px(x,y).reduce((a,b)=>a+b,0)>450,near=(im,x,y)=>{for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)if(bright(im,x+xx,y+yy))return true;return false;};
 let changed=0,ink=0;for(let y=Math.ceil(b.y+8);y<Math.floor(b.y+b.h-15);y++)for(let x=Math.ceil(b.x+8);x<Math.floor(b.x+b.w-20);x++){const a=bright(base,x,y),c=bright(src,x,y);if(a||c)ink++;if((a&&!near(src,x,y))||(c&&!near(base,x,y)))changed++;}
 check('internally scrolled code source matches within one pixel',b.scroll===80&&ink>100&&changed/ink<.03,{...b,unmatched:changed,ink,ratio:changed/ink});await P.close();
}
async function artifacts(){
 const text=readFileSync('labs/liquid-cursor/tools/polish-evidence.mjs','utf8'),defs=text.slice(text.indexOf('  function nearby('),text.indexOf('  // ---------------------------------------------------------------- 8.'));
 const classify=Function('decodePNG','encodePNG',defs+';return glassDarkness;')(decodePNG,encodePNG),rows=[];
 for(const dpr of [1,2]){
  const P=await open('ripple=reference',null,{dpr});
  await P.ev('HeliosLiquidCursor.test.ripple.freeze();HeliosLiquidCursor.test.setFrozen(true);document.head.insertAdjacentHTML("beforeend","<style>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>");1');
  for(const [scene,hash,X,Y]of [['hero text','overview',390,392],['pale sky','overview',950,130],['coral sphere','overview',400,350],['metallic render','render',1050,440],['normal UI','hardware',750,270],['dark panel','provenance?panel=code&snippet=render_tile',900,450]]){
   let x=X,y=Y;await P.ev(`HeliosLiquidCursor.test.ripple.cancel('scene');location.hash=${JSON.stringify(hash)};window.scrollTo(0,0);1`);await sleep(750);
   if(hash==='render'){await P.ev('document.querySelector("#rl-img").scrollIntoView({block:"center"});1');await sleep(400);[x,y]=await P.ev('(()=>{const e=document.querySelector("#rl-img"),b=e.getBoundingClientRect();return [Math.round(b.left+1215*b.width/e.naturalWidth),Math.round(b.top+430*b.height/e.naturalHeight)];})()');}
   await P.ev('HeliosLiquidCursor.test.ripple.capture()');const baseline=await P.shot();
   await P.ev(`HeliosLiquidCursor.test.ripple.trigger(${x},${y})`);
   for(const t of [80,180]){await P.ev(`HeliosLiquidCursor.test.ripple.at(${t});1`);const shot=await P.shot(),m=classify(shot,baseline,24*dpr,.04);check(`${scene} ripple no unexplained darkness / isolated RGB DPR${dpr} t${t}`,m.nNew===0&&m.nColour===0,{newDark:m.nNew,isolatedColour:m.nColour,scalarDark:m.nScalarNew});if(dpr===1&&t===180)rows.push({label:scene+' at 180 ms',cells:[await P.shot(Math.max(0,x-240),Math.max(0,y-150),480,300)]});}
  }
  await P.close();
  const M=await open('ripple=off',null,{dpr});await M.ev(`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`);await M.ev('__pv.ready(600,392);__pv.hold(600);1');await sleep(500);
  const trajectories={horizontal:[[{dx:1,dy:0,v:2800,ms:160,ramp:20}],560,392],diagonal:[[{dx:.7071,dy:.7071,v:3000,ms:180,ramp:20}],600,440],curve:[[{dx:1,dy:0,v:3000,ms:220,ramp:20,turn:2.6}],580,400],reversal:[[{dx:1,dy:0,v:3000,ms:140,ramp:20},{dx:-1,dy:0,v:3000,ms:100}],550,400],long:[[{dx:1,dy:0,v:5000,ms:180,ramp:15}],1150,300],title:[[{dx:-1,dy:.04,v:4600,ms:180,ramp:18}],420,392]};
  for(const [name,[segs,x,y]]of Object.entries(trajectories))for(const step of [0,8]){
   const n=await M.ev(`__pv.run(${JSON.stringify(segs)},${x},${y},20)`),sn=await M.ev(`__pv.stepTo(${n-20+step})`);await sleep(25);const clip=[Math.round(sn.x-180),Math.round(sn.y-132),360,264];if(clip[0]<0||clip[1]<0)throw Error('artifact crop outside source');const shot=await M.shot(...clip);
   await M.ev('document.head.insertAdjacentHTML("beforeend","<style id=__artifactHide>.lc-canvas,.lc-canvas-media,.lc-bead,.lc-bead-media{visibility:hidden!important}</style>");1');const baseline=await M.shot(...clip);await M.ev('document.getElementById("__artifactHide").remove();1');const m=classify(shot,baseline,32*dpr,.04);check(`coupled Target ${name} no unexplained darkness / isolated RGB DPR${dpr} f${step}`,m.nNew===0&&m.nColour===0,{newDark:m.nNew,isolatedColour:m.nColour,sourceCompatibleColour:m.nChromatic});
   if(dpr===1&&name==='reversal'&&step===0)rows.push({label:'Coupled Target reversal',cells:[shot]});
  }
  await M.close();
 }
 writeFileSync(join(OUT,'03-surfaces.png'),await labelledSheet(B,{title:'Viewport ripple across real surfaces, plus coupled Target under motion',note:'Native crops from actual UI. Source-envelope check: unchanged 4% darkness threshold, legal 24 px ripple / 32 px Target reach; DPR 1 and 2.',columns:['Actual source-derived optics'],rows}));
}
function waveMath(){
 const wave=(radius,age)=>Math.sin((radius-age*520)/90*2*Math.PI)*Math.exp(-3*((radius-age*520)/90)**2-2.2*age-radius/900)*14;
 const ages=[0,.08,.18,.35,.65,1,1.6,3],fronts=ages.map(a=>a*520),peaks=ages.map(a=>Math.abs(wave(a*520+22.5,a)));
 check('wavefront grows monotonically',fronts.every((v,i)=>i===0||v>fronts[i-1]),{fronts});check('wave amplitude decays',peaks.every((v,i)=>i===0||v<peaks[i-1]),{peaks});
 check('packet quiet three widths before and after',ages.every(a=>(a*520<270||Math.abs(wave(a*520-270,a))<.03)&&Math.abs(wave(a*520+270,a))<.03));
}
try{const modes=new Set(arg('--only','motion').split(','));if(modes.has('motion'))await motion();if(modes.has('normals'))await normals();if(modes.has('ripple'))await ripple();if(modes.has('behavior')){waveMath();await behavior();}if(modes.has('performance'))await performance();if(modes.has('artifacts'))await artifacts();if(modes.has('alignment'))await alignment();if(modes.has('nested'))await nested();writeFileSync(join(OUT,arg('--report',arg('--only','motion')+'-metrics.json')),JSON.stringify(results,null,2));console.log(results.checks.filter(c=>c.ok).length+'/'+results.checks.length+' interaction checks passed');}finally{await B.close();clearInterval(keep);}
