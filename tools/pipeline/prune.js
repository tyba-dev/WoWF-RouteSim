// prune: drop quests (all their steps) whose removal brings level 59 sooner, with no new errors, Hyjal still from HYJ
// and dungeon runs still in their windows. Candidates timed from a snapshot just before the quest's first step.
// usage: PF=params N=120 HYJ=56 node prune.js in.json out.json
const L=require('./lib.js');const O=JSON.parse(L.fs.readFileSync(process.argv[2]));const R=O.route||O;L.I.useRoute(R);L.I.setParams(JSON.parse(L.fs.readFileSync(process.env.PF||'five/pwL5.json')));
const N=+(process.env.N||120), HYJ=+(process.env.HYJ||56), Q=L.ev('Q'), totalXP=L.ev('totalXP');
const W={HOT:[14,22],DM:[17,26],ROL:[18,26],BFD:[24,32],EXC:[24,33],STOCKS:[22,30],GNOMER:[29,38],SM:[28,45],ULDA:[41,51],ZF:[42,54],MARA:[45,55],ST:[50,60],BRD:[52,60],DALARAN:[33,42],DROWNED:[35,44],KROLDOK:[37,46],ALCAZ:[48,57]};
const fixed=s=>s.mode==='run'||s.inRun||s.t==='custom'||s.t==='train'||s.t==='travel'||/^hyj/.test(s.id||'');
const RS=R.char.rested; const rst=L.I.S.runRested(R.steps,R.char,{tgt:59}).restStart;
const full=st=>{ const lv=[]; const r=L.I.S.run(st,R.char,{tgt:59,err:true,snaps:true,rested:RS,restStart:rst,onStep:(k,s)=>{lv[k]=s.L;}}); return {r,lv}; };
const ok=(st,lv)=>{ const hk=st.findIndex(s=>/^hyj/.test(s.id||'')); if(hk>=0&&lv[hk]<HYJ) return false; for(let k=0;k<st.length;k++){ const s=st[k]; if(s.mode==='run'&&W[s.dg]&&(lv[k]<W[s.dg][0]||lv[k]>W[s.dg][1]+2)) return false; } return true; };
let st=R.steps.slice(); let F=full(st); const t0=F.r.lvT[59]; console.log('base t59',(t0/3600).toFixed(2),'errs',F.r.errs,'restStart h',((rst||0)/3600).toFixed(1));
const need=new Set(); for(const s of st){ const x=s.q&&Q(s.q); for(const p of [...(x&&x.ps||[]),...(x&&x.pg||[])]) need.add(p); }
let acc=0; for(let pass=0;pass<3;pass++){ const S=F.r.snaps; const cost=new Map(); st.forEach((s,k)=>{ if(fixed(s)||!s.q||need.has(s.q)) return; const a=S[k],b=S[k+1]; if(!a||!b) return; const o=cost.get(s.q)||cost.set(s.q,{dt:0,dx:0,k0:k}).get(s.q); o.dt+=b.t-a.t; o.dx+=totalXP(b.L,b.xp)-totalXP(a.L,a.xp); });
  const cand=[...cost.entries()].sort((x,y)=>y[1].dt/(y[1].dx+500)-x[1].dt/(x[1].dx+500)).slice(0,N); let nA=0;
  for(const [q,o] of cand){ const k0=st.findIndex(s=>s.q===q&&!fixed(s)); if(k0<0) continue; const ns=st.filter(s=>!(s.q===q&&!fixed(s)));
    let m; try{ m=L.I.S.run(ns,R.char,{tgt:59,err:true,rested:RS,restStart:rst,from:{k:k0,state:F.r.snaps[k0]},stopAtTgt:true}); }catch(e){ continue; }
    if(!m.lvT[59]||m.errs>F.r.errs||m.lvT[59]>=F.r.lvT[59]-5) continue; const F2=full(ns); if(!F2.r.lvT[59]||F2.r.errs>F.r.errs||!ok(ns,F2.lv)) continue;
    st=ns; F=F2; acc++; nA++; console.log('drop',q,(Q(q)||{}).n,'t59',(F.r.lvT[59]/3600).toFixed(2)); }
  if(!nA) break; }
R.steps=st; L.fs.writeFileSync(process.argv[3],JSON.stringify(O)); console.log('final t59',(F.r.lvT[59]/3600).toFixed(2),'errs',F.r.errs,'dropped',acc);
