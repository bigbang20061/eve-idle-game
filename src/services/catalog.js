import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SdeType, SdeSystem, SdeBlueprint, SdeGroup, SdeCategory, SdeMarketGroup, MarketOrder } from '../models/index.js';
import { marketPrice, hashString } from './formulas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const seedPath = path.join(projectRoot, 'data/default_sde_seed.json');

export async function readDefaultSeed() {
  const raw = await fs.readFile(seedPath, 'utf8');
  return JSON.parse(raw);
}

function idOf(value) {
  return String(value?.typeID ?? value?.typeId ?? value?.id ?? value?._key ?? '');
}

function deriveTier(value) {
  if (value.tier) return Number(value.tier);
  const price = Number(value.basePrice || value.baseValue || value.cost || 0);
  if (price <= 1000) return 1;
  if (price <= 20000) return 2;
  if (price <= 500000) return 3;
  if (price <= 5000000) return 4;
  return 5;
}

export function normalizeSeedType(value, fallbackKind) {
  const typeId = idOf(value);
  const kind = value.kind || fallbackKind || inferKindFromNames(value.group, value.category, value.name);
  const stats = kind === 'ship' ? {
    shield: value.shield ?? 100,
    armor: value.armor ?? 80,
    hull: value.hull ?? 90,
    dps: value.dps ?? 6,
    mining: value.mining ?? 0,
    hack: value.hack ?? 0,
    scan: value.scan ?? 0,
    salvage: value.salvage ?? 0,
    cargo: value.cargo ?? value.capacity ?? 100,
    oreHold: value.oreHold ?? 0,
    extract: value.extract ?? 2,
    warpStability: value.warpStability ?? 0
  } : (value.stats || {});
  return {
    typeId,
    name: value.name || value.zh || `Type ${typeId}`,
    zh: value.zh || value.name,
    description: value.description || '',
    groupId: String(value.groupID || value.groupId || value.group || ''),
    groupName: value.group || value.groupName || '',
    categoryId: String(value.categoryID || value.categoryId || value.category || ''),
    categoryName: value.category || value.categoryName || '',
    marketGroupId: String(value.marketGroupID || value.marketGroupId || value.marketGroup || ''),
    marketGroupName: value.marketGroup || value.marketGroupName || '',
    kind,
    volume: Number(value.volume ?? (kind === 'ship' ? 2500 : 0.01)),
    capacity: Number(value.capacity ?? value.cargo ?? 0),
    basePrice: Number(value.basePrice ?? value.baseValue ?? value.cost ?? 10),
    rarity: Number(value.rarity ?? 1),
    tier: deriveTier(value),
    slot: value.slot,
    role: value.role || value.class,
    effects: value.effects || {},
    stats,
    attributes: value.attributes || {},
    source: value.source || 'default-seed',
    raw: value
  };
}

export function inferKindFromNames(groupName = '', categoryName = '', typeName = '') {
  const g = `${groupName} ${categoryName} ${typeName}`.toLowerCase();
  if (/blueprint/.test(g)) return 'blueprint';
  if (/ship|frigate|destroyer|cruiser|battlecruiser|battleship|industrial|mining barge|exhumer|hauler|venture|merlin|caracal|vexor|gnosis|procurer/.test(g)) return 'ship';
  if (/module|turret|launcher|laser|shield|armor|afterburner|stabilizer|scanner|salvager|drone|rig/.test(g)) return 'module';
  if (/ore|asteroid|veldspar|scordite|plagioclase|kernite|omber|hedbergite|spodumain|arkonor|bistot/.test(g)) return 'ore';
  if (/mineral|tritanium|pyerite|mexallon|isogen|nocxium|zydrine|megacyte/.test(g)) return 'mineral';
  if (/salvage|relic|ancient/.test(g)) return 'salvage';
  if (/datacore|decryptor|data|encrypted/.test(g)) return 'data';
  if (/commodity|trade good|consumer|livestock|mechanical parts/.test(g)) return 'commodity';
  return 'item';
}

