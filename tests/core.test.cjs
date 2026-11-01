const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {scanRoots,scoreExe,isInside}=require('../src/scanner.cjs');
const {Tracker,splitDays}=require('../src/tracker.cjs');const {Store}=require('../src/store.cjs');
const {candidateScore,similarity}=require('../src/metadata.cjs');
const {Metadata}=require('../src/metadata.cjs');
const {needsOpticalDrive}=require('../src/disc.cjs');
const {findLocaleEmulator,launchWithLocale}=require('../src/locale.cjs');
const {norm,ordinal,queryAlternatives}=require('../src/title-normalization.cjs');
test('recursive scan keeps company + writer folders, excludes patches, merges duplicate exe copies',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-scan-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 async function put(p){const f=path.join(root,p);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,'test exe');}
 await put('Key/田中罗密欧/Rewrite/game.exe');await put('Key/田中罗密欧/Rewrite/game_chs.exe');await put('Key/田中罗密欧/Rewrite/unins000.exe');await put('Key/田中罗密欧/Rewrite/补丁备份/game_chs.exe');await put('Key/田中罗密欧/Rewrite/copy/game_chs.exe');await put('Key/田中罗密欧/Rewrite/全CG存档/game.exe');await put('十三机兵/游戏.xci');
 const a=await scanRoots([root]);assert.equal(a.games.length,2);const g=a.games.find(x=>x.kind==='windows');assert.equal(path.basename(g.launchPath),'game_chs.exe');assert.deepEqual(g.folderTags.writers,['田中罗密欧']);assert.deepEqual(g.folderTags.companies,['Key']);assert.ok(g.folderTags.folders.includes('田中罗密欧'));assert.equal(g.candidates.length,2);
 await put('新会社/新游戏/start.exe');const b=await scanRoots([root]);assert.equal(b.games.length,3);assert.equal(b.games.find(x=>x.title==='Rewrite').id,g.id);
});
test('path matching respects directory boundaries and executable scoring prefers translations',()=>{
 assert.ok(!isInside('C:/game','C:/game2/game.exe'));assert.ok(isInside('C:/game','C:/game/bin/game.exe'));
 assert.ok(scoreExe('Game_chs.exe','game')>scoreExe('Game.exe','game'));assert.ok(scoreExe('补丁安装程序.exe','game')<0);
});
test('metadata matching does not confuse sequels or console-only editions',()=>{
 const g={title:'Rewrite',kind:'windows',relativePath:'Key/Rewrite'};assert.equal(candidateScore(g,{name:'Rewrite',infobox:[{key:'平台',value:'PC'}]},'Rewrite'),1);
 assert.ok(candidateScore(g,{name:'Rewrite',infobox:[{key:'平台',value:'PSV'}]},'Rewrite')<.94);
 assert.ok(similarity('Rewrite','Rewrite Harvest festa')<.94);
 assert.ok(candidateScore({title:'美少女万华镜4',kind:'windows',relativePath:'ωstar/美少女万华镜/美少女万华镜4'},{name_cn:'美少女万华镜 -被诅咒的传说少女-',name:'美少女万華鏡 -呪われし伝説の少女-'},'美少女万华镜4')<.94);
 assert.ok(similarity('Rewrite','Rewrite+')<1);
});
test('atomic store survives restart and recovers previous copy without discarding corrupt original',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const s=new Store(dir,'C:/games');s.state.games.push({id:'a',playSeconds:42});s.save();s.state.games[0].playSeconds=55;s.save();assert.equal(new Store(dir,'').state.games[0].playSeconds,55);
 await fs.writeFile(path.join(dir,'library.json'),'{broken');const recovered=new Store(dir,'');assert.equal(recovered.state.games[0].playSeconds,42);assert.ok((await fs.readdir(dir)).some(f=>f.includes('.corrupt-')));
});
test('tracker follows a handed-off process, pause/resume, and excludes a long sleep gap',()=>{
 const game={id:'g',folder:'C:/games/one',status:'unplayed',playSeconds:0};const state={games:[game],sessions:[]};const store={state,save(){}};const tracker=new Tracker(store);tracker.recovered=true;
 const start=Date.now();tracker.begin(game,10,[]);const s=state.sessions[0];s.startedAt=new Date(start).toISOString();const p={id:10,path:'C:/games/one/launcher.exe',started:start};tracker.tick({at:start,processes:[p]});tracker.tick({at:start+2000,processes:[p]});assert.equal(game.playSeconds,2);
 const child={id:11,path:'C:/games/one/game.exe',started:start+1000};tracker.tick({at:start+4000,processes:[p,child]});tracker.tick({at:start+6000,processes:[child]});assert.equal(game.playSeconds,6);
 tracker.pause('g');tracker.tick({at:start+8000,processes:[child]});assert.equal(game.playSeconds,6);tracker.pause('g');tracker.tick({at:start+10000,processes:[child]});assert.equal(game.playSeconds,8);
 tracker.tick({at:start+3600000,processes:[child]});assert.equal(game.playSeconds,8);tracker.tick({at:start+3602000,processes:[]});tracker.tick({at:start+3610000,processes:[]});assert.equal(tracker.active.size,0);assert.ok(s.endedAt);assert.equal(s.seconds,game.playSeconds);
});
test('daily statistics split sessions across midnight',()=>{const a=new Date(2026,9,31,23,59,59).getTime();const split=splitDays(a,a+3000);assert.equal(split['2026-10-31'],1);assert.equal(split['2026-11-01'],2);});
test('metadata rejects anime even if its title is identical',async t=>{
 const cache=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-metadata-'));t.after(()=>fs.rm(cache,{recursive:true,force:true}));
 const m=new Metadata(async()=>new Response(JSON.stringify({id:123,type:2,name:'Rewrite'}),{status:200}),path.join(cache,'covers'));
 await assert.rejects(()=>m.apply({id:'g'},123),/游戏类型/);
});
test('Bangumi credentials are sent only to the Bangumi API host',async()=>{
 const requests=[];const m=new Metadata(async(url,options)=>{requests.push({url,headers:options.headers});return new Response('{}',{status:200});},'unused',()=> 'test-secret');
 await m.json('https://api.bgm.tv/v0/me');await m.json('https://api.vndb.org/kana/schema');assert.equal(requests[0].headers.Authorization,'Bearer test-secret');assert.ok(!requests[1].headers.Authorization);
});
test('optical compatibility is enabled only for explicit engine configuration and shipped instructions',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-disc-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const game={folder:dir};
 assert.equal(needsOpticalDrive(game),false);await fs.writeFile(path.join(dir,'AI5WIN.INI'),'[FILE]\nStdCDDrive=NOCDDRV\n');assert.equal(needsOpticalDrive(game),false);
 await fs.writeFile(path.join(dir,'readme.txt'),'If you see No CD-ROM drive found, add a virtual CD drive.');assert.equal(needsOpticalDrive(game),true);
});
test('LE launching preserves per-game executable, working arguments and native path quoting',()=>{
 const exe='F:\\games with spaces\\game.exe',args=['--test','路径 with spaces'];
 assert.deepEqual(launchWithLocale({useLocaleEmulator:false},{},exe,args),{exe,args});
 const le=findLocaleEmulator();if(le){const command=launchWithLocale({useLocaleEmulator:true},{localeEmulatorPath:le},exe,args);assert.equal(command.exe,le);assert.deepEqual(command.args,[exe,...args]);}
});
test('studio context rejects unrelated same-name games',()=>{
 const game={title:'eden',kind:'windows',folderTags:{companies:['minori']}};
 const wrong={name:'EdEn',name_cn:'EdEn',infobox:[{key:'开发',value:'Unrelated Studio'}]};
 const right={name:'eden* They were only two, on the planet.',name_cn:'伊甸园',infobox:[{key:'别名',value:[{v:'eden'}]},{key:'开发',value:'minori'}]};
 assert.ok(candidateScore(game,wrong,'eden')<.94);assert.ok(candidateScore(game,right,'eden')>=.94);
 const omnibus={name:'9-nine-',name_cn:'9-nine-',infobox:[{key:'别名',value:[{v:'9-nine-九次九日九重色'}]},{key:'开发',value:'Palette'}]};
 assert.ok(candidateScore({title:'9-nine-九次九日九重色',kind:'windows',folderTags:{companies:['Palette']}},omnibus,'9-nine-九次九日九重色')<.94);
});
test('launch state waits for a visible window and reports a background-only process',()=>{
 const game={id:'visible-state',folder:'C:/games/visible',status:'unplayed',playSeconds:0};const store={state:{games:[game],sessions:[]},save(){}};
 const tracker=new Tracker(store);tracker.recovered=true;tracker.begin(game,77,[]);const start=new Date(store.state.sessions[0].startedAt).getTime();
 const process={id:77,path:'C:/games/visible/game.exe',started:start,hasWindow:false};tracker.tick({at:start+21000,processes:[process]});
 assert.equal(tracker.list()[0].phase,'no-window');assert.equal(game.lastLaunchIssue.kind,'no-window');assert.equal(game.status,'unplayed');assert.equal(game.lastPlayed,undefined);
 tracker.tick({at:start+23000,processes:[{...process,hasWindow:true}]});assert.equal(tracker.list()[0].phase,'running');assert.equal(game.lastLaunchIssue,null);assert.equal(game.status,'playing');assert.ok(game.lastPlayed);
});
test('multilingual aliases preserve the exact installment number',()=>{
 assert.equal(norm('美少女万华镜5'),norm('美少女万華鏡５'));assert.notEqual(norm('美少女万華鏡２．５'),norm('美少女万华镜5'));
 const game={title:'美少女万华镜5',kind:'windows',folderTags:{companies:['ωstar']}};
 const correct={provider:'VNDB',name:'美少女万華鏡 -理と迷宮の少女-',vnAliases:['美少女万華鏡５'],vnCompanies:['ωstar']};
 const wrong={provider:'VNDB',name:'美少女万華鏡 -呪われし伝説の少女-',vnAliases:['美少女万華鏡1'],vnCompanies:['ωstar']};
 assert.ok(candidateScore(game,correct,game.title)>=.94);assert.ok(candidateScore(game,wrong,game.title)<.94);
 assert.equal(ordinal('廃村少女［弐］ 外伝'),ordinal('廃村少女2_外伝'));
 assert.ok(queryAlternatives({title:'Haison_FD2',relativePath:'Escude/廃村少女1 番外 ～籠愛拾遺～/Haison_FD2'}).some(q=>norm(q)===norm('廃村少女1 番外 ～籠愛拾遺～')));
 const sequel={title:'废村少女2-阴影诱惑的秘姬之匣',kind:'windows',folderTags:{companies:['Escu:de']}};
 const first={name:'廃村少女 ～妖し惑ひの籠の郷～',name_cn:'废村少女 ～妖异魅惑的笼之乡～',infobox:[{key:'开发',value:'Escu:de'}]};
 const second={name:'廃村少女［弐］ ～陰り誘う秘姫の匣～',name_cn:'废村少女［贰］ ～幽秘蛊惑的姬之匣～',infobox:[{key:'开发',value:'Escu:de'}]};
 assert.ok(candidateScore(sequel,first,'废村少女')<.94);
 assert.ok(candidateScore(sequel,second,second.name)>=.94);
 assert.ok(candidateScore(game,wrong,'美少女万华镜')<.94);
});
test('explicit cross-database IDs disambiguate same-name game releases',async t=>{
 const cache=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-metadata-'));t.after(()=>fs.rm(cache,{recursive:true,force:true}));
 const fetcher=async(url,options)=>new Response(JSON.stringify(url.includes('api.bgm.tv')?{data:[{id:1,type:4,name:'Example',name_cn:'示例',infobox:[{key:'链接',value:[{k:'VNDB',v:'https://vndb.org/v100'}]}]},{id:2,type:4,name:'Example',name_cn:'示例'}]}:{results:[{id:'v100',title:'Example',alttitle:'Example',aliases:[],titles:[],developers:[]}]}),{status:200});
 const m=new Metadata(fetcher,path.join(cache,'covers'));const results=await m.search({title:'Example',kind:'windows'});
 assert.equal(results[0].id,1);assert.ok(results[0].match-results[1].match>=.04);
});
test('company credits use the original PC release and keep publishers separate',async t=>{
 const cache=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-company-'));t.after(()=>fs.rm(cache,{recursive:true,force:true}));
 const m=new Metadata(async(url,options)=>{const request=JSON.parse(options.body);assert.ok(JSON.stringify(request.filters).includes('win'));return new Response(JSON.stringify({results:[{id:'r100',released:'2011-12-22',producers:[{name:'Leaf',developer:true,publisher:true},{name:'Other publisher',developer:false,publisher:true}]}]}),{status:200});},path.join(cache,'covers'));
 const game={kind:'windows',metadata:{id:'v100',source:'VNDB',rating:8.6,matchMethod:'manual',companies:['Leaf','Port studio']}};
 await m.companyCredits(game);assert.equal(game.metadata.id,'v100');assert.equal(game.metadata.matchMethod,'manual');assert.equal(game.metadata.rating,8.6);
 assert.deepEqual(game.metadata.companyCredits.developers,['Leaf']);assert.deepEqual(game.metadata.companyCredits.publishers,['Leaf','Other publisher']);
});

test('a shared VNDB identity cannot promote a different R or HD edition',async t=>{
 const cache=await fs.mkdtemp(path.join(os.tmpdir(),'shiori-edition-'));t.after(()=>fs.rm(cache,{recursive:true,force:true}));
 const m=new Metadata(async url=>new Response(JSON.stringify(url.includes('api.bgm.tv')?{data:[{id:2,type:4,name:'Example Story R',infobox:[{key:'链接',value:'https://vndb.org/v100'}]},{id:1,type:4,name:'Example Story'}]}:{results:[{id:'v100',title:'Example Story',alttitle:'Example Story',developers:[]}]}),{status:200}),path.join(cache,'covers'));
 const game={title:'Example Story',kind:'windows',candidates:[{name:'original.exe'}]};
 const result=await m.searchDetailed(game,'Example Story',{manual:true});assert.equal(result.items[0].id,1);assert.ok(result.items.find(x=>x.id===2).match<.94);
 assert.ok(candidateScore(game,{name:'Example Story HD'},'Example Story')<.94);
 assert.ok(candidateScore({...game,title:'Example Story R'},{name:'Example Story R'},'Example Story R')>=.94);
});
