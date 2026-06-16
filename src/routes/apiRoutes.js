import express from 'express';
import { Character, SdeType, SdeSystem, SdeBlueprint, MarketOrder, IndustryJob, Fleet, GameEvent } from '../models/index.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { tickCharacter, publicCharacter, startIndustryJob } from '../services/gameEngine.js';
import { getPublicCatalog } from '../services/catalog.js';
import { marketPrice, mergeStack, removeStackQuantity, safeText } from '../services/formulas.js';
import { buildShipFromType } from '../services/shipFactory.js';
import { buildFittedModuleFromType, validateModuleFit, fittingSummary } from '../services/fitting.js';
import { chargeStackFromType, isChargeType, damageProfileForCharge } from '../services/consumables.js';
import { enqueueSkillTraining, skillUi } from '../services/skills.js';
import { gameConfigSummary } from '../services/gameConfig.js';

export const apiRoutes = express.Router();
apiRoutes.use(requireAuth);

async function getCharacterDoc(req) {
  const character = await Character.findOne({ userId: req.session.userId });
  if (!character) throw new Error('角色不存在');
  await tickCharacter(character, new Date(), req.app.get('io'));
  return character;
}

apiRoutes.get('/state', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const [catalog, system, events, jobs, fleets] = await Promise.all([
    getPublicCatalog(),
    SdeSystem.findOne({ systemId: character.currentSystemId }).lean(),
    GameEvent.find({ $or: [{ scope: 'global' }, { characterId: character._id }, { systemId: character.currentSystemId }] }).sort({ createdAt: -1 }).limit(30).lean(),
    IndustryJob.find({ characterId: character._id, status: 'running' }).sort({ readyAt: 1 }).lean(),
    Fleet.find({ status: { $in: ['forming', 'running'] } }).sort({ updatedAt: -1 }).limit(12).lean()
  ]);
  res.json({ ok: true, character: publicCharacter(character), catalog, system, events, jobs, fleets, meta: { skills: skillUi(character), fitting: fittingSummary(character), configs: gameConfigSummary() }, serverTime: new Date() });
}));

apiRoutes.get('/skills/options', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  res.json({ ok: true, skills: skillUi(character) });
}));

apiRoutes.post('/skills/train', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const job = enqueueSkillTraining(character, String(req.body.skillId || ''));
  character.expedition.log.unshift(`技能训练排队：${job.skillId} → Lv.${job.targetLevel}`);
  await character.save();
  res.json({ ok: true, job, skills: skillUi(character), character: publicCharacter(character) });
}));

apiRoutes.post('/autopilot', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const body = req.body || {};
  if (body.activity) character.autopilot.activity = String(body.activity);
  if (body.enabled !== undefined) character.autopilot.enabled = ['true', true, '1', 1, 'on'].includes(body.enabled);
  if (body.allowLowSec !== undefined) character.autopilot.allowLowSec = ['true', true, '1', 1, 'on'].includes(body.allowLowSec);
  if (body.sellExcess !== undefined) character.autopilot.sellExcess = ['true', true, '1', 1, 'on'].includes(body.sellExcess);
  if (body.refineOre !== undefined) character.autopilot.refineOre = ['true', true, '1', 1, 'on'].includes(body.refineOre);
  if (body.targetSystemId) character.autopilot.targetSystemId = String(body.targetSystemId);
  if (body.risk !== undefined) character.autopilot.risk = Math.max(0.05, Math.min(1.2, Number(body.risk)));
  if (body.minShieldPct !== undefined) character.autopilot.minShieldPct = Math.max(0.1, Math.min(0.95, Number(body.minShieldPct)));
  character.expedition.log.unshift('调度参数已更新。');
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

apiRoutes.post('/dock', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  character.expedition.state = 'extracting';
  character.expedition.progress = Math.max(Number(character.expedition.progress || 0), 45);
  character.expedition.log.unshift('手动下达撤离命令。');
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

apiRoutes.post('/warehouse/reserve', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(0, Number(req.body.quantity || 0));
  if (!typeId) throw new Error('缺少 typeId');
  character.warehouse.reserve.set(typeId, quantity);
  await character.save();
  res.json({ ok: true, reserve: Object.fromEntries(character.warehouse.reserve) });
}));

