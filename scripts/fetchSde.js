import fs from 'fs';
import https from 'https';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0) return args[idx + 1] || fallback;
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const sources = JSON.parse(fs.readFileSync(path.join(root, 'data/sde/sources.json'), 'utf8'));
const sourceId = arg('source', 'officialLatestJsonl');
const outDir = path.resolve(root, arg('out', './sde-jsonl'));
const source = sources.sources[sourceId];
if (!source) throw new Error(`Unknown SDE source: ${sourceId}`);

function download(url, dest, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Too many redirects while downloading SDE');
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location;
        res.resume();
        if (!next) return reject(new Error('Redirect without location'));
        return resolve(download(new URL(next, url).toString(), dest, redirectCount + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

if (source.repository) {
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, 'eve-china-sde');
  if (!fs.existsSync(target)) {
    const result = spawnSync('git', ['clone', '--depth', '1', source.repository, target], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  console.log(JSON.stringify({ ok: true, source: sourceId, target, note: source.notes }, null, 2));
  process.exit(0);
}

if (!source.url) throw new Error(`SDE source has no url: ${sourceId}`);
fs.mkdirSync(outDir, { recursive: true });
const cacheDir = path.join(root, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const archive = path.join(cacheDir, `${sourceId}.zip`);
console.log(`[SDE] downloading ${source.label}: ${source.url}`);
await download(source.url, archive);
if (source.format?.endsWith('.zip')) {
  const unzip = spawnSync('unzip', ['-o', archive, '-d', outDir], { stdio: 'inherit' });
  if (unzip.status !== 0) throw new Error('unzip failed; install unzip or extract the archive manually');
}
console.log(JSON.stringify({ ok: true, source: sourceId, outDir, archive }, null, 2));
