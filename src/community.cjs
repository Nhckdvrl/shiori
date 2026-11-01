const BANGUMI_HOSTS=new Set(['bgm.tv','bangumi.tv','chii.in']);
function subjectReference(input){
  const text=String(input||'').trim();
  if(/^bgm:\d+$/i.test(text))return {provider:'Bangumi',id:text.slice(4)};
  if(/^v\d+$/i.test(text))return {provider:'VNDB',id:text.toLowerCase()};
  let url;try{url=new URL(text);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  const bgm=url.pathname.match(/^\/subject\/(\d+)\/?$/);
  if(BANGUMI_HOSTS.has(url.hostname)&&bgm)return {provider:'Bangumi',id:bgm[1]};
  const vn=url.pathname.match(/^\/(v\d+)\/?$/);
  if(url.hostname==='vndb.org'&&vn)return {provider:'VNDB',id:vn[1]};
  return null;
}
function canonicalSubject(input,provider){
  const ref=subjectReference(input);if(!ref||ref.provider!==provider)return null;
  return provider==='Bangumi'?`https://bgm.tv/subject/${ref.id}`:`https://vndb.org/${ref.id}`;
}
function canonicalFan(input){
  try{const u=new URL(input),m=u.pathname.match(/^\/subjects\/(\d+)\/?$/);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:www\.)?2dfan\.(?:com|org)$/.test(u.hostname)&&m)return `https://${u.hostname.replace(/^www\./,'')}/subjects/${m[1]}`;}catch{}
  return null;
}
function communityLinks(game){
  const meta=game.metadata||{},name=meta.originalTitle||game.customTitle||game.title||'',query=encodeURIComponent(name);
  const bangumi=canonicalSubject(game.bangumiUrl,'Bangumi')||canonicalSubject(meta.source==='Bangumi'?meta.url:meta.bangumiUrl,'Bangumi');
  const vndb=canonicalSubject(game.vndbUrl,'VNDB')||canonicalSubject(meta.source==='VNDB'?meta.url:meta.vndbUrl,'VNDB');
  const fan=canonicalFan(game.fanUrl)||canonicalFan(game.autoFanUrl);
  return {bangumi:{url:bangumi||`https://bgm.tv/subject_search/${query}?cat=4`,matched:!!bangumi},vndb:{url:vndb||`https://vndb.org/v?sq=${query}`,matched:!!vndb},fan:{url:fan||`https://2dfan.com/search?keyword=${query}`,matched:!!fan}};
}
module.exports={subjectReference,canonicalSubject,canonicalFan,communityLinks};
