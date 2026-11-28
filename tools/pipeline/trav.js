const L=require('./lib.js');const R=L.load(process.argv[2]);L.I.useRoute(R);L.I.setParams(JSON.parse(L.fs.readFileSync(process.env.PF||'five/pwL5.json')));
const META=L.ev('META'); const cont=p=>p&&META.zones[p.z]&&META.zones[p.z].m; let prev=null,pt=0,pc=null; const rows=[]; const by={};
L.I.S.runRested(R.steps,R.char,{tgt:59,onStep:(k,s)=>{ const st=R.steps[k]; const dt=s.t-pt; const c=s.pos?cont(s.pos):null; const kk=st.t==='travel'?'travel:'+st.kind:st.t; const e=by[kk]||(by[kk]={n:0,sec:0}); e.n++; e.sec+=dt;
  if(pc!=null&&c!=null&&c!==pc) rows.push([k,kk,st.q||st.node||st.dg||'',pc+'>'+c,Math.round(dt),s.L]);
  pt=s.t; pc=c; }});
console.log(JSON.stringify(Object.fromEntries(Object.entries(by).map(([k,v])=>[k,[v.n,+(v.sec/3600).toFixed(2)]]))));
console.log('continent changes',rows.length); rows.forEach(r=>console.log(r.join(' ')));
