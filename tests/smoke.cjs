const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const local = JSON.parse(fs.readFileSync(path.join(root, 'countries-local.json')));
const achievements = JSON.parse(fs.readFileSync(path.join(root, 'achievements.json'))).achievements;
const section = (start, end) => code.slice(code.indexOf(start), code.indexOf(end, code.indexOf(start)));

assert(local.countries.length >= 40);
assert.equal(new Set(local.countries.map(c => c[0])).size, local.countries.length);
assert(achievements.every(a => fs.existsSync(path.join(root, a.art))));

async function checkLoader(offline) {
  const elements = { '#catalogStatus': { textContent:'' }, '#tile-daily': {disabled:true} };
  const buttons = ['all','Europe','Asia','Americas','Africa','Oceania'].map(theme => ({ dataset:{theme}, disabled:false }));
  const store = {};
  const ui = { selTheme:{textContent:''}, startGame:{disabled:true} };
  const world = Array.from({length:200}, (_, i) => ({
    cca2: (i < 40 ? 'a' : 'b') + String.fromCharCode(97 + i % 26),
    name:{common:`Country ${i}`}, translations:{spa:{common:`País ${i}`}},
    capital:[`Capital ${i}`], region:i < 40 ? 'Europe':'Asia'
  }));
  // The fixture needs 200 different two-letter identifiers.
  world.forEach((c, i) => { c.cca2 = String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26); });
  const ctx = vm.createContext({
    console:{warn(){}}, AbortController, setTimeout, clearTimeout,
    fetch: async url => {
      if (url === './countries-local.json') return {ok:true,json:async()=>local};
      if (offline) throw new Error('Sin red');
      return {ok:true,json:async()=>world};
    },
    toSpanishCapital: x=>x || '',
    lsGet: key=>store[key] || [], lsSet:(key, value)=>{store[key]=value},
    $: selector=>elements[selector], $$:()=>buttons, ui
  });
  vm.runInContext("let ALL=[]; let catalogScope='unavailable'; let currentTheme='all';\n" +
    section('/* ========= Carga de datos ========= */', '/* ========= UI refs ========= */'), ctx);
  await vm.runInContext('loadData()', ctx);
  const result = vm.runInContext('({count:ALL.length, scope:catalogScope, theme:currentTheme})', ctx);
  assert.equal(result.scope, offline ? 'europe':'world');
  assert.equal(result.count, offline ? local.countries.length:200);
  assert.equal(buttons[0].disabled, offline);
  assert.equal(ui.startGame.disabled, false);
  if (offline) assert.equal(result.theme, 'Europe');
}

function checkAchievements() {
  const store = {};
  const ctx = vm.createContext({
    LS:{achievements:'achievements',streak:'streak',scores:'scores',challenge:'challenge',
      albums:'albums',visited:'visited'}, unlockedThisRun:new Set(), Date,
    lsGet:(key, fallback)=>store[key] || fallback,
    lsSet:(key, val)=>{store[key]=structuredClone(val)},
    correct:true, q:{kind:'flag',item:{region:'Europe'}}, streak:1
  });
  const award = '{' + section('// Desbloqueos por región y tipo', "  if (currentMode!=='study') timesMs.push") + '}';
  vm.runInContext(section('function getAchievements()', '/* ========= Reto del día ========= */') + award, ctx);
  assert.deepEqual(Object.keys(store.achievements).sort(), ['primer_bandera_europa','primer_bandera_mundo']);
  vm.runInContext("correct=false; q={kind:'capital',item:{region:'Asia'}}", ctx);
  vm.runInContext(award, ctx);
  assert.equal(store.achievements.primer_capital_asia, undefined);
  store.scores = [{theme:'Europe'}];
  store.albums = {es:{region:'Europe',flag:{unlocked:true},capital:{unlocked:true}}};
  vm.runInContext('reconcileAchievements()', ctx);
  assert(store.achievements.progreso_primer_paso);
  assert(store.achievements.primer_capital_mundo);
  assert(store.achievements.primer_capital_europa);
}

