const {norm}=require('./title-normalization.cjs');
const PREFERRED={
 '丸戸史明':'丸户史明','丸户史明':'丸户史明','田中ロミオ':'田中罗密欧','田中罗密欧':'田中罗密欧',
 '瀬戸口廉也':'濑户口廉也','濑户口廉也':'濑户口廉也','すかぢ':'SCA-自','SCA-自':'SCA-自'
};
const preferred=new Map(Object.entries(PREFERRED).map(([alias,name])=>[norm(alias),name]));
const rawWriters=g=>[...(g.folderTags?.writers||[]),...(g.metadata?.writers||[]),...(g.fanMetadata?.writers||[]),...(g.userWriters||[])];
const creditText=value=>String(value||'').normalize('NFKC').replace(/[\[【]/g,'(').replace(/[\]】]/g,')');
function cleanName(value){
 let name=String(value||'').normalize('NFKC').trim().replace(/^[、,，;；\s]+|[、,，;；\s]+$/g,'').replace(/\s+/g,' ');
 if(/[\u3040-\u30ff\u3400-\u9fff]/.test(name))name=name.replace(/\s/g,'');
 return preferred.get(norm(name))||name;
}
// Older metadata split commas inside parentheses. Rejoining the original
// fields first also repairs these records without rewriting the source credits.
function splitCredits(values){
 const result=[];let text='',depth=0;
 for(const c of creditText(values.filter(v=>typeof v==='string').join('、'))){
  if('([{'.includes(c))depth++;
  if(')]}'.includes(c))depth=Math.max(0,depth-1);
  if(depth===0&&/[、,，;；\n]/.test(c)){if(text.trim())result.push(text.trim());text='';}else text+=c;
 }
 if(text.trim())result.push(text.trim());return result;
}
function parseCredit(value){
 const raw=creditText(value).trim(),opening=raw.indexOf('(');
 const base=cleanName(opening<0?raw:raw.slice(0,opening));
 const inside=opening<0?'':raw.slice(opening+1).replace(/\)\s*$/,'');
 if(/^(?:チーム|team\b|团队)/i.test(base)&&inside)return splitCredits([inside]).flatMap(parseCredit);
 if(!base||/^(?:他|ほか|その他|不明|未知|unknown|etc\.?|[.·…—-]+)$/i.test(base))return [];
 const aliases=[raw];
 // A parenthetical credit can be a pen name, a role, company or route note.
 // Only a single name without credit annotations is treated as an alias.
 if(inside&&!/[、,，;；()/]/.test(inside)&&inside.length<=25&&!/主笔|主筆|担当|协力|協力|脚本|劇本|剧本|シナリオ|ルート|パート|序章|全体|追加|合同会社|株式会社|有限会社|production|^team\b|^RB\b/i.test(inside))aliases.push(cleanName(inside));
 return [{name:base,aliases}];
}
function createAuthorIndex(games){
 const entries=games.map(g=>[g.id,splitCredits(rawWriters(g)).flatMap(parseCredit)]);
 const claims=new Map();
 for(const [,people] of entries)for(const p of people){
  const key=norm(p.name);if(!claims.has(key))claims.set(key,new Set());claims.get(key).add(key);
  for(const alias of p.aliases.slice(1)){const a=norm(alias);if(a&&a!==key){if(!claims.has(a))claims.set(a,new Set());claims.get(a).add(key);}}
 }
 // Exact standalone mentions do not negate an explicit alias. Conflicting
 // claims from two different people are left separate, never fuzzy-merged.
 const roots=new Map();
 for(const [key,targets] of claims){const external=[...targets].filter(t=>t!==key);if(external.length===1)roots.set(key,external[0]);}
 const rootOf=key=>{const seen=new Set();while(roots.has(key)&&!seen.has(key)){seen.add(key);key=roots.get(key);}return key;};
 const people=new Map(),byGame=new Map();
 for(const [id,credits] of entries){
  const keys=[];
  for(const p of credits){const key=rootOf(norm(p.name));keys.push(key);
   if(!people.has(key))people.set(key,{name:preferred.get(key)||p.name,aliases:new Set()});
   const person=people.get(key);if(norm(p.name)===key)person.name=preferred.get(key)||p.name;
   for(const alias of [p.name,...p.aliases])person.aliases.add(alias);
  }
  byGame.set(id,[...new Set(keys)]);
 }
 const resolve=value=>{
  const parsed=splitCredits([value]).flatMap(parseCredit)[0];if(!parsed)return '';
  const key=rootOf(norm(parsed.name));return people.get(key)?.name||cleanName(parsed.name);
 };
 return {forGame:id=>(byGame.get(id)||[]).map(key=>people.get(key).name),resolve,
  authors:[...people.values()].map(p=>({name:p.name,aliases:[...p.aliases].sort()})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))};
}
module.exports={createAuthorIndex,cleanName,splitCredits,parseCredit,rawWriters};
