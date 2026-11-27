// clear errors: for the first error, drop that quest (all its steps) when it lowers the error count; repeat
// usage: PF=params node fixerr.js in.json out.json
const L=require('./lib.js');const O=JSON.parse(L.fs.readFileSync(process.argv[2]));const R=O.route||O;L.I.useRoute(R);L.I.setParams(JSON.parse(L.fs.readFileSync(process.env.PF||'five/pwL5.json')));
const fixed=s=>s.mode==='run'||s.inRun||s.t==='custom'||s.t==='train'||s.t==='travel'||/^hyj/.test(s.id||'');
const ev=st=>L.I.S.runRested(st,R.char,{tgt:59,err:true});
let st=R.steps.slice(), r=ev(st); const tried=new Set();
for(let it=0;it<60&&r.errs>0;it++){ const e=(r.err||[]).find(e=>!tried.has(e[2])); if(!e) break; const q=e[2]; tried.add(q);
  const ns=st.filter(s=>!(s.q===q&&!fixed(s))); if(ns.length===st.length) continue; const r2=ev(ns);
  if(r2.errs<r.errs){ st=ns; r=r2; console.log('drop',q,e[1],e[3],'errs',r.errs,'t59',r.lvT[59]?(r.lvT[59]/3600).toFixed(2):'-'); } }
R.steps=st; L.fs.writeFileSync(process.argv[3],JSON.stringify(O)); console.log('errs',r.errs,'t59',r.lvT[59]?(r.lvT[59]/3600).toFixed(2):'L'+r.L,JSON.stringify((r.err||[]).slice(0,5)));
