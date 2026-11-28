set -eo pipefail
T=/home/claude/wowf-routesim/tools; F=/home/claude/work/five; W=/home/claude/work
B(){ (cd /home/claude/wowf-routesim; timeout $3 node --max-old-space-size=4000 tools/build.js $F/$1.json $F/$2.json 2>$F/$2.log > $F/$2.out); echo "$2 $(grep -o '"built":{[^}]*}' $F/$2.out)"; }
cfg(){ node -e 'const fs=require("fs");const [src,out,dst,tgt,ms,hy]=process.argv.slice(1);const C=JSON.parse(fs.readFileSync(src));const O=JSON.parse(fs.readFileSync(out));const R=O.route||O;let st=R.steps.slice();if(hy==="1"){const v=JSON.parse(fs.readFileSync("'$F'/v6.json"));st=st.concat((v.route||v).steps.filter(s=>/^hyj/.test(s.id||"")));}C.seed=st;C.freeze=st.length;C.char=R.char;C.tgt=+tgt;C.ms=+ms;C.growMs=+ms-100000;C.forceRuns=[];C.vks=[0.3,0.15,0.1,0.07,0.05,0.035,0.025,0.015,0.01];fs.writeFileSync(dst,JSON.stringify(C));' $F/nb.json $F/$1.json $F/$2.json $3 $4 $5; }
lvl(){ node -e 'const O=JSON.parse(require("fs").readFileSync(process.argv[1]));' ; }
[ "$1" = 1 ] && { B nb nb_out 7100; exit 0; }
L=$(grep -o '"built":{[^}]*}' $F/nb_out.out | grep -o '"L":[0-9]*' | cut -d: -f2)
src=nb_out
if [ "$1" = 2 ]; then
if [ "$L" -lt 56 ]; then cfg nb_out nb56 56 2400000 0; B nb56 nb56_out 2700; src=nb56_out; fi
cfg $src nb59 59 2700000 1; B nb59 nb59_out 3000
exit 0; fi
if [ "$1" = O ]; then
node -e 'const fs=require("fs");const F=process.argv[1];const C=JSON.parse(fs.readFileSync(F+"/nb59.json"));const O=JSON.parse(fs.readFileSync(F+"/nb59_out.json"));const R=O.route||O;C.seed=R.steps;C.freeze=0;C.char=R.char;C.skipGrow=true;C.prune=3;C.relocate=true;C.visits=true;C.runMove=true;C.lns=true;C.ms=6600000;fs.writeFileSync(F+"/nbo.json",JSON.stringify(C));' $F
B nbo nbo_out 7100
exit 0; fi
cd $W
node --max-old-space-size=4000 $T/train.js $F/nbo_out.json $F/b1.json $F/train5bT.json > $F/b1.log 2>&1; echo train ok
node --max-old-space-size=4000 $T/sidetrips.js $F/b1.json $F/b2.json $F/side5T.json > $F/b2.log 2>&1; echo side ok
node --max-old-space-size=4000 $T/materialize.js $F/b2.json $F/b3.json $F/matT.json > $F/b3.log 2>&1; echo mat ok
PF=$F/pwL5.json node check.js $F/b3.json 2>/dev/null
PF=$F/pwL5.json node fixerr.js $F/b3.json $F/b4.json > $F/b4.log 2>&1; echo fix ok
PF=$F/pwL5.json node check.js $F/b4.json 2>/dev/null
PF=$F/pwL5.json N=150 HYJ=56 node prune.js $F/b4.json $F/b5.json > $F/b5.log 2>&1; echo prune ok; tail -2 $F/b5.log
PF=$F/pwL5.json node fixerr.js $F/b5.json $F/b6.json > $F/b6.log 2>&1
PF=$F/pwL5.json node check.js $F/b6.json 2>/dev/null
