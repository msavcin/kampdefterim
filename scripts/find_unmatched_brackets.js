const fs = require('fs');
const path = 'd:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split(/\r?\n/);
let count = 0;
let firstNegative = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/\[/g) || []).length;
  const closes = (line.match(/\]/g) || []).length;
  count += opens - closes;
  if (count < 0 && firstNegative === null) {
    firstNegative = {line: i+1, col: line.indexOf(']')+1, detail: line};
  }
}
console.log('final count (open - close) =', count);
if (firstNegative) console.log('first negative at', firstNegative);
// If still positive, show last lines that contain '['
if (count > 0) {
  console.log('Unmatched opens remain. Last 40 lines with [ or ]:');
  lines.slice(-80).forEach((ln, idx) => {
    if (ln.includes('[') || ln.includes(']')) console.log((lines.length-80+idx+1)+':', ln);
  });
}
