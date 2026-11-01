const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT_FILES=['.gitignore','.gitattributes','main.cjs','preload.cjs','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','LICENSE','README.md','THIRD-PARTY-NOTICES.md'];
const ROOT_DIRS=['.github','src','public','scripts','tests','docs'];
function publicFiles(root){
 const result=[];
 function walk(relative){const file=path.join(root,relative),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink(),'Public source cannot contain symlinks: '+relative);if(stat.isDirectory()){assert.ok(!/^(?:data|chromium|covers|metadata-cache|test-results|node_modules|dist)$/i.test(path.basename(relative)),'Private directory: '+relative);for(const name of fs.readdirSync(file))walk(path.join(relative,name));}else result.push(relative);}
 for(const relative of [...ROOT_FILES,...ROOT_DIRS])walk(relative);return result;
}
function checkPublic(root){
 const files=publicFiles(root);
 const patterns=[/\b[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\s"'<>]+/i,/\/(?:home|Users)\/[^\s"'<>]+/,/\bgh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{30,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
 for(const relative of files){
  assert.ok(!/^(?:library\.json(?:\..*)?|bangumi-token.*|\.env(?:\..*)?|Local State|backup-\d.*)$/i.test(path.basename(relative)),'Private file: '+relative);
  const file=path.join(root,relative);if(/\.(?:png|ico|woff2|pdf)$/i.test(relative))continue;
  const bytes=fs.readFileSync(file),texts=[bytes.toString('utf8'),bytes.toString('utf16le')];
  for(const pattern of patterns)assert.ok(!texts.some(text=>pattern.test(text)),'Private data pattern in '+relative);
 }
 console.log('Public source check passed: '+files.length+' allowlisted files');return files;
}
if(require.main===module)checkPublic(path.resolve(process.argv[2]||path.join(__dirname,'..')));
module.exports={publicFiles,checkPublic};
