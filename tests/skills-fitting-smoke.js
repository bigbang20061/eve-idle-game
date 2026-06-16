import { buildShipFromType } from '../src/services/shipFactory.js';
import { buildFittedModuleFromType, fittingSummary, moduleEffectsForStats, processActiveModules, validateModuleFit } from '../src/services/fitting.js';
import { enqueueSkillTraining, tickSkillTraining } from '../src/services/skills.js';

const character = {
  skills: { combat: 1, weaponSystems: 1, gunnery: 1, shieldOperation: 1, capacitorManagement: 1, weaponUpgrades: 1 },
  ship: buildShipFromType({ typeId: 'test-ship', name: 'Test Frigate', kind: 'ship', stats: { shield: 100, armor: 80, hull: 90, dps: 5, capacitor: 150, capacitorRecharge: 5 }, slots: { high: 2, mid: 2, low: 1, rig: 1 }, fitting: { cpu: 80, powergrid: 50, calibration: 40, turretHardpoints: 2, launcherHardpoints: 1 } }),
  skillTraining: { queue: [] },
  expedition: { log: [] },
  markModified() {}
};

const turret = buildFittedModuleFromType({ typeId: 'test-turret', name: 'Civilian Pulse Laser', kind: 'module', tier: 1, effects: { dps: 6 } }, character);
turret.charge = { typeId: 'test-crystal', name: 'Test Crystal', zh: '测试晶体', loadedQuantity: 10, chargeKind: 'ammo', damageProfile: { em: 0.6, thermal: 0.4 } };
validateModuleFit(character, turret);
character.ship.fittedModules.push(turret);
const fit = fittingSummary(character);
if (!fit.ok || fit.usage.turretHardpoints !== 1) throw new Error('fitting summary failed');
const effects = moduleEffectsForStats(character, { turretDamage: 1.1 });
if (effects.dps <= 0 || !effects.damageProfile?.em) throw new Error('module effects failed');
const site = { hp: { shield: 20, armor: 80, hull: 90 } };
processActiveModules({ character, site, stats: { capacitor: 150, capacitorRecharge: 5, activeModuleCapCost: 1, shield: 100, armor: 80 }, dt: 20 });
if (character.ship.fittedModules[0].charge.loadedQuantity >= 10) throw new Error('charge consumption failed');
const job = enqueueSkillTraining(character, 'combat');
tickSkillTraining(character, job.totalSeconds + 1);
if (character.skills.combat < 2) throw new Error('skill training failed');
console.log('skills fitting smoke ok', { cpu: fit.usage.cpu, chargeLeft: character.ship.fittedModules[0].charge.loadedQuantity, combat: character.skills.combat });
