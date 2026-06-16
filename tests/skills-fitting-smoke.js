import { ensureSkillState, startSkillTraining, tickSkillTraining, deriveSkillModifiers } from '../src/services/skillSystem.js';
import { moduleInstanceFromType, validateModuleFit, cycleActiveModules } from '../src/services/fittingSystem.js';

const character = {
  skills: { missiles: 1, engineering: 2, shield_operation: 1 },
  skillTraining: { active: null, queue: [], history: [] },
  ship: {
    stats: { shield: 120, armor: 80, hull: 90, dps: 4, cpu: 120, powergrid: 40, capacitor: 220, launcherHardpoints: 1, turretHardpoints: 1, calibration: 100 },
    slots: { high: 2, mid: 2, low: 1, rig: 1 },
    fittedModules: []
  },
  cargo: [{ typeId: 'ammo-test', name: 'Training Missile', kind: 'charge', chargeGroup: 'missile_charge', quantity: 10, volume: 0.01, basePrice: 1 }],
  warehouse: { items: [], reserve: new Map() },
  stats: {}
};

ensureSkillState(character);
startSkillTraining(character, 'engineering', { now: new Date(0) });
character.skillTraining.active.readyAt = new Date(1);
const done = tickSkillTraining(character, new Date(2));
if (!done.length || character.skills.engineering < 3) throw new Error('skill training did not complete');
const mods = deriveSkillModifiers(character);
if (!mods.cpuMultiplier) throw new Error('skill modifiers missing');

const launcher = moduleInstanceFromType({ typeId: 'launcher-test', name: 'Civilian Light Missile Launcher', kind: 'module', role: 'weapon_launcher', activeEffects: { dps: 7, damageProfile: { kinetic: 1 } }, activation: { autoCycle: true, cycleSeconds: 5, chargeGroup: 'missile_charge', chargesPerCycle: 1 } });
const validation = validateModuleFit(character, launcher);
if (!validation.ok) throw new Error(`launcher should fit: ${validation.errors.join(', ')}`);
character.ship.fittedModules.push(launcher);
const site = { hp: { shield: 100, armor: 100, hull: 100 }, capacitor: 220 };
const active = cycleActiveModules(character, site, 10, character.ship.stats);
if (!active.stats.dps || character.cargo[0].quantity >= 10) throw new Error('active module did not consume charges or produce dps');
console.log('skills fitting smoke ok', { completed: done[0].skillId, dps: active.stats.dps, chargesLeft: character.cargo[0].quantity });
