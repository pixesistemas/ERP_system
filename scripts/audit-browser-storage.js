const fs=require('fs');const path=require('path');
const roots=['frontend/src','backend/src','backend/database'];
const forbidden='local'+'Storage';let hits=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|jsx|ts|tsx)$/.test(name)){const text=fs.readFileSync(p,'utf8');text.split(/\r?\n/).forEach((line,i)=>{if(line.includes(forbidden))hits.push(`${p}:${i+1}: ${line.trim()}`)})}}}
for(const root of roots)if(fs.existsSync(root))walk(root);
if(hits.length){console.error('Se encontraron usos prohibidos:\n'+hits.join('\n'));process.exit(1)}
console.log('OK: no hay usos de almacenamiento local persistente.');
