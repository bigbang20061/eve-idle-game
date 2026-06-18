import crypto from 'crypto';
import { loadJsonConfig } from './jsonConfig.js';
import { hasSkillRequirements, deriveSkillModifiers } from './skillSystem.js';
import { mergeStack, removeStackQuantity } from './formulas.js';
import { t, label } from './i18n.js';

export function getFittingRules() {
  return loadJsonConfig('data/game/fitting_rules.json');
}

function haystack(type = {}) {
  return `${type.name || ''} ${type.zh || ''} ${type.groupName || ''} ${type.marketGroupName || ''} ${type.role || ''}`.toLowerCase();
}

export function inferModuleRole(type = {}) {
  const rules = getFittingRules();
  if (type.role && rules.moduleRoles?.[type.role]) return type.role;
  const text = haystack(type);
  for (const [role, words] of Object.entries(rules.roleKeywords || {})) {
    if ((words || []).some(word => text.includes(String(word).toLowerCase()))) return role;
  }
  if (type.effects?.dps || type.activeEffects?.dps) return 'weapon_turret';
  return 'general';
}

function roleDef(role) {
  const rules = getFittingRules();
  return rules.moduleRoles?.[role] || rules.moduleRoles?.general || { slot: 'high', mode: 'passive', requiredSkills: {} };
}

function moduleResource(type, slot, key) {
  const rules = getFittingRules();
  const defaults = rules.moduleDefaultsBySlot?.[slot] || {};
  return Number(type[key] ?? type.requirements?.[key] ?? type.raw?.[key] ?? defaults[key] ?? 0);
}

export function moduleInstanceFromType(type = {}, { instanceId = crypto.randomUUID(), active = true } = {}) {
  const role = inferModuleRole(type);
  const def = roleDef(role);
  const slot = type.slot || def.slot || 'high';
  const mode = type.mode || type.activation?.mode || def.mode || 'passive';
  const effects = type.effects || {};
  const passiveEffects = type.passiveEffects || (mode === 'passive' ? effects : {});
  const activeEffects = type.activeEffects || (mode === 'passive' ? {} : effects);
  const activation = { ...(def.activation || {}), ...(type.activation || {}), mode };
  return {
    instanceId,
    typeId: String(type.typeId),
    name: type.name,
    zh: type.zh || type.name,
    slot,
    kind: type.kind || 'module',
    role,
    // Same-group cap keys on the role; rigs distinguish by type so different rigs can coexist (EVE: per rig group).
    groupKey: type.groupKey || (role === 'rig' ? `rig:${type.kind || type.typeId}` : role),
    tier: Number(type.tier || 1),
    mode,
    cpu: moduleResource(type, slot, 'cpu'),
    powergrid: moduleResource(type, slot, 'powergrid'),
    calibration: moduleResource(type, slot, 'calibration'),
    requirements: { skills: { ...(def.requiredSkills || {}), ...(type.requirements?.skills || {}) }, hardpoint: def.hardpoint || type.requirements?.hardpoint },
    passiveEffects,
    activeEffects,
    effects,
    activation,
    online: true,
    active: mode !== 'passive' ? active : false,
    chargeGroup: activation.chargeGroup,
    lastActivatedAt: null,
    meta: { source: type.source || 'sde', fittingVersion: getFittingRules().version }
  };
}

export function fittingSummary(character) {
  const rules = getFittingRules();
  const ship = character.ship || {};
  const slots = ship.slots || {};
  const stats = ship.stats || {};
  const modules = ship.fittedModules || [];
  const resources = {};
  for (const key of rules.resources || []) {
    resources[key] = {
      used: modules.filter(m => m.online !== false).reduce((sum, m) => sum + Number(m[key] || 0), 0),
      max: Number(stats[key] || rules.shipDefaults?.[key] || 0)
    };
  }
  const slotUse = Object.fromEntries(Object.keys(slots).map(slot => [slot, {
    used: modules.filter(m => m.slot === slot).length,
    max: Number(slots[slot] || 0)
  }]));
  const hardpoints = {
    turret: { used: modules.filter(m => m.requirements?.hardpoint === 'turret').length, max: Number(stats.turretHardpoints || rules.shipDefaults?.turretHardpoints || 0) },
    launcher: { used: modules.filter(m => m.requirements?.hardpoint === 'launcher').length, max: Number(stats.launcherHardpoints || rules.shipDefaults?.launcherHardpoints || 0) }
  };
  return { version: rules.version, slots: slotUse, resources, hardpoints, modules };
}

