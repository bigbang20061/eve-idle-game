import crypto from 'crypto';
import { bandForSecurity, labelForActivity, getSiteRules } from './siteRules.js';
import { deriveSkillModifiers, ensureSkillState } from './skillSystem.js';

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function nowSeconds() { return Math.floor(Date.now() / 1000); }
export function hashString(input) { const h = crypto.createHash('sha256').update(String(input)).digest(); return h.readUInt32BE(0); }
export function seededRandom(seed) { let x = (hashString(seed) || 1) >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000000) / 1000000; }; }
export function chooseWeighted(items, rng = Math.random) { const total = items.reduce((s, i) => s + Math.max(0, Number(i.weight ?? 1)), 0) || items.length; let roll = rng() * total; for (const item of items) { roll -= Math.max(0, Number(item.weight ?? 1)); if (roll <= 0) return item; } return items[items.length - 1] || null; }
export function cargoVolume(stacks = []) { return stacks.reduce((sum, stack) => sum + Number(stack.quantity || 0) * Number(stack.volume || 0), 0); }

export function mergeStack(stacks, incoming) {
  const typeId = String(incoming.typeId);
  const qty = Number(incoming.quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return stacks;
  const chargeGroup = incoming.chargeGroup || incoming.meta?.chargeGroup;
  const existing = stacks.find(s => String(s.typeId) === typeId && !s.locked && (chargeGroup ? (s.chargeGroup || s.meta?.chargeGroup) === chargeGroup : true));
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + qty;
    existing.basePrice = incoming.basePrice ?? existing.basePrice;
    existing.volume = incoming.volume ?? existing.volume;
    existing.kind = incoming.kind ?? existing.kind;
    existing.name = incoming.name ?? existing.name;
    existing.zh = incoming.zh ?? existing.zh;
    existing.chargeGroup = incoming.chargeGroup ?? existing.chargeGroup;
    existing.meta = { ...(existing.meta || {}), ...(incoming.meta || {}) };
  } else {
    stacks.push({ typeId, name: incoming.name, zh: incoming.zh, kind: incoming.kind, quantity: qty, volume: Number(incoming.volume ?? 0.01), basePrice: Number(incoming.basePrice ?? 1), chargeGroup: incoming.chargeGroup, source: incoming.source || 'loot', meta: incoming.meta || {} });
  }
  return stacks;
}

export function removeStackQuantity(stacks, typeId, quantity) {
  let need = Number(quantity || 0);
  for (const stack of stacks) {
    if (String(stack.typeId) !== String(typeId) || stack.locked || need <= 0) continue;
    const take = Math.min(Number(stack.quantity || 0), need);
    stack.quantity -= take;
    need -= take;
  }
  for (let i = stacks.length - 1; i >= 0; i -= 1) if (Number(stacks[i].quantity || 0) <= 0) stacks.splice(i, 1);
  return quantity - need;
}

export function marketPrice(type, system, side = 'sell', date = new Date()) { const day = Math.floor(date.getTime() / 86400000); const base = Math.max(1, Number(type.basePrice || type.baseValue || 10)); const sec = Number(system?.security ?? 0.5); const richness = Number(system?.richness ?? 1); const scarcity = clamp(1.35 - sec * 0.45 + Number(type.rarity || 1) * 0.025 - (richness - 1) * 0.06, 0.75, 2.2); const rand = seededRandom(`${type.typeId || type.id}:${system?.systemId || system?.id || 'hub'}:${day}`)(); return Math.round(base * scarcity * (0.88 + rand * 0.28) * (side === 'buy' ? 0.92 : 1.08)); }

function defaultResists() {
  return { shield: {}, armor: {}, hull: {} };
}

function addResist(stats, layer, value) {
  const types = ['em', 'thermal', 'kinetic', 'explosive'];
  const apply = (type, amount) => { stats.resists[layer][type] = clamp(Number(stats.resists[layer][type] || 0) + Number(amount || 0), 0, 0.9); };
  if (value && typeof value === 'object') { for (const type of types) if (value[type] !== undefined) apply(type, value[type]); return; }
  const amount = Number(value || 0);
  for (const type of types) apply(type, amount);
}

function addResists(stats, value = {}) {
  for (const layer of ['shield', 'armor', 'hull']) if (value[layer]) addResist(stats, layer, value[layer]);
}

function addEffect(stats, key, value) {
  if (value === undefined || value === null) return;
  if (key === 'damageProfile') { stats.damageProfile = value; return; }
  if (key === 'shieldResist') return addResist(stats, 'shield', value);
  if (key === 'armorResist') return addResist(stats, 'armor', value);
  if (key === 'hullResist') return addResist(stats, 'hull', value);
  if (key === 'resists') return addResists(stats, value);
  if (key.endsWith('Multiplier')) return;
  stats[key] = Number(stats[key] || 0) + Number(value || 0);
}

function applyEffects(stats, effects = {}) {
  for (const [key, value] of Object.entries(effects || {})) addEffect(stats, key, value);
}

