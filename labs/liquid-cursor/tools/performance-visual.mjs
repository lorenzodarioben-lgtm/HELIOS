// Deterministic approved WIP versus optimized runtime, including full-resolution source pixels.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {launch,sleep,decodePNG,labelledSheet} from './cdp.mjs';
const OUT=resolve('labs/liquid-cursor/evidence/performance-final');mkdirSync(OUT,{recursive:true});
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,PREFIX=arg('--out','08-visual-final');
const baseline=readFileSync(join(OUT,'baseline-liquid-cursor.js')).toString('base64');
const baselineApp=readFileSync(join(OUT,'baseline-app.js')).toString('base64');
const code=readFileSync('labs/liquid-cursor/tools/check-observatory.mjs','utf8'),driver=code.slice(code.indexOf('function installDriver()'),code.indexOf('const around =')),drv=`(${driver.slice(0,driver.lastIndexOf('}')+1)})()`;
const B=await launch(),rows=[],checks=[];
const check=(name,ok,detail)=>{checks.push({name,ok,...detail});console.log(ok?'PASS':'FAIL',name,JSON.stringify(detail));if(!ok)process.exitCode=1;};
function diff(a,b){a=decodePNG(a.toString('base64'));b=decodePNG(b.toString('base64'));let pixels=0,max=0,total=0;for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const p=a.px(x,y),q=b.px(x,y),d=Math.max(...p.map((v,i)=>Math.abs(v-q[i])));if(d)pixels++;max=Math.max(max,d);total+=d;}return {pixels,max,mean:total/(a.w*a.h),size:[a.w,a.h]};}
async function open(old,dpr,route){
 const alternate=arg('--after-source',''),runtime=old?baseline:alternate?readFileSync(resolve(alternate)).toString('base64'):null;
 const {targetId}=await B.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await B.send('Target.attachToTarget',{targetId,flatten:true}),s=(m,p)=>B.send(m,p,sessionId);
 const listen=m=>{if(m.sessionId===sessionId&&m.method==='Fetch.requestPaused')s('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:m.params.request.url.includes('/app.js')?baselineApp:runtime});};
 B.listeners.add(listen);await s('Page.enable');await s('Runtime.enable');await s('Network.enable');await s('Network.setCacheDisabled',{cacheDisabled:true});if(runtime)await s('Fetch.enable',{patterns:old?[{urlPattern:'*/liquid-cursor.js*'},{urlPattern:'*/app.js*'}]:[{urlPattern:'*/liquid-cursor.js*'}]});await s('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:dpr,mobile:false});
 const ev=async expression=>{const r=await s('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await s('Page.navigate',{url:`http://127.0.0.1:8315/assets/observatory/index.html?cursor=test&glass=target&hero=b${!old&&arg('--ripple-dpr','')?'&rippleDpr='+arg('--ripple-dpr',''):''}#${route}`});for(let i=0;i<150;i++){if(await ev('!!window.HeliosLiquidCursor?.test&&document.readyState==="complete"').catch(()=>false))break;await sleep(50);}
 await ev(`document.querySelector('.hero-count')?.dispatchEvent(new MouseEvent('mouseenter'));document.head.insertAdjacentHTML('beforeend','<style>*{animation:none!important;transition:none!important}</style>');1`);await sleep(650);
 return {s,ev,shot:async(x,y,w,h)=>Buffer.from((await s('Page.captureScreenshot',{format:'png',clip:{x,y:y+await ev('scrollY'),width:w,height:h,scale:1}})).data,'base64'),close:async()=>{B.listeners.delete(listen);await B.send('Target.closeTarget',{targetId});}};
}
try{
 for(const dpr of arg('--dprs','1,2').split(',').map(Number))for(const name of arg('--cases','hero-O,hero-S,summary,index,sidebar,render,ripple').split(',')){
  const images=[],states=[],sources=[],sourceImages=[];
  for(const old of [true,false]){
   const P=await open(args.includes('--control')?true:old,dpr,name==='render'?'render':name==='workload'?'workload':'overview');let x=465,y=392;
   if(name==='hero-S'){x=1100;y=400;}
   if(name==='summary'){[x,y]=await P.ev('(()=>{const r=document.querySelector(".evidence .lead .fig").getBoundingClientRect();return [r.left+28,r.top+r.height*.5];})()');}
   if(name==='index'){await P.ev('document.querySelector(".toc a[data-route=workload]").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(450);x=160;[,y]=await P.ev('(()=>{const r=document.querySelector(".toc a[data-route=workload]").getBoundingClientRect();return [160,r.top+r.height/2];})()');}
   if(name==='sidebar'){await P.ev('document.querySelector("#nav").classList.add("open");1');x=279;y=430;}
   if(name==='render'){await P.ev('document.querySelector("#rl-img").scrollIntoView({block:"center",behavior:"instant"});1');await sleep(350);[x,y]=await P.ev('(()=>{const r=document.querySelector("#rl-img").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()');}
   if(name==='workload'){[x,y]=await P.ev('(()=>{const r=document.querySelector("#wm-canvas").getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()');await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});await sleep(500);}
   await P.ev('HeliosLiquidCursor.test.ripple.capture()');await sleep(450);await P.ev('HeliosLiquidCursor.test.ripple.capture()');
   sources.push(await P.ev('(()=>{const p=HeliosLiquidCursor.test.ripple.readSource();if(!p)return null;let hash=2166136261;for(const v of p.px)hash=Math.imul(hash^v,16777619);return {w:p.w,h:p.h,hash:hash>>>0};})()'));
   const encoded=await P.ev('(()=>{const p=HeliosLiquidCursor.test.ripple.readSource();if(!p)return null;const c=document.createElement("canvas");c.width=p.w;c.height=p.h;c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(p.px),p.w,p.h),0,0);return c.toDataURL("image/png").split(",")[1];})()');
   sourceImages.push(encoded?Buffer.from(encoded,'base64'):null);if(encoded)writeFileSync(join(OUT,`${PREFIX}-${name}-dpr${dpr}-${old?'before':'after'}-source.png`),sourceImages.at(-1));
   await P.ev(drv);
   if(name==='index'||name==='sidebar'){const n=await P.ev(`__pv.run([{dx:0,dy:1,v:4200,ms:100,ramp:20},{dx:0,dy:-1,v:3600,ms:60}],${x},${y},0)`);await P.ev(`__pv.stepTo(${n});1`);}else{await P.ev(`__pv.ready(${x},${y});__pv.hold(800);1`);await sleep(300);await P.ev('__pv.hold(300);1');}
   if(name.startsWith('ripple')){
    await P.ev('HeliosLiquidCursor.test.ripple.freeze(true);HeliosLiquidCursor.test.S.inside=false;1');await P.s('Input.dispatchMouseEvent',{type:'mouseMoved',x:-10,y:-10});
    writeFileSync(join(OUT,`${PREFIX}-${name}-dpr${dpr}-${old?'before':'after'}-base.png`),await P.shot(100,100,1200,680));
    if(name==='ripple8')await P.ev('(async()=>{const stamp=performance.now();Object.defineProperty(performance,"now",{configurable:true,value:()=>stamp});try{for(let i=0;i<8;i++)await HeliosLiquidCursor.test.ripple.trigger(700+i*35,420+i%3*30);}finally{delete performance.now;}})()');
    else await P.ev('HeliosLiquidCursor.test.ripple.trigger(700,420)');
    for(const ms of [80,220,450,800,1400,2400]){await P.ev(`HeliosLiquidCursor.test.ripple.at(${ms});1`);const shot=await P.shot(100,100,1200,680);images.push(shot);writeFileSync(join(OUT,`${PREFIX}-${name}-dpr${dpr}-${old?'before':'after'}-${ms}.png`),shot);}
   }else if(name==='workload')images.push(await P.shot(40,130,1360,680));
   else images.push(await P.shot(Math.max(0,Math.min(1020,x-200)),Math.max(0,Math.min(560,y-150)),420,340));
   states.push(await P.ev('({material:HeliosLiquidCursor.status().material,goo:HeliosLiquidCursor.status().goo,ripple:HeliosLiquidCursor.status().ripple})'));await P.close();
  }
  const count=name.startsWith('ripple')?6:1;for(let i=0;i<count;i++){const d=diff(images[i],images[count+i]);check(`${name} DPR${dpr} ${i} pixel equivalence`,d.max<=2&&d.mean<.05,d);rows.push({label:`${name} DPR${dpr}${name.startsWith('ripple')?' / '+[80,220,450,800,1400,2400][i]+'ms':''}`,cells:[images[i],images[count+i]]});}
  const sourceDiff=sourceImages.every(Boolean)?diff(...sourceImages):null;
  check(`${name} DPR${dpr} viewport source preserved`,!!sourceDiff&&sourceDiff.max<=2&&sourceDiff.pixels/(sourceDiff.size[0]*sourceDiff.size[1])<.0005,{sources,diff:sourceDiff,reasons:states.map(s=>s.ripple.reason)});
 }
 writeFileSync(join(OUT,PREFIX+'.png'),await labelledSheet(B,{title:args.includes('--control')?'Unchanged approved runtime / independent browser surfaces':'Approved WIP / performance pass — deterministic visual comparison',note:'Native pixel crops at DPR 1 and 2; full-resolution viewport source comparisons and six temporal ripple samples. Max two channel levels; mean maximum-channel error below 0.05/255. Source tolerance additionally limits changed pixels to 0.05%.',columns:args.includes('--control')?['Approved A','Approved B']:['Approved','Optimized'],rows}));
 writeFileSync(join(OUT,PREFIX+'.json'),JSON.stringify({checks,passed:checks.filter(c=>c.ok).length,total:checks.length},null,2));
}finally{await B.close();}
