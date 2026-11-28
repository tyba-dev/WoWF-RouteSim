const L=require('./lib.js');const R=L.load(process.argv[2]);L.I.useRoute(R);L.I.setParams(JSON.parse(L.fs.readFileSync('five/pwL5.json')));
const lv=[];L.I.S.runRested(R.steps,R.char,{tgt:59,onStep:(k,s)=>{lv[k]=s.L;}});
const ev=L.ev; const EL=ev('ELITE'); const PS=ev('typeof PROF_SORTS!=="undefined"?[...PROF_SORTS]:[]'), ES=ev('typeof EVENT_SORTS!=="undefined"?[...EVENT_SORTS]:[]');
const seen=new Map(); R.steps.forEach((s,k)=>{ if(!s.q) return; const e=seen.get(s.q)||{q:s.q,acc:null,ti:null,cls:s.cls,steps:[]}; e.steps.push(s.t); if(s.t==='accept'&&e.acc==null) e.acc=lv[k-1]||lv[k]; if(s.t==='turnin') e.ti=lv[k]; if(s.t==='complete') e.co=lv[k-1]; seen.set(s.q,e); });
const out=[]; for(const e of seen.values()){ const x=ev('Q('+e.q+')')||{}; const f=[]; const ql=x.l||0; const Lp=e.co??e.acc??e.ti;
 if(x.sk) f.push('SKILL'+x.sk); if(x.ev||ES.includes(x.z)) f.push('EVENT'); if(PS.includes(x.z)) f.push('PROFZONE'); if(x.cl||(x.z<0)) f.push('CLASS/sort'+x.z+(e.cls?'(side)':'')); if(x.s&&x.s.i&&x.s.i.length) f.push('ITEMSTART'); if((x.sf||0)&1) f.push('REPEAT');
 const el=EL.has(e.q); if(el) f.push('ELITE'); if(Lp!=null&&ql-Lp>(el?2:4)) f.push('HARD+'+(ql-Lp)); if(ql-Lp>=3&&!el) f.push('stretch+'+(ql-Lp)); if(Lp!=null&&ql&&Lp-ql>=8) f.push('gray-'+(Lp-ql)); if(!e.steps.includes('turnin')) f.push('NOTURNIN'); if(!e.steps.includes('accept')) f.push('NOACCEPT');
 out.push([e.q,x.n,ql,Lp,f.join(' '),x.fv?'F':'']); }
L.fs.writeFileSync('five/audit.json',JSON.stringify(out)); const fl=out.filter(o=>o[4]); console.log('quests',out.length,'flagged',fl.length); for(const o of fl) console.log(o.join(' | '));
