const I=require("/home/claude/wowf-routesim/index.js").open();const fs=require("fs");const vm=require("vm");
module.exports={I,fs,vm,load:f=>{const O=JSON.parse(fs.readFileSync(f));return O.route||O;},ctx:I.P.ctx,ev:(n)=>vm.runInContext(n,I.P.ctx)};
