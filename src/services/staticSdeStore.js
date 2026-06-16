import fs from 'fs';
import path from 'path';
import readline from 'readline';
import YAML from 'yaml';

const COLLECTIONS = Object.freeze({
  types: 'types',
  groups: 'groups',
  categories: 'categories',
  marketGroups: 'marketGroups',
  typeDogma: 'typeDogma',
  dogmaAttributes: 'dogmaAttributes',
  dogmaEffects: 'dogmaEffects',
  dogmaUnits: 'dogmaUnits',
  typeBonus: 'typeBonus',
  blueprints: 'blueprints',
  typeMaterials: 'typeMaterials',
  races: 'races',
  bloodlines: 'bloodlines',
  ancestries: 'ancestries',
  factions: 'factions',
  mapSolarSystems: 'mapSolarSystems',
  mapStargates: 'mapStargates',
  mapRegions: 'mapRegions',
  mapConstellations: 'mapConstellations',
  npcCorporations: 'npcCorporations',
  npcStations: 'npcStations',
  dungeons: 'dungeons',
  icons: 'icons',
  graphics: 'graphics'
});

function asId(value) {
  return value === undefined || value === null ? '' : String(value);
}

function pickLocalized(raw, prefer = ['zh', 'zh-cn', 'zh_cn', 'en', 'en-us', 'en_us']) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  for (const key of prefer) if (typeof raw[key] === 'string') return raw[key];
  return Object.values(raw).find(value => typeof value === 'string') || '';
}

function englishName(raw) {
  return pickLocalized(raw, ['en', 'en-us', 'en_us', 'zh', 'zh-cn', 'zh_cn']);
}

function zhName(raw) {
  return pickLocalized(raw, ['zh', 'zh-cn', 'zh_cn', 'en', 'en-us', 'en_us']);
}

function unwrapJsonlRecord(obj) {
  if (obj?._value && typeof obj._value === 'object' && !Array.isArray(obj._value)) return { _key: obj._key, ...obj._value };
  return obj;
}

function recordEntries(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.map((value, index) => [String(value?._key ?? index), unwrapJsonlRecord(value)]);
  if (typeof parsed === 'object') return Object.entries(parsed).map(([key, value]) => [String(key), value]);
  return [];
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function resolveSourceDirectory(inputDir = '') {
  const input = path.resolve(inputDir || './sde/yaml');
  if (fileExists(path.join(input, 'types.yaml')) || fileExists(path.join(input, 'types.jsonl'))) return input;
  const yaml = path.join(input, 'yaml');
  if (fileExists(path.join(yaml, 'types.yaml')) || fileExists(path.join(yaml, 'types.jsonl'))) return yaml;
  const jsonl = path.join(input, 'jsonl');
  if (fileExists(path.join(jsonl, 'types.jsonl'))) return jsonl;
  return input;
}

function collectionPath(dir, collection) {
  const base = COLLECTIONS[collection] || collection;
  const yamlPath = path.join(dir, `${base}.yaml`);
  if (fileExists(yamlPath)) return { path: yamlPath, format: 'yaml' };
  const jsonlPath = path.join(dir, `${base}.jsonl`);
  if (fileExists(jsonlPath)) return { path: jsonlPath, format: 'jsonl' };
  return { path: yamlPath, format: 'missing' };
}

function keyFromRecord(collection, obj, fallbackKey = '') {
  const byCollection = {
    types: ['_key', 'typeID', 'typeId'],
    groups: ['_key', 'groupID', 'groupId'],
    categories: ['_key', 'categoryID', 'categoryId'],
    marketGroups: ['_key', 'marketGroupID', 'marketGroupId'],
    dogmaAttributes: ['_key', 'attributeID', 'attributeId'],
    dogmaEffects: ['_key', 'effectID', 'effectId'],
    dogmaUnits: ['_key', 'unitID', 'unitId'],
    typeDogma: ['_key', 'typeID', 'typeId'],
    typeBonus: ['_key', 'typeID', 'typeId'],
    blueprints: ['_key', 'blueprintTypeID', 'blueprintTypeId'],
    races: ['_key', 'raceID', 'raceId'],
    bloodlines: ['_key', 'bloodlineID', 'bloodlineId'],
    ancestries: ['_key', 'ancestryID', 'ancestryId'],
    factions: ['_key', 'factionID', 'factionId'],
    mapSolarSystems: ['_key', 'solarSystemID', 'solarSystemId', 'systemID', 'systemId'],
    mapStargates: ['_key', 'stargateID', 'stargateId'],
    mapRegions: ['_key', 'regionID', 'regionId'],
    mapConstellations: ['_key', 'constellationID', 'constellationId'],
    npcCorporations: ['_key', 'corporationID', 'corporationId'],
    npcStations: ['_key', 'stationID', 'stationId']
  };
  for (const key of byCollection[collection] || ['_key', 'id']) {
    if (obj?.[key] !== undefined && obj?.[key] !== null) return String(obj[key]);
  }
  return String(fallbackKey || '');
}

async function readJsonlMap(filePath, collection) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const records = new Map();
  let badLines = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const raw = unwrapJsonlRecord(JSON.parse(line));
      const key = keyFromRecord(collection, raw);
      if (key) records.set(key, raw);
    } catch {
      badLines += 1;
    }
  }
  return { records, badLines };
}

