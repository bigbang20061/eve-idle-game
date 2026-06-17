import { computeRefineYield } from '../src/services/industry.js';

// Single-material ore: 250 units, portionSize 100, eff 0.5.
// whole batches = floor(250/100) = 2 -> consumed = 200, output = 2 * 400 * 0.5 = 400.
const single = computeRefineYield(
  { typeId: '1230', name: 'Veldspar', materials: [{ typeId: '34', name: 'Tritanium', quantity: 400 }], portionSize: 100 },
  250,
  0.5
);
if (single.consumed !== 200) throw new Error(`consumed expected 200, got ${single.consumed}`);
if (single.outputs.length !== 1) throw new Error(`expected 1 output, got ${single.outputs.length}`);
if (single.outputs[0].typeId !== '34') throw new Error(`output typeId expected '34', got ${single.outputs[0].typeId}`);
if (single.outputs[0].quantity !== 400) throw new Error(`output quantity expected 400, got ${single.outputs[0].quantity}`);
if (single.outputs[0].kind !== 'mineral') throw new Error(`output kind expected 'mineral', got ${single.outputs[0].kind}`);

// Multi-material ore: 300 units, portionSize 100, eff 0.55 -> 3 batches.
// Trit: floor(3 * 346 * 0.55) = floor(570.9) = 570 (independent floor)
// Mexallon (typeId '36'): floor(3 * 173 * 0.55) = floor(285.45) = 285 (independent floor)
const multi = computeRefineYield(
  {
    typeId: '1228',
    name: 'Scordite',
    materials: [
      { typeId: '34', name: 'Tritanium', quantity: 346 },
      { typeId: '36', name: 'Mexallon', quantity: 173 }
    ],
    portionSize: 100
  },
  300,
  0.55
);
if (multi.consumed !== 300) throw new Error(`multi consumed expected 300, got ${multi.consumed}`);
if (multi.outputs.length !== 2) throw new Error(`multi expected 2 outputs, got ${multi.outputs.length}`);
const trit = multi.outputs.find(o => o.typeId === '34');
const mex = multi.outputs.find(o => o.typeId === '36');
if (!trit || trit.quantity !== 570) throw new Error(`Tritanium expected 570, got ${trit?.quantity}`);
if (!mex || mex.quantity !== 285) throw new Error(`Mexallon expected 285, got ${mex?.quantity}`);
// Outputs are NOT hardcoded: the input material typeId '36' must appear in outputs.
if (!multi.outputs.some(o => o.typeId === '36')) throw new Error("output typeIds must derive from input materials (missing '36')");

// Zero quantity -> nothing consumed, no outputs.
const empty = computeRefineYield(
  { typeId: '1230', name: 'Veldspar', materials: [{ typeId: '34', name: 'Tritanium', quantity: 400 }], portionSize: 100 },
  0,
  0.5
);
if (empty.consumed !== 0) throw new Error(`empty consumed expected 0, got ${empty.consumed}`);
if (empty.outputs.length !== 0) throw new Error(`empty expected 0 outputs, got ${empty.outputs.length}`);

console.log('refine smoke ok', {
  singleConsumed: single.consumed,
  singleOut: single.outputs[0].quantity,
  multiTrit: trit.quantity,
  multiMex: mex.quantity,
  emptyOutputs: empty.outputs.length
});
