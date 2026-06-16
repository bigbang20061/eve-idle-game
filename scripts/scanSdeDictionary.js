import fs from 'fs';
import path from 'path';
import { scanSdeDirectory, renderSdeDictionaryMarkdown } from '../src/services/sdeDataDictionary.js';

const args = process.argv.slice(2);

function arg(name, fallback = '') {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0) return args[idx + 1] || fallback;
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function flag(name) {
  return args.includes(`--${name}`);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

const dir = arg('dir', process.env.SDE_DIR || '../sde/yaml');
const out = arg('out', 'data/generated/sde_data_dictionary.json');
const markdown = arg('markdown', 'docs/generated_sde_data_dictionary.md');
const sampleRecords = Number(arg('sample-records', '8')) || 8;
const recordLimit = Number(arg('record-limit', '0')) || 0;

if (flag('help') || flag('h')) {
  console.log(`Usage:
  npm run scan:sde -- --dir ../sde/yaml
  npm run scan:sde -- --dir ../sde/yaml --out data/generated/sde_data_dictionary.json --markdown docs/generated_sde_data_dictionary.md
  npm run scan:sde -- --dir ../sde-jsonl --record-limit 1000

Options:
  --dir             SDE yaml or jsonl directory. For EVE-China/sde use its yaml directory.
  --out             JSON dictionary output path.
  --markdown        Markdown report output path. Use empty string to skip.
  --sample-records  Number of record samples per file.
  --record-limit    Limit records scanned per file for field discovery. 0 means full scan.
`);
  process.exit(0);
}

const report = await scanSdeDirectory(dir, { sampleRecords, recordLimit });
ensureParent(out);
fs.writeFileSync(out, JSON.stringify(report, null, 2));

if (markdown) {
  ensureParent(markdown);
  fs.writeFileSync(markdown, renderSdeDictionaryMarkdown(report));
}

console.log(JSON.stringify({
  ok: true,
  sourceDirectory: report.sourceDirectory,
  out: path.resolve(out),
  markdown: markdown ? path.resolve(markdown) : null,
  summary: report.summary
}, null, 2));