async function readYamlMap(filePath, collection) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(text);
  const records = new Map();
  for (const [fallbackKey, raw] of recordEntries(parsed)) {
    const key = keyFromRecord(collection, raw, fallbackKey);
    if (key) records.set(key, raw);
  }
  return { records, badLines: 0 };
}

function normalizeCollectionName(collection) {
  const aliases = {
    systems: 'mapSolarSystems',
    solarSystems: 'mapSolarSystems',
    dogma: 'typeDogma',
    attributes: 'dogmaAttributes',
    effects: 'dogmaEffects'
  };
  return aliases[collection] || collection;
}

function inferKind(categoryName, groupName, marketGroupName) {
  const category = String(categoryName || '').toLowerCase();
  const group = String(groupName || '').toLowerCase();
  const market = String(marketGroupName || '').toLowerCase();
  const text = `${category} ${group} ${market}`;
  if (category.includes('skill')) return 'skill';
  if (category.includes('ship')) return 'ship';
  if (category.includes('module') || /weapon|launcher|turret|shield|armor|propulsion|rig|scanner|analyzer|ewar|mining/.test(text)) return 'module';
  if (category.includes('charge') || /ammo|charge|crystal|missile|script/.test(text)) return 'charge';
  if (category.includes('blueprint')) return 'blueprint';
  if (/asteroid|ore|ice/.test(text)) return 'ore';
  if (/material|mineral|salvage|gas/.test(text)) return 'material';
  return categoryName ? categoryName.replace(/\s+/g, '-').toLowerCase() : 'item';
}

export class StaticSdeStore {
  constructor({ sourceDir = '', logger = console } = {}) {
    this.sourceDir = resolveSourceDirectory(sourceDir);
    this.logger = logger;
    this.cache = new Map();
    this.metadata = new Map();
    this.indexCache = null;
  }

  available() {
    return fileExists(path.join(this.sourceDir, 'types.yaml')) || fileExists(path.join(this.sourceDir, 'types.jsonl'));
  }

  async loadCollection(collectionName) {
    const collection = normalizeCollectionName(collectionName);
    if (this.cache.has(collection)) return this.cache.get(collection);
    const resolved = collectionPath(this.sourceDir, collection);
    if (resolved.format === 'missing') {
      const empty = new Map();
      this.cache.set(collection, empty);
      this.metadata.set(collection, { exists: false, format: 'missing', file: resolved.path, records: 0, badLines: 0 });
      return empty;
    }
    const loaded = resolved.format === 'jsonl'
      ? await readJsonlMap(resolved.path, collection)
      : await readYamlMap(resolved.path, collection);
    this.cache.set(collection, loaded.records);
    this.metadata.set(collection, { exists: true, format: resolved.format, file: resolved.path, records: loaded.records.size, badLines: loaded.badLines });
    this.logger?.log?.(`[static-sde] loaded ${collection}: ${loaded.records.size} records from ${resolved.path}`);
    return loaded.records;
  }

