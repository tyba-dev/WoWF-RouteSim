// SPDX-License-Identifier: GPL-3.0-or-later
// Adds class-trainer stops to a route: a class trains when its trainer is near the route and enough is waiting, or is sent
// to the nearest trainer when it is overdue; milestones (a mage's teleports and portals) are always fetched.
// usage: node tools/train.js <route.json> <out.json> <options.json>
// options: {classes:[{cls:'Paladin', start:6, near:250, min:2, overdue:4, milestones:[20,30,40,50]}], params, block, tgt}
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const [IN,OUT,OPTF]=process.argv.slice(2); const opt=JSON.parse(fs.readFileSync(OPTF,'utf8'));
const O=JSON.parse(fs.readFileSync(IN,'utf8')); const R=O.route||O;
const W=require('../index.js').open(); W.useRoute(R);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','builder.js'),'utf8')+'\n;globalThis.ROUTEBLOCK=ROUTEBLOCK;',W.P.ctx,{filename:'builder.js'});
W.P.ctx.ROUTEBLOCK(opt.block||[]); W.setParams(opt.params||{});
const C=W.P.ctx, META=vm.runInContext('META',C), zp=vm.runInContext('zp2plane',C);
const cont=z=>META.zones[z]?.m;
// trainers of a class on the group's side, with the spell list each one teaches
const trainers=cls=>Object.entries(META.trn).filter(([id,v])=>v[1]===cls&&/A/.test(v[2])&&META.tsp.n[id]!=null).flatMap(([id,v])=>v[3].map(l=>({id,name:v[0],list:META.tsp.n[id],loc:{z:l[0],px:l[1],py:l[2]},p:Object.assign(zp(l[0],l[1],l[2]),{z:l[0]})})));
const spellsAt=(list,lo,hi)=>(META.tsp.t[list]||[]).filter(s=>s[0]>lo&&s[0]<=hi);
// positions and levels step by step
const pos=[], lv=[]; const r=W.S.runRested(R.steps,R.char,{tgt:opt.tgt||60,onStep:(k,s)=>{ pos[k]=s.pos; lv[k]=s.L; }});
const ins=new Map(); const add=(k,st)=>{ if(!ins.has(k)) ins.set(k,[]); ins.get(k).push(st); }; const log=[];
// one pass over the route for all classes together: when one class has to train, every class with spells waiting and a
// trainer near that one trains in the same stop (cities hold most trainers), so the group makes one visit, not several
const CL=opt.classes.map(c=>({c,T:trainers(c.cls),last:c.start??(R.char.level||1),ms:new Set(c.milestones||[])})).filter(x=>{ if(!x.T.length) log.push(x.c.cls+': no trainers'); return x.T.length; });
const nearestT=(T,p)=>{ let b=null,bd=1e18; for(const t of T){ if(!p||cont(t.loc.z)!==cont(p.z)) continue; const d=Math.hypot(t.p.X-p.X,t.p.Y-p.Y); if(d<bd){ bd=d; b=t; } } return b?{t:b,d:bd}:null; };
for(let k=0;k<R.steps.length;k++){ const L=lv[k]; if(L==null) continue;
  let lead=null; // the class that must train now, and where
  for(const x of CL){ if(L<=x.last) continue; const n=nearestT(x.T,pos[k]); if(!n) continue; const pend=spellsAt(n.t.list,x.last,L); const due=[...x.ms].some(m=>m>x.last&&m<=L); const near=n.d<=(x.c.near||250);
    if((near&&(pend.length>=(x.c.min||2)||due))||L-x.last>=(x.c.overdue||4)||due){ let kk=k, best=n; if(!near){ for(let j=k;j<Math.min(R.steps.length,k+40);j++){ if(lv[j]!==L) break; const m=nearestT(x.T,pos[j]); if(m&&m.d<best.d){ best=m; kk=j; } } } if(!lead||best.d<lead.best.d) lead={x,kk,best,near}; } }
  if(!lead) continue; const at=lead.best.t.p, kk=lead.kk;
  for(const x of CL){ if(L<=x.last) continue; const t=x===lead.x?lead.best.t:(()=>{ let b=null,bd=1e18; for(const t of x.T){ if(cont(t.loc.z)!==cont(at.z)) continue; const d=Math.hypot(t.p.X-at.X,t.p.Y-at.Y); if(d<bd){ bd=d; b=t; } } return bd<=(opt.sync||400)?b:null; })(); if(!t) continue;
    const sp=spellsAt(t.list,x.last,L); if(!sp.length&&x!==lead.x) continue; const nm=sp.map(s=>s[1]+(s[2]?' '+s[2].replace('Rank ','r'):''));
    add(kk,{t:'train',cls:x.c.cls,loc:t.loc,text:'Train '+x.c.cls+' at '+t.name+(nm.length?': '+nm.slice(0,6).join(', ')+(nm.length>6?' and '+(nm.length-6)+' more':''):'')});
    log.push(x.c.cls+' L'+L+' @'+kk+' '+t.name+(x===lead.x&&!lead.near?' (detour '+Math.round(lead.best.d)+' yd)':'')); x.last=L; }
  k=Math.max(k,kk); }
const out=[]; let n=0; R.steps.forEach((s,k)=>{ out.push(s); for(const x of ins.get(k)||[]) out.push(Object.assign({id:'tr'+(n++)},x)); });
R.steps=out; const r2=W.S.runRested(R.steps,R.char,{tgt:opt.tgt||60,err:true});
fs.writeFileSync(OUT,JSON.stringify(O));
console.log(JSON.stringify({before:+((r.lvT[opt.tgt||60]||r.t)/3600).toFixed(2),after:+((r2.lvT[opt.tgt||60]||r2.t)/3600).toFixed(2),stops:n,errs:r2.errs}));
console.log(log.join('\n'));
