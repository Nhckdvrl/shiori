const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs'),{Library}=require('../src/library.cjs');
const {scanRoots}=require('../src/scanner.cjs'),{profileDirectory}=require('../src/profile.cjs');
const {Metadata}=require('../src/metadata.cjs'),{subjectReference,communityLinks}=require('../src/community.cjs');
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shiori-general-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function put(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic executable, never launched');return file;}
const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
test('fresh profiles are empty and never guess the parent game directory',t=>{
  const dir=temporary(t),s=new Store(path.join(dir,'profile'));assert.deepEqual(s.state.settings.roots,[]);assert.deepEqual(s.state.games,[]);assert.deepEqual(s.state.sessions,[]);
  const appDir=path.join(dir,'source'),exePath=path.join(dir,'release','Shiori.exe'),appData=path.join(dir,'roaming');fs.mkdirSync(path.dirname(exePath));
  assert.equal(profileDirectory({env:{},appDir,exePath,appData,isPackaged:false}),path.join(appDir,'.local-data'));
  assert.equal(profileDirectory({env:{},appDir,exePath,appData,isPackaged:true}),path.join(appData,'Shiori'));
  fs.writeFileSync(path.join(dir,'release','portable.json'),'{}');
  assert.equal(profileDirectory({env:{},appDir,exePath,appData,isPackaged:true}),path.join(dir,'release','data'));
  assert.equal(profileDirectory({env:{SHIORI_DATA_DIR:path.join(dir,'test')},appDir,exePath,appData,isPackaged:true}),path.join(dir,'test'));
});
test('selecting an individual game folder imports the EXE and overlapping roots stay unique',async t=>{
  const dir=temporary(t),root=path.join(dir,'Key'),game=path.join(root,'新故事');put(path.join(game,'game.exe'));
  const direct=await scanRoots([game]);assert.equal(direct.games.length,1);assert.equal(direct.games[0].title,'新故事');
  const merged=await scanRoots([root,game]);assert.equal(merged.games.length,1);assert.deepEqual(merged.games[0].folderTags.companies,['Key']);
});
test('nested game binaries keep the actual title and independent episodes with the same executable name are retained',async t=>{
  const dir=temporary(t),game=path.join(dir,'My new story');put(path.join(game,'Binaries','Win64','Game.exe'));
  const direct=await scanRoots([game]);assert.equal(direct.games[0].title,'My new story');
  put(path.join(dir,'bundle','game.exe'));put(path.join(dir,'bundle','episode two','game.exe'));
  const bundle=await scanRoots([path.join(dir,'bundle')]);assert.equal(bundle.games.length,2);
});
test('an installation without Locale Emulator does not need a developer drive or affect ordinary launches',t=>{
  const dir=temporary(t),{findLocaleEmulator,launchWithLocale}=require('../src/locale.cjs');
  assert.equal(findLocaleEmulator(null,{env:{},searchDirectories:[dir]}),null);
  assert.deepEqual(launchWithLocale({useLocaleEmulator:false},{},'game.exe',['arg']),{exe:'game.exe',args:['arg']});
  const file=put(path.join(dir,'LEProc.exe'));assert.equal(findLocaleEmulator(file,{searchDirectories:[]}),file);
});

test('duplicate nested translation bundles are skipped but independent game data is retained',async t=>{
  const dir=temporary(t),game=path.join(dir,'Story');
  put(path.join(game,'translated.exe'));put(path.join(game,'translated.bin'));
  put(path.join(game,'translated','translated.exe'));put(path.join(game,'translated','translated.bin'));
  fs.writeFileSync(path.join(game,'translated','readme.txt'),'bundle instructions');
  assert.equal((await scanRoots([dir])).games.length,1);
  fs.writeFileSync(path.join(game,'translated','translated.bin'),'different story assets');
  assert.equal((await scanRoots([dir])).games.length,2);
});
test('multiple libraries, manual EXE imports, and removing a watched root preserve personal records',async t=>{
  const dir=temporary(t),s=new Store(path.join(dir,'profile'));s.state.settings.autoMetadata=false;
  const root=path.join(dir,'library one'),game=path.join(root,'Key','新故事'),exe=put(path.join(game,'game.exe'));
  const other=path.join(dir,'library two');put(path.join(other,'另一故事','start.exe'));
  const lib=new Library(s,{},path.join(dir,'app'));t.after(()=>lib.close());
  await lib.addRoots([game,other,root]);assert.equal(s.state.settings.roots.length,2);assert.equal(s.state.games.length,2);
  const g=s.state.games.find(g=>g.folder===game);Object.assign(g,{status:'completed',playSeconds:123,notes:'keep me',metadata:{title:'Chosen title',source:'Bangumi',writers:['测试脚本家']}});
  const id=await lib.registerExecutable(exe);assert.equal(id,g.id);assert.equal(s.state.games.length,2);
  assert.ok(lib.snapshot().settings.visibleWriters.includes('测试脚本家'));
  lib.removeRoot(root);await lib.scan();assert.equal(g.notes,'keep me');assert.equal(g.status,'completed');assert.equal(g.playSeconds,123);assert.equal(g.missing,false);assert.equal(g.manualLaunch,true);
});
test('metadata search still offers VNDB when Bangumi is unavailable',async t=>{
  const dir=temporary(t),m=new Metadata(async url=>url.includes('api.bgm.tv')?new Response('',{status:503}):json({results:[{id:'v1',title:'New story',developers:[]}]}),path.join(dir,'covers'));
  const result=await m.searchDetailed({title:'New story',kind:'windows'},'New story',{manual:true});assert.equal(result.items[0].provider,'VNDB');assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/Bangumi/);
});
test('manual provider selection does not depend on folder company and never queries the other source',async t=>{
  const dir=temporary(t),calls=[];const m=new Metadata(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return json({results:[{id:'v1',title:'New story'}]});},path.join(dir,'covers'));
  await m.searchDetailed({title:'New story',folderTags:{companies:['Wrong company']}},'New story',{provider:'VNDB',manual:true});
  assert.equal(calls.length,1);assert.match(calls[0].url,/api.vndb.org/);assert.deepEqual(calls[0].body.filters,['search','=','New story']);
});
test('pasted Bangumi links reject same-named anime and accept only game references',async t=>{
  const dir=temporary(t),m=new Metadata(async()=>json({id:1,type:2,name:'New story'}),path.join(dir,'covers'));
  await assert.rejects(()=>m.searchDetailed({title:'New story'},'https://bgm.tv/subject/1'),/不是游戏/);
  assert.deepEqual(subjectReference('https://bangumi.tv/subject/123?from=search'),{provider:'Bangumi',id:'123'});
  assert.deepEqual(subjectReference('https://vndb.org/v17'),{provider:'VNDB',id:'v17'});
  assert.equal(subjectReference('https://bgm.tv.evil.example/subject/123'),null);assert.equal(subjectReference('https://user:secret@bgm.tv/subject/123'),null);
});
test('community links never substitute one platform match for another platform score',()=>{
  const links=communityLinks({title:'新故事',metadata:{source:'VNDB',url:'https://vndb.org/v17'}});
  assert.equal(links.vndb.matched,true);assert.equal(links.bangumi.matched,false);assert.match(links.bangumi.url,/cat=4$/);assert.equal(links.fan.matched,false);
  const exact=communityLinks({title:'New',bangumiUrl:'https://chii.in/subject/12?from=x',vndbUrl:'https://vndb.org/v19',fanUrl:'https://2dfan.com/subjects/5'});
  assert.equal(exact.bangumi.url,'https://bgm.tv/subject/12');assert.equal(exact.vndb.url,'https://vndb.org/v19');assert.equal(exact.fan.matched,true);
});
test('an in-flight automatic lookup cannot replace a manual metadata selection',async t=>{
  const dir=temporary(t),s=new Store(path.join(dir,'profile'));let started,finish;
  const entered=new Promise(r=>started=r),waiting=new Promise(r=>finish=r);
  const game={id:'g',title:'New',folder:path.join(dir,'game'),kind:'windows',folderTags:{folders:[],companies:[],writers:[]},metadataState:'pending'};s.state.games.push(game);
  const metadata={async auto(draft){started();await waiting;draft.metadata={title:'Automatic'};draft.metadataState='matched';}};
  const lib=new Library(s,metadata,path.join(dir,'app'));t.after(()=>lib.close());lib.queue.push('g');const work=lib.work();await entered;
  game.metadata={title:'Manual',matchMethod:'manual'};game.metadataState='matched';finish();await work;
  assert.equal(game.metadata.title,'Manual');
});
