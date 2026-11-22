// SPDX-License-Identifier: GPL-3.0-or-later
// Class quests one player does alone while the group keeps questing: places a note in the group route where the player
// reaches the chain's level, and times the trip (from the group's spot, through the chain, back to it) for that one player.
// usage: node tools/sidetrips.js <route.json> <out.json> <options.json>
// options: {side:[{who:'Hunter', qs:[...], lead:0, how:'hearth to Zephras'}], params, block, tgt}
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const [IN,OUT,OPTF]=process.argv.slice(2); const opt=JSON.parse(fs.readFileSync(OPTF,'utf8'));
const O=JSON.parse(fs.readFileSync(IN,'utf8')); const R=O.route||O;
const W=require('../index.js').open(); W.useRoute(R);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','builder.js'),'utf8')+'\n;globalThis.ROUTEBLOCK=ROUTEBLOCK;',W.P.ctx,{filename:'builder.js'});
W.P.ctx.ROUTEBLOCK(opt.block||[]); W.setParams(opt.params||{});
const C=W.P.ctx, META=vm.runInContext('META',C), Q=vm.runInContext('Q',C), plane2zone=vm.runInContext('plane2zone',C);
const pos=[], lv=[], tt=[]; W.S.runRested(R.steps,R.char,{tgt:opt.tgt||60,onStep:(k,s)=>{ pos[k]=s.pos; lv[k]=s.L; tt[k]=s.t; }});
const locOf=p=>{ const z=p&&plane2zone(p.X,p.Y); return z?{z:z.z,px:Math.round(z.px*10)/10,py:Math.round(z.py*10)/10}:null; };
const ins=new Map(); const rep=[];
for(const sd of opt.side){ const x0=Q(sd.qs[0]); const need=Math.max((x0.l||1)-(sd.lead||0),x0.r||1); const k=lv.findIndex(L=>L>=need); if(k<0){ rep.push(sd.who+': level '+need+' not reached'); continue; }
  // the trip for one player: the chain from the group's spot, then back to where the group will be
  const at=locOf(pos[k]); const steps=[]; if(at) steps.push({t:'travel',loc:at});
  for(const q of sd.qs){ steps.push({t:'accept',q,cls:1},{t:'complete',q,cls:1},{t:'turnin',q,cls:1}); }
  const ch=Object.assign({},R.char,{level:lv[k],xp:0,party:1,rested:Object.assign({},R.char.rested||{},{on:false})});
  let r; try{ r=W.S.run(steps,ch,{err:true}); }catch(e){ rep.push(sd.who+': could not time ('+e.message+')'); continue; }
  const trip=r.t; let back=k; while(back+1<tt.length&&tt[back+1]-tt[k]<trip) back++; const rejoin=locOf(pos[back]); const zn=l=>l?META.zones[l.z]?.n:'?';
  const names=sd.qs.map(q=>Q(q).n); const mins=Math.round(trip/60);
  const note={t:'custom',act:'note',xp:0,name:sd.who+' side trip ('+mins+' min): '+(sd.how?sd.how+'; ':'')+names.join(', ')+'. Rejoin the group in '+zn(rejoin)+'.',side:sd.who};
  (ins.get(k)||ins.set(k,[]).get(k)).push(note);
  rep.push(sd.who+' at L'+lv[k]+' (step '+k+', '+zn(at)+'): '+mins+' min alone, rejoin ~step '+back+' in '+zn(rejoin)+(r.errs?' ('+r.errs+' errors: '+JSON.stringify(r.err||[]).slice(0,120)+')':''));
}
const out=[]; let n=0; R.steps.forEach((s,k)=>{ out.push(s); for(const x of ins.get(k)||[]) out.push(Object.assign({id:'sd'+(n++)},x)); });
R.steps=out; fs.writeFileSync(OUT,JSON.stringify(O)); console.log(rep.join('\n'));
