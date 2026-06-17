import { marketPrice } from '../src/services/formulas.js';

const type = { typeId: '34', basePrice: 100, rarity: 1 };

// Same systemId + security, only richness differs. Higher richness reduces
// scarcity, which lowers the price. Fixed date for determinism.
const date = new Date(0);
const sysLow = { systemId: '30000142', security: 0.9, richness: 1 };
const sysHigh = { systemId: '30000142', security: 0.9, richness: 3 };

const priceLow = marketPrice(type, sysLow, 'sell', date);
const priceHigh = marketPrice(type, sysHigh, 'sell', date);

if (!(priceLow > 0)) throw new Error(`lowRichness price should be > 0, got ${priceLow}`);
if (!(priceHigh > 0)) throw new Error(`highRichness price should be > 0, got ${priceHigh}`);
if (!(priceHigh < priceLow)) throw new Error(`higher richness price (${priceHigh}) should be < lower richness price (${priceLow})`);

console.log('market richness smoke ok', { lowRichness: priceLow, highRichness: priceHigh });
