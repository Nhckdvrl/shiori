const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
require('./check-public.cjs').checkPublic(root);
const output=path.join(root,'dist',`Shiori-${pkg.version}-win32-${process.arch}`);
if(process.platform!=='win32')throw new Error('当前便携版打包需要在 Windows 上运行');
const runtime=path.dirname(require('electron'));
if(!fs.existsSync(path.join(runtime,'electron.exe')))throw new Error('请先安装 Electron 运行时');
if(fs.existsSync(path.join(output,'data')))throw new Error('发布目录已有用户数据，请保留它并改用新的版本目录');
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(runtime)){
  if(name==='resources')continue;
  const destination=name==='electron.exe'?'Shiori.exe':name==='LICENSE'?'ELECTRON-LICENSE.txt':name;
  fs.cpSync(path.join(runtime,name),path.join(output,destination),{recursive:true});
}
const app=path.join(output,'resources','app');fs.mkdirSync(app,{recursive:true});
for(const name of ['main.cjs','preload.cjs','src','public'])fs.cpSync(path.join(root,name),path.join(app,name),{recursive:true});
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:pkg.main,private:true,license:pkg.license}));
fs.cpSync(fs.realpathSync(path.join(root,'node_modules','opencc-js')),path.join(app,'node_modules','opencc-js'),{recursive:true,dereference:true});
fs.writeFileSync(path.join(output,'portable.json'),JSON.stringify({version:1,mode:'portable'}));
fs.cpSync(path.join(root,'docs'),path.join(output,'docs'),{recursive:true});
for(const name of ['README.md','LICENSE','THIRD-PARTY-NOTICES.md'])fs.copyFileSync(path.join(root,name),path.join(output,name));
require('./check-release.cjs').checkRelease(output);
console.log('已生成空库便携版：'+output);
module.exports={output};
