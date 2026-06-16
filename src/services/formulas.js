import crypto from 'crypto';
import { bandForSecurity, labelForActivity, getSiteRules } from './siteRules.js';
import { applySkillEffects } from './skills.js';
import { moduleEffectsForStats } from './fitting.js';

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function nowSeconds() { return Math.floor(Date.now() / 1000); }
export function hashString(input) { const h = crypto.createHash('sha256').update(String(input)).digest(); return h.readUInt32BE(0); }
export function seededRandom(seed) { let x = (hashString(seed) || 1) >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000000) / 1000000; }; }
export function chooseWeighted(items, rng = Math.random) { const total = items.reduce((s, i) => s + Math.max(0, Number(i.weight ?? 1)), 0) || items.length; let roll = rng() * total; for (const item of items) { roll -= Math.max(0, Number(item.weight ?? 1)); if (roll <= 0) return item; } return items[items.length - 1] || null; }
export function cargoVolume(stacks = []) { return stacks.reduce((sum, stack) => sum + Number(stack.quantity || 0) * Number(stack.volume || 0), 0); }
export function mergeStack(stacks, incoming) { const typeId = String(incoming.typeId); const qty = Number(incoming.quantity || 0); if (!Number.isFinite(qty) || qty <= 0) return stacks; const existing = stacks.find(s => String(s.typeId) === typeId && !s.locked); if (existing) { existing.quantity = Number(existing.quantity || 0) + qty; existing.basePrice = incoming.basePrice ?? existing.basePrice; existing.volume = incoming.volume ?? existing.volume; existing.kind = incoming.kind ?? existing.kind; existing.name = incoming.name ?? existing.name; existing.zh = incoming.zh ?? existing.zh; existing.meta = incoming.meta ?? existing.meta; } else stacks.push({ typeId, name: incoming.name, zh: incoming.zh, kind: incoming.kind, quantity: qty, volume: Number(incoming.volume ?? 0.01), basePrice: Number(incoming.basePrice ?? 1), locked: Boolean(incoming.locked), source: incoming.source || 'loot', meta: incoming.meta }); return stacks; }
export function removeStackQuantity(stacks, typeId, quantity) { let need = Number(quantity || 0); for (const stack of stacks) { if (String(stack.typeId) !== String(typeId) || stack.locked || need <= 0) continue; const take = Math.min(Number(stack.quantity || 0), need); stack.quantity -= take; need -= take; } for (let i = stacks.length - 1; i >= 0; i -= 1) if (Number(stacks[i].quantity || 0) <= 0) stacks.splice(i, 1); return quantity - need; }
export function marketPrice(type, system, side = 'sell', date = new Date()) { const day = Math.floor(date.getTime() / 86400000); const base = Math.max(1, Number(type.basePrice || type.baseValue || 10)); const sec = Number(system?.security ?? 0.5); const scarcity = clamp(1.35 - sec * 0.45 + Number(type.rarity || 1) * 0.025, 0.75, 2.2); const rand = seededRandom(`${type.typeId || type.id}:${system?.systemId || system?.id || 'hub'}:${day}`)(); return Math.round(base * scarcity * (0.88 + rand * 0.28) * (side === 'buy' ? 0.92 : 1.08)); }

function addEffects(stats, effects = {}) {
  for (const [key, value] of Object.entries(effects || {})) {
    if (key === 'damageProfile') { stats.damageProfile = value; continue; }
    stats[key] = Number(stats[key] || 0) + Number(value || 0);
  }
  return stats;
}

export function deriveEffectiveStats(character) {
  const shipStats = character.ship?.stats || {};
  const fitting = character.ship?.fitting || {};
  let stats = {
    shield: Number(shipStats.shield || 100), armor: Number(shipStats.armor || 70), hull: Number(shipStats.hull || 80),
    dps: Number(shipStats.dps || 6), mining: Number(shipStats.mining || 5), scan: Number(shipStats.scan || 4), hack: Number(shipStats.hack || 2), salvage: Number(shipStats.salvage || 1),
    cargo: Number(shipStats.cargo || 150), oreHold: Number(shipStats.oreHold || 0), extract: Number(shipStats.extract || 4), warpStability: Number(shipStats.warpStability || 0),
    capacitor: Number(shipStats.capacitor || 180), capacitorRecharge: Number(shipStats.capacitorRecharge || 2.4),
    fittingCpu: Number(fitting.cpu || 0), fittingPowergrid: Number(fitting.powergrid || 0),
    trade: 1, industry: 1, turretDamage: 1, launcherDamage: 1, droneDamage: 1, propulsionBoost: 1, shieldBoost: 1, armorRepair: 1, activeModuleCapCost: 1, skillpointGain: 1
  };
  stats = applySkillEffects(stats, character);
  stats = addEffects(stats, moduleEffectsForStats(character, stats));
  stats.extract *= Number(stats.propulsionBoost || 1);
  return stats;
}

export function systemBand(system) { return bandForSecurity(system?.security).id; }
export function siteTemplate(activity, system, character, rng = Math.random) { const rules = getSiteRules(); const f = rules.formula; const band = bandForSecurity(system?.security); const sec = Number(system?.security ?? 0.5); const risk = Number(character.autopilot?.risk ?? 0.35); const tier = clamp(Math.ceil((1 - sec) * f.tier.securityWeight + risk * f.tier.riskWeight + rng() * f.tier.randomWeight), f.tier.min, f.tier.max); const baseDanger = Number(system?.danger ?? clamp(0.9 - sec, 0.05, 0.95)); const richnessBase = Number(system?.richness ?? (f.richness.base + sec * f.richness.securityWeight)); return { id: `${activity}-${Date.now()}-${Math.floor(rng() * 100000)}`, name: labelForActivity(activity, tier, rng), activity, band: band.id, tier, danger: clamp(baseDanger + band.dangerBonus + tier * f.danger.tierWeight + risk * f.danger.riskWeight, f.danger.min, f.danger.max), richness: clamp(richnessBase + band.richnessBonus + tier * f.richness.tierWeight, f.richness.min, f.richness.max), scanNeed: f.scanNeed.base + tier * f.scanNeed.tierWeight + band.scanBonus, lootNeed: f.lootNeed.base + tier * f.lootNeed.tierWeight, enemyEhp: Math.round(f.enemyEhp.base + tier * f.enemyEhp.tierWeight + Math.pow(tier, 2) * f.enemyEhp.tierSquaredWeight), enemyDps: Math.round(f.enemyDps.base + tier * f.enemyDps.tierWeight + (band.id === 'high' ? 0 : tier * f.enemyDps.nonHighTierWeight)), createdAt: new Date().toISOString() }; }
export function formatISK(value) { const n = Number(value || 0); if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} B ISK`; if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M ISK`; if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)} K ISK`; return `${Math.round(n)} ISK`; }
export function safeText(input, max = 280) { return String(input || '').replace(/[<>]/g, '').trim().slice(0, max); }
export function objectIdString(id) { return id ? String(id) : ''; }