apiRoutes.post('/sell-excess', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  let sold = 0, value = 0;
  for (const stack of character.warehouse.items) {
    if (stack.locked) continue;
    const reserve = Number(character.warehouse.reserve.get(String(stack.typeId)) || 0);
    const qty = Math.max(0, Number(stack.quantity || 0) - reserve);
    if (qty <= 0) continue;
    const type = await SdeType.findOne({ typeId: String(stack.typeId) }).lean() || stack;
    const price = marketPrice(type, system, 'buy');
    stack.quantity -= qty;
    value += price * qty;
    sold += qty;
  }
  character.warehouse.items = character.warehouse.items.filter(s => Number(s.quantity || 0) > 0);
  character.credits += Math.round(value);
  character.stats.totalEarned += Math.round(value);
  character.walletJournal.unshift({ at: new Date(), type: 'manual-sell', amount: Math.round(value), note: `手动卖出 ${sold} 件库存` });
  await character.save();
  res.json({ ok: true, sold, value: Math.round(value), character: publicCharacter(character) });
}));

apiRoutes.post('/market/buy', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Math.min(100000, Number(req.body.quantity || 1)));
  const type = await SdeType.findOne({ typeId }).lean();
  if (!type) throw new Error('物品不存在');
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  const price = marketPrice(type, system, 'sell');
  const total = Math.round(price * quantity);
  if (character.credits < total) throw new Error('ISK 不足');
  character.credits -= total;
  if (type.kind === 'ship') {
    for (let i = 0; i < Math.min(10, quantity); i += 1) character.hangarShips.push(buildShipFromType(type));
  } else {
    mergeStack(character.warehouse.items, { typeId, name: type.name, zh: type.zh || type.name, kind: isChargeType(type) ? 'ammo' : type.kind, quantity, volume: type.volume || 0.01, basePrice: type.basePrice || price, source: 'market', meta: isChargeType(type) ? { chargeKind: 'ammo', damageProfile: damageProfileForCharge(type) } : type.meta });
  }
  character.stats.trades += 1;
  character.walletJournal.unshift({ at: new Date(), type: 'buy', amount: -total, note: `购买 ${type.zh || type.name} × ${quantity}` });
  await character.save();
  await MarketOrder.updateOne({ typeId, systemId: character.currentSystemId, side: 'sell', npc: true }, { $inc: { remaining: -quantity } });
  res.json({ ok: true, total, price, character: publicCharacter(character) });
}));

