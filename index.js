// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const planner=require('./planner.js');
function open(opts={}){ const P=planner.load(); const D=path.join(__dirname,'data');
  P.ctx.EXTRA=JSON.parse(fs.readFileSync(path.join(D,'extra.json'),'utf8'));
  P.ctx.QXP=fs.existsSync(path.join(D,'pxp.json'))?JSON.parse(fs.readFileSync(path.join(D,'pxp.json'),'utf8')):{};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'engine.js'),'utf8')+'\n;globalThis.SIMX=SIMX;',P.ctx,{filename:'engine.js'});
  const S=P.ctx.SIMX;
  // a route for the planner's helpers (faction, race flight paths, character settings)
  const useRoute=R=>{ P.ctx.__R=R; vm.runInContext('migrateRoute(__R); route=__R;',P.ctx); };
  return {P,S,useRoute,run:(R,o)=>{ useRoute(R); return S.run(R.steps,R.char,o||{}); },setParams:p=>S.setParams(p)}; }
module.exports={open};
