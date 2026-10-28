/* CatWar fan simulator — local only, no backend */
const KEY='catwar-simulator-v1',COOLDOWN=60000,MAX_SAVED=500,MAX_HISTORY=100;
const initial={theme:'dark',sound:false,soundStyle:'sparkle',revealStyle:'cards',soundVolume:75,motion:true,mode:'normal',chanceMode:'normal',iterations:10000,mins:[0,0,0,0,0],maxs:[1000,1000,1000,1000,1000],lastGenAt:0,lastCalcAt:0,current:null,saved:[],history:[],lastChance:null};
function load(){try{const d=JSON.parse(localStorage.getItem(KEY));return d&&typeof d==='object'?{...initial,...d}:structuredClone(initial)}catch{return structuredClone(initial)}}
let state=load(),worker=null,calculating=false,stopRequested=false;
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{toast('Не удалось сохранить данные: хранилище заполнено')}}
function toast(message){const el=$('toast');el.textContent=message;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',3500)}
function modeSelect(el,value){el.innerHTML=Object.entries(MODES).map(([k,m])=>`<option value="${k}">${esc(m.name)}</option>`).join('');el.value=MODES[value]?value:'normal'}
function desc(id,mode){$(id).textContent=MODES[mode].description}
function switchTab(id){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id===id));if(id==='saved')renderSaved();if(id==='history')renderHistory()}
function theme(){document.body.classList.toggle('light',state.theme==='light');document.body.classList.toggle('no-motion',!state.motion);$('themeBtn').textContent=state.theme==='dark'?'☀️ Светлая тема':'🌙 Тёмная тема';$('soundToggle').checked=state.sound;$('motionToggle').checked=state.motion;$('soundStyle').value=state.soundStyle||'sparkle';$('revealStyle').value=state.revealStyle||'cards';$('soundVolume').value=state.soundVolume??75;}
function rows(v){return STATS.map((s,i)=>`<div class="stat-row"><span>${s.emoji} ${s.full}</span><b>${format(v[i])}</b></div>`).join('')}
function modeLabel(m){return MODES[m]?.name||'Неизвестный режим'}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=rand(i+1);[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
// Bundled local audio: no external hosts or network requests.
const SOUND_SOURCES={sparkle:'assets/audio/sparkle.ogg',wood:'assets/audio/wood.ogg',chime:'assets/audio/chime.ogg',soft:'assets/audio/soft.ogg',chest:'assets/audio/chest.ogg'};
let sfxPlayer=null;
function playSound(force=false,kind='reveal'){
 if(!force&&!state.sound)return;
 const src=kind==='chest'?SOUND_SOURCES.chest:(SOUND_SOURCES[state.soundStyle]||SOUND_SOURCES.sparkle);
 if(sfxPlayer){sfxPlayer.pause();sfxPlayer=null}
 sfxPlayer=new Audio(src);sfxPlayer.volume=Math.min(1,Math.max(0,(state.soundVolume??75)/100));
 sfxPlayer.play().catch(()=>{if(force)toast('Звуковой файл отсутствует. Проверь assets/audio.')});
}
function startGen(){if(state.current&&state.current.opened.length<5){toast('Сначала открой все пять предметов текущей комбинации');return}const values=generate(state.mode);state.current={values,mode:state.mode,order:shuffle([0,1,2,3,4]),opened:[],chestOpened:false,revealStyle:state.revealStyle,id:Date.now()};persist();renderCards();updateTimers()}
function openCard(slot){
 const c=state.current;if(!c||c.opened.includes(slot))return;
 c.opened.push(slot);playSound();persist();
 // Reveal only the clicked element: never rebuild or reshuffle the row.
 const button=$('cardArea').querySelector(`[data-slot="${slot}"], [data-paw="${slot}"]`);
 if(button){if(button.hasAttribute('data-paw')){button.classList.add('revealed');button.setAttribute('aria-disabled','true');button.setAttribute('tabindex','-1');}else{button.classList.add('open');}if(button instanceof HTMLButtonElement)button.disabled=true;}
 updateTimers();
 if(c.opened.length===5){renderResult(c);toast('Все параметры раскрыты!')}
}
let chestAnimating=false;
function openChest(){const c=state.current;if(!c||c.chestOpened||chestAnimating)return;
 chestAnimating=true;playSound(false,'chest');
 const chest=document.querySelector('.treasure-chest');if(chest){chest.classList.add('opening');chest.disabled=true;}
 setTimeout(()=>{if(state.current!==c){chestAnimating=false;return;}c.chestOpened=true;c.opened=[0,1,2,3,4];persist();renderCards();updateTimers();chestAnimating=false},state.motion?1100:100);
}
function pawMarkup(c){
 // A standalone illustrated SVG trail: no card components or card-shaped containers.
 const places=[[155,350],[315,250],[460,350],[610,215],[760,300]];
 const paw=(x,y,slot,idx)=>{const p=STATS[idx],opened=c.opened.includes(slot),label=opened?`${p.short}: ${format(c.values[idx])}`:`След ${slot+1}`;
  const align=x>550?'end':'start',tx=x>550?-62:62;
  return `<g class="footprint ${opened?'revealed':''}" data-paw="${slot}" role="button" tabindex="${opened?'-1':'0'}" aria-label="${esc(label)}" aria-disabled="${opened}" transform="translate(${x} ${y})">
    <g class="paw-symbol" transform="rotate(-18)"><ellipse cx="0" cy="13" rx="22" ry="17"/><ellipse cx="-27" cy="-12" rx="9" ry="12"/><ellipse cx="-9" cy="-27" rx="9" ry="12"/><ellipse cx="13" cy="-27" rx="9" ry="12"/><ellipse cx="30" cy="-10" rx="8" ry="11"/></g>
    <circle class="paw-wave" r="35"/><g class="paw-label" transform="translate(${tx} -3)"><text text-anchor="${align}" class="paw-name">${esc(p.short)}</text><text text-anchor="${align}" y="30" class="paw-percent">${format(c.values[idx])}</text></g>
  </g>`};
 return `<div class="forest-trail paw-scene"><div class="trail-hint">Нажми на светящиеся следы на тропе</div><svg class="trail-illustration" viewBox="0 0 900 470" role="group" aria-label="Пять отпечатков лап на лесной тропе"><defs><linearGradient id="trailSoil" x1="0" x2="1"><stop stop-color="#97794b" stop-opacity=".15"/><stop offset=".5" stop-color="#c9ac70" stop-opacity=".4"/><stop offset="1" stop-color="#97794b" stop-opacity=".15"/></linearGradient></defs><path class="winding-trail" d="M100 480 Q35 340 270 340 T420 250 T660 250 T850 100"/><path class="trail-dashes" d="M100 480 Q35 340 270 340 T420 250 T660 250 T850 100"/>${c.order.map((idx,slot)=>paw(...places[slot],slot,idx)).join('')}</svg></div>`;
}
function cardMarkup(c){return c.order.map((idx,slot)=>{const s=STATS[idx],open=c.opened.includes(slot);return `<button type="button" class="flip-card ${open?'open':''}" data-slot="${slot}" style="--card-index:${slot}" ${open?'disabled':''} aria-label="${open?esc(s.short)+' '+format(c.values[idx]):'Открыть карту '+(slot+1)}"><span class="flip-inner"><span class="flip-face flip-front"><span class="symbol">✦</span><small>ТАЙНАЯ КАРТА</small></span><span class="flip-face flip-back"><span class="emoji">${s.emoji}</span><strong>${s.short}</strong><span class="value">${format(c.values[idx])}</span></span></span></button>`}).join('')}
function renderResult(c){
 const target=$('resultArea');target.innerHTML=c.opened.length===5?`<div class="result-box"><span class="eyebrow">ВСЕ ПАРАМЕТРЫ ОТКРЫТЫ</span><h3>Итоговые параметры</h3><p class="muted">🎲 ${esc(modeLabel(c.mode))}</p>${rows(c.values)}<div class="result-actions"><button id="saveCurrent" class="primary">💾 Сохранить результат</button><button id="copyCurrent" class="secondary">📋 Скопировать</button></div></div>`:'';
 if(c.opened.length===5){$('saveCurrent').onclick=saveCurrent;$('copyCurrent').onclick=()=>copyResult(c)}
}
function renderCards(){
 const c=state.current,style=c?.revealStyle||state.revealStyle,isChest=style==='chests',isPaws=style==='paws';

 if(!c){$('cardArea').className='card-area';$('cardArea').innerHTML='<div class="empty-state">✦<br>Выбери режим и начни открытие</div>';$('resultArea').innerHTML='';return}
 const area=$('cardArea');
 if(isChest&&!c.chestOpened){
  area.className='card-area chest-stage';
  area.innerHTML=`<button type="button" class="treasure-chest" id="openChestBtn" aria-label="Открыть сундук"><span class="chest-glow"></span><span class="chest-lid"></span><span class="chest-body"><span class="chest-lock">✦</span></span><span class="chest-hint">Нажми, чтобы открыть сундук</span><span class="chest-sparks" aria-hidden="true">✦ ✧ ✦ ✧ ✦</span></button>`;
  $('openChestBtn').onclick=openChest;renderResult(c);return;
 }
 area.className=isPaws?'trail-area':'card-area'+(isChest?' cards-from-chest':'');
 area.innerHTML=(isChest?'<div class="chest-opened-banner">✨ Из сундука выпали открытые карты!</div>':isPaws?'':'')+(isPaws?pawMarkup(c):cardMarkup(c));
 if(isChest){
  // Face-up markup, not a flipped card; no possibility of showing the reverse side.
  area.querySelectorAll('.flip-card').forEach(button=>{button.classList.add('chest-face-up');if(button instanceof HTMLButtonElement)button.disabled=true;});
 }else{
  area.querySelectorAll('[data-slot]').forEach(b=>b.addEventListener('click',()=>openCard(Number(b.dataset.slot))));
  area.querySelectorAll('[data-paw]').forEach(b=>{b.addEventListener('click',()=>openCard(Number(b.dataset.paw)));b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCard(Number(b.dataset.paw))}})});
 }
 renderResult(c);
}
function saveCurrent(){const c=state.current;if(!c||c.opened.length!==5)return;if(state.saved.some(s=>s.sourceId===c.id)){toast('Эта комбинация уже сохранена');return}if(state.saved.length>=MAX_SAVED){toast('Достигнут лимит 500 сохранений. Удали старые записи.');return}const name=prompt('Название комбинации (можно оставить пустым):','') ;if(name===null)return;state.saved.unshift({id:Date.now(),sourceId:c.id,name:name.trim().slice(0,70)||'Без названия',mode:c.mode,values:[...c.values],date:new Date().toISOString()});persist();updateCount();toast('Комбинация сохранена!')}
function copyResult(c){const text=[`Тип: ${modeLabel(c.mode)}`,...STATS.map((s,i)=>`${s.full}: ${format(c.values[i])}`)].join('\n');if(navigator.clipboard?.writeText){navigator.clipboard.writeText(text).then(()=>toast('Скопировано!')).catch(()=>fallbackCopy(text))}else fallbackCopy(text)}
function fallbackCopy(t){const el=document.createElement('textarea');el.value=t;document.body.append(el);el.select();try{document.execCommand('copy');toast('Скопировано!')}catch{toast('Не удалось скопировать')}el.remove()}
function updateCount(){$('savedCount').textContent=state.saved.length}
function renderSaved(){const filter=$('savedFilter').value,sort=$('savedSort').value;let items=state.saved.filter(x=>filter==='all'||x.mode===filter);items.sort((a,b)=>sort==='old'?a.id-b.id:sort==='new'?b.id-a.id:(b.values[{damage:0,energy:1,regen:2,arrow:3,back:4}[sort]]-a.values[{damage:0,energy:1,regen:2,arrow:3,back:4}[sort]]));$('savedList').innerHTML=items.length?items.map(x=>`<article class="saved-item"><div class="saved-top"><div><h3>⭐ ${esc(x.name)}</h3><small>${esc(modeLabel(x.mode))} · ${new Date(x.date).toLocaleString('ru-RU')}</small></div><div><button class="secondary" data-copy="${x.id}">📋</button> <button class="secondary" data-rename="${x.id}">✎</button> <button class="danger" data-delete="${x.id}">🗑</button></div></div>${rows(x.values)}</article>`).join(''):'<div class="empty-state">Сохранённых комбинаций пока нет</div>';$('savedList').querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyResult(state.saved.find(x=>x.id===Number(b.dataset.copy))));$('savedList').querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{const x=state.saved.find(x=>x.id===Number(b.dataset.rename)),name=prompt('Новое название:',x.name);if(name!==null){x.name=name.trim().slice(0,70)||'Без названия';persist();renderSaved()}});$('savedList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Удалить эту комбинацию?')){state.saved=state.saved.filter(x=>x.id!==Number(b.dataset.delete));persist();updateCount();renderSaved()}})}
function renderRanges(){$('rangeRows').innerHTML=STATS.map((s,i)=>`<div class="range-row"><span>${s.emoji} <b>${s.full}</b></span><label><small>От, %</small><input aria-label="${s.full}: от" type="number" min="0" max="100" step="0.1" data-min="${i}" value="${state.mins[i]/10}"></label><label><small>До, %</small><input aria-label="${s.full}: до" type="number" min="0" max="100" step="0.1" data-max="${i}" value="${state.maxs[i]/10}"></label></div>`).join('');document.querySelectorAll('[data-min],[data-max]').forEach(el=>el.addEventListener('change',()=>{const v=Number(el.value);if(!Number.isFinite(v))return;const unit=Math.round(v*10);if(el.dataset.min!==undefined)state.mins[Number(el.dataset.min)]=unit;else state.maxs[Number(el.dataset.max)]=unit;persist()}))}
function constraints(){const mins=[],maxs=[];for(let i=0;i<5;i++){const a=document.querySelector(`[data-min="${i}"]`),b=document.querySelector(`[data-max="${i}"]`),av=Number(a.value),bv=Number(b.value);if(!Number.isFinite(av)||!Number.isFinite(bv)||av<0||bv>100||av>bv||Math.abs(av*10-Math.round(av*10))>1e-6||Math.abs(bv*10-Math.round(bv*10))>1e-6)return {error:`Проверь границы параметра «${STATS[i].full}»: от 0 до 100 с шагом 0,1, минимум ≤ максимум.`};mins.push(Math.round(av*10));maxs.push(Math.round(bv*10))}if(mins.reduce((a,b)=>a+b,0)>1000||maxs.reduce((a,b)=>a+b,0)<1000)return {error:'Невозможные критерии: сумма минимумов превышает 100% или сумма максимумов меньше 100%.'};const m=state.chanceMode;if(m==='balanced'&&(mins.some(x=>x>400)||maxs.some(x=>x<150)))return {error:'Критерии несовместимы с балансом (каждый параметр 15–40%).'};const group=m.startsWith('speed')?[3,4]:m.startsWith('defense')?[1,2]:m.startsWith('attack')?[0]:[];const required=m.endsWith('70')?700:m.endsWith('40')?400:m.endsWith('25')?250:0;if(group.length&&group.reduce((s,i)=>s+maxs[i],0)<required)return {error:'Максимумы выбранной группы не позволяют выполнить уклон.'};return {mins,maxs}}
function updateTimers(){const locked=!!state.current&&state.current.opened.length<5;$('generateBtn').disabled=locked;$('genCooldown').textContent=locked?'Сначала открой все 5 предметов':'';$('calcBtn').disabled=calculating;$('calcCooldown').textContent=''}
function startCalc(){
 if(calculating)return;
 const check=constraints();if(check.error){toast(check.error);return}
 state.mins=check.mins;state.maxs=check.maxs;persist();
 calculating=true;$('progressTrack').hidden=true;$('chanceResult').innerHTML='';
 $('calcBtn').disabled=true;$('calcStatus').textContent='Подсчёт допустимых комбинаций…';
 worker=new Worker('worker.js?v=10');
 const context={mode:state.chanceMode,mins:[...check.mins],maxs:[...check.maxs]};
 const finish=()=>{worker?.terminate();worker=null;calculating=false;$('calcBtn').disabled=false};
 worker.onmessage=e=>{const d=e.data;
  if(d.type==='exactError'){finish();$('calcStatus').textContent='Ошибка расчёта: '+d.message;return}
  if(d.type!=='exactComplete')return;
  finish();const record={...context,exact:true,numerator:d.numerator,denominator:d.denominator,done:0,hits:0,stopped:false,date:new Date().toISOString(),id:Date.now()};
  state.lastChance=record;state.history.unshift(record);state.history=state.history.slice(0,MAX_HISTORY);persist();renderChanceResult(record);$('calcStatus').textContent='Точный расчёт завершён';
 };
 worker.onerror=()=>{finish();$('calcStatus').textContent='Ошибка расчёта. Попробуй снова.'};
 worker.postMessage({type:'exact',...context});
}
function exactPercent(r){const a=BigInt(r.numerator),b=BigInt(r.denominator);if(!b)return '—';const rounded=(a*100000n+b/2n)/b;return (Number(rounded)/1000).toLocaleString('ru-RU',{minimumFractionDigits:3,maximumFractionDigits:3})+'%'}
function exactOdds(r){const a=BigInt(r.numerator),b=BigInt(r.denominator);if(!b)return 'Нет допустимых комбинаций в выбранном режиме.';if(!a)return 'Подходящих комбинаций нет — шанс равен нулю.';const rounded=(b+a/2n)/a;return 'В среднем 1 комбинация из '+rounded.toLocaleString('ru-RU')+' соответствует условиям.'}
function renderChanceResult(r){if(!r){$('chanceResult').innerHTML='';return}if(r.exact){$('chanceResult').innerHTML=`<div class="result-box"><span class="eyebrow">ТОЧНЫЙ РАСЧЁТ В МОДЕЛИ СИМУЛЯТОРА</span><h3>${esc(modeLabel(r.mode))}</h3><div class="chance-number">${exactPercent(r)}</div><p class="muted">${exactOdds(r)}</p><p class="muted">Вероятность рассчитана точно, но отображается с округлением до 0,001%. Это вероятность в математической модели симулятора, не подтверждённый шанс в CatWar.</p></div>`;return}$('chanceResult').innerHTML='';}
function renderHistory(){$('historyList').innerHTML=state.history.length?state.history.map(r=>`<article class="saved-item"><div class="saved-top"><div><h3>📊 ${esc(modeLabel(r.mode))}</h3><small>${new Date(r.date).toLocaleString('ru-RU')} · ${r.exact?'точный подсчёт':r.done.toLocaleString('ru-RU')+' попыток'} ${r.stopped?'· остановлено':''}</small></div><button class="secondary" data-repeat="${r.id}">Повторить условия</button></div><div class="chance-number">${r.exact?exactPercent(r):(r.done?100*r.hits/r.done:0).toLocaleString('ru-RU',{maximumFractionDigits:4})+'%'}</div><span class="muted">${r.exact?exactOdds(r):'Архивный расчёт методом Монте-Карло'}</span></article>`).join(''):'<div class="empty-state">Расчётов пока нет</div>';$('historyList').querySelectorAll('[data-repeat]').forEach(b=>b.onclick=()=>{const r=state.history.find(x=>x.id===Number(b.dataset.repeat));state.chanceMode=r.mode;state.mins=[...r.mins];state.maxs=[...r.maxs];state.iterations=r.iterations;persist();$('chanceMode').value=r.mode;desc('chanceDescription',r.mode);renderRanges();switchTab('chance');toast('Условия восстановлены')})}
function downloadData(){const blob=new Blob([JSON.stringify({app:'catwar-simulator',version:1,data:state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='catwar-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function validateBackup(d){if(!d||d.app!=='catwar-simulator'||d.version!==1||!d.data)throw Error('Неподдерживаемый файл');const s=d.data;if(!Array.isArray(s.saved)||!Array.isArray(s.history)||s.saved.length>MAX_SAVED||s.history.length>MAX_HISTORY)throw Error('Некорректные коллекции');const goodV=v=>Array.isArray(v)&&v.length===5&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=1000)&&v.reduce((a,b)=>a+b,0)===1000;for(const x of s.saved){if(!goodV(x.values)||!MODES[x.mode]||typeof x.name!=='string')throw Error('Некорректные параметры')}if(s.current&&(!goodV(s.current.values)||!MODES[s.current.mode]||!Array.isArray(s.current.order)||new Set(s.current.order).size!==5||!s.current.order.every(x=>Number.isInteger(x)&&x>=0&&x<5)||!Array.isArray(s.current.opened)||!s.current.opened.every(x=>Number.isInteger(x)&&x>=0&&x<5)))throw Error('Некорректные карточки');for(const r of s.history){if(!MODES[r.mode]||!Number.isInteger(r.done)||r.done<0||r.done>100000||!Number.isInteger(r.hits)||r.hits<0||r.hits>r.done||!Array.isArray(r.mins)||!Array.isArray(r.maxs)||r.mins.length!==5||r.maxs.length!==5)throw Error('Некорректная история')}return {...initial,...s,saved:s.saved,history:s.history,theme:s.theme==='light'?'light':'dark',sound:!!s.sound,soundStyle:['sparkle','wood','chime','soft'].includes(s.soundStyle)?s.soundStyle:'sparkle',revealStyle:['cards','chests','paws'].includes(s.revealStyle)?s.revealStyle:'cards',soundVolume:Math.min(100,Math.max(0,Number(s.soundVolume??75))),motion:s.motion!==false,lastGenAt:Math.min(Date.now(),Math.max(0,Number(s.lastGenAt)||0)),lastCalcAt:Math.min(Date.now(),Math.max(0,Number(s.lastCalcAt)||0))}}
function setup(){modeSelect($('genMode'),state.mode);modeSelect($('chanceMode'),state.chanceMode);modeSelect($('savedFilter'),'all');$('savedFilter').insertAdjacentHTML('afterbegin','<option value="all">Все режимы</option>');$('savedFilter').value='all';desc('genDescription',state.mode);desc('chanceDescription',state.chanceMode);theme();renderCards();renderRanges();renderChanceResult(state.lastChance);updateCount();updateTimers();setInterval(updateTimers,500);document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';persist();theme()};$('genMode').onchange=e=>{state.mode=e.target.value;persist();desc('genDescription',state.mode)};$('chanceMode').onchange=e=>{state.chanceMode=e.target.value;persist();desc('chanceDescription',state.chanceMode)};$('generateBtn').onclick=startGen;$('calcBtn').onclick=startCalc;$('savedFilter').onchange=renderSaved;$('savedSort').onchange=renderSaved;$('soundToggle').onchange=e=>{state.sound=e.target.checked;persist()};$('soundStyle').onchange=e=>{state.soundStyle=e.target.value;persist();playSound(true)};$('soundPreview').onclick=()=>playSound(true);$('soundVolume').oninput=e=>{state.soundVolume=Number(e.target.value);persist()};$('revealStyle').onchange=e=>{state.revealStyle=e.target.value;persist();if(!state.current)renderCards();else toast('Способ открытия применится к следующей генерации')};$('motionToggle').onchange=e=>{state.motion=e.target.checked;persist();theme()};$('exportBtn').onclick=downloadData;$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw Error('Файл слишком большой');const data=validateBackup(JSON.parse(await file.text()));if(!confirm('Заменить текущие локальные данные данными из файла?'))return;worker?.terminate();state=data;persist();location.reload()}catch(err){toast('Импорт не выполнен: '+err.message)}finally{e.target.value=''}};$('clearBtn').onclick=()=>{if(confirm('Безвозвратно удалить ВСЕ сохранения, историю и настройки?')){worker?.terminate();localStorage.removeItem(KEY);location.reload()}}}setup();
