// SPDX-License-Identifier: GPL-3.0-or-later
// Route builder on the wowf-sim engine: greedy insertion (quests, quest-hub bundles, packs from the spawn grid,
// dungeons, a forced chain), flights, then large-neighbourhood search. Every candidate is timed by the engine,
// resumed from the snapshot just before the first changed step. Runs inside the planner context (loaded by index.js).
'use strict';
// HC: block walking through dangerous zones, and their flight paths (shared with tools/postpass.js)
var ROUTEBLOCK=function(names){ if(!names||!names.length||!NAV||ROUTEBLOCK.done) return; ROUTEBLOCK.done=1; const opt={block:names}; const ids=Object.entries(META.zones).filter(([z,Z])=>opt.block.includes(Z.n)).map(([z])=>+z);
   for(const z of ids){ const a=zp2plane(z,0,0), b=zp2plane(z,100,100); const x0=Math.min(a.X,b.X),x1=Math.max(a.X,b.X),y0=Math.min(a.Y,b.Y),y1=Math.max(a.Y,b.Y);
     const c0=Math.max(0,Math.floor((x0-NAV.x0)/NAV.cell)), c1=Math.min(NAV.w-1,Math.floor((x1-NAV.x0)/NAV.cell)), r0=Math.max(0,Math.floor((y0-NAV.y0)/NAV.cell)), r1=Math.min(NAV.h-1,Math.floor((y1-NAV.y0)/NAV.cell));
     for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++){ const i=r*NAV.w+c; if(!NAV.g[i]) continue; const q=plane2zone(NAV.x0+(c+.5)*NAV.cell,NAV.y0+(r+.5)*NAV.cell); const qz=q?(q.z!=null?q.z:q):null; if(+qz===z) NAV.g[i]=0; } }
   PATHS.clear(); const bz=new Set(ids); const tn=taxiNodes; taxiNodes=(...a)=>tn(...a).filter(n=>{ const p=taxiPt(n.id); if(!p) return false; const q=plane2zone(p.X,p.Y); const qz=q?(q.z!=null?q.z:q):null; return !bz.has(+qz); }); };
