const {execFile}=require('node:child_process');const {promisify}=require('node:util');const path=require('node:path');const fs=require('node:fs');
const exec=promisify(execFile);
function needsOpticalDrive(game){
  if(game.compatibility?.virtualDisc===true)return true;
  // An explicit engine configuration plus its shipped instructions is evidence,
  // rather than guessing from a game's age or title.
  const ini=path.join(game.folder,'AI5WIN.INI');
  if(!fs.existsSync(ini))return false;
  const raw=fs.readFileSync(ini).toString('latin1');
  if(!/StdCDDrive\s*=\s*NOCDDRV/i.test(raw))return false;
  return fs.readdirSync(game.folder).filter(n=>/readme|请读我/i.test(n)&&/\.txt$/i.test(n)).some(n=>{
    try{const text=fs.readFileSync(path.join(game.folder,n)).toString('latin1');return /No CD-ROM drive found/i.test(text);}catch{return false;}
  });
}
async function ensureOpticalDrive(dataDir,{preferOwn=false}={}){
  const iso=path.join(dataDir,'compatibility','legacy-optical.iso');
  try{const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'disc.ps1'),'-Mode','ensure','-IsoPath',iso];if(preferOwn)args.push('-PreferOwn');const {stdout}=await exec(require('./windows.cjs').powershellPath(),args,{windowsHide:true,timeout:45000,maxBuffer:1024*1024});return JSON.parse(stdout.trim());}
  catch(e){throw new Error('旧引擎的光驱环境准备失败：'+(e.stderr?.trim()||e.message));}
}
async function releaseOpticalDrive(dataDir,gamePath='',ignorePid=0){
  const iso=path.join(dataDir,'compatibility','legacy-optical.iso');
  if(!fs.existsSync(iso))return {ok:true,unmounted:false};
  const {stdout}=await exec(require('./windows.cjs').powershellPath(),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'disc.ps1'),'-Mode','release','-IsoPath',iso,'-GamePath',gamePath,'-IgnorePid',String(ignorePid)],{windowsHide:true,timeout:20000,maxBuffer:1024*1024});
  return JSON.parse(stdout.trim());
}
module.exports={needsOpticalDrive,ensureOpticalDrive,releaseOpticalDrive};