function checkEuropeGame() {
  const text = () => ({textContent:''});
  const ui = {
    qTotal:text(), points:text(), hits:text(), misses:text(), qNumber:text(),
    hudPlayer:text(), hudMode:text(), hudTheme:text(), progressBar:{style:{width:''}}
  };
  const ctx = vm.createContext({
    ALL:local.countries.map(([code,nameES,capitalES])=>({code,nameES,capitalES,region:'Europe'})),
    currentTheme:'Europe', currentMode:'flags', currentLevel:'kids', playerName:'Prueba',
    MAX_Q:10, ui, LS:{last:'last',streak:'streak'},
    lsGet:()=>0,lsSet:()=>{},shuffle:a=>a,modeLabel:()=> 'Banderas',
    updatePauseButtons:()=>{},
    showScreen:()=>{},renderQuestion:()=>{},alert:()=>{throw Error('No hay suficientes países')}
  });
  vm.runInContext(section('function applyThemePool()', '/* ========= Logros Excel: helpers ========= */'), ctx);
  vm.runInContext('newGame()',ctx);
  const codes = vm.runInContext('order.map(q=>q.item.code)',ctx);
  assert.equal(codes.length,10);
  assert.equal(new Set(codes).size,10);

  for (const mode of ['capitals','mixed','study','survival']) {
    vm.runInContext(`currentMode='${mode}'; newGame()`,ctx);
    const questions = vm.runInContext('order.map(q=>({code:q.item.code,kind:q.kind}))',ctx);
    assert.equal(questions.length,10,mode);
    assert.equal(new Set(questions.map(q=>q.code)).size,10,mode);
    if (mode==='capitals') assert(questions.every(q=>q.kind==='capital'));
  }

  vm.runInContext("function endGame(){ globalThis.finished=true }; " +
    section('function advanceProgress()', '/* ========= Supervivencia ========= */'),ctx);
  vm.runInContext('idx=9; for(let i=0;i<36;i++) nextQuestion()',ctx);
  const survived = vm.runInContext('order.map(q=>q.item.code)',ctx);
  assert.equal(survived.length,46);
  assert.equal(new Set(survived.slice(0,45)).size,45);
  assert.notEqual(survived[44],survived[45]);
  assert.equal(ctx.finished,undefined);

  vm.runInContext("currentMode='study'; newGame(); studyQueue.push(order[0]); idx=9; nextQuestion()",ctx);
  const reviewed = vm.runInContext('({length:order.length, last:order[10].item.code, first:order[0].item.code})',ctx);
  assert.equal(reviewed.length,11);
  assert.equal(reviewed.last,reviewed.first);
}

function checkDailyQuestion() {
  const day='2026-09-29';
  const saved={};
  const countries=local.countries.map(([code,nameES,capitalES])=>({code,nameES,capitalES}));
  const ctx=vm.createContext({
    ALL:countries, LS:{dailyQuestion:'dailyQuestion'}, todayStr:()=>day,
    lsGet:(key,fallback)=>saved[key] || fallback,
    lsSet:(key,val)=>{saved[key]=structuredClone(val)}
  });
  vm.runInContext(section('function hashSeed(', '/* ========= Tiempo y pausa ========= */'),ctx);
  const first=vm.runInContext('makeDailyQuestion()',ctx);
  vm.runInContext('ALL=ALL.slice(0,4).reverse()',ctx);
  const again=vm.runInContext('makeDailyQuestion()',ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(again)));
  assert.equal(vm.runInContext("obfuscateText('Bratislava', '2026-09-29')",ctx),
    vm.runInContext("obfuscateText('Bratislava', '2026-09-29')",ctx));

  const dateCtx=vm.createContext({Date:class {
    getFullYear(){return 2026} getMonth(){return 8} getDate(){return 30}
    toISOString(){return '2026-09-29T22:15:00.000Z'}
  }});
  vm.runInContext(section('const todayStr =', 'function isoWeekStringLocal'),dateCtx);
  assert.equal(vm.runInContext('todayStr()',dateCtx),'2026-09-30');
}

