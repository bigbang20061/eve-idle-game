import crypto from 'crypto';
import { loadJsonConfig } from './jsonConfig.js';
import { t } from './i18n.js';

export function shipFromType(type = {}, { race = 'independent', skin = 'sde-imported' } = {}) {
  const fitting = loadJsonConfig('data/game/fitting_rules.json');
  const defaults = fitting.shipDefaults || {};
  const stats = {
    shield: Number(type.stats?.shield || 100),
    armor: Number(type.stats?.armor || 80),
    hull: Number(type.stats?.hull || 90),
    dps: Number(type.stats?.dps || 6),
    mining: Number(type.stats?.mining || 0),
    hack: Number(type.stats?.hack || 0),
    scan: Number(type.stats?.scan || 0),
    salvage: Number(type.stats?.salvage || 0),
    cargo: Number(type.stats?.cargo || type.capacity || 120),
    oreHold: Number(type.stats?.oreHold || 0),
    extract: Number(type.stats?.extract || 4),
    warpStability: Number(type.stats?.warpStability || 0),
    cpu: Number(type.stats?.cpu || defaults.cpu || 120),
    powergrid: Number(type.stats?.powergrid || defaults.powergrid || 45),
    capacitor: Number(type.stats?.capacitor || defaults.capacitor || 240),
    turretHardpoints: Number(type.stats?.turretHardpoints || type.raw?.slots?.turret || defaults.turretHardpoints || 0),
    launcherHardpoints: Number(type.stats?.launcherHardpoints || type.raw?.slots?.launcher || defaults.launcherHardpoints || 0),
    calibration: Number(type.stats?.calibration || defaults.calibration || 100),
    ...(type.stats?.resists ? { resists: type.stats.resists } : {})
  };
  return {
    instanceId: crypto.randomUUID(),
    typeId: String(type.typeId || `ship-${crypto.randomUUID()}`),
    name: type.name || 'Starter Corvette',
    zh: type.zh || type.name || t('label.default_ship'),
    class: type.groupName || type.class || 'Ship',
    role: type.role || type.raw?.role || 'general',
    race,
    stats,
    slots: type.slots || type.raw?.slots || { high: 2, mid: 2, low: 1, rig: 1 },
    fittedModules: [],
    activeEffects: [],
    insured: true,
    skin
  };
}

export function shipFromStarterConfig(shipConfig, race) {
  return shipFromType({
    typeId: shipConfig.typeId,
    name: shipConfig.name,
    zh: shipConfig.zh,
    groupName: shipConfig.groupName,
    role: shipConfig.role,
    stats: shipConfig.stats || {},
    slots: shipConfig.slots || { high: 2, mid: 2, low: 1, rig: 1 }
  }, { race, skin: `${race}-starter` });
}
