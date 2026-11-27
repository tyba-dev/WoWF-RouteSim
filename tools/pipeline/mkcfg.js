// builder config for the fiveman1 rebuild (reconstructed)
const fs=require('fs');const R=JSON.parse(fs.readFileSync('five/v6.json'));
const P=JSON.parse(fs.readFileSync('five/pwL5.json'));
const PS=Object.assign({},P,{autoFly:1,autoFp:1,autoHs:1,autoBind:1,flyFirstOnly:0,autoPortal:1,portalGain:60});
fs.writeFileSync('five/pwS.json',JSON.stringify(PS));
fs.writeFileSync('five/pwT.json',JSON.stringify(PS));
fs.writeFileSync('five/matT.json',JSON.stringify(Object.assign({},P,{autoFly:1,autoFp:1,autoHs:1,autoBind:1,autoPortal:1,portalGain:60})));
// HC: zones opened by level (the earlier of the usual safe level and the level rev 13 first went there)
const block={"Arathi Highlands":30,"Alterac Mountains":21,"Badlands":30,"Desolace":30,"Dustwallow Marsh":33,"Stranglethorn Vale":21,"Swamp of Sorrows":30,"Thousand Needles":25,"The Hinterlands":40,"Searing Gorge":41,"Tanaris":40,"Feralas":40,"Azshara":42,"Blasted Lands":42,"Un'Goro Crater":46,"Felwood":47,"Burning Steppes":48,"Western Plaguelands":47,"Eastern Plaguelands":51,"Winterspring":51,"Silithus":53,"Deadwind Pass":55,"Orgrimmar":99,"Undercity":99,"Thunder Bluff":99,"Mulgore":99};
// dungeon runs from rev 13: run step, its quests, the level it opens at
const LV={HOT:20,ROL:21,DM:23,STOCKS:28,EXC:32,BFD:31,GNOMER:36,DALARAN:38,DROWNED:39,KROLDOK:41,SM:42,ZF:46,ULDA:47,ALCAZ:52,MARA:53,BRD:55,ST:55};
const QS={STOCKS:[387,388,377,386],EXC:[95646,98824],GNOMER:[2924,2928,2929],MARA:[7028,7041,7065]};
const runs=[]; R.steps.forEach((s,k)=>{ if(s.mode!=='run') return; const st=Object.assign({},s); delete st.id; delete st.blk; const qs=QS[s.dg]||[];
  const steps=[st,...qs.map(q=>({t:'complete',q,inRun:1}))]; runs.push({dg:s.dg,lv:LV[s.dg],loc:s.loc,acc:qs,tin:qs,steps,mins:s.mins,xp:s.xpo||8000}); });
const char=Object.assign({},R.char,{fps:['352']});
const cfg={name:'fiveman1 rebuild',char,tgt:59,ms:6800000,growMs:6600000,K:40,lns:false,fly:false,block,runs,forceRuns:runs.map(r=>r.dg),chain:[],seed:[],freeze:0,horizon:120,params:PS,tents:true,restStart:97200,noClassQ:true,allRace:1,forceErrTol:2};
fs.writeFileSync('five/segS10.json',JSON.stringify(cfg)); console.log(runs.length,'runs');
