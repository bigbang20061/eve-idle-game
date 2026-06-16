import { getCombatRules, pickDamageProfile, pickPriority, pickStance } from './combatRules.js';
import { clamp } from './formulas.js';
import { processActiveModules } from './fitting.js';

function sum(values) { return Object.values(values || {}).reduce((s, v) => s + Number(v || 0), 0); }
function normaliseProfile(profile) { const total = sum(profile); if (total <= 0) return { balanced: 1 }; return Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, Number(v || 0) / total])); }
function layerHp(stats) { return { shield: Number(stats.shield || 1), armor: Number(stats.armor || 1), hull: Number(stats.hull || 1) }; }
function allEnemies(combat) { return (combat?.waves || []).flatMap(w => w.enemies || []); }
function activeEnemies(combat) { return allEnemies(combat).filter(e => e.hp > 0); }
function aliveInWave(combat) { return (combat.waves[combat.currentWave]?.enemies || []).filter(e => e.hp > 0); }

function pickFaction(site, rng) {
  const rules = getCombatRules();
  if (site.faction && rules.factions[site.faction]) return site.faction;
  const ids = Object.keys(rules.factions);
  return ids[Math.floor(rng() * ids.length)] || 'rogue';
}

function npcResist(factionId) {
  const rules = getCombatRules();
  const base = { em: 0.18, thermal: 0.18, kinetic: 0.18, explosive: 0.18 };
  const bonus = rules.factions[factionId]?.resistBonus || {};
  for (const [type, value] of Object.entries(bonus)) base[type] = clamp(Number(base[type] || 0) + Number(value || 0), 0, 0.78);
  return base;
}

function makeEnemy(role, site, factionId, index) {
  const rules = getCombatRules();
  const arch = rules.archetypes[role] || rules.archetypes.dps;
  const tier = Number(site.tier || 1);
  return {
    id: `${role}-${index}`,
    role,
    label: arch.label || role,
    hp: Math.round(Number(arch.ehp || 50) * (1 + tier * 0.34)),
    maxHp: Math.round(Number(arch.ehp || 50) * (1 + tier * 0.34)),
    dps: Number(arch.dps || 1) * (1 + tier * 0.18),
    bounty: Math.round(Number(arch.bounty || 0) * (1 + tier * rules.engine.bountyTierMultiplier)),
    scram: Number(arch.scram || 0),
    ewar: Number(arch.ewar || 0),
    repair: Number(arch.repair || 0),
    resist: npcResist(factionId)
  };
}

export function ensureCombat(site, stats, character, rng = Math.random) {
  if (site.combat?.version === getCombatRules().version) return site.combat;
  const rules = getCombatRules();
  const faction = pickFaction(site, rng);
  const waveDefs = rules.wavesByActivity[site.activity] || rules.wavesByActivity.combat;
  const waveCount = clamp(Math.ceil(Number(site.tier || 1) / 3), 1, waveDefs.length);
  const waves = waveDefs.slice(0, waveCount).map((roles, waveIndex) => ({ index: waveIndex, enemies: roles.map((role, i) => makeEnemy(role, site, faction, `${waveIndex}-${i}`)) }));
  site.combat = { version: rules.version, faction, factionLabel: rules.factions[faction]?.label || faction, currentWave: 0, waves, log: [], totals: { dealt: 0, taken: 0, bounty: 0 }, effects: { scrammed: false, ewar: 0 }, completed: false };
  site.enemyEhp = activeEnemies(site.combat).reduce((s, e) => s + e.hp, 0);
  if (!site.hp) site.hp = layerHp(stats);
  return site.combat;
}

function selectTarget(combat, priorityId) {
  const order = pickPriority(priorityId).roles || [];
  const enemies = aliveInWave(combat);
  for (const role of order) {
    const found = enemies.find(e => e.role === role);
    if (found) return found;
  }
  return enemies[0] || null;
}

function effectiveDamage(amount, profile, resist) {
  let dealt = 0;
  const p = normaliseProfile(profile);
  for (const [type, share] of Object.entries(p)) dealt += amount * share * (1 - Number(resist?.[type] || 0));
  return Math.max(0, dealt);
}

function damagePlayer(site, rawDamage, profile) {
  const rules = getCombatRules();
  const hp = site.hp;
  let remaining = rawDamage;
  let taken = 0;
  for (const layer of rules.layers) {
    if (remaining <= 0 || Number(hp[layer] || 0) <= 0) continue;
    const resist = rules.baseLayerResists[layer] || {};
    const applied = effectiveDamage(remaining, profile, resist);
    const hit = Math.min(Number(hp[layer] || 0), applied);
    hp[layer] -= hit;
    taken += hit;
    remaining -= hit;
  }
  return taken;
}

