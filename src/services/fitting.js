import crypto from 'crypto';
import { readGameConfig } from './gameConfig.js';
import { skillLevel } from './skills.js';

export function getFittingRules() { return readGameConfig('data/game/fitting_rules.json'); }
function textOf(type = {}) { return `${type.name || ''} ${type.zh || ''} ${type.groupName || ''} ${type.marketGroupName || ''} ${type.slot || ''}`.toLowerCase(); }
function addEffects(target, effects = {}) { for (const [k, v] of Object.entries(effects || {})) { if (k === 'damageProfile') { target.damageProfile = v; continue; } target[k] = Number(target[k] || 0) + Number(v || 0); } return target; }

export function moduleRule(type = {}) {
  const rules = getFittingRules();
  const hay = textOf(type);
  for (const rule of rules.moduleRules || []) {
    if ((rule.match?.keywords || []).some(k => hay.includes(String(k).toLowerCase()))) return rule;
  }
  const slot = type.slot || (/rig/.test(hay) ? 'rig' : /shield|scanner|analyzer|afterburner|propulsion|booster/.test(hay) ? 'mid' : /armor|repair|damage control|stabilizer|plating/.test(hay) ? 'low' : 'high');
  return { ...(rules.fallbackBySlot?.[slot] || rules.fallbackBySlot?.high), slot };
}

export function buildFittedModuleFromType(type, character = null) {
  const rule = moduleRule(type);
  const defaults = getFittingRules().moduleDefaults || {};
  const slot = type.slot || rule.slot || 'high';
  const activation = { ...(defaults.activation || {}), ...(rule.activation || {}) };
  const mode = rule.mode || defaults.state || 'passive';
  return {
    instanceId: crypto.randomUUID(),
    typeId: String(type.typeId),
    name: type.name,
    zh: type.zh || type.name,
    slot,
    kind: type.kind || 'module',
    tier: Number(type.tier || 1),
    groupKey: rule.id || slot,
    mode,
    state: mode === 'active' ? 'active' : 'passive',
    fitting: { ...(defaults.fitting || {}), ...(rule.fitting || {}), ...(type.raw?.fitting || {}) },
    activation,
    effects: { ...(rule.effects || {}), ...(type.effects || {}) },
    charge: null,
    online: true
  };
}

export function fittingUsage(ship, extraModule = null) {
  const modules = [...(ship?.fittedModules || []), ...(extraModule ? [extraModule] : [])];
  const usage = { cpu: 0, powergrid: 0, calibration: 0, turretHardpoints: 0, launcherHardpoints: 0, slots: {} };
  for (const mod of modules) {
    if (mod.online === false) continue;
    usage.cpu += Number(mod.fitting?.cpu || 0);
    usage.powergrid += Number(mod.fitting?.powergrid || 0);
    usage.calibration += Number(mod.fitting?.calibration || 0);
    usage.slots[mod.slot] = Number(usage.slots[mod.slot] || 0) + 1;
    if (mod.hardpoint === 'turret' || mod.activation?.skillDamageBonus === 'turretDamage') usage.turretHardpoints += 1;
    if (mod.hardpoint === 'launcher' || mod.activation?.skillDamageBonus === 'launcherDamage') usage.launcherHardpoints += 1;
  }
  return usage;
}

export function fittingSummary(character) {
  const ship = character.ship || {};
  const cap = ship.fitting || {};
  const usage = fittingUsage(ship);
  return { capacity: cap, usage, ok: usage.cpu <= Number(cap.cpu || 0) && usage.powergrid <= Number(cap.powergrid || 0) && usage.calibration <= Number(cap.calibration || 0) };
}

