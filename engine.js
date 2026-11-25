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
 const mxp=(a,b,c,d)=>Math.round(mobXP(a,b,c,d)*(PR.mobXp??1)); /* Forever's kill XP relative to the classic formula */
 const DEF={ layers:1, layerHop:5, reach:0, aoeLevel:0, lowPerMob:6, lowPullSize:2, lowPullBase:4, lowPullRest:8, trainSec:60, mobXp:1, dgLvl:0, dgMobXp:0.4, talk:6, interact:8, pullSize:6, pullBase:4, perMob:2, pullRest:6, eliteMul:3.5, levelUp:20, flyOver:20, flySpeed:30, respawn:300, respawnMax:600,
   aggro:20, mobUp:2, groundR:250, groundMax:900, groundFill:0.6, dropDefault:0.35, objDefault:8, eventSec:120, unresolvedSec:120, wayKills:1, food:0.03, mountLevel:40, hearthCast:10, hearthCd:3600,
   detour:1.0, alongCredit:1, logCap:0, party:3, dropKeep:0.5, bagSources:20, dropFallback:1, lootShare:0, noRespawn:0, questAbove:4, eliteAbove:2, splitObjects:1,
   autoFly:0, flyFirstOnly:1, autoHs:0, hsMinSec:180, hsGain:120, autoBind:0, autoBindYd:200, flyMinSec:90, autoFp:0, autoFpYd:150, flyNear:3 };
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
   if(fo&&fo.length){ for(const r of fo){ if(r.k==='kill') out.push({k:'kill',ids:[r.id],c:r.c,rem:r.c}); else if(r.k==='item'){ /* lootShare 1: a quest item that drops can be looted by every member who has the quest, so the group needs the count once */ const per=(r.c>1&&!PR.lootShare)?party:1; out.push({k:'item',item:r.id,c:r.c,rem:r.c*per}); } else if(r.k==='object') out.push({k:'object',ids:[r.id],c:r.c,rem:r.c}); else if(r.k==='talk') out.push({k:'talk',ids:[r.id],c:1,rem:1}); else if(r.k==='event') out.push({k:'event',c:1,rem:1,line:r.n}); }
     // kill objectives of a group of mobs (o.k) are not in Forever's list under one id: take them from the quest data
     for(const [ids,base] of o.k||[]){ const all=base?[base,...ids]:ids; if(!out.some(n=>n.k==='kill'&&all.includes(n.ids[0]))) out.push({k:'kill',ids:all,c:PR.objDefault,rem:PR.objDefault}); }
     return out; }
   for(const [id] of o.c||[]) out.push({k:'kill',ids:[id],c:PR.objDefault,rem:PR.objDefault});
   for(const [id] of o.i||[]) out.push({k:'item',item:id,c:PR.objDefault,rem:PR.objDefault*(PR.lootShare?1:party)});
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
   let g=null; if(all.length){ const N=Math.max(1,need||1); const run=7;
     // candidate centres: players' recorded spot(s), plus the densest spawns
     const C=[]; const sp=EXTRA.spots[q]&&EXTRA.spots[q][line];
     if(sp&&sp.at) for(const a of sp.at){ const z=uiZone.get(a.ui); if(z==null) continue; const c=zp2plane(z,a.x,a.y); if(c) C.push({c,rec:1}); }
     const pool=pos?all.filter(p=>cont(p)===cont(pos)):all; const src=pool.length?pool:all; const lim=src.length>300?Math.ceil(src.length/300):1;
     const dens=[]; for(let i=0;i<src.length;i+=lim){ const c=src[i]; let nb=0; for(const p of src) if(hyp(p,c)<=PR.groundR) nb++; dens.push([nb,c]); } dens.sort((a,b)=>b[0]-a[0]); for(const [nb,c] of dens.slice(0,6)) C.push({c}); if(pos){ let nn=null,nd=1e18; for(const p of src){ const d=hyp(p,pos); if(d<nd){nd=d;nn=p;} } if(nn) C.push({c:nn}); }
     // each centre: widen until there are enough spawns (or groundMax); price walk there + the sweep + respawn waits; keep the cheapest
     let best=null;
     for(const cc of C){ const inC=all.filter(p=>cont(p)===cont(cc.c)); let R=PR.groundR, pts=inC.filter(p=>hyp(p,cc.c)<=R); while(pts.length<N*PR.groundFill&&R<PR.groundMax){ R*=1.5; pts=inC.filter(p=>hyp(p,cc.c)<=R); } if(!pts.length) continue;
       const m=pts.length; const gap=Math.min(R,R*1.77/Math.sqrt(m)); const sweep=Math.min(N,m)*gap/run; const L2=Math.max(1,PR.layers||1); const wait=N>m*L2?(N-m*L2)/m*Math.min(PR.respawnMax,PR.respawn):0; const go=pos?(cont(pos)===cont(cc.c)?hyp(pos,cc.c):6000)/run:0;
       const cost=go+sweep+wait-(cc.rec?30:0); if(!best||cost<best.cost) best={cost,g:{pts,center:cc.c,rec:cc.rec,R}}; }
     g=best?best.g:null; }
   GC.set(key,g); if(GC.size>50000) GC.clear(); return g; }
 // ---------- the state ----------
 function newState(ch){ return {t:0,L:+ch.level||1,xp:+ch.xp||0,party:Math.max(1,+(ch.party||PR.party)),pos:null,log:new Map(),done:new Set(ch.doneQs||[]),fps:new Set([...(ch.fps||[]),...raceFps(ch.race)]),hsReady:0,bind:null,errs:0,
   c:{walkSec:0,walkYd:0,flySec:0,rideSec:0,talks:0,interacts:0,kills:0,pulls:0,killSec:0,pullSec:0,restSec:0,waitSec:0,wayKills:0,waySec:0,levelUps:0,fixedSec:0,runSec:0,xpQuest:0,xpKill:0,xpWay:0,xpRun:0,xpRest:0,tents:0,tentSec:0},rp:0,tentAt:null}; }
 function clone(s){ const log=new Map(); for(const [q,ns] of s.log) log.set(q,ns.map(n=>Object.assign({},n))); return {t:s.t,L:s.L,xp:s.xp,party:s.party,pos:s.pos,log,done:new Set(s.done),fps:new Set(s.fps),hsReady:s.hsReady,bind:s.bind,errs:s.errs,c:Object.assign({},s.c),rp:s.rp,tentAt:s.tentAt,afterRun:s.afterRun,ranDg:s.ranDg}; }
 function gain(s,x,kind){ if(x<=0||s.L>=60) return; if(s.rp>0&&(kind==='xpKill'||kind==='xpWay')){ const b=Math.min(s.rp,x); s.rp-=b; s.c.xpRest+=b; x+=b; } s.c[kind]+=x; s.xp+=x; while(s.L<60&&s.xp>=XP_TABLE[s.L]){ s.xp-=XP_TABLE[s.L]; s.L++; s.c.levelUps++; s.t+=PR.levelUp; } if(s.L>=60){ s.L=60; s.xp=0; } }
 const runSp=s=>runSpeed(s.L,s.party);
 // ---------- moving ----------
 function wayKill(s,a,b){ if(!PR.wayKills||s.L>=PR.mountLevel||cont(a)!==cont(b)) return; const d=hyp(a,b); if(d<30||d>6000) return; { const tt=tramSecs(a,b,7); if(tt!=null&&tt<d*1.25/7) return; }
   const ms=spawnsIn(Math.min(a.X,b.X)-45,Math.max(a.X,b.X)+45,Math.min(a.Y,b.Y)-45,Math.max(a.Y,b.Y)+45); const dx=b.X-a.X, dy=b.Y-a.Y, L2=dx*dx+dy*dy; let n=0,x=0,sec=0;
   for(const m of ms){ const ml=Math.round(m.lv); if(!fightable(s.L,ml)) continue; let t=((m.X-a.X)*dx+(m.Y-a.Y)*dy)/L2; t=Math.max(0,Math.min(1,t)); if(Math.hypot(a.X+t*dx-m.X,a.Y+t*dy-m.Y)>Math.max(5,Math.min(45,PR.aggro+(ml-s.L)))) continue; const e=elite(m.id); n++; x+=mxp(s.L,ml,e,s.party)*(1+PR.food); sec+=PR.perMob*(e?PR.eliteMul:1); if(PR.alongCredit) pool(s,null,{t:'n',id:m.id}); }
   if(n){ s.t+=sec; s.c.wayKills+=n; s.c.waySec+=sec; gain(s,Math.round(x),'xpWay'); } }
 // ---------- flights the group takes on its own (autoFly) and flight masters it talks to in passing (autoFp) ----------
 let TN=null, TNf=null, TNfac=null, FL=null, CK=0, CM=0; const FT=new Map();
 const tnodes=()=>{ const fac=typeof taxiFac==='function'?taxiFac():''; if(!TN||TNf!==taxiNodes||TNfac!==fac){ TNf=taxiNodes; TNfac=fac; TN=taxiNodes().map(n=>({id:n.id,m:n.m,p:taxiPt(n.id),zmin:n.zmin||0})).filter(n=>n.p); FT.clear(); } return TN; };
 const flyT=(a,b)=>{ const k=a+'>'+b; let v=FT.get(k); if(v==null){ const fr=flightRoute(a,b); v=(fr&&fr.secs!=null?fr.secs:hyp(taxiPt(a),taxiPt(b))/PR.flySpeed)+PR.flyOver; FT.set(k,v); } return v; };
 const WM=new Map(); const wsec=(a,b,run)=>{ const k=Math.round(a.X/20)+','+Math.round(a.Y/20)+','+a.z+'|'+Math.round(b.X/20)+','+Math.round(b.Y/20)+','+b.z+'|'+run.toFixed(2)+'|'+(typeof ROUTETIERKEY!=='undefined'?ROUTETIERKEY:''); let v=WM.get(k); if(v==null){ v=wsec0(a,b,run); if(WM.size>400000) WM.clear(); WM.set(k,v); } return v; };
 const wsec0=(a,b,run)=>{ const same=cont(a)===cont(b); const d=hyp(a,b); if(same&&d<5) return 0; let sec; try{ sec=walkSecs(a,b,run,same?d:5000); }catch(e){ sec=null; } if(sec==null||!isFinite(sec)) sec=(same?d:5000)*1.25/run; return sec*PR.detour; };
 function bestFlight(s,a,to,run,direct){ const K=tnodes().filter(n=>s.fps.has(n.id)&&n.zmin<=s.L); const near=(m,p,n)=>K.filter(x=>x.m===m).sort((x,y)=>hyp(x.p,p)-hyp(y.p,p)).slice(0,n);
   let best=null; const ca=cont(a), cb=cont(to);
   if(ca===cb){ for(const dp of near(ca,a,PR.flyNear)) for(const ds of near(cb,to,PR.flyNear)){ if(dp.id===ds.id) continue; const f0=flyT(dp.id,ds.id); if(f0+(hyp(a,dp.p)+hyp(ds.p,to))/run>=direct) continue; const w1=wsec(a,dp.p,run), w2=wsec(ds.p,to,run); const c=w1+f0+w2; if(c<direct&&(!best||c<best.c)) best={c,legs:[[dp,ds]],w:w1+w2}; } return best; }
   // another continent: optionally fly to a node on this side, walk (boats) across, optionally fly on the far side
   const d0=near(ca,a,1)[0], d1=near(cb,to,1)[0]; const xs=[null,...(d0?K.filter(x=>x.m===ca&&x.id!==d0.id):[])], ys=[null,...(d1?K.filter(x=>x.m===cb&&x.id!==d1.id):[])];
   const pre=x=>x?wsec(a,d0.p,run)+flyT(d0.id,x.id):0, post=y=>y?flyT(y.id,d1.id)+wsec(d1.p,to,run):0;
   for(const x of xs) for(const y of ys){ if(!x&&!y) continue; const c=pre(x)+wsec(x?x.p:a,y?y.p:to,run)+post(y); if(c<direct&&(!best||c<best.c)){ const legs=[]; if(x) legs.push([d0,x]); if(y) legs.push([y,d1]); best={c,legs,x,y}; } }
   return best; }
 function learnNear(s,p){ if(!PR.autoFp||!p) return; for(const n of tnodes()){ if(s.fps.has(n.id)||n.m!==cont(p)||n.zmin>s.L) continue; const d=hyp(n.p,p); if(d>PR.autoFpYd) continue; const w=2*d/runSp(s); s.t+=w+PR.talk; s.c.walkSec+=w; s.c.talks++; s.c.autoFp=(s.c.autoFp||0)+1; s.fps.add(n.id); if(FL) FL.push({k:CK,m:CM,kind:'fp',node:n.id}); } }
 function walkTo(s,a,to,run,sec){ s.t+=sec; s.c.walkSec+=sec; s.c.walkYd+=sec*run; wayKill(s,a,to); s.pos=to; }
 // inns (innkeepers of the faction) for binding
 let INN=null, INNfac=null; const inns=()=>{ const fac=typeof taxiFac==='function'?taxiFac():'A'; if(!INN||INNfac!==fac){ INNfac=fac; INN=[]; for(const v of Object.values(META.vend||{})){ if(!/innkeeper/i.test(v[1]||'')||!String(v[2]||'').includes(fac)) continue; for(const [z,x,y] of (v[3]||[])){ const p=zp2plane(z,x,y); if(p) INN.push(p); } } } return INN; };
 function bindNear(s,p){ if(!PR.autoBind||!p) return; if(s.bind&&cont(s.bind)===cont(p)&&hyp(s.bind,p)<PR.autoBindYd) return; for(const n of inns()){ if(cont(n)!==cont(p)) continue; const d=hyp(n,p); if(d>PR.autoBindYd) continue; const w=2*d/runSp(s); s.t+=w+PR.talk; s.c.walkSec+=w; s.c.talks++; s.c.autoBind=(s.c.autoBind||0)+1; s.bind=n; if(FL) FL.push({k:CK,m:CM,kind:'home'}); return; } }
 // one leg from a to `to`: walking, or a flight plan (bestFlight), as cost and a way to play it
 function legPlan(s,a,to,run,canFly){ const sec=wsec(a,to,run); let best={c:sec,b:null}; if(canFly&&PR.autoFly&&sec>PR.flyMinSec){ const b=bestFlight(s,a,to,run,sec); if(b&&b.c<sec) best={c:b.c,b}; } return best; }
 function playLeg(s,a,to,run,pl){ const b=pl.b; if(!b){ walkTo(s,a,to,run,wsec(a,to,run)); return; }
   if(cont(a)===cont(to)){ const [dp,ds]=b.legs[0]; walkTo(s,a,dp.p,run,wsec(a,dp.p,run)); const f=flyT(dp.id,ds.id); s.t+=f; s.c.flySec+=f; s.c.autoFly=(s.c.autoFly||0)+1; if(FL) FL.push({k:CK,m:CM,kind:'fly',dep:dp.id,node:ds.id}); s.pos=ds.p; walkTo(s,ds.p,to,run,wsec(ds.p,to,run)); return; }
   let p=a; if(b.x){ const [d0,x]=b.legs[0]; walkTo(s,p,d0.p,run,wsec(p,d0.p,run)); const f=flyT(d0.id,x.id); s.t+=f; s.c.flySec+=f; s.c.autoFly=(s.c.autoFly||0)+1; if(FL) FL.push({k:CK,m:CM,kind:'fly',dep:d0.id,node:x.id}); p=x.p; s.pos=p; }
   const tgt=b.y?b.y.p:to; walkTo(s,p,tgt,run,wsec(p,tgt,run));
   if(b.y){ const [y,d1]=b.legs[b.legs.length-1]; const f=flyT(y.id,d1.id); s.t+=f; s.c.flySec+=f; s.c.autoFly=(s.c.autoFly||0)+1; if(FL) FL.push({k:CK,m:CM,kind:'fly',dep:y.id,node:d1.id,cross:1}); s.pos=d1.p; walkTo(s,d1.p,to,run,wsec(d1.p,to,run)); } }
 function move(s,to){ if(!to) return; if(!s.pos){ s.pos=to; return; } const a=s.pos; const d=hyp(a,to); if(d<5&&cont(a)===cont(to)){ s.pos=to; return; }
   CM++; if(typeof ROUTETIER==='function'&&ROUTETIER) ROUTETIER(s.L);
   const run=runSp(s); const first=!PR.flyFirstOnly||CM===1; const pl=legPlan(s,a,to,run,first);
   // the hearthstone, when it is ready and saves enough (Polestar's addon rule: a leg of 3+ minutes, 2+ minutes saved)
   if(PR.autoHs&&first&&s.bind&&s.t>=s.hsReady&&pl.c>=PR.hsMinSec){ const ph=legPlan(s,s.bind,to,run,true); const hc=PR.hearthCast+ph.c; if(hc<pl.c-PR.hsGain){ s.t+=PR.hearthCast; s.c.fixedSec+=PR.hearthCast; s.hsReady=s.t+PR.hearthCd; s.c.autoHs=(s.c.autoHs||0)+1; if(FL) FL.push({k:CK,m:CM,kind:'hs'}); s.pos=s.bind; playLeg(s,s.bind,to,run,ph); learnNear(s,to); bindNear(s,to); return; } }
   playLeg(s,a,to,run,pl); learnNear(s,to); bindNear(s,to); }
 const nearest=(pts,p)=>{ let b=null,bd=1e18; for(const x of pts){ if(x.dg) continue; const d=p?(cont(x)===cont(p)?hyp(x,p):1e7+hyp(x,p)):0; if(d<bd){bd=d;b=x;} } return b; };
 // ---------- killing at a ground: pulls of up to pullSize targets, walking a nearest-neighbour tour; respawns after a full sweep ----------
 function work(s,g,kills,onKill){ if(!g||!g.pts.length||kills<=0) return 0; const pts=g.pts; const start=s.pos&&cont(s.pos)===cont(g.center)?s.pos:g.center; move(s,nearest(pts,start)||g.center);
   let om=OC.get(g); if(!om){ om=new Map(); OC.set(g,om); } const okey=Math.round(s.pos.X/50)+','+Math.round(s.pos.Y/50); let order=om.get(okey);
   if(!order){ const left=pts.slice(); order=[]; let cur=s.pos; while(left.length){ let bi=0,bd=1e18; for(let i=0;i<left.length;i++){ const d=hyp(left[i],cur); if(d<bd){bd=d;bi=i;} } cur=left.splice(bi,1)[0]; order.push(cur); } om.set(okey,order); }
   const m=order.length, run=runSp(s); const w0=s.c.waitSec, t0=s.t; const killedAt=new Array(m).fill(-1e9); let done=0, i=0, inPull=0;
   while(done<kills){ const k=i%m; const sweep=Math.floor(i/m); if(k===0&&sweep>0&&sweep<PR.layers){ s.t+=PR.layerHop; s.c.waitSec+=PR.layerHop; } /* another layer: a fresh set of the same spawns */ const p=order[k]; const w=Math.max(0,hyp(s.pos,p)-(p.t==='n'&&!(PR.aoeLevel&&s.L<PR.aoeLevel)?PR.reach:0))/run; /* a mob is tagged from range: walk only to within reach of it */ s.t+=w; s.c.walkSec+=w; s.pos=p; if(sweep>=PR.layers&&PR.noRespawn) s.needResp=1; /* noRespawn: the route should only use what is up (layers included), never come back for respawns */ const ready=sweep<PR.layers?-1e9:killedAt[k]+resp(p.id); if(ready>s.t){ const wt=ready-s.t; s.t+=wt; s.c.waitSec+=wt; }
     const ml=p.lv!=null?Math.round(p.lv):s.L; const e=p.t==='n'&&elite(p.id); const lo=PR.aoeLevel&&s.L<PR.aoeLevel; /* before the group's AoE spells: one target at a time */ const ks=p.t==='o'?PR.interact/(PR.splitObjects?s.party:1):(lo?PR.lowPerMob:PR.perMob)*(e?PR.eliteMul:1); s.t+=ks; if(p.t==='o') s.c.interacts++; else { s.c.kills++; s.c.killSec+=ks; }
     if(p.t==='n'){ inPull++; if(inPull>=(lo?PR.lowPullSize:PR.pullSize)){ const pb=lo?PR.lowPullBase:PR.pullBase, pr=lo?PR.lowPullRest:PR.pullRest; s.t+=pb+pr; s.c.pulls++; s.c.pullSec+=pb; s.c.restSec+=pr; inPull=0; } if(p.lv!=null&&fightable(s.L,ml)) gain(s,Math.round(mxp(s.L,ml,e,s.party)*(1+PR.food)),'xpKill'); }
     killedAt[k]=s.t; done+=onKill(p); i++; if(i>m*40) break; }
   if(inPull){ s.t+=PR.pullBase+PR.pullRest; s.c.pulls++; s.c.pullSec+=PR.pullBase; s.c.restSec+=PR.pullRest; }
   if(TR) TR.push({q:CUR.q,k:CUR.k,item:CUR.item,pr:CUR.pr,kills,m,done,wait:Math.round(s.c.waitSec-w0),sec:Math.round(s.t-t0)});
   return done; }
 function doNeed(s,q,line,n){ if(n.rem<=0) return; CUR={q,k:n.k,item:n.item,pr:null};
   if(n.k==='kill'){ const g=groundFor(q,line,'n',n.ids.map(id=>({t:'n',id})),s.pos,n.rem); if(!g){ if(!s.afterRun){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; (s.c.unres=s.c.unres||[]).push(q); } n.rem=0; return; }
     work(s,g,n.rem,p=>{ pool(s,q,p); return 1; }); n.rem=0; return; }
   if(n.k==='item'){ let src=dropSources(n.item); if(src.filter(x=>x.t==='n').length>PR.bagSources){ n.rem=0; return; } /* carried from earlier kills (cloth for donations): no trip, as Polestar */ const srcAll=src; { const kn=src.filter(x=>x.p!=null); if(kn.length){ const mx=Math.max(...kn.map(x=>x.p)); src=kn.filter(x=>x.p>=mx*PR.dropKeep); } } /* hunt the mobs that drop it best */ if(!src.length){ /* one item nothing drops: handed over with the quest (a delivery) or bought on the way */ if((n.c??n.rem)<=1){ s.c.carried=(s.c.carried||0)+1; n.rem=0; return; } if(!s.afterRun){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; (s.c.unres=s.c.unres||[]).push(q); } n.rem=0; return; } let pr0=0,np0=0; for(const x of src){ pr0+=x.p!=null?x.p:PR.dropDefault; np0++; } let g=groundFor(q,line,'i',src,s.pos,Math.ceil(n.rem/Math.max(0.01,np0?pr0/np0:PR.dropDefault))); /* the best droppers may be nowhere in the open world (a dungeon's, or unspawned): hunt any that drop it */ if(!g&&!s.afterRun&&PR.dropFallback&&srcAll.length>src.length){ src=srcAll; let p1=0,n1=0; for(const x of src){ p1+=x.p!=null?x.p:PR.dropDefault; n1++; } g=groundFor(q,line,'i',src,s.pos,Math.ceil(n.rem/Math.max(0.01,n1?p1/n1:PR.dropDefault))); } if(!g){ if(!s.afterRun){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; (s.c.unres=s.c.unres||[]).push(q); } n.rem=0; return; }
     // expected kills: items needed over the ground's mean drop chance
     let pp=0,np=0; for(const p of g.pts){ pp+=p.p!=null?p.p:PR.dropDefault; np++; } const pr=Math.max(0.01,np?pp/np:PR.dropDefault); let acc=0; CUR.pr=pr; CUR.rem=n.rem;
     work(s,g,Math.ceil(n.rem/pr),p=>{ pool(s,q,p); acc+=pr; return 1; }); n.rem=0; return; }
   if(n.k==='object'){ const g=groundFor(q,line,'o',n.ids.map(id=>({t:'o',id,p:1})),s.pos,n.rem); if(!g){ if(!s.afterRun){ s.t+=PR.unresolvedSec; s.c.fixedSec+=PR.unresolvedSec; (s.c.unres=s.c.unres||[]).push(q); } n.rem=0; return; } work(s,g,n.rem,()=>1); n.rem=0; return; }
   if(n.k==='talk'){ const pts=[]; for(const id of n.ids) pts.push(...entPts('n',id)); const p=nearest(pts,s.pos); if(p) move(s,p); s.t+=PR.talk; s.c.talks++; n.rem=0; return; }
   if(!s.afterRun){ s.t+=PR.eventSec; s.c.fixedSec+=PR.eventSec; } n.rem=0; }
 // pooled credit: a kill also counts for other open quests' kill objectives on that mob, and their drops from it
 function pool(s,q0,p){ if(p.t!=='n') return; for(const [q,ns] of s.log){ if(q===q0) continue; for(const n of ns){ if(n.rem<=0) continue; if(n.k==='kill'&&n.ids.includes(p.id)) n.rem-=1; else if(n.k==='item'){ const d=EXTRA.drops[n.item]; const c=d&&d.n[p.id]; if(c!=null) n.rem-=c/100; } } } }
 // ---------- steps ----------
 function stepPt(s,st){ if(st.loc) return zp2plane(st.loc.z,st.loc.px,st.loc.py); return null; }
 /* how far above the group's level a quest can be done: normal quests +4, elite or group quests +2 (dungeon quests keep their windows) */ const overLv=(s,st,x)=>{ if(st.dgq||!x||!x.l) return false; /* cloth donations are turn-ins with no fighting, so the level gap carries no risk */ if(/^A Donation of /.test(x.n||'')) return false; const up=(typeof ELITE!=='undefined'&&ELITE.has(st.q))?PR.eliteAbove:PR.questAbove; return up!=null&&x.l>s.L+up; };
