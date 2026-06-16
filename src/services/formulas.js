import crypto from 'crypto';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function hashString(input) {
  const hash = crypto.createHash('sha256').update(String(input)).digest();
  return hash.readUInt32BE(0);
}

export function seededRandom(seed) {
  let x = (hashString(seed) || 1) >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

export function chooseWeighted(items, rng = Math.random) {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.weight ?? 1)), 0) || items.length;
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, Number(item.weight ?? 1));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export function cargoVolume(stacks = []) {
  return stacks.reduce((sum, stack) => sum + Number(stack.quantity || 0) * Number(stack.volume || 0), 0);
}

export function mergeStack(stacks, incoming) {
  const typeId = String(incoming.typeId);
  const qty = Number(incoming.quantity || 0);
  if (!Number.isFinite(qty) || qty <= 0) return stacks;
  const existing = stacks.find(s => String(s.typeId) === typeId && !s.locked);
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + qty;
    existing.basePrice = incoming.basePrice ?? existing.basePrice;
    existing.volume = incoming.volume ?? existing.volume;
    existing.kind = incoming.kind ?? existing.kind;
    existing.name = incoming.name ?? existing.name;
    existing.zh = incoming.zh ?? existing.zh;
  } else {
    stacks.push({
      typeId,
      name: incoming.name,
      zh: incoming.zh,
      kind: incoming.kind,
      quantity: qty,
      volume: Number(incoming.volume ?? 0.01),
      basePrice: Number(incoming.basePrice ?? 1),
      source: incoming.source || 'loot'
    });
  }
  return stacks;
}

export function removeStackQuantity(stacks, typeId, quantity) {
  let need = Number(quantity || 0);
  for (const stack of stacks) {
    if (String(stack.typeId) !== String(typeId) || stack.locked || need <= 0) continue;
    const take = Math.min(Number(stack.quantity || 0), need);
    stack.quantity -= take;
    need -= take;
  }
  for (let i = stacks.length - 1; i >= 0; i -= 1) {
    if (Number(stacks[i].quantity || 0) <= 0) stacks.splice(i, 1);
  }
  return quantity - need;
}

export function marketPrice(type, system, side = 'sell', date = new Date()) {
  const day = Math.floor(date.getTime() / 86400000);
  const base = Math.max(1, Number(type.basePrice || type.baseValue || 10));
  const security = Number(system?.security ?? 0.5);
  const scarcity = clamp(1.35 - security * 0.45 + Number(type.rarity || 1) * 0.025, 0.75, 2.2);
  const rand = seededRandom(`${type.typeId || type.id}:${system?.systemId || system?.id || 'hub'}:${day}`)();
  const dailyWave = 0.88 + rand * 0.28;
  const spread = side === 'buy' ? 0.92 : 1.08;
  return Math.round(base * scarcity * dailyWave * spread);
}

export function deriveEffectiveStats(character) {
  const shipStats = character.ship?.stats || {};
  const skills = character.skills || {};
  const fitted = character.ship?.fittedModules || [];
  const stats = {
    shield: Number(shipStats.shield || 100),
    armor: Number(shipStats.armor || 70),
    hull: Number(shipStats.hull || 80),
    dps: Number(shipStats.dps || 6),
    mining: Number(shipStats.mining || 5),
    scan: Number(shipStats.scan || 4),
    hack: Number(shipStats.hack || 2),
    salvage: Number(shipStats.salvage || 1),
    cargo: Number(shipStats.cargo || 150),
    oreHold: Number(shipStats.oreHold || 0),
    extract: Number(shipStats.extract || 4),
    warpStability: Number(shipStats.warpStability || 0),
    trade: 1 + Number(skills.trade || 1) * 0.035,
    industry: 1 + Number(skills.industry || 1) * 0.04
  };
  for (const module of fitted) {
    if (module.online === false) continue;
    const effects = module.effects || {};
    for (const [key, value] of Object.entries(effects)) {
      stats[key] = Number(stats[key] || 0) + Number(value || 0);
    }
  }
  stats.dps *= 1 + Number(skills.combat || 1) * 0.045;
  stats.mining *= 1 + Number(skills.mining || 1) * 0.05;
  stats.scan *= 1 + Number(skills.scanning || 1) * 0.045;
  stats.salvage *= 1 + Number(skills.salvage || 1) * 0.035;
  stats.extract *= 1 + Number(skills.security || 1) * 0.03;
  return stats;
}

export function systemBand(system) {
  const sec = Number(system?.security ?? 0.5);
  if (sec >= 0.75) return 'high';
  if (sec >= 0.45) return 'low';
  if (sec >= 0.05) return 'null';
  return 'wormhole';
}

export function siteTemplate(activity, system, character, rng = Math.random) {
  const band = systemBand(system);
  const sec = Number(system?.security ?? 0.5);
  const richness = Number(system?.richness ?? (1.15 - sec * 0.4));
  const baseDanger = Number(system?.danger ?? clamp(0.9 - sec, 0.05, 0.95));
  const risk = Number(character.autopilot?.risk ?? 0.35);
  const roll = rng();
  const tier = clamp(Math.ceil((1 - sec) * 5 + risk * 3 + roll * 2), 1, 10);
  const labels = {
    mining: ['贫瘠小行星带', '富矿异常', '冰矿碎片云', '深核矿脉'],
    ratting: ['海盗巡逻队', '走私仓库', '战列残骸场', '军阀前哨'],
    relic: ['遗迹信号', '沉睡者碎片', '古代数据殿', '失落保险库'],
    data: ['数据中继', '隐蔽监听站', '加密节点', '黑匣子阵列'],
    hauling: ['殖民地急单', '边境补给线', '低安走私线', '零安远征补给'],
    combat: ['赏金猎杀', '死斗信标', '拦截舰队', '主权骚扰战']
  };
  const names = labels[activity] || labels.mining;
  return {
    id: `${activity}-${Date.now()}-${Math.floor(rng() * 100000)}`,
    name: names[Math.min(names.length - 1, Math.floor((tier / 10) * names.length))],
    activity,
    band,
    tier,
    danger: clamp(baseDanger + tier * 0.035 + risk * 0.25, 0.02, 1.5),
    richness: clamp(richness + tier * 0.09, 0.5, 2.8),
    scanNeed: 18 + tier * 9 + (band === 'wormhole' ? 35 : 0),
    fightNeed: 18 + tier * 12,
    lootNeed: 12 + tier * 6,
    enemyEhp: Math.round(30 + tier * 36 + Math.pow(tier, 2) * 3),
    enemyDps: Math.round(2 + tier * 2.8 + (band === 'high' ? 0 : tier * 1.4)),
    createdAt: new Date().toISOString()
  };
}

export function formatISK(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} B ISK`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M ISK`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)} K ISK`;
  return `${Math.round(n)} ISK`;
}

export function safeText(input, max = 280) {
  return String(input || '').replace(/[<>]/g, '').trim().slice(0, max);
}

export function objectIdString(id) {
  return id ? String(id) : '';
}
