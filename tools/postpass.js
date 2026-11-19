// SPDX-License-Identifier: GPL-3.0-or-later
// Travel post-pass: adds flight-path pickups, flights and hearthstone use to a finished route, one change at a time,
// keeping each only if the engine says the route reaches the target level sooner (and with no new errors).
// usage: node tools/postpass.js <route.json> <out.json> [options.json]
// options: {tgt, block:[zone names] or {zone: level it opens at}, params:{engine params}, minLeg:600, arr:3, passes:2, hearth:1, ms}
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const [IN,OUT,OPTF]=process.argv.slice(2); const opt=OPTF?JSON.parse(fs.readFileSync(OPTF,'utf8')):{};
let R=JSON.parse(fs.readFileSync(IN,'utf8')); R=R.route||R;
const W=require('../index.js').open(); W.setParams(opt.params||{}); W.useRoute(R);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','builder.js'),'utf8')+'\n;globalThis.ROUTEBLOCK=ROUTEBLOCK;',W.P.ctx,{filename:'builder.js'});
const C=W.P.ctx, S=W.S; C.ROUTEBLOCK(opt.block||[]); const G=n=>vm.runInContext(n,C); const META=G('META'), taxiNodes=G('taxiNodes'), taxiPt=G('taxiPt'), taxiShort=G('taxiShort');
const TGT=opt.tgt||40, T0=Date.now(), MS=opt.ms||3600000, log=m=>console.error(JSON.stringify(m));
let steps=R.steps.map(s=>Object.assign({},s)), snaps, cur, evals=0;
const meas=r=>({t:r.t,tg:r.tg,errs:r.errs,L:r.L,xp:r.xp});
const score=m=>m.tg!=null?m.tg:m.t+1e6-(m.L*1e4);
const full=()=>{ const r=S.run(steps,R.char,{snaps:true,tgt:TGT}); snaps=r.snaps; cur=meas(r); return cur; };
const tryIns=ins=>{ // ins: [[k, step]] inserted before step k
  const st=steps.slice(); const srt=ins.slice().sort((a,b)=>b[0]-a[0]); for(const [k,s] of srt) st.splice(k,0,Object.assign({id:'pp'+Math.random().toString(36).slice(2,8),pp:1},s));
  const k0=Math.min(...ins.map(x=>x[0])); evals++; const r=S.run(st,R.char,{from:{k:k0,state:snaps[k0]},tgt:TGT,stopAtTgt:true}); const m=meas(r);
  return {m,st}; };
const better=m=>m.errs<=cur.errs&&score(m)<score(cur)-5;
const cont=p=>p&&META.zones[p.z]?.m; const hyp=(a,b)=>Math.hypot(a.X-b.X,a.Y-b.Y);
const nodes=taxiNodes().map(n=>({id:n.id,m:n.m,p:taxiPt(n.id),zmin:n.zmin||0})).filter(n=>n.p);
const posAt=k=>snaps[k]&&snaps[k].pos;
const legs=()=>{ const L=[]; for(let k=1;k<steps.length;k++){ const a=posAt(k), b=posAt(k+1); if(!a||!b||cont(a)!==cont(b)) continue; const d=hyp(a,b); if(d>=(opt.minLeg||600)) L.push({k,a,b,d}); } return L.sort((x,y)=>y.d-x.d); };
const bestLearn=(n,kmax)=>{ let best=null; for(let j=1;j<kmax;j++){ const a=posAt(j), b=posAt(j+1); if(!a||!b||cont(a)!==n.m||snaps[j].L<n.zmin) continue; const d=hyp(a,n.p)+hyp(n.p,b)-hyp(a,b); if(!best||d<best.d) best={j,d}; } return best; };
const stat={fly:0,learn:0,home:0,hs:0};
full(); const start=cur;
// ---- pick up every flight path the route passes close to (earliest pass); unused ones are dropped at the end ----
if(opt.pickup!==0){ const ins=[]; for(const n of nodes){ if(snaps[1]&&snaps[1].fps.has(n.id)) continue; for(let j=1;j<steps.length;j++){ const a=posAt(j), b=posAt(j+1); if(!a||!b||cont(a)!==n.m||snaps[j].L<n.zmin) continue; const d=hyp(a,n.p)+hyp(n.p,b)-hyp(a,b); if(d<(opt.pickupYd||300)){ ins.push([j+1,{t:'travel',kind:'fp',node:n.id,text:taxiShort(n.id)}]); break; } } }
  if(ins.length){ const r=tryIns(ins); if(r.m.errs<=cur.errs){ steps=r.st; full(); stat.learn+=ins.length; log({pickups:ins.length,tg:Math.round(cur.tg/60)}); } } }