function play(s,st,R){ const t0=s.t; const L0=s.L; let err=null;
   /* objectives inside a dungeon: completes and pick-ups right after its run are covered by the run */ if(st.t!=='complete'&&st.t!=='accept') s.afterRun=0;
   if(+st.tsec>=0&&st.tsec!==''&&st.tsec!=null){ const p=stepPt(s,st); if(p) s.pos=p; s.t+=+st.tsec; s.c.fixedSec+=+st.tsec; return; }
   if(st.inRun){ if(st.q&&s.log.has(st.q)) for(const n of s.log.get(st.q)) n.rem=0; return; }
   switch(st.t){
    case 'accept':{ const q=st.q, x=Q(q); if(!x){ err='unknown'; break; } if(s.log.has(q)||s.done.has(q)) break;
      if((x.ps||[]).length&&!(x.ps||[]).some(p=>s.done.has(p))) err='prereq'; if((x.pg||[]).some(p=>!s.done.has(p))) err='prereq'; if(s.L<(x.r||1)) err='level';
      const p=nearest(starterPts(q),s.pos); if(p) move(s,p); s.t+=PR.talk; s.c.talks++; if(PR.logCap&&s.log.size>=PR.logCap) err='log full'; s.log.set(q,needsOf(q,st.cls?1:s.party)); if(s.log.size>(s.c.logPeak||0)) s.c.logPeak=s.log.size; break; }
    case 'complete':{ const q=st.q; if(!s.done.has(q)&&overLv(s,st,Q(q))){ err='over level'; break; } if(!s.log.has(q)&&!s.done.has(q)){ s.log.set(q,needsOf(q,st.cls?1:s.party)); R.soft++; } const ns=s.log.get(q); if(!ns) break; ns.forEach((n,i)=>{ if(st.obj&&n.line!=null&&n.line!==st.obj) return; doNeed(s,q,i+1,n); }); break; }
    case 'turnin':{ const q=st.q; if(s.done.has(q)) break; if(overLv(s,st,Q(q))){ err='over level'; break; } /* a dungeon quest's objectives are inside: its run comes first */ if(st.dgq&&!(s.ranDg&&s.ranDg.has(st.dgq))){ err='dungeon not run'; break; } if(!s.log.has(q)){ s.log.set(q,needsOf(q,st.cls?1:s.party)); R.soft++; } const ns=s.log.get(q); for(const [i,n] of ns.entries()) if(n.rem>0) doNeed(s,q,i+1,n); let fpts=finisherPts(q); if(st.cls&&s.pos){ const m=cont(s.pos); fpts=fpts.filter(p=>cont(p)===m); } /* a class quest: the data also lists the other faction's spirit or trainer */ const p=nearest(fpts,s.pos); if(p) move(s,p); s.t+=PR.talk; s.c.talks++;
      s.log.delete(q); s.done.add(q); if(!st.cls) gain(s,st.xpo!=null&&R.useXpo?+st.xpo:questXP(q,s.L),'xpQuest'); /* a class quest: one player's XP, not the group's */ break; }
    case 'train':{ const p=stepPt(s,st); if(p) move(s,p); s.t+=PR.trainSec; s.c.trains=(s.c.trains||0)+1; s.c.trainSec=(s.c.trainSec||0)+PR.trainSec; break; }
    case 'grind':{ if(st.mode==='run'){ s.afterRun=1; if(st.dg){ s.ranDg=new Set(s.ranDg||[]); s.ranDg.add(st.dg); } const p=stepPt(s,st); if(p) move(s,p); const lvR=+st.lv||0; /* a run over its level clears faster (dgLvl per level, 0.6x to 1.5x) and its mobs give less */ const f=lvR&&PR.dgLvl?Math.min(1.5,Math.max(0.6,1-PR.dgLvl*(s.L-lvR))):1; const sec=(+st.mins||0)*60*f; s.t+=sec; s.c.runSec+=sec; const x=st.xpo!=null?+st.xpo:Math.round(sec/killSecs(s.L,lvR||s.L,s.party)*mxp(s.L,lvR||s.L,false,s.party)*DG_RUN_XP*(PR.dgMobXp??1)); /* dungeon trash gives little: runs are for their quests */ gain(s,x,'xpRun'); break; }
      if(st.pack&&st.loc){ const c=stepPt(s,st); const C=+META.mobl.c; const cx=Math.floor(c.X/C), cy=Math.floor(c.Y/C); const ms=spawnsIn(cx*C,(cx+1)*C,cy*C,(cy+1)*C).filter(m=>fightable(s.L,Math.round(m.lv))).map(m=>({X:m.X,Y:m.Y,z:c.z,id:m.id,t:'n',lv:m.lv})); if(ms.length) work(s,{pts:ms,center:c},ms.length,()=>1); break; }
      if(+st.amount>0&&!(+st.xph>0)){ if(s.L>=60) break; if(st.extra&&st.note){ const key='g:'+st.note; if(s.done.has(key)) break; s.done.add(key); } const p=stepPt(s,st); if(p) move(s,p); const xps=mxp(s.L,s.L,false,s.party)*(1+PR.food)/killSecs(s.L,s.L,s.party); const sec=+st.amount/Math.max(0.01,xps); s.t+=sec; s.c.killSec+=sec; gain(s,+st.amount,'xpKill'); break; }
      if(+st.amount>0&&+st.xph>0){ const p=stepPt(s,st); if(p) move(s,p); const sec=+st.amount/(+st.xph)*3600; s.t+=sec; s.c.fixedSec+=sec; gain(s,+st.amount,'xpKill'); } break; }
    case 'travel':{ const k=st.kind;
      if(k==='fly'){ const dest=st.node||resolveNode(st); if(!dest||!META.taxi.nodes[dest]){ err='no node'; break; } const dn=META.taxi.nodes[dest]; const dep=st.from&&s.fps.has(st.from)&&META.taxi.nodes[st.from]&&META.taxi.nodes[st.from].m===cont(s.pos)?st.from:nearestNode(s.pos,s.fps); if(!dep||!s.fps.has(dest)&&!R.allFps){ err='fp unknown'; }
        if(dep&&dep!==dest&&META.taxi.nodes[dep].m===dn.m){ move(s,taxiPt(dep)); const fr=flightRoute(dep,dest); const sec=(fr&&fr.secs!=null?fr.secs:hyp(taxiPt(dep),taxiPt(dest))/PR.flySpeed)+PR.flyOver; s.t+=sec; s.c.flySec+=sec; s.pos=taxiPt(dest); } break; }
      if(k==='fp'){ const id=st.node||resolveNode(st); const p=id&&taxiPt(id); if(p){ move(s,p); s.fps.add(id); s.t+=PR.talk; s.c.talks++; } break; }
      if(k==='hs'||k==='home'){ if(k==='home'){ s.bind=s.pos; s.t+=PR.talk; break; } if(s.bind&&s.t>=s.hsReady){ s.t+=PR.hearthCast; s.c.fixedSec+=PR.hearthCast; s.pos=s.bind; s.hsReady=s.t+PR.hearthCd; } else err='hearth not ready'; break; }
      const p=stepPt(s,st); if(p) move(s,p); break; }
    case 'custom':{ const p=stepPt(s,st); if(p) move(s,p); if(st.act==='accept'||st.act==='turnin'){ s.t+=PR.talk; s.c.talks++; } if(st.act==='turnin'&&+st.xp>0){ const key='c:'+(st.name||st.id); if(!s.done.has(key)){ s.done.add(key); gain(s,+st.xp,'xpQuest'); } } break; }
    default:{ const p=stepPt(s,st); if(p) move(s,p); }
   }
   if(s.needResp){ if(!err) err='needs respawns'; s.needResp=0; }
  if(err){ s.errs++; R.err&&R.err.push([R.k,st.t,st.q||st.kind,err]); } }
 // ---------- public: play a whole route or resume from a snapshot ----------
 function runRested(steps,ch,opt={}){ const RS=opt.rested||ch.rested; if(!RS||!RS.on) return run(steps,ch,opt); const H=(RS.hours||50)*3600; const tg=opt.tgt||60;
  /* tents may go anywhere in the last H hours of play: the window is fitted to the end (target level, else the route's end), then started later hour by hour while that brings the target sooner (higher-level tents are worth more) */
  const val=r=>r.lvT&&r.lvT[tg]!=null?r.lvT[tg]:1e9-(r.L*1e6+r.xp); const end=r=>r.lvT&&r.lvT[tg]!=null?r.lvT[tg]:r.t;
  let r=run(steps,ch,Object.assign({},opt,{rested:null})); let st=0; for(let i=0;i<4;i++){ st=Math.max(0,end(r)-H); const r2=run(steps,ch,Object.assign({},opt,{rested:RS,restStart:st})); const d=Math.abs(end(r2)-end(r)); r=r2; r.restStart=st; if(d<30) break; }
  if(opt.restScan!==false){ for(let h=1;h<=(opt.restScan||12);h++){ const st2=st+h*3600; const r2=run(steps,ch,Object.assign({},opt,{rested:RS,restStart:st2})); if(st2<end(r2)-H-60) break; if(val(r2)<val(r)){ r=r2; r.restStart=st2; } } }
  if(RS.start!=null&&RS.start!==r.restStart){ const r2=run(steps,ch,Object.assign({},opt,{rested:RS,restStart:RS.start})); if(RS.start>=end(r2)-H-60&&val(r2)<val(r)){ r=r2; r.restStart=RS.start; } } /* the window the route was built with, when still inside the last H hours */
  return r; }
 function setParams(p){ PR=Object.assign({},DEF,p||{}); GC.clear(); WM.clear(); FT.clear(); }
 function run(steps,ch,opt={}){ const snaps=opt.snaps?[]:null; let s=opt.from?clone(opt.from.state):newState(ch); const k0=opt.from?opt.from.k:0; const R={soft:0,err:opt.err?[]:null,useXpo:!!opt.useXpo,allFps:!!opt.allFps,k:0}; const tg=opt.tgt||60; let tAt=null; const lvT={};
   const RS=opt.rested; const tent=()=>{ if(!RS||!RS.on||s.L<(RS.minL||5)||s.L>=60||s.c.tents>=(RS.n||50)) return; const st0=opt.restStart??0; if(s.t<st0) return; if(s.tentAt!=null&&s.t<s.tentAt+3600) return; s.tentAt=s.t; s.c.tents++; s.rp+=(RS.pct||0.05)*XP_TABLE[s.L]; const ts=RS.secs??60; s.t+=ts; s.c.tentSec+=ts; };
   FL=opt.flyLog||null; for(let k=k0;k<steps.length;k++){ R.k=k; CK=k; CM=0; tent(); if(snaps) snaps[k]=clone(s); const L0=s.L; play(s,steps[k],R); if(opt.times) opt.times[k]=s.t; if(opt.onStep) opt.onStep(k,s); for(let l=L0+1;l<=s.L;l++) if(lvT[l]==null) lvT[l]=s.t; if(tAt==null&&s.L>=tg){ tAt=s.t; if(opt.stopAtTgt) break; } }
   if(snaps) snaps[steps.length]=clone(s);
   return {t:s.t,tg:tAt,L:s.L,xp:s.xp,errs:s.errs,soft:R.soft,err:R.err,lvT,c:s.c,state:s,snaps}; }
 return {runRested,trace:(on)=>{ TR=on?[]:null; return TR; },get tr(){ return TR; },DEF,setParams,run,questXP,needsOf,newState,clone,get params(){ return PR; }};
})();
