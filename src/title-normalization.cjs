const OpenCC=require('opencc-js');
const simplify=OpenCC.Converter({from:'t',to:'cn'});
const NUMBER={'一':'1','壱':'1','二':'2','弐':'2','贰':'2','三':'3','参':'3','叁':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10'};
function textForm(value){return simplify(String(value||'').normalize('NFKC')).replace(/[\[【]([一壱二弐贰三参叁四五六七八九十])[\]】]/g,(_,n)=>NUMBER[n]);}
function norm(value){return textForm(value).toLowerCase().replace(/\+/g,'plus').replace(/[\s\p{P}\p{S}]/gu,'');}
function cleanQuery(value){return String(value||'').normalize('NFKC').replace(/^\d+[.、]\s*/,'').replace(/\s*(?:ver(?:sion)?\.?|版本|v)\s*\d+(?:\.\d+)+$/i,'').replace(/\s+for\s+Windows.*$/i,'').trim();}
function firstInstallment(value){return norm(value).replace(/1(?=外[伝传]|番外)/g,'');}
function ordinal(value){
 const text=textForm(cleanQuery(value));
 const named=text.match(/(?:vol(?:ume)?\.?|episode\.?|part|第)\s*(\d+(?:\.\d+)?)/i);
 const attached=text.match(/[\p{L}]\s*(\d+(?:\.\d+)?)(?=[^\d.]|$)/u);
 return named?named[1]:attached?attached[1]:null;
}
function shortTitles(value){
 const raw=String(value||'');const result=[];
 const split=raw.split(/\s-|[‐‑‒–—―−－～〜]/)[0].trim();if(split!==raw.trim()&&norm(split).length>=2)result.push(split);
 const word=raw.trim().split(/\s+/)[0];if(word!==raw.trim()&&(/[\u3040-\u30ff\u3400-\u9fff]/.test(word)||/^[A-Za-z]{5,}$/.test(word)))result.push(word);
 return result;
}
function queryAlternatives(game){
 const title=cleanQuery(game.title),out=[];const add=q=>{q=cleanQuery(q);if(q&&norm(q).length>=2&&!out.some(x=>norm(x)===norm(q)))out.push(q);};
 const parent=(game.relativePath||'').split(/[\\/]/).at(-2);
 if(!/[\u3040-\u30ff\u3400-\u9fff]/.test(title)&&parent&&(parent.match(/[\u3040-\u30ff\u3400-\u9fff]/g)||[]).length>=6)add(parent);
 for(const value of [game.executableInfo?.productName,game.executableInfo?.description])if(value&&!/buriko|kirikiri|siglus|rUGP|visual novel|runtime|application|game engine|universal.*injector|qlie|imosurume|rscript|entisgls|virtual machine|^cotomi$/i.test(value))add(value);
 if(/[\u3040-\u30ff\u3400-\u9fff]/.test(title)){
  const base=title.split(/[-‐‑‒–—―−－～〜]/)[0].trim();if(norm(base).length>=3){add(base);if(/1$/.test(base))add(base.slice(0,-1));if(/\d$/.test(base))add(base.replace(/\d+(?:\.\d+)?$/,''));}
 }
 for(const c of game.candidates||[]){
  let stem=c.name.replace(/\.exe$/i,'').replace(/[._](?:chs|cht|cn|jp|fix|crack|gpt.*|gemini.*|claude.*|white)(?:[._].*)?$/i,'').replace(/[（(][^）)]*(?:汉化|萌你妹|脸肿|瑞树|win\d)[^）)]*[）)]/gi,'').trim();
  if(/启动游戏|开始游戏|汉化启动|补丁|修改|设置|设定|檢查|检查|^(?:ai5win|siglusengine|bgi|cs\d|advhd|system\d+|boot)/i.test(stem))continue;
  if(/[\u3040-\u30ff\u3400-\u9fff]/.test(stem))add(stem);
  else if(/^[a-z][a-z\d_-]{4,}$/i.test(stem))add(stem.replace(/_/g,' '));
 }
 return out.filter(q=>norm(q)!==norm(title)).slice(0,5);
}
module.exports={norm,textForm,cleanQuery,firstInstallment,ordinal,shortTitles,queryAlternatives};