// ---- flights ----
for(let pass=0;pass<(opt.passes||2);pass++){ let accd=0;
  for(const lg of legs()){ if(Date.now()-T0>MS) break; const {a,b}=posAt(lg.k)&&{a:posAt(lg.k),b:posAt(lg.k+1)}; if(!a||!b) continue;
    const cands=nodes.filter(n=>n.m===cont(b)&&n.zmin<=snaps[lg.k].L&&hyp(n.p,b)<hyp(a,b)*0.6).sort((x,y)=>hyp(x.p,b)-hyp(y.p,b)).slice(0,opt.arr||3);
    let best=null;
    for(const n of cands){ const known=snaps[lg.k].fps.has(n.id); const ins=[[lg.k,{t:'travel',kind:'fly',node:n.id,text:taxiShort(n.id)}]];
      if(!known){ const bl=bestLearn(n,lg.k); if(!bl) continue; ins.push([bl.j+1,{t:'travel',kind:'fp',node:n.id,text:taxiShort(n.id)}]); }
      // the departure node must be known too: the engine flies from the nearest known one
      const r=tryIns(ins); if(better(r.m)&&(!best||score(r.m)<score(best.m))) best={...r,learn:!known}; }
    if(best){ steps=best.st; full(); accd++; stat.fly++; if(best.learn) stat.learn++; log({fly:lg.k,d:Math.round(lg.d),tg:Math.round(cur.tg/60),evals}); } }
  if(!accd) break; }
// ---- hearthstone ----
if(opt.hearth!==0){ const towns=nodes; let guard=0;
  for(;;){ if(Date.now()-T0>MS||guard++>60) break; let best=null;
    const L=legs();
    // a hearth use with the current bind
    for(const lg of L.slice(0,80)){ const s=snaps[lg.k]; if(!s.bind||s.t<s.hsReady||cont(s.bind)!==cont(lg.b)) continue; if(hyp(s.bind,lg.b)>lg.d*0.6) continue; const r=tryIns([[lg.k,{t:'travel',kind:'hs',text:'Hearth'}]]); if(better(r.m)&&(!best||score(r.m)<score(best.m))) best={...r,kind:'hs'}; }
    // bind at a town the route passes, then hearth back to it on a later long leg
    const seen=new Set();
    for(let j=1;j<steps.length-1;j++){ const p=posAt(j+1); if(!p) continue; const tn=towns.find(n=>n.m===cont(p)&&hyp(n.p,p)<150); if(!tn||seen.has(tn.id+':'+Math.floor(j/60))) continue; seen.add(tn.id+':'+Math.floor(j/60));
      let lg=null, g=0; for(const x of L){ if(x.k<=j+1||cont(x.b)!==tn.m) continue; const gain=x.d-hyp(tn.p,x.b); if(gain>g){ g=gain; lg=x; } } if(!lg||g<500) continue;
      const r=tryIns([[j+1,{t:'travel',kind:'home',text:taxiShort(tn.id)}],[lg.k,{t:'travel',kind:'hs',text:'Hearth'}]]); if(better(r.m)&&(!best||score(r.m)<score(best.m))) best={...r,kind:'home'}; }
    if(!best) break; steps=best.st; full(); stat.hs++; if(best.kind==='home') stat.home++; log({hearth:best.kind,tg:Math.round(cur.tg/60),evals}); } }
// ---- drop pickups that no longer pay ----
for(let k=steps.length-1;k>=0;k--){ const s=steps[k]; if(!s.pp||s.kind!=='fp') continue; const st=steps.slice(0,k).concat(steps.slice(k+1)); const r=S.run(st,R.char,{from:{k,state:snaps[k]},tgt:TGT,stopAtTgt:true}); const m=meas(r); if(m.errs<=cur.errs&&score(m)<=score(cur)){ steps=st; full(); stat.learn--; } }
R.steps=steps.map(s=>{ const o=Object.assign({},s); delete o.pp; return o; }); fs.writeFileSync(OUT,JSON.stringify(R));
console.log(JSON.stringify({start:{t:Math.round(start.t/60),tg:start.tg&&Math.round(start.tg/60)},end:{t:Math.round(cur.t/60),tg:cur.tg&&Math.round(cur.tg/60),errs:cur.errs},stat,evals,secs:Math.round((Date.now()-T0)/1000)}));
