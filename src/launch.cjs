const {spawn}=require('node:child_process');
const fs=require('node:fs');
const {launchWithLocale}=require('./locale.cjs');

function gameLaunchSpec(game,settings={}){
  const executable=game.kind==='rom'?game.emulatorPath:game.launchPath;
  if(!executable)throw new Error(game.kind==='rom'?'请先选择模拟器':'请先选择游戏启动程序');
  const args=(game.launchArgs||[]).map(arg=>arg.replaceAll('{game}',game.launchPath));
  if(game.kind==='rom'&&!args.some(arg=>arg.includes(game.launchPath)))args.push(game.launchPath);
  const command=launchWithLocale(game,settings,executable,args);
  return {file:command.exe,args:command.args,options:{cwd:game.folder,detached:true,stdio:'ignore',windowsHide:false,shell:false}};
}
function spawnGame(spec){
  // All game, Locale Emulator and emulator launches share this visible path.
  // Helpers must use their own separate, hidden execution path.
  return spawn(spec.file,spec.args,{...spec.options,windowsHide:false,shell:false});
}
function executableArchitecture(file){
  const fd=fs.openSync(file,'r');
  try{const dos=Buffer.alloc(64);if(fs.readSync(fd,dos,0,64,0)!==64||dos.toString('ascii',0,2)!=='MZ')return 'unknown';const pe=Buffer.alloc(6);if(fs.readSync(fd,pe,0,6,dos.readUInt32LE(60))!==6||pe.toString('ascii',0,4)!=='PE\0\0')return 'legacy';const machine=pe.readUInt16LE(4);return machine===0x14c?'x86':machine===0x8664?'x64':machine===0xAA64?'arm64':'unknown';}finally{fs.closeSync(fd);}
}
function launchErrorMessage(error){
  const messages={ENOENT:'找不到启动程序或工作目录',EACCES:'没有启动权限',EPERM:'启动被系统拒绝',UNKNOWN:'Windows 无法创建游戏进程'};
  return `启动失败：${messages[error.code]||error.message||error.code}。请检查启动文件、工作目录、权限和转区设置。`;
}
function exitErrorMessage(code){
  if(code===null||code===undefined||code===0)return null;
  const unsigned=code>>>0,hex='0x'+unsigned.toString(16).toUpperCase().padStart(8,'0');
  const messages={0xC0000135:'缺少运行库或 DLL',0xC000007B:'程序或 DLL 的位数不匹配',0xC0000142:'游戏或注入组件初始化失败',0xC0000005:'游戏发生访问冲突',0xC0000409:'游戏进程异常终止',0xC000001D:'游戏执行了不受支持的指令'};
  return `启动程序提前退出：${messages[unsigned]||'程序返回异常退出码'}（${hex}）。`;
}
module.exports={gameLaunchSpec,spawnGame,launchErrorMessage,exitErrorMessage,executableArchitecture};
