/* CatWar fan simulator — local only, no backend */
const KEY='catwar-simulator-v1',COOLDOWN=60000,MAX_SAVED=500,MAX_HISTORY=100;
const initial={theme:'dark',sound:false,soundStyle:'sparkle',revealStyle:'cards',soundVolume:75,motion:true,mode:'normal',chanceMode:'normal',chanceModes:['normal'],iterations:10000,mins:[0,0,0,0,0],maxs:[1000,1000,1000,1000,1000],lastGenAt:0,lastCalcAt:0,current:null,saved:[],history:[],lastChance:null,badEnabled:false,badLogic:'and',badMins:[0,0,0,0,0],badMaxs:[1000,1000,1000,1000,1000],badActive:[false,false,false,false,false],badBlocks:[],goodEnabled:true,goodBlocks:[],chancePresets:[]};
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
function startGen(){if(state.current&&state.current.opened.length<5){toast('Сначала открой все пять предметов текущей комбинации');return}const values=generate(state.mode);state.current={values,mode:state.mode,order:state.revealStyle==='cards'?[0,1,2,3,4]:shuffle([0,1,2,3,4]),opened:state.revealStyle==='quick'?[0,1,2,3,4]:[],chestOpened:false,revealStyle:state.revealStyle,id:Date.now()};persist();renderCards();updateTimers()}
function openCard(slot){
 const c=state.current;if(!c||c.opened.includes(slot))return;
 if(c.revealStyle==='paws'&&slot!==c.opened.length)return;
 c.opened.push(slot);playSound();persist();
 // Reveal only the clicked element: never rebuild or reshuffle the row.
 const button=$('cardArea').querySelector(`[data-slot="${slot}"], [data-paw="${slot}"]`);
 if(button){if(button.hasAttribute('data-paw')){button.classList.add('revealed');button.setAttribute('aria-disabled','true');button.setAttribute('tabindex','-1');}else{button.classList.add('open');}if(button instanceof HTMLButtonElement)button.disabled=true;}
 updateTimers();
 if(c.revealStyle==='paws')renderCards();
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
 const desktopPlaces=[[155,350],[315,250],[460,350],[610,215],[760,300]];
 const mobilePlaces=[[115,130],[285,260],[115,400],[285,540],[115,685]];
 const paw=(x,y,slot,idx)=>{const p=STATS[idx],opened=c.opened.includes(slot),label=opened?`${p.short}: ${format(c.values[idx])}`:`След ${slot+1}`;
  const align=x>550||(x>200&&x<420)?'end':'start',tx=align==='end'?-62:62;
  return `<g class="footprint ${opened?'revealed':''}" data-paw="${slot}" role="button" tabindex="${opened?'-1':'0'}" aria-label="${esc(label)}" aria-disabled="${opened}" transform="translate(${x} ${y})">
    <g class="paw-symbol" transform="rotate(-18)"><ellipse cx="0" cy="13" rx="22" ry="17"/><ellipse cx="-27" cy="-12" rx="9" ry="12"/><ellipse cx="-9" cy="-27" rx="9" ry="12"/><ellipse cx="13" cy="-27" rx="9" ry="12"/><ellipse cx="30" cy="-10" rx="8" ry="11"/></g>
    <circle class="paw-wave" r="35"/><g class="paw-label" transform="translate(${tx} -3)"><text text-anchor="${align}" class="paw-name">${esc(p.short)}</text><text text-anchor="${align}" y="30" class="paw-percent">${format(c.values[idx])}</text></g>
  </g>`};
 const svg=(places,viewBox,path,cls)=>`<svg class="trail-illustration ${cls}" viewBox="${viewBox}" role="group" aria-label="Пять отпечатков лап на лесной тропе"><defs><linearGradient id="trailSoil-${cls}" x1="0" x2="1"><stop stop-color="#97794b" stop-opacity=".15"/><stop offset=".5" stop-color="#c9ac70" stop-opacity=".4"/><stop offset="1" stop-color="#97794b" stop-opacity=".15"/></linearGradient></defs><path class="winding-trail" style="stroke:url(#trailSoil-${cls})" d="${path}"/><path class="trail-dashes" d="${path}"/>${c.order.map((idx,slot)=>slot<=c.opened.length?paw(...places[slot],slot,idx):'').join('')}</svg>`;
 return `<div class="forest-trail paw-scene"><div class="trail-hint">Нажми на лапку, чтобы открыть параметр. Следующая появится после открытия.</div>${svg(desktopPlaces,'0 0 900 470','M100 480 Q35 340 270 340 T420 250 T660 250 T850 100','desktop-trail')}${svg(mobilePlaces,'0 0 420 800','M115 35 Q340 120 285 260 T115 400 T285 540 T115 750','mobile-trail')}</div>`;
}
function cardMarkup(c){return c.order.map((idx,slot)=>{const s=STATS[idx],open=c.opened.includes(slot);return `<button type="button" class="flip-card ${open?'open':''}" data-slot="${slot}" style="--card-index:${slot}" ${open?'disabled':''} aria-label="${open?esc(s.short)+' '+format(c.values[idx]):'Открыть '+esc(s.short)}"><span class="flip-inner"><span class="flip-face flip-front"><span class="symbol">${s.emoji}</span></span><span class="flip-face flip-back"><span class="emoji">${s.emoji}</span><strong>${s.short}</strong><span class="value">${format(c.values[idx])}</span></span></span></button>`}).join('')}
function renderResult(c){
 const target=$('resultArea');target.innerHTML=c.opened.length===5?`<div class="result-box"><span class="eyebrow">ВСЕ ПАРАМЕТРЫ ОТКРЫТЫ</span><h3>Итоговые параметры</h3><p class="muted">🎲 ${esc(modeLabel(c.mode))}</p>${rows(c.values)}<div class="result-actions"><button id="saveCurrent" class="primary">💾 Сохранить результат</button><button id="copyCurrent" class="secondary">📋 Скопировать</button></div></div>`:'';
 if(c.opened.length===5){$('saveCurrent').onclick=saveCurrent;$('copyCurrent').onclick=()=>copyResult(c)}
}
function renderCards(){
 const c=state.current,style=c?.revealStyle||state.revealStyle,isChest=style==='chests',isPaws=style==='paws',isQuick=style==='quick';

 if(!c){$('cardArea').className='card-area';$('cardArea').innerHTML='<div class="empty-state">✦<br>Выбери режим и начни открытие</div>';$('resultArea').innerHTML='';return}
 const area=$('cardArea');
 if(isQuick){
  // Fast mode shows the final stat panel immediately; no cards or reveal animation.
  if(c.opened.length!==5){c.opened=[0,1,2,3,4];persist();}
  area.className='card-area quick-stage';area.innerHTML='';
  renderResult(c);return;
 }
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
function constraints(){const mins=[],maxs=[];for(let i=0;i<5;i++){const a=document.querySelector(`[data-min="${i}"]`),b=document.querySelector(`[data-max="${i}"]`),av=Number(a.value),bv=Number(b.value);if(!Number.isFinite(av)||!Number.isFinite(bv)||av<0||bv>100||av>bv||Math.abs(av*10-Math.round(av*10))>1e-6||Math.abs(bv*10-Math.round(bv*10))>1e-6)return {error:`Проверь границы параметра «${STATS[i].full}»: от 0 до 100 с шагом 0,1, минимум ≤ максимум.`};mins.push(Math.round(av*10));maxs.push(Math.round(bv*10))}if(mins.reduce((a,b)=>a+b,0)>1000||maxs.reduce((a,b)=>a+b,0)<1000)return {error:'Невозможные критерии: сумма минимумов превышает 100% или сумма максимумов меньше 100%.'};return {mins,maxs}}
function normalizeBadBlocks(){
 if(!Array.isArray(state.badBlocks))state.badBlocks=[];
 if(!state.badBlocks.length&&state.badEnabled&&state.badActive?.some(Boolean)){
  if(state.badLogic==='and')state.badBlocks=[{name:'Неприемлемая комбинация 1',ranges:state.badActive.map((v,i)=>v?{min:state.badMins[i],max:state.badMaxs[i]}:null)}];
  else state.badBlocks=state.badActive.map((v,i)=>v?{name:`Неприемлемая комбинация ${i+1}`,ranges:state.badActive.map((_,j)=>i===j?{min:state.badMins[j],max:state.badMaxs[j]}:null)}:null).filter(Boolean);
 }
}
function renderBadRanges(){
 normalizeBadBlocks();$('badEnabled').checked=!!state.badEnabled;$('badOptions').hidden=!state.badEnabled;
 $('badBlocks').innerHTML=state.badBlocks.map((b,k)=>`<div class="bad-block"><div class="bad-block-head"><label>Название <input type="text" maxlength="70" data-bad-name="${k}" value="${esc(b.name||'')}"></label><button type="button" class="danger" data-bad-remove="${k}">🗑 Удалить</button></div><div class="range-rows">${STATS.map((st,i)=>`<div class="range-row"><span>${st.emoji} <b>${st.full}</b></span><label><small>От, %</small><input type="number" min="0" max="100" step="0.1" placeholder="—" data-bad-min="${k}-${i}" value="${b.ranges?.[i]?.min===undefined?'':b.ranges[i].min/10}"></label><label><small>До, %</small><input type="number" min="0" max="100" step="0.1" placeholder="—" data-bad-max="${k}-${i}" value="${b.ranges?.[i]?.max===undefined?'':b.ranges[i].max/10}"></label></div>`).join('')}</div></div>`).join('');
 $('badEnabled').onchange=e=>{state.badEnabled=e.target.checked;$('badOptions').hidden=!state.badEnabled;persist()};
 $('addBadBlock').onclick=()=>{state.badBlocks.push({name:`Неприемлемая комбинация ${state.badBlocks.length+1}`,ranges:Array(5).fill(null)});persist();renderBadRanges()};
 $('badBlocks').querySelectorAll('[data-bad-remove]').forEach(el=>el.onclick=()=>{state.badBlocks.splice(Number(el.dataset.badRemove),1);persist();renderBadRanges()});
 $('badBlocks').querySelectorAll('[data-bad-name]').forEach(el=>el.oninput=()=>{state.badBlocks[Number(el.dataset.badName)].name=el.value.slice(0,70);persist()});
 $('badBlocks').querySelectorAll('[data-bad-min],[data-bad-max]').forEach(el=>el.onchange=()=>{
  const key=el.dataset.badMin||el.dataset.badMax;const [k,i]=key.split('-').map(Number);
  const a=document.querySelector(`[data-bad-min="${k}-${i}"]`).value.trim(),b=document.querySelector(`[data-bad-max="${k}-${i}"]`).value.trim();
  state.badBlocks[k].ranges[i]=a===''&&b===''?null:{min:a===''?null:Math.round(Number(a)*10),max:b===''?null:Math.round(Number(b)*10)};persist();
 });
}
function badConstraints(){
 if(!$('badEnabled').checked)return null;
 const blocks=[];
 for(let k=0;k<state.badBlocks.length;k++){
  const b=state.badBlocks[k],mins=Array(5).fill(0),maxs=Array(5).fill(1000),conditions=[];
  for(let i=0;i<5;i++){
   const a=document.querySelector(`[data-bad-min="${k}-${i}"]`).value.trim(),z=document.querySelector(`[data-bad-max="${k}-${i}"]`).value.trim();
   if(a===''&&z==='')continue;
   if(a===''||z==='')return {error:`Заполни обе границы в блоке №${k+1} (${STATS[i].full})`};
   const x=Number(a),y=Number(z);
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y>100||x>y||Math.abs(x*10-Math.round(x*10))>1e-6||Math.abs(y*10-Math.round(y*10))>1e-6)return {error:`Проверь диапазон в блоке №${k+1}: ${STATS[i].full}`};
   mins[i]=Math.round(x*10);maxs[i]=Math.round(y*10);conditions.push(i);
  }
  if(conditions.length)blocks.push({name:b.name.trim()||`Неприемлемая комбинация ${k+1}`,mins,maxs,conditions});
 }
 if(!blocks.length)return {error:'Добавь хотя бы один блок с заполненными диапазонами'};
 if(blocks.length>12)return {error:'Для точного расчёта можно использовать не более 12 заполненных блоков'};
 return blocks;
}
function ensureGoodBlock(){
 if(!Array.isArray(state.goodBlocks))state.goodBlocks=[];
 if(!state.goodBlocks.length){
  const ranges=STATS.map((_,i)=>state.mins?.[i]!==undefined&&state.maxs?.[i]!==undefined&&(state.mins[i]!==0||state.maxs[i]!==1000)?{min:state.mins[i],max:state.maxs[i]}:null);
  state.goodBlocks=[{name:'Желаемая комбинация 1',ranges}];
 }
 state.goodEnabled=true;
}
function renderGoodRanges(){
 ensureGoodBlock();$('goodOptions').hidden=false;
 $('goodBlocks').innerHTML=state.goodBlocks.map((b,k)=>`<div class="good-block"><div class="good-block-head"><label>Название <input type="text" maxlength="70" data-good-name="${k}" value="${esc(b.name||'')}"></label>${state.goodBlocks.length>1?`<button type="button" class="danger" data-good-remove="${k}">🗑 Удалить</button>`:`<span class="muted">Обязательный блок</span>`}</div><div class="range-rows">${STATS.map((st,i)=>`<div class="range-row"><span>${st.emoji} <b>${st.full}</b></span><label><small>От, %</small><input type="number" min="0" max="100" step="0.1" placeholder="—" data-good-min="${k}-${i}" value="${b.ranges?.[i]?.min===undefined?'':b.ranges[i].min/10}"></label><label><small>До, %</small><input type="number" min="0" max="100" step="0.1" placeholder="—" data-good-max="${k}-${i}" value="${b.ranges?.[i]?.max===undefined?'':b.ranges[i].max/10}"></label></div>`).join('')}</div></div>`).join('');
 
 $('addGoodBlock').onclick=()=>{state.goodBlocks.push({name:`Желаемая комбинация ${state.goodBlocks.length+1}`,ranges:Array(5).fill(null)});persist();renderGoodRanges()};
 $('goodBlocks').querySelectorAll('[data-good-remove]').forEach(el=>el.onclick=()=>{if(state.goodBlocks.length<=1)return;state.goodBlocks.splice(Number(el.dataset.goodRemove),1);persist();renderGoodRanges()});
 $('goodBlocks').querySelectorAll('[data-good-name]').forEach(el=>el.oninput=()=>{state.goodBlocks[Number(el.dataset.goodName)].name=el.value.slice(0,70);persist()});
 $('goodBlocks').querySelectorAll('[data-good-min],[data-good-max]').forEach(el=>el.onchange=()=>{
  const key=el.dataset.goodMin||el.dataset.goodMax;const [k,i]=key.split('-').map(Number);
  const a=document.querySelector(`[data-good-min="${k}-${i}"]`).value.trim(),b=document.querySelector(`[data-good-max="${k}-${i}"]`).value.trim();
  state.goodBlocks[k].ranges[i]=a===''&&b===''?null:{min:a===''?null:Math.round(Number(a)*10),max:b===''?null:Math.round(Number(b)*10)};persist();
 });
}
function goodConstraints(){
 ensureGoodBlock();
 const blocks=[];
 for(let k=0;k<state.goodBlocks.length;k++){
  const b=state.goodBlocks[k],mins=Array(5).fill(0),maxs=Array(5).fill(1000),conditions=[];
  for(let i=0;i<5;i++){
   const a=document.querySelector(`[data-good-min="${k}-${i}"]`).value.trim(),z=document.querySelector(`[data-good-max="${k}-${i}"]`).value.trim();
   if(a===''&&z==='')continue;
   if(a===''||z==='')return {error:`Заполни обе границы в блоке №${k+1} (${STATS[i].full})`};
   const x=Number(a),y=Number(z);
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y>100||x>y||Math.abs(x*10-Math.round(x*10))>1e-6||Math.abs(y*10-Math.round(y*10))>1e-6)return {error:`Проверь диапазон в блоке №${k+1}: ${STATS[i].full}`};
   mins[i]=Math.round(x*10);maxs[i]=Math.round(y*10);conditions.push(i);
  }
  if(conditions.length)blocks.push({name:b.name.trim()||`Желаемая комбинация ${k+1}`,mins,maxs,conditions});
 }
 if(!blocks.length)return {error:'Добавь хотя бы один блок с заполненными диапазонами'};
 if(blocks.length>12)return {error:'Для точного расчёта можно использовать не более 12 заполненных блоков'};
 return blocks;
}
function updateTimers(){const locked=!!state.current&&state.current.opened.length<5;$('generateBtn').disabled=locked;$('genCooldown').textContent=locked?'Сначала открой все 5 предметов':'';$('calcBtn').disabled=calculating;}
function selectedChanceModes(){return [...document.querySelectorAll('[data-chance-mode]:checked')].map(x=>x.value)}
function renderChanceModes(){const modes=Array.isArray(state.chanceModes)&&state.chanceModes.length?state.chanceModes:[state.chanceMode||'normal'];$('chanceModes').innerHTML=Object.entries(MODES).map(([key,m])=>`<label class="chance-mode-choice"><input type="checkbox" data-chance-mode value="${key}" ${modes.includes(key)?'checked':''}><span>${esc(m.name)}</span></label>`).join('');$('chanceModes').querySelectorAll('input').forEach(el=>el.onchange=()=>{const chosen=selectedChanceModes();state.chanceModes=chosen;state.chanceMode=chosen[0]||'normal';persist()})}
function startCalc(){
 if(calculating)return;
 const modes=selectedChanceModes();if(!modes.length){toast('Выбери хотя бы один тип генерации');return}
 const good=goodConstraints();if(good?.error){toast(good.error);return}const check={mins:Array(5).fill(0),maxs:Array(5).fill(1000)};const bad=badConstraints();if(bad?.error){toast(bad.error);return}state.badEnabled=!!bad;state.goodEnabled=true;
 state.mins=check.mins;state.maxs=check.maxs;state.chanceModes=modes;state.chanceMode=modes[0];persist();
 calculating=true;$('progressTrack').hidden=true;$('chanceResult').innerHTML='';updateTimers();
 const results=[];let index=0;
 const finish=()=>{worker?.terminate();worker=null;calculating=false;updateTimers()};
 const next=()=>{if(index>=modes.length){finish();state.lastChance=results.length===1?results[0]:{comparison:true,results};persist();renderChanceResult(state.lastChance);$('calcStatus').textContent='Сравнение завершено';return}
 const mode=modes[index++];$('calcStatus').textContent=`Расчёт ${index} из ${modes.length}: ${modeLabel(mode)}…`;
 worker=new Worker('worker.js?v=10-14-blocks');
 worker.onmessage=e=>{const d=e.data;worker.terminate();worker=null;
 if(d.type==='exactError'){$('calcStatus').textContent=`Ошибка в режиме «${modeLabel(mode)}»: ${d.message}`;finish();return}
 if(d.type!=='exactComplete')return;
 const record={mode,mins:[...check.mins],maxs:[...check.maxs],exact:true,numerator:d.numerator,denominator:d.denominator,badNumerator:d.badNumerator,badBlockNumerators:d.badBlockNumerators,badBlocks:bad?structuredClone(bad):undefined,goodNumerator:d.goodNumerator,goodBlockNumerators:d.goodBlockNumerators,goodBlocks:good?structuredClone(good):undefined,conflicts:d.conflicts,done:0,hits:0,stopped:false,date:new Date().toISOString(),id:Date.now()*100+index};
 results.push(record);state.history.unshift(record);state.history=state.history.slice(0,MAX_HISTORY);persist();renderChanceResult({comparison:true,results:[...results]});next();};
 worker.onerror=()=>{$('calcStatus').textContent='Ошибка расчёта. Попробуй снова.';finish()};
 worker.postMessage({type:'exact',mode,mins:check.mins,maxs:check.maxs,bad,good});};next();
}
function exactPercent(r){const a=BigInt(r.numerator),b=BigInt(r.denominator);if(!b)return '—';const rounded=(a*100000n+b/2n)/b;return (Number(rounded)/1000).toLocaleString('ru-RU',{minimumFractionDigits:3,maximumFractionDigits:3})+'%'}
function exactOdds(r){
 const a=BigInt(r.numerator), b=BigInt(r.denominator);
 if(!b)return 'Нет допустимых комбинаций в выбранном режиме.';
 if(!a)return 'Подходящих комбинаций нет — шанс равен нулю.';
 if(a===b)return 'Все комбинации соответствуют условиям.';
 const fmt=n=>n.toLocaleString('ru-RU');
 function gcd(x,y){while(y){const t=x%y;x=y;y=t;}return x;}
 const divisor=gcd(a,b), exactA=a/divisor,exactB=b/divisor;
 // Точная короткая дробь отображается без знака приближения.
 if(exactB<=100n)return 'В среднем '+fmt(exactA)+' '+(exactA===1n?'комбинация':'комбинаций')+' из '+fmt(exactB)+' соответствует условиям.';
 // Для обычных шансов: отклонение не больше 0,1 процентного пункта.
 // Для редких (<1%): относительная погрешность не больше 1%.
 const rare=a*100n<b;
 const toleranceNumerator=rare?a: b;
 const toleranceDenominator=rare?100n:1000n;
 // Выбираем минимальный знаменатель, который удовлетворяет погрешности.
 for(let q=2n;q<=10000n;q++){
  const nearest=(a*q+b/2n)/b;
  if(nearest<1n||nearest>q)continue;
  const error=(nearest*b>a*q?nearest*b-a*q:a*q-nearest*b);
  if(error*toleranceDenominator<=toleranceNumerator*q){
   const d=gcd(nearest,q);
   return 'В среднем ≈ '+fmt(nearest/d)+' '+(nearest/d===1n?'комбинация':'комбинаций')+' из '+fmt(q/d)+' соответствует условиям.';
  }
 }
 // Для крайне редких событий — понятная запись «1 из N».
 const n=(b+a/2n)/a;
 return 'В среднем ≈ 1 комбинация из '+fmt(n)+' соответствует условиям.';
}
function overlapInfo(item){
 if(item.goodNumerator===undefined||item.badNumerator===undefined)return '';
 if(!Array.isArray(item.conflicts))return '';
 if(item.conflicts.length)return `<div class="overlap-alert" role="alert"><h4>⚠️ КПД недоступен: условия пересекаются</h4><p>Красным отмечены желаемые и неприемлемые блоки, которые могут выполняться одновременно.</p></div>`;
 const good=BigInt(item.goodNumerator),bad=BigInt(item.badNumerator);
 let value;
 if(good===0n&&bad===0n)value='Не определён';
 else if(bad===0n)value=good===0n?'Не определён':'∞';
 else {
  const scaled=(good*1000n*2n+bad)/(2n*bad);
  const whole=scaled/1000n,frac=(scaled%1000n).toString().padStart(3,'0');
  value=whole.toString()+','+frac;
 }
 return `<div class="kpi-box"><h4>⚖️ КПД</h4><div class="kpi-value">${value}</div><p class="muted kpi-hint">Чем выше КПД, тем благоприятнее соотношение шансов. При значении ниже 1 неприемлемые комбинации вероятнее желаемых.${bad===0n&&good>0n?' Шанс неприемлемых комбинаций равен нулю.':''}</p></div>`;
}
function goodResultHtml(item){if(item.goodNumerator===undefined)return '';const blocks=item.goodBlocks||[],bad=new Set((item.conflicts||[]).map(x=>x.good));return `<div class="bad-result good-result"><h4>✅ Желаемые комбинации</h4><div class="bad-total">🟢 Общий шанс: <strong>${exactPercent({numerator:item.goodNumerator,denominator:item.denominator})}</strong><p class="muted">${exactOdds({numerator:item.goodNumerator,denominator:item.denominator})}</p></div>${blocks.map((b,i)=>`<div class="bad-result-block ${bad.has(i)?'block-conflict':''}"><b>${bad.has(i)?'⚠️ ':''}${esc(b.name)}</b><div class="muted">${b.conditions.map(j=>`${STATS[j].emoji} ${esc(STATS[j].full)} ${b.mins[j]/10}–${b.maxs[j]/10}%`).join(' <b>И</b> ')}</div><strong>${exactPercent({numerator:item.goodBlockNumerators?.[i]||'0',denominator:item.denominator})}</strong></div>`).join('')}</div>`}
function badResultHtml(item){if(item.badNumerator===undefined)return '';const blocks=item.badBlocks||[],bad=new Set((item.conflicts||[]).map(x=>x.bad));return `<div class="bad-result"><h4>🚫 Неприемлемые комбинации</h4><div class="bad-total">🔴 Общий шанс: <strong>${exactPercent({numerator:item.badNumerator,denominator:item.denominator})}</strong><p class="muted">${exactOdds({numerator:item.badNumerator,denominator:item.denominator})}</p></div>${blocks.map((b,i)=>`<div class="bad-result-block ${bad.has(i)?'block-conflict':''}"><b>${bad.has(i)?'⚠️ ':''}${esc(b.name)}</b><div class="muted">${b.conditions.map(j=>`${STATS[j].emoji} ${esc(STATS[j].full)} ${b.mins[j]/10}–${b.maxs[j]/10}%`).join(' <b>И</b> ')}</div><strong>${exactPercent({numerator:item.badBlockNumerators?.[i]||'0',denominator:item.denominator})}</strong></div>`).join('')}</div>`}
function chanceCompare(a,b,kind){
 const an=BigInt(kind==='bad'?(a.badNumerator??0):(a.goodNumerator??a.numerator??0));
 const bn=BigInt(kind==='bad'?(b.badNumerator??0):(b.goodNumerator??b.numerator??0));
 const ad=BigInt(a.denominator),bd=BigInt(b.denominator);
 const diff=an*bd-bn*ad;
 return diff>0n?-1:diff<0n?1:0;
}
function kpiEligible(item){return item.goodNumerator!==undefined&&item.badNumerator!==undefined&&!(item.conflicts||[]).length&&BigInt(item.badNumerator)>0n}
function chanceSortCompare(a,b,sort){
 if(sort==='good'||sort==='bad')return chanceCompare(a,b,sort);
 const ae=kpiEligible(a),be=kpiEligible(b);
 if(ae!==be)return ae?-1:1;
 if(!ae)return chanceCompare(a,b,'good');
 const left=BigInt(a.goodNumerator)*BigInt(b.badNumerator);
 const right=BigInt(b.goodNumerator)*BigInt(a.badNumerator);
 return left>right?-1:left<right?1:chanceCompare(a,b,'good');
}
function renderChanceResult(r){
 const sortBox=document.querySelector('.chance-sort');
 if(!r){$('chanceResult').innerHTML='';if(sortBox)sortBox.hidden=true;return}
 const results=r.comparison?r.results:[r];
 if(sortBox)sortBox.hidden=results.length<2;
 const sort=$('chanceSort')?.value||'kpi';
 const sorted=[...results].sort((a,b)=>chanceSortCompare(a,b,sort));
 const label=sort==='kpi'?'🏆 ЛУЧШИЙ КПД':sort==='good'?'🏆 ВЫСШИЙ ШАНС УДАЧИ':'🏆 ВЫСШИЙ ШАНС НЕУДАЧИ';
 $('chanceResult').innerHTML=`<div class="chance-comparison">${sorted.map((item,i)=>`<div class="result-box"><span class="eyebrow">${results.length>1&&i===0?label:'ТОЧНЫЙ РАСЧЁТ'}</span><h3>${esc(modeLabel(item.mode))}</h3>${item.goodNumerator===undefined?`<div class="chance-number">${exactPercent(item)}</div><p class="muted">${exactOdds(item)}</p>`:''}${goodResultHtml(item)}${badResultHtml(item)}${overlapInfo(item)}</div>`).join('')}</div><p class="muted">Вероятность отображается с точностью до 0,001%.</p>`;
}
function renderHistory(){$('historyList').innerHTML=state.history.length?state.history.map(r=>`<article class="saved-item compact-history"><div class="saved-top"><div><h3>📊 ${esc(modeLabel(r.mode))}</h3><small>${new Date(r.date).toLocaleString('ru-RU')} · ${r.exact?'точный подсчёт':r.done.toLocaleString('ru-RU')+' попыток'} ${r.stopped?'· остановлено':''}</small></div><button class="secondary" data-repeat="${r.id}">Повторить условия</button></div><div class="chance-number">${r.exact?exactPercent(r):(r.done?100*r.hits/r.done:0).toLocaleString('ru-RU',{maximumFractionDigits:4})+'%'}</div><details class="history-details"><summary>Подробнее</summary><span class="muted">${r.exact?exactOdds(r):'Архивный расчёт методом Монте-Карло'}</span></details></article>`).join(''):'<div class="empty-state">Расчётов пока нет</div>';$('historyList').querySelectorAll('[data-repeat]').forEach(b=>b.onclick=()=>{const r=state.history.find(x=>x.id===Number(b.dataset.repeat));state.chanceMode=r.mode;state.mins=[...r.mins];state.maxs=[...r.maxs];state.iterations=r.iterations;persist();state.chanceModes=[r.mode];renderChanceModes();if(Array.isArray(r.badBlocks)){state.badEnabled=true;state.badBlocks=r.badBlocks.map(b=>({name:b.name,ranges:b.mins.map((min,i)=>b.conditions.includes(i)?{min,max:b.maxs[i]}:null)}))}else if(r.badNumerator!==undefined){state.badEnabled=true;state.badLogic=r.badLogic||'and';state.badActive=r.badActive||[false,false,false,false,false];state.badMins=r.badMins||[0,0,0,0,0];state.badMaxs=r.badMaxs||[1000,1000,1000,1000];state.badBlocks=[]}else state.badEnabled=false;if(Array.isArray(r.goodBlocks)){state.goodEnabled=true;state.goodBlocks=r.goodBlocks.map(b=>({name:b.name,ranges:b.mins.map((min,i)=>b.conditions.includes(i)?{min,max:b.maxs[i]}:null)}))}else {state.goodBlocks=[];state.goodEnabled=true;}ensureGoodBlock();renderGoodRanges();renderBadRanges();switchTab('chance');toast('Условия восстановлены')})}
function downloadData(){const blob=new Blob([JSON.stringify({app:'catwar-simulator',version:1,data:state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='catwar-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function validateBackup(d){if(!d||d.app!=='catwar-simulator'||d.version!==1||!d.data)throw Error('Неподдерживаемый файл');const s=d.data;if(!Array.isArray(s.saved)||!Array.isArray(s.history)||s.saved.length>MAX_SAVED||s.history.length>MAX_HISTORY)throw Error('Некорректные коллекции');const goodV=v=>Array.isArray(v)&&v.length===5&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=1000)&&v.reduce((a,b)=>a+b,0)===1000;for(const x of s.saved){if(!goodV(x.values)||!MODES[x.mode]||typeof x.name!=='string')throw Error('Некорректные параметры')}if(s.current&&(!goodV(s.current.values)||!MODES[s.current.mode]||!Array.isArray(s.current.order)||new Set(s.current.order).size!==5||!s.current.order.every(x=>Number.isInteger(x)&&x>=0&&x<5)||!Array.isArray(s.current.opened)||!s.current.opened.every(x=>Number.isInteger(x)&&x>=0&&x<5)))throw Error('Некорректные карточки');for(const r of s.history){if(!MODES[r.mode]||!Number.isInteger(r.done)||r.done<0||r.done>100000||!Number.isInteger(r.hits)||r.hits<0||r.hits>r.done||!Array.isArray(r.mins)||!Array.isArray(r.maxs)||r.mins.length!==5||r.maxs.length!==5)throw Error('Некорректная история')}return {...initial,...s,saved:s.saved,history:s.history,theme:s.theme==='light'?'light':'dark',sound:!!s.sound,soundStyle:['sparkle','wood','chime','soft'].includes(s.soundStyle)?s.soundStyle:'sparkle',revealStyle:['cards','chests','paws','quick'].includes(s.revealStyle)?s.revealStyle:'cards',soundVolume:Math.min(100,Math.max(0,Number(s.soundVolume??75))),motion:s.motion!==false,lastGenAt:Math.min(Date.now(),Math.max(0,Number(s.lastGenAt)||0)),lastCalcAt:Math.min(Date.now(),Math.max(0,Number(s.lastCalcAt)||0))}}
function snapshotChanceConditions(){return {chanceModes:selectedChanceModes(),mins:[...state.mins],maxs:[...state.maxs],goodEnabled:true,goodBlocks:structuredClone(state.goodBlocks||[]),badEnabled:!!state.badEnabled,badBlocks:structuredClone(state.badBlocks||[])}}
function renderChancePresets(){
 const box=$('chancePresetsList');if(!box)return;
 const presets=Array.isArray(state.chancePresets)?state.chancePresets:[];
 box.innerHTML=presets.length?presets.map((x,i)=>`<div class="preset-row"><strong>${esc(x.name)}</strong><div class="preset-actions"><button type="button" class="secondary" data-preset-load="${i}">Загрузить</button><button type="button" class="danger" data-preset-delete="${i}" aria-label="Удалить набор условий">✕</button></div></div>`).join(''):'<p class="muted">Сохранённых наборов условий пока нет.</p>';
 box.querySelectorAll('[data-preset-load]').forEach(b=>b.onclick=()=>{const x=state.chancePresets[Number(b.dataset.presetLoad)];if(!x)return;state.chanceModes=[...x.chanceModes];state.chanceMode=state.chanceModes[0]||'normal';state.mins=[...x.mins];state.maxs=[...x.maxs];state.goodEnabled=true;state.goodBlocks=structuredClone(x.goodBlocks||[]);ensureGoodBlock();state.badEnabled=!!x.badEnabled;state.badBlocks=structuredClone(x.badBlocks||[]);persist();renderChanceModes();renderGoodRanges();renderBadRanges();toast('Условия загружены')});
 box.querySelectorAll('[data-preset-delete]').forEach(b=>b.onclick=()=>{if(!confirm('Удалить сохранённый набор условий?'))return;state.chancePresets.splice(Number(b.dataset.presetDelete),1);persist();renderChancePresets()});
}
function saveChancePreset(){
 if(!Array.isArray(state.chancePresets))state.chancePresets=[];
 if(state.chancePresets.length>=30){toast('Можно сохранить не более 30 наборов условий');return}
 const name=prompt('Название набора условий:',`Набор ${state.chancePresets.length+1}`);if(name===null)return;
 // Synchronize the editable fields before capturing the preset.
 document.querySelectorAll('[data-good-name],[data-bad-name]').forEach(el=>el.dispatchEvent(new Event('input')));
 document.querySelectorAll('[data-good-min],[data-bad-min]').forEach(el=>el.dispatchEvent(new Event('change')));
 const preset=snapshotChanceConditions();preset.name=name.trim().slice(0,70)||`Набор ${state.chancePresets.length+1}`;
 state.chancePresets.unshift(preset);persist();renderChancePresets();toast('Условия сохранены');
}
function setup(){ensureGoodBlock();persist();modeSelect($('genMode'),state.mode);renderChanceModes();modeSelect($('savedFilter'),'all');$('savedFilter').insertAdjacentHTML('afterbegin','<option value="all">Все режимы</option>');$('savedFilter').value='all';desc('genDescription',state.mode);theme();renderCards();renderGoodRanges();renderBadRanges();renderChanceResult(state.lastChance);renderChancePresets();updateCount();updateTimers();document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';persist();theme()};$('genMode').onchange=e=>{state.mode=e.target.value;persist();desc('genDescription',state.mode)};$('generateBtn').onclick=startGen;$('calcBtn').onclick=startCalc;$('chanceSort').onchange=()=>renderChanceResult(state.lastChance);$('savedFilter').onchange=renderSaved;$('savedSort').onchange=renderSaved;$('soundToggle').onchange=e=>{state.sound=e.target.checked;persist()};$('soundStyle').onchange=e=>{state.soundStyle=e.target.value;persist();playSound(true)};$('soundPreview').onclick=()=>playSound(true);$('soundVolume').oninput=e=>{state.soundVolume=Number(e.target.value);persist()};$('revealStyle').onchange=e=>{state.revealStyle=e.target.value;persist();if(!state.current)renderCards();else toast('Способ открытия применится к следующей генерации')};$('motionToggle').onchange=e=>{state.motion=e.target.checked;persist();theme()};$('exportBtn').onclick=downloadData;$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw Error('Файл слишком большой');const data=validateBackup(JSON.parse(await file.text()));if(!confirm('Заменить текущие локальные данные данными из файла?'))return;worker?.terminate();state=data;persist();location.reload()}catch(err){toast('Импорт не выполнен: '+err.message)}finally{e.target.value=''}};$('saveChancePresetBtn').onclick=saveChancePreset;$('clearHistoryBtn').onclick=()=>{if(!state.history.length){toast('История уже пуста');return}if(confirm('Удалить всю историю расчётов? Это действие нельзя отменить.')){state.history=[];persist();renderHistory();toast('История расчётов очищена')}};$('clearBtn').onclick=()=>{if(confirm('Безвозвратно удалить ВСЕ сохранения, историю и настройки?')){worker?.terminate();localStorage.removeItem(KEY);location.reload()}}}setup();
