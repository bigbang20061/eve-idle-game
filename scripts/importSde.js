import { connectDatabase, closeDatabase } from '../src/db.js';
import { importSdeDirectory } from '../src/services/sdeImporter.js';

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0) return args[idx + 1] || fallback;
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const dir = arg('dir', process.env.SDE_DIR || './sde-jsonl');
const limit = Number(arg('limit', '0')) || 0;
await connectDatabase();
const summary = await importSdeDirectory(dir, { limit });
console.log(JSON.stringify(summary, null, 2));
await closeDatabase();
