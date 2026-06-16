import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rulesPath = path.join(root, 'data/combat/rules.json');
let cached;

export function getCombatRules() {
  if (!cached) cached = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  return cached;
}

export function combatUiOptions() {
  const r = getCombatRules();
  const pickLabel = obj => Object.fromEntries(Object.entries(obj || {}).map(([id, v]) => [id, { label: v.label || id }]));
  return {
    version: r.version,
    damageTypes: r.damageTypes,
    stances: pickLabel(r.stances),
    damageProfiles: pickLabel(r.damageProfiles),
    targetPriorities: pickLabel(r.targetPriorities),
    factions: pickLabel(r.factions)
  };
}

export function pickDamageProfile(id) {
  const r = getCombatRules();
  return r.damageProfiles[id] || r.damageProfiles.balanced;
}

export function pickStance(id) {
  const r = getCombatRules();
  return r.stances[id] || r.stances.standard;
}

export function pickPriority(id) {
  const r = getCombatRules();
  return r.targetPriorities[id] || r.targetPriorities.scramblers_first;
}
