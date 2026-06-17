// End-to-end (no DB) check that the shipped seed carries SDE-derived fitting data and that the
// corrected roles/modes route effects correctly through the live engine.
import fs from 'fs';
import { normalizeSeedType } from '../src/services/catalog.js';
import { shipFromType } from '../src/services/shipFactory.js';
import { moduleInstanceFromType, validateModuleFit, cycleActiveModules } from '../src/services/fittingSystem.js';
import { deriveEffectiveStats } from '../src/services/formulas.js';

const seed = JSON.parse(fs.readFileSync(new URL('../data/default_sde_seed.json', import.meta.url)));
const byId = Object.fromEntries(seed.modules.map(m => [m.id, normalizeSeedType(m, 'module')]));
const mod = id => { const t = byId[id]; if (!t) throw new Error(`missing seed module ${id}`); return t; };

// 1) SDE fitting variety: module CPU is per-module (not one flat per-slot default), ship CPU is per-hull.
const highCpu = new Set(seed.modules.filter(m => m.slot === 'high').map(m => m.cpu));
if (highCpu.size < 3) throw new Error(`module cpu not SDE-varied across high slot: ${[...highCpu]}`);
const shipCpu = new Set(seed.ships.map(s => s.stats?.cpu));
if (shipCpu.size < 3) throw new Error(`ship cpu not SDE-varied per hull: ${[...shipCpu]}`);
if (mod('miner_i').cpu !== 60) throw new Error(`Miner I cpu should be SDE 60, got ${mod('miner_i').cpu}`);

// 2) SDE-derived effect magnitudes landed in the seed.
if (mod('miner_i').effects.mining !== 8) throw new Error('miner mining should be SDE 8');
if (mod('shield_extender').effects.shield !== 120) throw new Error('shield extender buffer should be SDE 120');
if (mod('shield_booster').effects.shieldBoost !== 39) throw new Error('shield booster should emit shieldBoost 39');

// Roomy test hull (test equipment is allowed to be synthetic) to exercise fitting mechanics.
const ship = shipFromType({ typeId: 'test-hull', name: 'Test Hull', stats: { shield: 600, armor: 400, hull: 300, dps: 4, mining: 0, capacitor: 1000, cpu: 2000, powergrid: 2000, calibration: 1000, turretHardpoints: 8, launcherHardpoints: 2 }, slots: { high: 8, mid: 8, low: 8, rig: 3 } });
const character = {
  skills: { mining: 5, shield_operation: 5, navigation: 5, scanning: 5, gunnery: 5, drones: 5, engineering: 5, salvage: 5, amarr_frigate: 5, minmatar_frigate: 5, missiles: 5 },
  skillTraining: { active: null, queue: [], history: [] },
  ship, cargo: [], warehouse: { items: [], reserve: new Map() }, stats: {}
};

// 3) Roles corrected: miner/shield_extender are PASSIVE (effects reach ship stats), probe is a scanner not a weapon.
const miner = moduleInstanceFromType(mod('miner_i'));
if (miner.mode !== 'passive') throw new Error(`miner should be passive, got ${miner.mode}`);
const probe = moduleInstanceFromType(mod('probe_launcher'));
if (probe.role !== 'scanner' || probe.mode === 'weapon') throw new Error(`probe launcher should be passive scanner, got role=${probe.role} mode=${probe.mode}`);

// 4) Passive miner raises the mining work-rate stat (the original bug: it contributed 0).
const base = deriveEffectiveStats(character);
character.ship.fittedModules.push(miner);
const withMiner = deriveEffectiveStats(character);
if (!(withMiner.mining > base.mining)) throw new Error(`passive miner must raise stats.mining (${base.mining} -> ${withMiner.mining})`);

// 5) Passive shield extender adds a real max-shield buffer (original bug: it never applied).
character.ship.fittedModules.push(moduleInstanceFromType(mod('shield_extender')));
const withExt = deriveEffectiveStats(character);
if (!(withExt.shield >= withMiner.shield + 100)) throw new Error(`shield extender buffer not applied (${withMiner.shield} -> ${withExt.shield})`);

// 6) Warp core stabilizer applies warpStability (original bug: warpStrength key was dead).
character.ship.fittedModules.push(moduleInstanceFromType(mod('warp_core')));
const withWarp = deriveEffectiveStats(character);
if (!(withWarp.warpStability >= 2)) throw new Error(`warp stabilizer warpStability not applied, got ${withWarp.warpStability}`);

// 7) Active shield booster actually repairs in combat (original bug: shield/regen key mismatch).
const repChar = { skills: { shield_operation: 5 }, skillTraining: { active: null, queue: [], history: [] }, ship: shipFromType({ typeId: 'rep-hull', name: 'Rep', stats: { shield: 500, armor: 300, hull: 200, capacitor: 1000, cpu: 1000, powergrid: 1000, calibration: 1000 }, slots: { high: 2, mid: 4, low: 2, rig: 1 } }), cargo: [], warehouse: { items: [], reserve: new Map() }, stats: {} };
const booster = moduleInstanceFromType(mod('shield_booster'));
if (booster.mode !== 'active') throw new Error('shield booster should be active');
repChar.ship.fittedModules.push(booster);
const active = cycleActiveModules(repChar, { hp: { shield: 50, armor: 50, hull: 50 }, capacitor: 1000 }, 12, repChar.ship.stats);
if (!(active.repairs.shield > 0)) throw new Error(`active shield repair must fire, got ${JSON.stringify(active.repairs)}`);

// 8) Same-group cap: a 3rd identical utility module is rejected; weapons are NOT capped (bounded by hardpoints).
const sg = { skills: { shield_operation: 5, gunnery: 5, minmatar_frigate: 5 }, skillTraining: { active: null, queue: [], history: [] }, ship: shipFromType({ typeId: 'sg-hull', name: 'SG', stats: { cpu: 4000, powergrid: 4000, calibration: 2000, turretHardpoints: 8 }, slots: { high: 8, mid: 8, low: 8, rig: 3 } }), warehouse: { items: [], reserve: new Map() }, stats: {} };
sg.ship.fittedModules = [moduleInstanceFromType(mod('shield_extender')), moduleInstanceFromType(mod('shield_extender'))];
if (validateModuleFit(sg, moduleInstanceFromType(mod('shield_extender'))).ok) throw new Error('3rd same-group utility module should be rejected');
sg.ship.fittedModules = [moduleInstanceFromType(mod('railgun_i')), moduleInstanceFromType(mod('railgun_i'))];
if (!validateModuleFit(sg, moduleInstanceFromType(mod('railgun_i'))).ok) throw new Error('3rd weapon should fit (gated by hardpoints, not same-group)');

console.log('fitting sde smoke ok', { distinctHighCpu: highCpu.size, distinctShipCpu: shipCpu.size, mining: withMiner.mining, shieldBuffer: withExt.shield, warpStability: withWarp.warpStability, repaired: Math.round(active.repairs.shield) });
