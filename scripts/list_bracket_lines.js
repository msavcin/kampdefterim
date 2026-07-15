const fs = require('fs');
const path = 'd:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split(/\r?\n/);
let cum = 0;
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  const o = (ln.match(/\[/g) || []).length;
  const c = (ln.match(/\]/g) || []).length;
  if (o || c) {
    cum += o - c;
    console.log(`${i+1}: opens=${o} closes=${c} cum=${cum} | ${ln}`);
  }
}
console.log('Final cum =', cum);
