// check a route: t59, errors, Hyjal start level, dungeon levels vs their windows, travel steps
// usage: PF=params node check.js route.json
const L=require('./lib.js');const R=L.load(process.argv[2]);L.I.useRoute(R);L.I.setParams(JSON.parse(L.fs.readFileSync(process.env.PF||'five/pwL5.json')));
const lv=[];const r=L.I.S.runRested(R.steps,R.char,{tgt:59,err:true,onStep:(k,s)=>{lv[k]=s.L;}});
const W={RFC:[13,18],DM:[17,26],WC:[17,24],HOT:[14,22],ROL:[18,26],SFK:[22,30],BFD:[24,32],EXC:[24,33],STOCKS:[22,30],GNOMER:[29,38],RFK:[29,38],SM:[28,45],RFD:[37,46],ULDA:[41,51],ZF:[42,54],MARA:[45,55],ST:[50,60],BRD:[52,60],DALARAN:[33,42],DROWNED:[35,44],KROLDOK:[37,46],ALCAZ:[48,57]};
const dg=[],bad=[];R.steps.forEach((s,k)=>{ if(s.mode==='run'){ dg.push(s.dg+' L'+lv[k]); const w=W[s.dg]; if(w&&(lv[k]<w[0]||lv[k]>w[1]+2)) bad.push(s.dg+' L'+lv[k]+' (window '+w.join('-')+')'); } });
const hk=R.steps.findIndex(s=>/^hyj/.test(s.id||'')); const tr={}; R.steps.filter(s=>s.t==='travel').forEach(s=>tr[s.kind]=(tr[s.kind]||0)+1);
const ec={}; (r.err||[]).forEach(e=>ec[e[3]]=(ec[e[3]]||0)+1);
console.log(JSON.stringify({steps:R.steps.length,t59:r.lvT[59]?+(r.lvT[59]/3600).toFixed(2):null,L:r.L,errs:r.errs,errKinds:ec,firstErr:(r.err||[]).slice(0,4),hyjal:hk>=0?lv[hk]:null,restStart:+(r.restStart/3600).toFixed(1),travel:tr,dgOut:bad}));
console.log(dg.join(' · '));
