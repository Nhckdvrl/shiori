const {norm}=require('./title-normalization.cjs');
const GROUPS=[
 ['ALICESOFT','アリスソフト','Alice Soft'],['AUGUST','オーガスト'],['Escu:de','エスクード','Escude'],
 ['柚子社','ゆずソフト','Yuzusoft'],['Palette','ぱれっと','调色板'],['Purple software','パープルソフトウェア','紫社'],
 ['Nitroplus','ニトロプラス','Nitro+'],['KID','キッド'],['Liar-soft','ライアーソフト'],
 ['Frontwing','Front Wing','フロントウイング'],['TYPE-MOON','タイプムーン'],['Key','キー'],
 ['枕','Makura','枕社'],['ケロQ','KeroQ'],['elf','エルフ'],['あざらしそふと','Azarashi Soft'],
 ['ωstar','Omega Star'],['hibiki works'],['HOOKSOFT'],['SMEE'],['minori'],['sprite'],
 ['工画堂','KOGADO','工画堂スタジオ'],['STING','株式会社スティング'],
 ['Fournine','株式会社フォーナイン'],['VISUAL ARTS','VisualArt’s','ビジュアルアーツ']
];
const clean=value=>String(value||'').normalize('NFKC').replace(/\([^)]*\)/g,'').replace(/^[、,，;；\s]+|[、,，;；\s]+$/g,'').replace(/\s+/g,' ').trim();
const key=value=>norm(clean(value).replace(/^(?:株式会社|有限会社)\s*/,'').replace(/[\s,]+(?:Co[.,]*\s*)?(?:Ltd\.?|Limited|Inc\.?|Incorporated)$/i,''));
const aliases=new Map(GROUPS.flatMap(([name,...rest])=>[name,...rest].map(alias=>[key(alias),name])));
function canonicalCompany(value){const name=clean(value);if(!name||/^(?:他|ほか|不明|unknown|etc|[.·…—-]+)$/i.test(name))return '';return aliases.get(key(name))||name;}
function createCompanyIndex(games){
 const labels=new Map(),entities=new Map(),claims=new Map(),primary=new Map();
 for(const game of games)for(const entity of game.bangumiCompanyCredits?.entities||[]){
  entities.set(entity.id,entity);
  const exact=entity.name.normalize('NFKC').trim();if(!primary.has(exact))primary.set(exact,new Set());primary.get(exact).add(entity.id);
  for(const alias of [entity.name,...entity.aliases]){const k=key(alias);if(!claims.has(k))claims.set(k,new Set());claims.get(k).add(entity.id);}
 }
 const known=value=>{const direct=primary.get(String(value||'').normalize('NFKC').trim()),ids=direct?.size===1?direct:claims.get(key(value));return ids?.size===1?entities.get([...ids][0]).name:null;};
 for(const game of games)for(const raw of [...(game.bangumiCompanyCredits?.developers||[]),...(game.bangumiCompanyCredits?.brands||[]),...(game.metadata?.companyCredits?.developers||game.metadata?.companies||[]),...(game.userCompanies||[]),...(game.folderTags?.companies||[])]){
  const name=known(raw)||canonicalCompany(raw);if(name&&!labels.has(key(name)))labels.set(key(name),name);
 }
 return {resolve:value=>known(value)||(()=>{const name=canonicalCompany(value);return name?(labels.get(key(name))||name):'';})(),entities:[...entities.values()]};
}
function companyTags(game,resolve=canonicalCompany){
 const unique=values=>[...new Set(values.map(resolve).filter(Boolean))];
 const bgm=game.bangumiCompanyCredits;
 const hasBangumi=bgm?.source==='Bangumi'&&(bgm.developers?.length||bgm.brands?.length);
 const checkedBangumiOnly=bgm?.complete&&game.metadata?.source==='Bangumi';
 const metadata=unique(hasBangumi||checkedBangumiOnly?[...(bgm.developers||[]),...(bgm.brands||[])]:game.metadata?.companyCredits?.developers||game.metadata?.companies||[]);
 const folder=unique(game.folderTags?.companies||[]);
 // A broad filing folder such as 枕社 is kept under 目录. It must not relabel
 // a game whose actual developer is another brand, e.g. ケロQ / プチケロQ.
 let verified=metadata.length?metadata:folder;
 // VNDB's aggregate developer list includes ports and remakes. An exact
 // installed-brand match is a stronger local hint than those extra companies.
 if(!hasBangumi&&game.metadata?.source==='VNDB'&&!game.metadata.companyCredits&&folder.some(c=>metadata.includes(c)))verified=metadata.filter(c=>folder.includes(c));
 return unique([...verified,...(game.userCompanies||[])]);
}
function companySource(game){const bgm=game.bangumiCompanyCredits;if(bgm?.developers?.length||bgm?.brands?.length)return {source:'Bangumi',url:bgm.url,publishers:bgm.publishers||[]};if(game.metadata?.companies?.length&&!(bgm?.complete&&game.metadata.source==='Bangumi'))return {source:game.metadata.companyCredits?.source||game.metadata.source||'资料源',url:game.metadata.companyCredits?.url||game.metadata.url,publishers:game.metadata.companyCredits?.publishers||[]};return {source:'目录推测',url:bgm?.url||null,publishers:bgm?.publishers||[]};}
function companyTagSource(game,name,resolve=canonicalCompany){
 const includes=list=>(list||[]).some(value=>resolve(value)===name),bgm=game.bangumiCompanyCredits;
 if(bgm&&(includes(bgm.developers)||includes(bgm.brands)))return {source:'Bangumi',url:bgm.url};
 if(includes(game.userCompanies))return {source:'手动补充',url:null};
 if(!(bgm?.complete&&game.metadata?.source==='Bangumi')&&includes(game.metadata?.companyCredits?.developers||game.metadata?.companies))return {source:game.metadata?.companyCredits?.source||game.metadata?.source||'资料源',url:game.metadata?.companyCredits?.url||game.metadata?.url};
 return {source:'目录推测',url:null};
}
module.exports={canonicalCompany,companyTags,createCompanyIndex,companySource,companyTagSource};
