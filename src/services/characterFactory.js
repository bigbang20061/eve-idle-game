import { Character, SdeType, SdeSystem } from '../models/index.js';
import { mergeStack } from './formulas.js';
import { buildShipFromType } from './shipFactory.js';
import { buildFittedModuleFromType } from './fitting.js';
import { starterChargeForRace } from './consumables.js';
import { normaliseSkills } from './skills.js';
import { getStarterKit } from './starters.js';

function regexFromTerms(terms = []) {
  const escaped = terms.filter(Boolean).map(v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escaped.length ? new RegExp(escaped.join('|'), 'i') : null;
}

async function findTypeByQuery(queries = [], filter = {}) {
  const regex = regexFromTerms(queries);
  if (!regex) return null;
  return SdeType.findOne({ ...filter, $or: [{ name: regex }, { zh: regex }, { groupName: regex }, { marketGroupName: regex }] }).sort({ basePrice: 1 }).lean();
}

async function findSystemByQuery(queries = []) {
  const regex = regexFromTerms(queries);
  if (!regex) return null;
  return SdeSystem.findOne({ $or: [{ name: regex }, { zh: regex }] }).sort({ security: -1 }).lean();
}

function starterWarehouseItems(kit, charge) {
  const items = [];
  for (const item of kit.warehouse || []) items.push({ ...item, source: 'starter' });
  if (charge) {
    const remaining = Math.max(0, Number(charge.quantity || 0) - Number(charge.loadedQuantity || 0));
    if (remaining > 0) items.push({ ...charge, quantity: remaining, source: 'starter' });
  }
  return items;
}

export async function createStarterCharacter(user, name, race = 'caldari') {
  const { raceId, kit } = getStarterKit(race);
  const starterShip = await findTypeByQuery(kit.shipQuery, { kind: 'ship' })
    || await SdeType.findOne({ kind: 'ship' }).sort({ basePrice: 1 }).lean()
    || kit.fallbackShip;
  const starterSystem = await findSystemByQuery(kit.homeSystemQuery)
    || await SdeSystem.findOne({ hub: true }).lean()
    || await SdeSystem.findOne({}).sort({ security: -1 }).lean();
  const ship = buildShipFromType(starterShip || kit.fallbackShip, { skin: `${raceId}-rookie` });
  const charge = starterChargeForRace(kit.chargeRace || raceId);

  for (const entry of kit.modules || []) {
    const type = await findTypeByQuery(entry.query, { kind: 'module' }) || entry.fallback;
    if (!type) continue;
    const module = buildFittedModuleFromType(type);
    if (module.activation?.chargeKind && charge) {
      module.charge = { typeId: charge.typeId, name: charge.name, zh: charge.zh, loadedQuantity: Number(charge.loadedQuantity || 0), damageProfile: charge.meta?.damageProfile, chargeKind: charge.meta?.chargeKind || 'ammo' };
    }
    ship.fittedModules.push(module);
  }

  const systemId = String(starterSystem?.systemId || kit.homeSystemId || 'starter-system');
  const warehouseItems = [];
  for (const item of starterWarehouseItems(kit, charge)) mergeStack(warehouseItems, item);
  const skills = normaliseSkills(kit.skills || {});

  return Character.create({
    userId: user._id,
    name,
    race: raceId,
    currentSystemId: systemId,
    homeSystemId: systemId,
    cloneStationId: systemId,
    locationState: 'docked',
    credits: Number(kit.credits || 25000),
    skillTraining: { queue: [] },
    skills,
    ship,
    hangarShips: [],
    cargo: [],
    warehouse: { capacity: Number(kit.warehouseCapacity || 50000), items: warehouseItems, reserve: new Map() },
    autopilot: { enabled: true, activity: 'mining', risk: 0.35, targetSystemId: systemId, allowLowSec: false, sellExcess: true, refineOre: false, minShieldPct: 0.35, loop: true },
    expedition: { state: 'idle', progress: 0, enemyHull: 0, hazard: 0, log: [`${kit.label} 克隆体激活，领取种族新手舰装。`] },
    walletJournal: [{ at: new Date(), type: 'grant', amount: Number(kit.credits || 25000), note: `${kit.label} 新克隆启动资金` }],
    lastTickAt: new Date()
  });
}
