const fs = require('node:fs');
const path = require('node:path');
class Store {
  constructor(dir, root) {
    this.dir=dir; this.file=path.join(dir,'library.json'); fs.mkdirSync(dir,{recursive:true});
    this.state={version:1,settings:{roots:root?[path.resolve(root)]:[],autoMetadata:true,scanInterval:60,onboardingCompleted:false,writerSelectionCustomized:false},games:[],sessions:[],lastScan:null};
    if (fs.existsSync(this.file)) {
      try { this.state=this.read(this.file); }
      catch(e) {
        fs.copyFileSync(this.file, this.file+'.corrupt-'+Date.now());
        if (fs.existsSync(this.file+'.bak')) this.state=this.read(this.file+'.bak');
        else throw new Error('游戏库数据损坏，已保留原文件。请恢复 data 下的备份。');
      }
    }
  }
  read(file) { const x=JSON.parse(fs.readFileSync(file,'utf8')); if(x.version!==1 || !Array.isArray(x.games)||!Array.isArray(x.sessions)||!Array.isArray(x.settings?.roots)) throw new Error('无效的游戏库文件'); return x; }
  save() {
    const temp=this.file+'.tmp';
    const fd=fs.openSync(temp,'w');
    try {fs.writeFileSync(fd,JSON.stringify(this.state,null,2),'utf8');fs.fsyncSync(fd);} finally{fs.closeSync(fd);}
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(temp,this.file);
    const date=new Date().toISOString().slice(0,10), daily=path.join(this.dir,'backup-'+date+'.json');
    if(!fs.existsSync(daily)) fs.copyFileSync(this.file,daily);
    const backups=fs.readdirSync(this.dir).filter(x=>/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
    for(const f of backups.slice(0,-14)) fs.unlinkSync(path.join(this.dir,f));
  }
}
module.exports={Store};
