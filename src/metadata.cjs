const fs = require('node:fs/promises');
const path = require('node:path');
const {UNIQUE}=require('./scanner.cjs');
const crypto=require('node:crypto');
const {subjectReference,canonicalSubject}=require('./community.cjs');
const {extractBangumiCompanies,DEVELOPER,BRAND,PUBLISHER}=require('./bangumi-companies.cjs');
const {norm,textForm,cleanQuery,firstInstallment,ordinal,shortTitles,queryAlternatives}=require('./title-normalization.cjs');
function similarity(a,b) {
  a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;
  // Containment alone is insufficient: sequels and fan discs often share a title.
  if(a.includes(b)||b.includes(a)) return Math.min(a.length,b.length)/Math.max(a.length,b.length)*0.92;
  const grams=s=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
  const x=grams(a),y=grams(b);const n=[...x].filter(g=>y.has(g)).length;return 2*n/(x.size+y.size||1);
}
const ALIASES={'C+C':'CROSS†CHANNEL',qi3:'妻みぐい3',xiajisheng2:'下級生2',KANOFD:'彼女×彼女×彼女 ドキドキフルスロットル！','素晴日':'素晴らしき日々','俺翼':'俺たちに翼はない','多娜多娜ver1.1':'ドーナドーナ','天使不在的12月（没有天使的12月）':'天使のいない12月','白日梦的构想图（白昼夢の青写真）':'白昼夢の青写真'};
const flatten=v=>Array.isArray(v)?v.flatMap(x=>typeof x==='string'?x:x.v||[]):[String(v||'')];
function fields(item,keys) {return UNIQUE((item.infobox||[]).filter(x=>keys.test(x.key)).flatMap(x=>flatten(x.value)).flatMap(v=>v.split(/、|，|,|\s*\/\s*/)).map(x=>x.trim()).filter(Boolean));}
function candidateScore(game,item,query) {
  const names=[item.name,item.name_cn];
  const aliases=[...(item.infobox||[]).filter(x=>x.key==='别名').flatMap(x=>flatten(x.value)),...(item.vnAliases||[])];
  if(item.vnTitles)names.push(...item.vnTitles);
  const shortNames=names.flatMap(shortTitles);
  // Parent folders may be series names, never evidence that an individual release matches.
  const titles=ALIASES[game.title]?[query,ALIASES[game.title]]:[game.title,query];
  let score=Math.max(...titles.flatMap(t=>names.map(n=>firstInstallment(t)===firstInstallment(n)?1:similarity(t,n))),...titles.flatMap(t=>aliases.map(n=>similarity(t,n)*.92)),...titles.flatMap(t=>shortNames.map(n=>similarity(t,n)*.9)));
  const baseScore=score;
  const platform=fields(item,/^平台$/).join(' ');
  if(game.kind==='windows' && platform && !/PC|Windows|Win|电脑/i.test(platform))score-=0.15;
  if(game.kind==='rom' && /\.(?:xci|nsp)$/i.test(game.launchPath||'') && platform && !/Switch|Nintendo\s*Switch|^NS$/i.test(platform))score-=0.2;
  const companyNames=fields(item,/^(?:开发|开发商|开发会社|品牌|制作公司)$/).concat(item.vnCompanies||[]);
  const companyNorm=s=>norm(s).replace(/株式会社|有限会社|inc|ltd/g,'').replace(/ゆずソフト|yuzusoft/g,'柚子社').replace(/オーガスト/g,'august').replace(/makura/g,'枕').replace(/ぱれっと/g,'palette').replace(/アリスソフト/g,'alicesoft').replace(/エスクード/g,'escude').replace(/ライアーソフト/g,'liarsoft').replace(/パープルソフトウェア/g,'purplesoftware').replace(/ニトロプラス|nitroplus|nitro\+/g,'nitroplus').replace(/エルフ/g,'elf');
  const expected=game.folderTags?.companies||[];
  if(expected.length){
    const same=companyNames.some(a=>expected.some(b=>{const x=companyNorm(a),y=companyNorm(b);return x===y||(Math.min(x.length,y.length)>=4&&(x.includes(y)||y.includes(x)));}));
    if(same){
      if(baseScore>=.94)score+=.05;
      else if(titles.some(t=>aliases.some(a=>norm(t)===norm(a))) && names.some(n=>norm(n).length>=Math.max(...titles.map(t=>norm(t).length))*.6))score+=.08;
    }else if(Math.max(...titles.map(t=>norm(t).length))<=6||baseScore<1)score-=companyNames.length?.25:.15;
  }
  const context=norm([game.title,query,...(game.candidates||[]).map(c=>c.name)].join(' '));
  const releaseContext=[game.title,query,game.executableInfo?.productName,game.executableInfo?.description,...(game.candidates||[]).map(c=>c.name)].filter(Boolean).join(' ');
  for(const marker of ['R','HD','RE']){
    const token=new RegExp('(?:^|[\\s._-])'+marker+'(?=$|[\\s._-])','i');
    if(names.some(name=>token.test(String(name||'')))&&!token.test(releaseContext))score-=.3;
  }
  for(const pattern of [/extra\s*\d*/ig,/\b(?:fandisc|fd|special|prelude|prologue|remaster|remake|gaiden|bangai)\b/ig,/体験版|體驗版|trial|demo|ミニファンディスク|外伝|外传|番外/ig]){
    const flags=String(item.name||'').match(pattern)||[];if(flags.some(flag=>!context.includes(norm(flag))))score-=.14;
  }
  const parent=(game.relativePath||'').split(/[\\/]/).at(-2);
  const expectedOrdinal=ordinal(/fd\d+/i.test(game.title)&&parent?parent:game.title);
  // Alternate search queries locate candidates; they must never erase the
  // installment written on the actual folder. Include official aliases because
  // many series number their releases only in the alias, not the main title.
  const candidateOrdinals=[...names,...aliases].map(ordinal).filter(x=>x!==null);
  if(expectedOrdinal && (candidateOrdinals.length?!candidateOrdinals.includes(expectedOrdinal):expectedOrdinal!=='1'))score-=.4;
  if(item.provider==='VNDB' && score>=.92 && score<.94 && titles.some(t=>(item.vnAliases||[]).some(a=>norm(t)===norm(a))) && names.some(n=>norm(n).length>=Math.max(...titles.map(t=>norm(t).length))*.6))score=.98;
  return score;
}
class Metadata {
  constructor(fetcher,cache,getToken=()=>null) {this.fetch=fetcher;this.cache=cache;this.getToken=getToken;}
  async json(url,options={}) {
    const cacheEnabled=options.cache!=='no-store'&&(/^https:\/\/api\.bgm\.tv\/v0\/(?:subjects|search|persons)\//.test(url)||/^https:\/\/api\.vndb\.org\/kana\/(?:vn|release)$/.test(url));
    const cacheDir=path.join(this.cache,'..','metadata-cache');
    const key=crypto.createHash('sha256').update(url+'\n'+(options.method||'GET')+'\n'+(options.body||'')+'\n'+!!this.getToken()).digest('hex');
    const cacheFile=path.join(cacheDir,key+'.json');
    if(cacheEnabled)try{const stat=await fs.stat(cacheFile);if(Date.now()-stat.mtimeMs<86400000)return JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch{}
    if(new URL(url).hostname==='api.vndb.org'){const slot=Math.max(Date.now(),this.vndbNextAt||0);this.vndbNextAt=slot+1600;if(slot>Date.now())await new Promise(r=>setTimeout(r,slot-Date.now()));}
    const token=this.getToken();
    const r=await this.fetch(url,{...options,signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Shiori/0.5.0 (Windows; local visual novel library)','Content-Type':'application/json',...(token && new URL(url).hostname==='api.bgm.tv'?{Authorization:`Bearer ${token}`} :{}),...options.headers}});
    if(!r.ok)throw new Error(`资料源返回 ${r.status}，请稍后重试`);const data=await r.json();if(cacheEnabled)try{await fs.mkdir(cacheDir,{recursive:true});await fs.writeFile(cacheFile,JSON.stringify(data),'utf8');}catch{}return data;
  }
  async search(game,query){return (await this.searchDetailed(game,query)).items;}
  async searchDetailed(game,query,{provider='all',manual=false}={}) {
    if(!['all','Bangumi','VNDB'].includes(provider))throw new Error('请选择 Bangumi 或 VNDB 资料源');
    const reference=subjectReference(query);
    const vnCandidate=(x,q)=>{
      const names=[x.title,x.alttitle,...(x.titles||[]).map(t=>t.title)];
      const item={id:x.id,type:4,name:x.alttitle||x.title,name_cn:x.titles?.find(t=>t.lang==='zh-Hans')?.title||'',date:x.released,provider:'VNDB',vnTitles:names,vnAliases:x.aliases||[],vnCompanies:(x.developers||[]).flatMap(d=>[d.name,d.original].filter(Boolean)),images:{small:x.image?.url},rating:x.rating?{score:x.rating/10,total:x.votecount||0}:null};
      item.match=candidateScore(game,item,q);return item;
    };
    const vnFields='title,alttitle,aliases,titles{title,lang},image.url,released,rating,votecount,developers{name,original}';
    if(reference){
      if(reference.provider==='Bangumi'){
        const item=await this.json(`https://api.bgm.tv/v0/subjects/${reference.id}`);
        if(item.type!==4)throw new Error('这个 Bangumi 条目不是游戏，请选择游戏信息页');
        return {items:[{...item,provider:'Bangumi',match:candidateScore(game,item,game.title)}],warnings:[]};
      }
      const result=await this.json('https://api.vndb.org/kana/vn',{method:'POST',body:JSON.stringify({filters:['id','=',reference.id],fields:vnFields,results:1})});
      if(!result.results?.length)throw new Error('没有找到这个 VNDB 条目');
      return {items:result.results.map(x=>vnCandidate(x,game.title)),warnings:[]};
    }
    query=cleanQuery(query?.trim()||ALIASES[game.title]||game.title);
    if(/^[A-Za-z]/.test(query))query=query.replace(/\s*[（(][^）)]*[\u3400-\u9fff][^）)]*[）)]\s*$/,'').trim();
    query=query.replace(/\s*(?:ver(?:sion)?\.?|版本|v)\s*\d+(?:\.\d+)+$/i,'').trim();
    if(!query)throw new Error('请输入游戏名或作品信息页链接');
    let items=[];const warnings=[];let succeeded=0;
    if(provider!=='VNDB')try{
      const result=await this.json('https://api.bgm.tv/v0/search/subjects?limit=20',{method:'POST',body:JSON.stringify({keyword:query,sort:'match',filter:{type:[4]}})});
      items=(result.data||[]).filter(x=>x.type===4).map(x=>({...x,provider:'Bangumi',match:candidateScore(game,x,query)})).sort((a,b)=>b.match-a.match);succeeded++;
    }catch(error){warnings.push('Bangumi：'+error.message);}
    if(provider==='VNDB'||(provider==='all'&&(manual||!items.length||items[0].match<.94||(items[1]&&items[0].match-items[1].match<.04)))){
      try{
        const company=manual?null:game.folderTags?.companies?.[0];
        const vn=await this.json('https://api.vndb.org/kana/vn',{method:'POST',body:JSON.stringify({filters:company?['and',['search','=',query],['developer','=', ['search','=',company]]]:['search','=',query],fields:vnFields,results:manual?20:7})});
        items.push(...(vn.results||[]).map(x=>vnCandidate(x,query)));succeeded++;
      }catch(error){warnings.push('VNDB：'+error.message);}
    }
    if(!succeeded)throw new Error(warnings.join('；'));
    // Agreement on the complete original title in two game-only databases can
    // validate a shortened display name, without borrowing a parent series name.
    for(const vn of items.filter(x=>x.provider==='VNDB'&&x.match>=.88)){
      const peers=items.filter(x=>x.provider==='Bangumi'&&norm(x.name)===norm(vn.name));
      for(const bgm of peers){if(vn.match<.94&&bgm.match<.94){vn.match=.95;bgm.match=.95;vn.corroborated=true;bgm.corroborated=true;}}
      for(const bgm of items.filter(x=>x.provider==='Bangumi'&&x.match>=.88)){
        const links=(bgm.infobox||[]).filter(x=>/链接|link/i.test(x.key)).flatMap(x=>flatten(x.value));
        if(vn.match>=.94&&links.some(url=>new RegExp('^https?://(?:www\\.)?vndb\\.org/'+vn.id+'/?$').test(url))) {bgm.match=Math.max(bgm.match,vn.match+.08);bgm.corroborated=true;}
      }
    }
    return {items:items.sort((a,b)=>b.match-a.match),warnings};
  }
  async bangumiCompanies(game,force=false){
    if(!game.metadata)return null;
    const options=force?{cache:'no-store'}:{};
    let id=game.metadata.source==='Bangumi'?game.metadata.id:subjectReference(game.bangumiUrl||game.metadata.bangumiUrl)?.id;
    if(!id){
      const name=game.metadata.originalTitle||game.metadata.title;
      if(!name)return null;
      const result=await this.json('https://api.bgm.tv/v0/search/subjects?limit=10',{...options,method:'POST',body:JSON.stringify({keyword:name,sort:'match',filter:{type:[4]}})});
      const context={...game,title:name,folderTags:{...game.folderTags,companies:[]}};
      const matches=(result.data||[]).filter(x=>x.type===4).map(item=>({item,score:candidateScore(context,item,name)})).sort((a,b)=>b.score-a.score);
      if(matches[0]?.score<.94||!matches[0]||(matches[1]&&matches[0].score-matches[1].score<.04))return null;
      id=matches[0].item.id;
    }
    const subject=await this.json(`https://api.bgm.tv/v0/subjects/${id}`,options);
    if(subject.type!==4)throw new Error('会社资料对应的 Bangumi 条目不是游戏');
    const people=await this.json(`https://api.bgm.tv/v0/subjects/${id}/persons`,options);
    const persons=Array.isArray(people)?people:[],profiles=new Map();
    for(const person of persons.filter(p=>[2,3].includes(p.type)&&(DEVELOPER.test(p.relation)||BRAND.test(p.relation)||PUBLISHER.test(p.relation)))){
      if(profiles.has(person.id))continue;
      try{const profile=await this.json(`https://api.bgm.tv/v0/persons/${person.id}`,options);if([2,3].includes(profile.type))profiles.set(person.id,profile);}catch{}
    }
    return {...extractBangumiCompanies(subject,persons,profiles),complete:true,checkedAt:new Date().toISOString()};
  }
  async cacheCover(game,data,url){
    if(!url)return;try{const r=await this.fetch(url,{signal:AbortSignal.timeout(20000)});if(r.ok){const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length<12*1024*1024&&/^image\//.test(r.headers.get('content-type')||'')){await fs.mkdir(this.cache,{recursive:true});const file=path.join(this.cache,`${game.id}.jpg`);await fs.writeFile(file,bytes);data.cover=file;}}}catch{}
  }
  async findFan(game,names){
    try{
      const q=names.find(Boolean);if(!q)return;
      const r=await this.fetch('https://2dfan.com/search?keyword='+encodeURIComponent(q),{signal:AbortSignal.timeout(15000)});if(!r.ok)return;
      const html=await r.text(),matches=[];
      for(const m of html.matchAll(/<h3\b[^>]*class="subject-card-title"[^>]*>([\s\S]*?)<\/h3>/g)){
        const a=m[1].match(/href="\/subjects\/(\d+)"[^>]*>([\s\S]*?)<\/a>/);if(!a)continue;
        const name=a[2].replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
        if(names.some(n=>norm(n)===norm(name)))matches.push({id:a[1],name});
      }
      if(matches.length===1){game.autoFanUrl=`https://2dfan.com/subjects/${matches[0].id}`;game.fanMatch={title:matches[0].name,checkedAt:new Date().toISOString(),method:'exact-title'};await this.fanCredits(game);}
    }catch{}
  }
  async fanCredits(game){
    if(!/^https:\/\/(?:www\.)?2dfan\.(?:com|org)\/subjects\/\d+$/.test(game.autoFanUrl||''))return;
    try{const r=await this.fetch(game.autoFanUrl,{signal:AbortSignal.timeout(15000)});if(!r.ok)return;const html=await r.text();const writers=[];
      for(const m of html.matchAll(/<dt[^>]*>\s*(?:剧本|脚本|シナリオ)\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)){
        const links=[...m[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(a=>a[1]);
        for(const value of links.length?links:[m[1]]){const text=value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();if(text&&!/^更多|^\+\d+$/.test(text))writers.push(...text.split(/[、，,]/).map(s=>s.trim()).filter(Boolean));}
      }
      game.fanMetadata={writers:UNIQUE(writers),source:'2DFan',url:game.autoFanUrl,checkedAt:new Date().toISOString()};
    }catch{}
  }
  async companyCredits(game){
    if(game.kind!=='windows'||game.metadata?.source!=='VNDB'||!/^v\d+$/.test(String(game.metadata.id)))return;
    const result=await this.json('https://api.vndb.org/kana/release',{method:'POST',body:JSON.stringify({filters:['and',['vn','=', ['id','=',game.metadata.id]],['platform','=','win'],['lang','=','ja'],['official','=',1],['rtype','=','complete'],['patch','!=',1]],fields:'title,alttitle,released,producers{name,original,developer,publisher}',sort:'released',results:10})});
    const release=(result.results||[]).find(r=>r.producers?.some(p=>p.developer));
    if(release)game.metadata.companyCredits={developers:UNIQUE(release.producers.filter(p=>p.developer).map(p=>p.original||p.name)),publishers:UNIQUE(release.producers.filter(p=>p.publisher).map(p=>p.original||p.name)),source:'VNDB',url:`https://vndb.org/${release.id}`,platform:'win',released:release.released,checkedAt:new Date().toISOString()};
  }
  async apply(game,id,automatic=false) {
    if(/^v\d+$/.test(String(id))){
      const response=await this.json('https://api.vndb.org/kana/vn',{method:'POST',body:JSON.stringify({filters:['id','=',String(id)],fields:'title,alttitle,titles{title,lang},aliases,description,released,rating,votecount,image.url,developers{name,original},staff{role,eid,name,original}',results:1})});
      const item=response.results?.[0];if(!item)throw new Error('VNDB 条目不存在');
      const data={id:item.id,source:'VNDB',title:item.titles?.find(t=>t.lang==='zh-Hans')?.title||item.alttitle||item.title,originalTitle:item.alttitle||item.title,summary:(item.description||'').replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/g,'$1').replace(/\[\/?[a-z]+\]/g,''),rating:item.rating?item.rating/10:null,votes:item.votecount||0,date:item.released,companies:UNIQUE(item.developers.map(d=>d.original||d.name)),writers:UNIQUE(item.staff.filter(s=>s.role==='scenario'&&s.eid===null).map(s=>s.original||s.name)),genres:[],url:`https://vndb.org/${item.id}`,fetchedAt:new Date().toISOString()};
      if(automatic&&data.originalTitle){try{
        const response=await this.json('https://api.bgm.tv/v0/search/subjects?limit=10',{method:'POST',body:JSON.stringify({keyword:data.originalTitle,sort:'match',filter:{type:[4]}})});
        const matches=(response.data||[]).filter(x=>x.type===4).map(x=>({...x,match:candidateScore(game,x,data.originalTitle)})).sort((a,b)=>b.match-a.match);
        if(matches[0]?.match>=.94&&(!matches[1]||matches[0].match-matches[1].match>=.04)){const result=await this.apply(game,matches[0].id,true);if(result){result.vndbUrl=data.url;result.writers=UNIQUE([...result.writers,...data.writers]);return result;}}
      }catch{}}
      data.matchMethod=automatic?'automatic':'manual';
      await this.cacheCover(game,data,item.image?.url);await this.findFan(game,[data.originalTitle,data.title,item.title,...item.aliases]);game.metadata=data;game.metadataState='matched';game.metadataCheckedAt=data.fetchedAt;return data;
    }
    if(!/^\d+$/.test(String(id)))throw new Error('无效的 Bangumi 条目编号');
    const item=await this.json(`https://api.bgm.tv/v0/subjects/${id}`);
    if(item.type!==4)throw new Error('请选择游戏类型的 Bangumi 条目');
    const platforms=fields(item,/^平台$/).join(' ');
    if(automatic&&game.kind==='windows'&&platforms&&!/PC|Windows|Win|电脑/i.test(platforms)){game.metadataState='review';return null;}
    if(automatic&&game.kind==='rom'&&/\.(?:xci|nsp)$/i.test(game.launchPath)&&platforms&&!/Switch|Nintendo\s*Switch|^NS$/i.test(platforms)){game.metadataState='review';return null;}
    const data={id:item.id,source:'Bangumi',type:4,platforms,title:item.name_cn||item.name,originalTitle:item.name,summary:item.summary||'',rating:item.rating?.score||null,votes:item.rating?.total||0,date:item.date||'',
      companies:fields(item,/^(?:开发|开发商|游戏开发|制作公司|品牌)$/),writers:(item.infobox||[]).filter(x=>/^(?:剧本|脚本|シナリオ|剧本构成|脚本构成)$/.test(x.key)).flatMap(x=>flatten(x.value)),series:fields(item,/^系列$/),
      genres:(item.tags||[]).slice(0,10).map(t=>t.name),url:`https://bgm.tv/subject/${item.id}`,fetchedAt:new Date().toISOString()};
    data.matchMethod=automatic?'automatic':'manual';
    const vndbLink=(item.infobox||[]).filter(x=>/链接|link|vndb/i.test(x.key)).flatMap(x=>flatten(x.value)).map(value=>canonicalSubject(value,'VNDB')).find(Boolean);
    if(vndbLink)data.vndbUrl=vndbLink;
    await this.cacheCover(game,data,item.images?.large);
    if(!data.writers.length){try{const people=await this.json(`https://api.bgm.tv/v0/subjects/${id}/persons`);data.writers=UNIQUE(people.filter(p=>/^(?:剧本|脚本|シナリオ)(?:构成|统括|协力)?$/.test(p.relation)).map(p=>p.name));}catch{}}
    await this.findFan(game,[data.originalTitle,data.title]);
    game.metadata=data;game.metadataState='matched';game.metadataCheckedAt=new Date().toISOString();return data;
  }
  async auto(game) {
    let results=await this.search(game);
    const confident=items=>items[0]&&items[0].match>=.94&&(!items[1]||items[0].match-items[1].match>=.04||(norm(items[1].name)===norm(items[0].name)&&items[1].provider!==items[0].provider));
    if(!confident(results)){
      const seen=new Set([norm(game.title),norm(ALIASES[game.title])]);
      const queries=queryAlternatives(game);
      for(const q of queries){if(seen.has(norm(q)))continue;seen.add(norm(q));const next=await this.search(game,q);if(confident(next)){results=next;break;}if((next[0]?.match||0)>(results[0]?.match||0))results=next;}
    }
    const first=results[0];
    if(first && first.match>=0.94 && (!results[1] || first.match-results[1].match>=0.04 || (norm(results[1].name)===norm(first.name) && results[1].provider!==first.provider))) return this.apply(game,first.id,true);
    game.metadataState=results.length?'review':'not-found';game.metadataCheckedAt=new Date().toISOString();
    game.suggestions=results.slice(0,5).map(x=>({id:x.id,title:x.name_cn||x.name,originalTitle:x.name,score:x.match}));
    return null;
  }
}
module.exports={Metadata,similarity,candidateScore,ALIASES};
