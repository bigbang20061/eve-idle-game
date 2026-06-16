import { Character, SdeSystem, SdeType, GameEvent, IndustryJob, SdeBlueprint, Fleet } from '../models/index.js';
import { cargoVolume, chooseWeighted, clamp, deriveEffectiveStats, marketPrice, mergeStack, seededRandom, siteTemplate, systemBand } from './formulas.js';
import { ensureCombat, resolveCombatRound, combatSnapshot } from './combatSystem.js';
import { tickSkillTraining } from './skills.js';

const MAX_OFFLINE_SECONDS = 12 * 3600;
const STEP_SECONDS = 20;

async function pushEvent(event, io) {
  const doc = await GameEvent.create({ createdAt: new Date(), ...event });
  if (io) {
    io.to('global').emit('global:event', publicEvent(doc));
    if (event.characterId) io.to(`character:${event.characterId}`).emit('character:event', publicEvent(doc));
    if (event.systemId) io.to(`system:${event.systemId}`).emit('system:event', publicEvent(doc));
    if (event.fleetId) io.to(`fleet:${event.fleetId}`).emit('fleet:event', publicEvent(doc));
  }
  return doc;
}

function publicEvent(event) { return { id: String(event._id), scope: event.scope, severity: event.severity, title: event.title, message: event.message, systemId: event.systemId, fleetId: event.fleetId, characterId: event.characterId, createdAt: event.createdAt }; }
function mutableCargo(character) { if (!Array.isArray(character.cargo)) character.cargo = []; return character.cargo; }
function mutableWarehouse(character) { if (!character.warehouse) character.warehouse = { capacity: 50000, items: [], reserve: new Map() }; if (!Array.isArray(character.warehouse.items)) character.warehouse.items = []; return character.warehouse.items; }
function addLog(character, line) { if (!Array.isArray(character.expedition.log)) character.expedition.log = []; character.expedition.log.unshift(`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${line}`); character.expedition.log = character.expedition.log.slice(0, 40); }
function cargoCapacity(character, stats) { return character.autopilot?.activity === 'mining' && stats.oreHold > 0 ? stats.oreHold : stats.cargo; }
function hpPercent(character, stats) { const hp = character.expedition.site?.hp; if (!hp) return 1; const current = Number(hp.shield || 0) + Number(hp.armor || 0) + Number(hp.hull || 0); const max = Number(stats.shield || 0) + Number(stats.armor || 0) + Number(stats.hull || 0); return max > 0 ? current / max : 1; }
function resetExpedition(character, state = 'idle') { character.expedition.state = state; character.expedition.progress = 0; character.expedition.enemyHull = 0; character.expedition.hazard = 0; character.expedition.site = undefined; }

async function getSystem(character) {
  const target = character.autopilot?.targetSystemId || character.currentSystemId || character.homeSystemId;
  return await SdeSystem.findOne({ systemId: String(target) }).lean() || await SdeSystem.findOne({}).sort({ security: -1 }).lean() || { systemId: 'unknown', name: 'Unknown', security: 0.5, richness: 1, danger: 0.5 };
}

async function lootPool(activity) {
  const kindMap = { mining: ['ore'], ratting: ['salvage', 'commodity', 'mineral'], combat: ['salvage', 'commodity', 'module'], relic: ['salvage', 'data'], data: ['data', 'salvage'], hauling: ['commodity', 'mineral'] };
  const kinds = kindMap[activity] || ['ore', 'salvage'];
  let items = await SdeType.find({ kind: { $in: kinds }, basePrice: { $gt: 0 } }).sort({ tier: 1, basePrice: 1 }).limit(160).lean();
  if (!items.length) items = await SdeType.find({ kind: { $nin: ['ship', 'module'] }, basePrice: { $gt: 0 } }).limit(160).lean();
  return items.map(item => ({ item, weight: 1 / Math.max(1, Number(item.rarity || item.tier || 1)) }));
}

