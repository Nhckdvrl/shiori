const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function checkRelease(directory){
  const forbidden=/^(?:data|\.local-data|metadata-cache|metadata-covers|chromium|test-results|\.git)$/i;
  const files=[];
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    assert.ok(!entry.isSymbolicLink(),'Release must not contain machine-local symlinks: '+file);
    assert.ok(!forbidden.test(entry.name),'Private or generated data in release: '+file);
    assert.ok(!/^(?:library\.json(?:\..*)?|bangumi-token.*|Local State|metadata-update\.json|backup-\d.*|\.env(?:\..*)?)$/i.test(entry.name),'Private data in release: '+file);
    if(entry.isDirectory())walk(file);else files.push(file);
  }}
  walk(directory);
  const app=path.join(directory,'resources','app');
  for(const name of ['Shiori.exe','portable.json','LICENSE','ELECTRON-LICENSE.txt'])assert.ok(fs.existsSync(path.join(directory,name)),'Missing release file: '+name);
  assert.ok(fs.existsSync(path.join(app,'node_modules','opencc-js','package.json')));
  assert.ok(!fs.existsSync(path.join(directory,'data')));
  console.log('发布检查通过：'+files.length+' 个文件，无游戏库、Token、封面缓存或个人资料');
  return files;
}
if(require.main===module){
  const dir=process.argv[2]||path.join(__dirname,'..','dist',`Shiori-${require('../package.json').version}-win32-${process.arch}`);
  checkRelease(path.resolve(dir));
}
module.exports={checkRelease};