var ROUTEBUILD=function(opt){
 const T0=Date.now(), MS=opt.ms||1800000, TGT=opt.tgt||40, K=opt.K||40, tol=opt.lvTol??1;
 const CH0=opt.char; const ch=Object.assign({},CH0);
 ROUTEBLOCK(opt.block);
 let steps=(opt.seed||[]).map(s=>Object.assign({},s));
 const cont=z=>META.zones[z]?.m; const HOMES=new Set(opt.conts||[0,1]); const BZ=new Set(Object.entries(META.zones).filter(([z,Z])=>(opt.block||[]).includes(Z.n)).map(([z])=>+z)); const okP=p=>p&&!p.dg&&HOMES.has(cont(p.z))&&!BZ.has(+p.z);
 const gray=L=>L<10?5:L<20?6:L<30?7:L<40?8:9; const need=totalXP(TGT,0);
 // ---- evaluation (incremental) ----
 let snaps=null, cur=null;
 const full=()=>{ const r=SIMX.run(steps,ch,{snaps:true,tgt:TGT}); snaps=r.snaps; cur=meas(r); return cur; };
 const meas=r=>({t:r.t,tg:r.tg,errs:r.errs,L:r.L,tot:totalXP(r.L,r.xp)});
 const evalFrom=(st,k)=>{ const from=snaps[Math.min(k,snaps.length-1)]; const r=SIMX.run(st,ch,{from:{k,state:from},tgt:TGT,stopAtTgt:true}); return meas(r); };
 let VK=4; const scoreV=(m,vk)=>m.tg?m.tg:m.t+(need-m.tot)/(vk*XP_TABLE[Math.min(59,m.L)])*3600; const score=m=>scoreV(m,VK);
 // ---- pool ----
 const pool=[]; for(const id of Object.keys(DB.q)){ const q=+id, x=Q(q); if(!x) continue; const e=EXTRA.quests[q]; if(!(e&&e.xp)&&!(QXP[q])) continue; const ql=(e&&e.l)||x.l||1; if(ql>(opt.maxQL||TGT+3)) continue; if((x.r||1)>TGT-1) continue; if(isDungeonQuest(q)) continue; if((opt.ban||[]).includes(q)||(opt.chain||[]).includes(q)) continue;
   const w=whyUnavailable(q,{level:60,turned:new Set(),log:new Map()},route); if(w&&w.hard) continue;
   const sp=starterPts(q).filter(okP), fp=finisherPts(q).filter(okP); if(!sp.length||!fp.length) continue;
   const ob=(objectives(q)||[]).filter(o=>!o.pre); if(ob.some(o=>!o.pts||!o.pts.length||o.pts.every(p=>!okP(p)))) continue;
   pool.push({q,sp,fp,ob:ob.map(o=>o.pts.filter(okP)),r:x.r||1,ps:x.ps||[],pg:x.pg||[]}); }
 // pack cells: centre = mean spawn of the cell
 const MC=+META.mobl.c; const CELLS=[]; { const by=new Map(); for(const [k,l] of spawnIdx().g) for(const m of l){ const kk=Math.floor(m.X/MC)+','+Math.floor(m.Y/MC); const c=by.get(kk)||by.set(kk,{X:0,Y:0,n:0,lv:[]}).get(kk); c.X+=m.X; c.Y+=m.Y; c.n++; c.lv.push(Math.round(m.lv)); }
   for(const [k,c] of by){ if(c.n<(opt.pkMin||8)) continue; const p={X:c.X/c.n,Y:c.Y/c.n}; const z=plane2zone(p.X,p.Y); if(!z) continue; p.z=z.z; if(!okP(p)) continue; CELLS.push({k,p,lv:c.lv,lo:Math.min(...c.lv),hi:Math.max(...c.lv),loc:{z:z.z,px:Math.round(z.px*10)/10,py:Math.round(z.py*10)/10}}); } }
 const usedCell=new Set();
 // distances (boats between continents)
 const BL=[]; for(const l of (NAV.links||[])){ if(!/A/.test(l.f||'')||/^Walk/.test(l.n||'')) continue; const A={X:NAV.x0+((l.ia%NAV.w)+.5)*NAV.cell,Y:NAV.y0+(((l.ia/NAV.w)|0)+.5)*NAV.cell}, B={X:NAV.x0+((l.ib%NAV.w)+.5)*NAV.cell,Y:NAV.y0+(((l.ib/NAV.w)|0)+.5)*NAV.cell}; const za=plane2zone(A.X,A.Y), zb=plane2zone(B.X,B.Y); if(!za||!zb) continue; A.z=za.z; B.z=zb.z; if(cont(A.z)===cont(B.z)) continue; BL.push({A,B,c:(shipSecs(A,B)||510)*7}); }
 const D=(a,b)=>{ if(!a||!b) return 3000; if(cont(a.z)===cont(b.z)) return Math.hypot(a.X-b.X,a.Y-b.Y); let m=1e6; for(const L of BL){ if(cont(L.A.z)===cont(a.z)&&cont(L.B.z)===cont(b.z)) m=Math.min(m,Math.hypot(a.X-L.A.X,a.Y-L.A.Y)+L.c+Math.hypot(L.B.X-b.X,L.B.Y-b.Y)); if(cont(L.B.z)===cont(a.z)&&cont(L.A.z)===cont(b.z)) m=Math.min(m,Math.hypot(a.X-L.B.X,a.Y-L.B.Y)+L.c+Math.hypot(L.A.X-b.X,L.A.Y-b.Y)); } return m; };
 const FZ=opt.freeze||0; const insPos=(pts,lv,lo,p)=>{ let best=null; const n=pts.length; for(let k=Math.max(lo,-1,FZ-1);k<n;k++){ if(k>=0&&pts[k].L<lv) continue; if(k<0&&lv>1) continue; const a=k>=0?pts[k].p:null, b=k+1<n?pts[k+1].p:null; const d=(a?D(a,p):0)+(b?D(p,b):0)-(a&&b?D(a,b):0); if(!best||d<best.d) best={k,d}; } return best; };
 const near=(arr,p)=>{ let b=arr[0],bd=1e18; for(const x of arr){ const d=D(x,p); if(d<bd){bd=d;b=x;} } return b; };
 const build=(c,pts,lo0)=>{ const pc=[]; let lo=(lo0==null?-1:lo0), cost=0; for(const pz of c){ const b=insPos(pts,pz.lv,lo,pz.p); if(!b) return null; pc.push([b.k,pz.steps]); lo=b.k; cost+=b.d; } return {pc,cost}; };
 const apply=pc=>{ const by=new Map(); for(const [k,st] of pc) (by.get(k)||by.set(k,[]).get(k)).push(...st.map(s=>Object.assign({},s,{id:uid(),b20:1}))); const out=[...(by.get(-1)||[])]; steps.forEach((s,k)=>{ out.push(s); const b=by.get(k); if(b) out.push(...b); }); return out; };
 const first=pc=>Math.min(...pc.map(x=>x[0]))+1;
 const runs=opt.runs||[]; const usedRun=new Set();
 const runPieces=(r,inR)=>{ const pieces=[]; for(const q of r.acc){ if(inR.has(q)) continue; const sp=starterPts(q).filter(p=>!p.dg); if(!sp.length) continue; pieces.push({p:sp[0],lv:Q(q).r||1,steps:[{t:'accept',q}]}); } const rp=zp2plane(r.loc.z,r.loc.px,r.loc.py); pieces.push({p:rp,lv:(r.lv||1)-tol,steps:r.steps}); for(const q of r.tin){ const fp=finisherPts(q).filter(p=>!p.dg); if(!fp.length) continue; pieces.push({p:near(fp,rp),lv:1,steps:[{t:'turnin',q}]}); } return pieces; };
 const CH=opt.chain||[]; const forced=[]; let ban=new Set(); let acc=0, rounds=0, flyAcc=0, nFail=0, nBund=0, evals=0; const log=[];
 const ptsNow=()=>{ const n=steps.length; const pts=new Array(n); for(let k=0;k<n;k++){ const sN=snaps[k+1]; pts[k]={p:sN&&sN.pos,L:sN?sN.L:1}; } for(let k=0;k<n;k++) if(!pts[k].p) pts[k].p=k?pts[k-1].p:null; return pts; };
 // flights: strip auto flights, learn flight paths passed within 200 yd, fly legs where it is quicker
 const tryFly=()=>{ const sv=steps; const svCur=cur; steps=steps.filter(x=>!x.auto); full(); const nodes=taxiNodes(); const fps=new Set(snaps[0].fps); const ins=[];
   steps.forEach((s,k)=>{ const a=snaps[k].pos, b=snaps[k+1].pos; if(s.t==='travel'&&s.kind==='fp'&&s.node) fps.add(s.node); if(!a||!b||cont(a)!==cont(b)) return; const d=Math.hypot(b.X-a.X,b.Y-a.Y); if(d<250) return;
     for(const n of nodes){ if(fps.has(n.id)||n.m!==cont(a)) continue; const p=taxiPt(n.id); if(p&&segDist(p,a,b)<200){ ins.push([k,{t:'travel',kind:'fp',node:n.id,text:taxiShort(n.id),auto:1}]); fps.add(n.id); } }
     const dep=nearestNode(a,fps), arr=nearestNode(b,fps); if(!dep||!arr||dep===arr) return; const P=taxiPt(dep), Q2=taxiPt(arr); if(!P||!Q2) return; const run=runSpeed(snaps[k].L,3);
     const walk=d*1.25/run, fr=flightRoute(dep,arr); const fly=Math.hypot(P.X-a.X,P.Y-a.Y)*1.25/run+((fr&&fr.secs)||Math.hypot(Q2.X-P.X,Q2.Y-P.Y)/30)+20+Math.hypot(b.X-Q2.X,b.Y-Q2.Y)*1.25/run; if(fly<walk-30) ins.push([k,{t:'travel',kind:'fly',node:arr,text:taxiShort(arr),auto:1}]); });
   for(let i=ins.length-1;i>=0;i--){ const [k,st]=ins[i]; steps.splice(k,0,{id:uid(),...st}); } full(); if(cur.errs<=svCur.errs&&score(cur)<score(svCur)) flyAcc++; else { steps=sv; full(); } };
 const grow=(vks,deadline)=>{ for(const vk of vks){ VK=vk;
  for(;;){ if(Date.now()>deadline) return; rounds++;
   const pts=ptsNow(); const inR=new Set(steps.filter(s=>s.q).map(s=>s.q)); const tiAt=new Map(); steps.forEach((s,k)=>{ if(s.t==='turnin') tiAt.set(s.q,k); });
   { let fc=null; const ci=CH.findIndex(q=>!inR.has(q));
     if(ci>=0){ const q=CH[ci], x=Q(q); const lvMin=Math.max((x.l||1)-(opt.chainLead||2),x.r||1); const prevK=ci?tiAt.get(CH[ci-1]):-1;
       if(cur.L>=lvMin&&prevK!=null){ const sp=starterPts(q).filter(p=>!p.dg), fp=finisherPts(q).filter(p=>!p.dg); const ref=ci?pts[prevK].p:null; const s0=ref?near(sp,ref):sp[0]; const ob=(objectives(q)||[]).filter(o=>!o.pre&&o.pts&&o.pts.length);
         const pcs=[{p:s0,lv:lvMin,steps:[{t:'accept',q,chain:1}]}]; let cp=s0; for(const o of ob) cp=near(o.pts.filter(p=>!p.dg),cp); if(ob.length) pcs.push({p:cp,lv:lvMin,steps:[{t:'complete',q,chain:1}]}); pcs.push({p:near(fp,cp),lv:lvMin,steps:[{t:'turnin',q,chain:1}]});
         const b=build(pcs,pts,prevK); if(b) fc=[{b,tag:'chain '+q}]; } }
     if(!fc) for(const dg of (opt.forceRuns||[])){ if(usedRun.has(dg)) continue; const vs=runs.filter(r=>r.dg===dg); if(!vs.length) continue; const lvF=(vs[0].lv||1)-tol+(opt.forceSlack??1); if(cur.L<lvF) continue; fc=vs.map(r=>{ const b=build(runPieces(r,inR),pts); return b?{b,tag:'run '+dg,dg}:null; }).filter(Boolean); if(fc.length) break; fc=null; }
     if(fc){ let bf=null; for(const c of fc){ const ns=apply(c.b.pc); const sv=steps; steps=ns; const m=full(); steps=sv; evals++; if(!bf||m.errs<bf.m.errs||(m.errs===bf.m.errs&&score(m)<score(bf.m))) bf={c,m,ns}; }
       if(bf){ steps=bf.ns; full(); if(bf.c.dg) usedRun.add(bf.c.dg); forced.push([bf.c.tag,cur.L,Math.round(cur.t/60),cur.errs]); continue; } } }
   const C=[]; const avail=[];
   for(const c of pool){ if(inR.has(c.q)||ban.has(c.q)) continue; let lo=-1; if(c.ps.length){ const ks=c.ps.map(p=>tiAt.get(p)).filter(x=>x!=null); if(!ks.length) continue; lo=Math.min(...ks); } let bad=false; for(const p of c.pg){ const k=tiAt.get(p); if(k==null){bad=true;break;} lo=Math.max(lo,k); } if(bad) continue;
     let s=c.sp[0],bd=1e18; for(const x of c.sp) for(let i=0;i<pts.length;i+=4){ if(!pts[i].p||pts[i].L<c.r) continue; const d=D(x,pts[i].p); if(d<bd){bd=d;s=x;} }
     let curp=s, tour=0; const op=[]; for(const o of c.ob){ const x=near(o,curp); tour+=D(curp,x); op.push(x); curp=x; } const f=near(c.fp,curp); tour+=D(curp,f);
     const pieces=[{p:s,lv:c.r,steps:[{t:'accept',q:c.q}]}]; if(c.ob.length) pieces.push({p:op[op.length-1],lv:c.r,steps:[{t:'complete',q:c.q}]}); pieces.push({p:f,lv:c.r,steps:[{t:'turnin',q:c.q}]});
     const b=build(pieces,pts,lo); if(!b) continue; const L=Math.max(c.r,(pts[b.pc[b.pc.length-1][0]]||{L:1}).L||1); const xp=SIMX.questXP(c.q,L); if(xp<=0) continue;
     let kills=0; for(const n of SIMX.needsOf(c.q,3)) kills+=n.k==='item'?n.rem/0.35:n.k==='kill'?n.rem:2;
     const secs=(b.cost+tour*0.3)*1.15/runSpeed(L,3)+kills*12+20; C.push({q:c.q,b,xp,secs,v:xp/secs}); avail.push({c,s,op,f,lo,xp,secs:kills*12+tour*0.3*1.15/runSpeed(L,3)}); }
   if(opt.bundles!==false){ const hubs=new Map(); for(const a of avail){ const k=Math.round(a.s.X/120)+','+Math.round(a.s.Y/120)+','+cont(a.s.z); (hubs.get(k)||hubs.set(k,[]).get(k)).push(a); }
     for(const [hk,g] of hubs){ if(g.length<2||ban.has('H'+hk)) continue; g.sort((a,b)=>b.xp/b.secs-a.xp/a.secs); const mem=g.slice(0,opt.bundleMax||6); const lv=Math.max(...mem.map(a=>a.c.r)); const lo=Math.max(...mem.map(a=>a.lo));
       const pcs=[{p:mem[0].s,lv,steps:mem.map(a=>({t:'accept',q:a.c.q}))}]; let cp=mem[0].s; const left=mem.filter(a=>a.c.ob.length).slice(); while(left.length){ let bi=0,bd=1e18; left.forEach((a,i)=>{ const d=D(cp,a.op[a.op.length-1]); if(d<bd){bd=d;bi=i;} }); const a=left.splice(bi,1)[0]; cp=a.op[a.op.length-1]; pcs.push({p:cp,lv,steps:[{t:'complete',q:a.c.q}]}); }
       const tl=mem.slice(); while(tl.length){ let bi=0,bd=1e18; tl.forEach((a,i)=>{ const d=D(cp,a.f); if(d<bd){bd=d;bi=i;} }); const a=tl.splice(bi,1)[0]; const grp=tl.filter(x=>D(x.f,a.f)<60); for(const x of grp) tl.splice(tl.indexOf(x),1); cp=a.f; pcs.push({p:a.f,lv,steps:[a,...grp].map(x=>({t:'turnin',q:x.c.q}))}); }
       const b=build(pcs,pts,lo); if(!b) continue; const xp=mem.reduce((s,a)=>s+a.xp,0), secs=mem.reduce((s,a)=>s+a.secs,0)+b.cost*1.15/7+20*mem.length; C.push({hub:hk,qs:mem.map(a=>a.c.q),b,xp,secs,v:xp/secs*1.05}); } }
   { const B=new Map(), BS=300; pts.forEach((x,k)=>{ if(!x.p) return; const kk=Math.floor(x.p.X/BS)+','+Math.floor(x.p.Y/BS); (B.get(kk)||B.set(kk,[]).get(kk)).push(k); });
     for(const c of CELLS){ if(usedCell.has(c.k)) continue; const bx=Math.floor(c.p.X/BS), by=Math.floor(c.p.Y/BS); let nearL=null; for(let i=-1;i<=1&&nearL==null;i++) for(let j=-1;j<=1;j++){ const l=B.get((bx+i)+','+(by+j)); if(l&&l.length){ nearL=pts[l[l.length-1]].L; break; } } if(nearL==null) continue;
       const okN=L=>c.lv.reduce((a,ml)=>a+(L-ml<gray(L)&&ml<=L+2?1:0),0); if(okN(Math.max(nearL,c.hi-2))<(opt.pkMin||8)) continue;
       const b=build([{p:c.p,lv:Math.max(1,c.lo-2),steps:[{t:'grind',pack:1,loc:c.loc,note:'Clear this area once (AoE pulls)'}]}],pts); if(!b) continue; const L=(pts[b.pc[0][0]]||{L:1}).L; const N=okN(L); if(N<(opt.pkMin||8)) continue;
       const xp=N*mobXP(L,L,false,3); const secs=N*5+b.cost*1.15/runSpeed(L,3); C.push({cell:c.k,b,xp,secs,v:xp/(secs+5)}); } }
   for(const r of runs){ if(usedRun.has(r.grp||r.dg)||ban.has('R'+r.dg+':'+r.acc.length)) continue; const b=build(runPieces(r,inR),pts); if(!b) continue; C.push({dg:r.dg,grp:r.grp,nq:r.acc.length,b,xp:r.xp||5000,secs:(r.mins||20)*60,v:1e9}); }
   C.sort((a,b)=>b.v-a.v); const top=C.slice(0,K); let best=null; const cs=score(cur);
   for(const c of top){ const ns=apply(c.b.pc); let m; try{ m=evalFrom(ns,first(c.b.pc)); }catch(e){ if(c.q) ban.add(c.q); else if(c.cell) usedCell.add(c.cell); else if(c.hub) ban.add('H'+c.hub); continue; } evals++; if(m.errs>cur.errs) continue; const sc=score(m); if(sc<cs-1&&(!best||sc<best.sc)) best={c,sc,ns}; }
   if(!best) break;
   const sv=steps, svCur=cur; steps=best.ns; full(); const c=best.c;
   if(cur.errs>svCur.errs||score(cur)>=cs){ steps=sv; full(); if(c.q) ban.add(c.q); else if(c.cell) usedCell.add(c.cell); else if(c.hub) ban.add('H'+c.hub); else ban.add('R'+c.dg+':'+c.nq); nFail++; continue; }
   acc++; if(c.dg) usedRun.add(c.grp||c.dg); if(c.cell) usedCell.add(c.cell); if(c.hub) nBund++;
   if(opt.fly&&acc%(opt.flyEvery||4)===0) tryFly();
   if(acc%25===0&&opt.progress) opt.progress({acc,rounds,evals,L:cur.L,t:Math.round(cur.t/60),tg:cur.tg?Math.round(cur.tg/60):null,secs:Math.round((Date.now()-T0)/1000)});
   log.push([vk,c.q||c.dg||(c.hub?'hub'+c.qs.length:'pk'),Math.round(cur.t/60),cur.L,cur.tg?Math.round(cur.tg/60):null]); } } };
 full();
 const vks=opt.vks||[4,3,2.5,2,1.6,1.3,1,0.8,0.65,0.5,0.4,0.3,0.22,0.15,0.1,0.07,0.05,0.035,0.025,0.015];
 if(!opt.skipGrow) grow(vks,T0+(opt.growMs||MS));
 if(opt.fly) tryFly(); full(); const built={t:Math.round(cur.t/60),tg:cur.tg?Math.round(cur.tg/60):null,errs:cur.errs,L:cur.L};
 // ---- large-neighbourhood search: rip out a stretch, regrow it, keep it if the target comes sooner ----
 const lnsLog=[]; const fv=opt.finalVk||0.05; const fin=m=>scoreV(m,fv); const prot=s=>s.chain||s.mode==='run'||s.inRun||(s.t==='travel'&&!s.auto);
 const deadline=T0+MS; let it=0; let seed=opt.seedRng||12345; const rnd=()=>{ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; };
 while(opt.lns&&Date.now()<deadline-30000){ it++; const sv=steps.slice(); const sCell=new Set(usedCell); const sRun=new Set(usedRun); const svCur=cur; const before=fin(cur);
   const n=steps.length; const W=Math.min(n-2,(opt.lnsW||80)+Math.floor(rnd()*(opt.lnsW||80))); const a=FZ+Math.floor(rnd()*Math.max(1,n-W-FZ)); const qs=new Set(), cells=new Set();
   for(let k=a;k<a+W;k++){ const s=steps[k]; if(prot(s)) continue; if(s.q&&!CH.includes(s.q)) qs.add(s.q); if(s.pack&&s.loc){ const p=zp2plane(s.loc.z,s.loc.px,s.loc.py); cells.add(Math.floor(p.X/MC)+','+Math.floor(p.Y/MC)); } }
   const needed=new Set(); for(const s of steps){ if(!s.q||qs.has(s.q)) continue; const x=Q(s.q); for(const p of [...(x?.ps||[]),...(x?.pg||[])]) if(qs.has(p)) needed.add(p); } for(const q of needed) qs.delete(q);
   steps=steps.filter((s,k)=>{ if(s.auto) return false; if(s.q&&qs.has(s.q)&&!prot(s)) return false; if(k>=a&&k<a+W&&s.pack) return false; return true; }); for(const c of cells) usedCell.delete(c);
   ban=new Set(); full(); grow(opt.lnsVks||[0.4,0.2,0.1,0.05,0.03,0.015],deadline); if(opt.fly) tryFly(); full();
   const after=fin(cur); if(cur.errs<=svCur.errs&&after<before-30){ lnsLog.push([it,a,W,qs.size,Math.round(before/60),Math.round(after/60)]); if(opt.progress) opt.progress({lns:it,acc:lnsLog.length,min:Math.round(after/60)}); }
   else { steps=sv; usedCell.clear(); sCell.forEach(x=>usedCell.add(x)); usedRun.clear(); sRun.forEach(x=>usedRun.add(x)); full(); } }
 full();
 return {built,lnsIt:it,lnsAcc:lnsLog.length,lnsLog:lnsLog.slice(-20),forced,nFail,nBund,flyAcc,acc,rounds,evals,cur:{t:Math.round(cur.t/60),tg:cur.tg?Math.round(cur.tg/60):null,errs:cur.errs,L:cur.L},n:steps.length,cells:CELLS.length,pool:pool.length,log:log.slice(-15),secs:Math.round((Date.now()-T0)/1000),steps}; };
