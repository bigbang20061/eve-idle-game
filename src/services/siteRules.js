import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const siteRulesPath = path.join(root, 'data/combat/site_templates.json');
let cached;
const clampLocal = (value, min, max) => Math.max(min, Math.min(max, value));

export function getSiteRules() {
  if (!cached) cached = JSON.parse(fs.readFileSync(siteRulesPath, 'utf8'));
  return cached;
}

export function bandForSecurity(security) {
  const rules = getSiteRules();
  const sec = Number(security ?? 0.5);
  const band = [...rules.securityBands].sort((a, b) => b.min - a.min).find(b => sec >= Number(b.min));
  return band || rules.securityBands[rules.securityBands.length - 1];
}

export function labelForActivity(activity, tier, rng = Math.random) {
  const labels = getSiteRules().activityLabels[activity] || getSiteRules().activityLabels.mining;
  const index = clampLocal(Math.floor((Number(tier || 1) / 10) * labels.length), 0, labels.length - 1);
  return labels[index] || labels[Math.floor(rng() * labels.length)] || activity;
}
