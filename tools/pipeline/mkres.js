// resume config: seed=out steps (+hyj from v6 if HYJ=1), freeze all
const fs=require('fs');const [cfgF,outF,dst]=process.argv.slice(2);const C=JSON.parse(fs.readFileSync(cfgF));const O=JSON.parse(fs.readFileSync(outF));const R=O.route||O;
let st=R.steps.slice(); if(process.env.HYJ){const v=JSON.parse(fs.readFileSync('five/v6.json'));st=st.concat((v.route||v).steps.filter(s=>/^hyj/.test(s.id||'')));}
C.seed=st;C.freeze=st.length;C.char=R.char;C.ms=+(process.env.MS||1800000);C.growMs=C.ms-100000;C.forceRuns=[];
fs.writeFileSync(dst,JSON.stringify(C));console.log('seed',st.length);
