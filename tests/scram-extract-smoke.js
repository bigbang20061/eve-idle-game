import { shouldExtract } from '../src/services/gameEngine.js';

// Base healthy fixture: light cargo, full HP, no hazard, stable warp.
function makeCharacter(cargo = []) {
  return {
    cargo,
    expedition: { hazard: 0 },
    autopilot: { minShieldPct: 0.35, risk: 0.35 },
    ship: { stats: { shield: 200, armor: 100, hull: 100, cargo: 200, oreHold: 200 } }
  };
}
const stats = { warpStability: 0, cargo: 200, shield: 200, armor: 100, hull: 100 };

// 1) Scram forces extraction regardless of everything else.
const scramReason = shouldExtract(makeCharacter(), stats, { combat: { effects: { scrammed: true } } });
if (!scramReason) throw new Error('scrammed site should force extraction');
if (!scramReason.includes('反跳')) throw new Error(`scram reason should mention 反跳, got "${scramReason}"`);

// 2) Healthy, not scrammed, light cargo -> stay (empty reason).
const stayReason = shouldExtract(makeCharacter([]), stats, { combat: { effects: { scrammed: false } } });
if (stayReason !== '') throw new Error(`healthy ship should not extract, got "${stayReason}"`);

// 3) Cargo above 92% of capacity (200) triggers extraction.
// cargo volume = 190 * 1 = 190 > 184 (0.92 * 200).
const fullReason = shouldExtract(makeCharacter([{ typeId: '34', quantity: 190, volume: 1 }]), stats, { combat: { effects: { scrammed: false } } });
if (!fullReason) throw new Error('cargo-full ship should extract');

console.log('scram extract smoke ok', {
  scramReason,
  stayReason: stayReason === '' ? '(none)' : stayReason,
  fullReason
});
