// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the simulator's extra data from Polestar's forever-db (CC BY 4.0) and recorded objective spots,
// and from CMaNGOS classic-db respawn times.
// usage: node tools/prep.js <polestar checkout> <spawns_rs.json>
'use strict';
const fs=require('fs'), path=require('path');
const [PS,RS]=process.argv.slice(2); if(!PS) throw new Error('usage: prep.js <polestar dir> [spawns_rs.json]');
const jl=f=>fs.readFileSync(path.join(PS,'forever-db/data',f),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
// drop chances: item -> {npc id: chance %}
const drops={}; for(const r of jl('item_source.jsonl')){ if(r.kind!=='npc'&&r.kind!=='object') continue; const d=drops[r.item]=drops[r.item]||{n:{},o:{}}; d[r.kind==='npc'?'n':'o'][r.id]=r.chance??null; }
// quest facts: Forever quest XP, level, min level
const quests={}; for(const r of jl('quest.jsonl')) quests[r.id]={xp:r.xp??null,l:r.level??null,r:r.min_level??null,t:r.title};
// objective counts (Forever data): quest -> [{kind,target,count,n}]
const objs={}; for(const r of jl('quest_objective.jsonl')) (objs[r.quest]=objs[r.quest]||[]).push({k:r.kind,id:r.target,c:r.count,n:r.n});
// recorded objective spots (players' sessions): quest -> objective line -> [{ui,x,y,r,voters}]
const rec=JSON.parse(fs.readFileSync(path.join(PS,'data/recorded/quests.json'),'utf8')); const spots={};
for(const [q,v] of Object.entries(rec)) for(const o of v.objectives||[]){ const at=o.at; if(!at||!at.value||at.status!=='trusted') continue; (spots[q]=spots[q]||{})[o.line]={type:o.type,count:o.count,at:at.value.map(s=>({ui:s.map,x:s.x,y:s.y,r:s.r,v:s.voters}))}; }
// respawn seconds per creature entry (median of its spawns)
const resp={}; if(RS){ const by={}; for(const [mp,x,y,lv,rs,e] of JSON.parse(fs.readFileSync(RS,'utf8'))){ (by[e]=by[e]||[]).push(rs); } for(const [e,a] of Object.entries(by)){ a.sort((p,q)=>p-q); resp[e]=a[a.length>>1]; } }
const out={drops,quests,objs,spots,resp,source:{polestar:'fitzforge/polestar forever-db + data/recorded (CC BY 4.0)',respawn:'CMaNGOS classic-db creature spawntimes'}};
fs.writeFileSync(path.join(__dirname,'..','data','extra.json'),JSON.stringify(out));
console.log('drops',Object.keys(drops).length,'quests',Object.keys(quests).length,'spots',Object.keys(spots).length,'respawn',Object.keys(resp).length);
