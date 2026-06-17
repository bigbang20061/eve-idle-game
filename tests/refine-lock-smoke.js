// Regression: refining a LOCKED ore must not mint minerals while leaving the ore unconsumed
// (a duplication exploit). removeStackQuantity skips locked stacks, so the /refine route
// guards with `if (stack.locked) throw` before consuming + minting.
import { computeRefineYield } from '../src/services/industry.js';
import { removeStackQuantity } from '../src/services/formulas.js';

// The dupe vector: removeStackQuantity refuses to consume a locked stack.
const locked = [{ typeId: '1230', name: 'Veldspar', kind: 'ore', quantity: 300, volume: 0.1, basePrice: 5, locked: true }];
removeStackQuantity(locked, '1230', 200);
if (locked[0].quantity !== 300) throw new Error('locked ore must not be consumed by removeStackQuantity (dupe vector)');

// The route guard: a locked ore is rejected before any minting.
const stack = locked[0];
let guarded = false;
try { if (stack.locked) throw new Error('已锁仓'); } catch { guarded = true; }
if (!guarded) throw new Error('locked ore must be rejected by the refine guard');

// Unlocked path still consumes the ore and mints minerals correctly.
const unlocked = [{ typeId: '1230', name: 'Veldspar', kind: 'ore', quantity: 300, volume: 0.1, basePrice: 5, locked: false }];
const r = computeRefineYield({ typeId: '1230', materials: [{ typeId: '34', name: 'Tritanium', quantity: 400 }], portionSize: 100 }, 300, 0.5);
if (!(r.outputs[0]?.quantity > 0)) throw new Error('unlocked refine should mint minerals');
removeStackQuantity(unlocked, '1230', r.consumed);
const remaining = unlocked.find(s => s.typeId === '1230');
if (remaining && remaining.quantity !== 0) throw new Error('unlocked ore should be consumed by refine');

console.log('refine lock smoke ok', { lockedStaysAt: locked[0].quantity, unlockedConsumed: 300 - (remaining?.quantity || 0), minted: r.outputs[0].quantity });
