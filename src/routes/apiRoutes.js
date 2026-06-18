import express from 'express';
import { Character, SdeType, SdeSystem, SdeBlueprint, MarketOrder, IndustryJob, Fleet, GameEvent } from '../models/index.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { tickCharacter, publicCharacter, startIndustryJob } from '../services/gameEngine.js';
import { getPublicCatalog } from '../services/catalog.js';
import { cargoVolume, marketPrice, mergeStack, removeStackQuantity, safeText } from '../services/formulas.js';
import { shipFromType } from '../services/shipFactory.js';
import { fitModuleFromType, fittingSummary, setModuleActive, unfitModuleToWarehouse } from '../services/fittingSystem.js';
import { publicSkillState, skillOptions, startSkillTraining } from '../services/skillSystem.js';
import { computeRefineYield } from '../services/industry.js';
import { getStaticSdeStore } from '../services/staticSdeStore.js';
import { t, getMessages } from '../services/i18n.js';

export const apiRoutes = express.Router();
apiRoutes.use(requireAuth);

async function getCharacterDoc(req) {
  const character = await Character.findOne({ userId: req.session.userId });
  if (!character) throw new Error(t('error.character_missing'));
  await tickCharacter(character, new Date(), req.app.get('io'));
  return character;
}

function bool(value) { return ['true', true, '1', 1, 'on'].includes(value); }

apiRoutes.get('/state', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const [catalog, system, events, jobs, fleets] = await Promise.all([
    getPublicCatalog(),
    SdeSystem.findOne({ systemId: character.currentSystemId }).lean(),
    GameEvent.find({ $or: [{ scope: 'global' }, { characterId: character._id }, { systemId: character.currentSystemId }] }).sort({ createdAt: -1 }).limit(30).lean(),
    IndustryJob.find({ characterId: character._id, status: 'running' }).sort({ readyAt: 1 }).lean(),
    Fleet.find({ status: { $in: ['forming', 'running'] } }).sort({ updatedAt: -1 }).limit(12).lean()
  ]);
  res.json({ ok: true, character: publicCharacter(character), catalog, system, events, jobs, fleets, skills: publicSkillState(character), fitting: fittingSummary(character), serverTime: new Date() });
}));

apiRoutes.get('/skills', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  res.json({ ok: true, ...publicSkillState(character) });
}));

apiRoutes.get('/skills/options', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...skillOptions() });
}));

apiRoutes.post('/skills/train', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const training = startSkillTraining(character, String(req.body.skillId || ''), { queue: req.body.queue !== false });
  character.markModified('skills');
  character.markModified('skillTraining');
  await character.save();
  res.json({ ok: true, training, skills: publicSkillState(character) });
}));

apiRoutes.get('/i18n', asyncHandler(async (req, res) => {
  res.json({ ok: true, locale: 'zh-CN', messages: getMessages('zh-CN') });
}));

