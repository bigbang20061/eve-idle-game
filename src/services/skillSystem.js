import { loadJsonConfig } from './jsonConfig.js';

const LEGACY_DEFAULTS = { combat: 1, mining: 1, scanning: 1, industry: 1, trade: 1, command: 1, salvage: 1, security: 1 };

export function getSkillCatalog() {
  return loadJsonConfig('data/game/skills.json');
}

export function skillOptions() {
  const catalog = getSkillCatalog();
  const skills = Object.fromEntries(Object.entries(catalog.skills || {}).map(([id, def]) => [id, {
    id,
    label: def.label || id,
    category: def.category || 'general',
    rank: Number(def.rank || 1),
    maxLevel: Number(def.maxLevel || 5),
    effectsPerLevel: def.effectsPerLevel || {},
    unlocks: def.unlocks || {}
  }]));
  return { version: catalog.version, maxQueue: catalog.maxQueue, skills };
}

export function ensureSkillState(character) {
  const catalog = getSkillCatalog();
  const current = character.skills && typeof character.skills === 'object' ? character.skills : {};
  const next = { ...LEGACY_DEFAULTS, ...current };
  for (const [legacy, target] of Object.entries(catalog.legacyAliases || {})) {
    if (next[target] === undefined && current[legacy] !== undefined) next[target] = Number(current[legacy] || 0);
  }
  for (const id of Object.keys(catalog.skills || {})) {
    if (next[id] === undefined) next[id] = 0;
    next[id] = Math.max(0, Math.min(Number(catalog.skills[id].maxLevel || 5), Math.floor(Number(next[id] || 0))));
  }
  character.skills = next;
  if (!character.skillTraining) character.skillTraining = { active: null, queue: [], history: [] };
  if (!Array.isArray(character.skillTraining.queue)) character.skillTraining.queue = [];
  if (!Array.isArray(character.skillTraining.history)) character.skillTraining.history = [];
  return next;
}

export function skillLevel(character, skillId) {
  const skills = character.skills || {};
  return Math.max(0, Math.floor(Number(skills[skillId] || 0)));
}

export function trainingSeconds(skillId, targetLevel, character = null) {
  const catalog = getSkillCatalog();
  const def = catalog.skills?.[skillId];
  if (!def) throw new Error('技能不存在');
  const target = Math.max(1, Math.min(Number(def.maxLevel || 5), Number(targetLevel || 1)));
  const base = Number(catalog.training?.baseSeconds || 420);
  const exponent = Number(catalog.training?.levelExponent || 2.15);
  const rank = Number(def.rank || 1);
  const mods = character ? deriveSkillModifiers(character) : {};
  const speed = 1 + Number(mods.skillSpeedMultiplier || 0);
  return Math.max(30, Math.round((base * rank * Math.pow(target, exponent)) / Math.max(0.1, speed)));
}

export function deriveSkillModifiers(character) {
  const catalog = getSkillCatalog();
  const skills = character.skills || {};
  const modifiers = {};
  for (const [skillId, def] of Object.entries(catalog.skills || {})) {
    const level = Math.max(0, Math.floor(Number(skills[skillId] || 0)));
    if (!level) continue;
    for (const [key, value] of Object.entries(def.effectsPerLevel || {})) {
      modifiers[key] = Number(modifiers[key] || 0) + Number(value || 0) * level;
    }
  }
  return modifiers;
}

export function hasSkillRequirements(character, requirements = {}) {
  ensureSkillState(character);
  const missing = [];
  for (const [skillId, level] of Object.entries(requirements || {})) {
    const have = skillLevel(character, skillId);
    const need = Number(level || 0);
    if (have < need) missing.push({ skillId, have, need, label: getSkillCatalog().skills?.[skillId]?.label || skillId });
  }
  return { ok: missing.length === 0, missing };
}

export function startSkillTraining(character, skillId, { queue = true, now = new Date() } = {}) {
  ensureSkillState(character);
  const catalog = getSkillCatalog();
  const def = catalog.skills?.[skillId];
  if (!def) throw new Error('技能不存在');
  const current = skillLevel(character, skillId);
  const max = Number(def.maxLevel || 5);
  if (current >= max) throw new Error('技能已满级');
  const targetLevel = current + 1;
  const secondsRequired = trainingSeconds(skillId, targetLevel, character);
  const plan = { skillId, label: def.label || skillId, targetLevel, secondsRequired };
  if (!character.skillTraining.active) {
    character.skillTraining.active = { ...plan, startedAt: now, readyAt: new Date(now.getTime() + secondsRequired * 1000) };
  } else if (queue) {
    const maxQueue = Number(catalog.maxQueue || 12);
    if (character.skillTraining.queue.length >= maxQueue) throw new Error('训练队列已满');
    character.skillTraining.queue.push(plan);
  } else {
    throw new Error('已有技能正在训练');
  }
  return character.skillTraining;
}

function promoteQueuedTraining(character, now) {
  const next = character.skillTraining.queue.shift();
  if (!next) {
    character.skillTraining.active = null;
    return;
  }
  const secondsRequired = trainingSeconds(next.skillId, next.targetLevel, character);
  character.skillTraining.active = { ...next, secondsRequired, startedAt: now, readyAt: new Date(now.getTime() + secondsRequired * 1000) };
}

export function tickSkillTraining(character, now = new Date()) {
  ensureSkillState(character);
  const completed = [];
  let guard = 0;
  while (character.skillTraining.active && new Date(character.skillTraining.active.readyAt) <= now && guard < 20) {
    guard += 1;
    const active = character.skillTraining.active;
    const def = getSkillCatalog().skills?.[active.skillId];
    if (!def) {
      character.skillTraining.active = null;
      break;
    }
    const max = Number(def.maxLevel || 5);
    character.skills[active.skillId] = Math.min(max, Math.max(skillLevel(character, active.skillId), Number(active.targetLevel || 1)));
    const record = { skillId: active.skillId, label: def.label || active.skillId, level: character.skills[active.skillId], completedAt: now };
    character.skillTraining.history.unshift(record);
    character.skillTraining.history = character.skillTraining.history.slice(0, 40);
    completed.push(record);
    promoteQueuedTraining(character, now);
  }
  return completed;
}

export function publicSkillState(character) {
  ensureSkillState(character);
  const options = skillOptions();
  return {
    version: options.version,
    skills: character.skills,
    modifiers: deriveSkillModifiers(character),
    training: character.skillTraining,
    catalog: options.skills
  };
}
