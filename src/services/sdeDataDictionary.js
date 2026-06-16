import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const manifestPath = path.join(root, 'data/sde/sde_usable_sources.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function truncateExample(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value.length > 96 ? `${value.slice(0, 93)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (typeof value === 'object') return '{object}';
  return String(value);
}

function recordEntries(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.map((value, index) => [String(index), value]);
  if (typeof parsed === 'object') return Object.entries(parsed).map(([key, value]) => [String(key), value]);
  return [];
}

function collectFieldPaths(value, stats, prefix = '', depth = 0, maxDepth = 7) {
  if (depth > maxDepth) return;
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    const field = prefix ? `${prefix}[]` : '[]';
    updateFieldStat(stats, field, value);
    for (const item of value.slice(0, 4)) collectFieldPaths(item, stats, field, depth + 1, maxDepth);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const field = prefix ? `${prefix}.${key}` : key;
      updateFieldStat(stats, field, child);
      collectFieldPaths(child, stats, field, depth + 1, maxDepth);
    }
    return;
  }
  if (prefix) updateFieldStat(stats, prefix, value);
}

function updateFieldStat(stats, field, value) {
  if (!field) return;
  const current = stats.get(field) || { path: field, count: 0, types: new Set(), examples: [] };
  current.count += 1;
  current.types.add(valueType(value));
  const example = truncateExample(value);
  if (example !== undefined && current.examples.length < 3 && !current.examples.some(v => JSON.stringify(v) === JSON.stringify(example))) {
    current.examples.push(example);
  }
  stats.set(field, current);
}

