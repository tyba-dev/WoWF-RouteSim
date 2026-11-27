// planner upload: drop guide links/text, chunk the route into parts of 150k chars, write meta
// usage: node strip.js route.json outPrefix id name rev
const fs=require('fs');const [,,inp,pre,id,name,rev]=process.argv;const O=JSON.parse(fs.readFileSync(inp));const R=O.route||O;
const steps=R.steps.map(s=>{ const t=Object.assign({},s); delete t.src; delete t.rxt; return t; });
const out={id,name,char:R.char,steps,sections:{},ccol:1,guides:[],notesMig:2,optMig:1}; const str=JSON.stringify(out);
const parts=[]; for(let i=0;i<str.length;i+=150000) parts.push(str.slice(i,i+150000));
parts.forEach((p,k)=>fs.writeFileSync(`${pre}_part${k}.json`,JSON.stringify({s:p})));
fs.writeFileSync(`${pre}_meta.json`,JSON.stringify({id,name,rev:+rev,n:parts.length,updatedAt:Date.now(),by:'claude'}));
console.log('chars',str.length,'parts',parts.length);
