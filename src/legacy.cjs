const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFile}=require('node:child_process');
function needsInstallPathCompatibility(game){
 if(!/^AI5WIN\.exe$/i.test(path.basename(game.launchPath||'')))return false;
 for(const name of ['reg64.bat','reg32.bat'])try{if(/HKLM\\SOFTWARE\\(?:Wow6432Node\\)?elf\\KAKYU2/i.test(fs.readFileSync(path.join(game.folder,name),'utf8')))return true;}catch{}
 return false;
}
async function prepareLegacyLaunch(game,settings,dataDir,opticalDrive){
 if(!needsInstallPathCompatibility(game))return null;
 const optical=typeof opticalDrive==='object'&&opticalDrive?opticalDrive:{drive:opticalDrive};
 const folder=path.join(dataDir,'compatibility'),source=path.join(__dirname,'legacy-launcher.cs');fs.mkdirSync(folder,{recursive:true});
 const hash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0,12);
 const target=path.join(folder,'ShioriLegacy-'+hash+'.exe');
 const dllSource=path.join(__dirname,'compat','legacy-registry-x86.dll');
 const dllHash=crypto.createHash('sha256').update(fs.readFileSync(dllSource)).digest('hex').slice(0,12);
 const dll=path.join(folder,'legacy-registry-'+dllHash+'.dll');if(!fs.existsSync(dll))fs.copyFileSync(dllSource,dll);
 await new Promise((resolve,reject)=>execFile(require('./windows.cjs').powershellPath(),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'legacy-registry.ps1'),'-GameFolder',game.folder,'-DataFolder',dataDir,'-Drive',optical.drive||'G:'],{windowsHide:true,timeout:15000},error=>error?reject(new Error('旧游戏的用户安装资料准备失败：'+error.message)):resolve()));
 if(!fs.existsSync(target)){
  const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework','v4.0.30319','csc.exe');
  await new Promise((resolve,reject)=>execFile(compiler,['/nologo','/target:winexe','/platform:x86','/out:'+target,source],{windowsHide:true,timeout:30000},(error,stdout,stderr)=>error?reject(new Error('老游戏兼容组件生成失败：'+String(stdout||stderr||error.message).trim())):resolve()));
 }
 const args=[game.launchPath,dll];if(optical.managed&&optical.isoPath)args.push(path.join(__dirname,'disc.ps1'),optical.isoPath);
 return {file:target,args,legacy:true,options:{cwd:game.folder,detached:true,stdio:'ignore',windowsHide:false,shell:false}};
}
module.exports={needsInstallPathCompatibility,prepareLegacyLaunch};
