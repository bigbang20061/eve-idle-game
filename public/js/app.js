const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const page = document.body.dataset.page;
let state = null;
let socket = null;
let selectedSystemId = null;

const cn = new Intl.NumberFormat('zh-CN');
const isk = n => `${cn.format(Math.round(Number(n || 0)))} ISK`;
const pct = n => `${Math.round(Number(n || 0) * 100)}%`;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(text, type = 'info') {
  let box = $('#toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:1000;display:grid;gap:8px;max-width:360px';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `alert ${type === 'danger' ? 'danger' : type === 'success' ? 'success' : ''}`;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function setupSocket() {
  if (typeof io !== 'function' || ['home', 'login', 'register', ''].includes(page)) return;
  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => $('#presence') && ($('#presence').textContent = '已连接实时频道'));
  socket.on('connect_error', () => $('#presence') && ($('#presence').textContent = '实时频道未连接'));
  socket.on('presence:update', data => $('#presence') && ($('#presence').textContent = `在线 ${data.online} 人`));
  socket.on('chat:message', msg => appendChat(msg));
  socket.on('global:event', ev => appendEvent(ev));
  socket.on('system:event', ev => appendEvent(ev));
  socket.on('character:event', ev => appendEvent(ev));
  socket.on('character:update', ch => {
    if (!state) state = {};
    state.character = ch;
    renderCurrentPage();
  });
  socket.on('fleet:update', () => { if (page === 'fleet') loadState().catch(console.error); });
  socket.on('fleet:ping', ping => toast(`舰队 Ping：${ping.name} - ${ping.text}`, 'success'));
}

async function loadState() {
  if (['home', 'login', 'register', ''].includes(page)) return null;
  state = await api('/api/state');
  renderCurrentPage();
  return state;
}

function renderCurrentPage() {
  if (!state?.character) return;
  if (page === 'command') renderCommand();
  if (page === 'star-map') renderMapPage();
  if (page === 'hangar') renderHangar();
  if (page === 'warehouse') renderWarehouse();
  if (page === 'market') renderMarketDefault();
  if (page === 'industry') renderIndustryJobs();
  if (page === 'fleet') renderFleet();
}

function renderCommand() {
  const ch = state.character;
  const hud = $('#hud-stats');
  if (hud) {
    const cargoUsed = cargoVolume(ch.cargo);
    const cargoCap = ch.autopilot?.activity === 'mining' && Number(ch.ship?.stats?.oreHold || 0) > 0 ? ch.ship.stats.oreHold : ch.ship?.stats?.cargo || 100;
    hud.innerHTML = [
      stat('钱包', isk(ch.credits)), stat('当前船', ch.ship?.zh || ch.ship?.name || '-'),
      stat('远征状态', ch.expedition?.state || 'idle'), stat('货舱', `${cargoUsed.toFixed(1)} / ${cargoCap} m³`),
      stat('击杀/损失', `${ch.stats?.kills || 0} / ${ch.stats?.losses || 0}`), stat('成功撤离', cn.format(ch.stats?.extractions || 0))
    ].join('');
  }
  const log = $('#expedition-log');
  if (log) log.innerHTML = (ch.expedition?.log || []).map(line => `<div class="event"><span>${escapeHtml(line)}</span></div>`).join('') || '<p class="muted">暂无日志</p>';
  drawSpace(ch);
}

function stat(label, value) { return `<div><b>${value}</b><span>${label}</span></div>`; }
function cargoVolume(stacks = []) { return stacks.reduce((sum, s) => sum + Number(s.quantity || 0) * Number(s.volume || 0), 0); }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function drawSpace(ch) {
  const canvas = $('#space-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  const t = Date.now() / 1000;
  ctx.fillStyle = '#02040b'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const x = (i * 89 + t * (i % 5 + 1) * 6) % w;
    const y = (i * 47 + Math.sin(t + i) * 4) % h;
    ctx.fillStyle = i % 7 === 0 ? '#80b7ff' : '#d7f2ff';
    ctx.globalAlpha = 0.25 + (i % 5) * 0.12;
    ctx.fillRect(Math.floor(x), Math.floor(y), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
  const progress = Number(ch.expedition?.progress || 0);
  const stateName = ch.expedition?.state || 'idle';
  const cx = Math.round(w * .45 + Math.sin(t * 1.5) * 20);
  const cy = Math.round(h * .52 + Math.cos(t) * 10);
  ctx.fillStyle = '#6fffd5';
  pixelShip(ctx, cx, cy, 4);
  if (['fighting', 'looting'].includes(stateName)) {
    ctx.fillStyle = '#ff6b7a'; pixelEnemy(ctx, w * .68 + Math.sin(t * 2) * 18, h * .46, 4);
    if (stateName === 'fighting') {
      ctx.strokeStyle = '#6fffd5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 28, cy); ctx.lineTo(w * .68, h * .46); ctx.stroke();
    }
  }
  if (stateName === 'mining' || ch.autopilot?.activity === 'mining') {
    ctx.fillStyle = '#9aa7b2'; for (let i = 0; i < 9; i++) ctx.fillRect(80 + i * 38, 360 + Math.sin(t + i) * 15, 18, 14);
  }
  ctx.fillStyle = 'rgba(7,17,31,.8)'; ctx.fillRect(20, 20, 420, 82);
  ctx.strokeStyle = '#244459'; ctx.strokeRect(20, 20, 420, 82);
  ctx.fillStyle = '#d7f2ff'; ctx.font = '18px monospace'; ctx.fillText(`${ch.ship?.zh || ch.ship?.name} · ${stateName}`, 38, 50);
  ctx.fillStyle = '#6fffd5'; ctx.fillRect(38, 70, Math.min(360, progress * 3.6), 10);
  ctx.strokeStyle = '#6fffd5'; ctx.strokeRect(38, 70, 360, 10);
}

function pixelShip(ctx, x, y, s) {
  const p = [[0,-4],[1,-3],[-1,-3],[2,-1],[-2,-1],[3,1],[-3,1],[0,0],[0,1],[1,2],[-1,2],[2,3],[-2,3]];
  for (const [px, py] of p) ctx.fillRect(x + px*s, y + py*s, s, s);
}
function pixelEnemy(ctx, x, y, s) {
  const p = [[0,-3],[1,-2],[-1,-2],[2,0],[-2,0],[1,2],[-1,2],[3,3],[-3,3],[0,1]];
  for (const [px, py] of p) ctx.fillRect(Math.round(x + px*s), Math.round(y + py*s), s, s);
}

function renderMapPage() {
  const canvas = $('#map-canvas');
  if (!canvas) return;
  const systems = state.catalog?.systems || [];
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#02040b'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = 'rgba(36,68,89,.45)';
  for (let x=0; x<canvas.width; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0; y<canvas.height; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  for (const sys of systems) {
    const x = 40 + (Math.abs(Number(sys.x || 0)) % 100) / 100 * (canvas.width - 80);
    const y = 40 + (Math.abs(Number(sys.y || 0)) % 100) / 100 * (canvas.height - 80);
    const sec = Number(sys.security || 0);
    ctx.fillStyle = sec >= .75 ? '#6fffd5' : sec >= .45 ? '#ffd166' : '#ff6b7a';
    ctx.fillRect(Math.round(x)-3, Math.round(y)-3, sys.hub ? 10 : 6, sys.hub ? 10 : 6);
    if (sys.systemId === state.character.currentSystemId) { ctx.strokeStyle = '#fff'; ctx.strokeRect(Math.round(x)-8, Math.round(y)-8, 20, 20); }
    if (sys.systemId === selectedSystemId) { ctx.strokeStyle = '#80b7ff'; ctx.strokeRect(Math.round(x)-12, Math.round(y)-12, 28, 28); }
  }
}

function mapClick(event) {
  if (page !== 'star-map' || !state) return;
  const canvas = $('#map-canvas');
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * canvas.width;
  const y = (event.clientY - rect.top) / rect.height * canvas.height;
  let best = null, bestD = Infinity;
  for (const sys of state.catalog.systems || []) {
    const sx = 40 + (Math.abs(Number(sys.x || 0)) % 100) / 100 * (canvas.width - 80);
    const sy = 40 + (Math.abs(Number(sys.y || 0)) % 100) / 100 * (canvas.height - 80);
    const d = Math.hypot(sx-x, sy-y);
    if (d < bestD) { bestD = d; best = sys; }
  }
  if (best && bestD < 25) {
    selectedSystemId = best.systemId;
    $('[name="targetSystemId"]', $('#map-autopilot')).value = best.systemId;
    $('#system-detail').innerHTML = `<h3>${best.zh || best.name}</h3><p>安等：${Number(best.security).toFixed(2)}　危险：${Number(best.danger).toFixed(2)}　富集：${Number(best.richness).toFixed(2)}</p><p>类型：${best.kind || 'unknown'}　Region：${best.regionName || best.regionId || '-'}</p>`;
    renderMapPage();
  }
}

function renderHangar() {
  const ch = state.character;
  const shipCard = $('#ship-card');
  if (shipCard) {
    const s = ch.ship || {};
    shipCard.innerHTML = `<div class="ship-row"><img src="/public/assets/sprite_atlas.png" alt="ship"><div><h2>${escapeHtml(s.zh || s.name)}</h2><p>${escapeHtml(s.class || '')} · ${escapeHtml(s.role || '')}</p><div class="stat-cards"><div><b>${s.stats?.dps || 0}</b><span>DPS</span></div><div><b>${s.stats?.mining || 0}</b><span>Mining</span></div><div><b>${s.stats?.cargo || 0}</b><span>Cargo</span></div><div><b>${s.stats?.scan || 0}</b><span>Scan</span></div></div></div></div>`;
  }
  const fitting = $('#fitting-list');
  if (fitting) fitting.innerHTML = (ch.ship?.fittedModules || []).map(m => `<div class="mini-card"><b>${escapeHtml(m.zh || m.name)}</b><span>${m.slot} · ${JSON.stringify(m.effects || {})}</span><button data-unfit="${m.instanceId}">卸下</button></div>`).join('') || '<p class="muted">没有装配。</p>';
  const modules = (ch.warehouse?.items || []).filter(s => s.kind === 'module');
  const inv = $('#module-inventory');
  if (inv) inv.innerHTML = modules.map(m => `<div class="mini-card"><b>${escapeHtml(m.zh || m.name)}</b><span>数量 ${cn.format(m.quantity)}</span><button data-equip="${m.typeId}">装配</button></div>`).join('') || '<p class="muted">没有模块，去市场购买。</p>';
  const ships = $('#hangar-ships');
  if (ships) ships.innerHTML = (ch.hangarShips || []).map(s => `<div class="mini-card"><b>${escapeHtml(s.zh || s.name)}</b><span>${escapeHtml(s.class || '')}</span><button data-activate-ship="${s.instanceId}">设为当前</button></div>`).join('') || '<p class="muted">没有备用舰船。</p>';
}

function renderWarehouse() {
  const ch = state.character;
  const summary = $('#warehouse-summary');
  const used = cargoVolume(ch.warehouse?.items || []);
  if (summary) summary.innerHTML = [stat('仓库容量', `${used.toFixed(1)} / ${ch.warehouse?.capacity || 0} m³`), stat('堆叠数', cn.format((ch.warehouse?.items || []).length)), stat('货舱', `${cargoVolume(ch.cargo || []).toFixed(1)} m³`), stat('钱包', isk(ch.credits))].join('');
  const warehouse = $('#warehouse-list');
  if (warehouse) warehouse.innerHTML = inventoryTable(ch.warehouse?.items || [], true);
  const cargo = $('#cargo-list');
  if (cargo) cargo.innerHTML = inventoryTable(ch.cargo || [], false);
}
function inventoryTable(items, reserve) {
  if (!items.length) return '<p class="muted">空。</p>';
  return `<table><thead><tr><th>物品</th><th>类型</th><th>数量</th><th>体积</th><th>估值</th><th>操作</th></tr></thead><tbody>${items.map(s => `<tr><td>${escapeHtml(s.zh || s.name || s.typeId)}</td><td>${escapeHtml(s.kind || '')}</td><td>${cn.format(s.quantity || 0)}</td><td>${(Number(s.quantity||0)*Number(s.volume||0)).toFixed(2)}</td><td>${isk(Number(s.quantity||0)*Number(s.basePrice||1))}</td><td>${reserve ? `<button data-sell="${s.typeId}" data-max="${s.quantity}">卖出</button> <button data-refine="${s.typeId}" data-max="${s.quantity}">精炼</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

function renderMarketDefault() {
  if (!$('#market-results') || $('#market-results').dataset.loaded) return;
  $('#market-results').dataset.loaded = '1';
  marketSearch('');
}
async function marketSearch(q, kind = '') {
  const data = await api(`/api/sde/search?collection=types&q=${encodeURIComponent(q || '')}&kind=${encodeURIComponent(kind || '')}`);
  const types = data.types || [];
  const system = state?.system || {};
  $('#market-results').innerHTML = types.slice(0,80).map(t => {
    const buy = priceEstimate(t, system, 'buy');
    const sell = priceEstimate(t, system, 'sell');
    return `<div class="mini-card"><b>${escapeHtml(t.zh || t.name)}</b><span>${escapeHtml(t.kind)} · ${escapeHtml(t.groupName || '')}</span><span>买入约 ${isk(sell)} / 卖出约 ${isk(buy)}</span><div class="actions"><button data-buy="${t.typeId}">买 1</button><button data-buy10="${t.typeId}">买 10</button></div></div>`;
  }).join('') || '<p class="muted">无结果。</p>';
}
function priceEstimate(t, system, side) {
  const base = Number(t.basePrice || 10);
  const sec = Number(system.security ?? .5);
  const scarcity = Math.max(.75, Math.min(2.2, 1.35 - sec * .45 + Number(t.rarity || 1) * .025));
  return Math.round(base * scarcity * (side === 'buy' ? .92 : 1.08));
}

async function searchBlueprints(q='') {
  const data = await api(`/api/sde/search?collection=blueprints&q=${encodeURIComponent(q)}`);
  $('#blueprint-results').innerHTML = (data.blueprints || []).map(bp => `<div class="mini-card"><b>${escapeHtml(bp.zh || bp.name)}</b><span>产物：${escapeHtml(bp.productName)} × ${bp.quantity || 1}　时间：${bp.time}s</span><span>材料：${(bp.materials||[]).slice(0,5).map(m=>`${escapeHtml(m.name || m.typeId)}×${m.quantity}`).join(' / ')}</span><button data-start-bp="${bp.blueprintTypeId}">生产 1 轮</button></div>`).join('') || '<p class="muted">无蓝图。</p>';
}
function renderIndustryJobs() {
  const box = $('#industry-jobs');
  if (!box || !state?.jobs) return;
  box.innerHTML = state.jobs.map(j => `<div class="mini-card"><b>${escapeHtml(j.productName)}</b><span>运行 ${j.runs} 轮，完成：${new Date(j.readyAt).toLocaleString('zh-CN',{hour12:false})}</span><span>${j.status}</span></div>`).join('') || '<p class="muted">没有正在运行的工业任务。</p>';
}

function renderFleet() {
  const list = $('#fleet-list');
  if (!list || !state.fleets) return;
  list.innerHTML = state.fleets.map(f => `<div class="mini-card"><b>${escapeHtml(f.name)}</b><span>状态：${f.status}　成员：${f.members?.length || 0}　目标 T${f.objective?.tier || 1}</span><button data-join-fleet="${f._id}">加入</button><button data-start-fleet="${f._id}">开始</button></div>`).join('') || '<p class="muted">暂无舰队。</p>';
}

async function searchSde(form) {
  const params = new URLSearchParams(new FormData(form));
  const data = await api(`/api/sde/search?${params.toString()}`);
  const box = $('#sde-results');
  if (data.systems) box.innerHTML = `<table><thead><tr><th>星系</th><th>安等</th><th>危险</th><th>富集</th></tr></thead><tbody>${data.systems.map(s=>`<tr><td>${escapeHtml(s.zh || s.name)}</td><td>${Number(s.security).toFixed(2)}</td><td>${Number(s.danger).toFixed(2)}</td><td>${Number(s.richness).toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
  if (data.blueprints) box.innerHTML = `<table><thead><tr><th>蓝图</th><th>产物</th><th>时间</th><th>材料</th></tr></thead><tbody>${data.blueprints.map(b=>`<tr><td>${escapeHtml(b.zh || b.name)}</td><td>${escapeHtml(b.productName)}</td><td>${b.time}s</td><td>${(b.materials||[]).slice(0,4).map(m=>`${escapeHtml(m.name || m.typeId)}×${m.quantity}`).join(' / ')}</td></tr>`).join('')}</tbody></table>`;
  if (data.types) box.innerHTML = `<table><thead><tr><th>TypeID</th><th>名称</th><th>种类</th><th>Group</th><th>价格</th></tr></thead><tbody>${data.types.map(t=>`<tr><td>${t.typeId}</td><td>${escapeHtml(t.zh || t.name)}</td><td>${escapeHtml(t.kind)}</td><td>${escapeHtml(t.groupName || '')}</td><td>${isk(t.basePrice || 0)}</td></tr>`).join('')}</tbody></table>`;
}

async function loadLeaderboard() {
  const box = $('#leaderboard');
  if (!box) return;
  const data = await api('/api/leaderboard');
  const block = (title, rows, metric) => `<div class="panel"><h2>${title}</h2>${rows.map((r,i)=>`<div class="mini-card"><b>#${i+1} ${escapeHtml(r.name)}</b><span>${metric(r)}</span></div>`).join('')}</div>`;
  box.innerHTML = block('富豪榜', data.richest, r => isk(r.credits)) + block('总收益', data.earned, r => isk(r.stats?.totalEarned || 0)) + block('击杀榜', data.kills, r => `${cn.format(r.stats?.kills || 0)} kills`);
}

function appendChat(msg) {
  const box = $('#chat-box');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<b>${escapeHtml(msg.name)}</b> <span>${escapeHtml(msg.text)}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function appendEvent(ev) {
  const log = $('#expedition-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = `event ${ev.severity || ''}`;
  div.innerHTML = `<b>${escapeHtml(ev.title)}</b><span>${escapeHtml(ev.message)}</span>`;
  log.prepend(div);
}

function bindActions() {
  $('#autopilot-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api('/api/autopilot', { method:'POST', body: { activity: fd.get('activity'), risk: fd.get('risk'), minShieldPct: fd.get('minShieldPct'), enabled: fd.get('enabled') === 'on', sellExcess: fd.get('sellExcess') === 'on' } });
    toast('调度已保存', 'success'); await loadState();
  });
  $('[data-action="dock"]')?.addEventListener('click', async () => { await api('/api/dock', { method:'POST', body:{} }); toast('已下达撤离命令', 'success'); });
  $('[data-action="sell-excess"]')?.addEventListener('click', async () => { const r = await api('/api/sell-excess', { method:'POST', body:{} }); toast(`卖出 ${r.sold} 件，收入 ${isk(r.value)}`, 'success'); await loadState(); });
  $('#chat-form')?.addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); socket?.emit('chat:send', { channel: fd.get('channel'), text: fd.get('text') }); e.currentTarget.reset(); });
  $('#fleet-ping')?.addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); socket?.emit('fleet:ping', { text: fd.get('text') }); e.currentTarget.reset(); });
  $('#map-canvas')?.addEventListener('click', mapClick);
  $('#map-autopilot')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); await api('/api/autopilot', { method:'POST', body:{ targetSystemId: fd.get('targetSystemId'), allowLowSec: fd.get('allowLowSec') === 'on' } }); toast('目标星系已更新', 'success'); await loadState(); });
  $('#market-search')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); await marketSearch(fd.get('q'), fd.get('kind')); });
  $('#blueprint-search')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); await searchBlueprints(fd.get('q')); });
  $('#sde-search')?.addEventListener('submit', async e => { e.preventDefault(); await searchSde(e.currentTarget); });
  $('#fleet-create')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); await api('/api/fleet/create', { method:'POST', body:{ name: fd.get('name'), tier: fd.get('tier') } }); toast('舰队已创建', 'success'); await loadState(); });
  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.buy) { await api('/api/market/buy', { method:'POST', body:{ typeId:b.dataset.buy, quantity:1 } }); toast('购买成功', 'success'); await loadState(); }
      if (b.dataset.buy10) { await api('/api/market/buy', { method:'POST', body:{ typeId:b.dataset.buy10, quantity:10 } }); toast('购买成功', 'success'); await loadState(); }
      if (b.dataset.sell) { const qty = Number(prompt('卖出数量', Math.min(100, Number(b.dataset.max || 1))) || 0); if (qty>0) { const r = await api('/api/market/sell', { method:'POST', body:{ typeId:b.dataset.sell, quantity:qty } }); toast(`收入 ${isk(r.total)}`, 'success'); await loadState(); } }
      if (b.dataset.refine) { const qty = Number(prompt('精炼数量', Math.min(100, Number(b.dataset.max || 1))) || 0); if (qty>0) { await api('/api/refine', { method:'POST', body:{ typeId:b.dataset.refine, quantity:qty } }); toast('精炼完成', 'success'); await loadState(); } }
      if (b.dataset.equip) { await api('/api/hangar/equip', { method:'POST', body:{ typeId:b.dataset.equip } }); toast('装配完成', 'success'); await loadState(); }
      if (b.dataset.unfit) { await api('/api/hangar/unfit', { method:'POST', body:{ instanceId:b.dataset.unfit } }); toast('已卸下', 'success'); await loadState(); }
      if (b.dataset.activateShip) { await api('/api/hangar/activate', { method:'POST', body:{ instanceId:b.dataset.activateShip } }); toast('舰船已切换', 'success'); await loadState(); }
      if (b.dataset.startBp) { await api('/api/industry/start', { method:'POST', body:{ blueprintTypeId:b.dataset.startBp, runs:1 } }); toast('生产已开始', 'success'); await loadState(); }
      if (b.dataset.joinFleet) { await api('/api/fleet/join', { method:'POST', body:{ fleetId:b.dataset.joinFleet } }); toast('已加入舰队', 'success'); await loadState(); }
      if (b.dataset.startFleet) { await api('/api/fleet/start', { method:'POST', body:{ fleetId:b.dataset.startFleet } }); toast('舰队已出发', 'success'); await loadState(); }
    } catch (err) { toast(err.message, 'danger'); }
  });
}

function tickClock() {
  const el = $('#server-clock');
  if (el) el.textContent = new Date().toLocaleString('zh-CN', { hour12:false });
  if (page === 'command' && state?.character) drawSpace(state.character);
  if (page === 'star-map' && state?.catalog) renderMapPage();
  requestAnimationFrame(tickClock);
}

window.addEventListener('DOMContentLoaded', async () => {
  setupSocket(); bindActions(); tickClock();
  try { await loadState(); } catch (err) { if (!['home','login','register'].includes(page)) console.warn(err); }
  if (page === 'industry') searchBlueprints('').catch(console.error);
  if (page === 'sde') $('#sde-search')?.dispatchEvent(new Event('submit'));
  if (page === 'leaderboard') loadLeaderboard().catch(err => toast(err.message, 'danger'));
});
