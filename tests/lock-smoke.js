import { sellExcess } from '../src/services/gameEngine.js';
import { SdeType } from '../src/models/index.js';

// sellExcess looks up a fresh SdeType per stack via `SdeType.findOne({...}).lean()`
// purely for current basePrice; it falls back to the stack itself when none is
// found. Stub the DB boundary so this stays a NO-database smoke test. The stub
// resolves to null, exercising the `|| stack` fallback path in production code.
SdeType.findOne = () => ({ lean: async () => null });

const character = {
  credits: 1000,
  stats: { totalEarned: 0, trades: 0 },
  walletJournal: [],
  expedition: { log: [] },
  autopilot: { sellExcess: true },
  warehouse: {
    items: [
      { typeId: '34', name: 'Tritanium', kind: 'mineral', quantity: 100, volume: 0.01, basePrice: 6, locked: true },
      { typeId: '35', name: 'Pyerite', kind: 'mineral', quantity: 100, volume: 0.01, basePrice: 12, locked: false }
    ],
    reserve: new Map() // reserve 0 -> all non-locked quantity is excess
  }
};
const system = { systemId: '30000142', security: 0.9, richness: 1 };

const result = await sellExcess(character, system);

const trit = character.warehouse.items.find(s => String(s.typeId) === '34');
const pyer = character.warehouse.items.find(s => String(s.typeId) === '35');

// Locked stack must be untouched.
if (!trit) throw new Error('locked Tritanium stack was removed (should be untouched)');
if (trit.quantity !== 100) throw new Error(`locked Tritanium quantity expected 100, got ${trit.quantity}`);

// Unlocked stack must be sold off (reduced to 0 and removed, or quantity < 100).
if (pyer && pyer.quantity >= 100) throw new Error(`unlocked Pyerite should have been reduced, still ${pyer.quantity}`);
if (!(result.sold >= 100)) throw new Error(`expected at least 100 units sold, got ${result.sold}`);
if (!(result.value > 0)) throw new Error(`expected sale value > 0, got ${result.value}`);

console.log('lock smoke ok', {
  sold: result.sold,
  value: result.value,
  lockedTritanium: trit.quantity,
  unlockedPyerite: pyer ? pyer.quantity : 'removed'
});
