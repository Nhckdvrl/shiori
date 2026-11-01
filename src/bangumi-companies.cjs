const {norm}=require('./title-normalization.cjs');
const DEVELOPER=/^(?:开发|开发商|开发会社|游戏开发|開発|開発元|制作公司)$/;
const BRAND=/^(?:品牌|ブランド)$/;
const PUBLISHER=/^(?:发行|发行商|发行会社|発行|発売|発売元|販売|販売元)$/;
const values=value=>Array.isArray(value)?value.flatMap(x=>typeof x==='string'?x:x?.v?[x.v]:[]):typeof value==='string'?[value]:[];
const unique=list=>[...new Set(list.filter(Boolean))];
const clean=name=>String(name||'').normalize('NFKC').replace(/\([^)]*\)/g,'').trim();
function extractBangumiCompanies(subject,persons=[],profiles=new Map()){
  if(subject.type!==4)throw new Error('会社资料只能来自 Bangumi 游戏条目');
  const relevant=persons.filter(p=>[2,3].includes(p.type)&&(DEVELOPER.test(p.relation)||BRAND.test(p.relation)||PUBLISHER.test(p.relation)));
  const entities=[];
  for(const p of relevant){
    let entity=entities.find(x=>x.id===p.id);
    if(!entity){
      const profile=profiles.get(p.id),name=profile?.name||p.name;
      const aliases=unique([name,p.name,...(profile?.infobox||[]).filter(x=>/^(?:别名|简体中文名|中文名|英文名)$/.test(x.key)).flatMap(x=>values(x.value))]);
      entity={id:p.id,name,type:p.type,aliases,roles:[],url:`https://bgm.tv/person/${p.id}`};entities.push(entity);
    }
    if(!entity.roles.includes(p.relation))entity.roles.push(p.relation);
  }
  const claims=new Map();
  for(const e of entities)for(const alias of e.aliases){const key=norm(alias);if(!claims.has(key))claims.set(key,new Set());claims.get(key).add(e.name);}
  const resolve=value=>{const name=clean(value),names=claims.get(norm(name));return names?.size===1?[...names][0]:name;};
  const parse=value=>{
    if(claims.get(norm(value))?.size===1)return [resolve(value)];
    const parts=[];let depth=0,part='';
    for(const char of String(value).normalize('NFKC')){if(char==='(')depth++;if(char===')')depth=Math.max(0,depth-1);if(!depth&&/[、，,;；\n/]/.test(char)){parts.push(part);part='';}else part+=char;}parts.push(part);
    return parts.map(resolve).filter(name=>name&&!/^(?:他|ほか|不明|unknown|etc)$/i.test(name));
  };
  const list=role=>unique([...(subject.infobox||[]).filter(x=>role.test(x.key)).flatMap(x=>values(x.value)).flatMap(parse),...entities.filter(e=>e.roles.some(r=>role.test(r))).map(e=>e.name)]);
  return {version:1,source:'Bangumi',subjectId:subject.id,url:`https://bgm.tv/subject/${subject.id}`,developers:list(DEVELOPER),brands:list(BRAND),publishers:list(PUBLISHER),entities,
    subjectTags:(subject.tags||[]).map(t=>t.name).filter(Boolean),rawInfobox:(subject.infobox||[]).filter(x=>DEVELOPER.test(x.key)||BRAND.test(x.key)||PUBLISHER.test(x.key))};
}
module.exports={DEVELOPER,BRAND,PUBLISHER,extractBangumiCompanies};