async function generateLoot(character, system, site, stats, rng) {
  const pool = await lootPool(site.activity);
  const loot = [];
  const richness = Number(site.richness || system.richness || 1);
  const tier = Number(site.tier || 1);
  const rolls = Math.max(1, Math.floor(1 + tier / 2 + richness));
  for (let i = 0; i < rolls; i += 1) {
    const pick = chooseWeighted(pool, rng)?.item;
    if (!pick) continue;
    const baseQty = site.activity === 'mining' ? 50 + tier * 45 : site.activity === 'hauling' ? 12 + tier * 8 : 1 + Math.floor(tier * rng());
    const skillBonus = site.activity === 'mining' ? stats.mining / 20 : (stats.salvage + stats.scan) / 35;
    const qty = Math.max(1, Math.round(baseQty * richness * (1 + skillBonus) * (0.75 + rng() * 0.6)));
    loot.push({ typeId: String(pick.typeId), name: pick.name, zh: pick.zh || pick.name, kind: pick.kind, quantity: qty, volume: Number(pick.volume || 0.01), basePrice: Number(pick.basePrice || 1), source: site.activity });
  }
  return loot;
}

function transferCargoToWarehouse(character) {
  const cargo = mutableCargo(character), warehouse = mutableWarehouse(character);
  let count = 0, value = 0;
  for (const stack of cargo) { mergeStack(warehouse, stack); count += Number(stack.quantity || 0); value += Number(stack.quantity || 0) * Number(stack.basePrice || 1); }
  character.cargo = [];
  return { count, value };
}

async function sellExcess(character, system) {
  if (!character.autopilot?.sellExcess) return { sold: 0, value: 0 };
  const warehouse = mutableWarehouse(character);
  const reserveMap = character.warehouse?.reserve || new Map();
  let sold = 0, value = 0;
  for (const stack of warehouse) {
    if (stack.locked) continue;
    const reserve = Number(reserveMap.get?.(String(stack.typeId)) || reserveMap[String(stack.typeId)] || 0);
    const available = Math.max(0, Number(stack.quantity || 0) - reserve);
    if (available <= 0) continue;
    const type = await SdeType.findOne({ typeId: String(stack.typeId) }).lean() || stack;
    const amount = Math.round(marketPrice(type, system, 'buy') * available);
    stack.quantity -= available; sold += available; value += amount;
  }
  character.warehouse.items = warehouse.filter(s => Number(s.quantity || 0) > 0);
  if (value > 0) { character.credits += value; character.stats.totalEarned += value; character.stats.trades += 1; character.walletJournal.unshift({ at: new Date(), type: 'auto-sell', amount: value, note: `自动卖出 ${sold} 件超额库存` }); character.walletJournal = character.walletJournal.slice(0, 80); }
  return { sold, value };
}

async function startNewSite(character, system, stats, rng) {
  const activity = character.autopilot?.activity || 'mining';
  const site = siteTemplate(activity, system, character, rng);
  site.hp = { shield: stats.shield, armor: stats.armor, hull: stats.hull };
  site.hazard = 0;
  if (['ratting', 'combat'].includes(activity)) ensureCombat(site, stats, character, rng);
  character.currentSystemId = String(system.systemId);
  character.locationState = 'space';
  character.expedition.state = 'scanning';
  character.expedition.site = site;
  character.expedition.progress = 0;
  character.expedition.enemyHull = site.enemyEhp;
  character.expedition.hazard = 0;
  character.expedition.startedAt = new Date();
  character.stats.sorties += 1;
  addLog(character, `扫描到 ${system.name} 的 ${site.name} T${site.tier}。`);
}

function shouldExtract(character, stats) {
  const cap = cargoCapacity(character, stats), used = cargoVolume(character.cargo || []), hpPct = hpPercent(character, stats);
  if (used >= cap * 0.92) return '货舱接近满载';
  if (hpPct <= Number(character.autopilot?.minShieldPct || 0.35)) return '护盾/结构低于撤离阈值';
  if (Number(character.expedition.hazard || 0) > Number(character.autopilot?.risk || 0.35) + stats.warpStability * 0.12) return '本地风险超过设定阈值';
  return '';
}

async function tickIndustry(character, now, io) {
  const readyJobs = await IndustryJob.find({ characterId: character._id, status: 'running', readyAt: { $lte: now } }).lean();
  if (!readyJobs.length) return;
  const warehouse = mutableWarehouse(character);
  for (const job of readyJobs) {
    const type = await SdeType.findOne({ typeId: String(job.productTypeId) }).lean();
    mergeStack(warehouse, { typeId: String(job.productTypeId), name: type?.name || job.productName, zh: type?.zh || job.productName, kind: type?.kind || 'item', quantity: Number(job.output?.quantity || job.runs || 1), volume: Number(type?.volume || 0.01), basePrice: Number(type?.basePrice || 1), source: 'industry' });
    character.stats.manufactured += Number(job.output?.quantity || job.runs || 1);
    addLog(character, `工业线交付：${type?.zh || job.productName} × ${Number(job.output?.quantity || job.runs || 1)}`);
    await IndustryJob.updateOne({ _id: job._id }, { $set: { status: 'delivered' } });
    await pushEvent({ scope: 'character', characterId: character._id, severity: 'success', title: '工业交付', message: `${character.name} 完成 ${type?.zh || job.productName}` }, io);
  }
}

