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
for(const c of opt.classes){ const T=trainers(c.cls); if(!T.length){ log.push(c.cls+': no trainers'); continue; } let last=c.start??(R.char.level||1); const ms=new Set(c.milestones||[]);
  const nearest=p=>{ let b=null,bd=1e18; for(const t of T){ if(!p||cont(t.loc.z)!==cont(p.z)) continue; const d=Math.hypot(t.p.X-p.X,t.p.Y-p.Y); if(d<bd){ bd=d; b=t; } } return b?{t:b,d:bd}:null; };
  for(let k=0;k<R.steps.length;k++){ const L=lv[k]; if(L==null||L<=last) continue; const n=nearest(pos[k]); const pend=n?spellsAt(n.t.list,last,L):[];
    const due=[...ms].some(m=>m>last&&m<=L); const near=n&&n.d<=(c.near||250);
    if((near&&(pend.length>=(c.min||2)||due))||((L-last>=(c.overdue||4)||due)&&n)){
      // overdue or a milestone with no trainer near: the cheapest point in the next few steps (shortest walk to a trainer)
      let kk=k, best=n; if(!near){ for(let j=k;j<Math.min(R.steps.length,k+40);j++){ if(lv[j]!==L) break; const m=nearest(pos[j]); if(m&&m.d<best.d){ best=m; kk=j; } } }
      const sp=spellsAt(best.t.list,last,L).map(s=>s[1]+(s[2]?' '+s[2].replace('Rank ','r'):''));
      add(kk,{t:'train',cls:c.cls,loc:best.t.loc,text:'Train '+c.cls+' at '+best.t.name+(sp.length?': '+sp.slice(0,6).join(', ')+(sp.length>6?' and '+(sp.length-6)+' more':''):'')});
      log.push(c.cls+' L'+L+' @'+kk+' '+best.t.name+(near?'':' (detour '+Math.round(best.d)+' yd)')); last=L; } } }
const out=[]; let n=0; R.steps.forEach((s,k)=>{ out.push(s); for(const x of ins.get(k)||[]) out.push(Object.assign({id:'tr'+(n++)},x)); });
R.steps=out; const r2=W.S.runRested(R.steps,R.char,{tgt:opt.tgt||60,err:true});
fs.writeFileSync(OUT,JSON.stringify(O));
console.log(JSON.stringify({before:+((r.lvT[opt.tgt||60]||r.t)/3600).toFixed(2),after:+((r2.lvT[opt.tgt||60]||r2.t)/3600).toFixed(2),stops:n,errs:r2.errs}));
console.log(log.join('\n'));