function applyMultipliers(stats, mods = {}) {
  const mapping = {
    dpsMultiplier: ['dps'],
    miningMultiplier: ['mining'],
    scanMultiplier: ['scan'],
    hackMultiplier: ['hack'],
    salvageMultiplier: ['salvage'],
    shieldMultiplier: ['shield'],
    armorMultiplier: ['armor'],
    hullMultiplier: ['hull'],
    cargoMultiplier: ['cargo'],
    oreHoldMultiplier: ['oreHold'],
    extractMultiplier: ['extract'],
    cpuMultiplier: ['cpu'],
    powergridMultiplier: ['powergrid'],
    capacitorMultiplier: ['capacitor']
  };
  for (const [modKey, statKeys] of Object.entries(mapping)) {
    const amount = Number(mods[modKey] || 0);
    if (!amount) continue;
    for (const statKey of statKeys) stats[statKey] = Number(stats[statKey] || 0) * (1 + amount);
  }
  if (mods.warpStability) stats.warpStability = Number(stats.warpStability || 0) + Number(mods.warpStability || 0);
  if (mods.droneDps) stats.dps = Number(stats.dps || 0) + Number(mods.droneDps || 0);
}

export function deriveEffectiveStats(character) {
  ensureSkillState(character);
  const shipStats = character.ship?.stats || {};
  const fitted = character.ship?.fittedModules || [];
  const stats = {
    shield: Number(shipStats.shield || 100), armor: Number(shipStats.armor || 70), hull: Number(shipStats.hull || 80),
    dps: Number(shipStats.dps || 6), mining: Number(shipStats.mining || 5), scan: Number(shipStats.scan || 4), hack: Number(shipStats.hack || 2), salvage: Number(shipStats.salvage || 1),
    cargo: Number(shipStats.cargo || 150), oreHold: Number(shipStats.oreHold || 0), extract: Number(shipStats.extract || 4), warpStability: Number(shipStats.warpStability || 0),
    cpu: Number(shipStats.cpu || 120), powergrid: Number(shipStats.powergrid || 45), capacitor: Number(shipStats.capacitor || 240), calibration: Number(shipStats.calibration || 100),
    turretHardpoints: Number(shipStats.turretHardpoints || 0), launcherHardpoints: Number(shipStats.launcherHardpoints || 0),
    trade: 1, industry: 1, resists: defaultResists()
  };
  const shipResists = shipStats.resists;
  if (shipResists) {
    for (const layer of ['shield', 'armor', 'hull']) {
      const src = shipResists[layer];
      if (!src) continue;
      for (const type of ['em', 'thermal', 'kinetic', 'explosive']) {
        const v = src[type];
        if (v !== undefined && v !== null) stats.resists[layer][type] = clamp(Number(v), 0, 0.9);
      }
    }
  }
  for (const module of fitted) {
    if (module.online === false) continue;
    const passive = module.passiveEffects || (!module.mode && module.effects) || {};
    applyEffects(stats, passive);
  }
  const skillMods = deriveSkillModifiers(character);
  applyEffects(stats, skillMods);
  applyMultipliers(stats, skillMods);
  stats.trade = 1 + Number(skillMods.tradeMultiplier || 0);
  stats.industry = 1 + Number(skillMods.industrySpeedMultiplier || 0);
  return stats;
}

export function systemBand(system) { return bandForSecurity(system?.security).id; }
export function siteTemplate(activity, system, character, rng = Math.random) { const rules = getSiteRules(); const f = rules.formula; const band = bandForSecurity(system?.security); const sec = Number(system?.security ?? 0.5); const risk = Number(character.autopilot?.risk ?? 0.35); const tier = clamp(Math.ceil((1 - sec) * f.tier.securityWeight + risk * f.tier.riskWeight + rng() * f.tier.randomWeight), f.tier.min, f.tier.max); const baseDanger = Number(system?.danger ?? clamp(0.9 - sec, 0.05, 0.95)); const richnessBase = Number(system?.richness ?? (f.richness.base + sec * f.richness.securityWeight)); return { id: `${activity}-${Date.now()}-${Math.floor(rng() * 100000)}`, name: labelForActivity(activity, tier, rng), activity, band: band.id, tier, danger: clamp(baseDanger + band.dangerBonus + tier * f.danger.tierWeight + risk * f.danger.riskWeight, f.danger.min, f.danger.max), richness: clamp(richnessBase + band.richnessBonus + tier * f.richness.tierWeight, f.richness.min, f.richness.max), scanNeed: f.scanNeed.base + tier * f.scanNeed.tierWeight + band.scanBonus, lootNeed: f.lootNeed.base + tier * f.lootNeed.tierWeight, enemyEhp: Math.round(f.enemyEhp.base + tier * f.enemyEhp.tierWeight + Math.pow(tier, 2) * f.enemyEhp.tierSquaredWeight), enemyDps: Math.round(f.enemyDps.base + tier * f.enemyDps.tierWeight + (band.id === 'high' ? 0 : tier * f.enemyDps.nonHighTierWeight)), createdAt: new Date().toISOString() }; }
export function formatISK(value) { const n = Number(value || 0); if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} B ISK`; if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M ISK`; if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)} K ISK`; return `${Math.round(n)} ISK`; }
export function safeText(input, max = 280) { return String(input || '').replace(/[<>]/g, '').trim().slice(0, max); }
export function objectIdString(id) { return id ? String(id) : ''; }
