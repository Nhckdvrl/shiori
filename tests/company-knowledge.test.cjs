const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractBangumiCompanies}=require('../src/bangumi-companies.cjs');
const {companyTags,createCompanyIndex,canonicalCompany,companyTagSource}=require('../src/companies.cjs');
const {sidebarTags,validateSidebarTags}=require('../src/sidebar-tags.cjs');
test('Bangumi related developer credits fill missing infobox without importing publishers, collaborators or individuals',()=>{
 const subject={id:4022,type:4,infobox:[{key:'发行',value:'Key、株式会社プロトタイプ、Sekai Project'}],tags:[{name:'剧情'}]};
 const people=[{id:47,name:'Key',type:2,relation:'开发'},{id:47,name:'Key',type:2,relation:'发行'},{id:50,name:'Visual studio',type:2,relation:'动画制作'},{id:60,name:'Helper',type:2,relation:'协力'},{id:70,name:'Person',type:1,relation:'开发'}];
 const result=extractBangumiCompanies(subject,people);assert.deepEqual(result.developers,['Key']);assert.ok(result.publishers.includes('Sekai Project'));assert.deepEqual(result.subjectTags,['剧情']);
 assert.deepEqual(companyTags({bangumiCompanyCredits:result,metadata:{source:'VNDB',companies:['Wrong','Port company']},folderTags:{companies:['Wrong']}}),['Key']);
 assert.equal(companyTagSource({bangumiCompanyCredits:result,userCompanies:['自己补充的会社']},'自己补充的会社').source,'手动补充');
 assert.deepEqual(companyTags({bangumiCompanyCredits:{source:'Bangumi',complete:true,developers:[],brands:[],publishers:['Publisher']},metadata:{source:'Bangumi',companies:['Publisher']},folderTags:{companies:[]}}),[],'A confirmed publisher-only record must not resurrect an old publisher as developer');
});
test('Bangumi company identities join explicit aliases and preserve a parent, brand and internal studio as different entities',()=>{
 const profiles=new Map([[1,{name:'minori',type:2,infobox:[{key:'别名',value:[{v:'中二社'},{v:'株式会社ミノリ'}]}]}]]);
 const credits=extractBangumiCompanies({id:1,type:4,infobox:[{key:'开发',value:'株式会社ミノリ'}]},[{id:1,name:'minori',type:2,relation:'开发'}],profiles);
 const games=[{bangumiCompanyCredits:credits},{metadata:{companies:['中二社']}}],index=createCompanyIndex(games);
 assert.equal(index.resolve('中二社'),'minori');assert.deepEqual(companyTags(games[0],index.resolve),['minori']);
 assert.notEqual(canonicalCompany('Key'),canonicalCompany('VISUAL ARTS'));assert.notEqual(canonicalCompany('工画堂'),canonicalCompany('くろねこさんちーむ'));
});
test('sidebar starts empty and preserves only user-approved labels with canonical alias resolution',()=>{
 assert.ok(Object.values(sidebarTags({})).every(values=>values.length===0));
 const selected=validateSidebarTags({companies:['minori','minori'],genres:['剧情'],writers:[]});assert.deepEqual(selected.companies,['minori']);assert.deepEqual(selected.genres,['剧情']);
 assert.throws(()=>validateSidebarTags({unknown:['x']}));assert.throws(()=>validateSidebarTags({companies:[3]}));
 assert.deepEqual(sidebarTags({sidebarTags:{companies:['中二社']}},name=>name==='中二社'?'minori':name).companies,['minori']);
});
