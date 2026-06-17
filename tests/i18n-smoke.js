// Verifies user-facing strings are resolved from the i18n catalog (not hardcoded) and that every
// fitting role / charge group has a label, with interpolation + missing-key fallback working.
import { t, label, getMessages } from '../src/services/i18n.js';
import { loadJsonConfig } from '../src/services/jsonConfig.js';

const rules = loadJsonConfig('data/game/fitting_rules.json');

for (const id of Object.keys(rules.moduleRoles || {})) {
  if (label('role', id) === `role.${id}`) throw new Error(`missing i18n label for role.${id}`);
}
for (const id of Object.keys(rules.chargeGroups || {})) {
  if (label('charge', id) === `charge.${id}`) throw new Error(`missing i18n label for charge.${id}`);
}

// Interpolation of variables.
const msg = t('fit.err.sameGroup', { group: label('role', 'miner'), max: 2 });
if (!msg.includes('采矿器') || !msg.includes('2')) throw new Error(`interpolation failed: ${msg}`);

// Missing key falls back to the key itself (so nothing renders as undefined).
if (t('totally.missing.key') !== 'totally.missing.key') throw new Error('missing key should fall back to the key');

// The fitting_rules config must NOT carry hardcoded display labels anymore.
for (const role of Object.values(rules.moduleRoles || {})) {
  if (role.label !== undefined) throw new Error('moduleRoles must not hardcode label; use i18n');
}

const messages = getMessages('zh-CN');
if (!messages['role.miner']) throw new Error('zh-CN catalog missing role.miner');

console.log('i18n smoke ok', { roleLabel: label('role', 'miner'), chargeLabel: label('charge', 'hybrid_charge'), sameGroup: msg, keys: Object.keys(messages).length });
