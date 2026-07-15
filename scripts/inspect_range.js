const fs = require('fs');
const path='d:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s=fs.readFileSync(path,'utf8');
const lines=s.split(/\r?\n/);
for(let i=690;i<=716;i++){
  const ln=lines[i-1];
  const o=(ln.match(/\[/g)||[]).length;
  const c=(ln.match(/\]/g)||[]).length;
  console.log(`${i}: opens=${o} closes=${c} | ${ln}`);
}
