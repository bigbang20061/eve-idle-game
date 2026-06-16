import crypto from 'crypto';
import { readGameConfig } from './gameConfig.js';

export function fittingRules() {
  return readGameConfig('data/game/fitting_rules.json');
}

export function shipFittingResources(type = {}) {
  const defaults = fittingRules().shipDefaults || {};
  const stats = type.stats || {};
  const rawFitting = type.raw?.fitting || type.fitting || stats.fitting || {};
  return {
    cpu: Number(rawFitting.cpu ?? stats.cpu ?? defaults.cpu ?? 80),
    powergrid: Number(rawFitting.powergrid ?? stats.powergrid ?? defaults.powergrid ?? 45),
    calibration: Number(rawFitting.calibration ?? defaults.calibration ?? 40),
    turretHardpoints: Number(rawFitting.turretHardpoints ?? stats.turretHardpoints ?? defaults.turretHardpoints ?? 2),
    launcherHardpoints: Number(rawFitting.launcherHardpoints ?? stats.launcherHardpoints ?? defaults.launcherHardpoints ?? 2)
  };
}

export function buildShipFromType(type, { skin = 'sde-imported' } = {}) {
  const stats = type.stats || {};
  const defaults = fittingRules().shipDefaults || {};
  return {
    instanceId: crypto.randomUUID(),
    typeId: String(type.typeId),
    name: type.name,
    zh: type.zh || type.name,
    class: type.groupName || type.role || 'Ship',
    role: type.role || type.raw?.role || 'general',
    stats: {
      shield: Number(stats.shield || 100),
      armor: Number(stats.armor || 80),
      hull: Number(stats.hull || 90),
      dps: Number(stats.dps || 6),
      mining: Number(stats.mining || 0),
      hack: Number(stats.hack || 0),
      scan: Number(stats.scan || 0),
      salvage: Number(stats.salvage || 0),
      cargo: Number(stats.cargo || type.capacity || 120),
      oreHold: Number(stats.oreHold || 0),
      extract: Number(stats.extract || 4),
      warpStability: Number(stats.warpStability || 0),
      capacitor: Number(stats.capacitor || defaults.capacitor || 180),
      capacitorRecharge: Number(stats.capacitorRecharge || defaults.capacitorRecharge || 2.4)
    },
    slots: type.raw?.slots || type.slots || { high: 2, mid: 2, low: 1, rig: 1 },
    fitting: shipFittingResources(type),
    fittedModules: [],
    runtime: { capacitor: Number(stats.capacitor || defaults.capacitor || 180) },
    insured: true,
    skin
  };
}
