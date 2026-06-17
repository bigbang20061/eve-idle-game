import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { SdeType, SdeGroup, SdeCategory, SdeMarketGroup, SdeSystem, SdeBlueprint } from '../models/index.js';
import { inferKindFromNames, seedNpcMarketOrders } from './catalog.js';
import { hashString } from './formulas.js';
import { deriveDogmaTypeData, initDogmaMapper } from './dogmaMapper.js';

function asId(value) {
  return value === undefined || value === null ? '' : String(value);
}

function localizedName(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  return raw.zh || raw['zh-cn'] || raw.zh_cn || raw.en || raw['en-us'] || raw.en_us || raw.de || raw.fr || Object.values(raw).find(v => typeof v === 'string') || '';
}

function englishName(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  return raw.en || raw['en-us'] || raw.en_us || raw.zh || raw['zh-cn'] || Object.values(raw).find(v => typeof v === 'string') || '';
}

async function readJsonl(filePath, onRecord, { limit = 0, logEvery = 50000 } = {}) {
  if (!fs.existsSync(filePath)) return { filePath, read: 0, skipped: true };
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let read = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      await onRecord(obj, read);
      read += 1;
      if (limit && read >= limit) break;
      if (logEvery && read % logEvery === 0) console.log(`[SDE] ${path.basename(filePath)} ${read}`);
    } catch (error) {
      console.warn(`[SDE] bad line in ${filePath}: ${error.message}`);
    }
  }
  return { filePath, read, skipped: false };
}

async function bulkInBatches(model, ops, batchSize = 1000) {
  let written = 0;
  for (let i = 0; i < ops.length; i += batchSize) {
    const batch = ops.slice(i, i + batchSize);
    if (!batch.length) continue;
    await model.bulkWrite(batch, { ordered: false });
    written += batch.length;
  }
  return written;
}

async function importCategories(dir, { limit = 0 } = {}) {
  const ops = [];
  await readJsonl(path.join(dir, 'categories.jsonl'), obj => {
    const categoryId = asId(obj._key ?? obj.categoryID ?? obj.categoryId);
    if (!categoryId) return;
    const name = englishName(obj.name || obj.nameID || obj._value?.name);
    ops.push({ updateOne: { filter: { categoryId }, update: { $set: { categoryId, name, zh: localizedName(obj.name || obj.nameID), raw: obj, source: 'sde-jsonl' } }, upsert: true } });
  }, { limit });
  return bulkInBatches(SdeCategory, ops);
}

async function importGroups(dir, { limit = 0 } = {}) {
  const ops = [];
  await readJsonl(path.join(dir, 'groups.jsonl'), obj => {
    const groupId = asId(obj._key ?? obj.groupID ?? obj.groupId);
    if (!groupId) return;
    const name = englishName(obj.name || obj.nameID || obj._value?.name);
    ops.push({ updateOne: { filter: { groupId }, update: { $set: { groupId, name, zh: localizedName(obj.name || obj.nameID), categoryId: asId(obj.categoryID || obj.categoryId), raw: obj, source: 'sde-jsonl' } }, upsert: true } });
  }, { limit });
  return bulkInBatches(SdeGroup, ops);
}

async function importMarketGroups(dir, { limit = 0 } = {}) {
  const ops = [];
  await readJsonl(path.join(dir, 'marketGroups.jsonl'), obj => {
    const marketGroupId = asId(obj._key ?? obj.marketGroupID ?? obj.marketGroupId);
    if (!marketGroupId) return;
    const name = englishName(obj.name || obj.nameID || obj._value?.name);
    ops.push({ updateOne: { filter: { marketGroupId }, update: { $set: { marketGroupId, name, zh: localizedName(obj.name || obj.nameID), parentGroupId: asId(obj.parentGroupID || obj.parentGroupId), raw: obj, source: 'sde-jsonl' } }, upsert: true } });
  }, { limit });
  return bulkInBatches(SdeMarketGroup, ops);
}

