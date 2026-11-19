// SPDX-License-Identifier: GPL-3.0-or-later
// Loads the planner's own engine (src/app.js + src/nav.js) into a Node context with a do-nothing DOM,
// so the simulator and tools share exactly the planner's world data, helpers and simulation.
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm'), zlib=require('zlib');
const ROOT=process.env.WOWF_PLANNER||path.join(__dirname,'..','wowf-qrp');
function stub(name='stub'){ const f=function(){ return P; }; const P=new Proxy(f,{
  get(t,k){ if(k===Symbol.iterator) return function*(){}; if(k===Symbol.toPrimitive) return ()=>''; if(k==='length') return 0; if(k==='then') return undefined; if(k==='toString'||k==='valueOf') return ()=>''; if(k==='style'||k==='dataset'||k==='classList') return t[k]||(t[k]=stub()); if(k in t&&typeof k==='string'&&k!=='name'&&k!=='prototype') return t[k]; return P; },
  set(t,k,v){ t[k]=v; return true; }, apply(){ return P; }, construct(){ return P; }, has(){ return true; } }); return P; }
process.on('unhandledRejection',()=>{}); /* the page's own start-up (UI) fails without a DOM: harmless here */
function load(opts={}){
  const b64=fs.readFileSync(path.join(ROOT,'data/bundle.b64'),'utf8').trim();
  const doc=stub(); const bundleEl={textContent:b64};
  const document=new Proxy(doc,{ get(t,k){ if(k==='getElementById') return id=>id==='bundle'?bundleEl:stub(); if(k==='querySelector') return s=>s==='#bundle'?bundleEl:stub(); if(k==='querySelectorAll') return ()=>[]; return doc[k]; } });
  const storage={}; const localStorage={getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=String(v);},removeItem:k=>{delete storage[k];}};
  const ctx={console,document,localStorage,sessionStorage:localStorage,navigator:{userAgent:'node',clipboard:stub()},location:{href:'file:///',hash:'',search:'',protocol:'file:'},
    setTimeout:(f,ms)=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),Blob,Response,DecompressionStream,TextDecoder,TextEncoder,URL,
    fetch:async()=>{ throw new Error('no network'); },Image:function(){ return stub(); },matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),getComputedStyle:()=>stub(),
    innerWidth:1600,innerHeight:900,devicePixelRatio:1,performance,structuredClone,crypto:require('crypto').webcrypto,addEventListener(){},removeEventListener(){},dispatchEvent(){},
    HTMLElement:function(){},Path2D:function(){ return stub(); },Event:function(){},CustomEvent:function(){},ResizeObserver:function(){ return {observe(){},disconnect(){}}; },MutationObserver:function(){ return {observe(){},disconnect(){}}; },IntersectionObserver:function(){ return {observe(){},disconnect(){}}; },
    alert(){},confirm:()=>false,prompt:()=>null,open:()=>null,history:{replaceState(){},pushState(){}},screen:{width:1600,height:900}};
  ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
  const src=['src/app.js','src/members.js','src/cloud.js','src/nav.js'].map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  const errs=[]; try{ vm.runInContext(src.replace('__BUILD__','node'),ctx,{filename:'planner.js'}); }catch(e){ errs.push(String(e&&e.stack||e).slice(0,400)); }
  // data: same as the page's loadData, synchronously
  const o=JSON.parse(zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8'));
  ctx.__o=o; vm.runInContext(`DB=__o.db; META=__o.meta; taxiAdd([['Auberdine','Nijel'],['Auberdine','Feathermoon']],'A'); for(const [id,x] of Object.entries(QEXTRA)) if(DB.q[id]) Object.assign(DB.q[id],x); if(DB.n[12997]) DB.n[12997].p=[[1537,76.4,51.2]]; labelChains(); if(typeof navInit==='function') navInit(); delete globalThis.__o;`,ctx);
  return {ctx,errs,run:(code)=>vm.runInContext(code,ctx)};
}
module.exports={load};
