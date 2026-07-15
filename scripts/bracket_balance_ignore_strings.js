const fs = require('fs');
const p='d:\\Mobil-Uygulamalar\\Kamp_Defterim-Development\\app\\(tabs)\\index.tsx';
const s=fs.readFileSync(p,'utf8');
let inSingle=false, inDouble=false, inTemplate=false, inLineComment=false, inBlockComment=false, prev='';
let openBracketCount=0, closeBracketCount=0;
for(let i=0;i<s.length;i++){
  const ch=s[i];
  const next=s[i+1]||'';
  if(inLineComment){
    if(ch==='\n') inLineComment=false;
    prev=ch; continue;
  }
  if(inBlockComment){
    if(prev==='*' && ch==='/') inBlockComment=false;
    prev=ch; continue;
  }
  if(!inSingle && !inDouble && !inTemplate){
    if(ch==='/' && next==='/') { inLineComment=true; i++; prev=''; continue; }
    if(ch==='/' && next==='*') { inBlockComment=true; i++; prev=''; continue; }
  }
  if(!inDouble && !inTemplate && ch==="'" && !inSingle){ inSingle=true; prev=ch; continue; }
  else if(inSingle && ch==="'" && prev!=='\\'){ inSingle=false; prev=ch; continue; }
  if(!inSingle && !inTemplate && ch==='"' && !inDouble){ inDouble=true; prev=ch; continue; }
  else if(inDouble && ch==='"' && prev!=='\\'){ inDouble=false; prev=ch; continue; }
  if(!inSingle && !inDouble && ch==='`' && !inTemplate){ inTemplate=true; prev=ch; continue; }
  else if(inTemplate && ch==='`' && prev!=='\\'){ inTemplate=false; prev=ch; continue; }
  // count only when not inside any string/template/comment
  if(!inSingle && !inDouble && !inTemplate && !inLineComment && !inBlockComment){
    if(ch==='[') openBracketCount++;
    if(ch===']') closeBracketCount++;
  }
  prev=ch;
}
console.log('openBracketCount=',openBracketCount,'closeBracketCount=',closeBracketCount,'diff=',openBracketCount-closeBracketCount);