apiRoutes.post('/market/sell', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId && !s.locked);
  if (!stack || Number(stack.quantity || 0) < quantity) throw new Error('库存不足或已锁仓');
  const type = await SdeType.findOne({ typeId }).lean() || stack;
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  const price = marketPrice(type, system, 'buy');
  const total = Math.round(price * quantity);
  removeStackQuantity(character.warehouse.items, typeId, quantity);
  character.credits += total;
  character.stats.totalEarned += total;
  character.stats.trades += 1;
  character.walletJournal.unshift({ at: new Date(), type: 'sell', amount: total, note: `出售 ${stack.zh || stack.name} × ${quantity}` });
  await character.save();
  res.json({ ok: true, total, price, character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/equip', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const type = await SdeType.findOne({ typeId, kind: 'module' }).lean();
  if (!type) throw new Error('装备不存在');
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId && Number(s.quantity || 0) > 0);
  if (!stack) throw new Error('仓库里没有这件装备');
  const fitted = buildFittedModuleFromType(type, character);
  validateModuleFit(character, fitted);
  removeStackQuantity(character.warehouse.items, typeId, 1);
  character.ship.fittedModules.push(fitted);
  character.expedition.log.unshift(`装配 ${type.zh || type.name} 到 ${fitted.slot} 槽。`);
  await character.save();
  res.json({ ok: true, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/unfit', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const instanceId = String(req.body.instanceId || '');
  const idx = (character.ship.fittedModules || []).findIndex(m => String(m.instanceId) === instanceId);
  if (idx < 0) throw new Error('装备不存在');
  const mod = character.ship.fittedModules.splice(idx, 1)[0];
  if (mod.charge?.typeId && Number(mod.charge.loadedQuantity || 0) > 0) mergeStack(character.warehouse.items, { typeId: String(mod.charge.typeId), name: mod.charge.name, zh: mod.charge.zh || mod.charge.name, kind: 'ammo', quantity: Number(mod.charge.loadedQuantity || 0), volume: 0.01, basePrice: 1, source: 'unfit-charge', meta: { chargeKind: mod.charge.chargeKind || 'ammo', damageProfile: mod.charge.damageProfile } });
  const type = await SdeType.findOne({ typeId: String(mod.typeId) }).lean() || mod;
  mergeStack(character.warehouse.items, { typeId: String(mod.typeId), name: mod.name, zh: mod.zh || mod.name, kind: 'module', quantity: 1, volume: type.volume || 5, basePrice: type.basePrice || 1, source: 'unfit' });
  await character.save();
  res.json({ ok: true, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/module-state', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const mod = (character.ship.fittedModules || []).find(m => String(m.instanceId) === String(req.body.instanceId || ''));
  if (!mod) throw new Error('装备不存在');
  const state = String(req.body.state || 'active');
  if (!['active', 'idle', 'offline'].includes(state)) throw new Error('状态无效');
  mod.state = mod.mode === 'passive' ? 'passive' : state;
  mod.online = state !== 'offline';
  await character.save();
  res.json({ ok: true, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/load-charge', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const mod = (character.ship.fittedModules || []).find(m => String(m.instanceId) === String(req.body.instanceId || ''));
  if (!mod) throw new Error('装备不存在');
  if (!mod.activation?.chargeKind) throw new Error('该装备不需要装填消耗品');
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Math.min(5000, Number(req.body.quantity || 1)));
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId && Number(s.quantity || 0) >= quantity);
  if (!stack) throw new Error('仓库消耗品不足');
  const type = await SdeType.findOne({ typeId }).lean() || stack;
  if (!isChargeType(type) && !isChargeType(stack)) throw new Error('该物品不是弹药/晶体/导弹');
  if (mod.charge?.typeId && Number(mod.charge.loadedQuantity || 0) > 0) mergeStack(character.warehouse.items, { typeId: String(mod.charge.typeId), name: mod.charge.name, zh: mod.charge.zh || mod.charge.name, kind: 'ammo', quantity: Number(mod.charge.loadedQuantity || 0), volume: 0.01, basePrice: 1, source: 'reload', meta: { chargeKind: mod.charge.chargeKind || 'ammo', damageProfile: mod.charge.damageProfile } });
  removeStackQuantity(character.warehouse.items, typeId, quantity);
  const charge = chargeStackFromType(type, quantity);
  mod.charge = { typeId: charge.typeId, name: charge.name, zh: charge.zh, loadedQuantity: quantity, damageProfile: charge.meta?.damageProfile, chargeKind: charge.meta?.chargeKind || 'ammo' };
  mod.state = 'active';
  mod.online = true;
  await character.save();
  res.json({ ok: true, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/activate', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const instanceId = String(req.body.instanceId || '');
  const idx = (character.hangarShips || []).findIndex(s => String(s.instanceId) === instanceId);
  if (idx < 0) throw new Error('舰船不存在');
  const nextShip = character.hangarShips.splice(idx, 1)[0];
  if (character.ship) character.hangarShips.push(character.ship);
  character.ship = nextShip;
  character.expedition.state = 'idle';
  character.locationState = 'docked';
  character.expedition.log.unshift(`切换当前舰船为 ${nextShip.zh || nextShip.name}。`);
  await character.save();
  res.json({ ok: true, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/refine', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId && Number(s.quantity || 0) >= quantity);
  if (!stack || stack.kind !== 'ore') throw new Error('只能精炼矿石，且库存需足够');
  removeStackQuantity(character.warehouse.items, typeId, quantity);
  const efficiency = 0.45 + Number(character.skills.industry || 1) * 0.025;
  const trit = Math.round(quantity * 4 * efficiency);
  const pye = Math.round(quantity * 1.6 * efficiency);
  mergeStack(character.warehouse.items, { typeId: '34', name: 'Tritanium', zh: '三钛合金', kind: 'mineral', quantity: trit, volume: 0.01, basePrice: 6, source: 'refine' });
  mergeStack(character.warehouse.items, { typeId: '35', name: 'Pyerite', zh: '类晶体胶矿', kind: 'mineral', quantity: pye, volume: 0.01, basePrice: 12, source: 'refine' });
  character.skills.industry += 0.005;
  character.expedition.log.unshift(`精炼 ${stack.zh || stack.name} × ${quantity}，产出矿物 ${trit + pye}。`);
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

apiRoutes.post('/industry/start', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const job = await startIndustryJob(character, req.body.blueprintTypeId, req.body.runs || 1);
  res.json({ ok: true, job, character: publicCharacter(character) });
}));

apiRoutes.get('/industry/jobs', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const jobs = await IndustryJob.find({ characterId: character._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ ok: true, jobs });
}));

apiRoutes.get('/market/prices', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  const types = await SdeType.find({ typeId: { $in: String(req.query.typeIds || '').split(',').filter(Boolean) } }).lean();
  const prices = types.map(type => ({ typeId: type.typeId, buy: marketPrice(type, system, 'buy'), sell: marketPrice(type, system, 'sell') }));
  res.json({ ok: true, system, prices });
}));

apiRoutes.get('/sde/search', asyncHandler(async (req, res) => {
  const q = safeText(req.query.q || '', 80);
  const kind = safeText(req.query.kind || '', 40);
  const collection = req.query.collection || 'types';
  const regex = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  if (collection === 'systems') {
    const filter = regex ? { $or: [{ name: regex }, { zh: regex }] } : {};
    const systems = await SdeSystem.find(filter).sort({ security: -1 }).limit(100).lean();
    return res.json({ ok: true, systems });
  }
  if (collection === 'blueprints') {
    const filter = regex ? { $or: [{ name: regex }, { zh: regex }, { productName: regex }] } : {};
    const blueprints = await SdeBlueprint.find(filter).sort({ time: 1 }).limit(100).lean();
    return res.json({ ok: true, blueprints });
  }
  const filter = {};
  if (regex) filter.$or = [{ name: regex }, { zh: regex }, { groupName: regex }, { marketGroupName: regex }];
  if (kind) filter.kind = kind;
  const types = await SdeType.find(filter).sort({ kind: 1, tier: 1, basePrice: 1 }).limit(150).lean();
  res.json({ ok: true, types });
}));

apiRoutes.post('/fleet/create', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const name = safeText(req.body.name || `${character.name} 的远征队`, 40);
  const fleet = await Fleet.create({ name, commanderId: character._id, systemId: character.currentSystemId, activity: safeText(req.body.activity || 'nullsec-raid', 40), status: 'forming', members: [{ characterId: character._id, role: 'commander', joinedAt: new Date() }], objective: { tier: Math.max(1, Math.min(10, Number(req.body.tier || 3))), progress: 0 }, lootPool: { credits: 0, items: [] }, log: [`${character.name} 创建舰队。`] });
  character.fleetId = fleet._id;
  await character.save();
  req.app.get('io')?.to('global').emit('fleet:update', fleet);
  res.json({ ok: true, fleet });
}));

apiRoutes.post('/fleet/join', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const fleet = await Fleet.findById(req.body.fleetId);
  if (!fleet || !['forming', 'running'].includes(fleet.status)) throw new Error('舰队不可加入');
  if (!fleet.members.some(m => String(m.characterId) === String(character._id))) { fleet.members.push({ characterId: character._id, role: 'member', joinedAt: new Date() }); fleet.log.unshift(`${character.name} 加入舰队。`); }
  character.fleetId = fleet._id;
  await Promise.all([fleet.save(), character.save()]);
  req.app.get('io')?.to('global').emit('fleet:update', fleet);
  res.json({ ok: true, fleet });
}));

