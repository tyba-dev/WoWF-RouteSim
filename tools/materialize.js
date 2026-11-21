// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the flights, flight-path pickups, hearths and binds the engine took on its own (params autoFly / autoFp) into the route as
// real travel steps, so the guide shows them and the route plays the same with those params off.
// usage: node tools/materialize.js <route.json> <out.json> [options.json]   options: {block, params}
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const [IN,OUT,OPTF]=process.argv.slice(2); const opt=OPTF?JSON.parse(fs.readFileSync(OPTF,'utf8')):{};
const O=JSON.parse(fs.readFileSync(IN,'utf8')); const R=O.route||O;
const W=require('../index.js').open(); W.useRoute(R);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','builder.js'),'utf8')+'\n;globalThis.ROUTEBLOCK=ROUTEBLOCK;',W.P.ctx,{filename:'builder.js'});
W.P.ctx.ROUTEBLOCK(opt.block||[]); const taxiShort=vm.runInContext('taxiShort',W.P.ctx);
const P=Object.assign({autoFly:1,autoFp:1},opt.params||{});
const h=s=>(s/3600).toFixed(2)+'h';
W.setParams(P); const RS=R.char&&R.char.rested; const rest=RS&&RS.on?{rested:RS,restStart:W.S.runRested(R.steps,R.char,{tgt:60}).restStart}:{}; /* tents as the route plays them */
const fl=[]; const r0=W.S.run(R.steps,R.char,Object.assign({flyLog:fl,err:true},rest));
const before=new Map(), after=new Map(); const add=(m,k,s)=>{ if(!m.has(k)) m.set(k,[]); m.get(k).push(s); };
let lastFlyK=-1, lastDest=null;
// only flights on a step's first move can be written before it; later ones (between a step's own objectives) stay walking
let skipped=0; let lastM=-1;
for(const e of fl){ if(e.kind==='hs'){ add(before,e.k,{t:'travel',kind:'hs',text:'Use your Hearthstone'}); continue; } if(e.kind==='home'){ add(after,e.k,{t:'travel',kind:'home',text:'Set your Hearthstone here'}); continue; } if(e.kind==='fly'&&e.m>1){ skipped++; continue; } if(e.kind==='fp'){ add(after,e.k,{t:'travel',kind:'fp',node:e.node,text:'Flight path: '+taxiShort(e.node)}); continue; }
  // a second flight in the same move (other continent): walk to its departure first
  if(e.cross&&!(e.k===lastFlyK&&e.m===lastM&&lastDest===e.dep)||e.k===lastFlyK&&e.m===lastM&&lastDest!==e.dep) add(before,e.k,{t:'travel',kind:'fp',node:e.dep,text:'Go to '+taxiShort(e.dep)});
  add(before,e.k,{t:'travel',kind:'fly',node:e.node,from:e.dep,text:'Fly to '+taxiShort(e.node)}); lastFlyK=e.k; lastM=e.m; lastDest=e.node; }
const out=[]; let n=0; R.steps.forEach((s,k)=>{ for(const x of before.get(k)||[]){ out.push(Object.assign({id:'mf'+(n++)},x)); } out.push(s); for(const x of after.get(k)||[]){ out.push(Object.assign({id:'mf'+(n++)},x)); } });
R.steps=out;
W.setParams(Object.assign({},opt.params||{},{autoFly:0,autoFp:0,autoHs:0,autoBind:0})); const r1=W.S.run(R.steps,R.char,Object.assign({err:true},rest));
fs.writeFileSync(OUT,JSON.stringify(O));
console.log(JSON.stringify({auto:{t:h(r0.t),L:r0.L,errs:r0.errs},written:{t:h(r1.t),L:r1.L,errs:r1.errs,err:(r1.err||[]).slice(0,8)},fly:fl.filter(e=>e.kind==='fly').length,skipped,fp:fl.filter(e=>e.kind==='fp').length,steps:R.steps.length}));
