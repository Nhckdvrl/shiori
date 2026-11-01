const {spawn}=require('node:child_process');const path=require('node:path');
function executableInfo(files){return new Promise((resolve,reject)=>{
 if(!files.length)return resolve([]);
 const child=spawn(require('./windows.cjs').powershellPath(),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'executable-info.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>output+=chunk);child.on('error',reject);child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(files));
 const timeout=setTimeout(()=>{child.kill();resolve([]);},15000);
 child.on('close',()=>{clearTimeout(timeout);try{const parsed=JSON.parse(output.replace(/^\uFEFF/,''));resolve(Array.isArray(parsed)?parsed:[parsed]);}catch{resolve([]);}});
});}
module.exports={executableInfo};
