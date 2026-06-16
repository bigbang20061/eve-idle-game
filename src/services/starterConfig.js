import { loadJsonConfig } from './jsonConfig.js';

export function getStarterConfig() {
  return loadJsonConfig('data/game/starter_loadouts.json');
}

export function starterRaceOptions() {
  const config = getStarterConfig();
  return {
    version: config.version,
    defaultRace: config.defaultRace,
    races: Object.fromEntries(Object.entries(config.races || {}).map(([id, race]) => [id, {
      id,
      label: race.label || id,
      corp: race.corp,
      credits: race.credits
    }]))
  };
}

export function pickStarterRace(raceId) {
  const config = getStarterConfig();
  const id = String(raceId || config.defaultRace || '').toLowerCase();
  return { id: config.races?.[id] ? id : config.defaultRace, config: config.races?.[id] || config.races?.[config.defaultRace] };
}
