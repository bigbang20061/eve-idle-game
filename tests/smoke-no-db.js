import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cargoVolume, marketPrice, siteTemplate, seededRandom } from '../src/services/formulas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data/default_sde_seed.json'), 'utf8'));
if (!seed.items?.length || !seed.ships?.length || !seed.systems?.length) throw new Error('default seed incomplete');
const rng = seededRandom('smoke');
const site = siteTemplate('mining', seed.systems[0], { autopilot: { risk: 0.3 } }, rng);
if (!site.name || site.tier < 1) throw new Error('site template broken');
const price = marketPrice(seed.items[0], seed.systems[0], 'sell');
if (price <= 0) throw new Error('market price broken');
const vol = cargoVolume([{ quantity: 10, volume: 0.5 }]);
if (vol !== 5) throw new Error('cargo volume broken');
console.log('smoke ok', { seedItems: seed.items.length, seedShips: seed.ships.length, site: site.name, price });
