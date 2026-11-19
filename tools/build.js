// SPDX-License-Identifier: GPL-3.0-or-later
// usage: node tools/build.js <options.json> <out.json>
// options: {char:{...route.char}, tgt, ms, growMs, K, lns, fly, block:[zone names], runs:[...], forceRuns:[...], chain:[qids], seed:[steps], params:{engine params}}
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const [OPT,OUT]=process.argv.slice(2); const opt=JSON.parse(fs.readFileSync(OPT,'utf8'));
const W=require('../index.js').open(); W.setParams(opt.params||{});
const R={id:'build',name:opt.name||'Own route',char:opt.char,steps:[]}; W.useRoute(R);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','builder.js'),'utf8')+'\n;globalThis.ROUTEBUILD=ROUTEBUILD;',W.P.ctx,{filename:'builder.js'});
opt.progress=p=>console.error(JSON.stringify(p));
const res=W.P.ctx.ROUTEBUILD(opt); R.steps=res.steps; delete res.steps;
fs.writeFileSync(OUT,JSON.stringify(R)); console.log(JSON.stringify(res));
