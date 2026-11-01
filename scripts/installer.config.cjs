const path=require('node:path');
module.exports={
 appId:'org.shiori.launcher.opensource',productName:'栞 Shiori',
 artifactName:'Shiori-Setup-${version}-${arch}.${ext}',
 directories:{output:path.join(__dirname,'..','dist','installer')},
 win:{target:[{target:'nsis',arch:['x64']}],icon:'public/icon.ico',executableName:'ShioriLauncher',requestedExecutionLevel:'asInvoker'},
 nsis:{
  oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
  createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'栞 Shiori',
  uninstallDisplayName:'栞 Shiori',deleteAppDataOnUninstall:false,
  installerIcon:'public/icon.ico',uninstallerIcon:'public/icon.ico',installerHeaderIcon:'public/icon.ico',
  installerLanguages:['zh_CN','en_US'],language:'2052',runAfterFinish:true,
 },
};
