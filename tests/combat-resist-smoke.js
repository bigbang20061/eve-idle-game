import { deriveEffectiveStats, seededRandom } from '../src/services/formulas.js';
import { ensureCombat, resolveCombatRound } from '../src/services/combatSystem.js';

function uniformResists(value) {
  const layer = () => ({ em: value, thermal: value, kinetic: value, explosive: value });
  return { shield: layer(), armor: layer(), hull: layer() };
}

// Build an independent (site, character, stats) trio whose ONLY difference is
// the ship resists. Same seed for both so the fight trajectory is identical and
// the only thing that changes is the damage taken by the player.
function buildSetup(resistValue) {
  const character = {
    skills: {},
    skillTraining: { active: null, queue: [], history: [] },
    ship: {
      stats: {
        shield: 600, armor: 400, hull: 300,
        dps: 8, mining: 5, scan: 4, hack: 2, salvage: 1,
        cargo: 200, oreHold: 0, extract: 4, warpStability: 0,
        cpu: 120, powergrid: 40, capacitor: 220, calibration: 100,
        turretHardpoints: 0, launcherHardpoints: 0,
        resists: uniformResists(resistValue)
      },
      slots: { high: 2, mid: 2, low: 1, rig: 1 },
      fittedModules: []
    },
    cargo: [],
    warehouse: { items: [], reserve: new Map() },
    stats: {},
    autopilot: {}
  };
  const stats = deriveEffectiveStats(character);
  const site = { activity: 'combat', tier: 4, name: 't', hp: { shield: 600, armor: 400, hull: 300 }, enemyEhp: 0, danger: 0.6 };
  const rng = seededRandom('resist-test');
  ensureCombat(site, stats, character, rng);
  return { character, stats, site, rng };
}

function runRounds(setup, rounds = 6) {
  let taken = 0;
  for (let i = 0; i < rounds; i += 1) {
    const result = resolveCombatRound({ site: setup.site, character: setup.character, stats: setup.stats, dt: 5, rng: setup.rng });
    taken += Number(result.taken || 0);
  }
  return taken;
}

const takenHigh = runRounds(buildSetup(0.8));
const takenLow = runRounds(buildSetup(0.0));

if (!(takenHigh > 0)) throw new Error(`high-resist taken should be > 0, got ${takenHigh}`);
if (!(takenLow > 0)) throw new Error(`low-resist taken should be > 0, got ${takenLow}`);
if (!(takenHigh < takenLow)) throw new Error(`high-resist taken (${takenHigh}) should be < low-resist taken (${takenLow})`);

console.log('combat resist smoke ok', {
  takenHigh: Number(takenHigh.toFixed(2)),
  takenLow: Number(takenLow.toFixed(2))
});