apiRoutes.get('/fitting', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  res.json({ ok: true, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/autopilot', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const body = req.body || {};
  if (body.activity) character.autopilot.activity = String(body.activity);
  if (body.enabled !== undefined) character.autopilot.enabled = bool(body.enabled);
  if (body.allowLowSec !== undefined) character.autopilot.allowLowSec = bool(body.allowLowSec);
  if (body.sellExcess !== undefined) character.autopilot.sellExcess = bool(body.sellExcess);
  if (body.refineOre !== undefined) character.autopilot.refineOre = bool(body.refineOre);
  if (body.targetSystemId) character.autopilot.targetSystemId = String(body.targetSystemId);
  if (body.risk !== undefined) character.autopilot.risk = Math.max(0.05, Math.min(1.2, Number(body.risk)));
  if (body.minShieldPct !== undefined) character.autopilot.minShieldPct = Math.max(0.1, Math.min(0.95, Number(body.minShieldPct)));
  if (!character.autopilot.combat) character.autopilot.combat = {};
  if (body.combatStance) character.autopilot.combat.stance = String(body.combatStance);
  if (body.damageProfile) character.autopilot.combat.damageProfile = String(body.damageProfile);
  if (body.targetPriority) character.autopilot.combat.targetPriority = String(body.targetPriority);
  character.expedition.log.unshift(t('log.autopilot_updated'));
  character.markModified('autopilot');
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

apiRoutes.post('/dock', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  character.expedition.state = 'extracting';
  character.expedition.progress = Math.max(Number(character.expedition.progress || 0), 45);
  character.expedition.log.unshift(t('log.manual_dock'));
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

apiRoutes.post('/warehouse/reserve', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(0, Number(req.body.quantity || 0));
  if (!typeId) throw new Error(t('error.missing_typeid'));
  character.warehouse.reserve.set(typeId, quantity);
  await character.save();
  res.json({ ok: true, reserve: Object.fromEntries(character.warehouse.reserve) });
}));

apiRoutes.post('/warehouse/lock', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const locked = ['1', 'true', true].includes(req.body.locked);
  if (!typeId) throw new Error(t('error.missing_typeid'));
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId);
  if (!stack) throw new Error(t('error.stack_missing'));
  stack.locked = locked;
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

apiRoutes.post('/cargo/load', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Math.floor(Number(req.body.quantity || 1)));
  if (!typeId) throw new Error(t('cargo.err.missingType'));
  const stack = (character.warehouse?.items || []).find(s => String(s.typeId) === typeId && Number(s.quantity || 0) > 0 && !s.locked);
  if (!stack) throw new Error(t('cargo.err.noCharge'));
  // Clamp to the ship cargo volume the mining/looting paths also enforce.
  const cap = Number(character.ship?.stats?.cargo || 0);
  const free = cap > 0 ? Math.max(0, cap - cargoVolume(character.cargo || [])) : Infinity;
  const vol = Number(stack.volume || 0);
  const fits = vol > 0 ? Math.floor(free / vol) : Number(stack.quantity || 0);
  const move = Math.min(quantity, Number(stack.quantity || 0), fits);
  if (move <= 0) throw new Error(t('cargo.err.full'));
  const displayName = stack.zh || stack.name;
  const payload = { typeId, name: stack.name, zh: stack.zh, kind: stack.kind || 'charge', quantity: move, volume: stack.volume, basePrice: stack.basePrice, chargeGroup: stack.chargeGroup || stack.meta?.chargeGroup, source: 'cargo-load', meta: stack.meta ? { ...stack.meta } : {} };
  removeStackQuantity(character.warehouse.items, typeId, move);
  if (!Array.isArray(character.cargo)) character.cargo = [];
  mergeStack(character.cargo, payload);
  character.expedition.log.unshift(t('cargo.log.loaded', { name: displayName, qty: move }));
  character.markModified('warehouse');
  character.markModified('cargo');
  await character.save();
  res.json({ ok: true, moved: move, character: publicCharacter(character) });
}));

apiRoutes.post('/cargo/unload', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Math.floor(Number(req.body.quantity || 1)));
  if (!typeId) throw new Error(t('cargo.err.missingType'));
  const stack = (character.cargo || []).find(s => String(s.typeId) === typeId && Number(s.quantity || 0) > 0);
  if (!stack) throw new Error(t('cargo.err.notInCargo'));
  const move = Math.min(quantity, Number(stack.quantity || 0));
  const displayName = stack.zh || stack.name;
  const payload = { typeId, name: stack.name, zh: stack.zh, kind: stack.kind, quantity: move, volume: stack.volume, basePrice: stack.basePrice, chargeGroup: stack.chargeGroup || stack.meta?.chargeGroup, source: 'cargo-unload', meta: stack.meta ? { ...stack.meta } : {} };
  removeStackQuantity(character.cargo, typeId, move);
  mergeStack(character.warehouse.items, payload);
  character.expedition.log.unshift(t('cargo.log.unloaded', { name: displayName, qty: move }));
  character.markModified('warehouse');
  character.markModified('cargo');
  await character.save();
  res.json({ ok: true, moved: move, character: publicCharacter(character) });
}));

apiRoutes.post('/sell-excess', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  let sold = 0;
  let value = 0;
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
  character.walletJournal.unshift({ at: new Date(), type: 'manual-sell', amount: Math.round(value), note: t('journal.manual_sell', { count: sold }) });
  await character.save();
  res.json({ ok: true, sold, value: Math.round(value), character: publicCharacter(character) });
}));

apiRoutes.post('/market/buy', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Math.min(100000, Number(req.body.quantity || 1)));
  const type = await SdeType.findOne({ typeId }).lean();
  if (!type) throw new Error(t('error.type_missing'));
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  const price = marketPrice(type, system, 'sell');
  const total = Math.round(price * quantity);
  if (character.credits < total) throw new Error(t('error.insufficient_isk'));
  character.credits -= total;
  if (type.kind === 'ship') {
    for (let i = 0; i < Math.min(10, quantity); i += 1) character.hangarShips.push(shipFromType(type, { race: character.race || 'market' }));
  } else {
    mergeStack(character.warehouse.items, { typeId, name: type.name, zh: type.zh || type.name, kind: type.kind, quantity, volume: type.volume || 0.01, basePrice: type.basePrice || price, chargeGroup: type.chargeGroup, source: 'market' });
  }
  character.stats.trades += 1;
  character.walletJournal.unshift({ at: new Date(), type: 'buy', amount: -total, note: t('journal.buy', { name: type.zh || type.name, qty: quantity }) });
  await character.save();
  await MarketOrder.updateOne({ typeId, systemId: character.currentSystemId, side: 'sell', npc: true }, { $inc: { remaining: -quantity } });
  res.json({ ok: true, total, price, character: publicCharacter(character) });
}));