export function validateModuleFit(character, module) {
  const summary = fittingSummary(character);
  const slot = module.slot || 'high';
  const slotState = summary.slots[slot] || { used: 0, max: 0 };
  const errors = [];
  if (slotState.used >= slotState.max) errors.push(t('fit.err.slotFull', { slot: label('slot', slot) }));
  for (const [key, res] of Object.entries(summary.resources || {})) {
    if (Number(res.used || 0) + Number(module[key] || 0) > Number(res.max || 0)) errors.push(t('fit.err.resource', { resource: label('res', key) }));
  }
  const hardpoint = module.requirements?.hardpoint;
  if (hardpoint) {
    const hp = summary.hardpoints?.[hardpoint] || { used: 0, max: 0 };
    if (hp.used >= hp.max) errors.push(t('fit.err.hardpoint', { hardpoint: label('hardpoint', hardpoint) }));
  }
  // Same-group cap: weapons are bounded by hardpoints instead, so only limit utility/rig modules.
  const groupKey = module.groupKey || module.role;
  if (module.mode !== 'weapon' && groupKey) {
    const rules = getFittingRules();
    const sameGroup = (character.ship?.fittedModules || []).filter(m => (m.groupKey || m.role) === groupKey).length;
    const maxSame = module.slot === 'rig' ? Number(rules.limits?.rigSameGroup ?? 1) : Number(rules.limits?.sameGroup ?? 2);
    if (sameGroup >= maxSame) errors.push(t('fit.err.sameGroup', { group: label('role', groupKey), max: maxSame }));
  }
  const skills = hasSkillRequirements(character, module.requirements?.skills || {});
  if (!skills.ok) errors.push(t('fit.err.skill', { detail: skills.missing.map(s => `${s.label} ${s.have}/${s.need}`).join('、') }));
  return { ok: errors.length === 0, errors, summary };
}

export function fitModuleFromType(character, type) {
  const stack = character.warehouse?.items?.find(s => String(s.typeId) === String(type.typeId) && Number(s.quantity || 0) > 0 && !s.locked);
  if (!stack) throw new Error(t('fit.err.noStack'));
  const module = moduleInstanceFromType(type);
  const validation = validateModuleFit(character, module);
  if (!validation.ok) throw new Error(validation.errors.join('；'));
  removeStackQuantity(character.warehouse.items, String(type.typeId), 1);
  if (!Array.isArray(character.ship.fittedModules)) character.ship.fittedModules = [];
  character.ship.fittedModules.push(module);
  return module;
}

export function unfitModuleToWarehouse(character, instanceId, type = {}) {
  const modules = character.ship?.fittedModules || [];
  const idx = modules.findIndex(m => String(m.instanceId) === String(instanceId));
  if (idx < 0) throw new Error(t('fit.err.noModule'));
  const mod = modules.splice(idx, 1)[0];
  mergeStack(character.warehouse.items, {
    typeId: String(mod.typeId),
    name: mod.name,
    zh: mod.zh || mod.name,
    kind: 'module',
    quantity: 1,
    volume: Number(type.volume || 5),
    basePrice: Number(type.basePrice || 1),
    source: 'unfit',
    meta: { role: mod.role, slot: mod.slot }
  });
  return mod;
}

export function setModuleActive(character, instanceId, active) {
  const mod = (character.ship?.fittedModules || []).find(m => String(m.instanceId) === String(instanceId));
  if (!mod) throw new Error(t('fit.err.noModule'));
  if (mod.mode === 'passive') throw new Error(t('fit.err.passiveToggle'));
  mod.active = Boolean(active);
  return mod;
}

function takeCharges(character, chargeGroup, quantity) {
  if (!chargeGroup || quantity <= 0) return { ok: true, used: 0, charge: null };
  const cargo = character.cargo || [];
  const stack = cargo.find(s => (s.chargeGroup || s.meta?.chargeGroup) === chargeGroup && Number(s.quantity || 0) > 0);
  if (!stack || Number(stack.quantity || 0) < quantity) return { ok: false, used: 0, charge: null };
  stack.quantity -= quantity;
  character.cargo = cargo.filter(s => Number(s.quantity || 0) > 0);
  return { ok: true, used: quantity, charge: stack };
}

function addEffect(target, key, value) {
  if (value === undefined || value === null) return;
  if (key === 'damageProfile') return;
  target[key] = Number(target[key] || 0) + Number(value || 0);
}

