import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFittingRules, inferModuleRole } from './fittingSystem.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mappingPath = path.join(root, 'data/sde/dogma_mapping.json');
let cached;

export function dogmaAttributeMap() {
  if (!cached) cached = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  return cached;
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
    const key = attr.attributeName || attr.name || attr.attributeID || attr.attributeId;
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
      calibration: fitting.shipDefaults.calibration
    };
    const slots = {
      high: Math.max(1, Math.round(valueFor(attrs, a.highSlots) ?? map.defaults.slots.high)),
      mid: Math.max(1, Math.round(valueFor(attrs, a.midSlots) ?? map.defaults.slots.mid)),
      low: Math.max(0, Math.round(valueFor(attrs, a.lowSlots) ?? map.defaults.slots.low)),
      rig: map.defaults.slots.rig
    };
    result.stats = stats;
    result.slots = slots;
    result.role = inferRole(type.name || type.zh, type.groupName);
  }
  if (kind === 'module') {
    const baseEffects = {};
    const damage = {
      em: valueFor(attrs, a.emDamage) || 0,
      thermal: valueFor(attrs, a.thermalDamage) || 0,
      kinetic: valueFor(attrs, a.kineticDamage) || 0,
      explosive: valueFor(attrs, a.explosiveDamage) || 0
    };
    const rawDamage = Object.values(damage).reduce((s, v) => s + v, 0);
    if (rawDamage > 0) {
      const rof = Math.max(1, valueFor(attrs, a.rateOfFire) || 4000);
      const mult = Math.max(1, valueFor(attrs, a.damageMultiplier) || 1);
      baseEffects.dps = Math.max(map.scales.dpsFloor, (rawDamage * mult) / (rof / map.scales.rofMsDivisor));
      baseEffects.damageProfile = Object.fromEntries(Object.entries(damage).filter(([, v]) => v > 0));
    }
    const mining = valueFor(attrs, a.miningAmount);
    if (mining) baseEffects.mining = mining * map.scales.mining;
    putIfNumber(baseEffects, 'shieldBoost', valueFor(attrs, a.shieldBoost));
    putIfNumber(baseEffects, 'armorRepair', valueFor(attrs, a.armorRepair));
    putIfNumber(baseEffects, 'shield', valueFor(attrs, a.shieldBonus));
    putIfNumber(baseEffects, 'armor', valueFor(attrs, a.armorBonus));
    putIfNumber(baseEffects, 'cargo', valueFor(attrs, a.cargoBonus));
    const scram = valueFor(attrs, a.warpScrambleStrength);
    if (scram) baseEffects.warpStability = -Math.abs(scram);
    const role = inferModuleRole({ ...type, raw, effects: baseEffects });
    const roleDef = roleConfig(role);
    const slot = type.slot || roleDef.slot || inferSlot(type.name || type.zh, type.marketGroupName);
    const mode = roleDef.mode || 'passive';
    const passiveEffects = mode === 'passive' ? { ...(map.defaults.moduleEffects[slot] || {}), ...baseEffects } : {};
    const activeEffects = mode === 'passive' ? {} : { ...(map.defaults.moduleEffects[slot] || {}), ...baseEffects };
    result.slot = slot;
    result.role = role;
    result.mode = mode;
    result.cpu = valueFor(attrs, a.cpuUsage) ?? fitting.moduleDefaultsBySlot?.[slot]?.cpu ?? 0;
    result.powergrid = valueFor(attrs, a.powergridUsage) ?? fitting.moduleDefaultsBySlot?.[slot]?.powergrid ?? 0;
    result.calibration = valueFor(attrs, a.calibrationUsage) ?? fitting.moduleDefaultsBySlot?.[slot]?.calibration ?? 0;
    result.requirements = { skills: roleDef.requiredSkills || {}, hardpoint: roleDef.hardpoint };
    result.passiveEffects = passiveEffects;
    result.activeEffects = activeEffects;
    result.effects = { ...passiveEffects, ...activeEffects };
    result.activation = { ...(roleDef.activation || {}), mode };
    if (roleDef.activation?.chargeGroup) result.chargeGroup = roleDef.activation.chargeGroup;
  }
  return result;
}

export function dogmaUiSummary() {
  const map = dogmaAttributeMap();
  return { version: map.version, attributes: Object.keys(map.attributeAliases || {}), slots: Object.keys(map.slotKeywords || {}) };
}
