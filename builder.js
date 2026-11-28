// SPDX-License-Identifier: GPL-3.0-or-later
// Route builder on the wowf-sim engine: greedy insertion (quests, quest-hub bundles, packs from the spawn grid,
// dungeons, a forced chain), flights, then large-neighbourhood search. Every candidate is timed by the engine,
// resumed from the snapshot just before the first changed step. Runs inside the planner context (loaded by index.js).
'use strict';
// HC: keep out of dangerous zones (walking and their flight paths). spec: [zone names] (always) or {zone name: level it opens at}.
// ROUTETIER(L) switches the walking grid to the one for level L; path caches are kept per grid. Shared with tools/postpass.js.
var ROUTEBLOCK=function(spec){ if(!spec||!NAV||ROUTEBLOCK.done) return; ROUTEBLOCK.done=1;
 const by=Array.isArray(spec)?Object.fromEntries(spec.map(n=>[n,99])):spec; const zmin={}; for(const [z,Z] of Object.entries(META.zones)) if(by[Z.n]!=null) zmin[+z]=+by[Z.n];
 const ids=Object.keys(zmin).map(Number); if(!ids.length) return; ROUTEBLOCK.zmin=zmin; ROUTEBLOCK.perm=new Set(ids.filter(z=>zmin[z]>=99));
 const cells={}; for(const z of ids){ const a=zp2plane(z,0,0), b=zp2plane(z,100,100); const x0=Math.min(a.X,b.X),x1=Math.max(a.X,b.X),y0=Math.min(a.Y,b.Y),y1=Math.max(a.Y,b.Y);
   const c0=Math.max(0,Math.floor((x0-NAV.x0)/NAV.cell)), c1=Math.min(NAV.w-1,Math.floor((x1-NAV.x0)/NAV.cell)), r0=Math.max(0,Math.floor((y0-NAV.y0)/NAV.cell)), r1=Math.min(NAV.h-1,Math.floor((y1-NAV.y0)/NAV.cell)); const l=cells[z]=[];
   for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++){ const i=r*NAV.w+c; if(!NAV.g[i]) continue; const q=plane2zone(NAV.x0+(c+.5)*NAV.cell,NAV.y0+(r+.5)*NAV.cell); const qz=q?(q.z!=null?q.z:q):null; if(+qz===z) l.push(i); } }
 const base=NAV.g; const grids=new Map(); const forL=[]; let tier='';
 const gridFor=L=>{ if(forL[L]) return forL[L]; const bl=ids.filter(z=>zmin[z]>L).sort((a,b)=>a-b); const key=bl.join(','); let g=grids.get(key); if(!g){ g={key,g:base.slice()}; for(const z of bl) for(const i of cells[z]) g.g[i]=0; grids.set(key,g); } return forL[L]=g; };
 const pg=PATHS.get.bind(PATHS), ps=PATHS.set.bind(PATHS), ph=PATHS.has.bind(PATHS); PATHS.clear();
 PATHS.get=k=>pg(k+'#'+tier); PATHS.set=(k,v)=>ps(k+'#'+tier,v); PATHS.has=k=>ph(k+'#'+tier);
 ROUTETIER=L=>{ const g=gridFor(Math.max(1,Math.min(60,L|0))); if(NAV.g!==g.g){ NAV.g=g.g; tier=g.key; ROUTETIERKEY=tier; } }; ROUTETIER(1);
 ROUTEBLOCK.zoneMin=p=>{ if(!p) return 0; let z=p.z; if(z==null){ const q=plane2zone(p.X,p.Y); z=q&&(q.z!=null?q.z:q); } return zmin[+z]||0; };
 const tn=taxiNodes; taxiNodes=(...a)=>tn(...a).filter(n=>{ const p=taxiPt(n.id); if(!p) return false; const m=ROUTEBLOCK.zoneMin(p); n.zmin=m; return m<99; }); };