function weaponSkillMultiplier(module, mods) {
  const generic = Number(mods.dpsMultiplier || 0);
  const role = module.role || '';
  if (role === 'weapon_launcher') return 1 + Number(mods.missileDpsMultiplier || 0);
  if (role === 'weapon_laser') return 1 + generic + Number(mods.laserDpsMultiplier || 0);
  if (role === 'weapon_projectile') return 1 + generic + Number(mods.projectileDpsMultiplier || 0);
  if (role === 'weapon_turret') return 1 + generic;
  return 1 + generic;
}

export function cycleActiveModules(character, site, dt, baseStats = {}) {
  const rules = getFittingRules();
  const mods = deriveSkillModifiers(character);
  const maxCap = Math.max(1, Number(baseStats.capacitor || character.ship?.stats?.capacitor || rules.shipDefaults?.capacitor || 1));
  const regen = Number(rules.engine?.capacitorRegenPerSecond);
  site.capacitor = Math.min(maxCap, Number(site.capacitor ?? maxCap) + maxCap * regen * Number(dt || 0));
  const result = { stats: {}, repairs: { shield: 0, armor: 0, hull: 0 }, damageProfiles: [], chargesUsed: [], logs: [], capacitor: site.capacitor };
  for (const module of character.ship?.fittedModules || []) {
    if (module.online === false || module.active === false || module.mode === 'passive') continue;
    const activation = module.activation || {};
    const cycleSeconds = Math.max(1, Number(activation.cycleSeconds || rules.engine?.defaultCycleSeconds));
    const cycles = Math.max(1, Math.floor(Number(dt || cycleSeconds) / cycleSeconds));
    const capReduction = Number(mods.activeModuleCapReduction || 0) + (module.mode === 'weapon' ? Number(mods.weaponCapReduction || 0) : 0);
    const capCost = Math.max(0, Number(activation.capacitorCost || 0) * (1 - Math.min(0.8, capReduction)) * cycles);
    if (site.capacitor < capCost) {
      result.logs.push(t('module.log.no_cap', { name: module.zh || module.name }));
      continue;
    }
    const chargesNeeded = Number(activation.chargesPerCycle || 0) * cycles;
    const charge = takeCharges(character, activation.chargeGroup || module.chargeGroup, chargesNeeded);
    if (!charge.ok) {
      result.logs.push(t('module.log.no_charge', { name: module.zh || module.name, charge: activation.chargeGroup || module.chargeGroup }));
      continue;
    }
    site.capacitor -= capCost;
    const effects = module.activeEffects || module.effects || {};
    const chargeRules = rules.chargeGroups?.[activation.chargeGroup || module.chargeGroup] || {};
    const chargeDpsBonus = Number(chargeRules.bonusDpsMultiplier || 1);
    const skillDpsBonus = weaponSkillMultiplier(module, mods);
    let moduleDps = 0;
    for (const [key, value] of Object.entries(effects)) {
      if (key === 'shieldBoost') result.repairs.shield += Number(value || 0) * cycles * (1 + Number(mods.activeShieldBoostMultiplier || 0));
      else if (key === 'armorRepair') result.repairs.armor += Number(value || 0) * cycles * (1 + Number(mods.activeArmorRepairMultiplier || 0));
      else if (key === 'hullRepair') result.repairs.hull += Number(value || 0) * cycles;
      else if (key === 'dps') {
        moduleDps += Number(value || 0) * chargeDpsBonus * skillDpsBonus;
        addEffect(result.stats, key, moduleDps);
      }
      else addEffect(result.stats, key, value);
    }
    const profile = chargeRules.damageProfile || effects.damageProfile;
    if (profile && moduleDps > 0) result.damageProfiles.push({ profile, weight: moduleDps });
    if (charge.used > 0) result.chargesUsed.push({ chargeGroup: activation.chargeGroup || module.chargeGroup, quantity: charge.used, name: charge.charge?.zh || charge.charge?.name });
    module.lastActivatedAt = new Date();
  }
  site.capacitor = Math.max(0, site.capacitor);
  result.capacitor = site.capacitor;
  return result;
}

export function fittingUiOptions() {
  const rules = getFittingRules();
  return {
    version: rules.version,
    moduleRoles: Object.fromEntries(Object.entries(rules.moduleRoles || {}).map(([id, role]) => [id, { label: label('role', id), slot: role.slot, mode: role.mode }])),
    chargeGroups: Object.fromEntries(Object.entries(rules.chargeGroups || {}).map(([id, cg]) => [id, { ...cg, label: label('charge', id) }])),
    resources: rules.resources || []
  };
}
