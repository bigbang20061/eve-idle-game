// Verifies the ammo loop closes end-to-end: the seed carries buyable charge types tagged with a
// chargeGroup, a weapon consumes matching charges from cargo, and SDE-calibration rigs now fit.
import fs from 'fs';
import { normalizeSeedType } from '../src/services/catalog.js';
import { shipFromType } from '../src/services/shipFactory.js';
import { moduleInstanceFromType, cycleActiveModules, validateModuleFit } from '../src/services/fittingSystem.js';

const seed = JSON.parse(fs.readFileSync(new URL('../data/default_sde_seed.json', import.meta.url)));
const byId = Object.fromEntries(seed.modules.map(m => [m.id, normalizeSeedType(m, 'module')]));

// 1) Buyable charges exist with a chargeGroup (so market-bought ammo carries a usable group).
const charges = (seed.items || []).filter(i => i.kind === 'charge');
if (charges.length < 4) throw new Error(`expected >=4 buyable charge items, got ${charges.length}`);
const hybrid = charges.find(c => c.chargeGroup === 'hybrid_charge');
if (!hybrid) throw new Error('no hybrid_charge ammo in seed');

// 2) A hybrid weapon consumes hybrid charges from cargo — the loop closes.
const blaster = moduleInstanceFromType(byId['blaster_i']);
if (blaster.mode !== 'weapon') throw new Error('blaster should be a weapon');
const character = {
  skills: { gunnery: 3 }, skillTraining: { active: null, queue: [], history: [] },
  ship: shipFromType({ typeId: 't', name: 'T', stats: { dps: 4, capacitor: 1000, cpu: 1000, powergrid: 1000, calibration: 400, turretHardpoints: 4 }, slots: { high: 4, mid: 2, low: 2, rig: 1 } }),
  cargo: [{ typeId: String(hybrid.typeID || hybrid.id), name: hybrid.name, zh: hybrid.zh, kind: 'charge', chargeGroup: hybrid.chargeGroup, quantity: 100, volume: hybrid.volume, basePrice: hybrid.basePrice }],
  warehouse: { items: [], reserve: new Map() }, stats: {}
};
character.ship.fittedModules = [blaster];
const before = character.cargo[0].quantity;
const active = cycleActiveModules(character, { hp: { shield: 100, armor: 100, hull: 100 }, capacitor: 1000 }, 10, character.ship.stats);
if (!(active.stats.dps > 0)) throw new Error('weapon produced no dps');
if (!(character.cargo[0].quantity < before)) throw new Error('weapon did not consume hybrid charges from cargo — ammo loop still broken');

// 3) cargo_rig (SDE calibration 150) now fits because ship calibration is SDE upgradeCapacity (400).
const shipType = normalizeSeedType(seed.ships.find(s => Number(s.stats?.calibration) >= 150) || seed.ships[0], 'ship');
const rigChar = { skills: { engineering: 5 }, skillTraining: { active: null, queue: [], history: [] }, ship: shipFromType(shipType), warehouse: { items: [], reserve: new Map() }, stats: {} };
const v = validateModuleFit(rigChar, moduleInstanceFromType(byId['cargo_rig']));
if (!v.ok) throw new Error(`cargo_rig should fit now (ship cal ${shipType.stats?.calibration}): ${v.errors.join(', ')}`);

// 4) Two different rigs share no group key (so they could coexist on a multi-rig hull).
const r1 = moduleInstanceFromType(byId['cargo_rig']);
const r2 = moduleInstanceFromType(byId['shield_rig']);
if (r1.groupKey === r2.groupKey) throw new Error(`different rigs must have distinct groupKeys, both ${r1.groupKey}`);

console.log('charge loop smoke ok', { charges: charges.length, consumed: before - character.cargo[0].quantity, dps: Number(active.stats.dps.toFixed(2)), cargoRigFits: v.ok, distinctRigGroups: r1.groupKey !== r2.groupKey });
