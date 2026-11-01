const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const build=path.join(root,'dist',`Shiori-${version}-win32-${process.arch}`);
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'shiori-new-user-'));
const destination=path.join(sandbox,'另一台电脑','便携 启动器'),games=path.join(sandbox,'新玩家收藏','会社分类'),gameFolder=path.join(games,'新故事'),exe=path.join(gameFolder,'Binaries','Win64','新故事.exe');
const report={relocatedPackage:true,developerDataUsed:false,credentialsUsed:false};
let app,launchedAt;
async function stop(){if(app){await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});app=null;}}
(async()=>{
  assert.equal(process.platform,'win32');assert.ok(fs.existsSync(path.join(build,'Shiori.exe')),'Build the portable app first');
  fs.cpSync(build,destination,{recursive:true});assert.ok(!fs.existsSync(path.join(destination,'data')));
  fs.mkdirSync(path.dirname(exe),{recursive:true});
  execFileSync(path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:winexe','/platform:x86','/out:'+exe,path.join(root,'tests','visible-game.cs')],{windowsHide:true});
  // The application receives only standard Windows locations and a new profile.
  // No Node, pnpm, LE, proxy, developer drive, inherited SHIORI_DATA_DIR or SHIORI_ROOT.
  const windows=process.env.SystemRoot||process.env.WINDIR;
  const env={...process.env};
  for(const key of Object.keys(env))if(/^(?:SHIORI_|NODE_|NPM_|PNPM_|ELECTRON_OVERRIDE_|ELECTRON_RUN_AS_NODE|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)/i.test(key))delete env[key];
  env.PATH=[path.join(windows,'System32'),path.join(windows,'System32','WindowsPowerShell','v1.0')].join(';');env.SHIORI_BACKGROUND_TEST='1';
  const executablePath=path.join(destination,'Shiori.exe');
  const open=async()=>{app=await electron.launch({executablePath,args:[],env,timeout:45000});const page=await app.firstWindow();await page.waitForSelector('.content');return page;};
  let page=await open();await page.waitForSelector('.setup-grid');
  const get=()=>page.evaluate(()=>window.shiori.getLibrary());
  const wait=async predicate=>{const until=Date.now()+30000;while(Date.now()<until){const state=await get();if(predicate(state))return state;await page.waitForTimeout(250);}throw new Error('State timeout');};
  let state=await get();assert.equal(state.games.length,0);assert.deepEqual(state.settings.roots,[]);assert.equal(state.settings.hasBangumiToken,false);assert.equal(state.settings.localeEmulatorPath,null);assert.equal(state.settings.autoMetadata,true);
  const profile=path.join(destination,'data','library.json');assert.ok(fs.existsSync(profile));report.defaultPortableProfile=true;
  const png=fs.readFileSync(path.join(root,'public','icon.png'));
  await app.evaluate(({dialog,net},{games,bytes})=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[games]});const original=net.fetch.bind(net);globalThis.fixtureFetch=original;
    net.fetch=async(url,options={})=>{
      const value=String(url);if(value.startsWith('file:'))return original(url,options);
      if(options.headers?.Authorization)throw new Error('Fresh profile must not have credentials');
      const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
      if(value.includes('/v0/search/'))return json({data:[{id:101,type:4,name:'新故事',infobox:[{key:'平台',value:'PC'}]}]});
      if(value.endsWith('/subjects/101/persons'))return json([{id:47,type:2,name:'Key',relation:'开发'}]);
      if(value.endsWith('/persons/47'))return json({id:47,type:2,name:'Key'});
      if(value.includes('/v0/subjects/101'))return json({id:101,type:4,name:'新故事',summary:'Public fixture',infobox:[{key:'开发',value:'Key'},{key:'剧本',value:'测试脚本家'}],images:{large:'https://lain.bgm.tv/pic/fixture.png'}});
      if(value==='https://lain.bgm.tv/pic/fixture.png')return new Response(Buffer.from(bytes),{status:200,headers:{'Content-Type':'image/png'}});
      if(value.startsWith('https://2dfan.com'))return new Response('<html></html>',{status:200});
      throw new Error('No dependency outside the public fixture: '+value);
    };
  },{games,bytes:[...png]});
  await page.getByRole('button',{name:'选择游戏目录',exact:true}).click();state=await wait(s=>s.games.length===1&&s.games[0].metadataState==='matched'&&s.games[0].bangumiCompanyCredits?.complete);
  assert.equal(state.games[0].title,'新故事');assert.equal(state.games[0].launchPath,exe);assert.deepEqual(state.games[0].tags.companies,['Key']);assert.ok(fs.existsSync(state.games[0].metadata.cover));report.chooseDirectory=true;report.automaticRegistration=true;report.automaticMetadataAndCover=true;
  await page.getByRole('button',{name:'进入我的收藏',exact:true}).click();await page.waitForSelector('.game-card');
  await app.evaluate(({net})=>{net.fetch=async(url,options)=>String(url).startsWith('file:')?globalThis.fixtureFetch(url,options):Promise.reject(new Error('Offline fixture'));});
  const id=state.games[0].id;await page.evaluate(id=>window.shiori.updateGame(id,{launchArgs:['8'],status:'completed',notes:'换机验证保留记录'}),id);
  await wait(s=>s.monitor==='ok');launchedAt=Date.now();await page.evaluate(id=>window.shiori.launch(id),id);await wait(s=>s.games[0].playSeconds>=2);await page.evaluate(id=>window.shiori.finish(id),id);
  state=await get();assert.equal(state.games[0].status,'completed');report.offlineLaunchWithoutLE=true;report.realProcessTiming=true;
  if(Date.now()-launchedAt<8500)await page.waitForTimeout(8500-(Date.now()-launchedAt));await stop();
  page=await open();await page.waitForSelector('.game-card');state=await get();assert.equal(state.games.length,1);assert.equal(state.games[0].notes,'换机验证保留记录');assert.ok(state.games[0].playSeconds>=2);assert.equal(await page.locator('.setup-grid').count(),0);assert.equal(state.settings.hasBangumiToken,false);
  const stored=fs.readFileSync(profile,'utf8');assert.ok(!stored.includes(root.replaceAll('\\','\\\\')));report.restartPreservesConfiguration=true;
  console.log('NEW USER ALL PASSED '+JSON.stringify(report));fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results','new-user-report.json'),JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(launchedAt&&Date.now()-launchedAt<8500)await new Promise(r=>setTimeout(r,8500-(Date.now()-launchedAt)));
  await stop();const resolved=path.resolve(sandbox);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('shiori-new-user-'))throw new Error('Unsafe test cleanup path');fs.rmSync(resolved,{recursive:true,force:true});
});