async function importSystems(dir, { limit = 0 } = {}) {
  const ops = [];
  await readJsonl(path.join(dir, 'mapSolarSystems.jsonl'), obj => {
    const systemId = asId(obj._key ?? obj.solarSystemID ?? obj.solarSystemId ?? obj.systemID);
    if (!systemId) return;
    const sec = Number(obj.securityStatus ?? obj.security ?? 0.5);
    const x = Number(obj.center?.[0] ?? obj.position?.x ?? obj.x ?? (hashString(systemId) % 100));
    const y = Number(obj.center?.[1] ?? obj.position?.y ?? obj.y ?? (hashString(`${systemId}:y`) % 100));
    const z = Number(obj.center?.[2] ?? obj.position?.z ?? obj.z ?? 0);
    const name = englishName(obj.name || obj.solarSystemName || obj._value?.name) || `System ${systemId}`;
    ops.push({ updateOne: { filter: { systemId }, update: { $set: {
      systemId,
      name,
      zh: localizedName(obj.name) || name,
      regionId: asId(obj.regionID || obj.regionId),
      constellationId: asId(obj.constellationID || obj.constellationId),
      security: sec,
      x,
      y,
      z,
      richness: Math.max(0.35, Math.min(2.8, 1.38 - sec * 0.42 + ((hashString(`${systemId}:rich`) % 100) / 400))),
      danger: Math.max(0.03, Math.min(1.25, 0.88 - sec + ((hashString(`${systemId}:danger`) % 100) / 500))),
      hub: ['Jita', 'Amarr', 'Dodixie', 'Rens', 'Hek'].includes(name),
      kind: sec >= 0.75 ? 'high' : sec >= 0.45 ? 'low' : sec >= 0.05 ? 'null' : 'wormhole',
      raw: obj,
      source: 'sde-jsonl'
    } }, upsert: true } });
  }, { limit });
  return bulkInBatches(SdeSystem, ops);
}

function attributeMap(obj) {
  const map = {};
  const attrs = obj.dogmaAttributes || obj.attributes || [];
  if (Array.isArray(attrs)) {
    for (const attr of attrs) {
      const id = String(attr.attributeID ?? attr.attributeId ?? attr.attribute_id ?? attr._key ?? '');
      if (id) map[id] = Number(attr.value ?? attr._value ?? attr.defaultValue ?? 0);
    }
  }
  return map;
}

function effectsFromType(type, kind) {
  const group = `${type.groupName || ''} ${type.marketGroupName || ''} ${type.name || ''}`.toLowerCase();
  if (kind !== 'module') return {};
  if (/miner|mining/.test(group)) return { mining: Math.round(6 + type.tier * 3) };
  if (/launcher|turret|weapon|blaster|railgun|laser|cannon|missile/.test(group)) return { dps: Math.round(5 + type.tier * 4) };
  if (/shield/.test(group)) return { shield: Math.round(25 + type.tier * 25) };
  if (/armor/.test(group)) return { armor: Math.round(20 + type.tier * 22) };
  if (/afterburner|microwarp|propulsion/.test(group)) return { extract: Math.round(2 + type.tier * 2) };
  if (/scanner|probe|analyzer/.test(group)) return { scan: Math.round(4 + type.tier * 3), hack: Math.round(2 + type.tier * 2) };
  if (/salvager|tractor/.test(group)) return { salvage: Math.round(5 + type.tier * 3) };
  if (/stabilizer|warp core/.test(group)) return { warpStability: 1 };
  return { utility: type.tier };
}

function deriveShipStats(obj, attr, tier) {
  const capacity = Number(obj.capacity ?? attr['38'] ?? 120);
  const mass = Number(obj.mass ?? attr['4'] ?? 1000000);
  const shield = Number(attr['263'] || attr['552'] || 80 + tier * 45);
  const armor = Number(attr['265'] || 60 + tier * 36);
  const hull = Number(attr['9'] || 70 + tier * 38);
  const sizeBonus = mass > 10000000 ? 2 : mass > 2000000 ? 1.3 : 1;
  return {
    shield: Math.round(shield),
    armor: Math.round(armor),
    hull: Math.round(hull),
    dps: Math.round(5 + tier * 5 * sizeBonus),
    mining: /mining|venture|barge|exhumer/i.test(`${obj.name} ${obj.groupName}`) ? Math.round(8 + tier * 6) : Math.round(tier),
    hack: /exploration|covert|frigate|astero/i.test(`${obj.name} ${obj.groupName}`) ? Math.round(5 + tier * 2) : Math.round(tier),
    scan: /exploration|covert|frigate|scanner/i.test(`${obj.name} ${obj.groupName}`) ? Math.round(6 + tier * 2) : Math.round(2 + tier),
    salvage: Math.round(1 + tier),
    cargo: Math.max(60, Math.round(capacity || 120)),
    oreHold: /mining|barge|exhumer|industrial/i.test(`${obj.name} ${obj.groupName}`) ? Math.round(1000 + tier * 1500) : 0,
    extract: Math.round(3 + tier * 1.2),
    warpStability: /industrial|hauler|transport/i.test(`${obj.name} ${obj.groupName}`) ? 1 : 0
  };
}

