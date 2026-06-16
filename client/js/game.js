import { $, api, cargoVolume, cn, escapeHtml, isk, requireSession, toast } from './api.js';

const page = document.body.dataset.page || '';
let state = null;
let combatMeta = null;
let socket = null;

async function loadState() {
  if (['home','login','register','error'].includes(page)) return null;
  await requireSession();
  state = await api('/api/state');
  if (!combatMeta) combatMeta = await api('/api/combat/options').catch(() => null);
  render();
  return state;
}

function setupSocket() {
  if (typeof io !== 'function' || ['home','login','register','error'].includes(page)) return;
  socket = io({ transports: ['websocket','polling'] });
  socket.on('presence:update', data => $('#presence') && ($('#presence').textContent = `在线 ${data.online} 人`));
  socket.on('chat:message', msg => appendChat(msg));
  socket.on('global:event', ev => appendEvent(ev));
  socket.on('system:event', ev => appendEvent(ev));
  socket.on('character:event', ev => appendEvent(ev));
  socket.on('character:update', ch => { if (!state) state = {}; state.character = ch; render(); });
  socket.on('fleet:update', () => page === 'fleet' && loadState().catch(console.error));
}

function render() {
  if (!state?.character) return;
  if (page === 'command') renderCommand();
  if (page === 'star-map') renderMap();
  if (page === 'hangar') renderHangar();
  if (page === 'warehouse') renderWarehouse();
  if (page === 'market') marketSearch('').catch(console.error);
  if (page === 'industry') renderIndustry();
  if (page === 'fleet') renderFleet();
}

