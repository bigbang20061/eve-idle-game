import { Character, SdeType, SdeSystem } from '../models/index.js';
import { shipFromStarterConfig, shipFromType } from './shipFactory.js';
import { moduleInstanceFromType, validateModuleFit } from './fittingSystem.js';
import { mergeStack } from './formulas.js';
import { ensureSkillState } from './skillSystem.js';
import { pickStarterRace } from './starterConfig.js';

function safeRegex(text) {
  return new RegExp(String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function findSystem(raceConfig = {}) {
  for (const query of raceConfig.homeSystemQuery || []) {
    const system = await SdeSystem.findOne({ $or: [{ name: safeRegex(query) }, { zh: safeRegex(query) }] }).lean();
    if (system) return system;
  }
  return await SdeSystem.findOne({ name: /Jita/i }).lean()
    || await SdeSystem.findOne({ hub: true }).lean()
    || await SdeSystem.findOne({}).sort({ security: -1 }).lean();
}

async function findShip(raceConfig = {}) {
  for (const query of raceConfig.shipQuery || []) {
    const ship = await SdeType.findOne({ kind: 'ship', $or: [{ name: safeRegex(query) }, { zh: safeRegex(query) }, { groupName: safeRegex(query) }] }).lean();
    if (ship) return ship;
  }
  return null;
}

async function findModuleByQuery(query) {
  return await SdeType.findOne({ kind: 'module', $or: [{ name: safeRegex(query) }, { zh: safeRegex(query) }, { marketGroupName: safeRegex(query) }, { groupName: safeRegex(query) }] }).lean();
}

async function starterModules(raceConfig = {}, character) {
  const out = [];
  for (const query of raceConfig.fitQueries || []) {
    const type = await findModuleByQuery(query);
    if (!type) continue;
    const module = moduleInstanceFromType(type);
    const validation = validateModuleFit(character, module);
    if (validation.ok) out.push(module);
  }
  for (const fallback of raceConfig.fallbackModules || []) {
    const module = moduleInstanceFromType({ kind: 'module', ...fallback, effects: fallback.effects || fallback.passiveEffects || fallback.activeEffects || {} });
    const validation = validateModuleFit(character, module);
    if (validation.ok) out.push(module);
  }
  return out;
}

function cloneStarterStack(stack) {
  return {
    typeId: String(stack.typeId),
    name: stack.name,
    zh: stack.zh || stack.name,
    kind: stack.kind || 'item',
    quantity: Number(stack.quantity || 1),
    volume: Number(stack.volume || 0.01),
    basePrice: Number(stack.basePrice || 1),
    chargeGroup: stack.chargeGroup,
    locked: Boolean(stack.locked),
    source: stack.source || 'starter',
    meta: stack.meta || {}
  };
}

export async function createStarterCharacter(user, name, { race = null } = {}) {
  const picked = pickStarterRace(race);
  const raceId = picked.id;
  const raceConfig = picked.config || {};
  const starterShip = await findShip(raceConfig);
  const starterSystem = await findSystem(raceConfig);
  const ship = starterShip ? shipFromType(starterShip, { race: raceId, skin: `${raceId}-sde` }) : shipFromStarterConfig(raceConfig.fallbackShip || {}, raceId);
  const systemId = String(starterSystem?.systemId || '30000142');
  const character = new Character({
    userId: user._id,
    name,
    race: raceId,
    corp: raceConfig.corp || '自由深空承包人',
    currentSystemId: systemId,
    homeSystemId: systemId,
    cloneStationId: systemId,
    locationState: 'docked',
    credits: Number(raceConfig.credits || 25000),
    ship,
    hangarShips: [],
    cargo: [],
    warehouse: { capacity: 50000, items: [], reserve: new Map() },
    skills: { ...(raceConfig.skills || {}) },
    skillTraining: { active: null, queue: [], history: [] },
    autopilot: {
      enabled: true,
      activity: raceId === 'minmatar' ? 'hauling' : raceId === 'gallente' ? 'relic' : 'ratting',
      risk: 0.35,
      targetSystemId: systemId,
      allowLowSec: false,
      sellExcess: true,
      refineOre: false,
      minShieldPct: 0.35,
      combat: { stance: 'standard', damageProfile: 'balanced', targetPriority: 'scramblers_first' },
      loop: true
    },
    expedition: { state: 'idle', progress: 0, enemyHull: 0, hazard: 0, log: [`克隆体激活，选择 ${raceConfig.label || raceId} 起步包，等待调度。`] },
    walletJournal: [{ at: new Date(), type: 'grant', amount: Number(raceConfig.credits || 25000), note: `${raceConfig.label || raceId} 新克隆启动资金` }],
    lastTickAt: new Date()
  });
  ensureSkillState(character);
  character.ship.fittedModules = await starterModules(raceConfig, character);
  for (const item of raceConfig.inventory || []) {
    const stack = cloneStarterStack(item);
    if (stack.kind === 'charge') mergeStack(character.cargo, stack);
    else mergeStack(character.warehouse.items, stack);
  }
  for (const stack of character.warehouse.items) {
    if (stack.typeId === '34') character.warehouse.reserve.set('34', Math.min(Number(stack.quantity || 0), 500));
    if (stack.typeId === '35') character.warehouse.reserve.set('35', Math.min(Number(stack.quantity || 0), 200));
  }
  return Character.create(character.toObject());
}