async function tickStep(character, dt, now, io) {
  await tickIndustry(character, now, io);
  const stats = deriveEffectiveStats(character);
  const done = tickSkillTraining(character, dt);
  for (const item of done) addLog(character, `技能训练完成：${item.skillId} Lv.${item.level}`);
  if (!character.autopilot?.enabled) { character.skillpoints += dt * 0.015 * Number(stats.skillpointGain || 1); return; }
  const system = await getSystem(character);
  const rng = seededRandom(`${character._id}:${now.getTime()}:${character.expedition.state}:${character.stats.sorties}`);
  const state = character.expedition.state || 'idle';
  character.skillpoints += dt * 0.03 * Number(stats.skillpointGain || 1);

  if (state === 'idle') return startNewSite(character, system, stats, rng);
  if (state === 'repairing') { character.expedition.progress += dt * 2; if (character.expedition.progress >= 100) { resetExpedition(character, 'idle'); character.locationState = 'docked'; addLog(character, '维修完成，等待下一轮出站。'); } return; }
  if (!character.expedition.site) { resetExpedition(character, 'idle'); return; }

  const site = character.expedition.site;
  const extractionReason = shouldExtract(character, stats);
  if (extractionReason && !['extracting', 'looting'].includes(state)) { character.expedition.state = 'extracting'; character.expedition.progress = 0; addLog(character, `${extractionReason}，开始撤离。`); return; }

  if (state === 'scanning') {
    character.expedition.progress += dt * Math.max(1, stats.scan) * (0.8 + rng() * 0.4);
    if (rng() < site.danger * dt * 0.0015) character.expedition.hazard += 0.03 + rng() * 0.05;
    if (character.expedition.progress >= site.scanNeed) { character.expedition.state = 'warping'; character.expedition.progress = 0; addLog(character, `锁定 ${site.name}，跃迁进场。`); }
    return;
  }

  if (state === 'warping') {
    character.locationState = 'warp';
    character.expedition.progress += dt * Math.max(2, stats.extract) * 1.5;
    if (character.expedition.progress >= 40) {
      character.locationState = 'space'; character.expedition.progress = 0;
      const peaceful = ['mining', 'relic', 'data', 'hauling'].includes(site.activity) && rng() > site.danger * 0.5;
      character.expedition.state = peaceful ? 'looting' : 'fighting';
      if (!peaceful) ensureCombat(site, stats, character, rng);
      addLog(character, peaceful ? `进入 ${site.name}，开始作业。` : `遭遇 ${site.combat?.factionLabel || '敌方'} 守卫，进入战斗。`);
    }
    return;
  }

  if (state === 'fighting') {
    const result = resolveCombatRound({ site, character, stats, dt, rng });
    character.expedition.enemyHull = site.enemyEhp || 0;
    character.expedition.hazard = Math.max(Number(character.expedition.hazard || 0), Number(site.hazard || 0));
    character.stats.damageDealt = Number(character.stats.damageDealt || 0) + result.dealt;
    character.stats.damageTaken = Number(character.stats.damageTaken || 0) + result.taken;
    if (result.bounty > 0) { character.credits += result.bounty; character.stats.totalEarned += result.bounty; character.stats.bountyEarned = Number(character.stats.bountyEarned || 0) + result.bounty; character.walletJournal.unshift({ at: now, type: 'bounty', amount: Math.round(result.bounty), note: `${site.combat?.factionLabel || '敌方'} 赏金` }); }
    if (result.outcome === 'destroyed') {
      const lossCost = Math.round(Math.max(2500, Number(character.ship?.stats?.hull || 100) * 110));
      character.credits = Math.max(0, character.credits - lossCost); character.stats.losses += 1; character.cargo = []; character.locationState = 'docked'; resetExpedition(character, 'repairing'); addLog(character, `舰船被击毁，保险赔付后仍损失 ${lossCost} ISK。`);
      await pushEvent({ scope: 'global', characterId: character._id, systemId: system.systemId, severity: 'danger', title: '舰船损失', message: `${character.name} 在 ${system.name} 损失舰船，克隆体回站。` }, io);
      return;
    }
    if (result.outcome === 'won') { character.stats.kills += Number(site.combat?.waves || 0) || 1; character.expedition.state = 'looting'; character.expedition.progress = 0; addLog(character, `清理 ${site.combat?.factionLabel || '敌方'} 守卫，开始搜刮/采集。`); }
    return;
  }

  if (state === 'looting') {
    const workRate = site.activity === 'mining' ? Math.max(1, stats.mining) : Math.max(1, stats.scan * 0.6 + stats.salvage + stats.hack);
    character.expedition.progress += dt * workRate * (0.75 + rng() * 0.5);
    if (rng() < site.danger * dt * 0.001) character.expedition.hazard += 0.02 + rng() * 0.08;
    if (character.expedition.progress >= site.lootNeed) {
      const loot = await generateLoot(character, system, site, stats, rng);
      const cap = cargoCapacity(character, stats), cargo = mutableCargo(character);
      let gainedValue = 0, gainedM3 = 0;
      for (const stack of loot) { const availableM3 = Math.max(0, cap - cargoVolume(cargo)); const qty = Math.min(stack.quantity, stack.volume > 0 ? Math.max(0, Math.floor(availableM3 / stack.volume)) : stack.quantity); if (qty <= 0) continue; mergeStack(cargo, { ...stack, quantity: qty }); gainedValue += qty * stack.basePrice; gainedM3 += qty * stack.volume; }
      if (site.activity === 'mining') character.stats.minedM3 += gainedM3;
      character.stats.bestLoot = Math.max(character.stats.bestLoot || 0, gainedValue);
      character.expedition.state = 'extracting'; character.expedition.progress = 0; addLog(character, `获得约 ${Math.round(gainedValue)} ISK 战利品，准备撤离。`);
    }
    return;
  }

  if (state === 'extracting') {
    character.expedition.progress += dt * Math.max(2, stats.extract) * (1 + stats.warpStability * 0.1);
    if (rng() < site.danger * dt * 0.0012) character.expedition.hazard += 0.025 + rng() * 0.06;
    if (site.combat?.effects?.scrammed) character.expedition.progress -= dt * 0.35;
    if (character.expedition.progress >= 65) {
      character.locationState = 'docked';
      const transferred = transferCargoToWarehouse(character);
      const sold = await sellExcess(character, system);
      character.stats.extractions += 1;
      character.securityStanding += systemBand(system) === 'high' ? 0.001 : -0.002 * Number(site.tier || 1);
      addLog(character, `成功撤离：入库 ${transferred.count} 件，自动出售 ${sold.sold} 件。`);
      if (sold.value > 0 || transferred.value > 100000) await pushEvent({ scope: 'system', characterId: character._id, systemId: system.systemId, severity: 'success', title: '搜打撤成功', message: `${character.name} 从 ${system.name} 带回约 ${Math.round(transferred.value)} ISK 货物。` }, io);
      resetExpedition(character, 'idle');
    }
  }
}

