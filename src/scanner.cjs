const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Directory components, never full-path substrings: a game's title may contain “patch”.
const SKIP = /^(?:node_modules|\.git|\.svn|\.cache|data|save(?:data|s)?|savedata|savedgames|screenshots?|logs?|manual|docs?|redist|_commonredist|directx\d*|dx\d*|vcredist|support|tools?|plugins?|winamp|sdacti\d*|localeswitch|backup|backups|.*备份.*|补丁.*|汉化补丁.*|修正补丁.*|附件.*|附图.*|附圖.*|特典|壁纸|壁紙|攻略|修改器.*|注册表.*|兼容性备份.*|原版文件.*|日文原版.*|patch(?:es)?|update(?:s)?|__macosx)$/i;
const BAD_EXE = /(?:^unins|^uninst|uninstall|卸载|アンインストール|^setup|^install|installer|注册表|恢复|reg(?:istry|ist|setup)|^sys\d+reg|^config|config\d*$|^userconfig|^resetconfig|^cmvs(?:inst|config|check)|^gameupdate|^pcinformation|^isesu|^esu(?:for|\.)|^bhvc|^filech|^filecheck|^alpha(?:check|rom)|^support|^sigluscounter|^opensavefolder|^delfile|^_inmm|^dxsetup|^vcredist|^vc_redist|^dotnet|^crash|^unitycrash|^notification|^reporter|^updat|^steam|汉化升级|汉化补丁|中文化.*补丁|[._-]patch(?:[._-]|v?\d)|patch\d|^.*_update_\d|設定|设定|设置|設定|破損チェック|チェックツール|损坏检查|提示.*安装|修改器|^boot(?:strap|menu)|^activation|^認証)/i;
const GENERIC_DIR = /^(?:game|games|bin|binaries|win(?:32|64)|windows(?:noeditor)?|x64|x86|release|官中版|日文版|中文版|游戏本体|本体)$/i;
const COMPANIES = {
  '柚子社':'柚子社', key:'Key', '枕社':'枕', '紫社':'Purple software', '调色板':'Palette', '海豹':'あざらしそふと',
  alicesoft:'ALICESOFT', august:'AUGUST', crystalia:'CRYSTALiA', elf:'elf', escude:'Escu:de', 'hibiki works':'hibiki works',
  hook:'HOOKSOFT', kid:'KID', liar:'Liar-soft', minori:'minori', 'n+':'Nitroplus', smee:'SMEE', 'type-moon':'TYPE-MOON', 'ωstar':'ωstar'
};
const WRITERS = {'丸户':'丸户史明','田中罗密欧':'田中罗密欧','濑户口':'濑户口廉也','ルクル':'ルクル'};
const UNIQUE = a => [...new Set(a.filter(Boolean))];
const keyPath = p => path.resolve(p).toLowerCase();
const isInside = (parent, child) => { if(typeof parent!=='string'||typeof child!=='string')return false;const r = path.relative(path.resolve(parent), path.resolve(child)); return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
const cleanTitle = t => t.replace(/^[（(]\d+[）)]\s*/, '').replace(/^\d+[.、]\s*/, '').replace(/\[(?:汉化|硬盘|免安装|整合|中文|PC|完全|绿色)[^\]]*\]/gi, '').replace(/\s*(?:ver(?:sion)?\.?|版本|v)\s*\d+(?:\.\d+)+$/i,'').trim();
function scoreExe(name, title) {
  const s = name.toLowerCase();
  let score = 10;
  if (/补丁安装|安装程序|^startup\.exe/i.test(name)) return -100;
  if (/chs|cht|chinese|chinesize|_cn\b|[._]cn\.|汉化启动|中文版|萌你妹|脸肿|瑞树/.test(s)) score += 65;
  if (/启动游戏|开始游戏|汉化版/.test(s)) score += 65;
  if (/[\u3400-\u9fff]/.test(name)) score += 12;
  if (/\(.*(?:win10|win11)|（.*(?:win10|win11)/i.test(s)) score += 10;
  if (s.includes(title.toLowerCase()) || title.toLowerCase().includes(path.parse(s).name)) score += 20;
  if (/^bgi(?:[.-]chs)?\.exe$/i.test(s)) score -= 5;
  if (/crack|_x86|cmvs32\.exe|\+jp|_jp|^_/.test(s)) score -= 8;
  return score;
}
function inferTags(parts) {
  const folders = parts.slice(0, -1);
  const companies = [], writers = [];
  for (const p of parts) {
    if (COMPANIES[p.toLowerCase()]) companies.push(COMPANIES[p.toLowerCase()]);
    if (WRITERS[p]) writers.push(WRITERS[p]);
  }
  return {folders: UNIQUE(folders.filter(x => !GENERIC_DIR.test(x))), companies: UNIQUE(companies), writers: UNIQUE(writers)};
}
async function scanRoots(roots, exclude = []) {
  const found = [], warnings = []; let visited = 0;
  const hashes=new Map();
  async function digest(file){if(!hashes.has(file)){const hash=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))hash.update(chunk);hashes.set(file,hash.digest('hex'));}return hashes.get(file);}
  async function duplicateLauncherBundle(parent,child,name,exeNames){
    if(!exeNames.some(exe=>path.parse(exe).name.toLowerCase()===name.toLowerCase()))return false;
    try{
      const files=await fs.readdir(child,{withFileTypes:true});
      // A nested bundle named after its launcher is a duplicate only when all
      // executable and game-data payloads are byte-identical to the parent.
      // Independent episodes, changed archives and subdirectories stay visible.
      if(files.some(f=>f.isDirectory()||f.isSymbolicLink()))return false;
      const payload=files.filter(f=>f.isFile()&&!/\.(?:txt|md|png|jpe?g|webp)$/i.test(f.name));
      if(!payload.some(f=>/\.exe$/i.test(f.name)))return false;
      for(const f of payload){const a=path.join(parent,f.name),b=path.join(child,f.name);const [sa,sb]=await Promise.all([fs.stat(a),fs.stat(b)]);if(!sa.isFile()||sa.size!==sb.size||await digest(a)!==await digest(b))return false;}
      return true;
    }catch{return false;}
  }
  async function walk(dir, root, depth = 0) {
    if (depth > 16 || exclude.some(e => isInside(e, dir))) return;
    let entries;
    try { entries = await fs.readdir(dir, {withFileTypes:true}); } catch(e) { warnings.push({path:dir, message:e.code}); return; }
    const manifests=[];
    if(entries.some(e=>e.isFile()&&e.name==='package.json'))manifests.push(path.join(dir,'package.json'));
    if(entries.some(e=>e.isFile()&&/^Shiori\.exe$/i.test(e.name)))manifests.push(path.join(dir,'resources','app','package.json'));
    for(const manifest of manifests)try{const pkg=JSON.parse(await fs.readFile(manifest,'utf8'));if(['shiori-launcher','shiori-galgame-launcher'].includes(pkg.name)&&pkg.main==='main.cjs')return;}catch{}
    visited++;
    const parts = path.relative(root, dir).split(path.sep).filter(Boolean);
    let titleIndex = parts.length - 1;
    while (titleIndex >= 0 && GENERIC_DIR.test(parts[titleIndex])) titleIndex--;
    const title = cleanTitle(parts[titleIndex] || path.basename(root));
    const exeNames = entries.filter(e=>e.isFile() && /\.exe$/i.test(e.name) && !BAD_EXE.test(e.name) && !/补丁安装|安装程序|^startup\.exe/i.test(e.name)).map(e=>e.name);
    const romNames = entries.filter(e=>e.isFile() && /\.(?:xci|nsp|iso|cso|nds|3ds|cia)$/i.test(e.name)).map(e=>e.name);
    const names = exeNames.length ? exeNames : romNames;
    if (names.length) {
      const candidates = [];
      for (const name of names) {
        const full = path.join(dir,name);
        try { const st = await fs.stat(full); if(st.size > 0) candidates.push({path:full, name, score:scoreExe(name,title), size:st.size, modified:st.mtimeMs}); } catch {}
      }
      candidates.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
      if (candidates.length) {
        const cover = entries.find(e=>e.isFile() && /^(?:cover|folder|poster|封面)\.(?:png|jpe?g|webp)$/i.test(e.name));
        found.push({id:crypto.createHash('sha256').update(keyPath(dir)).digest('hex').slice(0,20), title, folder:dir, root,
          relativePath:path.relative(root,dir), folderTags:inferTags((COMPANIES[path.basename(root).toLowerCase()]||WRITERS[path.basename(root)])?[path.basename(root),...parts]:parts), candidates, launchPath:candidates[0].path,
          kind:exeNames.length?'windows':'rom', missing:false, localCover:cover?path.join(dir,cover.name):null,
          confidence:candidates.length===1 || candidates[0].score-(candidates[1]?.score??0)>=20?'high':'review'});
      }
    }
    // Do not descend into assets once a game has been found, except folders with independent executables.
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink() || e.name.startsWith('.') || SKIP.test(e.name) || /备份|补丁|存档|修改器|改造者|^bakup$|^ntlea/i.test(e.name)) continue;
      if (names.length && /^(?:engine|assets|resources|www|renpy|lib|locales|runtime|python|movie|movies|sound|voice|bgm|bg|cg|image|images|img|fonts|font|data\d*|system|app-\d|webview2)$/i.test(e.name)) continue;
      if(names.length&&/^(?:copy|副本|コピー)$/i.test(e.name))continue;
      if(exeNames.length&&await duplicateLauncherBundle(dir,path.join(dir,e.name),e.name,exeNames))continue;
      await walk(path.join(dir,e.name), root, depth+1);
    }
  }
  const normalized=[...new Map(roots.map(root=>[keyPath(root),path.resolve(root)])).values()];
  const disjoint=normalized.filter(root=>!normalized.some(parent=>keyPath(parent)!==keyPath(root)&&isInside(parent,root)));
  for (const root of disjoint) await walk(root,root);
  const unique = [...new Map(found.map(g=>[g.id,g])).values()];
  return {games:unique,warnings,visited};
}
module.exports = {scanRoots, scoreExe, inferTags, isInside, cleanTitle, BAD_EXE, SKIP, UNIQUE};
