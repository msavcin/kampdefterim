const fs=require('fs');
const p='d:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s=fs.readFileSync(p,'utf8');
const lines=s.split(/\r?\n/);
for(let i=5860;i<=5940;i++){
  if(i>lines.length) break;
  console.log((i+1)+': '+lines[i]);
}
