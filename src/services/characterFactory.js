import crypto from 'crypto';
import { Character, SdeType, SdeSystem } from '../models/index.js';

function shipFromType(type) {
  return {
    instanceId: crypto.randomUUID(),
    typeId: String(type.typeId),
    name: type.name,
    zh: type.zh || type.name,
    class: type.groupName || type.role || 'Frigate',
    role: type.role || type.raw?.role || 'starter',
    stats: {
      shield: Number(type.stats?.shield || 100),
      armor: Number(type.stats?.armor || 70),
      hull: Number(type.stats?.hull || 85),
      dps: Number(type.stats?.dps || 7),
      mining: Number(type.stats?.mining || 8),
      hack: Number(type.stats?.hack || 3),
      scan: Number(type.stats?.scan || 5),
      salvage: Number(type.stats?.salvage || 2),
      cargo: Number(type.stats?.cargo || type.capacity || 150),
      oreHold: Number(type.stats?.oreHold || 0),
      extract: Number(type.stats?.extract || 4),
      warpStability: Number(type.stats?.warpStability || 0)
    },
    slots: type.raw?.slots || { high: 2, mid: 2, low: 1, rig: 1 },
    fittedModules: [],
    insured: true,
    skin: 'rookie-blue'
  };
}

export async function createStarterCharacter(user, name) {
  const starterShip = await SdeType.findOne({ kind: 'ship', $or: [{ name: /Venture/i }, { zh: /探索|采矿/ }] }).lean()
    || await SdeType.findOne({ kind: 'ship' }).sort({ basePrice: 1 }).lean();
  const starterSystem = await SdeSystem.findOne({ name: /Jita/i }).lean()
    || await SdeSystem.findOne({ hub: true }).lean()
    || await SdeSystem.findOne({}).sort({ security: -1 }).lean();
  const modules = await SdeType.find({ kind: 'module', $or: [{ name: /Miner|Scanner|Shield|Laser/i }, { zh: /采矿|扫描|护盾|激光/ }] }).limit(4).lean();
  const ship = shipFromType(starterShip || { typeId: 'starter-corvette', name: 'Starter Corvette', zh: '新手轻舟', stats: {}, slots: { high: 2, mid: 2, low: 1, rig: 1 } });
  for (const mod of modules.slice(0, 3)) {
    ship.fittedModules.push({
      instanceId: crypto.randomUUID(),
      typeId: String(mod.typeId),
      name: mod.name,
      zh: mod.zh || mod.name,
      slot: mod.slot || 'high',
      kind: mod.kind || 'module',
      tier: mod.tier || 1,
      effects: mod.effects || {},
      online: true
    });
  }
  const systemId = String(starterSystem?.systemId || '30000142');
  return Character.create({
    userId: user._id,
    name,
    currentSystemId: systemId,
    homeSystemId: systemId,
    cloneStationId: systemId,
    locationState: 'docked',
    credits: 25000,
    ship,
    hangarShips: [],
    cargo: [],
    warehouse: {
      capacity: 50000,
      items: [
        { typeId: '34', name: 'Tritanium', zh: '三钛合金', kind: 'mineral', quantity: 1000, volume: 0.01, basePrice: 6, locked: true, source: 'starter' },
        { typeId: '35', name: 'Pyerite', zh: '类晶体胶矿', kind: 'mineral', quantity: 350, volume: 0.01, basePrice: 12, locked: false, source: 'starter' }
      ],
      reserve: new Map([['34', 500], ['35', 200]])
    },
    autopilot: {
      enabled: true,
      activity: 'mining',
      risk: 0.35,
      targetSystemId: systemId,
      allowLowSec: false,
      sellExcess: true,
      refineOre: false,
      minShieldPct: 0.35,
      loop: true
    },
    expedition: { state: 'idle', progress: 0, enemyHull: 0, hazard: 0, log: ['克隆体激活，领取新手船，等待调度。'] },
    walletJournal: [{ at: new Date(), type: 'grant', amount: 25000, note: '新克隆启动资金' }],
    lastTickAt: new Date()
  });
}