async function loadTypeDogmaMap(dir) {
  const map = new Map();
  await readJsonl(path.join(dir, 'type-dogma.jsonl'), obj => {
    const typeId = asId(obj._key ?? obj.typeID ?? obj.typeId);
    if (typeId) map.set(typeId, obj);
  });
  return map;
}

async function loadTypeMaterialsMap(dir) {
  const map = new Map();
  await readJsonl(path.join(dir, 'typeMaterials.jsonl'), obj => {
    const typeId = asId(obj._key ?? obj.typeID ?? obj.typeId);
    const materials = obj.materials || obj._value?.materials || [];
    if (typeId && Array.isArray(materials)) map.set(typeId, materials);
  });
  return map;
}

async function importTypes(dir, { limit = 0 } = {}) {
  await initDogmaMapper();
  const groups = await SdeGroup.find({}).lean();
  const categories = await SdeCategory.find({}).lean();
  const marketGroups = await SdeMarketGroup.find({}).lean();
  const groupById = new Map(groups.map(g => [String(g.groupId), g]));
  const catById = new Map(categories.map(c => [String(c.categoryId), c]));
  const mgById = new Map(marketGroups.map(m => [String(m.marketGroupId), m]));
  const typeDogmaById = await loadTypeDogmaMap(dir);
  const typeMaterialsById = await loadTypeMaterialsMap(dir);
  const ops = [];
  await readJsonl(path.join(dir, 'types.jsonl'), obj => {
    const typeId = asId(obj._key ?? obj.typeID ?? obj.typeId);
    if (!typeId) return;
    const groupId = asId(obj.groupID ?? obj.groupId);
    const marketGroupId = asId(obj.marketGroupID ?? obj.marketGroupId);
    const group = groupById.get(groupId);
    const category = catById.get(String(group?.categoryId || obj.categoryID || ''));
    const marketGroup = mgById.get(marketGroupId);
    const name = englishName(obj.name || obj.nameID || obj._value?.name) || `Type ${typeId}`;
    const zh = localizedName(obj.name || obj.nameID) || name;
    const basePrice = Number(obj.basePrice ?? obj.price ?? obj.cost ?? 10);
    const tier = Math.max(1, Math.min(10, Math.ceil(Math.log10(Math.max(10, basePrice)) - 1)));
    const kind = inferKindFromNames(group?.name, category?.name, `${marketGroup?.name || ''} ${name}`);
    const attributes = attributeMap(obj);
    const type = {
      typeId,
      name,
      zh,
      description: localizedName(obj.description || obj.descriptionID),
      groupId,
      groupName: group?.name || '',
      categoryId: category?.categoryId || '',
      categoryName: category?.name || '',
      marketGroupId,
      marketGroupName: marketGroup?.name || '',
      kind,
      published: Boolean(obj.published),
      volume: Number(obj.volume ?? (kind === 'ship' ? 2500 : 0.01)),
      capacity: Number(obj.capacity ?? attributes['38'] ?? 0),
      mass: Number(obj.mass ?? attributes['4'] ?? 0),
      basePrice,
      rarity: Math.max(1, Math.min(10, tier + (hashString(typeId) % 3) / 2)),
      tier,
      attributes,
      source: 'sde-jsonl',
      raw: obj
    };
    const dogmaRaw = typeDogmaById.get(typeId) || obj;
    const hasDogma = Array.isArray(dogmaRaw.dogmaAttributes) && dogmaRaw.dogmaAttributes.length > 0;
    if ((kind === 'ship' || kind === 'module') && hasDogma) {
      const derived = deriveDogmaTypeData({ type, raw: dogmaRaw, kind, tier });
      if (derived.stats) type.stats = derived.stats;
      if (derived.slots) type.slots = derived.slots;
      if (derived.dogma) type.dogma = derived.dogma;
      if (derived.effects) type.effects = derived.effects;
      if (derived.slot) type.slot = derived.slot;
      if (derived.role) type.role = derived.role;
    } else {
      type.stats = kind === 'ship' ? deriveShipStats(type, attributes, tier) : {};
      type.effects = effectsFromType(type, kind);
      if (kind === 'module') {
        const text = `${type.groupName} ${type.marketGroupName} ${type.name}`.toLowerCase();
        type.slot = /rig/.test(text) ? 'rig' : /armor|damage control|stabilizer/.test(text) ? 'low' : /shield|scanner|analyzer|afterburner|propulsion/.test(text) ? 'mid' : 'high';
      }
    }
    const materials = typeMaterialsById.get(typeId);
    if (Array.isArray(materials) && materials.length) {
      type.materials = materials.map(m => ({ typeId: asId(m.materialTypeID ?? m.typeID ?? m.typeId), name: asId(m.name), quantity: Number(m.quantity || 0) })).filter(m => m.typeId && m.quantity > 0);
      type.portionSize = Number(obj.portionSize ?? attributes['1281'] ?? 1) || 1;
    }
    ops.push({ updateOne: { filter: { typeId }, update: { $set: type }, upsert: true } });
  }, { limit, logEvery: 25000 });
  return bulkInBatches(SdeType, ops);
}