export async function tickCharacter(character, now = new Date(), io = null) {
  if (!character) return null;
  const last = character.lastTickAt ? new Date(character.lastTickAt) : now;
  let elapsed = Math.max(0, Math.min(MAX_OFFLINE_SECONDS, (now - last) / 1000));
  if (elapsed < 1) return character;
  while (elapsed > 0) { const step = Math.min(STEP_SECONDS, elapsed); await tickStep(character, step, now, io); elapsed -= step; }
  character.lastTickAt = now; character.lastSeenAt = now; await character.save();
  if (io) io.to(`character:${character._id}`).emit('character:update', publicCharacter(character));
  return character;
}

export async function tickCharacterById(characterId, io = null) { const character = await Character.findById(characterId); return character ? tickCharacter(character, new Date(), io) : null; }

export function publicCharacter(character) {
  const obj = character.toObject ? character.toObject() : character;
  if (obj.expedition?.site?.combat) obj.expedition.site.combatPublic = combatSnapshot(obj.expedition.site);
  return { id: String(obj._id), name: obj.name, race: obj.race, corp: obj.corp, credits: obj.credits, skillpoints: obj.skillpoints, skillTraining: obj.skillTraining, currentSystemId: obj.currentSystemId, homeSystemId: obj.homeSystemId, locationState: obj.locationState, ship: obj.ship, cargo: obj.cargo || [], warehouse: obj.warehouse || { items: [], capacity: 0 }, skills: obj.skills, autopilot: obj.autopilot, expedition: obj.expedition, stats: obj.stats, fleetId: obj.fleetId, updatedAt: obj.updatedAt };
}

