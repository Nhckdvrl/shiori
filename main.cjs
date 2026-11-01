const {app,BrowserWindow,ipcMain,protocol,net,dialog,shell,Tray,Menu,nativeImage,powerMonitor,safeStorage}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {gameLaunchSpec,spawnGame,launchErrorMessage,exitErrorMessage,executableArchitecture}=require('./src/launch.cjs');
const {Store}=require('./src/store.cjs');
const {Library}=require('./src/library.cjs');
const {Metadata}=require('./src/metadata.cjs');
const {Tracker}=require('./src/tracker.cjs');
const {isInside}=require('./src/scanner.cjs');
const {needsOpticalDrive,ensureOpticalDrive,releaseOpticalDrive}=require('./src/disc.cjs');
const {findLocaleEmulator}=require('./src/locale.cjs');
const appDir=__dirname;
const dataDir=require('./src/profile.cjs').profileDirectory({appDir,exePath:app.getPath('exe'),appData:app.getPath('appData'),isPackaged:app.isPackaged});
app.setPath('userData',path.join(dataDir,'chromium'));
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setName('Shiori Open Source');if(process.platform==='win32')app.setAppUserModelId('org.shiori.launcher.opensource');
let win,store,library,tracker,tray,quitting=false,pushTimer,bangumiToken=null;
const starting=new Set();
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{win?.show();win?.focus();});
function broadcast(){if(pushTimer)return;pushTimer=setTimeout(()=>{pushTimer=null;if(win&&!win.isDestroyed())win.webContents.send('library:changed');},350);}
function warning(text){if(win&&!win.isDestroyed())win.webContents.send('app:warning',text);}
function game(id){const g=store.state.games.find(g=>g.id===id);if(!g)throw new Error('游戏不存在，请刷新游戏库');return g;}
function register(name,fn){ipcMain.handle(name,async(event,...args)=>{
  if(event.sender!==win?.webContents || !event.senderFrame?.url.startsWith('app://shiori/'))throw new Error('无效的请求来源');
  try{return await fn(...args);}catch(e){console.error(name,e);throw new Error(e.message);}
});}
function createWindow(){
  win=new BrowserWindow({width:1420,height:940,minWidth:1050,minHeight:720,show:false,frame:false,backgroundColor:'#f8f9fc',title:'栞 Shiori · Galgame 收藏馆',icon:path.join(appDir,'public','icon.png'),
    webPreferences:{preload:path.join(appDir,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false,backgroundThrottling:!process.env.SHIORI_BACKGROUND_TEST}});
  win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('app://shiori/'))e.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((webContents,permission,callback)=>callback(false));
  win.loadURL('app://shiori/index.html?v=0.5.0');win.once('ready-to-show',()=>{if(!process.env.SHIORI_BACKGROUND_TEST)win.show();});
  win.on('close',e=>{if(!quitting&&tracker.active.size){e.preventDefault();win.hide();if(tray)tray.displayBalloon({title:'栞仍在记录游戏时间',content:'游戏结束后会自动保存。点击托盘图标可以重新打开。'});}});
  win.on('closed',()=>{win=null;if(!tracker.active.size||quitting)app.quit();});
}
async function launch(id){
  const g=game(id);if(tracker.active.has(id)||starting.has(id))throw new Error('这个游戏已经在运行或启动中');
  if(g.missing)throw new Error('未找到游戏文件，请检查磁盘或重新扫描');
  if(g.kind==='rom'&&!g.emulatorPath)throw new Error('请先在「编辑资料 → 启动设置」中选择模拟器');
  starting.add(id);
  let optical=null;
  try{
    optical=needsOpticalDrive(g)?await ensureOpticalDrive(dataDir):null;
    const exe=g.kind==='rom'?g.emulatorPath:g.launchPath;
    if(!/\.exe$/i.test(exe)||!fs.existsSync(exe))throw new Error('启动程序不存在，请在编辑资料中重新选择');
    if(g.useLocaleEmulator&&executableArchitecture(exe)==='x64')throw new Error('这个启动程序是 64 位，Locale Emulator 仅支持 32 位。请选择游戏的 x86 版本，或关闭 LE 转区启动。');
    const baseline=tracker.processes.filter(p=>isInside(g.folder,p.path)).map(p=>p.id);
    if(baseline.length)throw new Error('检测到该游戏目录已有进程在运行，请先关闭游戏后再从栞启动');
    const spec=await require('./src/legacy.cjs').prepareLegacyLaunch(g,store.state.settings,dataDir,optical)||gameLaunchSpec(g,store.state.settings);
    g.lastLaunchIssue=null;
    const child=spawnGame(spec);
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',e=>reject(new Error(launchErrorMessage(e))));});
    if(optical?.managed)child.once('exit',()=>releaseOpticalDrive(dataDir,g.launchPath,child.pid).catch(error=>warning('临时光驱卸载失败：'+error.message)));
    tracker.begin(g,child.pid,baseline,g.kind==='rom'?g.emulatorPath:null);
    child.once('exit',code=>{const message=exitErrorMessage(code),run=tracker.active.get(id);if(message&&run&&!run.windowSeen){g.lastLaunchIssue={kind:'exit-code',message,at:new Date().toISOString()};store.save();warning(message);broadcast();}});
    child.unref();broadcast();return {ok:true};
  }catch(error){if(optical?.managed)await releaseOpticalDrive(dataDir,g.launchPath).catch(()=>{});g.lastLaunchIssue={kind:'launch-error',message:error.message,at:new Date().toISOString()};store.save();broadcast();throw error;}finally{starting.delete(id);}
}
async function setup(){
  store=new Store(dataDir,process.env.SHIORI_ROOT);
  if((store.state.settings.metadataPolicyVersion||0)<5){for(const g of store.state.games)if(!g.metadata)g.metadataState='pending';store.state.settings.metadataPolicyVersion=5;}
  store.state.settings.localeEmulatorPath=findLocaleEmulator(store.state.settings.localeEmulatorPath);
  const legacyGame=store.state.games.find(g=>require('./src/legacy.cjs').needsInstallPathCompatibility(g));
  if(legacyGame)await releaseOpticalDrive(dataDir,legacyGame.launchPath).catch(error=>console.error('optical-recovery',error.message));
  const tokenFile=path.join(dataDir,'bangumi-token.encrypted');
  if(fs.existsSync(tokenFile)&&safeStorage.isEncryptionAvailable()){try{bangumiToken=safeStorage.decryptString(fs.readFileSync(tokenFile));}catch{}}
  store.state.settings.hasBangumiToken=!!bangumiToken;
  library=new Library(store,new Metadata((...args)=>net.fetch(...args),path.join(dataDir,'covers'),()=>bangumiToken),app.isPackaged?path.dirname(app.getPath('exe')):appDir);
  tracker=new Tracker(store);library.on('update',broadcast);tracker.on('update',broadcast);library.on('warning',warning);tracker.on('warning',warning);
  protocol.handle('app',request=>{
    const url=new URL(request.url);let file;
    if(url.hostname!=='shiori')return new Response('Not found',{status:404});
    if(url.pathname.startsWith('/cover/')){const g=store.state.games.find(g=>g.id===url.pathname.split('/')[2]);file=g?.customCover||g?.metadata?.cover||g?.localCover;}
    else {const allowed={'/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/icon.png':'icon.png','/fonts/NotoSansSC-VF.woff2':'fonts/NotoSansSC-VF.woff2','/fonts/MiSans-Regular.woff2':'fonts/MiSans-Regular.woff2','/fonts/MiSans-Medium.woff2':'fonts/MiSans-Medium.woff2','/fonts/MiSans-Demibold.woff2':'fonts/MiSans-Demibold.woff2','/fonts/MiSans-Bold.woff2':'fonts/MiSans-Bold.woff2','/fonts/SmileySans.woff2':'fonts/SmileySans.woff2'};const name=allowed[url.pathname];if(name)file=path.join(appDir,'public',name);}
    if(!file||!fs.existsSync(file))return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(file).href);
  });
  register('library:get',()=>library.snapshot(tracker));
  register('library:scan',()=>library.scan());
  register('game:launch',launch);
  register('game:update',(id,patch)=>{
    const g=game(id);const allowed=['customTitle','status','favorite','notes','hidden','userTags','userCompanies','userWriters','userSeries','autoSeries','launchArgs','bangumiUrl','vndbUrl','fanUrl','historicalSeconds','useLocaleEmulator','showWriterTags'];
    for(const k of Object.keys(patch)){if(!allowed.includes(k))throw new Error('不支持的资料字段');}
    if(patch.status&&!['unplayed','playing','completed','onhold','dropped'].includes(patch.status))throw new Error('无效的游玩状态');
    for(const k of ['userTags','userCompanies','userWriters','userSeries','launchArgs'])if(k in patch&&(!Array.isArray(patch[k])||patch[k].length>100||patch[k].some(x=>typeof x!=='string'||x.length>4000)))throw new Error('标签或启动参数无效');
    for(const k of ['favorite','hidden','useLocaleEmulator','showWriterTags','autoSeries'])if(k in patch&&typeof patch[k]!=='boolean')throw new Error('无效的开关');
    for(const k of ['customTitle','notes','bangumiUrl','vndbUrl','fanUrl'])if(k in patch&&(typeof patch[k]!=='string'||patch[k].length>50000))throw new Error('文本内容无效');
    const {canonicalSubject,canonicalFan}=require('./src/community.cjs');
    for(const [key,provider] of [['bangumiUrl','Bangumi'],['vndbUrl','VNDB'],['fanUrl','2DFan']])if(patch[key]){const canonical=key==='fanUrl'?canonicalFan(patch[key]):canonicalSubject(patch[key],provider);if(!canonical)throw new Error(`请输入正确的 ${provider} 作品信息页链接`);patch[key]=canonical;}
    if('historicalSeconds' in patch){if(typeof patch.historicalSeconds!=='number'||!Number.isFinite(patch.historicalSeconds)||patch.historicalSeconds<0||patch.historicalSeconds>1e9)throw new Error('历史游玩时长无效');g.playSeconds=Math.max(0,(g.playSeconds||0)-(g.historicalSeconds||0))+patch.historicalSeconds;}
    Object.assign(g,patch);store.save();broadcast();return true;
  });
  register('game:bulk-status',(ids,status)=>{
    if(!Array.isArray(ids)||ids.length>10000||!['unplayed','playing','completed','onhold','dropped'].includes(status))throw new Error('批量状态无效');
    const games=[...new Set(ids)].map(game);for(const g of games)g.status=status;store.save();broadcast();return games.length;
  });
  register('game:choose-exe',async(id,emulator=false)=>{
    const g=game(id);if(tracker.active.has(id))throw new Error('请先结束当前计时后再修改启动程序');
    const r=await dialog.showOpenDialog(win,{title:emulator?'选择模拟器':'选择游戏启动程序',defaultPath:g.folder,properties:['openFile'],filters:[{name:'Windows 程序',extensions:['exe']}]});
    if(r.canceled)return null;if(!/\.exe$/i.test(r.filePaths[0]))throw new Error('请选择 exe 程序');
    if(emulator)g.emulatorPath=r.filePaths[0];else{g.launchPath=r.filePaths[0];g.manualLaunch=true;g.confidence='high';}
    store.save();broadcast();return r.filePaths[0];
  });
  register('game:set-candidate',(id,file)=>{const g=game(id);if(tracker.active.has(id))throw new Error('请先结束当前计时');if(!g.candidates.some(c=>c.path===file))throw new Error('请选择扫描得到的启动程序');g.launchPath=file;g.manualLaunch=true;g.confidence='high';store.save();broadcast();});
  register('game:choose-cover',async id=>{
    const g=game(id);const r=await dialog.showOpenDialog(win,{title:'选择封面',properties:['openFile'],filters:[{name:'图片',extensions:['jpg','jpeg','png','webp']}]});if(r.canceled)return false;
    const source=r.filePaths[0],ext=path.extname(source).toLowerCase();if(!['.jpg','.jpeg','.png','.webp'].includes(ext))throw new Error('图片格式不支持');
    if(fs.statSync(source).size>15*1024*1024)throw new Error('请选择小于 15 MB 的图片');fs.mkdirSync(path.join(dataDir,'covers'),{recursive:true});g.customCover=path.join(dataDir,'covers',`${id}-custom${ext}`);fs.copyFileSync(source,g.customCover);store.save();broadcast();return true;
  });
  register('game:folder',id=>shell.openPath(game(id).folder));
  register('game:pause',id=>tracker.pause(id));
  register('game:finish',id=>tracker.finish(id));
  register('metadata:search',(id,query,provider='all')=>library.metadata.searchDetailed(game(id),String(query||'').slice(0,300),{provider,manual:true}));
  const matching=new Set();
  register('metadata:apply',async(id,subject)=>{
    if(matching.has(id))throw new Error('正在保存匹配结果，请稍候');matching.add(id);
    try{const g=game(id),draft=structuredClone(g);for(const key of ['autoFanUrl','fanMatch','fanMetadata'])delete draft[key];
      await library.metadata.apply(draft,subject);
      for(const key of ['metadata','metadataState','metadataCheckedAt','autoFanUrl','fanMatch','fanMetadata']){delete g[key];if(key in draft)g[key]=draft[key];}
      // Explicit links belong to the old association and must not override the new one.
      delete g.bangumiUrl;delete g.vndbUrl;delete g.fanUrl;
      delete g.bangumiCompanyCredits;delete g.companyCheckedAt;
      store.save();library.enrichCompanies().catch(error=>warning(error.message));broadcast();return true;
    }finally{matching.delete(id);}
  });
  register('metadata:retry',()=>{library.enqueue(true);return true;});
  register('metadata:audit',()=>library.audit());
  register('settings:update',patch=>{if(!patch||Object.keys(patch).some(k=>!['autoMetadata','onboardingCompleted'].includes(k))||Object.values(patch).some(v=>typeof v!=='boolean'))throw new Error('无效的设置');Object.assign(store.state.settings,patch);store.save();library.enqueue();broadcast();return true;});
  register('settings:choose-locale',async()=>{const r=await dialog.showOpenDialog(win,{title:'选择 Locale Emulator 的 LEProc.exe',defaultPath:store.state.settings.localeEmulatorPath||undefined,properties:['openFile'],filters:[{name:'Locale Emulator',extensions:['exe']}]});if(r.canceled)return false;if(path.basename(r.filePaths[0]).toLowerCase()!=='leproc.exe')throw new Error('请选择 LEProc.exe');store.state.settings.localeEmulatorPath=r.filePaths[0];store.save();broadcast();return true;});
  register('settings:writers',prefs=>{if(typeof prefs.showWriterFilters!=='boolean'||!Array.isArray(prefs.visibleWriters)||prefs.visibleWriters.some(w=>typeof w!=='string'||w.length>200))throw new Error('脚本家筛选设置无效');store.state.settings.showWriterFilters=prefs.showWriterFilters;store.state.settings.visibleWriters=[...new Set(prefs.visibleWriters)];store.state.settings.writerSelectionCustomized=true;store.save();broadcast();return true;});
  register('settings:sidebar-tags',prefs=>{store.state.settings.sidebarTags=require('./src/sidebar-tags.cjs').validateSidebarTags(prefs);store.save();broadcast();return true;});
  register('metadata:companies',()=>{library.enrichCompanies(true).catch(error=>warning(error.message));return true;});
  register('settings:bangumi-token',async token=>{
    if(typeof token!=='string'||token.length>1000)throw new Error('令牌格式无效');token=token.trim();
    if(token){
      if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 加密存储暂不可用，无法保存令牌');
      const r=await net.fetch('https://api.bgm.tv/v0/me',{headers:{Authorization:`Bearer ${token}`,'User-Agent':'Shiori/0.5.0 (Windows; local visual novel library)'},signal:AbortSignal.timeout(18000)});
      if(!r.ok)throw new Error(r.status===401?'令牌无效或已过期，请重新创建 Bangumi 访问令牌':`Bangumi 验证暂未成功（HTTP ${r.status}），请稍后重试`);
      const me=await r.json();store.state.settings.bangumiUser=me.nickname||me.username;
      fs.writeFileSync(tokenFile,safeStorage.encryptString(token));
    }else{if(fs.existsSync(tokenFile))fs.unlinkSync(tokenFile);store.state.settings.bangumiUser=null;}
    bangumiToken=token||null;store.state.settings.hasBangumiToken=!!token;store.save();library.enqueue(true);broadcast();return true;
  });
  register('settings:add-root',async()=>{const r=await dialog.showOpenDialog(win,{title:'选择一个或多个游戏目录',properties:['openDirectory','multiSelections']});if(r.canceled)return false;return library.addRoots(r.filePaths);});
  register('settings:remove-root',root=>library.removeRoot(root));
  register('game:import-executable',async()=>{const r=await dialog.showOpenDialog(win,{title:'直接添加游戏启动文件',properties:['openFile'],filters:[{name:'Windows 游戏程序',extensions:['exe']}]});if(r.canceled)return null;return library.registerExecutable(r.filePaths[0]);});
  register('data:folder',()=>shell.openPath(dataDir));
  register('data:export',async()=>{const r=await dialog.showSaveDialog(win,{title:'导出游戏库与游玩记录',defaultPath:`栞游戏库-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'JSON 备份',extensions:['json']}]});if(r.canceled)return false;fs.writeFileSync(r.filePath,JSON.stringify(store.state,null,2),'utf8');return true;});
  register('external:open',async url=>{validateExternal(url);await shell.openExternal(url);});
  register('window:action',action=>{if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close')win.close();});
  createWindow();
  try{tray=new Tray(path.join(appDir,'public','icon.png'));tray.setToolTip('栞 Shiori · Galgame 收藏馆');tray.on('click',()=>{win?.show();win?.focus();});tray.setContextMenu(Menu.buildFromTemplate([{label:'打开收藏馆',click:()=>win?.show()},{label:'退出栞',click:()=>requestQuit()}]));}catch(e){console.error('Tray',e.message);}
  powerMonitor.on('resume',()=>{tracker.lastPacket=0;});
  tracker.start();await library.scan();library.startWatch();
}
function validateExternal(input){let u;try{u=new URL(input);}catch{throw new Error('请输入完整的网址');}if(u.protocol!=='https:'||!['bgm.tv','bangumi.tv','chii.in','next.bgm.tv','next.bangumi.tv','2dfan.com','www.2dfan.com','2dfan.org','www.2dfan.org','vndb.org'].includes(u.hostname)||u.username||u.password)throw new Error('仅支持 Bangumi、2DFan 和 VNDB 的 HTTPS 信息页');}
async function requestQuit(){
  if(tracker?.active.size){const r=await dialog.showMessageBox(win,{type:'question',buttons:['继续记录','退出并保存当前记录'],defaultId:0,cancelId:0,title:'游戏还在运行',message:'退出栞后将停止计时，游戏会继续运行。'});if(r.response===0)return;}
  quitting=true;app.quit();
}
app.whenReady().then(()=>{if(single)return setup();}).catch(e=>{dialog.showErrorBox('栞无法启动',e.stack||e.message);app.quit();});
app.on('before-quit',()=>{quitting=true;library?.close();tracker?.stop();});
app.on('window-all-closed',()=>{if(!tracker?.active.size)app.quit();});
