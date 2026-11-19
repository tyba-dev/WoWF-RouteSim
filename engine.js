// SPDX-License-Identifier: GPL-3.0-or-later
// wowf-sim engine: plays a route step by step for a group (default trio) and prices every second.
// Runs inside the planner's context (planner.js) and uses its world helpers: Q, entPts, starterPts,
// finisherPts, zp2plane, walkSecs (walking grid, trams, boats), flightRoute/taxiPt, mobXP, killSecs, runSpeed.
// Extra facts (EXTRA): Polestar forever-db drop chances, Forever quest XP and objective counts,
// players' recorded objective spots (CC BY 4.0), CMaNGOS respawn times.
// Model ideas after Polestar Forge's time model (GPL-3.0): hunting grounds with respawns, pooled kill
// credit, Forever's quest XP share by levels over the quest, flights at 30 yd/s + overhead.
'use strict';
var SIMX=(function(){
 let TR=null; let CUR={};
 const DEF={ talk:6, interact:8, pullSize:6, pullBase:4, perMob:2, pullRest:6, eliteMul:3.5, levelUp:20, flyOver:20, flySpeed:30, respawn:300, respawnMax:600,
   aggro:20, mobUp:2, groundR:250, groundMax:900, groundFill:0.6, dropDefault:0.35, objDefault:8, eventSec:120, unresolvedSec:120, wayKills:1, food:0.03, mountLevel:40, hearthCast:10, hearthCd:3600,
   detour:1.0, party:3, dropKeep:0.5, splitObjects:1 };
 let PR=Object.assign({},DEF);
 const cont=p=>p&&META.zones[p.z]?.m;
 const hyp=(a,b)=>Math.hypot(a.X-b.X,a.Y-b.Y);
 const rnd=xp=>xp<=100?5*Math.floor((xp+2)/5):xp<=500?10*Math.floor((xp+5)/10):xp<=1000?25*Math.floor((xp+12)/25):50*Math.floor((xp+25)/50);
 const gray=L=>L<10?5:L<20?6:L<30?7:L<40?8:9;
 const fightable=(L,ml)=>L-ml<gray(L)&&ml<=L+PR.mobUp;
 const uiZone=new Map(); for(const [z,Z] of Object.entries(META.zones)) if(Z.ui) uiZone.set(+Z.ui,+z);
 const nLv=id=>{ const n=DB.n[id]; return n&&n.l?(n.l[0]+(n.l[1]??n.l[0]))/2:null; };
 const elite=id=>!!(DB.n[id]&&DB.n[id].rk);
 const resp=id=>Math.min(PR.respawnMax,+(EXTRA.resp[id])||PR.respawn);
 // ---------- quest XP (Forever: full up to 5 levels over the quest, 80% at 6, 60% at 7, half from 8) ----------
 function questXP(q,L){ if(L>=60) return 0; const e=EXTRA.quests[q]; const base=(e&&e.xp)||(QXP&&QXP[q]&&QXP[q][0])||0; if(!base) return 0; const ql=(e&&e.l)||(Q(q)&&Q(q).l)||L; const over=L-ql; const m=over<=5?1:over===6?0.8:over===7?0.6:0.5; return rnd(base*m); }
 // ---------- objectives: what a quest needs, per group ----------
 function needsOf(q,party){ const out=[]; const fo=EXTRA.objs[q]; const x=Q(q)||{}; const o=x.o||{};
   if(fo&&fo.length){ for(const r of fo){ if(r.k==='kill') out.push({k:'kill',ids:[r.id],c:r.c,rem:r.c}); else if(r.k==='item'){ const per=r.c>1?party:1; out.push({k:'item',item:r.id,c:r.c,rem:r.c*per}); } else if(r.k==='object') out.push({k:'object',ids:[r.id],c:r.c,rem:r.c}); else if(r.k==='talk') out.push({k:'talk',ids:[r.id],c:1,rem:1}); else if(r.k==='event') out.push({k:'event',c:1,rem:1,line:r.n}); }
     // kill objectives of a group of mobs (o.k) are not in Forever's list under one id: take them from the quest data
     for(const [ids,base] of o.k||[]){ const all=base?[base,...ids]:ids; if(!out.some(n=>n.k==='kill'&&all.includes(n.ids[0]))) out.push({k:'kill',ids:all,c:PR.objDefault,rem:PR.objDefault}); }
     return out; }
   for(const [id] of o.c||[]) out.push({k:'kill',ids:[id],c:PR.objDefault,rem:PR.objDefault});
   for(const [id] of o.i||[]) out.push({k:'item',item:id,c:PR.objDefault,rem:PR.objDefault*party});
   for(const [id] of o.o||[]) out.push({k:'object',ids:[id],c:1,rem:1});
   for(const [ids,base] of o.k||[]) out.push({k:'kill',ids:base?[base,...ids]:ids,c:PR.objDefault,rem:PR.objDefault});
   return out; }
 function dropSources(item){ const d=EXTRA.drops[item]; const out=[]; if(d){ for(const [id,c] of Object.entries(d.n)) out.push({t:'n',id:+id,p:c!=null?c/100:null}); for(const [id,c] of Object.entries(d.o)) out.push({t:'o',id:+id,p:c!=null?c/100:1}); }
   if(!out.length){ const it=DB.i[item]; for(const id of (it&&it.d)||[]) out.push({t:'n',id,p:null}); for(const id of (it&&it.od)||[]) out.push({t:'o',id,p:1}); } return out; }
 // ---------- grounds: where an objective's work is done ----------
 const GC=new Map(); let OC=new WeakMap();
 function groundFor(q,line,type,ids,pos,need){ // returns {pts:[{X,Y,z,id,lv,p}], center}
   const key=q+'|'+line+'|'+type+ids.map(x=>x.id).join(',')+'|'+(pos?Math.round(pos.X/200)+','+Math.round(pos.Y/200):'')+'|'+Math.ceil(Math.log2(1+(need||1))); if(GC.has(key)) return GC.get(key);
   const all=[]; for(const s of ids) for(const p of entPts(s.t,s.id)){ if(p.dg) continue; all.push({X:p.X,Y:p.Y,z:p.z,id:s.id,t:s.t,p:s.p,lv:s.t==='n'?nLv(s.id):null}); }
   let g=null; if(all.length){ const sp=EXTRA.spots[q]&&EXTRA.spots[q][line]; let center=null;
     if(sp&&sp.at&&sp.at.length){ let best=null,bd=1e18; for(const a of sp.at){ const z=uiZone.get(a.ui); if(z==null) continue; const c=zp2plane(z,a.x,a.y); if(!c) continue; const d=pos&&cont(c)===cont(pos)?hyp(c,pos):0; if(d<bd){bd=d;best={c,r:a.r};} } if(best){ const R=Math.max(100,best.r*1.5); const inR=all.filter(p=>cont(p)===cont(best.c)&&hyp(p,best.c)<=R); if(inR.length) g={pts:inR,center:best.c,rec:1}; } }
     if(!g){ const pool=pos?all.filter(p=>cont(p)===cont(pos)):all; const src=pool.length?pool:all; let best=null,bs=1e18; const lim=src.length>400?Math.ceil(src.length/400):1;
       for(let i=0;i<src.length;i+=lim){ const c=src[i]; let nb=0; for(const p of src) if(hyp(p,c)<=PR.groundR) nb++; const d=pos&&cont(c)===cont(pos)?hyp(pos,c):5000; const sc=d+4000/(1+nb); if(sc<bs){bs=sc;best=c;} }
       g={pts:src.filter(p=>hyp(p,best)<=PR.groundR),center:best}; }
     // too few spawns for the work: widen the ground (walk further rather than wait on respawns), up to groundMax
     if(g&&need){ let R=PR.groundR; const src=all.filter(p=>cont(p)===cont(g.center)); while(g.pts.length<need*PR.groundFill&&R<PR.groundMax){ R*=1.5; g={pts:src.filter(p=>hyp(p,g.center)<=R),center:g.center,rec:g.rec}; } } }
   GC.set(key,g); if(GC.size>50000) GC.clear(); return g; }
 // ---------- the state ----------
 function newState(ch){ return {t:0,L:+ch.level||1,xp:+ch.xp||0,party:Math.max(1,+(ch.party||PR.party)),pos:null,log:new Map(),done:new Set(ch.doneQs||[]),fps:new Set([...(ch.fps||[]),...raceFps(ch.race)]),hsReady:0,bind:null,errs:0,
   c:{walkSec:0,walkYd:0,flySec:0,rideSec:0,talks:0,interacts:0,kills:0,pulls:0,killSec:0,pullSec:0,restSec:0,waitSec:0,wayKills:0,waySec:0,levelUps:0,fixedSec:0,runSec:0,xpQuest:0,xpKill:0,xpWay:0,xpRun:0}}; }
 function clone(s){ const log=new Map(); for(const [q,ns] of s.log) log.set(q,ns.map(n=>Object.assign({},n))); return {t:s.t,L:s.L,xp:s.xp,party:s.party,pos:s.pos,log,done:new Set(s.done),fps:new Set(s.fps),hsReady:s.hsReady,bind:s.bind,errs:s.errs,c:Object.assign({},s.c)}; }
 function gain(s,x,kind){ if(x<=0||s.L>=60) return; s.c[kind]+=x; s.xp+=x; while(s.L<60&&s.xp>=XP_TABLE[s.L]){ s.xp-=XP_TABLE[s.L]; s.L++; s.c.levelUps++; s.t+=PR.levelUp; } if(s.L>=60){ s.L=60; s.xp=0; } }
 const runSp=s=>runSpeed(s.L,s.party);
 // ---------- moving ----------
 function wayKill(s,a,b){ if(!PR.wayKills||s.L>=PR.mountLevel||cont(a)!==cont(b)) return; const d=hyp(a,b); if(d<30||d>6000) return; { const tt=tramSecs(a,b,7); if(tt!=null&&tt<d*1.25/7) return; }
   const ms=spawnsIn(Math.min(a.X,b.X)-45,Math.max(a.X,b.X)+45,Math.min(a.Y,b.Y)-45,Math.max(a.Y,b.Y)+45); const dx=b.X-a.X, dy=b.Y-a.Y, L2=dx*dx+dy*dy; let n=0,x=0,sec=0;
   for(const m of ms){ const ml=Math.round(m.lv); if(!fightable(s.L,ml)) continue; let t=((m.X-a.X)*dx+(m.Y-a.Y)*dy)/L2; t=Math.max(0,Math.min(1,t)); if(Math.hypot(a.X+t*dx-m.X,a.Y+t*dy-m.Y)>Math.max(5,Math.min(45,PR.aggro+(ml-s.L)))) continue; const e=elite(m.id); n++; x+=mobXP(s.L,ml,e,s.party)*(1+PR.food); sec+=PR.perMob*(e?PR.eliteMul:1); }
   if(n){ s.t+=sec; s.c.wayKills+=n; s.c.waySec+=sec; gain(s,Math.round(x),'xpWay'); } }
 function move(s,to){ if(!to) return; if(!s.pos){ s.pos=to; return; } const a=s.pos; const d=hyp(a,to); if(d<5&&cont(a)===cont(to)){ s.pos=to; return; }
   const run=runSp(s); let sec; const same=cont(a)===cont(to); try{ sec=walkSecs(a,to,run,same?d:5000); }catch(e){ sec=null; } if(sec==null||!isFinite(sec)) sec=(same?d:5000)*1.25/run; sec*=PR.detour;
   s.t+=sec; s.c.walkSec+=sec; s.c.walkYd+=sec*run; wayKill(s,a,to); s.pos=to; }
 const nearest=(pts,p)=>{ let b=null,bd=1e18; for(const x of pts){ if(x.dg) continue; const d=p?(cont(x)===cont(p)?hyp(x,p):1e7+hyp(x,p)):0; if(d<bd){bd=d;b=x;} } return b; };
 // ---------- killing at a ground: pulls of up to pullSize targets, walking a nearest-neighbour tour; respawns after a full sweep ----------
 function work(s,g,kills,onKill){ if(!g||!g.pts.length||kills<=0) return 0; const pts=g.pts; const start=s.pos&&cont(s.pos)===cont(g.center)?s.pos:g.center; move(s,nearest(pts,start)||g.center);
   let om=OC.get(g); if(!om){ om=new Map(); OC.set(g,om); } const okey=Math.round(s.pos.X/50)+','+Math.round(s.pos.Y/50); let order=om.get(okey);
   if(!order){ const left=pts.slice(); order=[]; let cur=s.pos; while(left.length){ let bi=0,bd=1e18; for(let i=0;i<left.length;i++){ const d=hyp(left[i],cur); if(d<bd){bd=d;bi=i;} } cur=left.splice(bi,1)[0]; order.push(cur); } om.set(okey,order); }
   const m=order.length, run=runSp(s); const w0=s.c.waitSec, t0=s.t; const killedAt=new Array(m).fill(-1e9); let done=0, i=0, inPull=0;
   while(done<kills){ const k=i%m; const p=order[k]; const w=hyp(s.pos,p)/run; s.t+=w; s.c.walkSec+=w; s.pos=p; const ready=killedAt[k]+resp(p.id); if(ready>s.t){ const wt=ready-s.t; s.t+=wt; s.c.waitSec+=wt; }
     const ml=p.lv!=null?Math.round(p.lv):s.L; const e=p.t==='n'&&elite(p.id); const ks=p.t==='o'?PR.interact/(PR.splitObjects?s.party:1):PR.perMob*(e?PR.eliteMul:1); s.t+=ks; if(p.t==='o') s.c.interacts++; else { s.c.kills++; s.c.killSec+=ks; }
     if(p.t==='n'){ inPull++; if(inPull>=PR.pullSize){ s.t+=PR.pullBase+PR.pullRest; s.c.pulls++; s.c.pullSec+=PR.pullBase; s.c.restSec+=PR.pullRest; inPull=0; } if(p.lv!=null&&fightable(s.L,ml)) gain(s,Math.round(mobXP(s.L,ml,e,s.party)*(1+PR.food)),'xpKill'); }
     killedAt[k]=s.t; done+=onKill(p); i++; if(i>m*40) break; }
   if(inPull){ s.t+=PR.pullBase+PR.pullRest; s.c.pulls++; s.c.pullSec+=PR.pullBase; s.c.restSec+=PR.pullRest; }
   if(TR) TR.push({q:CUR.q,k:CUR.k,item:CUR.item,pr:CUR.pr,kills,m,done,wait:Math.round(s.c.waitSec-w0),sec:Math.round(s.t-t0)});
   return done; }
 function doNeed(s,q,line,n){ if(n.rem<=0) return; CUR={q,k:n.k,item:n.item,pr:null};
   if(n.k==='kill'){ const g=groundFor(q,line,'n',n.ids.map(id=>({t:'n',id})),s.pos,n.rem); if(!g){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; n.rem=0; return; }
     work(s,g,n.rem,p=>{ pool(s,q,p); return 1; }); n.rem=0; return; }
   if(n.k==='item'){ let src=dropSources(n.item); { const kn=src.filter(x=>x.p!=null); if(kn.length){ const mx=Math.max(...kn.map(x=>x.p)); src=kn.filter(x=>x.p>=mx*PR.dropKeep); } } /* hunt the mobs that drop it best */ if(!src.length){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; n.rem=0; return; } let pr0=0,np0=0; for(const x of src){ pr0+=x.p!=null?x.p:PR.dropDefault; np0++; } const g=groundFor(q,line,'i',src,s.pos,Math.ceil(n.rem/Math.max(0.01,np0?pr0/np0:PR.dropDefault))); if(!g){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; n.rem=0; return; }
     // expected kills: items needed over the ground's mean drop chance
     let pp=0,np=0; for(const p of g.pts){ pp+=p.p!=null?p.p:PR.dropDefault; np++; } const pr=Math.max(0.01,np?pp/np:PR.dropDefault); let acc=0; CUR.pr=pr; CUR.rem=n.rem;
     work(s,g,Math.ceil(n.rem/pr),p=>{ pool(s,q,p); acc+=pr; return 1; }); n.rem=0; return; }
   if(n.k==='object'){ const g=groundFor(q,line,'o',n.ids.map(id=>({t:'o',id,p:1})),s.pos,n.rem); if(!g){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; n.rem=0; return; } work(s,g,n.rem,()=>1); n.rem=0; return; }
   if(n.k==='talk'){ const pts=[]; for(const id of n.ids) pts.push(...entPts('n',id)); const p=nearest(pts,s.pos); if(p) move(s,p); s.t+=PR.talk; s.c.talks++; n.rem=0; return; }
   s.t+=PR.eventSec; s.c.fixedSec+=PR.eventSec; n.rem=0; }
 // pooled credit: a kill also counts for other open quests' kill objectives on that mob, and their drops from it
 function pool(s,q0,p){ if(p.t!=='n') return; for(const [q,ns] of s.log){ if(q===q0) continue; for(const n of ns){ if(n.rem<=0) continue; if(n.k==='kill'&&n.ids.includes(p.id)) n.rem-=1; else if(n.k==='item'){ const d=EXTRA.drops[n.item]; const c=d&&d.n[p.id]; if(c!=null) n.rem-=c/100; } } } }
 // ---------- steps ----------
 function stepPt(s,st){ if(st.loc) return zp2plane(st.loc.z,st.loc.px,st.loc.py); return null; }
 function play(s,st,R){ const t0=s.t; const L0=s.L; let err=null;
   if(+st.tsec>=0&&st.tsec!==''&&st.tsec!=null){ const p=stepPt(s,st); if(p) s.pos=p; s.t+=+st.tsec; s.c.fixedSec+=+st.tsec; return; }
   if(st.inRun){ if(st.q&&s.log.has(st.q)) for(const n of s.log.get(st.q)) n.rem=0; return; }
   switch(st.t){
    case 'accept':{ const q=st.q, x=Q(q); if(!x){ err='unknown'; break; } if(s.log.has(q)||s.done.has(q)) break;
      if((x.ps||[]).length&&!(x.ps||[]).some(p=>s.done.has(p))) err='prereq'; if((x.pg||[]).some(p=>!s.done.has(p))) err='prereq'; if(s.L<(x.r||1)) err='level';
      const p=nearest(starterPts(q),s.pos); if(p) move(s,p); s.t+=PR.talk; s.c.talks++; s.log.set(q,needsOf(q,s.party)); break; }
    case 'complete':{ const q=st.q; if(!s.log.has(q)&&!s.done.has(q)){ s.log.set(q,needsOf(q,s.party)); R.soft++; } const ns=s.log.get(q); if(!ns) break; ns.forEach((n,i)=>{ if(st.obj&&n.line!=null&&n.line!==st.obj) return; doNeed(s,q,i+1,n); }); break; }
    case 'turnin':{ const q=st.q; if(s.done.has(q)) break; if(!s.log.has(q)){ s.log.set(q,needsOf(q,s.party)); R.soft++; } const ns=s.log.get(q); for(const [i,n] of ns.entries()) if(n.rem>0) doNeed(s,q,i+1,n); const p=nearest(finisherPts(q),s.pos); if(p) move(s,p); s.t+=PR.talk; s.c.talks++;
      s.log.delete(q); s.done.add(q); gain(s,st.xpo!=null&&R.useXpo?+st.xpo:questXP(q,s.L),'xpQuest'); break; }
    case 'grind':{ if(st.mode==='run'){ const p=stepPt(s,st); if(p) move(s,p); const sec=(+st.mins||0)*60; s.t+=sec; s.c.runSec+=sec; const x=st.xpo!=null?+st.xpo:Math.round(sec/killSecs(s.L,s.L,s.party)*mobXP(s.L,s.L,false,s.party)*DG_RUN_XP); gain(s,x,'xpRun'); break; }
      if(st.pack&&st.loc){ const c=stepPt(s,st); const C=+META.mobl.c; const cx=Math.floor(c.X/C), cy=Math.floor(c.Y/C); const ms=spawnsIn(cx*C,(cx+1)*C,cy*C,(cy+1)*C).filter(m=>fightable(s.L,Math.round(m.lv))).map(m=>({X:m.X,Y:m.Y,z:c.z,id:m.id,t:'n',lv:m.lv})); if(ms.length) work(s,{pts:ms,center:c},ms.length,()=>1); break; }
      if(+st.amount>0&&+st.xph>0){ const p=stepPt(s,st); if(p) move(s,p); const sec=+st.amount/(+st.xph)*3600; s.t+=sec; s.c.fixedSec+=sec; gain(s,+st.amount,'xpKill'); } break; }
    case 'travel':{ const k=st.kind;
      if(k==='fly'){ const dest=st.node||resolveNode(st); if(!dest||!META.taxi.nodes[dest]){ err='no node'; break; } const dn=META.taxi.nodes[dest]; const dep=nearestNode(s.pos,s.fps); if(!dep||!s.fps.has(dest)&&!R.allFps){ err='fp unknown'; }
        if(dep&&dep!==dest&&META.taxi.nodes[dep].m===dn.m){ move(s,taxiPt(dep)); const fr=flightRoute(dep,dest); const sec=(fr&&fr.secs!=null?fr.secs:hyp(taxiPt(dep),taxiPt(dest))/PR.flySpeed)+PR.flyOver; s.t+=sec; s.c.flySec+=sec; s.pos=taxiPt(dest); } break; }
      if(k==='fp'){ const id=st.node||resolveNode(st); const p=id&&taxiPt(id); if(p){ move(s,p); s.fps.add(id); s.t+=PR.talk; s.c.talks++; } break; }
      if(k==='hs'||k==='home'){ if(k==='home'){ s.bind=s.pos; s.t+=PR.talk; break; } if(s.bind&&s.t>=s.hsReady){ s.t+=PR.hearthCast; s.c.fixedSec+=PR.hearthCast; s.pos=s.bind; s.hsReady=s.t+PR.hearthCd; } else err='hearth not ready'; break; }
      const p=stepPt(s,st); if(p) move(s,p); break; }
    default:{ const p=stepPt(s,st); if(p) move(s,p); }
   }
   if(err){ s.errs++; R.err&&R.err.push([R.k,st.t,st.q||st.kind,err]); } }
 // ---------- public: play a whole route or resume from a snapshot ----------
 function setParams(p){ PR=Object.assign({},DEF,p||{}); GC.clear(); }
 function run(steps,ch,opt={}){ const snaps=opt.snaps?[]:null; let s=opt.from?clone(opt.from.state):newState(ch); const k0=opt.from?opt.from.k:0; const R={soft:0,err:opt.err?[]:null,useXpo:!!opt.useXpo,allFps:!!opt.allFps,k:0}; const tg=opt.tgt||60; let tAt=null; const lvT={};
   for(let k=k0;k<steps.length;k++){ R.k=k; if(snaps) snaps[k]=clone(s); const L0=s.L; play(s,steps[k],R); for(let l=L0+1;l<=s.L;l++) if(lvT[l]==null) lvT[l]=s.t; if(tAt==null&&s.L>=tg){ tAt=s.t; if(opt.stopAtTgt) break; } }
   if(snaps) snaps[steps.length]=clone(s);
   return {t:s.t,tg:tAt,L:s.L,xp:s.xp,errs:s.errs,soft:R.soft,err:R.err,lvT,c:s.c,state:s,snaps}; }
 return {trace:(on)=>{ TR=on?[]:null; return TR; },get tr(){ return TR; },DEF,setParams,run,questXP,needsOf,newState,clone,get params(){ return PR; }};
})();
