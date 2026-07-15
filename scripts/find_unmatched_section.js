const fs = require('fs');
const path = 'd:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split(/\r?\n/);
let cum=0; let firstPositiveLine=-1; let lastPositiveLine=-1;
for(let i=0;i<lines.length;i++){
  const ln=lines[i];
  const o=(ln.match(/\[/g)||[]).length;
  const c=(ln.match(/\]/g)||[]).length;
  cum+=o-c;
  if(cum>0 && firstPositiveLine===-1) firstPositiveLine=i+1;
  if(cum>0) lastPositiveLine = i+1;
}
console.log('firstPositiveLine=',firstPositiveLine,'lastPositiveLine=',lastPositiveLine,'finalCum=',cum);
if(firstPositiveLine!==-1){
  const start=Math.max(1, firstPositiveLine-5);
  const end=Math.min(lines.length, firstPositiveLine+20);
  console.log('Context lines',start,'-',end);
  for(let i=start-1;i<end;i++) console.log((i+1)+': '+lines[i]);
}
