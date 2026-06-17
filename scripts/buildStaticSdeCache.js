import { StaticSdeStore } from '../src/services/staticSdeStore.js';

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const sourceDir = argValue('dir', process.env.SDE_STATIC_DIR || process.env.SDE_DIR || './sde/yaml');
const cacheDir = argValue('cache-dir', process.env.SDE_STATIC_CACHE_DIR || 'data/static-sde-cache');
const force = process.argv.includes('--force');

const store = new StaticSdeStore({ sourceDir, cacheDir, autoBuild: true });
const summary = await store.buildHotCache({ force });
await store.preloadHotData();
const status = await store.status();

console.log(JSON.stringify({
  ok: true,
  summary,
  cacheDir: status.cacheDir,
  hotCache: {
    loaded: status.hotCache.loaded,
    valid: status.hotCache.valid,
    counts: status.hotCache.meta?.counts || {}
  }
}, null, 2));
