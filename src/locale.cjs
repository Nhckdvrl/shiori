const fs=require('node:fs');const path=require('node:path');
function findLocaleEmulator(configured,{env=process.env,searchDirectories}={}){
  if(configured)try{if(fs.statSync(configured).isFile()&&/^LEProc\.exe$/i.test(path.basename(configured)))return configured;}catch{}
  const bases=searchDirectories||[env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs')].filter(Boolean);
  for(const base of bases){try{for(const dir of fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&/locale[ ._-]*emulator|^le$/i.test(d.name))){const exe=path.join(base,dir.name,'LEProc.exe');if(fs.existsSync(exe))return exe;}}catch{}}
  return null;
}
function launchWithLocale(game,settings,exe,args){
  if(!game.useLocaleEmulator)return {exe,args};
  const le=findLocaleEmulator(settings.localeEmulatorPath);
  if(!le)throw new Error('未找到 Locale Emulator，请在偏好设置中选择 LEProc.exe');
  // Passing the executable directly uses its own profile, then the configured
  // global profile, and finally the documented default Japanese profile.
  return {exe:le,args:[exe,...args]};
}
module.exports={findLocaleEmulator,launchWithLocale};
