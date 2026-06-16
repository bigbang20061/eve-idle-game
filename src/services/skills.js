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

export function applyEffectValue(base, def, level) {
  const amount = Number(def?.perLevel || 0) * Number(level || 0);
  if (def?.op === 'mult') return Number(base || 0) * (1 + amount);
  if (def?.op === 'set') return amount;
  return Number(base || 0) + amount;
}

export function collectSkillEffects(character) {
  const out = {};
  for (const [skillId, def] of Object.entries(skillCatalog())) {
    const level = skillLevel(character, skillId);
    if (level <= 0) continue;
    for (const [stat, effect] of Object.entries(def.effects || {})) {
      if (!out[stat]) out[stat] = [];
      out[stat].push({ skillId, level, ...effect });
    }
  }
  return out;
}

export function applySkillEffects(stats, character) {
  const out = { ...stats };
  for (const [stat, entries] of Object.entries(collectSkillEffects(character))) {
    for (const entry of entries) out[stat] = applyEffectValue(out[stat], entry, entry.level);
  }
  return out;
}

export function trainingSeconds(skillId, fromLevel = 0) {
  const rules = getSkillRules();
  const skill = skillCatalog()[skillId];
  if (!skill) throw new Error('技能不存在');
  const next = Number(fromLevel || 0) + 1;
  if (next > Number(skill.maxLevel || 5)) throw new Error('技能已达到上限');
  return Math.round(Number(rules.training.baseSeconds || 900) * Number(skill.rank || 1) * Math.pow(next, Number(rules.training.levelExponent || 1.55)));
}

function ensureTraining(character) {
  if (!character.skillTraining) character.skillTraining = { queue: [] };
  if (!Array.isArray(character.skillTraining.queue)) character.skillTraining.queue = [];
  return character.skillTraining.queue;
}

export function enqueueSkillTraining(character, skillId) {
  const rules = getSkillRules();
  const catalog = skillCatalog();
  if (!catalog[skillId]) throw new Error('技能不存在');
  const q = ensureTraining(character);
  if (q.length >= Number(rules.training.queueLimit || 5)) throw new Error('训练队列已满');
  const current = skillLevel(character, skillId) + q.filter(x => x.skillId === skillId).length;
  const targetLevel = current + 1;
  if (targetLevel > Number(catalog[skillId].maxLevel || 5)) throw new Error('技能已达到上限');
  const seconds = trainingSeconds(skillId, current);
  const job = { skillId, targetLevel, secondsRemaining: seconds, totalSeconds: seconds, queuedAt: new Date() };
  q.push(job);
  character.markModified?.('skillTraining');
  return job;
}

export function tickSkillTraining(character, dt) {
  const q = ensureTraining(character);
  const completed = [];
  let remaining = Number(dt || 0);
  while (remaining > 0 && q.length) {
    const job = q[0];
    job.secondsRemaining = Number(job.secondsRemaining ?? job.totalSeconds ?? 0);
    const step = Math.min(remaining, job.secondsRemaining);
    job.secondsRemaining -= step;
    remaining -= step;
    if (job.secondsRemaining <= 0) {
      character.skills[job.skillId] = Math.max(skillLevel(character, job.skillId), Number(job.targetLevel || 1));
      completed.push({ skillId: job.skillId, level: character.skills[job.skillId] });
      q.shift();
    } else break;
  }
  character.markModified?.('skills');
  character.markModified?.('skillTraining');
  return completed;
}

export function skillUi(character) {
  const catalog = skillCatalog();
  const q = character?.skillTraining?.queue || [];
  return {
    version: getSkillRules().version,
    queueLimit: getSkillRules().training.queueLimit,
    skills: Object.fromEntries(Object.entries(catalog).map(([id, def]) => [id, { ...def, level: skillLevel(character, id), nextSeconds: skillLevel(character, id) < Number(def.maxLevel || 5) ? trainingSeconds(id, skillLevel(character, id)) : 0 }])),
    queue: q.map(job => ({ skillId: job.skillId, targetLevel: job.targetLevel, secondsRemaining: Math.round(Number(job.secondsRemaining || 0)), totalSeconds: Math.round(Number(job.totalSeconds || 0)) }))
  };
}
