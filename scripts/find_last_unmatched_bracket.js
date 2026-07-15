const fs=require('fs');
const path='d:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s=fs.readFileSync(path,'utf8');
let lastUnmatchedIndex=-1;
for(let i=s.length-1;i>=0;i--){
  if(s[i]==='['){
    // from i to end, check if more [ than ]
    const sub=s.slice(i);
    const o=(sub.match(/\[/g)||[]).length;
    const c=(sub.match(/\]/g)||[]).length;
    if(o>c){ lastUnmatchedIndex=i; break; }
  }
}
console.log('lastUnmatchedIndex=', lastUnmatchedIndex);
if(lastUnmatchedIndex!=-1){
  const before=s.slice(Math.max(0,lastUnmatchedIndex-200), lastUnmatchedIndex+200);
  // compute line number
  const linesBefore=s.slice(0,lastUnmatchedIndex).split(/\r?\n/);
  const lineNum=linesBefore.length;
  console.log('lineNum=',lineNum);
  console.log('context around lastUnmatched (line '+lineNum+'):\n', before);
}