function checkPause(){
  const labels=[{textContent:''},{textContent:''}];
  const answers=[{disabled:false},{disabled:false}];
  const calls=[];
  const ctx=vm.createContext({
    paused:false,locked:false,currentMode:'survival',qAccumulatedMs:0,
    qActiveStartMs:Date.now()-1000,timeLeft:12,Date,
    $$:selector=>selector.includes('pauseBtn') ? labels : answers,
    stopSurvivalTimer:()=>calls.push('stop survival'),
    startSurvivalTimer:reset=>calls.push(`start survival ${reset}`),
    stopTimer:()=>calls.push('stop normal'),
    startTimer:()=>calls.push('start normal')
  });
  vm.runInContext(section('function updatePauseButtons()', '/* ========= Juego ========= */'),ctx);
  vm.runInContext('togglePause()',ctx);
  assert(answers.every(a=>a.disabled));
  assert.equal(labels[0].textContent,'▶ Reanudar');
  vm.runInContext('togglePause()',ctx);
  assert(answers.every(a=>!a.disabled));
  assert.equal(labels[0].textContent,'⏸ Pausa');
  assert.deepEqual(calls,['stop survival','start survival false']);
}

function checkSurvivalAnswerAndClock(){
  const intervals=new Map();
  const pending=new Map();
  let id=0;
  let ended='';
  const button={dataset:{correct:'1'},disabled:false};
  const el=()=>({textContent:'',style:{width:''},classList:{add(){},remove(){}}});
  const ui={
    whyFlag:el(),whyCap:el(),flagImg:el(),flagImgReveal:el(),countryReveal:el(),
    points:el(),hits:el(),misses:el(),qNumber:el(),timeLeft:el(),timeBar:el(),
    progressBar:el()
  };
  const country={code:'es',nameES:'España',region:'Europe'};
  const ctx=vm.createContext({
    Date,console,SURVIVAL_START:20,SURVIVAL_BONUS:2,
    currentMode:'survival',currentLevel:'kids',LEVELS:{kids:{wrongPenalty:0}},
    order:Array.from({length:10},()=>({kind:'flag',item:country})),idx:9,
    optionsPool:[country],locked:false,paused:false,timeLeft:0.1,
    score:90,hits:9,misses:0,streak:9,runStreak:9,bestRunStreak:9,missMap:{},timesMs:[],
    qAccumulatedMs:0,qActiveStartMs:Date.now()-1000,nextTimer:null,
    LS:{streak:'streak'},lsSet(){},
    ui, $:()=>el(), $$:()=>[button],flagUrl:()=>'',
    pickOptions:()=>[country,country,country,country],
    whyText:()=>'',markButtons(){},markFlagLearned(){},
    unlockAchievement(){},fxCorrect(){},fxWrong(){},
    drawSurvivalQuestion:()=>({kind:'flag',item:country}),
    setInterval:cb=>{const key=++id;intervals.set(key,cb);return key},
    clearInterval:key=>intervals.delete(key),
    setTimeout:cb=>{const key=++id;pending.set(key,cb);return key},
    clearTimeout:key=>pending.delete(key),
    stopTimer(){},startTimer(){},endGame:reason=>{ended=reason;ctx.stopSurvivalTimer()}
  });
  vm.runInContext(section('function renderQuestion()', 'function markButtons(') +
    section('function onSelect(', 'function handleTimeout(') +
    section('function advanceProgress()', '/* ========= Supervivencia ========= */') +
    section('let survivalInterval =', 'function endGame('),ctx);
  vm.runInContext('startSurvivalTimer(false)',ctx);
  assert.equal(intervals.size,1);
  vm.runInContext('onSelect({currentTarget:globalThis.testButton})',Object.assign(ctx,{testButton:button}));
  assert.equal(intervals.size,0,'el reloj debe detenerse al acertar');
  assert.equal(pending.size,1);
  assert.equal(ctx.hits,10);
  assert.equal(ctx.misses,0);
  assert.equal(ctx.bestRunStreak,10);
  assert.equal(ended,'');
  const transition=[...pending.values()][0];
  pending.clear();transition();
  assert.equal(ctx.idx,10,'la partida continúa en la pregunta 11');
  assert.equal(ctx.order.length,11);
  assert.equal(intervals.size,1,'el reloj se reanuda en la pregunta nueva');
  assert(ctx.timeLeft>2);

  ctx.timeLeft=0.1;
  [...intervals.values()][0]();
  assert.equal(ended,'timeout');
  assert.equal(ctx.misses,0,'agotarse el tiempo no es una respuesta fallada');
  assert.equal(intervals.size,0);
}