  async indexes() {
    if (this.indexCache) return this.indexCache;
    const [groups, categories, marketGroups, dogmaAttributes, dogmaEffects] = await Promise.all([
      this.loadCollection('groups'),
      this.loadCollection('categories'),
      this.loadCollection('marketGroups'),
      this.loadCollection('dogmaAttributes'),
      this.loadCollection('dogmaEffects')
    ]);
    const attributeByName = new Map();
    for (const [attributeId, attr] of dogmaAttributes) {
      const name = attr.name || englishName(attr.displayNameID || attr.displayName) || '';
      if (name) attributeByName.set(String(name).toLowerCase(), { attributeId, ...attr });
    }
    this.indexCache = { groups, categories, marketGroups, dogmaAttributes, dogmaEffects, attributeByName };
    return this.indexCache;
  }

  async getType(typeId) {
    const types = await this.loadCollection('types');
    const raw = types.get(String(typeId));
    return raw ? await this.normalizeType(String(typeId), raw) : null;
  }

  async getTypeDogma(typeId) {
    const dogma = await this.loadCollection('typeDogma');
    return dogma.get(String(typeId)) || null;
  }

  async normalizeType(typeId, raw) {
    const { groups, categories, marketGroups } = await this.indexes();
    const groupId = asId(raw.groupID ?? raw.groupId);
    const marketGroupId = asId(raw.marketGroupID ?? raw.marketGroupId);
    const group = groups.get(groupId);
    const categoryId = asId(group?.categoryID ?? group?.categoryId ?? raw.categoryID ?? raw.categoryId);
    const category = categories.get(categoryId);
    const marketGroup = marketGroups.get(marketGroupId);
    const name = englishName(raw.name || raw.nameID) || raw.name || `Type ${typeId}`;
    const zh = zhName(raw.name || raw.nameID) || name;
    const groupName = englishName(group?.name || group?.nameID) || '';
    const categoryName = englishName(category?.name || category?.nameID) || '';
    const marketGroupName = englishName(marketGroup?.name || marketGroup?.nameID) || '';
    return {
      typeId,
      name,
      zh,
      description: zhName(raw.description || raw.descriptionID),
      groupId,
      groupName,
      categoryId,
      categoryName,
      marketGroupId,
      marketGroupName,
      kind: inferKind(categoryName, groupName, marketGroupName),
      published: Boolean(raw.published),
      volume: Number(raw.volume ?? 0),
      capacity: Number(raw.capacity ?? 0),
      mass: Number(raw.mass ?? 0),
      basePrice: Number(raw.basePrice ?? 0),
      iconId: asId(raw.iconID ?? raw.iconId),
      graphicId: asId(raw.graphicID ?? raw.graphicId),
      source: 'static-sde',
      raw
    };
  }

  async searchTypes({ q = '', kind = '', limit = 100 } = {}) {
    const types = await this.loadCollection('types');
    const needle = String(q || '').trim().toLowerCase();
    const wantedKind = String(kind || '').trim().toLowerCase();
    const results = [];
    for (const [typeId, raw] of types) {
      const normalized = await this.normalizeType(typeId, raw);
      if (wantedKind && normalized.kind !== wantedKind) continue;
      if (needle) {
        const text = `${normalized.typeId} ${normalized.name} ${normalized.zh} ${normalized.groupName} ${normalized.categoryName} ${normalized.marketGroupName}`.toLowerCase();
        if (!text.includes(needle)) continue;
      }
      results.push(normalized);
      if (results.length >= limit) break;
    }
    return results;
  }

