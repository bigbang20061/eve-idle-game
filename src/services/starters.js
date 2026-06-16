import { readGameConfig } from './gameConfig.js';

export function getStarterRules() {
  return readGameConfig('data/game/starter_kits.json');
}

export function getStarterKit(raceId = '') {
  const rules = getStarterRules();
  const id = String(raceId || rules.defaultRace || 'caldari').toLowerCase();
  return { raceId: rules.races?.[id] ? id : rules.defaultRace, kit: rules.races?.[id] || rules.races?.[rules.defaultRace] };
}

export function starterOptions() {
  const rules = getStarterRules();
  return Object.fromEntries(Object.entries(rules.races || {}).map(([id, kit]) => [id, { label: kit.label, description: kit.description }]));
}
