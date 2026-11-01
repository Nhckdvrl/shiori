const fs=require('node:fs');
const path=require('node:path');

function profileDirectory({env=process.env,appDir,exePath,appData,isPackaged}){
  if(env.SHIORI_DATA_DIR)return path.resolve(env.SHIORI_DATA_DIR);
  const portable=path.dirname(exePath);
  if(isPackaged&&(fs.existsSync(path.join(portable,'portable.json'))||fs.existsSync(path.join(portable,'data','library.json'))))return path.join(portable,'data');
  return isPackaged?path.join(appData,'Shiori'):path.join(appDir,'.local-data');
}
module.exports={profileDirectory};
