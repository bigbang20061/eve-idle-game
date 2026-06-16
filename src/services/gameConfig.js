import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new Map();

export function readGameConfig(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!cache.has(fullPath)) cache.set(fullPath, JSON.parse(fs.readFileSync(fullPath, 'utf8')));
  return cache.get(fullPath);
}

export function gameConfigSummary() {
  return {
    skills: readGameConfig('data/game/skills.json').version,
    fitting: readGameConfig('data/game/fitting_rules.json').version,
    consumables: readGameConfig('data/game/consumables.json').version,
    starters: readGameConfig('data/game/starter_kits.json').version
  };
}
