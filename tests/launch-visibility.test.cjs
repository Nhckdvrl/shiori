const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFileSync,spawn}=require('node:child_process');
const {gameLaunchSpec,spawnGame,exitErrorMessage}=require('../src/launch.cjs');
const {findLocaleEmulator}=require('../src/locale.cjs');
const windows=process.platform==='win32';
let executable,dir;
async function reportFor(child,file){
 const exit=new Promise(resolve=>child.once('exit',resolve));child.on('error',e=>{throw e;});
 const until=Date.now()+10000;while(!fs.existsSync(file)&&Date.now()<until)await new Promise(r=>setTimeout(r,50));
 assert.ok(fs.existsSync(file),'The native GUI fixture must produce a startup report');
 const lines=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/);await exit;
 return {visible:lines.includes('visible=True'),show:lines.find(s=>s.startsWith('show=')),args:lines.filter(s=>s.startsWith('arg=')).map(s=>Buffer.from(s.slice(4),'base64').toString('utf8'))};
}
test('native WinMain visibility across ordinary, LE and emulator launch paths',{skip:!windows,timeout:45000},async t=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'shiori-visible-'));const gameDir=path.join(dir,'会社 空格');fs.mkdirSync(gameDir);executable=path.join(gameDir,'test game.exe');
 const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 execFileSync(compiler,['/nologo','/target:winexe','/platform:x86','/out:'+executable,path.join(__dirname,'visible-game.cs')],{windowsHide:true});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 await t.test('negative control reproduces the original hidden-game bug',async()=>{
   const report=path.join(dir,'hidden.txt');const child=spawn(executable,['2'],{cwd:gameDir,stdio:'ignore',windowsHide:true,env:{...process.env,SHIORI_FIXTURE_REPORT:report}});
   assert.equal((await reportFor(child,report)).visible,false);
 });
 const modes=[{name:'ordinary game',game:{kind:'windows',launchPath:executable,folder:gameDir,launchArgs:['2']}}];
 const le=findLocaleEmulator(process.env.SHIORI_TEST_LE_PATH);if(le)modes.push({name:'installed Locale Emulator',game:{kind:'windows',launchPath:executable,folder:gameDir,launchArgs:['2'],useLocaleEmulator:true},settings:{localeEmulatorPath:le}});
 const rom=path.join(gameDir,'测试 镜像.xci');fs.writeFileSync(rom,'disposable emulator argument fixture');
 modes.push({name:'emulator launch with a spaced Unicode ROM path',game:{kind:'rom',launchPath:rom,emulatorPath:executable,folder:gameDir,launchArgs:['2']}});
 for(const [i,mode] of modes.entries())await t.test(mode.name,async()=>{
   const report=path.join(dir,'visible-'+i+'.txt'),spec=gameLaunchSpec(mode.game,mode.settings);spec.options.env={...process.env,SHIORI_FIXTURE_REPORT:report};
   const result=await reportFor(spawnGame(spec),report);assert.equal(result.visible,true);if(mode.game.kind==='rom')assert.deepEqual(result.args,['2',rom]);
 });
});
test('failure messages distinguish Windows loader errors',()=>{
 assert.match(exitErrorMessage(0xC0000135),/DLL/);assert.match(exitErrorMessage(-1073741701),/位数/);assert.equal(exitErrorMessage(0),null);
});
