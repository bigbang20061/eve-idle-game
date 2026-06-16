import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  const out = { ...(raw.attributes || raw.dogmaAttributes || {}) };
  for (const attr of raw.dogmaAttributes || []) {
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

export function deriveDogmaTypeData({ type = {}, raw = {}, kind = type.kind, tier = type.tier || 1 } = {}) {
  const map = dogmaAttributeMap();
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
      salvage: 1 + tier * 0.5
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
    const slot = type.slot || inferSlot(type.name || type.zh, type.marketGroupName);
    const effects = { ...(map.defaults.moduleEffects[slot] || {}) };
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
      effects.dps = Math.max(map.scales.dpsFloor, (rawDamage * mult) / (rof / map.scales.rofMsDivisor));
      effects.damageProfile = Object.fromEntries(Object.entries(damage).filter(([, v]) => v > 0));
    }
    const mining = valueFor(attrs, a.miningAmount);
    if (mining) effects.mining = mining * map.scales.mining;
    const scram = valueFor(attrs, a.warpScrambleStrength);
    if (scram) effects.warpStability = -Math.abs(scram);
    result.slot = slot;
    result.effects = effects;
  }
  return result;
}

export function dogmaUiSummary() {
  const map = dogmaAttributeMap();
  return { version: map.version, attributes: Object.keys(map.attributeAliases || {}), slots: Object.keys(map.slotKeywords || {}) };
}