apiRoutes.post('/market/sell', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId && !s.locked);
  if (!stack || Number(stack.quantity || 0) < quantity) throw new Error(t('error.stock_insufficient_or_locked'));
  const type = await SdeType.findOne({ typeId }).lean() || stack;
  const system = await SdeSystem.findOne({ systemId: character.currentSystemId }).lean();
  const price = marketPrice(type, system, 'buy');
  const total = Math.round(price * quantity);
  removeStackQuantity(character.warehouse.items, typeId, quantity);
  character.credits += total;
  character.stats.totalEarned += total;
  character.stats.trades += 1;
  character.walletJournal.unshift({ at: new Date(), type: 'sell', amount: total, note: t('journal.sell', { name: stack.zh || stack.name, qty: quantity }) });
  await character.save();
  res.json({ ok: true, total, price, character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/equip', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const type = await SdeType.findOne({ typeId, kind: 'module' }).lean();
  if (!type) throw new Error(t('fit.err.noModule'));
  const module = fitModuleFromType(character, type);
  character.expedition.log.unshift(t('log.equip', { name: module.zh || module.name, slot: module.slot }));
  character.markModified('ship');
  character.markModified('warehouse');
  await character.save();
  res.json({ ok: true, module, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/unfit', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const instanceId = String(req.body.instanceId || '');
  const mod = (character.ship?.fittedModules || []).find(m => String(m.instanceId) === instanceId);
  const type = mod ? await SdeType.findOne({ typeId: String(mod.typeId) }).lean() : null;
  const removed = unfitModuleToWarehouse(character, instanceId, type || {});
  character.expedition.log.unshift(t('log.unfit', { name: removed.zh || removed.name }));
  character.markModified('ship');
  character.markModified('warehouse');
  await character.save();
  res.json({ ok: true, module: removed, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/module/active', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const module = setModuleActive(character, String(req.body.instanceId || ''), bool(req.body.active));
  character.expedition.log.unshift(module.active ? t('log.cycle_on', { name: module.zh || module.name }) : t('log.cycle_off', { name: module.zh || module.name }));
  character.markModified('ship');
  await character.save();
  res.json({ ok: true, module, fitting: fittingSummary(character), character: publicCharacter(character) });
}));

apiRoutes.post('/hangar/activate', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const instanceId = String(req.body.instanceId || '');
  const idx = (character.hangarShips || []).findIndex(s => String(s.instanceId) === instanceId);
  if (idx < 0) throw new Error(t('error.ship_missing'));
  const nextShip = character.hangarShips.splice(idx, 1)[0];
  if (character.ship) character.hangarShips.push(character.ship);
  character.ship = nextShip;
  character.expedition.state = 'idle';
  character.locationState = 'docked';
  character.expedition.log.unshift(t('log.switch_ship', { name: nextShip.zh || nextShip.name }));
  character.markModified('ship');
  await character.save();
  res.json({ ok: true, character: publicCharacter(character), fitting: fittingSummary(character) });
}));

apiRoutes.post('/refine', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const typeId = String(req.body.typeId || '');
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const stack = character.warehouse.items.find(s => String(s.typeId) === typeId && Number(s.quantity || 0) >= quantity);
  if (!stack || stack.kind !== 'ore') throw new Error(t('error.refine_ore_only'));
  if (stack.locked) throw new Error(t('error.refine_locked'));
  const oreType = await resolveOreRefineType(typeId);
  const industryLevel = Number(character.skills?.industry || 0);
  const efficiency = 0.45 + industryLevel * 0.025;
  const result = computeRefineYield(oreType, quantity, efficiency);
  if (!result.consumed || !result.outputs.length) throw new Error(t('error.refine_too_little'));
  removeStackQuantity(character.warehouse.items, typeId, result.consumed);
  let produced = 0;
  for (const out of result.outputs) {
    const mineral = await SdeType.findOne({ typeId: out.typeId }).select('basePrice zh name volume').lean();
    mergeStack(character.warehouse.items, { typeId: out.typeId, name: mineral?.name || out.name, zh: mineral?.zh || out.name, kind: 'mineral', quantity: out.quantity, volume: Number(mineral?.volume || 0.01), basePrice: Number(mineral?.basePrice || out.basePrice || 1), source: 'refine' });
    produced += out.quantity;
  }
  character.skillpoints += 0.4;
  const detail = result.outputs.map(o => `${o.name}×${o.quantity}`).join('，');
  character.expedition.log.unshift(t('log.refine', { name: stack.zh || stack.name, consumed: result.consumed, detail, produced }));
  await character.save();
  res.json({ ok: true, character: publicCharacter(character) });
}));