apiRoutes.post('/fleet/start', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const fleet = await Fleet.findById(req.body.fleetId);
  if (!fleet || String(fleet.commanderId) !== String(character._id)) throw new Error('只有指挥官可以开始');
  fleet.status = 'running';
  fleet.startedAt = new Date();
  fleet.readyAt = new Date(Date.now() + Math.max(60, Number(fleet.objective?.tier || 3) * 60) * 1000);
  fleet.log.unshift('舰队已进入目标星系，战利品池开始累计。');
  await fleet.save();
  req.app.get('io')?.to('global').emit('fleet:update', fleet);
  res.json({ ok: true, fleet });
}));

apiRoutes.get('/leaderboard', asyncHandler(async (req, res) => {
  const richest = await Character.find({}).sort({ credits: -1 }).limit(20).select('name corp credits stats currentSystemId').lean();
  const earned = await Character.find({}).sort({ 'stats.totalEarned': -1 }).limit(20).select('name corp credits stats currentSystemId').lean();
  const kills = await Character.find({}).sort({ 'stats.kills': -1 }).limit(20).select('name corp credits stats currentSystemId').lean();
  res.json({ ok: true, richest, earned, kills });
}));

apiRoutes.use((err, req, res, next) => {
  console.error('[api]', err);
  res.status(400).json({ ok: false, error: err.message || '请求失败' });
});
