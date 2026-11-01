const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),appRoot=process.env.SHIORI_TEST_APP_ROOT||root,dir=path.join(root,'test-results','shared-tags-'+Date.now());
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const games=[0,1,2].map(n=>({id:'fixture-'+n,title:'示例作品'+n,folder:path.join(dir,'games',String(n)),launchPath:path.join(dir,'games',String(n),'game.exe'),kind:'windows',candidates:[],missing:false,folderTags:{folders:['自己的目录'],companies:['错误目录分类'],writers:[]},userTags:['想重温'],status:n?'unplayed':'completed',playSeconds:120+n,notes:'保留手记',metadataState:'matched',metadata:{id:2288,source:'Bangumi',title:'示例作品'+n,companies:['错误旧资料'],writers:['未固定的脚本家'+n],genres:['剧情','悬疑']},bangumiCompanyCredits:{complete:true,version:1,source:'Bangumi',subjectId:2288,url:'https://bgm.tv/subject/2288',developers:['minori'],brands:[],publishers:['MangaGamer'],entities:[{id:3615,name:'minori',type:2,aliases:['minori','中二社','株式会社ミノリ'],roles:['开发'],url:'https://bgm.tv/person/3615'}],subjectTags:['剧情','悬疑']}}));
 fs.writeFileSync(path.join(dir,'library.json'),JSON.stringify({version:1,settings:{roots:[],autoMetadata:false,scanInterval:60,onboardingCompleted:true,showWriterFilters:true,visibleWriters:[]},games,sessions:[],lastScan:null}));
 const env={...process.env,SHIORI_DATA_DIR:dir,SHIORI_BACKGROUND_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.SHIORI_ROOT;
 const app=await electron.launch({executablePath:process.env.SHIORI_TEST_PACKAGED||require('electron'),args:process.env.SHIORI_TEST_PACKAGED?[]:[appRoot],env,timeout:45000});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.game-card');assert.equal(await page.locator('.sidebar .category').count(),0);
  await page.locator('.nav [data-view="tags"]').click();assert.equal(await page.locator('.tag-entry').count(),1);assert.ok((await page.locator('.tag-entry').innerText()).includes('Bangumi'));
  await page.locator('#tag-query').fill('中二社');assert.equal(await page.locator('.tag-entry').count(),1);await page.getByLabel('固定到侧栏：minori',{exact:true}).check();assert.equal(await page.locator('.sidebar .category').count(),0);
  await page.locator('[data-action="save-sidebar-tags"]').click();await page.waitForSelector('.sidebar .category[data-value="minori"]');assert.equal(await page.locator('.sidebar .category').count(),1);
  await page.locator('#tag-query').fill('');await page.locator('[data-action="tag-type"][data-type="writers"]').click();assert.equal(await page.locator('.tag-entry').count(),3);
  await page.getByLabel('固定到侧栏：未固定的脚本家1',{exact:true}).check();await page.locator('[data-action="save-sidebar-tags"]').click();await page.waitForSelector('.sidebar .category[data-value="未固定的脚本家1"]');
  await page.locator('[data-action="tag-type"][data-type="genres"]').click();assert.equal(await page.locator('.tag-entry').count(),2);assert.equal(await page.locator('.sidebar .category[data-type="genres"]').count(),0);
  await page.getByLabel('固定到侧栏：悬疑',{exact:true}).check();await page.locator('[data-action="reset-sidebar-tags"]').click();assert.equal(await page.getByLabel('固定到侧栏：悬疑',{exact:true}).isChecked(),false);
  await page.locator('[data-action="tag-type"][data-type="companies"]').click();await page.locator('.tag-entry details').evaluate(e=>e.open=true);
  const capture=app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));
  const png=await Promise.race([capture,new Promise(resolve=>setTimeout(()=>resolve(null),8000))]);if(png)fs.writeFileSync(path.join(dir,'tag-manager.png'),Buffer.from(png,'base64'));
  await page.reload();await page.waitForSelector('.sidebar .category[data-value="minori"]');assert.equal(await page.locator('.sidebar .category').count(),2);
  const result=await page.evaluate(()=>window.shiori.getLibrary());for(const g of result.games){assert.equal(g.playSeconds,120+Number(g.id.slice(-1)));assert.equal(g.notes,'保留手记');assert.equal(g.status,g.id==='fixture-0'?'completed':'unplayed');assert.deepEqual(g.tags.companies,['minori']);assert.ok(!g.tags.companies.includes('MangaGamer'));}
  assert.deepEqual(errors,[]);console.log('SHARED TAGS PASSED '+JSON.stringify({selfVersion:appRoot!==root,packaged:!!process.env.SHIORI_TEST_PACKAGED,allWritersVisible:true,onlySavedTagsInSidebar:true,aliases:true,bangumiPrimary:true,recordsPreserved:true,screenshot:path.join(dir,'tag-manager.png')}));
 }finally{await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