async function importBlueprints(dir, { limit = 0 } = {}) {
  const typeById = new Map((await SdeType.find({}).select('typeId name zh kind').lean()).map(t => [String(t.typeId), t]));
  const ops = [];
  await readJsonl(path.join(dir, 'blueprints.jsonl'), obj => {
    const blueprintTypeId = asId(obj._key ?? obj.blueprintTypeID ?? obj.blueprintTypeId);
    if (!blueprintTypeId) return;
    const manufacturing = obj.activities?.manufacturing || obj.manufacturing || obj._value?.activities?.manufacturing;
    const product = Array.isArray(manufacturing?.products) ? manufacturing.products[0] : null;
    if (!product?.typeID && !product?.typeId) return;
    const productTypeId = asId(product.typeID ?? product.typeId);
    const productType = typeById.get(productTypeId);
    const materials = (manufacturing.materials || []).map(m => {
      const typeId = asId(m.typeID ?? m.typeId);
      const type = typeById.get(typeId);
      return { typeId, name: type?.zh || type?.name || typeId, quantity: Number(m.quantity || 0) };
    }).filter(m => m.typeId && m.quantity > 0);
    const bpType = typeById.get(blueprintTypeId);
    ops.push({ updateOne: { filter: { blueprintTypeId }, update: { $set: {
      blueprintTypeId,
      name: bpType?.name || `Blueprint ${blueprintTypeId}`,
      zh: bpType?.zh || bpType?.name || `蓝图 ${blueprintTypeId}`,
      productTypeId,
      productName: productType?.zh || productType?.name || productTypeId,
      productKind: productType?.kind || 'item',
      quantity: Number(product.quantity || 1),
      time: Number(manufacturing.time || 60),
      materials,
      raw: obj,
      source: 'sde-jsonl'
    } }, upsert: true } });
  }, { limit, logEvery: 20000 });
  return bulkInBatches(SdeBlueprint, ops);
}

export async function importSdeDirectory(dir, options = {}) {
  const absolute = path.resolve(dir);
  const summary = { dir: absolute };
  summary.categories = await importCategories(absolute, options);
  summary.groups = await importGroups(absolute, options);
  summary.marketGroups = await importMarketGroups(absolute, options);
  summary.systems = await importSystems(absolute, options);
  summary.types = await importTypes(absolute, options);
  summary.blueprints = await importBlueprints(absolute, options);
  summary.npcOrders = await seedNpcMarketOrders();
  return summary;
}
