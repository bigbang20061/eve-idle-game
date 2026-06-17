import fs from 'fs';
import path from 'path';
import { getStaticSdeStore } from '../src/services/staticSdeStore.js';
import { deriveDogmaTypeData, initDogmaMapper } from '../src/services/dogmaMapper.js';

const sourceDir = process.env.SDE_STATIC_DIR || process.env.SDE_DIR || './sde/yaml';
const seedPath = process.env.SDE_SEED_OUT || './data/default_sde_seed.json';
const store = getStaticSdeStore({ sourceDir });

function sdeIdOf(value) {
  return String(value?.typeID ?? value?.typeId ?? value?.id ?? '');
}

function nameFor(types, typeId) {
  const t = types.get(String(typeId));
  return t?.zh || t?.name || String(typeId);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const [types, typeMaterials, systems] = await Promise.all([
  store.loadCollection('types'),
  store.loadCollection('typeMaterials'),
  store.loadCollection('mapSolarSystems')
]);
if (!types.size) throw new Error(`SDE/cache unavailable (0 types from ${store.sourceDir}); refusing to overwrite seed`);
// Build + load the hot cache so store.getTypeDogma() can resolve dogma per type.
await store.preloadHotData({ allowBuild: true });
await initDogmaMapper();

let shipsMerged = 0, modulesMerged = 0, oresMerged = 0, systemsMerged = 0, blueprintsMerged = 0, skipped = 0;

function deriveTier(entry) {
  if (entry.tier) return Number(entry.tier);
  const price = Number(entry.basePrice || entry.baseValue || entry.cost || 0);
  if (price <= 1000) return 1;
  if (price <= 20000) return 2;
  if (price <= 500000) return 3;
  if (price <= 5000000) return 4;
  return 5;
}

for (const ship of seed.ships || []) {
  const id = sdeIdOf(ship);
  const raw = types.get(id);
  const dogma = await store.getTypeDogma(id);
  if (!raw && !dogma) { skipped += 1; continue; }
  const derived = deriveDogmaTypeData({ type: { ...ship, name: ship.name, groupName: ship.group || ship.class }, raw: dogma || raw || {}, kind: 'ship', tier: deriveTier(ship) });
  // Additive only: graft SDE-derived resists onto the curated ship; keep curated HP/dps/cargo balance.
  if (derived.stats?.resists) ship.stats = { ...(ship.stats || {}), resists: derived.stats.resists };
  if (!ship.slots && derived.slots) ship.slots = derived.slots;
  shipsMerged += 1;
}

for (const mod of seed.modules || []) {
  const id = sdeIdOf(mod);
  const raw = types.get(id);
  const dogma = await store.getTypeDogma(id);
  if (!raw && !dogma) { skipped += 1; continue; }
  const derived = deriveDogmaTypeData({ type: { ...mod, name: mod.name, groupName: mod.group, marketGroupName: mod.marketGroup }, raw: dogma || raw || {}, kind: 'module', tier: deriveTier(mod) });
  // Keep curated module effects (hand-tuned for game balance); only backfill missing slot/role.
  if (!mod.slot && derived.slot) mod.slot = derived.slot;
  if (!mod.role && derived.role) mod.role = derived.role;
  modulesMerged += 1;
}

function attachMaterials(entry) {
  const id = sdeIdOf(entry);
  const raw = types.get(id);
  const matRaw = typeMaterials.get(id);
  if (!matRaw?.materials?.length) return false;
  entry.materials = matRaw.materials
    .map(m => ({ typeId: String(m.materialTypeID ?? m.typeID ?? m.typeId ?? ''), name: nameFor(types, m.materialTypeID ?? m.typeID ?? m.typeId), quantity: Number(m.quantity || 0) }))
    .filter(m => m.typeId && m.quantity > 0);
  entry.portionSize = Number(raw?.portionSize ?? entry.portionSize ?? 1) || 1;
  return true;
}

for (const item of seed.items || []) {
  if (item.kind === 'ore' || /asteroid|ore/i.test(`${item.category || ''} ${item.group || ''}`)) {
    if (attachMaterials(item)) oresMerged += 1;
  }
}

for (const sys of seed.systems || []) {
  const id = String(sys.systemID ?? sys.systemId ?? sys.id ?? '');
  const raw = systems.get(id);
  if (!raw) continue;
  const sec = Number(raw.securityStatus ?? raw.security ?? sys.security ?? 0.5);
  sys.security = Number(sys.security ?? sec);
  if (sys.richness === undefined) sys.richness = Math.max(0.55, 1.35 - sec * 0.35);
  if (sys.danger === undefined) sys.danger = Math.max(0.03, 0.9 - sec);
  systemsMerged += 1;
}

for (const bp of seed.blueprints || []) {
  const productId = String(bp.productTypeID ?? bp.productTypeId ?? '');
  const matRaw = typeMaterials.get(productId);
  if (matRaw?.materials?.length && !(bp.materials || []).length) {
    bp.materials = matRaw.materials.map(m => ({ typeID: String(m.materialTypeID ?? m.typeID ?? ''), quantity: Number(m.quantity || 0) })).filter(m => m.typeID && m.quantity > 0);
  }
  if (bp.materials?.length) blueprintsMerged += 1;
}

fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
console.log(JSON.stringify({
  ok: true,
  sourceDir: store.sourceDir,
  out: path.resolve(seedPath),
  merged: { ships: shipsMerged, modules: modulesMerged, ores: oresMerged, systems: systemsMerged, blueprints: blueprintsMerged },
  skipped
}, null, 2));
