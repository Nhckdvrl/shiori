const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {Store}=require('../src/store.cjs');
const root=path.resolve(__dirname,'..'),result=path.join(root,'test-results','onboarding-'+Date.now());
async function run(){
  if(process.platform!=='win32')throw new Error('Windows desktop integration test');
  fs.mkdirSync(result,{recursive:true});
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'shiori-public-e2e-'));
  const first=path.join(fixture,'library one'),second=path.join(fixture,'library two');
  const firstGame=path.join(first,'Key','田中罗密欧','示例故事'),secondGame=path.join(second,'另一家公司','第二个故事');
  fs.mkdirSync(firstGame,{recursive:true});fs.mkdirSync(secondGame,{recursive:true});
  const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const executable=path.join(firstGame,'game.exe');
  execFileSync(compiler,['/nologo','/target:winexe','/platform:x86','/out:'+executable,path.join(root,'tests','visible-game.cs')],{windowsHide:true});
  fs.copyFileSync(executable,path.join(secondGame,'start.exe'));
  const dataDir=path.join(result,'profile'),store=new Store(dataDir);store.state.settings.autoMetadata=false;store.save();
  const env={...process.env,SHIORI_DATA_DIR:dataDir,SHIORI_BACKGROUND_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.SHIORI_ROOT;
  const executablePath=process.env.SHIORI_TEST_PACKAGED||require('electron');
  const app=await electron.launch({executablePath,args:process.env.SHIORI_TEST_PACKAGED?[]:[root],env,timeout:45000});
  let launchedAt;
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    const get=()=>page.evaluate(()=>window.shiori.getLibrary());
    const wait=async predicate=>{const until=Date.now()+25000;while(Date.now()<until){const state=await get();if(predicate(state))return state;await page.waitForTimeout(250);}throw new Error('State timeout');};
    await page.waitForSelector('.setup-grid');let state=await get();assert.equal(state.games.length,0);assert.deepEqual(state.settings.roots,[]);assert.equal(state.settings.hasBangumiToken,false);
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
    await page.screenshot({path:path.join(result,'first-run.png'),timeout:5000}).catch(()=>console.warn('Preview screenshot unavailable; functional assertions continue'));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1050,800));
    await page.waitForTimeout(150);
    assert.ok(await page.locator('.content').evaluate(el=>el.scrollWidth<=el.clientWidth),'Setup must fit the small window without horizontal scrolling');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1420,940));
    console.log('PASS fresh empty profile + setup screen + small-window layout');
    // Dialog choices and remote API responses are synthetic. Never read a private game library or Token.
    await app.evaluate(({dialog,net},folders)=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:folders});
      const original=net.fetch.bind(net);
      net.fetch=async(url,options={})=>{
        const input=String(url),json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
        if(input==='https://api.bgm.tv/v0/me'){
          if(options.headers.Authorization!=='Bearer fixture-token-not-a-real-token')throw new Error('Unexpected fixture credential');
          return json({username:'fixture',nickname:'示例用户'});
        }
        if(input==='https://api.bgm.tv/v0/subjects/101/persons')return json([{id:47,type:2,name:'Key',relation:'开发'},{id:48,type:2,name:'Port publisher',relation:'发行'}]);
        if(input==='https://api.bgm.tv/v0/persons/47')return json({id:47,type:2,name:'Key',infobox:[{key:'别名',value:[{v:'键社'}]}]});
        if(input==='https://api.bgm.tv/v0/persons/48')return json({id:48,type:2,name:'Port publisher'});
        if(input.startsWith('https://api.bgm.tv/v0/subjects/'))return json({id:101,type:4,name:'示例故事',name_cn:'示例故事',summary:'用于验证手动关联的合成资料。',date:'2020-01-01',rating:{score:8.2,total:10},infobox:[{key:'平台',value:'PC'},{key:'发行',value:'Port publisher'},{key:'剧本',value:'田中ロミオ'}],tags:[{name:'剧情'},{name:'视觉小说'}]});
        if(input.startsWith('https://api.bgm.tv/v0/search/'))return json({data:[{id:101,type:4,name:'示例故事',date:'2020-01-01',rating:{score:8.2,total:10}},{id:999,type:2,name:'示例故事'}]});
        if(input.startsWith('https://api.vndb.org/')){if(options.headers?.Authorization)throw new Error('Bangumi Token leaked');return json({results:[{id:'v101',title:'Example story',alttitle:'示例故事',developers:[],staff:[],aliases:[]}]});}
        if(input.startsWith('https://2dfan.com/')){if(options.headers?.Authorization)throw new Error('Token leaked');return new Response('<html></html>',{status:200});}
        return original(url,options);
      };
    },[first,second]);
    await page.getByRole('button',{name:'选择游戏目录',exact:true}).click();state=await wait(s=>s.games.length===2);assert.equal(state.settings.roots.length,2);
    const g=state.games.find(g=>g.title==='示例故事');assert.deepEqual(g.tags.companies,['Key']);assert.deepEqual(g.tags.writers,['田中罗密欧']);
    await page.getByRole('button',{name:'进入我的收藏',exact:true}).click();await page.waitForSelector('.game-card');assert.equal(await page.locator('.game-card').count(),2);
    assert.equal((await get()).settings.onboardingCompleted,true);console.log('PASS multi-root import + tags + completed setup');
    await page.locator(`.game-card[data-id="${g.id}"]`).click();assert.equal(await page.locator('.external-card').count(),3);
    await page.locator('[data-action="match"]').click();await page.locator('#match-query').fill('示例故事');await page.locator('#match-form button').click();await page.waitForSelector('.match-result');
    assert.equal(await page.locator('.match-result').count(),2);assert.ok(!(await page.locator('#match-results').innerText()).includes('999'));console.log('PASS manual database search + game-only candidates');
    await page.locator('[data-action="apply-match"][data-subject="101"]').click();state=await wait(s=>s.games.find(x=>x.id===g.id).metadata?.id===101);assert.equal(state.games.find(x=>x.id===g.id).metadata.matchMethod,'manual');
    assert.equal(state.games.find(x=>x.id===g.id).community.bangumi.matched,true);assert.equal(state.games.find(x=>x.id===g.id).community.vndb.matched,false);
    await page.locator('[data-action="close-overlay"]').click();await page.locator('.nav [data-action="navigate"][data-view="tags"]').click();
    assert.equal(await page.locator('.sidebar .category').count(),0);
    await page.locator('[data-action="refresh-companies"]').click();state=await wait(s=>s.games.find(x=>x.id===g.id).bangumiCompanyCredits?.complete);
    assert.deepEqual(state.games.find(x=>x.id===g.id).tags.companies,['Key']);assert.equal(state.games.find(x=>x.id===g.id).companySource.source,'Bangumi');
    await page.locator('#tag-query').fill('键社');await page.waitForSelector('#tag-catalog .tag-entry');assert.equal(await page.locator('.tag-entry').count(),1);
    await page.getByLabel('固定到侧栏：Key',{exact:true}).check();assert.equal(await page.locator('.sidebar .category').count(),0);
    await page.locator('[data-action="save-sidebar-tags"]').click();await wait(s=>s.settings.sidebarTags.companies.includes('Key'));await page.waitForSelector('.sidebar .category[data-value="Key"]');
    await page.locator('#tag-query').fill('');await page.locator('[data-action="tag-type"][data-type="writers"]').click();assert.ok(await page.locator('.tag-entry').count()>0);
    await page.getByLabel('固定到侧栏：田中罗密欧',{exact:true}).check();await page.locator('[data-action="save-sidebar-tags"]').click();await wait(s=>s.settings.sidebarTags.writers.includes('田中罗密欧'));
    await page.locator('[data-action="tag-type"][data-type="genres"]').click();assert.equal(await page.locator('.tag-entry').count(),2);
    await page.reload();await page.waitForSelector('.sidebar .category[data-value="Key"]');assert.equal(await page.locator('.sidebar .category[data-type="genres"]').count(),0);
    console.log('PASS Bangumi company identities + publisher separation + complete tags + explicitly saved sidebar preferences');
    await page.locator('[data-action="navigate"][data-view="settings"]').click();
    await page.getByLabel('Bangumi 访问令牌').fill('fixture-token-not-a-real-token');await page.locator('#bangumi-token-form button').click();await wait(s=>s.settings.hasBangumiToken);
    assert.ok(fs.existsSync(path.join(dataDir,'bangumi-token.encrypted')));assert.ok(!fs.readFileSync(path.join(dataDir,'library.json'),'utf8').includes('fixture-token-not-a-real-token'));console.log('PASS encrypted account setup + credential isolation');
    await page.locator('[data-action="disconnect-bangumi"]').click();await wait(s=>!s.settings.hasBangumiToken);assert.equal(fs.existsSync(path.join(dataDir,'bangumi-token.encrypted')),false);
    await page.locator(`[data-action="remove-root"][data-root="${first.replaceAll('\\','\\\\')}"]`).click();state=await wait(s=>s.settings.roots.length===1);assert.equal(state.games.length,2);assert.equal(state.games.find(x=>x.id===g.id).missing,false);console.log('PASS stopping a root preserves imported games and records');
    const manualFolder=path.join(fixture,'manual game'),manual=path.join(manualFolder,'manual.exe');fs.mkdirSync(manualFolder);fs.copyFileSync(executable,manual);
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},manual);
    await page.locator('[data-action="import-executable"]').click();state=await wait(s=>s.games.some(g=>g.manualImport));const added=state.games.find(g=>g.manualImport);assert.equal(added.launchPath,manual);assert.equal(added.manualLaunch,true);
    await page.evaluate(id=>window.shiori.updateGame(id,{launchArgs:['8'],status:'completed',notes:'保留这段手记'}),added.id);await wait(s=>s.monitor==='ok');
    launchedAt=Date.now();await page.evaluate(id=>window.shiori.launch(id),added.id);await wait(s=>s.games.find(g=>g.id===added.id).playSeconds>=2);
    await page.evaluate(id=>window.shiori.finish(id),added.id);state=await get();assert.equal(state.games.find(g=>g.id===added.id).status,'completed');assert.equal(state.games.find(g=>g.id===added.id).notes,'保留这段手记');console.log('PASS manual EXE import + real process timing + personal record preservation');
    await page.locator('[data-action="close-overlay"]').click();await page.locator('[data-action="navigate"][data-view="settings"]').click();await page.locator('[data-action="open-setup"]').click();
    const watched=path.join(second,'自动发现的故事');fs.mkdirSync(watched);fs.copyFileSync(executable,path.join(watched,'new.exe'));await wait(s=>s.games.length===4);console.log('PASS watcher automatically imports new game');
    assert.deepEqual(errors,[]);console.log('E2E ALL PASSED '+JSON.stringify({packaged:!!process.env.SHIORI_TEST_PACKAGED,output:result,rendererErrors:errors}));
  }finally{
    // Our off-screen fixture exits by itself after eight seconds.
    if(launchedAt&&Date.now()-launchedAt<8500)await new Promise(r=>setTimeout(r,8500-(Date.now()-launchedAt)));
    await app.evaluate(({app})=>app.quit()).catch(()=>{});
    await app.close().catch(()=>{});
    fs.rmSync(fixture,{recursive:true,force:true});
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
