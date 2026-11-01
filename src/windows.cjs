const path=require('node:path');
function powershellPath(env=process.env){return path.join(env.SystemRoot||env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');}
module.exports={powershellPath};