export function resolveCombatRound({ site, character, stats, dt, rng = Math.random }) {
  const combat = ensureCombat(site, stats, character, rng);
  const rules = getCombatRules();
  const pref = character.autopilot?.combat || {};
  const stance = pickStance(pref.stance || 'standard');
  const roundSeconds = Math.min(Number(dt || 1), Number(rules.engine.maxRoundSeconds || 20));
  const moduleResult = processActiveModules({ character, site, stats, dt: roundSeconds });
  for (const line of moduleResult.logs || []) combat.log.unshift(line);
  const profileObj = stats.damageProfile ? { damage: stats.damageProfile } : pickDamageProfile(pref.damageProfile || 'balanced');
  const playerProfile = profileObj.damage || profileObj;
  const npcProfile = pickDamageProfile(rules.factions[combat.faction]?.damageProfile || 'balanced').damage;
  const target = selectTarget(combat, pref.targetPriority || 'scramblers_first');
  if (!target) { combat.completed = true; return { outcome: 'won', dealt: 0, taken: 0, bounty: 0, activeEnemies: 0 }; }

  const ewarLoad = aliveInWave(combat).reduce((s, e) => s + Number(e.ewar || 0), 0);
  const ewarPenalty = clamp(ewarLoad - Number(stance.ewarResist || 0), 0, 0.7);
  const rawPlayer = Number(stats.dps || 1) * roundSeconds * Number(stance.dpsMultiplier || 1) * (1 - ewarPenalty);
  const dealt = effectiveDamage(rawPlayer, playerProfile, target.resist);
  target.hp = Math.max(0, target.hp - dealt);

  let bounty = 0;
  if (target.hp <= 0 && !target.dead) {
    target.dead = true;
    bounty += Number(target.bounty || 0);
    combat.log.unshift(`击毁 ${target.label}，赏金 ${Math.round(target.bounty || 0)} ISK。`);
  }

  for (const repper of aliveInWave(combat).filter(e => e.repair > 0)) {
    const injured = aliveInWave(combat).filter(e => e.hp < e.maxHp && e.id !== repper.id).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (injured) injured.hp = Math.min(injured.maxHp, injured.hp + repper.repair * roundSeconds);
  }

  if (!aliveInWave(combat).length) {
    if (combat.currentWave < combat.waves.length - 1) { combat.currentWave += 1; combat.log.unshift(`敌方第 ${combat.currentWave + 1} 波跃迁入场。`); }
    else combat.completed = true;
  }

  const incoming = aliveInWave(combat).reduce((s, e) => s + Number(e.dps || 0), 0) * roundSeconds * Number(stance.incomingMultiplier || 1);
  const taken = damagePlayer(site, incoming, npcProfile);
  const scramPressure = aliveInWave(combat).reduce((s, e) => s + Number(e.scram || 0), 0);
  combat.effects.scrammed = scramPressure > Number(stats.warpStability || 0) + Number(stance.scramResist || 0);
  combat.effects.ewar = ewarPenalty;
  site.hazard = Number(site.hazard || 0) + taken * Number(rules.engine.hazardPerIncomingDamage || 0.001) * Number(stance.hazardMultiplier || 1);
  if (combat.effects.scrammed) site.hazard += Number(rules.engine.hazardPerScram || 0.04);
  combat.totals.dealt += dealt;
  combat.totals.taken += taken;
  combat.totals.bounty += bounty;
  combat.activeEnemies = activeEnemies(combat).length;
  site.enemyEhp = activeEnemies(combat).reduce((s, e) => s + e.hp, 0);
  const destroyed = Number(site.hp.hull || 0) <= 0;
  return { outcome: destroyed ? 'destroyed' : combat.completed ? 'won' : 'running', dealt, taken, bounty, activeEnemies: combat.activeEnemies, scrammed: combat.effects.scrammed, ewar: ewarPenalty };
}

export function combatSnapshot(site) {
  const combat = site?.combat;
  if (!combat) return null;
  return { version: combat.version, faction: combat.factionLabel || combat.faction, currentWave: combat.currentWave, waves: combat.waves?.length || 0, enemies: aliveInWave(combat).map(e => ({ id: e.id, role: e.role, label: e.label, hp: Math.round(e.hp), maxHp: e.maxHp })), effects: combat.effects, totals: combat.totals, log: combat.log?.slice(0, 8) || [] };
}
