import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new Map();

export function configPath(...parts) {
  return path.join(root, ...parts);
}

export function loadJsonConfig(relativePath, { reload = false } = {}) {
  const full = path.join(root, relativePath);
  if (!reload && cache.has(full)) return cache.get(full);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  cache.set(full, parsed);
  return parsed;
}

export function clearJsonConfigCache() {
  cache.clear();
}
