// Regression: a ship WITHOUT SDE resists must keep the rules.json base layer-resist
// floor (not get all-zero resists that override the floor). See deriveEffectiveStats.
import { deriveEffectiveStats, seededRandom } from '../src/services/formulas.js';
import { ensureCombat, resolveCombatRound } from '../src/services/combatSystem.js';

function makeChar(resists) {
  const stats = { shield: 300, armor: 200, hull: 150, dps: 30, mining: 0, hack: 0, scan: 8, salvage: 0, cargo: 200, oreHold: 0, extract: 4, warpStability: 0, cpu: 120, powergrid: 45, capacitor: 240, calibration: 100, turretHardpoints: 1, launcherHardpoints: 1 };
  if (resists !== undefined) stats.resists = resists;
  return { skills: {}, skillTraining: { active: null, queue: [], history: [] }, autopilot: { combat: { stance: 'standard', damageProfile: 'balanced', targetPriority: 'closest' } }, ship: { stats, slots: { high: 1, mid: 1, low: 1, rig: 1 }, fittedModules: [] }, cargo: [], warehouse: { items: [], reserve: new Map() }, stats: {} };
}

// 1) No-resist ship: deriveEffectiveStats must NOT fabricate zeros — layers stay empty so
//    combat's `{...baseLayerResists, ...stats.resists}` keeps the base floor.
const noResist = deriveEffectiveStats(makeChar(undefined));
for (const layer of ['shield', 'armor', 'hull']) {
  if (Object.keys(noResist.resists[layer]).length !== 0) {
    throw new Error(`no-resist ship must leave ${layer} resists empty (base floor applies), got ${JSON.stringify(noResist.resists[layer])}`);
  }
}

// 2) Behavioral: the base-floor ship takes strictly LESS than a ship explicitly given all-zero
//    resists (which overrides the floor). High HP + one round so neither depletes.
function takenOneRound(char) {
  const stats = deriveEffectiveStats(char);
  const site = { activity: 'combat', tier: 5, name: 't', hp: { shield: 5000, armor: 3000, hull: 2000 }, enemyEhp: 0, danger: 0.7 };
  const rng = seededRandom('resist-floor');
  ensureCombat(site, stats, char, rng);
  return resolveCombatRound({ site, character: char, stats, dt: 5, rng }).taken;
}
const allZero = { shield: { em: 0, thermal: 0, kinetic: 0, explosive: 0 }, armor: { em: 0, thermal: 0, kinetic: 0, explosive: 0 }, hull: { em: 0, thermal: 0, kinetic: 0, explosive: 0 } };
const takenBase = takenOneRound(makeChar(undefined));
const takenZero = takenOneRound(makeChar(allZero));
if (!(takenBase < takenZero)) throw new Error(`base-floor ship should take less than all-zero ship: base=${takenBase} zero=${takenZero}`);

console.log('resist floor smoke ok', { emptyLayers: true, takenBase: Math.round(takenBase), takenZero: Math.round(takenZero) });
