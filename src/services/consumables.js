import { readGameConfig } from './gameConfig.js';

export function getConsumableRules() {
  return readGameConfig('data/game/consumables.json');
}

export function starterChargeForRace(raceId) {
  const rules = getConsumableRules();
  return rules.starterFallbackCharges?.[raceId] || rules.starterFallbackCharges?.caldari;
}

function textOf(type = {}) {
  return `${type.name || ''} ${type.zh || ''} ${type.groupName || ''} ${type.marketGroupName || ''} ${type.kind || ''}`.toLowerCase();
}

export function damageProfileForCharge(type = {}) {
  if (type.meta?.damageProfile) return type.meta.damageProfile;
  const rules = getConsumableRules();
  const ammo = rules.chargeKinds?.ammo || {};
  const hay = textOf(type);
  for (const entry of ammo.keywordProfiles || []) {
    if ((entry.keywords || []).some(k => hay.includes(String(k).toLowerCase()))) return ammo.profiles?.[entry.profile] || ammo.profiles?.balanced;
  }
  return ammo.profiles?.balanced || { em: 0.25, thermal: 0.25, kinetic: 0.25, explosive: 0.25 };
}

export function chargeStackFromType(type, quantity = 1) {
  const profile = damageProfileForCharge(type);
  return {
    typeId: String(type.typeId),
    name: type.name,
    zh: type.zh || type.name,
    kind: type.kind || 'ammo',
    quantity: Number(quantity || 1),
    volume: Number(type.volume || getConsumableRules().chargeKinds?.ammo?.fallbackVolume || 0.01),
    basePrice: Number(type.basePrice || 1),
    meta: { ...(type.meta || {}), chargeKind: 'ammo', damageProfile: profile }
  };
}

export function isChargeType(type = {}) {
  const hay = textOf(type);
  if (String(type.kind || '').toLowerCase() === 'ammo') return true;
  return /ammo|charge|crystal|missile|rocket|torpedo|frequency|弹药|导弹|火箭|晶体/.test(hay);
}
