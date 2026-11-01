const fs=require('node:fs'),path=require('node:path');
const {build,Platform,Arch}=require('electron-builder');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const portable=path.join(root,'dist',`Shiori-${version}-win32-${process.arch}`);
const stage=path.join(root,'dist','.installer-app');
(async()=>{
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 is required to build this installer');
 require('./check-public.cjs').checkPublic(root);
 require('./check-release.cjs').checkRelease(portable);
 const resolved=path.resolve(stage),dist=path.resolve(root,'dist');
 if(path.dirname(resolved)!==dist||path.basename(resolved)!=='.installer-app')throw Error('Unexpected installer staging path');
 fs.rmSync(resolved,{recursive:true,force:true});fs.mkdirSync(resolved,{recursive:true});
 for(const name of fs.readdirSync(portable))if(name!=='portable.json')fs.cpSync(path.join(portable,name),path.join(resolved,name),{recursive:true});
 // Installed applications use AppData/Shiori; portable.json belongs only to the portable build.
 if(fs.existsSync(path.join(resolved,'portable.json'))||fs.existsSync(path.join(resolved,'data')))throw Error('Installer staging must have no portable marker or user data');
 const config=require('./installer.config.cjs');
 process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
 const artifacts=await build({projectDir:root,prepackaged:resolved,targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),config,publish:'never'});
 for(const artifact of artifacts)console.log('Installer artifact: '+artifact);
})().catch(error=>{console.error(error);process.exitCode=1;});
