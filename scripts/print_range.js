const fs=require('fs');
const p='d:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s=fs.readFileSync(p,'utf8');
const lines=s.split(/\r?\n/);
const start=6968-1; const end=6990-1;
for(let i=start;i<=end && i<lines.length;i++){
  console.log((i+1).toString().padStart(5, ' ')+': '+lines[i]);
}