function checkFinalResults(){
  const text=()=>({textContent:''});
  const hidden={value:true};
  const ui={
    finalPoints:text(),finalHits:text(),finalMisses:text(),finalQuestions:text(),
    finalBestStreak:text(),finalTitle:text(),finalMeta:text(),finalReason:text(),
    achievementsList:{},achievementsEmpty:{classList:{toggle:(name,value)=>{assert.equal(name,'hidden');hidden.value=value}}},
    openAlbumFromFinal:{classList:{add(){},remove(){}}}
  };
  let rendered=[];
  const ctx=vm.createContext({
    ui,score:100,hits:10,misses:0,idx:10,bestRunStreak:10,currentMode:'survival',
    currentTheme:'Europe',currentLevel:'kids',nextTimer:null,timesMs:[],
    unlockedThisRun:new Set(),albumUnlockedThisRun:new Set(),playerName:'Prueba',
    REGION_LABELS:{Europe:'Europa'},LEVELS:{kids:{label:'Niños'}},
    LS:{scores:'scores',visited:'visited'},
    stopTimer(){},stopSurvivalTimer(){},clearTimeout(){},
    unlockAchievement(){},lsGet:(_,fallback)=>fallback,lsSet(){},
    modeLabel:()=> 'Supervivencia',
    renderFinalAchievementChips:(_list,ids)=>{rendered=ids},
    showScreen:()=>{},recordGameToLeague:()=>{},updateGlobalStatsFromRun:()=>{}
  });
  vm.runInContext(section('function endGame(', '/* ========= Liga ========= */'),ctx);
  vm.runInContext("endGame('timeout')",ctx);
  assert.equal(ui.finalQuestions.textContent,11,'incluye la pregunta en la que se agotó el tiempo');
  assert.equal(ui.finalMisses.textContent,0);
  assert.equal(ui.finalBestStreak.textContent,10);
  assert.equal(ui.finalMeta.textContent,'Supervivencia · Europa · Niños');
  assert.match(ui.finalReason.textContent,/tiempo/);
  assert.equal(hidden.value,false,'debe explicar que no hay logros nuevos');

  ctx.hits=3;ctx.misses=1;ctx.idx=3;ctx.bestRunStreak=3;
  ctx.unlockedThisRun.add('rachas_3');
  vm.runInContext("endGame('wrong')",ctx);
  assert.equal(ui.finalQuestions.textContent,4);
  assert.equal(ui.finalBestStreak.textContent,3);
  assert.match(ui.finalReason.textContent,/incorrecta/);
  assert.equal(hidden.value,true);
  assert.equal(rendered.join(','),'rachas_3');
}

(async()=>{
  await checkLoader(true);
  await checkLoader(false);
  checkAchievements();
  checkEuropeGame();
  checkDailyQuestion();
  checkPause();
  checkSurvivalAnswerAndClock();
  checkFinalResults();
  console.log('OK: catálogos, modos, supervivencia, estudio, reto diario, logros, ilustraciones y resultado final');
})().catch(error => { console.error(error); process.exitCode = 1; });
