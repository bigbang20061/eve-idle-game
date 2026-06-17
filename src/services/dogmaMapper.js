import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFittingRules, inferModuleRole } from './fittingSystem.js';
import { getStaticSdeStore } from './staticSdeStore.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mappingPath = path.join(root, 'data/sde/dogma_mapping.json');
let cached;
let attrIdToName = null;

export function dogmaAttributeMap() {
  if (!cached) cached = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  return cached;
}

export async function initDogmaMapper() {
  if (attrIdToName) return;
  const store = getStaticSdeStore();
  const attrs = await store.loadCollection('dogmaAttributes');
  attrIdToName = {};
  for (const [id, a] of attrs) {
    if (a?.name) attrIdToName[String(id)] = a.name;
  }
}

export function defaultResists() {
  const layer = () => ({ em: 0, thermal: 0, kinetic: 0, explosive: 0 });
  return { shield: layer(), armor: layer(), hull: layer() };
}

function resistFrom(attrs, aliases) {
  const resonance = valueFor(attrs, aliases);
  if (resonance === undefined) return undefined;
  return Math.max(0, Math.min(0.9, 1 - resonance));
}

function valueFor(attrs, aliases) {
  for (const alias of aliases || []) {
    const v = attrs?.[alias];
    if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function extractAttributes(raw = {}) {
  const out = { ...(raw.attributes || {}) };
  if (!Array.isArray(raw.dogmaAttributes) && raw.dogmaAttributes && typeof raw.dogmaAttributes === 'object') {
    Object.assign(out, raw.dogmaAttributes);
  }
  const dogmaAttributes = Array.isArray(raw.dogmaAttributes) ? raw.dogmaAttributes : [];
  for (const attr of dogmaAttributes) {
    const id = attr.attributeID ?? attr.attributeId;
    const resolved = id !== undefined && attrIdToName ? attrIdToName[String(id)] : undefined;
    const key = attr.attributeName || attr.name || resolved || id;
    const value = attr.value ?? attr.defaultValue;
    if (key !== undefined && value !== undefined) out[String(key)] = value;
  }
  return out;
}

function inferSlot(name, marketGroupName = '') {
  const map = dogmaAttributeMap();
  const hay = `${name || ''} ${marketGroupName || ''}`.toLowerCase();
  for (const [slot, words] of Object.entries(map.slotKeywords || {})) {
    if (words.some(w => hay.includes(String(w).toLowerCase()))) return slot;
  }
  return 'high';
}

function inferRole(name, groupName = '') {
  const map = dogmaAttributeMap();
  const hay = `${name || ''} ${groupName || ''}`.toLowerCase();
  for (const [role, words] of Object.entries(map.roleKeywords || {})) {
    if (words.some(w => hay.includes(String(w).toLowerCase()))) return role;
  }
  return 'general';
}

function roleConfig(role) {
  const rules = getFittingRules();
  return rules.moduleRoles?.[role] || rules.moduleRoles?.general || { slot: 'high', mode: 'passive' };
}

function putIfNumber(out, key, value) {
  if (value !== undefined && Number.isFinite(Number(value))) out[key] = Number(value);
}

function round2(v) { return Math.round(Number(v) * 100) / 100; }

function applyTransform(value, transform) {
  const v = Number(value);
  if (!Number.isFinite(v)) return undefined;
  if (transform === 'abs') return Math.abs(v);
  if (transform === 'multiplierDelta') return v - 1;
  return v; // linear
}

// Build a module's gameplay effects purely from real SDE dogma attributes × a config scale.
// Magnitudes come from SDE; only the unit-conversion scale lives in dogma_mapping.effectDerivations.
export function deriveModuleEffects(attrs = {}, map = dogmaAttributeMap()) {
  const effects = {};
  for (const d of map.effectDerivations || []) {
    const raw = valueFor(attrs, d.attrs);
    if (raw === undefined) continue;
    const transformed = applyTransform(raw, d.transform);
    if (transformed === undefined) continue;
    const amount = transformed * Number(d.scale ?? 1);
    if (!amount) continue;
    effects[d.effect] = round2(Number(effects[d.effect] || 0) + amount);
  }
  return effects;
}

export function deriveDogmaTypeData({ type = {}, raw = {}, kind = type.kind, tier = type.tier || 1 } = {}) {
  const map = dogmaAttributeMap();
  const fitting = getFittingRules();
  const attrs = extractAttributes(raw);
  const a = map.attributeAliases;
  const result = { dogma: { mappingVersion: map.version, attributes: attrs } };
  if (kind === 'ship') {
    const d = map.defaults.ship;
    const stats = {
      shield: valueFor(attrs, a.shield) ?? d.shield + tier * 28,
      armor: valueFor(attrs, a.armor) ?? d.armor + tier * 22,
      hull: valueFor(attrs, a.hull) ?? d.hull + tier * 24,
      cargo: valueFor(attrs, a.capacity) ?? Number(type.capacity || d.cargo + tier * 18),
      scan: Math.max(1, Math.round((valueFor(attrs, a.scan) ?? 120) * map.scales.scan)),
      extract: d.extract,
      warpStability: 0,
      dps: d.dps + tier * 2,
      mining: d.mining,
      hack: 2 + tier,
      salvage: 1 + tier * 0.5,
      cpu: valueFor(attrs, a.cpu) ?? fitting.shipDefaults.cpu,
      powergrid: valueFor(attrs, a.powergrid) ?? fitting.shipDefaults.powergrid,
      capacitor: valueFor(attrs, a.capacitor) ?? fitting.shipDefaults.capacitor,
      turretHardpoints: valueFor(attrs, a.turretSlots) ?? fitting.shipDefaults.turretHardpoints,
      launcherHardpoints: valueFor(attrs, a.launcherSlots) ?? fitting.shipDefaults.launcherHardpoints,
      calibration: valueFor(attrs, a.calibrationCapacity) ?? fitting.shipDefaults.calibration
    };
    const slots = {
      high: Math.max(1, Math.round(valueFor(attrs, a.highSlots) ?? map.defaults.slots.high)),
      mid: Math.max(1, Math.round(valueFor(attrs, a.midSlots) ?? map.defaults.slots.mid)),
      low: Math.max(0, Math.round(valueFor(attrs, a.lowSlots) ?? map.defaults.slots.low)),
      rig: map.defaults.slots.rig
    };
    const resists = defaultResists();
    for (const layer of ['shield', 'armor']) {
      for (const dmg of ['Em', 'Thermal', 'Kinetic', 'Explosive']) {
        const r = resistFrom(attrs, a[`${layer}${dmg}Resonance`]);
        if (r !== undefined) resists[layer][dmg.toLowerCase()] = r;
      }
    }
    resists.hull = { em: 0.33, thermal: 0.33, kinetic: 0.33, explosive: 0.33 };
    stats.resists = resists;
    result.stats = stats;
    result.slots = slots;
    result.role = inferRole(type.name || type.zh, type.groupName);
  }
  if (kind === 'module') {
    // Effects are derived purely from SDE attributes × config scale (no slot-default injection).
    const baseEffects = deriveModuleEffects(attrs, map);
    const role = inferModuleRole({ ...type, raw, effects: baseEffects });
    const roleDef = roleConfig(role);
    const slot = type.slot || roleDef.slot || inferSlot(type.name || type.zh, type.marketGroupName);
    const mode = roleDef.mode || 'passive';
    result.slot = slot;
    result.role = role;
    result.mode = mode;
    result.cpu = valueFor(attrs, a.cpuUsage) ?? fitting.moduleDefaultsBySlot?.[slot]?.cpu ?? 0;
    result.powergrid = valueFor(attrs, a.powergridUsage) ?? fitting.moduleDefaultsBySlot?.[slot]?.powergrid ?? 0;
    result.calibration = valueFor(attrs, a.calibrationUsage) ?? fitting.moduleDefaultsBySlot?.[slot]?.calibration ?? 0;
    result.requirements = { skills: roleDef.requiredSkills || {}, hardpoint: roleDef.hardpoint };
    result.passiveEffects = mode === 'passive' ? baseEffects : {};
    result.activeEffects = mode === 'passive' ? {} : baseEffects;
    result.effects = baseEffects;
    result.activation = { ...(roleDef.activation || {}), mode };
    if (roleDef.activation?.chargeGroup) result.chargeGroup = roleDef.activation.chargeGroup;
  }
  return result;
}

export function dogmaUiSummary() {
  const map = dogmaAttributeMap();
  return { version: map.version, attributes: Object.keys(map.attributeAliases || {}), slots: Object.keys(map.slotKeywords || {}) };
}
