import path from 'path';
import { getStaticSdeStore } from '../src/services/staticSdeStore.js';

function arg(name, fallback = '') {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const inline = process.argv.find(a => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
}

const sourceDir = arg('source', process.env.SDE_STATIC_DIR || process.env.SDE_DIR || './sde/yaml');
const out = arg('out', process.env.SDE_CACHE_DIR || './data/static-sde-cache');
const force = process.argv.includes('--force');

try {
  const store = getStaticSdeStore({ sourceDir });
  if (!store.available()) throw new Error(`no SDE source found at ${store.sourceDir}`);
  const started = Date.now();
  const result = force
    ? await store.buildCache(out, { builtAt: new Date().toISOString() })
    : await store.ensureCache(out);
  const elapsedMs = Date.now() - started;
  if (result.built === false) {
    console.log(JSON.stringify({ ok: true, built: false, reason: result.reason, cacheDir: result.cacheDir, elapsedMs }, null, 2));
  } else {
    const counts = result.counts || {};
    for (const [collection, n] of Object.entries(counts)) console.log(`[build-sde-cache] ${collection}: ${n}`);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    console.log(JSON.stringify({ ok: true, built: true, cacheDir: result.cacheDir || path.resolve(out), counts, total, elapsedMs }, null, 2));
  }
} catch (error) {
  console.error('[build-sde-cache] failed:', error?.message || error);
  process.exit(1);
}
