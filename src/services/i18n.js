import { loadJsonConfig } from './jsonConfig.js';

// All user-facing/localizable strings live in data/i18n/<locale>.json (never hardcoded inline).
// Resolve a key via t('some.key', { var: 'x' }); missing keys fall back to the key itself.
export const DEFAULT_LOCALE = 'zh-CN';
const SUPPORTED = new Set(['zh-CN']);

export function localeFor(locale) {
  return SUPPORTED.has(locale) ? locale : DEFAULT_LOCALE;
}

export function getMessages(locale = DEFAULT_LOCALE) {
  return loadJsonConfig(`data/i18n/${localeFor(locale)}.json`);
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? String(vars[key]) : `{${key}}`));
}

export function t(key, vars = {}, locale = DEFAULT_LOCALE) {
  const messages = getMessages(locale);
  const template = messages[key];
  if (template === undefined) return interpolate(key, vars);
  return interpolate(template, vars);
}

// Convenience for "<category>.<id>" display labels (role.miner, charge.hybrid_charge, slot.high, ...).
export function label(category, id, locale = DEFAULT_LOCALE) {
  return t(`${category}.${id}`, {}, locale);
}