var ROUTETIER=null; var ROUTETIERKEY='';
var ROUTEBUILD=function(opt){
 const T0=Date.now(), MS=opt.ms||1800000, TGT=opt.tgt||40, K=opt.K||40, tol=opt.lvTol??1;
 const CH0=opt.char; const ch=Object.assign({},CH0);
 ROUTEBLOCK(opt.block);
 let steps=(opt.seed||[]).map(s=>Object.assign({},s));
 const cont=z=>META.zones[z]?.m; const HOMES=new Set(opt.conts||[0,1]); const BZ=ROUTEBLOCK.perm||new Set(); const zMin=p=>ROUTEBLOCK.zoneMin?ROUTEBLOCK.zoneMin(p):0; const okP=p=>p&&!p.dg&&HOMES.has(cont(p.z))&&!BZ.has(+p.z);
 const gray=L=>L<10?5:L<20?6:L<30?7:L<40?8:9; const need=totalXP(TGT,0);
 // ---- evaluation (incremental) ----
 let snaps=null, cur=null;
 let RO={}; const ro=o=>Object.assign(o,RO); const setRest=()=>{ const RS=ch.rested; if(!opt.tents||!RS||!RS.on){ RO={}; return; } if(opt.restStart!=null){ RO={rested:RS,restStart:opt.restStart}; return; } /* resuming: keep the rest window the seed was built with */ const val=r=>(r.errs||0)*1e8+(r.tg!=null?r.tg:1e9-totalXP(r.L,r.xp)); const r=SIMX.runRested(steps,ch,{tgt:TGT,restScan:6}); let best={st:r.restStart||0,v:val(r)}; if(RO.restStart!=null&&RO.restStart!==best.st){ const H=(RS.hours||50)*3600; const r2=SIMX.run(steps,ch,{tgt:TGT,rested:RS,restStart:RO.restStart}); if(RO.restStart>=(r2.tg||r2.t)-H-60&&val(r2)<best.v) best={st:RO.restStart,v:val(r2)}; } RO={rested:RS,restStart:best.st}; };
 const full=()=>{ let r=SIMX.run(steps,ch,ro({snaps:true,tgt:TGT})); if(RO.restStart!=null&&RO.restStart<(r.tg||r.t)-(ch.rested.hours||50)*3600-60){ setRest(); r=SIMX.run(steps,ch,ro({snaps:true,tgt:TGT})); } /* tents must stay in the last N hours: refit when the route got shorter */ snaps=r.snaps; cur=meas(r); return cur; };
 const meas=r=>({t:r.t,tg:r.tg,errs:r.errs,L:r.L,tot:totalXP(r.L,r.xp)});
 const evalFrom=(st,k)=>{ const from=snaps[Math.min(k,snaps.length-1)]; const r=SIMX.run(st,ch,ro({from:{k,state:from},tgt:TGT,stopAtTgt:true})); return meas(r); };
 // horizon scoring: play the candidate only to H steps past its last change and compare with the current route at the same point
 const H=opt.horizon||0; const stAt=k=>{ const x=snaps[Math.min(k,snaps.length-1)]; return {t:x.t,tg:null,errs:x.errs,L:x.L,tot:totalXP(x.L,x.xp)}; };
 const evalH=(st,k0,kLast)=>{ const nIns=st.length-steps.length; const end=Math.min(st.length,kLast+nIns+H); if(!H||end>=st.length||(cur.tg!=null&&snaps.length&&end-nIns>=snaps.length-1)) { const m=evalFrom(st,k0); return {m,d:score(m)-score(cur)}; }
   const r=SIMX.run(st.slice(0,end),ch,ro({from:{k:k0,state:snaps[Math.min(k0,snaps.length-1)]},tgt:TGT,stopAtTgt:true})); const m=meas(r); if(m.tg!=null){ const mf=evalFrom(st,k0); return {m:mf,d:score(mf)-score(cur)}; } return {m,d:score(m)-score(stAt(end-nIns))}; };
 let VK=4; const scoreV=(m,vk)=>m.tg?m.tg:m.t+(need-m.tot)/(vk*XP_TABLE[Math.min(59,m.L)])*3600; const score=m=>scoreV(m,VK);
 // ---- pool ----
 const pool=[]; for(const id of Object.keys(DB.q)){ const q=+id, x=Q(q); if(!x) continue; const e=EXTRA.quests[q]; if(!(e&&e.xp)&&!(QXP[q])) continue; const ql=(e&&e.l)||x.l||1; if(ql>(opt.maxQL||TGT+3)) continue; if((x.r||1)>TGT-1) continue; if(isDungeonQuest(q)) continue; if((opt.ban||[]).includes(q)||(opt.chain||[]).includes(q)) continue; if(opt.banRe&&new RegExp(opt.banRe,'i').test(x.n||'')) continue; if(opt.noClassQ&&(x.cl||(x.z<0&&typeof CLASS_SORT_NAME!=='undefined'&&CLASS_SORT_NAME[x.z]))) continue; if(opt.allRace&&x.ra&&(x.ra&opt.allRace)!==opt.allRace) continue; if(opt.noProf&&(x.sk||(x.z<0&&typeof PROF_SORTS!=='undefined'&&PROF_SORTS.has(x.z)))) continue; /* professions the group may not have */ if(opt.rareStart&&(x.s.i||[]).some(i=>{ const I=DB.i[i]; return I&&(I.d||[]).length>opt.rareStart; })) continue; /* started by a world drop: can't be counted on */ /* mixed groups: only quests every member can take */
   const w=whyUnavailable(q,{level:60,turned:new Set(),log:new Map()},route); if(w&&w.hard) continue;
   const sp=starterPts(q).filter(okP), fp=finisherPts(q).filter(okP); if(!sp.length||!fp.length) continue;
   const ob=(objectives(q)||[]).filter(o=>!o.pre); if(ob.some(o=>!o.pts||!o.pts.length||o.pts.every(p=>!okP(p)))) continue;
   const obp=ob.map(o=>o.pts.filter(okP)); const zr=Math.max(Math.min(...sp.map(zMin)),Math.min(...fp.map(zMin)),...obp.map(l=>Math.min(...l.map(zMin)))); pool.push({q,sp,fp,ob:obp,r:Math.max(x.r||1,zr),ps:x.ps||[],pg:x.pg||[]}); }
 if(opt.dumpPool) opt.dumpPool.push(...pool.map(c=>({q:c.q,r:c.r,z:c.sp[0].z})));
 // pack cells: centre = mean spawn of the cell
 const MC=+META.mobl.c; const CELLS=[]; { const by=new Map(); for(const [k,l] of spawnIdx().g) for(const m of l){ const kk=Math.floor(m.X/MC)+','+Math.floor(m.Y/MC); const c=by.get(kk)||by.set(kk,{X:0,Y:0,n:0,lv:[]}).get(kk); c.X+=m.X; c.Y+=m.Y; c.n++; c.lv.push(Math.round(m.lv)); }
   for(const [k,c] of by){ if(c.n<(opt.pkMin||8)) continue; const p={X:c.X/c.n,Y:c.Y/c.n}; const z=plane2zone(p.X,p.Y); if(!z) continue; p.z=z.z; if(!okP(p)) continue; CELLS.push({k,p,lv:c.lv,lo:Math.min(...c.lv),hi:Math.max(...c.lv),loc:{z:z.z,px:Math.round(z.px*10)/10,py:Math.round(z.py*10)/10}}); } }
 const usedCell=new Set();
 // distances (boats between continents)
 const BL=[]; for(const l of (NAV.links||[])){ if(!/A/.test(l.f||'')||/^Walk/.test(l.n||'')) continue; const A={X:NAV.x0+((l.ia%NAV.w)+.5)*NAV.cell,Y:NAV.y0+(((l.ia/NAV.w)|0)+.5)*NAV.cell}, B={X:NAV.x0+((l.ib%NAV.w)+.5)*NAV.cell,Y:NAV.y0+(((l.ib/NAV.w)|0)+.5)*NAV.cell}; const za=plane2zone(A.X,A.Y), zb=plane2zone(B.X,B.Y); if(!za||!zb) continue; A.z=za.z; B.z=zb.z; if(cont(A.z)===cont(B.z)) continue; BL.push({A,B,c:(shipSecs(A,B)||510)*7}); }
 const D=(a,b)=>{ if(!a||!b) return 3000; if(cont(a.z)===cont(b.z)) return Math.hypot(a.X-b.X,a.Y-b.Y); let m=1e6; for(const L of BL){ if(cont(L.A.z)===cont(a.z)&&cont(L.B.z)===cont(b.z)) m=Math.min(m,Math.hypot(a.X-L.A.X,a.Y-L.A.Y)+L.c+Math.hypot(L.B.X-b.X,L.B.Y-b.Y)); if(cont(L.B.z)===cont(a.z)&&cont(L.A.z)===cont(b.z)) m=Math.min(m,Math.hypot(a.X-L.B.X,a.Y-L.B.Y)+L.c+Math.hypot(L.A.X-b.X,L.A.Y-b.Y)); } return m; };
 const FZ=opt.freeze||0; const FDBG=new Set(), FREJ=new Set(); const insPos=(pts,lv,lo,p)=>{ let best=null; const n=pts.length; for(let k=Math.max(lo,-1,FZ-1);k<n;k++){ if(k>=0&&pts[k].L<lv) continue; if(k<0&&lv>1) continue; const a=k>=0?pts[k].p:null, b=k+1<n?pts[k+1].p:null; const d=(a?D(a,p):0)+(b?D(p,b):0)-(a&&b?D(a,b):0); if(!best||d<best.d) best={k,d}; } return best; };
 const near=(arr,p)=>{ let b=arr[0],bd=1e18; for(const x of arr){ const d=D(x,p); if(d<bd){bd=d;b=x;} } return b; };
 const build=(c,pts,lo0)=>{ const pc=[]; let lo=(lo0==null?-1:lo0), cost=0; for(const pz of c){ const b=insPos(pts,pz.lv,lo,pz.p); if(!b) return null; pc.push([b.k,pz.steps]); lo=b.k; cost+=b.d; } return {pc,cost}; };
 const apply=pc=>{ const by=new Map(); for(const [k,st] of pc) (by.get(k)||by.set(k,[]).get(k)).push(...st.map(s=>Object.assign({},s,{id:uid(),b20:1}))); const out=[...(by.get(-1)||[])]; steps.forEach((s,k)=>{ out.push(s); const b=by.get(k); if(b) out.push(...b); }); return out; };
 const first=pc=>Math.min(...pc.map(x=>x[0]))+1;
 const runs=opt.runs||[]; const usedRun=new Set(); for(const st of (opt.seed||[])) if(st.mode==='run'&&st.dg){ usedRun.add(st.dg); for(const r of runs) if(r.dg===st.dg&&r.grp) usedRun.add(r.grp); } { const cn=new Set((opt.seed||[]).filter(st=>st.t==='custom'&&st.name).map(st=>st.name)); for(const r of runs) if((r.steps||[]).some(st=>st.t==='custom'&&cn.has(st.name))) usedRun.add(r.grp||r.dg); }
 const runPieces=(r,inR)=>{ const pieces=[]; for(const q of r.acc){ if(inR.has(q)) continue; const sp=starterPts(q).filter(p=>!p.dg); if(!sp.length) continue; pieces.push({p:sp[0],lv:Q(q).r||1,steps:[{t:'accept',q}]}); } const rp=zp2plane(r.loc.z,r.loc.px,r.loc.py); pieces.push({p:rp,lv:Math.max((r.lv||1)-tol,zMin(rp)),steps:r.steps}); for(const q of r.tin){ const fp=finisherPts(q).filter(p=>!p.dg); if(!fp.length) continue; pieces.push({p:near(fp,rp),lv:1,steps:[{t:'turnin',q}]}); } return pieces; };
 const CH=opt.chain||[]; const forced=[]; let ban=new Set(); let acc=0, rounds=0, flyAcc=0, nFail=0, nBund=0, evals=0; const log=[];
 const ptsNow=()=>{ const n=steps.length; const pts=new Array(n); for(let k=0;k<n;k++){ const sN=snaps[k+1]; pts[k]={p:sN&&sN.pos,L:sN?sN.L:1}; } for(let k=0;k<n;k++) if(!pts[k].p) pts[k].p=k?pts[k-1].p:null; return pts; };
 // flights: strip auto flights, learn flight paths passed within 200 yd, fly legs where it is quicker
 const tryFly=()=>{ const sv=steps; const svCur=cur; steps=steps.filter(x=>!x.auto); full(); const nodes=taxiNodes(); const fps=new Set(snaps[0].fps); const ins=[];
   steps.forEach((s,k)=>{ const a=snaps[k].pos, b=snaps[k+1].pos; if(s.t==='travel'&&s.kind==='fp'&&s.node) fps.add(s.node); if(!a||!b||cont(a)!==cont(b)) return; const d=Math.hypot(b.X-a.X,b.Y-a.Y); if(d<250) return;
     for(const n of nodes){ if(fps.has(n.id)||n.m!==cont(a)||(n.zmin||0)>snaps[k].L) continue; const p=taxiPt(n.id); if(p&&segDist(p,a,b)<200){ ins.push([k,{t:'travel',kind:'fp',node:n.id,text:taxiShort(n.id),auto:1}]); fps.add(n.id); } }
     const dep=nearestNode(a,fps), arr=nearestNode(b,fps); if(!dep||!arr||dep===arr) return; const P=taxiPt(dep), Q2=taxiPt(arr); if(!P||!Q2) return; const run=runSpeed(snaps[k].L,3);
     const walk=d*1.25/run, fr=flightRoute(dep,arr); const fly=Math.hypot(P.X-a.X,P.Y-a.Y)*1.25/run+((fr&&fr.secs)||Math.hypot(Q2.X-P.X,Q2.Y-P.Y)/30)+20+Math.hypot(b.X-Q2.X,b.Y-Q2.Y)*1.25/run; if(fly<walk-30) ins.push([k,{t:'travel',kind:'fly',node:arr,text:taxiShort(arr),auto:1}]); });
   for(let i=ins.length-1;i>=0;i--){ const [k,st]=ins[i]; steps.splice(k,0,{id:uid(),...st}); } full(); if(cur.errs<=svCur.errs&&score(cur)<score(svCur)) flyAcc++; else { steps=sv; full(); } };
 const TB=new Map(), tbk=c=>c.q?"q"+c.q:c.cell?"c"+c.cell:c.hub?"h"+c.hub:"r"+c.dg+":"+c.nq;
 const grow=(vks,deadline)=>{ for(const vk of vks){ VK=vk;
  for(;;){ if(Date.now()>deadline) return; rounds++;
   const pts=ptsNow(); const inR=new Set(steps.filter(s=>s.q).map(s=>s.q)); const tiAt=new Map(); steps.forEach((s,k)=>{ if(s.t==='turnin') tiAt.set(s.q,k); });
   { let fc=null; const ci=CH.findIndex(q=>!inR.has(q));
     if(ci>=0){ const q=CH[ci], x=Q(q); const lvMin=Math.max((x.l||1)-(opt.chainLead||2),x.r||1); const prevK=ci?tiAt.get(CH[ci-1]):-1;
       if(cur.L>=lvMin&&prevK!=null){ const sp=starterPts(q).filter(p=>!p.dg), fp=finisherPts(q).filter(p=>!p.dg); const ref=ci?pts[prevK].p:null; const s0=ref?near(sp,ref):sp[0]; const ob=(objectives(q)||[]).filter(o=>!o.pre&&o.pts&&o.pts.length);
         const pcs=[{p:s0,lv:lvMin,steps:[{t:'accept',q,chain:1}]}]; let cp=s0; for(const o of ob) cp=near(o.pts.filter(p=>!p.dg),cp); if(ob.length) pcs.push({p:cp,lv:lvMin,steps:[{t:'complete',q,chain:1}]}); pcs.push({p:near(fp,cp),lv:lvMin,steps:[{t:'turnin',q,chain:1}]});
         const b=build(pcs,pts,prevK); if(b) fc=[{b,tag:'chain '+q}]; } }
     // class chains (one player's quests): each chain in order, its next quest placed once the group is in its level window
     if(!fc) for(const chn of (opt.chains||[])){ const qs=chn.qs||chn; const ci=qs.findIndex(q=>!inR.has(q)); if(ci<0) continue; const q=qs[ci], x=Q(q); if(!x) continue; const lvMin=Math.max((x.l||1)-(chn.lead??2),x.r||1); const prevK=ci?tiAt.get(qs[ci-1]):-1; if(cur.L<lvMin||prevK==null) continue;
       let sp=starterPts(q).filter(p=>!p.dg); let fp=finisherPts(q).filter(p=>!p.dg); if(!sp.length&&ci&&pts[prevK]&&pts[prevK].p) sp=[pts[prevK].p]; /* offered on the spot by the previous quest */ if(!sp.length) continue; { const m=cont(sp[0].z); const f2=fp.filter(p=>cont(p.z)===m); fp=f2.length?f2:sp; } /* a finisher on our side (the data also lists the other faction's) */ const ref=ci?pts[prevK].p:null; const s0=ref?near(sp,ref):sp[0]; const ob=(objectives(q)||[]).filter(o=>!o.pre&&o.pts&&o.pts.length);
       const pcs=[{p:s0,lv:lvMin,steps:[{t:'accept',q,chain:1,cls:chn.cls||1}]}]; let cp=s0; for(const o of ob) cp=near(o.pts.filter(p=>!p.dg),cp)||cp; if(ob.length) pcs.push({p:cp,lv:lvMin,steps:[{t:'complete',q,chain:1,cls:chn.cls||1}]}); pcs.push({p:near(fp,cp),lv:lvMin,steps:[{t:'turnin',q,chain:1,cls:chn.cls||1}]});
       const b=build(pcs,pts,prevK); if(b){ fc=[{b,tag:'class '+q}]; break; } }
     if(!fc) for(const dg of (opt.forceRuns||[])){ if(usedRun.has(dg)||FREJ.has('run '+dg+'|'+cur.L)) continue; const vs=runs.filter(r=>r.dg===dg); if(!vs.length) continue; const lvF=(vs[0].lv||1)-tol+(opt.forceSlack??1); if(cur.L<lvF) continue; fc=vs.map(r=>{ const pcs=runPieces(r,inR); const b=build(pcs,pts); if(!b&&!FDBG.has(dg+cur.L)){ FDBG.add(dg+cur.L); let lo=-1; for(const pz of pcs){ const x=insPos(pts,pz.lv,lo,pz.p); if(!x){ console.error(JSON.stringify({forceFail:dg,L:cur.L,piece:pz.steps.map(t=>t.t+(t.q||'')).slice(0,3),lv:pz.lv,lo,n:pts.length,maxL:pts.length?pts[pts.length-1].L:0})); break; } lo=x.k; } } return b?{b,tag:'run '+dg,dg}:null; }).filter(Boolean); if(fc.length) break; fc=null; }
     if(fc){ let bf=null; for(const c of fc){ const ns=apply(c.b.pc); const sv=steps; steps=ns; const m=full(); steps=sv; evals++; if(!bf||m.errs<bf.m.errs||(m.errs===bf.m.errs&&score(m)<score(bf.m))) bf={c,m,ns}; }
       if(bf&&bf.m.errs>cur.errs+(opt.forceErrTol??2)){ /* placing it here breaks the route: try again at the next level */ FREJ.add(bf.c.tag+'|'+cur.L); bf=null; }
       if(bf){ steps=bf.ns; full(); if(bf.c.dg) usedRun.add(bf.c.dg); forced.push([bf.c.tag,cur.L,Math.round(cur.t/60),cur.errs]); continue; } } }
   const C=[]; const avail=[];
   for(const c of pool){ if(inR.has(c.q)||ban.has(c.q)) continue; let lo=-1; if(c.ps.length){ const ks=c.ps.map(p=>tiAt.get(p)).filter(x=>x!=null); if(!ks.length) continue; lo=Math.min(...ks); } let bad=false; for(const p of c.pg){ const k=tiAt.get(p); if(k==null){bad=true;break;} lo=Math.max(lo,k); } if(bad) continue;
     let s=c.sp[0],bd=1e18; for(const x of c.sp) for(let i=0;i<pts.length;i+=4){ if(!pts[i].p||pts[i].L<c.r) continue; const d=D(x,pts[i].p); if(d<bd){bd=d;s=x;} }
     let curp=s, tour=0; const op=[]; for(const o of c.ob){ const x=near(o,curp); tour+=D(curp,x); op.push(x); curp=x; } const f=near(c.fp,curp); tour+=D(curp,f);
     const pieces=[{p:s,lv:c.r,steps:[{t:'accept',q:c.q}]}]; if(c.ob.length) pieces.push({p:op[op.length-1],lv:c.r,steps:[{t:'complete',q:c.q}]}); pieces.push({p:f,lv:c.r,steps:[{t:'turnin',q:c.q}]});
     const b=build(pieces,pts,lo); if(!b) continue; const L=Math.max(c.r,(pts[b.pc[b.pc.length-1][0]]||{L:1}).L||1); const xp=SIMX.questXP(c.q,L); if(xp<=0) continue;
     let kills=0; for(const n of SIMX.needsOf(c.q,ch.party||3)) kills+=n.k==='item'?n.rem/0.35:n.k==='kill'?n.rem:2;
     const secs=(b.cost+tour*0.3)*1.15/runSpeed(L,3)+kills*12+20; C.push({q:c.q,b,xp,secs,v:xp/secs}); avail.push({c,s,op,f,lo,xp,secs:kills*12+tour*0.3*1.15/runSpeed(L,3)}); }
   if(opt.bundles!==false){ const hubs=new Map(); for(const a of avail){ const k=Math.round(a.s.X/120)+','+Math.round(a.s.Y/120)+','+cont(a.s.z); (hubs.get(k)||hubs.set(k,[]).get(k)).push(a); }
     for(const [hk,g] of hubs){ if(g.length<2||ban.has('H'+hk)) continue; g.sort((a,b)=>b.xp/b.secs-a.xp/a.secs); const mem=g.slice(0,opt.bundleMax||6); const lv=Math.max(...mem.map(a=>a.c.r)); const lo=Math.max(...mem.map(a=>a.lo));
       const pcs=[{p:mem[0].s,lv,steps:mem.map(a=>({t:'accept',q:a.c.q}))}]; let cp=mem[0].s; const left=mem.filter(a=>a.c.ob.length).slice(); while(left.length){ let bi=0,bd=1e18; left.forEach((a,i)=>{ const d=D(cp,a.op[a.op.length-1]); if(d<bd){bd=d;bi=i;} }); const a=left.splice(bi,1)[0]; cp=a.op[a.op.length-1]; pcs.push({p:cp,lv,steps:[{t:'complete',q:a.c.q}]}); }
       const tl=mem.slice(); while(tl.length){ let bi=0,bd=1e18; tl.forEach((a,i)=>{ const d=D(cp,a.f); if(d<bd){bd=d;bi=i;} }); const a=tl.splice(bi,1)[0]; const grp=tl.filter(x=>D(x.f,a.f)<60); for(const x of grp) tl.splice(tl.indexOf(x),1); cp=a.f; pcs.push({p:a.f,lv,steps:[a,...grp].map(x=>({t:'turnin',q:x.c.q}))}); }
       const b=build(pcs,pts,lo); if(!b) continue; const xp=mem.reduce((s,a)=>s+a.xp,0), secs=mem.reduce((s,a)=>s+a.secs,0)+b.cost*1.15/7+20*mem.length; C.push({hub:hk,qs:mem.map(a=>a.c.q),b,xp,secs,v:xp/secs*1.05}); } }
   { const B=new Map(), BS=300; pts.forEach((x,k)=>{ if(!x.p) return; const kk=Math.floor(x.p.X/BS)+','+Math.floor(x.p.Y/BS); (B.get(kk)||B.set(kk,[]).get(kk)).push(k); });
     for(const c of CELLS){ if(usedCell.has(c.k)) continue; const bx=Math.floor(c.p.X/BS), by=Math.floor(c.p.Y/BS); let nearL=null; for(let i=-1;i<=1&&nearL==null;i++) for(let j=-1;j<=1;j++){ const l=B.get((bx+i)+','+(by+j)); if(l&&l.length){ nearL=pts[l[l.length-1]].L; break; } } if(nearL==null) continue;
       const okN=L=>c.lv.reduce((a,ml)=>a+(L-ml<gray(L)&&ml<=L+2?1:0),0); if(okN(Math.max(nearL,c.hi-2))<(opt.pkMin||8)) continue;
       const b=build([{p:c.p,lv:Math.max(1,c.lo-2,zMin(c.p)),steps:[{t:'grind',pack:1,loc:c.loc,note:'Clear this area once (AoE pulls)'}]}],pts); if(!b) continue; const L=(pts[b.pc[0][0]]||{L:1}).L; const N=okN(L); if(N<(opt.pkMin||8)) continue;
       const xp=N*mobXP(L,L,false,ch.party||3); const secs=N*5+b.cost*1.15/runSpeed(L,3); C.push({cell:c.k,b,xp,secs,v:xp/(secs+5)}); } }
   for(const r of runs){ if(usedRun.has(r.grp||r.dg)||ban.has('R'+r.dg+':'+r.acc.length)) continue; const b=build(runPieces(r,inR),pts); if(!b) continue; C.push({dg:r.dg,grp:r.grp,nq:r.acc.length,b,xp:r.xp||5000,secs:(r.mins||20)*60,v:1e9}); }
   C.sort((a,b)=>b.v-a.v); const top=C.filter(c=>TB.get(tbk(c))!==cur.L+"|"+vk).slice(0,K); let best=null; const cs=score(cur);
   for(const c of top){ const ns=apply(c.b.pc); let m, dd; try{ const e=evalH(ns,first(c.b.pc),Math.max(...c.b.pc.map(x=>x[0]))+1); m=e.m; dd=e.d; }catch(e){ if(c.q) ban.add(c.q); else if(c.cell) usedCell.add(c.cell); else if(c.hub) ban.add('H'+c.hub); continue; } evals++; if(opt.dbg) opt.dbg.push([vk,c.q||c.cell||c.dg||('hub'+c.hub),Math.round(c.v*1000)/1000,m.errs-cur.errs,Math.round(dd),m.L]); if(m.errs>cur.errs||dd>=-1){ TB.set(tbk(c),cur.L+"|"+vk); continue; } /* no use at this level: keep it out of the top K until the level changes, so it cannot crowd out the rest */ const sc=cs+dd; if(!best||sc<best.sc) best={c,sc,ns}; }
   if(opt.dbg) opt.dbg.push(['round',vk,'C',C.length,'pool',pool.filter(c=>!inR.has(c.q)&&!ban.has(c.q)).length,'best',best?Math.round(best.sc-cs):null]);
   if(!best) break;
   const sv=steps, svCur=cur; steps=best.ns; full(); const c=best.c;
   if(cur.errs>svCur.errs||score(cur)>=cs){ steps=sv; full(); if(c.q) ban.add(c.q); else if(c.cell) usedCell.add(c.cell); else if(c.hub) ban.add('H'+c.hub); else ban.add('R'+c.dg+':'+c.nq); nFail++; continue; }
   acc++; if(c.dg) usedRun.add(c.grp||c.dg); if(c.cell) usedCell.add(c.cell); if(c.hub) nBund++;
   if(opt.fly&&acc%(opt.flyEvery||4)===0) tryFly();
   if(acc%25===0&&opt.progress) opt.progress({acc,rounds,evals,L:cur.L,t:Math.round(cur.t/60),tg:cur.tg?Math.round(cur.tg/60):null,secs:Math.round((Date.now()-T0)/1000)});
   log.push([vk,c.q||c.dg||(c.hub?'hub'+c.qs.length:'pk'),Math.round(cur.t/60),cur.L,cur.tg?Math.round(cur.tg/60):null]); } } };
 setRest(); full();
 const vks=opt.vks||[4,3,2.5,2,1.6,1.3,1,0.8,0.65,0.5,0.4,0.3,0.22,0.15,0.1,0.07,0.05,0.035,0.025,0.015];
 if(!opt.skipGrow) grow(vks,Math.min(T0+MS,Date.now()+(opt.growMs||MS)));
 if(opt.fly) tryFly(); full(); const built={t:Math.round(cur.t/60),tg:cur.tg?Math.round(cur.tg/60):null,errs:cur.errs,L:cur.L};
 // ---- large-neighbourhood search: rip out a stretch, regrow it, keep it if the target comes sooner ----
 const lnsLog=[]; const fv=opt.finalVk||0.05; const fin=m=>scoreV(m,fv); /* blk: a dungeon's pick-ups, run, completes and hand-ins placed as one unit (they stay put and together) */ const prot=s=>s.chain||s.cls||s.blk||/^hyj/.test(s.id||'')||s.t==='train'||s.mode==='run'||s.inRun||(s.t==='travel'&&!s.auto);
 const deadline=T0+MS; let it=0; let seed=opt.seedRng||12345; const rnd=()=>{ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; };
 const RLV=new Map(); for(const [dg,lv] of Object.entries(opt.dgLv||{})) RLV.set('d:'+dg,lv); const tolUp=opt.lvTolUp??tol; for(const r of runs){ if(r.dg) RLV.set('d:'+r.dg,r.lv||1); for(const st of (r.steps||[])) if(st.t==='custom'&&st.name) RLV.set('c:'+st.name,r.lv||1); }
 const runLow=()=>{ let n=0; steps.forEach((s,k)=>{ const key=s.mode==='run'&&s.dg?'d:'+s.dg:s.t==='custom'&&s.act==='accept'?'c:'+s.name:null; const lv=key&&RLV.get(key); if(lv&&snaps[k]&&snaps[k].L<lv-tol) n+=lv-tol-snaps[k].L; if(lv&&snaps[k]&&snaps[k].L>lv+tolUp) n+=snaps[k].L-lv-tolUp; }); return n; };
 // ---- prune: drop quests and camp clears whose removal brings the target sooner (their time is worth more than their XP), then regrow ----
 const pruned=[]; for(let pass=0;pass<(opt.prune||0)&&cur.tg!=null&&Date.now()<deadline-60000;pass++){ let nAcc=0;
   const need2=new Set(); for(const s of steps){ const x=s.q&&Q(s.q); for(const p of [...(x?.ps||[]),...(x?.pg||[])]) need2.add(p); }
   const cost=new Map(); steps.forEach((s,k)=>{ if(prot(s)||s.auto) return; const key=s.q?'q'+s.q:s.pack?'p'+s.id:null; if(!key||(s.q&&(CH.includes(s.q)||need2.has(s.q)))) return; const a=snaps[k], b=snaps[k+1]; if(!a||!b) return; const o=cost.get(key)||cost.set(key,{dt:0,dx:0,k0:k}).get(key); o.dt+=b.t-a.t; o.dx+=totalXP(b.L,b.xp)-totalXP(a.L,a.xp); });
   const cand=[...cost.entries()].filter(([,o])=>snaps[o.k0]&&snaps[o.k0].t<cur.tg).sort((x,y)=>y[1].dt/(y[1].dx+500)-x[1].dt/(x[1].dx+500)).slice(0,opt.pruneN||400);
   for(const [key] of cand){ if(Date.now()>deadline-60000) break; const isQ=key[0]==='q', id=key.slice(1); const hit=s=>!prot(s)&&!s.auto&&(isQ?String(s.q)===id:s.id===id); const k0=steps.findIndex(hit); if(k0<0) continue;
     const ns=steps.filter(s=>!hit(s)); let m; try{ m=evalFrom(ns,k0); }catch(e){ continue; } evals++;
     if(m.errs<=cur.errs&&m.tg!=null&&m.tg<cur.tg-5){ const svS=steps, v0=runLow(); steps=ns; full(); if(runLow()>v0){ steps=svS; full(); continue; } nAcc++; pruned.push([key,Math.round(cur.tg/60)]); if(isQ) ban.add(+id); } }
   if(opt.progress) opt.progress({prune:pass,acc:nAcc,tg:Math.round(cur.tg/60)});
   // relocate: take a quest out and put it back where it costs least (cheapest detour), keep it if the target comes sooner
   if(opt.relocate&&cur.tg!=null){ let nRel=0; const PQ=new Map(pool.map(c=>[c.q,c])); const qs=[...new Set(steps.filter(s=>s.q&&!prot(s)&&!s.auto&&!CH.includes(s.q)&&!need2.has(s.q)&&PQ.has(s.q)).map(s=>s.q))];
     for(const q of qs){ if(Date.now()>deadline-60000) break; const c=PQ.get(q); const rem=new Set(); steps.forEach((s,k)=>{ if(s.q===q&&!prot(s)&&!s.auto) rem.add(k); }); if(!rem.size) continue; const kr=Math.min(...rem);
       const pts=ptsNow().filter((_,k)=>!rem.has(k)); const ns=steps.filter((_,k)=>!rem.has(k)); const tiAt=new Map(); ns.forEach((s,k)=>{ if(s.t==='turnin') tiAt.set(s.q,k); });
       let lo=-1, bad=false; for(const p of [...c.ps,...c.pg]){ const k=tiAt.get(p); if(k==null){ if(c.pg.includes(p)) bad=true; continue; } lo=Math.max(lo,k); } if(bad) continue;
       let s0=c.sp[0],bd=1e18; for(const x of c.sp) for(let i=0;i<pts.length;i+=3){ if(!pts[i].p||pts[i].L<c.r) continue; const d=D(x,pts[i].p); if(d<bd){bd=d;s0=x;} }
       let cp=s0; const op=[]; for(const o of c.ob){ const x=near(o,cp); op.push(x); cp=x; } const f=near(c.fp,cp);
       const pieces=[{p:s0,lv:c.r,steps:[{t:'accept',q}]}]; if(c.ob.length) pieces.push({p:op[op.length-1],lv:c.r,steps:[{t:'complete',q}]}); pieces.push({p:f,lv:c.r,steps:[{t:'turnin',q}]});
       const b=build(pieces,pts,lo); if(!b) continue; const svS=steps; steps=ns; const ns2=apply(b.pc); steps=svS; const k0=Math.min(kr,first(b.pc));
       let m; try{ m=evalFrom(ns2,k0); }catch(e){ continue; } evals++;
       if(m.errs<=cur.errs&&m.tg!=null&&m.tg<cur.tg-5){ const v0=runLow(); steps=ns2; full(); if(cur.errs>m.errs||runLow()>v0||cur.tg==null){ steps=svS; full(); continue; } nRel++; nAcc++; } }
     if(opt.progress) opt.progress({relocate:pass,acc:nRel,tg:Math.round(cur.tg/60)}); }
   // visits: drop a whole stay in one zone (every quest touching it, its camp clears) — saves the trip there, which dropping one quest never does
   if(opt.visits&&cur.tg!=null){ let nV=0; const zAt=k=>{ const p=snaps[k+1]&&snaps[k+1].pos; return p?p.z:null; }; for(let rep=0;rep<(opt.visitsN||25)&&cur.tg!=null&&Date.now()<deadline-60000;rep++){ let got=false; const vis=[]; let a=0; for(let k=1;k<=steps.length;k++){ if(k===steps.length||zAt(k)!==zAt(a)){ vis.push([a,k]); a=k; } }
     const cand=vis.filter(([a,b])=>b-a>=2&&snaps[a]&&snaps[a].t<cur.tg).map(([a,b])=>({a,b,dt:snaps[b].t-snaps[a].t})).sort((x,y)=>y.dt-x.dt);
     for(const v of cand){ if(Date.now()>deadline-60000) break; const qs=new Set(), ids=new Set(); for(let k=v.a;k<v.b;k++){ const s=steps[k]; if(!s||prot(s)||s.auto) continue; if(s.q&&!CH.includes(s.q)&&!need2.has(s.q)) qs.add(s.q); else if(s.pack) ids.add(s.id); } if(!qs.size&&!ids.size) continue;
       const hit=s=>!prot(s)&&!s.auto&&((s.q&&qs.has(s.q))||ids.has(s.id)); const k0=steps.findIndex(hit); if(k0<0) continue; const ns=steps.filter(s=>!hit(s)); let m; try{ m=evalFrom(ns,k0); }catch(e){ continue; } evals++;
       if(m.errs<=cur.errs&&m.tg!=null&&m.tg<cur.tg-5){ const svS=steps, v0=runLow(); steps=ns; full(); if(runLow()>v0||cur.tg==null){ steps=svS; full(); continue; } nV++; nAcc++; for(const q of qs) ban.add(q); pruned.push(['v'+qs.size+'+'+ids.size,Math.round(cur.tg/60)]); got=true; break; } }
     if(!got) break; }
     if(opt.progress) opt.progress({visits:pass,acc:nV,tg:Math.round(cur.tg/60)}); }
   // run moves: move a dungeon run (with the objective steps right after it) to any point in its level window, scored as target time + 2 h per level outside the window
   if(opt.runMove&&cur.tg!=null){ let nR=0; const comp=()=>cur.tg+7200*runLow();
     for(const rk of steps.map((s,k)=>s.mode==='run'&&!s.blk&&s.dg&&RLV.has('d:'+s.dg)?s.id:null).filter(Boolean)){ if(Date.now()>deadline-60000) break; const a=steps.findIndex(s=>s.id===rk); if(a<0) continue; let b=a+1; while(b<steps.length&&steps[b].t==='complete') b++; const blk=steps.slice(a,b); const lv=RLV.get('d:'+steps[a].dg);
       const rest=steps.slice(0,a).concat(steps.slice(b)); const c0=comp(), e0=cur.errs; let best=null;
       const cands=[]; for(let k=0;k<=rest.length;k++){ const sn=snaps[k<a?k:k+(b-a)]; if(!sn) continue; if(sn.L<lv-tol||sn.L>lv+tolUp) continue; if(k%12===0||(rest[k-1]&&rest[k-1].t==='travel')) cands.push(k); }
       for(const k of cands){ const ns=rest.slice(0,k).concat(blk,rest.slice(k)); let m; try{ m=evalFrom(ns,Math.min(a,k)); }catch(e){ continue; } evals++; if(m.errs>cur.errs||m.tg==null) continue; if(!best||m.tg<best.tg) best={k,tg:m.tg,ns}; }
       if(best){ const svS=steps; steps=best.ns; full(); if(cur.tg!=null&&cur.errs<=e0&&comp()<c0-5){ nR++; nAcc++; } else { steps=svS; full(); } } }
     if(opt.progress) opt.progress({runMove:pass,acc:nR,tg:cur.tg?Math.round(cur.tg/60):null,low:runLow()}); }
   // swap: exchange two zone stays close in the order (next or the one after), keep it if level 60 comes sooner — reorders the zone sequence
   if(opt.swap&&cur.tg!=null){ let nS=0; const zAt=k=>{ const p=snaps[k+1]&&snaps[k+1].pos; return p?p.z:null; }; let i0=0;
     for(let rep=0;rep<(opt.swapN||80)&&cur.tg!=null&&Date.now()<deadline-60000;rep++){ const vis=[]; let a=0; for(let k=1;k<=steps.length;k++){ if(k===steps.length||zAt(k)!==zAt(a)){ vis.push({a,b:k}); a=k; } } let got=false;
       for(let i=i0;i<vis.length-1&&!got;i++){ if(Date.now()>deadline-60000) break; if(!snaps[vis[i].a]||snaps[vis[i].a].t>=cur.tg) break;
         for(const d of [1,2]){ const A=vis[i], B=vis[i+d]; if(!B) continue; const mid=steps.slice(A.b,B.a); const blkA=steps.slice(A.a,A.b), blkB=steps.slice(B.a,B.b); if(blkA.some(prot)||blkB.some(prot)) continue;
           const ns=steps.slice(0,A.a).concat(blkB,mid,blkA,steps.slice(B.b)); let m; try{ m=evalFrom(ns,A.a); }catch(e){ continue; } evals++;
           if(m.errs<=cur.errs&&m.tg!=null&&m.tg<cur.tg-5){ const svS=steps, v0=runLow(), e0=cur.errs; steps=ns; full(); if(runLow()>v0||cur.tg==null||cur.errs>e0){ steps=svS; full(); continue; } nS++; nAcc++; got=true; i0=Math.max(0,i-2); break; } } }
       if(!got) break; }
     if(opt.progress) opt.progress({swap:pass,acc:nS,tg:cur.tg?Math.round(cur.tg/60):null}); }
   // merge: a zone visited more than once — move one stay next to another (later stay to the end of the earlier one, or the earlier stay to the start of the later one), keep it if level 60 comes sooner
   if(opt.merge&&cur.tg!=null){ let nM=0; const zAt=k=>{ const p=snaps[k+1]&&snaps[k+1].pos; return p?p.z:null; };
     for(let rep=0;rep<(opt.mergeN||60)&&cur.tg!=null&&Date.now()<deadline-60000;rep++){ let got=false; const vis=[]; let a=0; for(let k=1;k<=steps.length;k++){ if(k===steps.length||zAt(k)!==zAt(a)){ if(zAt(a)!=null) vis.push({a,b:k,z:zAt(a)}); a=k; } }
       const byZ=new Map(); for(const v of vis){ if(!snaps[v.a]||snaps[v.a].t>=cur.tg) continue; (byZ.get(v.z)||byZ.set(v.z,[]).get(v.z)).push(v); }
       const tries=[]; for(const [z,vs] of byZ){ if(vs.length<2) continue; for(let i=0;i<vs.length;i++) for(let j=i+1;j<vs.length;j++){ const A=vs[i],B=vs[j]; const nB=B.b-B.a, nA=A.b-A.a; tries.push({A,B,mv:'BtoA',w:nB}); tries.push({A,B,mv:'AtoB',w:nA}); } }
       tries.sort((x,y)=>x.w-y.w);
       for(const tr of tries){ if(Date.now()>deadline-60000) break; const {A,B}=tr; let ns, k0;
         const blk=(v)=>{ const ids=[]; for(let k=v.a;k<v.b;k++) if(!prot(steps[k])&&!steps[k].auto) ids.push(k); return ids; };
         if(tr.mv==='BtoA'){ const ks=new Set(blk(B)); if(!ks.size) continue; const moved=[...ks].map(k=>steps[k]); ns=[]; steps.forEach((s,k)=>{ if(ks.has(k)) return; ns.push(s); if(k===A.b-1) ns.push(...moved); }); k0=A.b; }
         else { const ks=new Set(blk(A)); if(!ks.size) continue; const moved=[...ks].map(k=>steps[k]); ns=[]; steps.forEach((s,k)=>{ if(k===B.a) ns.push(...moved); if(ks.has(k)) return; ns.push(s); }); k0=Math.min(...ks); }
         let m; try{ m=evalFrom(ns,k0); }catch(e){ continue; } evals++;
         if(m.errs<=cur.errs&&m.tg!=null&&m.tg<cur.tg-5){ const svS=steps, v0=runLow(); steps=ns; full(); if(runLow()>v0||cur.tg==null||cur.errs>m.errs){ steps=svS; full(); continue; } nM++; nAcc++; got=true; break; } }
       if(!got) break; }
     if(opt.progress) opt.progress({merge:pass,acc:nM,tg:cur.tg?Math.round(cur.tg/60):null}); }
   if(!nAcc) break;
   grow(opt.lnsVks||[0.4,0.2,0.1,0.05,0.03,0.015],Math.min(deadline-60000,Date.now()+(opt.pruneGrowMs||1800000))); setRest(); full(); if(opt.progress) opt.progress({prunegrow:pass,tg:cur.tg?Math.round(cur.tg/60):null}); }
 while(opt.lns&&Date.now()<deadline-30000){ it++; const sv=steps.slice(); const sCell=new Set(usedCell); const sRun=new Set(usedRun); const svCur=cur; const before=fin(cur);
   const n=steps.length; const W=Math.min(n-2,(opt.lnsW||80)+Math.floor(rnd()*(opt.lnsW||80))); const a=FZ+Math.floor(rnd()*Math.max(1,n-W-FZ)); const qs=new Set(), cells=new Set();
   for(let k=a;k<a+W;k++){ const s=steps[k]; if(prot(s)) continue; if(s.q&&!CH.includes(s.q)) qs.add(s.q); if(s.pack&&s.loc){ const p=zp2plane(s.loc.z,s.loc.px,s.loc.py); cells.add(Math.floor(p.X/MC)+','+Math.floor(p.Y/MC)); } }
   const needed=new Set(); for(const s of steps){ if(!s.q||qs.has(s.q)) continue; const x=Q(s.q); for(const p of [...(x?.ps||[]),...(x?.pg||[])]) if(qs.has(p)) needed.add(p); } for(const q of needed) qs.delete(q);
   steps=steps.filter((s,k)=>{ if(s.auto) return false; if(s.q&&qs.has(s.q)&&!prot(s)) return false; if(k>=a&&k<a+W&&s.pack) return false; return true; }); for(const c of cells) usedCell.delete(c);
   ban=new Set(); full(); grow(opt.lnsVks||[0.4,0.2,0.1,0.05,0.03,0.015],deadline); if(opt.fly) tryFly(); full();
   const after=fin(cur); if(cur.errs<=svCur.errs&&after<before-30){ lnsLog.push([it,a,W,qs.size,Math.round(before/60),Math.round(after/60)]); if(opt.progress) opt.progress({lns:it,acc:lnsLog.length,min:Math.round(after/60)}); }
   else { steps=sv; usedCell.clear(); sCell.forEach(x=>usedCell.add(x)); usedRun.clear(); sRun.forEach(x=>usedRun.add(x)); full(); } }
 full();
 return {restStart:RO.restStart,built,nPruned:pruned.length,pruned:pruned.slice(-40),lnsIt:it,lnsAcc:lnsLog.length,lnsLog:lnsLog.slice(-20),forced,nFail,nBund,flyAcc,acc,rounds,evals,cur:{t:Math.round(cur.t/60),tg:cur.tg?Math.round(cur.tg/60):null,errs:cur.errs,L:cur.L},n:steps.length,cells:CELLS.length,pool:pool.length,log:log.slice(-15),secs:Math.round((Date.now()-T0)/1000),steps}; };
