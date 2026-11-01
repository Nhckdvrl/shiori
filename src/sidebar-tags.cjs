const TYPES=['companies','series','writers','genres','folders','custom'];
function sidebarTags(settings,resolveCompany=x=>x,resolveWriter=x=>x){
  const saved=settings.sidebarTags||{};
  return Object.fromEntries(TYPES.map(type=>[type,[...new Set((Array.isArray(saved[type])?saved[type]:[]).map(type==='companies'?resolveCompany:type==='writers'?resolveWriter:x=>x).filter(x=>typeof x==='string'&&x))]]));
}
function validateSidebarTags(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(type=>!TYPES.includes(type)))throw new Error('侧栏标签设置无效');
  for(const value of Object.values(input))if(!Array.isArray(value)||value.length>5000||value.some(x=>typeof x!=='string'||!x.trim()||x.length>500))throw new Error('侧栏标签设置无效');
  return sidebarTags({sidebarTags:input});
}
module.exports={TYPES,sidebarTags,validateSidebarTags};