export function validateModuleFit(character, module) {
  const ship = character.ship;
  if (!ship) throw new Error('当前没有舰船');
  const maxSlots = Number(ship.slots?.[module.slot] || 0);
  if (maxSlots <= 0) throw new Error(`${module.slot} 槽不存在`);
  const usedSlots = (ship.fittedModules || []).filter(m => m.slot === module.slot).length;
  if (usedSlots >= maxSlots) throw new Error(`${module.slot} 槽位已满`);
  const cap = ship.fitting || {};
  const usage = fittingUsage(ship, module);
  if (usage.cpu > Number(cap.cpu || 0)) throw new Error('CPU 不足');
  if (usage.powergrid > Number(cap.powergrid || 0)) throw new Error('能栅不足');
  if (usage.calibration > Number(cap.calibration || 0)) throw new Error('校准值不足');
  if (usage.turretHardpoints > Number(cap.turretHardpoints || 0)) throw new Error('炮台挂点不足');
  if (usage.launcherHardpoints > Number(cap.launcherHardpoints || 0)) throw new Error('发射器挂点不足');
  const rules = getFittingRules();
  const sameGroup = (ship.fittedModules || []).filter(m => m.groupKey === module.groupKey).length;
  const maxSame = module.slot === 'rig' ? Number(rules.limits?.rigSameGroup || 1) : Number(rules.limits?.sameGroup || 2);
  if (sameGroup >= maxSame) throw new Error('同类装备数量超限');
  for (const [skillId, required] of Object.entries(moduleRule(module).requiredSkills || module.requiredSkills || {})) {
    if (skillLevel(character, skillId) < Number(required || 0)) throw new Error(`技能不足：${skillId} ${required}`);
  }
  return true;
}

export function moduleEffectsForStats(character, stats = {}) {
  const effects = {};
  for (const mod of character.ship?.fittedModules || []) {
    if (mod.online === false) continue;
    if (mod.mode === 'active' && mod.state !== 'active') continue;
    if (mod.activation?.chargeKind && Number(mod.charge?.loadedQuantity || 0) <= 0) continue;
    const modEffects = { ...(mod.effects || {}) };
    if (mod.activation?.skillDamageBonus && modEffects.dps) modEffects.dps *= Number(stats[mod.activation.skillDamageBonus] || 1);
    if (mod.charge?.damageProfile) modEffects.damageProfile = mod.charge.damageProfile;
    addEffects(effects, modEffects);
  }
  return effects;
}

export function processActiveModules({ character, site, stats, dt }) {
  const ship = character.ship;
  if (!ship) return { logs: [] };
  if (!ship.runtime) ship.runtime = {};
  const maxCap = Number(stats.capacitor || ship.stats?.capacitor || 180);
  ship.runtime.capacitor = Math.min(maxCap, Number(ship.runtime.capacitor ?? maxCap) + Number(stats.capacitorRecharge || 0) * Number(dt || 0));
  const logs = [];
  for (const mod of ship.fittedModules || []) {
    if (mod.online === false || mod.mode !== 'active' || mod.state !== 'active') continue;
    const cycle = Math.max(1, Number(mod.activation?.cycleSeconds || 6));
    const cycles = Math.max(1, Math.floor(Number(dt || 0) / cycle));
    const capCost = Number(mod.activation?.capacitorCost || 0) * cycles * Number(stats.activeModuleCapCost || 1);
    if (ship.runtime.capacitor < capCost) { mod.state = 'idle'; logs.push(`${mod.zh || mod.name} 电容不足，停止运转。`); continue; }
    const chargeNeed = Number(mod.activation?.chargePerCycle || 0) * cycles;
    if (mod.activation?.chargeKind && chargeNeed > 0) {
      if (Number(mod.charge?.loadedQuantity || 0) < chargeNeed) { mod.state = 'idle'; logs.push(`${mod.zh || mod.name} 弹药耗尽。`); continue; }
      mod.charge.loadedQuantity -= chargeNeed;
    }
    ship.runtime.capacitor -= capCost;
    const fx = mod.activation?.effects || {};
    if (site?.hp && fx.shieldBoost) site.hp.shield = Math.min(Number(stats.shield || site.hp.shield), Number(site.hp.shield || 0) + Number(fx.shieldBoost || 0) * cycles * Number(stats.shieldBoost || 1));
    if (site?.hp && fx.armorRepair) site.hp.armor = Math.min(Number(stats.armor || site.hp.armor), Number(site.hp.armor || 0) + Number(fx.armorRepair || 0) * cycles * Number(stats.armorRepair || 1));
  }
  character.markModified?.('ship');
  return { logs };
}