export async function seedDefaultSde({ reset = false } = {}) {
  const seed = await readDefaultSeed();
  if (reset) {
    await Promise.all([
      SdeType.deleteMany({ source: /seed|default/ }),
      SdeSystem.deleteMany({ source: /seed|default/ }),
      SdeBlueprint.deleteMany({ source: /seed|default/ }),
      SdeGroup.deleteMany({ source: /seed|default/ }),
      SdeCategory.deleteMany({ source: /seed|default/ }),
      SdeMarketGroup.deleteMany({ source: /seed|default/ })
    ]);
  }

  const categories = (seed.categories || []).map(c => ({
    updateOne: {
      filter: { categoryId: String(c.id ?? c.categoryId) },
      update: { $set: { categoryId: String(c.id ?? c.categoryId), name: c.name, zh: c.zh || c.name, raw: c, source: 'default-seed' } },
      upsert: true
    }
  }));
  if (categories.length) await SdeCategory.bulkWrite(categories, { ordered: false });

  const groups = (seed.groups || []).map(g => ({
    updateOne: {
      filter: { groupId: String(g.id ?? g.groupId) },
      update: { $set: { groupId: String(g.id ?? g.groupId), name: g.name, zh: g.zh || g.name, categoryId: String(g.categoryID || g.categoryId || ''), categoryName: g.category || '', raw: g, source: 'default-seed' } },
      upsert: true
    }
  }));
  if (groups.length) await SdeGroup.bulkWrite(groups, { ordered: false });

  const marketGroups = (seed.marketGroups || []).map(mg => ({
    updateOne: {
      filter: { marketGroupId: String(mg.id ?? mg.marketGroupId) },
      update: { $set: { marketGroupId: String(mg.id ?? mg.marketGroupId), name: mg.name, zh: mg.zh || mg.name, parentGroupId: String(mg.parent ?? mg.parentGroupId ?? ''), raw: mg, source: 'default-seed' } },
      upsert: true
    }
  }));
  if (marketGroups.length) await SdeMarketGroup.bulkWrite(marketGroups, { ordered: false });

  const types = [
    ...(seed.items || []).map(v => normalizeSeedType(v)),
    ...(seed.ships || []).map(v => normalizeSeedType(v, 'ship')),
    ...(seed.modules || []).map(v => normalizeSeedType(v, 'module'))
  ].filter(v => v.typeId);
  if (types.length) {
    await SdeType.bulkWrite(types.map(type => ({
      updateOne: { filter: { typeId: type.typeId }, update: { $set: type }, upsert: true }
    })), { ordered: false });
  }

  const systems = (seed.systems || []).map(sys => {
    const systemId = String(sys.systemID ?? sys.systemId ?? sys.id ?? sys._key);
    const sec = Number(sys.security ?? sys.securityStatus ?? 0.5);
    const danger = Number(sys.danger ?? Math.max(0.03, 0.9 - sec));
    const richness = Number(sys.richness ?? Math.max(0.55, 1.35 - sec * 0.35));
    return {
      updateOne: {
        filter: { systemId },
        update: { $set: {
          systemId,
          name: sys.name,
          zh: sys.zh || sys.name,
          regionId: String(sys.regionID || sys.regionId || sys.region || ''),
          regionName: sys.regionName || sys.region || '',
          security: sec,
          x: Number(sys.x ?? (hashString(systemId) % 100)),
          y: Number(sys.y ?? ((hashString(`${systemId}-y`) % 100))),
          z: Number(sys.z ?? 0),
          richness,
          danger,
          hub: Boolean(sys.hub),
          kind: sys.kind || (sec >= 0.75 ? 'high' : sec >= 0.45 ? 'low' : 'null'),
          neighbors: sys.neighbors || [],
          raw: sys,
          source: 'default-seed'
        } },
        upsert: true
      }
    };
  });
  if (systems.length) await SdeSystem.bulkWrite(systems, { ordered: false });

  const blueprints = (seed.blueprints || []).map(bp => ({
    updateOne: {
      filter: { blueprintTypeId: String(bp.blueprintTypeID ?? bp.blueprintTypeId ?? bp.id) },
      update: { $set: {
        blueprintTypeId: String(bp.blueprintTypeID ?? bp.blueprintTypeId ?? bp.id),
        name: bp.name,
        zh: bp.zh || bp.name,
        productTypeId: String(bp.productTypeID ?? bp.productTypeId),
        productName: bp.productName,
        productKind: bp.productKind,
        quantity: Number(bp.quantity || 1),
        time: Number(bp.time || 60),
        materials: bp.materials || [],
        raw: bp,
        source: 'default-seed'
      } },
      upsert: true
    }
  }));
  if (blueprints.length) await SdeBlueprint.bulkWrite(blueprints, { ordered: false });

  await seedNpcMarketOrders();
  return {
    types: types.length,
    systems: systems.length,
    blueprints: blueprints.length,
    groups: groups.length,
    categories: categories.length
  };
}

export async function seedNpcMarketOrders() {
  const systems = await SdeSystem.find({ hub: true }).lean();
  const hubs = systems.length ? systems : await SdeSystem.find({}).limit(3).lean();
  const types = await SdeType.find({ kind: { $in: ['ship', 'module', 'ore', 'mineral', 'salvage', 'data', 'commodity'] } }).limit(300).lean();
  const ops = [];
  for (const system of hubs) {
    for (const type of types) {
      const sell = marketPrice(type, system, 'sell');
      const buy = marketPrice(type, system, 'buy');
      const qty = type.kind === 'ship' ? 8 : type.kind === 'module' ? 30 : 20000;
      ops.push({ updateOne: { filter: { typeId: type.typeId, systemId: system.systemId, side: 'sell', npc: true }, update: { $set: { typeId: type.typeId, name: type.zh || type.name, systemId: system.systemId, side: 'sell', price: sell, quantity: qty, remaining: qty, npc: true, expiresAt: new Date(Date.now() + 7 * 86400000) } }, upsert: true } });
      ops.push({ updateOne: { filter: { typeId: type.typeId, systemId: system.systemId, side: 'buy', npc: true }, update: { $set: { typeId: type.typeId, name: type.zh || type.name, systemId: system.systemId, side: 'buy', price: buy, quantity: qty * 3, remaining: qty * 3, npc: true, expiresAt: new Date(Date.now() + 7 * 86400000) } }, upsert: true } });
    }
  }
  if (ops.length) await MarketOrder.bulkWrite(ops, { ordered: false });
  return ops.length;
}

export async function ensureCatalogSeeded() {
  const count = await SdeType.estimatedDocumentCount();
  if (count > 0) return { seeded: false, types: count };
  const summary = await seedDefaultSde();
  return { seeded: true, ...summary };
}

export async function getPublicCatalog() {
  const [ships, modules, systems, blueprints, resources] = await Promise.all([
    SdeType.find({ kind: 'ship' }).sort({ tier: 1, basePrice: 1 }).limit(120).lean(),
    SdeType.find({ kind: 'module' }).sort({ tier: 1, basePrice: 1 }).limit(200).lean(),
    SdeSystem.find({}).sort({ security: -1, name: 1 }).limit(300).lean(),
    SdeBlueprint.find({}).sort({ time: 1 }).limit(200).lean(),
    SdeType.find({ kind: { $in: ['ore', 'mineral', 'salvage', 'data', 'commodity', 'item'] } }).sort({ kind: 1, basePrice: 1 }).limit(300).lean()
  ]);
  return { ships, modules, systems, blueprints, resources };
}
