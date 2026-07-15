const fs = require('fs');
const path = 'd:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s = fs.readFileSync(path, 'utf8');
const lastOpen = s.lastIndexOf('[');
const lastClose = s.lastIndexOf(']');
console.log('lastOpen', lastOpen, 'lastClose', lastClose);
if (lastOpen >= 0) {
  const before = s.slice(Math.max(0,lastOpen-200), lastOpen+200);
  console.log('context around lastOpen:\n', before);
}
if (lastClose >= 0) {
  const before = s.slice(Math.max(0,lastClose-200), lastClose+200);
  console.log('context around lastClose:\n', before);
}
