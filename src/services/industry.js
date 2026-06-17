// Pure, side-effect-free reprocessing/refine math derived from SDE typeMaterials.
// No DB, no I/O — deterministic so it can be unit-tested directly.

// Reprocessing batches ore by `portionSize` (EVE semantics). A full batch of
// `portionSize` units yields `material.quantity * efficiency` of each mineral.
//
// Batching rule (deterministic):
//   - whole = Math.floor(quantity / portionSize)  → number of complete batches
//   - if quantity >= portionSize: reprocess only whole batches.
//       batchesUsed = whole, batches (for math) = whole, consumed = whole * portionSize.
//   - if quantity <  portionSize: allow a single fractional batch so small refines
//       still yield something. batches = quantity / portionSize (fractional),
//       consumed = quantity (the whole stack is reprocessed).
//   per material: outQty = Math.floor(batches * material.quantity * efficiency); zeros skipped.
export function computeRefineYield(oreType, quantity, efficiency) {
  const portionSize = Math.max(1, Number(oreType?.portionSize || 1));
  const qty = Math.max(0, Number(quantity || 0));
  const eff = Math.max(0, Number(efficiency || 0));
  const materials = Array.isArray(oreType?.materials) ? oreType.materials : [];

  const whole = Math.floor(qty / portionSize);
  let batches;
  let consumed;
  if (qty >= portionSize) {
    batches = whole;
    consumed = whole * portionSize;
  } else {
    // Fractional single batch for sub-portion stacks (qty in (0, portionSize)).
    batches = qty / portionSize;
    consumed = qty;
  }

  const outputs = [];
  if (batches > 0) {
    for (const material of materials) {
      const perBatch = Number(material?.quantity || 0);
      const out = Math.floor(batches * perBatch * eff);
      if (out <= 0) continue;
      outputs.push({ typeId: String(material.typeId), name: material.name || `Type ${material.typeId}`, quantity: out, kind: 'mineral' });
    }
  }

  return { consumed, outputs };
}
