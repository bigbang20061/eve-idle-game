import { ensureCombat, resolveCombatRound } from '../src/services/combatSystem.js';
import { seededRandom } from '../src/services/formulas.js';

const rng = seededRandom('combat-smoke');
const site = { activity: 'combat', tier: 4, name: '测试异常', hp: { shield: 500, armor: 350, hull: 300 }, enemyEhp: 0, danger: 0.6 };
const stats = { shield: 500, armor: 350, hull: 300, dps: 55, scan: 8, warpStability: 0.2 };
const character = { autopilot: { combat: { stance: 'standard', damageProfile: 'balanced', targetPriority: 'scramblers_first' } } };
const combat = ensureCombat(site, stats, character, rng);
if (!combat.waves?.length) throw new Error('combat waves missing');
const before = site.enemyEhp;
const round = resolveCombatRound({ site, character, stats, dt: 5, rng });
if (round.dealt <= 0 || site.enemyEhp >= before) throw new Error('combat damage failed');
console.log('combat smoke ok', { faction: combat.factionLabel, before: Math.round(before), after: Math.round(site.enemyEhp), damage: Math.round(round.dealt) });
