const {test}=require('node:test');const assert=require('node:assert/strict');
const {createAuthorIndex}=require('../src/authors.cjs');
const {createSeriesIndex}=require('../src/series.cjs');
const {canonicalCompany,companyTags,createCompanyIndex}=require('../src/companies.cjs');
const game=(id,writers,extra={})=>({id,title:id,folderTags:{folders:[],companies:[],writers:[]},metadata:{writers},...extra});
test('company aliases merge, while filing folders do not override the actual developer',()=>{
 assert.equal(canonicalCompany('Front Wing'),canonicalCompany('FrontWing'));
 assert.equal(canonicalCompany('アリスソフト'),'ALICESOFT');assert.equal(canonicalCompany('エスクード'),'Escu:de');
 assert.notEqual(canonicalCompany('枕'),canonicalCompany('ケロQ'));
 assert.deepEqual(companyTags({metadata:{source:'Bangumi',companies:['ケロQ','KeroQ']},folderTags:{companies:['枕']}}),['ケロQ']);
 assert.deepEqual(companyTags({metadata:{source:'VNDB',companies:['キッド','MAGES.','SDR Project']},folderTags:{companies:['KID']}}),['KID']);
 assert.deepEqual(companyTags({metadata:{source:'Bangumi',companies:['ALICESOFT','アリスソフト','他']},folderTags:{companies:['ALICESOFT']}}),['ALICESOFT']);
 const variants=[{metadata:{companies:['AMUSE CRAFT']}},{metadata:{companies:['AmuseCraft']}},{metadata:{companies:['amuse craft']}}];const index=createCompanyIndex(variants);
 assert.equal(new Set(variants.flatMap(g=>companyTags(g,index.resolve))).size,1);
 assert.notEqual(canonicalCompany('VISCO'),canonicalCompany('VIS'));
});
test('author identity unifies spaces, bracket annotations and explicit aliases without losing credits',()=>{
 const games=[game('one',['星空 めてお','茗荷屋甚六（木村航）','希(シナリオ)']),game('two',['星空めてお(主笔)','木村航','希']),game('three',['星空めてお','太田僚（オオタリョウ）','丸戸 史明']),game('four',['星空めてお【主笔】','星空めてお［主笔］','オオタリョウ','丸户史明'])];
 const before=structuredClone(games),index=createAuthorIndex(games);
 assert.deepEqual(games,before);assert.equal(index.authors.filter(x=>x.name.startsWith('星空')).length,1);
 assert.ok(index.forGame('one').includes('星空めてお'));assert.ok(index.forGame('two').includes('星空めてお'));
 assert.ok(index.forGame('two').includes('茗荷屋甚六'));assert.ok(index.forGame('four').includes('太田僚'));
 assert.ok(index.forGame('three').includes('丸户史明'));assert.equal(index.resolve('星空 めてお(主笔)'),'星空めてお');
 assert.deepEqual([...new Set(['星空 めてお','星空めてお'].map(index.resolve))],['星空めてお']);
 assert.ok(index.authors.find(x=>x.name==='星空めてお').aliases.includes('星空めてお(主笔)'));
});
test('legacy commas inside author notes do not create character or route tags',()=>{
 const games=[game('routes',['魁(空門蒼','野村美希','神山識','加藤うみ RB追加部分の大半)','新島夕(鳴瀬しろは','久島鴎)','他']),game('team',['チーム・フレラバ（早瀬ゆう','木村ころや','柊晴空','松倉慎二）']),game('different',['太田僚','太田亮','別人A(主笔)','別人B'])];
 const index=createAuthorIndex(games);
 assert.deepEqual(index.forGame('routes'),['魁','新島夕']);
 assert.deepEqual(index.forGame('team'),['早瀬ゆう','木村ころや','柊晴空','松倉慎二']);
 assert.equal(index.forGame('different').length,4);
});
test('series include sequels and side stories independently of writer and company folders',()=>{
 const games=[game('first',[],{title:'废村少女1-诱惑迷离的笼之乡'}),game('second',[],{title:'废村少女2-阴影诱惑的秘姬之匣'}),game('side',[],{title:'Haison_FD2'}),game('nine',[],{title:'9-nine-九次九日九重色'}),game('new',[],{title:'9-nine-新章'}),game('manual',[],{title:'9-nine-雪色',userSeries:['我的特别分组'],autoSeries:false}),game('supplement',[],{title:'9-nine-春色',userSeries:['9nine','周末想玩']}),game('unrelated',[],{title:'别的游戏',folderTags:{folders:['Escude','丸户'],companies:['Escu:de'],writers:['丸户史明']}})];
 const index=createSeriesIndex(games);
 for(const id of ['first','second','side'])assert.deepEqual(index.get(id),['废村少女']);
 for(const id of ['nine','new'])assert.deepEqual(index.get(id),['9-nine-']);
 assert.deepEqual(index.get('manual'),['我的特别分组']);assert.deepEqual(index.get('supplement'),['9-nine-','周末想玩']);
 assert.deepEqual(index.get('unrelated'),[]);
 const future=[game('future-a',[],{folderTags:{folders:['新系列'],companies:[],writers:[]}}),game('future-b',[],{folderTags:{folders:['新系列'],companies:[],writers:[]}})];
 for(const tags of createSeriesIndex(future).values())assert.deepEqual(tags,['新系列']);
 const unknown=[game('unknown-a',[],{title:'新作品1',folderTags:{folders:['新会社','未知脚本家'],companies:[],writers:[]},metadata:{companies:['新会社'],writers:['未知脚本家']}}),game('unknown-b',[],{title:'另一作品',folderTags:{folders:['新会社','未知脚本家'],companies:[],writers:[]},metadata:{companies:['新会社'],writers:['未知脚本家']}})];
 for(const tags of createSeriesIndex(unknown).values())assert.deepEqual(tags,[],'Company and writer folders discovered through metadata are not series');
});
