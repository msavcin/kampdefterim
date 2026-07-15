const fs = require('fs');
const p = 'd:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
let s = '';
try {
  s = fs.readFileSync(p, 'utf8');
} catch (e) {
  console.error('error reading file', e);
  process.exit(2);
}
const counts = {
  openBrace: (s.match(/\{/g) || []).length,
  closeBrace: (s.match(/\}/g) || []).length,
  openParen: (s.match(/\(/g) || []).length,
  closeParen: (s.match(/\)/g) || []).length,
  openBracket: (s.match(/\[/g) || []).length,
  closeBracket: (s.match(/\]/g) || []).length,
  backtick: (s.match(/`/g) || []).length,
  singleQuote: (s.match(/'/g) || []).length,
  doubleQuote: (s.match(/"/g) || []).length,
};
console.log('counts:', JSON.stringify(counts, null, 2));
console.log('\n--- last 400 chars ---\n');
console.log(s.slice(-400));
process.exit(0);