function stat(label, value) { return `<div><b>${value}</b><span>${label}</span></div>`; }
function options(obj, selected) { return Object.entries(obj || {}).map(([id, v]) => `<option value="${id}" ${id===selected?'selected':''}>${escapeHtml(v.label || id)}</option>`).join(''); }
function secondsText(value) { const s = Math.max(0, Math.round(Number(value || 0))); if (s >= 3600) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`; if (s >= 60) return `${Math.floor(s/60)}m ${s%60}s`; return `${s}s`; }

function renderCommand() {
  const ch = state.character;
  const used = cargoVolume(ch.cargo || []);
  const cap = ch.autopilot?.activity === 'mining' && Number(ch.ship?.stats?.oreHold || 0) > 0 ? ch.ship.stats.oreHold : ch.ship?.stats?.cargo || 100;
  const combat = ch.expedition?.site?.combatPublic || ch.expedition?.site?.combat || null;
  $('#hud-stats').innerHTML = [stat('钱包', isk(ch.credits)), stat('当前船', escapeHtml(ch.ship?.zh || ch.ship?.name || '-')), stat('种族', escapeHtml(ch.race || '-')), stat('状态', ch.expedition?.state || 'idle'), stat('货舱', `${used.toFixed(1)} / ${cap} m³`), stat('Dogma', combatMeta?.dogma?.version || '-')].join('');
  $('#expedition-log').innerHTML = (ch.expedition?.log || []).map(line => `<div class="event"><span>${escapeHtml(line)}</span></div>`).join('') || '<p class="muted">暂无日志</p>';
  const combatBox = $('#combat-panel');
  if (combatBox) combatBox.innerHTML = combat ? `<h2>战斗</h2><p>势力：${escapeHtml(combat.faction || combat.factionLabel || '-')}　波次：${(combat.currentWave || 0)+1}/${combat.waves || 1}</p><div class="card-grid">${(combat.enemies || []).map(e=>`<div class="mini-card"><b>${escapeHtml(e.label || e.role)}</b><span>${Math.round(e.hp || 0)} / ${e.maxHp || 0} HP</span></div>`).join('')}</div><p class="muted">反跳：${combat.effects?.scrammed?'是':'否'}　电子战：${Math.round(Number(combat.effects?.ewar||0)*100)}%</p>` : '<h2>战斗</h2><p class="muted">当前没有接战。</p>';
  renderCombatSelectors(ch);
  renderSkillPanel();
  drawSpace(ch, combat);
}

function renderSkillPanel() {
  const box = $('#skill-panel');
  if (!box) return;
  const meta = state.meta?.skills;
  if (!meta) { box.innerHTML = '<p class="muted">技能资料未加载。</p>'; return; }
  const queue = (meta.queue || []).map(j => `<div class="mini-card"><b>${escapeHtml(meta.skills?.[j.skillId]?.label || j.skillId)} → Lv.${j.targetLevel}</b><span>${secondsText(j.secondsRemaining)} / ${secondsText(j.totalSeconds)}</span></div>`).join('') || '<p class="muted">训练队列为空。</p>';
  const skills = Object.entries(meta.skills || {}).slice(0, 12).map(([id, s]) => `<div class="mini-card"><b>${escapeHtml(s.label || id)} Lv.${s.level || 0}/${s.maxLevel || 5}</b><span>${escapeHtml(s.category || '')} · 下一级 ${secondsText(s.nextSeconds)}</span>${s.nextSeconds ? `<button data-train-skill="${id}">训练</button>` : ''}</div>`).join('');
  box.innerHTML = `<div class="mini-card"><b>队列</b>${queue}</div>${skills}`;
}

function renderCombatSelectors(ch) {
  const box = $('#combat-selectors');
  if (!box || !combatMeta) return;
  const pref = ch.autopilot?.combat || {};
  box.innerHTML = `<label>战斗姿态<select name="combatStance">${options(combatMeta.combat.stances, pref.stance || 'standard')}</select></label><label>弹药/伤害<select name="damageProfile">${options(combatMeta.combat.damageProfiles, pref.damageProfile || 'balanced')}</select></label><label>目标优先级<select name="targetPriority">${options(combatMeta.combat.targetPriorities, pref.targetPriority || 'scramblers_first')}</select></label>`;
}

function drawSpace(ch, combat) {
  const canvas = $('#space-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, t = Date.now()/1000;
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#02040b'; ctx.fillRect(0,0,w,h);
  for (let i=0;i<150;i++){ const x=(i*89+t*(i%5+1)*6)%w, y=(i*47+Math.sin(t+i)*4)%h; ctx.globalAlpha=.25+(i%5)*.12; ctx.fillStyle=i%7===0?'#80b7ff':'#d7f2ff'; ctx.fillRect(Math.floor(x),Math.floor(y),i%3===0?2:1,i%3===0?2:1); }
  ctx.globalAlpha=1; const cx=Math.round(w*.42+Math.sin(t)*18), cy=Math.round(h*.55+Math.cos(t)*8); ctx.fillStyle='#6fffd5'; pixelShip(ctx,cx,cy,4);
  if (combat?.enemies?.length){ ctx.fillStyle='#ff6b7a'; combat.enemies.slice(0,4).forEach((e,i)=>pixelEnemy(ctx,w*.66+i*42,h*.42+Math.sin(t+i)*18,4)); ctx.strokeStyle='#6fffd5'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx+28,cy); ctx.lineTo(w*.66,h*.42); ctx.stroke(); }
  ctx.fillStyle='rgba(7,17,31,.85)'; ctx.fillRect(20,20,430,88); ctx.strokeStyle='#244459'; ctx.strokeRect(20,20,430,88); ctx.fillStyle='#d7f2ff'; ctx.font='18px monospace'; ctx.fillText(`${ch.ship?.zh || ch.ship?.name || 'Ship'} · ${ch.expedition?.state || 'idle'}`,38,52); ctx.fillStyle='#6fffd5'; ctx.fillRect(38,72,Math.min(360,Number(ch.expedition?.progress||0)*3.6),10); ctx.strokeRect(38,72,360,10);
}
function pixelShip(ctx,x,y,s){[[0,-4],[1,-3],[-1,-3],[2,-1],[-2,-1],[3,1],[-3,1],[0,0],[1,2],[-1,2],[2,3],[-2,3]].forEach(([px,py])=>ctx.fillRect(x+px*s,y+py*s,s,s));}
function pixelEnemy(ctx,x,y,s){[[0,-3],[1,-2],[-1,-2],[2,0],[-2,0],[1,2],[-1,2],[3,3],[-3,3],[0,1]].forEach(([px,py])=>ctx.fillRect(Math.round(x+px*s),Math.round(y+py*s),s,s));}

function renderMap(){ const canvas=$('#map-canvas'); if(!canvas)return; const ctx=canvas.getContext('2d'); const systems=state.catalog?.systems||[]; ctx.fillStyle='#02040b'; ctx.fillRect(0,0,canvas.width,canvas.height); for(const sys of systems){ const x=40+(Math.abs(Number(sys.x||0))%100)/100*(canvas.width-80), y=40+(Math.abs(Number(sys.y||0))%100)/100*(canvas.height-80), sec=Number(sys.security||0); ctx.fillStyle=sec>=.75?'#6fffd5':sec>=.45?'#ffd166':'#ff6b7a'; ctx.fillRect(Math.round(x)-3,Math.round(y)-3,sys.hub?10:6,sys.hub?10:6); if(sys.systemId===state.character.currentSystemId){ctx.strokeStyle='#fff';ctx.strokeRect(Math.round(x)-8,Math.round(y)-8,20,20);} } }

function renderHangar(){
  const ch=state.character;
  $('#ship-card') && ($('#ship-card').innerHTML=`<h2>${escapeHtml(ch.ship?.zh||ch.ship?.name)}</h2><div class="stat-cards">${stat('DPS',Math.round(ch.ship?.stats?.dps||0))+stat('护盾',Math.round(ch.ship?.stats?.shield||0))+stat('货舱',Math.round(ch.ship?.stats?.cargo||0))+stat('电容',Math.round(ch.ship?.runtime?.capacitor??ch.ship?.stats?.capacitor||0))}</div>`);
  const fit = state.meta?.fitting;
  if ($('#fitting-summary') && fit) $('#fitting-summary').innerHTML = [stat('CPU', `${Math.round(fit.usage.cpu||0)} / ${Math.round(fit.capacity?.cpu||0)}`), stat('能栅', `${Math.round(fit.usage.powergrid||0)} / ${Math.round(fit.capacity?.powergrid||0)}`), stat('校准', `${Math.round(fit.usage.calibration||0)} / ${Math.round(fit.capacity?.calibration||0)}`), stat('挂点', `炮${fit.usage.turretHardpoints||0}/${fit.capacity?.turretHardpoints||0} 导${fit.usage.launcherHardpoints||0}/${fit.capacity?.launcherHardpoints||0}`)].join('');
  $('#fitting-list') && ($('#fitting-list').innerHTML=(ch.ship?.fittedModules||[]).map(m=>`<div class="mini-card"><b>${escapeHtml(m.zh||m.name)}</b><span>${m.slot} · ${m.mode||'passive'} · ${m.state||'passive'} ${m.charge?.loadedQuantity?`· ${escapeHtml(m.charge.zh||m.charge.name)}×${m.charge.loadedQuantity}`:''}</span><span>${escapeHtml(JSON.stringify(m.fitting||{}))}</span>${m.mode==='active'?`<button data-module-state="${m.instanceId}" data-state="${m.state==='active'?'idle':'active'}">${m.state==='active'?'停用':'启用'}</button>`:''}<button data-unfit="${m.instanceId}">卸下</button></div>`).join('')||'<p class="muted">没有装配。</p>');
  const modules=(ch.warehouse?.items||[]).filter(s=>s.kind==='module');
  $('#module-inventory') && ($('#module-inventory').innerHTML=modules.map(m=>`<div class="mini-card"><b>${escapeHtml(m.zh||m.name)}</b><span>数量 ${cn.format(m.quantity||0)}</span><button data-equip="${m.typeId}">装配</button></div>`).join('')||'<p class="muted">仓库没有模块。</p>');
  const chargeTargets=(ch.ship?.fittedModules||[]).filter(m=>m.activation?.chargeKind);
  const charges=(ch.warehouse?.items||[]).filter(s=>s.kind==='ammo'||s.meta?.chargeKind);
  $('#charge-inventory') && ($('#charge-inventory').innerHTML=charges.map(c=>`<div class="mini-card"><b>${escapeHtml(c.zh||c.name)}</b><span>数量 ${cn.format(c.quantity||0)}</span>${chargeTargets.map(m=>`<button data-load-charge="${c.typeId}" data-module="${m.instanceId}">装入 ${escapeHtml(m.zh||m.name)}</button>`).join('')}</div>`).join('')||'<p class="muted">仓库没有弹药/晶体/导弹。</p>');
}

function renderWarehouse(){ const ch=state.character; $('#warehouse-summary') && ($('#warehouse-summary').innerHTML=[stat('仓库',`${cargoVolume(ch.warehouse?.items||[]).toFixed(1)} / ${ch.warehouse?.capacity||0} m³`),stat('货舱',`${cargoVolume(ch.cargo||[]).toFixed(1)} m³`),stat('堆叠',(ch.warehouse?.items||[]).length),stat('钱包',isk(ch.credits))].join('')); $('#warehouse-list') && ($('#warehouse-list').innerHTML=inventoryTable(ch.warehouse?.items||[],true)); $('#cargo-list') && ($('#cargo-list').innerHTML=inventoryTable(ch.cargo||[],false)); }
function inventoryTable(items,actions){ if(!items.length)return '<p class="muted">空。</p>'; return `<table><thead><tr><th>物品</th><th>类型</th><th>数量</th><th>估值</th><th>操作</th></tr></thead><tbody>${items.map(s=>`<tr><td>${escapeHtml(s.zh||s.name||s.typeId)}</td><td>${escapeHtml(s.kind||'')}</td><td>${cn.format(s.quantity||0)}</td><td>${isk(Number(s.quantity||0)*Number(s.basePrice||1))}</td><td>${actions?`<button data-sell="${s.typeId}" data-max="${s.quantity}">卖出</button> <button data-refine="${s.typeId}" data-max="${s.quantity}">精炼</button>`:''}</td></tr>`).join('')}</tbody></table>`; }
async function marketSearch(q='',kind=''){ if(!$('#market-results'))return; const data=await api(`/api/sde/search?collection=types&q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`); $('#market-results').innerHTML=(data.types||[]).slice(0,80).map(t=>`<div class="mini-card"><b>${escapeHtml(t.zh||t.name)}</b><span>${escapeHtml(t.kind)} · ${escapeHtml(t.groupName||'')}</span><button data-buy="${t.typeId}">买 1</button></div>`).join('')||'<p class="muted">无结果。</p>'; }
function renderIndustry(){ $('#industry-jobs') && ($('#industry-jobs').innerHTML=(state.jobs||[]).map(j=>`<div class="mini-card"><b>${escapeHtml(j.productName)}</b><span>${j.status} · ${new Date(j.readyAt).toLocaleString('zh-CN',{hour12:false})}</span></div>`).join('')||'<p class="muted">没有任务。</p>'); }
function renderFleet(){ $('#fleet-list') && ($('#fleet-list').innerHTML=(state.fleets||[]).map(f=>`<div class="mini-card"><b>${escapeHtml(f.name)}</b><span>${f.status} · 成员 ${f.members?.length||0}</span><button data-join-fleet="${f._id}">加入</button><button data-start-fleet="${f._id}">开始</button></div>`).join('')||'<p class="muted">暂无舰队。</p>'); }
function appendChat(msg){ const box=$('#chat-box'); if(!box)return; const div=document.createElement('div'); div.innerHTML=`<b>${escapeHtml(msg.name)}</b> ${escapeHtml(msg.text)}`; box.appendChild(div); box.scrollTop=box.scrollHeight; }
function appendEvent(ev){ const log=$('#expedition-log'); if(!log)return; const div=document.createElement('div'); div.className='event'; div.innerHTML=`<b>${escapeHtml(ev.title)}</b><span>${escapeHtml(ev.message)}</span>`; log.prepend(div); }

function bindActions(){
  $('[data-logout]')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST',body:{}});location.href='/';});
  $('#autopilot-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const body={activity:fd.get('activity'),risk:fd.get('risk'),minShieldPct:fd.get('minShieldPct'),enabled:fd.get('enabled')==='on',sellExcess:fd.get('sellExcess')==='on',combatStance:fd.get('combatStance'),damageProfile:fd.get('damageProfile'),targetPriority:fd.get('targetPriority')};await api('/api/autopilot',{method:'POST',body});await api('/api/combat/settings',{method:'POST',body}).catch(()=>{});toast('调度已保存');await loadState();});
  $('[data-action="dock"]')?.addEventListener('click',async()=>{await api('/api/dock',{method:'POST',body:{}});toast('已下达撤离命令');});
  $('#chat-form')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);socket?.emit('chat:send',{channel:fd.get('channel'),text:fd.get('text')});e.currentTarget.reset();});
  $('#market-search')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);await marketSearch(fd.get('q'),fd.get('kind'));});
  document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.dataset.trainSkill){await api('/api/skills/train',{method:'POST',body:{skillId:b.dataset.trainSkill}});toast('技能已加入训练队列');await loadState();}if(b.dataset.buy){await api('/api/market/buy',{method:'POST',body:{typeId:b.dataset.buy,quantity:1}});toast('购买成功');await loadState();}if(b.dataset.sell){const qty=Number(prompt('卖出数量',Math.min(100,Number(b.dataset.max||1)))||0);if(qty>0){await api('/api/market/sell',{method:'POST',body:{typeId:b.dataset.sell,quantity:qty}});await loadState();}}if(b.dataset.refine){const qty=Number(prompt('精炼数量',Math.min(100,Number(b.dataset.max||1)))||0);if(qty>0){await api('/api/refine',{method:'POST',body:{typeId:b.dataset.refine,quantity:qty}});await loadState();}}if(b.dataset.equip){await api('/api/hangar/equip',{method:'POST',body:{typeId:b.dataset.equip}});toast('装配完成');await loadState();}if(b.dataset.unfit){await api('/api/hangar/unfit',{method:'POST',body:{instanceId:b.dataset.unfit}});toast('已卸下');await loadState();}if(b.dataset.moduleState){await api('/api/hangar/module-state',{method:'POST',body:{instanceId:b.dataset.moduleState,state:b.dataset.state}});await loadState();}if(b.dataset.loadCharge){const qty=Number(prompt('装填数量',80)||0);if(qty>0){await api('/api/hangar/load-charge',{method:'POST',body:{instanceId:b.dataset.module,typeId:b.dataset.loadCharge,quantity:qty}});toast('装填完成');await loadState();}}if(b.dataset.joinFleet){await api('/api/fleet/join',{method:'POST',body:{fleetId:b.dataset.joinFleet}});await loadState();}if(b.dataset.startFleet){await api('/api/fleet/start',{method:'POST',body:{fleetId:b.dataset.startFleet}});await loadState();}}catch(err){toast(err.message);}});
}

function animate(){ if(page==='command'&&state?.character) drawSpace(state.character,state.character.expedition?.site?.combatPublic||state.character.expedition?.site?.combat); requestAnimationFrame(animate); }
window.addEventListener('DOMContentLoaded',async()=>{setupSocket();bindActions();animate();try{await loadState();}catch(err){if(!['home','login','register'].includes(page))console.warn(err);}});
