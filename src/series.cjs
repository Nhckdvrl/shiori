const {norm}=require('./title-normalization.cjs');
const {inferTags}=require('./scanner.cjs');
// Title families, not subject IDs: these also work before metadata is fetched.
const FAMILIES=[
 ['废村少女',/廃村少女|废村少女|haison/i],['9-nine-',/9[\s_-]*nine/i],
 ['美少女万华镜',/美少女万[华華]鏡|美少女万华镜|bishoujo\s*mangekyou/i],
 ['末世孤雄',/末世孤雄|ゾンビのあふれた世界|I Walk Among Zombies|行尸走肉横行的世界只有我不被袭击/i],
 ['苍之彼方的四重奏',/Aokana|蒼の彼方のフォーリズム|苍之彼方的四重奏/i],
 ['WHITE ALBUM2',/WHITE\s*ALBUM\s*2|白色相[簿薄]2/i],['ef',/^ef\s*[-*]|ef - a fairy tale/i],
 ['Rewrite',/\bRewrite\b/i],['甜蜜女友',/アマカノ|甜蜜女友/i],
 ['大图书馆的牧羊人',/大[図图]書館の羊飼い|大图书馆的牧羊人/i],
 ['フレラバ',/フレラバ|Fureraba/i],['妻中蜜',/妻みぐい|妻中蜜|Tsumamigui/i],
 ['兰斯',/ランス|兰斯|\bRance\b/i],['灰色',/グリザイア|Grisaia|灰色的(?:果实|迷宫|乐园|旋律)/i]
];
function titleTexts(g){return [g.title,g.customTitle,g.metadata?.title,g.metadata?.originalTitle,...(g.folderTags?.folders||[])].filter(Boolean);}
function canonicalSeries(name){const clean=String(name||'').normalize('NFKC').trim();return FAMILIES.find(([label,pattern])=>norm(label)===norm(clean)||pattern.test(clean))?.[0]||clean;}
function createSeriesIndex(games){
 const byGame=new Map(),folderGroups=new Map();
 const authorNames=require('./authors.cjs').createAuthorIndex(games).authors.flatMap(a=>[a.name,...a.aliases]);
 const companies=games.flatMap(g=>[...(g.bangumiCompanyCredits?.developers||[]),...(g.bangumiCompanyCredits?.brands||[]),...(g.bangumiCompanyCredits?.entities||[]).flatMap(e=>e.aliases||[]),...(g.metadata?.companies||[]),...(g.metadata?.companyCredits?.developers||[]),...(g.userCompanies||[]),...(g.folderTags?.companies||[])]);
 const identities=new Set([...authorNames,...companies].map(norm));
 for(const g of games){
  const automatic=[...(g.metadata?.series||[])];
  for(const [label,pattern] of FAMILIES)if(titleTexts(g).some(text=>pattern.test(text)))automatic.push(label);
  byGame.set(g.id,automatic.map(canonicalSeries));
  for(const folder of new Set(g.folderTags?.folders||[])){
   const classification=inferTags([folder,'game']);
   if(classification.companies.length||classification.writers.length||identities.has(norm(folder))||/^(?:game|games|galgame|合集|收藏|已通关|未开始|PC|汉化|中文|日文|新游戏)$/i.test(folder))continue;
   if(!folderGroups.has(folder))folderGroups.set(folder,[]);folderGroups.get(folder).push(g.id);
  }
 }
 for(const [folder,ids] of folderGroups)if(ids.length>=2){
  // A folder such as 白二 or 苍彼 already groups a known family. Use that
  // family's name once instead of showing a duplicate folder-shaped series.
  const shared=byGame.get(ids[0]).filter(label=>ids.every(id=>byGame.get(id).includes(label)));
  if(!shared.length)for(const id of ids)byGame.get(id).push(canonicalSeries(folder));
 }
 return new Map(games.map(g=>[g.id,[...new Set([...(g.autoSeries===false?[]:byGame.get(g.id)),...(g.userSeries||[]).map(canonicalSeries)])].filter(Boolean)]));
}
module.exports={createSeriesIndex,canonicalSeries};
