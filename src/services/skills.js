import { readGameConfig } from './gameConfig.js';

export function getSkillRules() {
  return readGameConfig('data/game/skills.json');
}

export function skillCatalog() {
  return getSkillRules().skills || {};
}

export function skillLevel(character, skillId) {
  return Number(character?.skills?.[skillId] || 0);
}

export function normaliseSkills(skills = {}) {
  const out = {};
  for (const id of Object.keys(skillCatalog())) out[id] = Math.max(0, Math.min(5, Number(skills[id] || 0)));
  return out;
}
