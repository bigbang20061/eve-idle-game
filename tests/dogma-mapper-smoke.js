import { deriveDogmaTypeData, dogmaUiSummary } from '../src/services/dogmaMapper.js';
import { siteTemplate, seededRandom } from '../src/services/formulas.js';

const rawShip = { dogmaAttributes: { shieldCapacity: 240, armorHP: 180, hp: 160, capacity: 150, hiSlots: 3, medSlots: 2, lowSlots: 1, scanResolution: 350 } };
const ship = deriveDogmaTypeData({ type: { name: 'Probe Frigate', groupName: 'Frigate', capacity: 150 }, raw: rawShip, kind: 'ship', tier: 2 });
if (ship.stats.shield !== 240 || ship.slots.high !== 3) throw new Error('ship dogma mapping failed');
const rawModule = { dogmaAttributes: { emDamage: 12, thermalDamage: 8, damageMultiplier: 2, speed: 4000 } };
const module = deriveDogmaTypeData({ type: { name: 'Small Laser Turret', marketGroupName: 'Turret' }, raw: rawModule, kind: 'module', tier: 1 });
if (module.slot !== 'high' || module.effects.dps <= 0) throw new Error('module dogma mapping failed');
const site = siteTemplate('combat', { security: 0.1, richness: 1.2, danger: 0.8 }, { autopilot: { risk: 0.8 } }, seededRandom('dogma-site'));
if (!site.name || site.tier < 1) throw new Error('site rules failed');
console.log('dogma smoke ok', { version: dogmaUiSummary().version, ship: ship.stats, module: module.effects, site: site.name });