export async function tickFleets(now = new Date(), io = null) {
  const fleets = await Fleet.find({ status: 'running' }).limit(60);
  for (const fleet of fleets) {
    const tier = Math.max(1, Number(fleet.objective?.tier || 3));
    const memberIds = (fleet.members || []).map(m => m.characterId).filter(Boolean);
    const started = fleet.startedAt ? new Date(fleet.startedAt).getTime() : now.getTime();
    const duration = Math.max(60, tier * 60) * 1000;
    const progress = clamp((now.getTime() - started) / duration, 0, 1);
    fleet.objective = { ...(fleet.objective || {}), progress };
    if (progress >= 1 || (fleet.readyAt && new Date(fleet.readyAt) <= now)) {
      const system = await SdeSystem.findOne({ systemId: fleet.systemId }).lean();
      const pool = await lootPool('combat'); const rng = seededRandom(`${fleet._id}:${now.toISOString()}`);
      const baseReward = Math.round((4000 + tier * 9500) * Math.max(1, memberIds.length) * (1 + Number(system?.danger || .3)));
      const shared = Math.round(baseReward / Math.max(1, memberIds.length));
      for (const memberId of memberIds) { const character = await Character.findById(memberId); if (!character) continue; character.credits += shared; character.stats.totalEarned += shared; character.walletJournal.unshift({ at: now, type: 'fleet', amount: shared, note: `${fleet.name} 舰队分红` }); const pick = chooseWeighted(pool, rng)?.item; if (pick) mergeStack(character.warehouse.items, { typeId: pick.typeId, name: pick.name, zh: pick.zh || pick.name, kind: pick.kind, quantity: 1 + Math.floor(tier * rng()), volume: pick.volume || 0.01, basePrice: pick.basePrice || 1, source: 'fleet' }); await character.save(); io?.to(`character:${character._id}`).emit('character:update', publicCharacter(character)); }
      fleet.status = 'completed'; fleet.lootPool = { credits: baseReward, items: [] }; fleet.log.unshift(`目标完成，舰队分红 ${baseReward} ISK。`); await fleet.save();
      await pushEvent({ scope: 'global', fleetId: fleet._id, systemId: fleet.systemId, severity: 'success', title: '舰队凯旋', message: `${fleet.name} 完成 T${tier} 作战，分红 ${baseReward} ISK。` }, io);
    } else { await fleet.save(); io?.to('global').emit('fleet:update', fleet.toObject()); }
  }
}

export async function startGameLoop(io, { tickMs = 5000 } = {}) {
  let running = false;
  const loop = async () => { if (running) return; running = true; try { const now = new Date(); const chars = await Character.find({ 'autopilot.enabled': true }).limit(300); for (const character of chars) await tickCharacter(character, now, io); await tickFleets(now, io); } catch (error) { console.error('[game-loop]', error); } finally { running = false; } };
  const timer = setInterval(loop, tickMs); timer.unref?.(); await loop(); return () => clearInterval(timer);
}

export async function startIndustryJob(character, blueprintTypeId, runs = 1) {
  const bp = await SdeBlueprint.findOne({ blueprintTypeId: String(blueprintTypeId) }).lean();
  if (!bp) throw new Error('蓝图不存在');
  runs = Math.max(1, Math.min(20, Number(runs || 1)));
  const warehouse = mutableWarehouse(character);
  for (const material of bp.materials) { const have = warehouse.find(s => String(s.typeId) === String(material.typeId)); if (!have || Number(have.quantity || 0) < Number(material.quantity || 0) * runs) throw new Error(`材料不足：${material.name || material.typeId}`); }
  for (const material of bp.materials) { const stack = warehouse.find(s => String(s.typeId) === String(material.typeId)); stack.quantity -= Number(material.quantity || 0) * runs; }
  character.warehouse.items = warehouse.filter(s => Number(s.quantity || 0) > 0);
  const seconds = Math.max(10, Number(bp.time || 60) * runs / Math.max(1, Number(character.skills.industry || 1) * 0.12));
  const job = await IndustryJob.create({ characterId: character._id, blueprintTypeId: String(blueprintTypeId), productTypeId: String(bp.productTypeId), productName: bp.productName, runs, status: 'running', output: { quantity: Number(bp.quantity || 1) * runs }, materials: bp.materials, startedAt: new Date(), readyAt: new Date(Date.now() + seconds * 1000) });
  await character.save(); return job;
}
