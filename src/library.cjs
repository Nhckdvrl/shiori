const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {scanRoots,UNIQUE}=require('./scanner.cjs');
const {createAuthorIndex}=require('./authors.cjs');
const {createSeriesIndex}=require('./series.cjs');
const {companyTags,createCompanyIndex,companySource,companyTagSource}=require('./companies.cjs');
const {communityLinks}=require('./community.cjs');
class Library extends EventEmitter {
  constructor(store,metadata,appDir){super();this.store=store;this.metadata=metadata;this.appDir=appDir;this.scanning=false;this.watchers=[];this.queue=[];this.stopped=false;}
  snapshot(tracker){
    const state=this.store.state,authors=createAuthorIndex(state.games),series=createSeriesIndex(state.games),companies=createCompanyIndex(state.games);
    return {...state,settings:{...state.settings,sidebarTags:require('./sidebar-tags.cjs').sidebarTags(state.settings,companies.resolve,authors.resolve),visibleWriters:state.settings.writerSelectionCustomized===false||!Array.isArray(state.settings.visibleWriters)?authors.authors.map(a=>a.name):UNIQUE(state.settings.visibleWriters.map(authors.resolve))},authors:authors.authors,companyEntities:companies.entities,
      games:state.games.map(g=>({...g,companyTagSources:Object.fromEntries(companyTags(g,companies.resolve).map(name=>[name,companyTagSource(g,name,companies.resolve)])),companySource:companySource(g),community:communityLinks(g),displayTitle:g.customTitle||g.metadata?.title||g.title,tags:{folders:g.folderTags.folders,companies:companyTags(g,companies.resolve),writers:authors.forGame(g.id),series:series.get(g.id)||[],genres:UNIQUE(g.bangumiCompanyCredits?.subjectTags||g.metadata?.genres||[]),custom:g.userTags||[]}})),
      companyRefreshing:!!this.companyWorking,active:tracker?.list()||[],monitor:tracker?.health||'starting',scanning:this.scanning,metadataProgress:this.metadataProgress||null};
  }
  async scan(){
    if(this.scanning){this.rescanRequested=true;return;}this.scanning=true;this.emit('update');
    try {
      const result=await scanRoots(this.store.state.settings.roots,[this.appDir,this.store.dir]);
      const existing=new Map(this.store.state.games.map(g=>[g.id,g])),ids=new Set(result.games.map(g=>g.id));let added=0;
      for(const g of result.games){const old=existing.get(g.id);if(old){Object.assign(old,{candidates:g.candidates,localCover:g.localCover,missing:false,folderTags:g.folderTags});if(!old.manualLaunch){old.launchPath=g.launchPath;old.confidence=g.confidence;}}
      else {this.store.state.games.push({...g,addedAt:new Date().toISOString(),status:'unplayed',playSeconds:0,favorite:false,userTags:[],userCompanies:[],userWriters:[],notes:'',metadataState:'pending'});added++;}}
      for(const g of this.store.state.games){
        if(g.manualImport){g.missing=!fs.existsSync(g.launchPath);continue;}
        if(!ids.has(g.id)&&this.store.state.settings.roots.some(root=>require('./scanner.cjs').isInside(root,g.folder))&&!result.warnings.some(w=>require('./scanner.cjs').isInside(w.path,g.folder)))g.missing=true;
      }
      const unlabelled=this.store.state.games.filter(g=>!g.missing&&!g.metadata&&g.kind==='windows'&&!g.executableInfoChecked);
      if(unlabelled.length){const info=await require('./executable-info.cjs').executableInfo(unlabelled.map(g=>g.launchPath));for(const g of unlabelled){g.executableInfo=info.find(x=>x.path===g.launchPath)||null;g.executableInfoChecked=true;}}
      if(!Array.isArray(this.store.state.settings.visibleWriters))this.store.state.settings.visibleWriters=UNIQUE(this.store.state.games.flatMap(g=>g.folderTags.writers||[]));
      if(typeof this.store.state.settings.showWriterFilters!=='boolean')this.store.state.settings.showWriterFilters=true;
      this.store.state.lastScan={at:new Date().toISOString(),added,total:result.games.length,warnings:result.warnings,visited:result.visited};this.store.save();
      this.enqueue();return this.store.state.lastScan;
    }finally{this.scanning=false;this.emit('update');if(this.rescanRequested&&!this.stopped){this.rescanRequested=false;setImmediate(()=>this.scan().catch(e=>this.emit('warning',e.message)));}}
  }
  async addRoots(paths){
    if(!Array.isArray(paths)||paths.length>100)throw new Error('游戏目录无效');
    const {isInside}=require('./scanner.cjs'),selected=[];
    for(const input of paths){
      if(typeof input!=='string'||!path.isAbsolute(input))throw new Error('请选择完整的游戏目录');
      const dir=fs.realpathSync(input);if(!fs.statSync(dir).isDirectory())throw new Error('请选择文件夹');
      if(isInside(this.appDir,dir)||isInside(this.store.dir,dir))throw new Error('请选择游戏所在目录');
      selected.push(dir);
    }
    let roots=[...this.store.state.settings.roots];
    for(const dir of selected){if(roots.some(root=>isInside(root,dir)))continue;roots=roots.filter(root=>!isInside(dir,root));roots.push(dir);}
    this.store.state.settings.roots=roots;this.store.save();this.startWatch();await this.scan();return true;
  }
  removeRoot(root){
    if(typeof root!=='string'||!this.store.state.settings.roots.includes(root))throw new Error('游戏目录不存在');
    this.store.state.settings.roots=this.store.state.settings.roots.filter(p=>p!==root);
    this.store.save();this.startWatch();this.emit('update');return true;
  }
  async registerExecutable(file){
    if(typeof file!=='string'||!path.isAbsolute(file)||!/^\.exe$/i.test(path.extname(file))||!fs.statSync(file).isFile())throw new Error('请选择游戏的 EXE 启动文件');
    const {isInside,cleanTitle,inferTags}=require('./scanner.cjs'),folder=path.dirname(file);
    if(isInside(this.appDir,file)||isInside(this.store.dir,file))throw new Error('请选择游戏的启动程序');
    const found=await scanRoots([folder],[this.appDir,this.store.dir]);
    const root=this.store.state.settings.roots.find(p=>isInside(p,folder))||folder;
    const entry=found.games.find(g=>g.folder===folder)||{id:require('node:crypto').createHash('sha256').update(path.resolve(folder).toLowerCase()).digest('hex').slice(0,20),title:cleanTitle(path.basename(folder)),folder,root,relativePath:path.relative(root,folder),folderTags:inferTags(path.relative(root,folder).split(path.sep).filter(Boolean)),candidates:[],kind:'windows',localCover:null};
    if(!entry.candidates.some(c=>c.path===file))entry.candidates.unshift({path:file,name:path.basename(file),score:0,size:fs.statSync(file).size});
    let game=this.store.state.games.find(g=>g.id===entry.id);
    if(!game){game={...entry,addedAt:new Date().toISOString(),status:'unplayed',playSeconds:0,favorite:false,userTags:[],userCompanies:[],userWriters:[],notes:'',metadataState:'pending'};this.store.state.games.push(game);}
    Object.assign(game,{launchPath:file,candidates:entry.candidates,manualLaunch:true,manualImport:true,confidence:'high',missing:false,hidden:false});
    this.store.save();this.enqueue();this.emit('update');return game.id;
  }
  startWatch(){
    for(const w of this.watchers)w.close();this.watchers=[];clearInterval(this.interval);clearTimeout(this.debounce);
    for(const root of this.store.state.settings.roots)try{const w=fs.watch(root,{recursive:true},(event,name)=>{
      if(!name||[this.appDir,this.store.dir].some(exclude=>require('./scanner.cjs').isInside(exclude,path.join(root,name))))return;
      // Save files change frequently: only changes to executable/ROM names or directories trigger rescans.
      if(event==='rename' || /\.(?:exe|xci|nsp|iso|cso|nds|3ds|cia)$/i.test(String(name))){clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.scan().catch(e=>this.emit('warning',e.message)),7000);}
    });w.on('error',e=>this.emit('warning',`目录监听：${e.message}`));this.watchers.push(w);}catch(e){this.emit('warning',`无法监听 ${root}：${e.message}`);}
    this.interval=setInterval(()=>this.scan().catch(e=>this.emit('warning',e.message)),this.store.state.settings.scanInterval*1000);
  }
  async audit(){
    const report=[];
    for(const g of this.store.state.games.filter(g=>g.metadata)){
      if(g.metadata.source==='VNDB'){if(!g.autoFanUrl)await this.metadata.findFan(g,[g.metadata.originalTitle,g.metadata.title]);continue;}
      const item=await this.metadata.json(`https://api.bgm.tv/v0/subjects/${g.metadata.id}`);
      const platforms=(item.infobox||[]).filter(i=>i.key==='平台').flatMap(i=>Array.isArray(i.value)?i.value.map(v=>v.v):[i.value]).join(' ');
      const {candidateScore,ALIASES}=require('./metadata.cjs');const titleScore=candidateScore(g,item,ALIASES[g.title]||g.title);
      const valid=item.type===4 && titleScore>=.94 && !(g.kind==='windows'&&platforms&&!/PC|Windows|Win|电脑/i.test(platforms)) && !(g.kind==='rom'&&/\.(xci|nsp)$/i.test(g.launchPath)&&platforms&&!/Switch|^NS$/i.test(platforms));
      report.push({gameId:g.id,title:g.title,subjectId:item.id,type:item.type,titleScore,platform:platforms,valid});
      if(!valid&&g.metadata.matchMethod!=='manual'){g.metadata=null;g.metadataState='pending';delete g.autoFanUrl;delete g.fanMatch;}
      else{g.metadata.type=4;g.metadata.source='Bangumi';g.metadata.platforms=platforms;g.metadata.auditedAt=new Date().toISOString();if(!g.autoFanUrl)await this.metadata.findFan(g,[g.metadata.originalTitle,g.metadata.title]);}
      this.store.save();this.emit('update');
    }
    this.enqueue();return report;
  }
  enqueue(retry=false){if(!this.store.state.settings.autoMetadata || this.stopped)return;for(const g of this.store.state.games)if(!g.missing&&!g.hidden&&!g.metadata && (g.metadataState==='pending'||retry) && !this.queue.includes(g.id) && this.currentId!==g.id)this.queue.push(g.id);this.work();}
  async work(){
    if(this.working)return;this.working=true;const total=this.queue.length;let done=0;
    this.queue.sort((a,b)=>{const priority=id=>this.store.state.games.find(g=>g.id===id)?.localCover?3:(this.store.state.games.find(g=>g.id===id)?.title.length<=6&&this.store.state.games.find(g=>g.id===id)?.folderTags.companies.length)?2:/白日梦|白昼夢|rewrite$|WHITE ALBUM2$|樱之诗|樱之刻|Aokana$|素晴日|MUSICUS/.test(this.store.state.games.find(g=>g.id===id)?.title||'')?1:0;return priority(b)-priority(a);});
    while(this.queue.length&&!this.stopped&&this.store.state.settings.autoMetadata){
      const id=this.queue.shift();this.currentId=id;const g=this.store.state.games.find(x=>x.id===id);if(!g||g.metadata)continue;
      this.metadataProgress={done,total:Math.max(total,done+this.queue.length+1),title:g.title};this.emit('update');
      const before=g.metadata,draft=structuredClone(g);
      try{await this.metadata.auto(draft);draft.metadataError=null;}catch(e){draft.metadataState='error';draft.metadataError=e.message;draft.metadataCheckedAt=new Date().toISOString();}
      // A manual choice made while an automatic request is in flight wins.
      if(g.metadata===before)for(const key of ['metadata','metadataState','metadataError','metadataCheckedAt','suggestions','autoFanUrl','fanMatch','fanMetadata'])if(key in draft)g[key]=draft[key];
      this.store.save();done++;this.emit('update');await new Promise(r=>setTimeout(r,550));
    }
    if(this.store.state.settings.autoMetadata)await this.enrichCompanies();
    const companyChecks=this.store.state.games.filter(g=>!g.bangumiCompanyCredits&&g.kind==='windows'&&g.metadata?.source==='VNDB'&&g.metadata.companies?.length>1&&!g.metadata.companyCredits&&!g.folderTags?.companies?.length);
    for(const g of companyChecks){if(this.stopped)break;try{await this.metadata.companyCredits(g);this.store.save();this.emit('update');}catch{}}
    const credits=this.store.state.games.filter(g=>g.metadata&&g.autoFanUrl&&!g.fanMetadata);let checked=0;
    for(const g of credits){if(this.stopped||!this.store.state.settings.autoMetadata)break;this.metadataProgress={done:checked++,total:credits.length,title:'补充剧本署名 · '+g.title};this.emit('update');await this.metadata.fanCredits(g);this.store.save();await new Promise(r=>setTimeout(r,350));}
    this.working=false;this.currentId=null;this.metadataProgress=null;this.emit('update');
  }
  async enrichCompanies(force=false){
    if(this.companyWorking){if(force)this.companyForcePending=true;return;}
    if(typeof this.metadata.bangumiCompanies!=='function')return;
    this.companyWorking=true;
    try{
      const games=this.store.state.games.filter(g=>g.metadata&&!g.hidden&&(force||!g.bangumiCompanyCredits?.complete&&(!g.companyCheckedAt||Date.now()-Date.parse(g.companyCheckedAt)>86400000)));
      let done=0;
      for(const game of games){
        if(this.stopped||!force&&!this.store.state.settings.autoMetadata)break;
        const before=game.metadata;this.metadataProgress={done:done++,total:games.length,title:'核对 Bangumi 会社 · '+game.title};this.emit('update');
        try{const result=await this.metadata.bangumiCompanies(structuredClone(game),force);if(game.metadata===before){if(result)game.bangumiCompanyCredits=result;game.companyCheckedAt=new Date().toISOString();game.companyError=null;}}
        catch(error){if(game.metadata===before){game.companyError=error.message;game.companyCheckedAt=new Date().toISOString();}}
        this.store.save();this.emit('update');
      }
    }finally{this.companyWorking=false;this.metadataProgress=null;this.emit('update');if(this.companyForcePending&&!this.stopped){this.companyForcePending=false;setImmediate(()=>this.enrichCompanies(true).catch(error=>this.emit('warning',error.message)));}}
  }
  close(){this.stopped=true;for(const w of this.watchers)w.close();clearInterval(this.interval);clearTimeout(this.debounce);}
}
module.exports={Library};
