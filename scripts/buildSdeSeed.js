import fs from 'fs';
import path from 'path';
import { getStaticSdeStore } from '../src/services/staticSdeStore.js';
import { deriveDogmaTypeData, initDogmaMapper, dogmaAttributeMap } from '../src/services/dogmaMapper.js';

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

// SDE-sourced ship fitting envelope written into ship.stats (HP/dps/cargo stay curated for balance).
const SHIP_FITTING_KEYS = ['cpu', 'powergrid', 'capacitor', 'calibration', 'turretHardpoints', 'launcherHardpoints'];

// Curated corrections for modules whose hand-authored role/effect keys were wrong, so the engine
// routes their effects correctly (passive->stats, active repair->repairs). Magnitudes stay curated;
// only the role tag and effect KEY names are fixed here. Applied during seed regeneration (idempotent).
const MODULE_FIXUPS = {
  miner_i: { role: 'miner' },
  salvager_i: { role: 'salvager' },
  analyzer_data: { role: 'analyzer' },
  analyzer_relic: { role: 'analyzer' },
  afterburner: { role: 'afterburner' },
  shield_extender: { role: 'shield_extender' },
  shield_booster: { role: 'shield_booster', effects: { shieldBoost: 40 } },
  warp_core: { role: 'warp_stabilizer', renameEffect: { warpStrength: 'warpStability' } },
  nanofiber: { role: 'nanofiber' },
  drone_amp: { role: 'drone' },
  probe_launcher: { role: 'scanner' },
  cargo_rig: { role: 'rig' }
};

// Real SDE charge types tagged with the game's charge groups, so weapons that consume ammo can be rearmed.
const CHARGE_MANIFEST = [
  { typeID: 222, chargeGroup: 'hybrid_charge' },     // Antimatter Charge S
  { typeID: 246, chargeGroup: 'frequency_crystal' }, // Multifrequency S
  { typeID: 183, chargeGroup: 'projectile_ammo' },   // Fusion S
  { typeID: 266, chargeGroup: 'missile_charge' }      // Scourge Rocket
];

function applyModuleFixup(mod) {
  const fix = MODULE_FIXUPS[mod.id];
  if (!fix) return;
  if (fix.role) mod.role = fix.role;
  if (fix.renameEffect && mod.effects) {
    for (const [from, to] of Object.entries(fix.renameEffect)) {
      if (mod.effects[from] !== undefined) { mod.effects[to] = mod.effects[from]; delete mod.effects[from]; }
    }
  }
  if (fix.effects) mod.effects = { ...fix.effects };
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

let shipsMerged = 0, modulesMerged = 0, oresMerged = 0, systemsMerged = 0, blueprintsMerged = 0, chargesMerged = 0, skipped = 0;
let moduleEffectsSde = 0, moduleEffectsGameLayer = 0;

// Effect keys that EVE's dogma does not express as a single module attribute (idle-game mechanics);
// kept from the curated seed and flagged as game-layer rather than faked from SDE.
const GAME_LAYER_EFFECTS = dogmaAttributeMap().gameLayerEffects || [];

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
  // SDE-source the fitting envelope (cpu/pg/capacitor/calibration/hardpoints), slots and resists when
  // real dogma exists; keep curated HP/dps/cargo balance. Without dogma, leave the curated ship untouched.
  if (dogma && derived.stats) {
    ship.stats = { ...(ship.stats || {}) };
    for (const key of SHIP_FITTING_KEYS) {
      const v = Number(derived.stats[key]);
      if (Number.isFinite(v)) ship.stats[key] = v;
    }
    if (derived.stats.resists) ship.stats.resists = derived.stats.resists;
    if (derived.slots) ship.slots = { ...(ship.slots || {}), ...derived.slots };
  }
  shipsMerged += 1;
}

for (const mod of seed.modules || []) {
  const id = sdeIdOf(mod);
  const raw = types.get(id);
  const dogma = await store.getTypeDogma(id);
  // Fix curated role/effect-key defects first (so the engine routes effects correctly), with or without SDE.
  applyModuleFixup(mod);
  if (!raw && !dogma) { skipped += 1; continue; }
  const derived = deriveDogmaTypeData({ type: { ...mod, name: mod.name, groupName: mod.group, marketGroupName: mod.marketGroup }, raw: dogma || raw || {}, kind: 'module', tier: deriveTier(mod) });
  // SDE-source the fitting cost (cpu/powergrid/calibration) and the effect magnitudes.
  if (dogma) {
    if (Number.isFinite(Number(derived.cpu))) mod.cpu = Number(derived.cpu);
    if (Number.isFinite(Number(derived.powergrid))) mod.powergrid = Number(derived.powergrid);
    if (Number.isFinite(Number(derived.calibration))) mod.calibration = Number(derived.calibration);
    // Effects from SDE × scale; retain only flagged game-layer keys from the curated seed.
    // If SDE expresses no mappable effect (e.g. rigs), keep curated effects as a game-layer fallback.
    const sdeEffects = derived.effects || {};
    if (Object.keys(sdeEffects).length) {
      const curated = mod.effects || {};
      const kept = {};
      for (const key of GAME_LAYER_EFFECTS) if (curated[key] !== undefined) kept[key] = curated[key];
      mod.effects = { ...kept, ...sdeEffects };
      mod.effectSource = 'sde';
      moduleEffectsSde += 1;
    } else {
      mod.effectSource = 'game-layer';
      moduleEffectsGameLayer += 1;
    }
  } else {
    mod.effectSource = 'game-layer';
    moduleEffectsGameLayer += 1;
  }
  if (!mod.slot && derived.slot) mod.slot = derived.slot;
  if (!mod.role && derived.role) mod.role = derived.role;
  modulesMerged += 1;
}

// Buyable ammo: append real SDE charge types (name/volume/basePrice from SDE) tagged with charge groups.
seed.items = (seed.items || []).filter(it => it.source !== 'sde-charge');
for (const c of CHARGE_MANIFEST) {
  const t = types.get(String(c.typeID));
  if (!t) continue;
  const nm = t.name && typeof t.name === 'object' ? t.name : { en: t.name };
  seed.items.push({
    id: `charge_${c.typeID}`,
    typeID: c.typeID,
    name: nm.en || `Charge ${c.typeID}`,
    zh: nm.zh || nm.en || `Charge ${c.typeID}`,
    kind: 'charge',
    chargeGroup: c.chargeGroup,
    group: String(t.groupID || ''),
    category: 'Charge',
    volume: Number(t.volume || 0.01),
    basePrice: Number(t.basePrice || 100),
    tier: 1,
    source: 'sde-charge'
  });
  chargesMerged += 1;
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
  merged: { ships: shipsMerged, modules: modulesMerged, ores: oresMerged, systems: systemsMerged, blueprints: blueprintsMerged, charges: chargesMerged },
  moduleEffects: { sde: moduleEffectsSde, gameLayer: moduleEffectsGameLayer },
  skipped
}, null, 2));