  async searchSystems({ q = '', limit = 100 } = {}) {
    const systems = await this.loadCollection('mapSolarSystems');
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    for (const [systemId, raw] of systems) {
      const name = englishName(raw.name || raw.nameID || raw.solarSystemName) || raw.solarSystemName || `System ${systemId}`;
      const zh = zhName(raw.name || raw.nameID) || name;
      if (needle && !`${systemId} ${name} ${zh}`.toLowerCase().includes(needle)) continue;
      out.push({
        systemId,
        name,
        zh,
        regionId: asId(raw.regionID ?? raw.regionId),
        constellationId: asId(raw.constellationID ?? raw.constellationId),
        security: Number(raw.securityStatus ?? raw.security ?? 0),
        center: raw.center || raw.position || null,
        source: 'static-sde',
        raw
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async listRaces() {
    const races = await this.loadCollection('races');
    return [...races.entries()].map(([raceId, raw]) => ({
      raceId,
      name: englishName(raw.name || raw.nameID) || `Race ${raceId}`,
      zh: zhName(raw.name || raw.nameID) || englishName(raw.name || raw.nameID) || `Race ${raceId}`,
      description: zhName(raw.description || raw.descriptionID),
      iconId: asId(raw.iconID ?? raw.iconId),
      source: 'static-sde',
      raw
    }));
  }

  async searchDogmaAttributes({ q = '', limit = 100 } = {}) {
    const attrs = await this.loadCollection('dogmaAttributes');
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    for (const [attributeId, raw] of attrs) {
      const name = raw.name || englishName(raw.displayNameID || raw.displayName) || `Attribute ${attributeId}`;
      const text = `${attributeId} ${name} ${englishName(raw.descriptionID || raw.description || '')}`.toLowerCase();
      if (needle && !text.includes(needle)) continue;
      out.push({ attributeId, name, unitId: asId(raw.unitID ?? raw.unitId), defaultValue: raw.defaultValue, source: 'static-sde', raw });
      if (out.length >= limit) break;
    }
    return out;
  }

  async search({ collection = 'types', q = '', kind = '', limit = 100 } = {}) {
    const normalized = normalizeCollectionName(collection);
    if (normalized === 'types') return { types: await this.searchTypes({ q, kind, limit }) };
    if (normalized === 'mapSolarSystems') return { systems: await this.searchSystems({ q, limit }) };
    if (normalized === 'races') return { races: await this.listRaces() };
    if (normalized === 'dogmaAttributes') return { dogmaAttributes: await this.searchDogmaAttributes({ q, limit }) };
    const records = await this.loadCollection(normalized);
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    for (const [id, raw] of records) {
      const name = englishName(raw.name || raw.nameID || raw.displayNameID || raw.displayName) || id;
      const zh = zhName(raw.name || raw.nameID || raw.displayNameID || raw.displayName) || name;
      if (needle && !`${id} ${name} ${zh}`.toLowerCase().includes(needle)) continue;
      out.push({ id, name, zh, source: 'static-sde', raw });
      if (out.length >= limit) break;
    }
    return { collection: normalized, records: out };
  }

  async status({ loadCore = false } = {}) {
    if (loadCore) await Promise.all(['types', 'groups', 'categories', 'typeDogma', 'dogmaAttributes'].map(name => this.loadCollection(name)));
    const collections = Object.keys(COLLECTIONS).map(name => {
      const resolved = collectionPath(this.sourceDir, name);
      const meta = this.metadata.get(name);
      return {
        name,
        exists: resolved.format !== 'missing',
        loaded: this.cache.has(name),
        format: meta?.format || resolved.format,
        file: meta?.file || resolved.path,
        records: meta?.records || 0,
        badLines: meta?.badLines || 0
      };
    });
    return {
      available: this.available(),
      sourceDir: this.sourceDir,
      collections,
      loadedCollections: [...this.cache.keys()],
      mode: 'filesystem-static-sde',
      note: 'SDE is loaded from local static files and is not imported into MongoDB.'
    };
  }
}

let singleton = null;

export function getStaticSdeStore(options = {}) {
  const sourceDir = options.sourceDir || process.env.SDE_STATIC_DIR || process.env.SDE_DIR || './sde/yaml';
  if (!singleton || singleton.sourceDir !== resolveSourceDirectory(sourceDir)) singleton = new StaticSdeStore({ sourceDir });
  return singleton;
}
