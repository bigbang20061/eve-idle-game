// Verifies module effect MAGNITUDES are derived from real SDE dogma attributes × a config scale
// (dogma_mapping.effectDerivations), not hardcoded. Magnitude comes from SDE; scale from config.
import { deriveModuleEffects } from '../src/services/dogmaMapper.js';

function approx(a, b, eps = 0.011) { return Math.abs(Number(a) - Number(b)) <= eps; }

// Each game effect maps from a specific SDE attribute.
const miner = deriveModuleEffects({ miningAmount: 10 });           // ×0.8
if (miner.mining !== 8) throw new Error(`mining expected 8, got ${miner.mining}`);

const turret = deriveModuleEffects({ damageMultiplier: 3.025 });   // ×5
if (!approx(turret.dps, 15.13)) throw new Error(`dps expected ~15.13, got ${turret.dps}`);

const drone = deriveModuleEffects({ droneDamageBonus: 15 });       // ×1 -> dps
if (drone.dps !== 15) throw new Error(`drone dps expected 15, got ${drone.dps}`);

const boost = deriveModuleEffects({ shieldBonus: 26 });            // ×1.5
if (boost.shieldBoost !== 39) throw new Error(`shieldBoost expected 39, got ${boost.shieldBoost}`);

const buffer = deriveModuleEffects({ capacityBonus: 800 });        // ×0.15
if (buffer.shield !== 120) throw new Error(`shield buffer expected 120, got ${buffer.shield}`);

const hack = deriveModuleEffects({ virusStrength: 20 });           // ×0.6
if (hack.hack !== 12) throw new Error(`hack expected 12, got ${hack.hack}`);

const warp = deriveModuleEffects({ warpScrambleStrength: -2 });    // abs ×1
if (warp.warpStability !== 2) throw new Error(`warpStability expected 2, got ${warp.warpStability}`);

const cargo = deriveModuleEffects({ cargoCapacityMultiplier: 1.175 }); // (x-1)×540
if (!approx(cargo.cargo, 94.5)) throw new Error(`cargo expected ~94.5, got ${cargo.cargo}`);

const hull = deriveModuleEffects({ structureHPMultiplier: 0.8 });  // (x-1)×50
if (hull.hull !== -10) throw new Error(`hull expected -10, got ${hull.hull}`);

// Attributes with no derivation produce no effect (those keys stay game-layer in the seed builder).
const none = deriveModuleEffects({ someUnmappedAttribute: 99, accessDifficultyBonus: 5 });
if (Object.keys(none).length !== 0) throw new Error(`unmapped attrs should yield no effect, got ${JSON.stringify(none)}`);

console.log('dogma effects smoke ok', { mining: miner.mining, dps: turret.dps, shieldBoost: boost.shieldBoost, shield: buffer.shield, hack: hack.hack, warpStability: warp.warpStability, cargo: cargo.cargo });
