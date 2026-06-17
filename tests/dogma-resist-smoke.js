import { deriveDogmaTypeData, defaultResists } from '../src/services/dogmaMapper.js';

const result = deriveDogmaTypeData({
  kind: 'ship',
  tier: 1,
  type: { name: 'Test', capacity: 200, groupName: 'Frigate' },
  raw: {
    attributes: {
      shieldCapacity: 240,
      hiSlots: 3,
      medSlots: 2,
      lowSlots: 1,
      shieldEmDamageResonance: 0.5,
      shieldThermalDamageResonance: 0.7,
      shieldKineticDamageResonance: 0.6,
      shieldExplosiveDamageResonance: 0.5,
      armorEmDamageResonance: 0.4,
      armorThermalDamageResonance: 0.65,
      armorKineticDamageResonance: 0.75,
      armorExplosiveDamageResonance: 0.9
    }
  }
});

const stats = result.stats;
const slots = result.slots;
const resists = stats.resists;

// Resonance -> resist is 1 - resonance, clamped to [0, 0.9].
if (resists.shield.em !== 0.5) throw new Error(`shield.em expected 0.5, got ${resists.shield.em}`);
if (Math.abs(resists.shield.thermal - 0.3) > 1e-6) throw new Error(`shield.thermal expected ~0.3, got ${resists.shield.thermal}`);
if (resists.armor.em !== 0.6) throw new Error(`armor.em expected 0.6, got ${resists.armor.em}`);
if (resists.hull.em !== 0.33) throw new Error(`hull.em expected 0.33 (uniform), got ${resists.hull.em}`);

for (const layer of ['shield', 'armor', 'hull']) {
  for (const type of ['em', 'thermal', 'kinetic', 'explosive']) {
    const v = resists[layer][type];
    if (!(v >= 0 && v <= 0.9)) throw new Error(`resist ${layer}.${type} out of [0,0.9]: ${v}`);
  }
}

// Existing derivation must still work alongside resists.
if (stats.shield !== 240) throw new Error(`shield expected 240, got ${stats.shield}`);
if (slots.high !== 3) throw new Error(`slots.high expected 3, got ${slots.high}`);

// defaultResists must be the 3-layer / 4-type shape, all zero.
const def = defaultResists();
for (const layer of ['shield', 'armor', 'hull']) {
  if (!def[layer]) throw new Error(`defaultResists missing layer ${layer}`);
  for (const type of ['em', 'thermal', 'kinetic', 'explosive']) {
    if (def[layer][type] !== 0) throw new Error(`defaultResists ${layer}.${type} expected 0, got ${def[layer][type]}`);
  }
}

console.log('dogma resist smoke ok', {
  shieldEm: resists.shield.em,
  shieldThermal: Number(resists.shield.thermal.toFixed(3)),
  armorEm: resists.armor.em,
  hullEm: resists.hull.em,
  shield: stats.shield,
  highSlots: slots.high
});