// Resolve an ore's reprocessing recipe: prefer the seeded SdeType doc, fall back
// to the static SDE store's typeMaterials (+ getType for portionSize/names).
async function resolveOreRefineType(typeId) {
  const doc = await SdeType.findOne({ typeId }).lean();
  if (doc && Array.isArray(doc.materials) && doc.materials.length) {
    return { typeId, name: doc.zh || doc.name, materials: doc.materials, portionSize: Number(doc.portionSize || 1) };
  }
  const store = getStaticSdeStore();
  const typeMaterials = await store.loadCollection('typeMaterials');
  const raw = typeMaterials?.get(String(typeId));
  const list = raw?.materials || raw?._value?.materials || (Array.isArray(raw) ? raw : []);
  if (Array.isArray(list) && list.length) {
    const oreType = await store.getType(typeId).catch(() => null);
    const materials = [];
    for (const m of list) {
      const mid = String(m.materialTypeID ?? m.typeID ?? m.typeId ?? '');
      const qty = Number(m.quantity || 0);
      if (!mid || qty <= 0) continue;
      const mt = await store.getType(mid).catch(() => null);
      materials.push({ typeId: mid, name: mt?.zh || mt?.name || `Type ${mid}`, quantity: qty });
    }
    if (materials.length) return { typeId, name: oreType?.zh || oreType?.name || `Type ${typeId}`, materials, portionSize: Number(oreType?.portionSize || 1) };
  }
  throw new Error(t('error.refine_no_recipe'));
}

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
  const name = safeText(req.body.name || t('fleet.default_name', { name: character.name }), 40);
  const fleet = await Fleet.create({ name, commanderId: character._id, systemId: character.currentSystemId, activity: safeText(req.body.activity || 'nullsec-raid', 40), status: 'forming', members: [{ characterId: character._id, role: 'commander', joinedAt: new Date() }], objective: { tier: Math.max(1, Math.min(10, Number(req.body.tier || 3))), progress: 0 }, lootPool: { credits: 0, items: [] }, log: [t('fleet.log.created', { name: character.name })] });
  character.fleetId = fleet._id;
  await character.save();
  req.app.get('io')?.to('global').emit('fleet:update', fleet);
  res.json({ ok: true, fleet });
}));

apiRoutes.post('/fleet/join', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const fleet = await Fleet.findById(req.body.fleetId);
  if (!fleet || !['forming', 'running'].includes(fleet.status)) throw new Error(t('error.fleet_unjoinable'));
  if (!fleet.members.some(m => String(m.characterId) === String(character._id))) { fleet.members.push({ characterId: character._id, role: 'member', joinedAt: new Date() }); fleet.log.unshift(t('fleet.log.joined', { name: character.name })); }
  character.fleetId = fleet._id;
  await Promise.all([fleet.save(), character.save()]);
  req.app.get('io')?.to('global').emit('fleet:update', fleet);
  res.json({ ok: true, fleet });
}));

apiRoutes.post('/fleet/start', asyncHandler(async (req, res) => {
  const character = await getCharacterDoc(req);
  const fleet = await Fleet.findById(req.body.fleetId);
  if (!fleet || String(fleet.commanderId) !== String(character._id)) throw new Error(t('error.fleet_commander_only'));
  fleet.status = 'running';
  fleet.startedAt = new Date();
  fleet.readyAt = new Date(Date.now() + Math.max(60, Number(fleet.objective?.tier || 3) * 60) * 1000);
  fleet.log.unshift(t('fleet.log.started'));
  await fleet.save();
  req.app.get('io')?.to('global').emit('fleet:update', fleet);
  res.json({ ok: true, fleet });
}));

apiRoutes.get('/leaderboard', asyncHandler(async (req, res) => {
  const richest = await Character.find({}).sort({ credits: -1 }).limit(20).select('name corp race credits stats currentSystemId').lean();
  const earned = await Character.find({}).sort({ 'stats.totalEarned': -1 }).limit(20).select('name corp race credits stats currentSystemId').lean();
  const kills = await Character.find({}).sort({ 'stats.kills': -1 }).limit(20).select('name corp race credits stats currentSystemId').lean();
  res.json({ ok: true, richest, earned, kills });
}));

apiRoutes.use((err, req, res, next) => {
  console.error('[api]', err);
  res.status(err.status || 400).json({ ok: false, error: err.message || t('error.generic') });
});