function finalizeFieldStats(stats) {
  return [...stats.values()]
    .map(item => ({
      path: item.path,
      count: item.count,
      types: [...item.types].sort(),
      examples: item.examples
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function hasFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function resolveDatasetFile(dir, source) {
  const candidates = [];
  const files = source.files || {};
  if (files.yaml) candidates.push({ format: 'yaml', path: path.join(dir, files.yaml) });
  if (files.jsonl) candidates.push({ format: 'jsonl', path: path.join(dir, files.jsonl) });
  for (const candidate of candidates) {
    if (hasFile(candidate.path)) return candidate;
  }
  return { format: 'missing', path: candidates[0]?.path || path.join(dir, `${source.key}.yaml`) };
}

async function scanJsonl(filePath, options = {}) {
  const sampleRecords = Number(options.sampleRecords || 8);
  const recordLimit = Number(options.recordLimit || 0);
  const fields = new Map();
  const samples = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  let badLines = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      const key = record._key ?? record.typeID ?? record.typeId ?? record.id ?? count;
      if (samples.length < sampleRecords) samples.push({ key: String(key), record: summarizeRecord(record) });
      collectFieldPaths(record, fields);
      count += 1;
      if (recordLimit && count >= recordLimit) break;
    } catch {
      badLines += 1;
    }
  }
  return { count, badLines, fields: finalizeFieldStats(fields), samples };
}

async function scanYaml(filePath, options = {}) {
  const sampleRecords = Number(options.sampleRecords || 8);
  const recordLimit = Number(options.recordLimit || 0);
  const fields = new Map();
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(text);
  const entries = recordEntries(parsed);
  const samples = [];
  let count = 0;
  for (const [key, record] of entries) {
    if (samples.length < sampleRecords) samples.push({ key, record: summarizeRecord(record) });
    collectFieldPaths(record, fields);
    count += 1;
    if (recordLimit && count >= recordLimit) break;
  }
  return { count: entries.length, scannedRecords: count, badLines: 0, fields: finalizeFieldStats(fields), samples };
}

function summarizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const summary = {};
  for (const [key, value] of Object.entries(record).slice(0, 16)) summary[key] = truncateExample(value);
  return summary;
}

function buildUsageMatrix(sources) {
  const byDomain = new Map();
  for (const source of sources) {
    for (const domain of asArray(source.domain)) {
      const entry = byDomain.get(domain) || { domain, sources: [], usableFor: [] };
      entry.sources.push(source.key);
      for (const use of asArray(source.usableFor)) {
        if (!entry.usableFor.includes(use)) entry.usableFor.push(use);
      }
      byDomain.set(domain, entry);
    }
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

export async function scanSdeDirectory(dir, options = {}) {
  const manifest = readJson(manifestPath);
  const absoluteDir = path.resolve(dir);
  const sources = [];
  for (const source of manifest.sources) {
    const resolved = resolveDatasetFile(absoluteDir, source);
    const base = {
      key: source.key,
      priority: source.priority,
      domain: source.domain || [],
      usableFor: source.usableFor || [],
      primaryFields: source.primaryFields || [],
      relations: source.relations || [],
      importPlan: source.importPlan,
      expectedFiles: source.files,
      file: resolved.path,
      format: resolved.format,
      exists: resolved.format !== 'missing'
    };
    if (!base.exists) {
      sources.push({ ...base, recordCount: 0, fields: [], samples: [] });
      continue;
    }
    const scanned = resolved.format === 'jsonl'
      ? await scanJsonl(resolved.path, options)
      : await scanYaml(resolved.path, options);
    sources.push({ ...base, recordCount: scanned.count, scannedRecords: scanned.scannedRecords ?? scanned.count, badLines: scanned.badLines, fields: scanned.fields, samples: scanned.samples });
  }
  return {
    schemaVersion: manifest.schemaVersion,
    generatedAt: new Date().toISOString(),
    sourceRepository: manifest.sourceRepository,
    sourceDirectory: absoluteDir,
    options: {
      sampleRecords: Number(options.sampleRecords || 8),
      recordLimit: Number(options.recordLimit || 0)
    },
    summary: {
      totalSources: sources.length,
      presentSources: sources.filter(s => s.exists).length,
      missingSources: sources.filter(s => !s.exists).map(s => s.key),
      totalRecords: sources.reduce((sum, s) => sum + Number(s.recordCount || 0), 0)
    },
    usageMatrix: buildUsageMatrix(manifest.sources),
    sources
  };
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderSdeDictionaryMarkdown(report) {
  const lines = [];
  lines.push('# SDE 数据字典扫描报告');
  lines.push('');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`数据目录：\`${report.sourceDirectory}\``);
  lines.push(`数据源：${report.sourceRepository}`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | ---: |');
  lines.push(`| 扫描源定义 | ${report.summary.totalSources} |`);
  lines.push(`| 实际存在 | ${report.summary.presentSources} |`);
  lines.push(`| 缺失 | ${report.summary.missingSources.length} |`);
  lines.push(`| 记录数合计 | ${report.summary.totalRecords} |`);
  lines.push('');
  lines.push('## 游戏系统可用性矩阵');
  lines.push('');
  lines.push('| 游戏域 | SDE 文件 | 可用于 |');
  lines.push('| --- | --- | --- |');
  for (const row of report.usageMatrix) {
    lines.push(`| ${mdEscape(row.domain)} | ${mdEscape(row.sources.join(', '))} | ${mdEscape(row.usableFor.slice(0, 8).join('；'))} |`);
  }
  lines.push('');
  lines.push('## 文件级数据字典');
  for (const source of report.sources) {
    lines.push('');
    lines.push(`### ${source.key}`);
    lines.push('');
    lines.push(`- 状态：${source.exists ? '已发现' : '缺失'}`);
    lines.push(`- 格式：${source.format}`);
    lines.push(`- 路径：\`${source.file}\``);
    lines.push(`- 优先级：${source.priority}`);
    lines.push(`- 记录数：${source.recordCount}`);
    lines.push(`- 游戏域：${asArray(source.domain).join(', ')}`);
    lines.push(`- 导入策略：${source.importPlan || ''}`);
    if (source.relations?.length) lines.push(`- 关系：${source.relations.join('；')}`);
    lines.push('');
    lines.push('| 字段路径 | 出现次数 | 类型 | 示例 |');
    lines.push('| --- | ---: | --- | --- |');
    for (const field of source.fields.slice(0, 80)) {
      lines.push(`| ${mdEscape(field.path)} | ${field.count} | ${mdEscape(field.types.join(', '))} | ${mdEscape(field.examples.map(v => JSON.stringify(v)).join(', '))} |`);
    }
    if (!source.fields.length) lines.push('| - | 0 | - | - |');
  }
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push('- 技能不应手写：用 `types + groups/categories + typeDogma + dogmaAttributes` 生成技能字典、训练时间、前置需求和效果。');
  lines.push('- 装配不应手写：用 `typeDogma + dogmaEffects + dogmaAttributes` 生成槽位、CPU、PG、硬点、主动/被动效果和消耗。');
  lines.push('- 种族初始包不应手写固定物品：用 `races + bloodlines + factions + types + marketGroups + typeDogma` 生成可配置候选池。');
  lines.push('- 工业、精炼、星图和异常都可以继续从 SDE 派生：分别使用 `blueprints/typeMaterials/mapSolarSystems/mapStargates/dungeons`。');
  return `${lines.join('\n')}\n`;
}
