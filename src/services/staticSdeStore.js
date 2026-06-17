import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { once } from 'events';
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

const HOT_CACHE_VERSION = 1;
const HOT_CACHE_FILES = Object.freeze({
  meta: 'meta.json',
  types: 'types.compact.jsonl',
  typeDogma: 'type-dogma.compact.jsonl',
  mapSolarSystems: 'systems.compact.jsonl',
  dogmaAttributes: 'dogma-attributes.compact.jsonl',
  races: 'races.compact.jsonl',
  groups: 'groups.compact.jsonl',
  categories: 'categories.compact.jsonl',
  marketGroups: 'market-groups.compact.jsonl'
});
const HOT_SOURCE_COLLECTIONS = Object.freeze([
  'types',
  'typeDogma',
  'mapSolarSystems',
  'dogmaAttributes',
  'races',
  'groups',
  'categories',
  'marketGroups'
]);
const HOT_COLLECTIONS = Object.freeze(Object.keys(HOT_CACHE_FILES).filter(name => name !== 'meta'));

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

function resolveCacheDirectory(sourceDir, inputDir = '') {
  if (inputDir) return path.resolve(inputDir);
  if (process.env.SDE_STATIC_CACHE_DIR) return path.resolve(process.env.SDE_STATIC_CACHE_DIR);
  return path.resolve('data/static-sde-cache');
}

function collectionPath(dir, collection) {
  const base = COLLECTIONS[collection] || collection;
  const yamlPath = path.join(dir, `${base}.yaml`);
  if (fileExists(yamlPath)) return { path: yamlPath, format: 'yaml' };
  const jsonlPath = path.join(dir, `${base}.jsonl`);
  if (fileExists(jsonlPath)) return { path: jsonlPath, format: 'jsonl' };
  return { path: yamlPath, format: 'missing' };
}

function sourceSignature(sourceDir) {
  const files = {};
  for (const collection of HOT_SOURCE_COLLECTIONS) {
    const resolved = collectionPath(sourceDir, collection);
    if (resolved.format === 'missing') {
      files[collection] = { exists: false, format: 'missing' };
      continue;
    }
    const stat = fs.statSync(resolved.path);
    files[collection] = {
      exists: true,
      format: resolved.format,
      file: path.basename(resolved.path),
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs)
    };
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { hash, files };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonLine(stream, record) {
  if (stream.write(`${JSON.stringify(record)}\n`)) return Promise.resolve();
  return once(stream, 'drain');
}

async function readJsonlArray(filePath) {
  if (!fileExists(filePath)) return [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const records = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
  }
  return records;
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

function compactLookupRecord(id, raw, idKey = 'id') {
  const name = englishName(raw?.name || raw?.nameID || raw?.displayNameID || raw?.displayName) || `${id}`;
  const zh = zhName(raw?.name || raw?.nameID || raw?.displayNameID || raw?.displayName) || name;
  return { [idKey]: String(id), name, zh };
}

function compactDogmaRecord(typeId, raw = {}) {
  return {
    typeId: String(typeId),
    dogmaAttributes: Array.isArray(raw.dogmaAttributes) ? raw.dogmaAttributes.map(attr => ({
      attributeID: attr.attributeID ?? attr.attributeId,
      attributeId: attr.attributeId ?? attr.attributeID,
      value: attr.value ?? attr.defaultValue ?? attr._value
    })) : [],
    dogmaEffects: Array.isArray(raw.dogmaEffects) ? raw.dogmaEffects.map(effect => ({
      effectID: effect.effectID ?? effect.effectId,
      effectId: effect.effectId ?? effect.effectID,
      isDefault: effect.isDefault
    })) : []
  };
}

function compactDogmaAttributeRecord(attributeId, raw = {}) {
  const name = raw.name || englishName(raw.displayNameID || raw.displayName) || `Attribute ${attributeId}`;
  return {
    attributeId: String(attributeId),
    name,
    unitId: asId(raw.unitID ?? raw.unitId),
    defaultValue: raw.defaultValue
  };
}

function compactRaceRecord(raceId, raw = {}) {
  const name = englishName(raw.name || raw.nameID) || `Race ${raceId}`;
  return {
    raceId: String(raceId),
    name,
    zh: zhName(raw.name || raw.nameID) || name,
    iconId: asId(raw.iconID ?? raw.iconId),
    source: 'static-sde-cache'
  };
}

function compactSystemRecord(systemId, raw = {}) {
  const name = englishName(raw.name || raw.nameID || raw.solarSystemName) || raw.solarSystemName || `System ${systemId}`;
  const zh = zhName(raw.name || raw.nameID) || name;
  const record = {
    systemId: String(systemId),
    name,
    zh,
    regionId: asId(raw.regionID ?? raw.regionId),
    constellationId: asId(raw.constellationID ?? raw.constellationId),
    security: Number(raw.securityStatus ?? raw.security ?? 0),
    center: raw.center || raw.position || null,
    source: 'static-sde-cache'
  };
  record.searchText = `${record.systemId} ${record.name} ${record.zh}`.toLowerCase();
  return record;
}

function compactTypeRecord(typeId, raw = {}, indexes = {}) {
  const groupId = asId(raw.groupID ?? raw.groupId);
  const marketGroupId = asId(raw.marketGroupID ?? raw.marketGroupId);
  const group = indexes.groups?.get(groupId);
  const categoryId = asId(group?.categoryID ?? group?.categoryId ?? raw.categoryID ?? raw.categoryId);
  const category = indexes.categories?.get(categoryId);
  const marketGroup = indexes.marketGroups?.get(marketGroupId);
  const name = englishName(raw.name || raw.nameID) || raw.name || `Type ${typeId}`;
  const zh = zhName(raw.name || raw.nameID) || name;
  const groupName = englishName(group?.name || group?.nameID) || group?.name || '';
  const categoryName = englishName(category?.name || category?.nameID) || category?.name || '';
  const marketGroupName = englishName(marketGroup?.name || marketGroup?.nameID) || marketGroup?.name || '';
  const record = {
    typeId: String(typeId),
    name,
    zh,
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
    portionSize: Number(raw.portionSize ?? 1) || 1,
    iconId: asId(raw.iconID ?? raw.iconId),
    graphicId: asId(raw.graphicID ?? raw.graphicId),
    source: 'static-sde-cache'
  };
  record.searchText = `${record.typeId} ${record.name} ${record.zh} ${record.groupName} ${record.categoryName} ${record.marketGroupName}`.toLowerCase();
  return record;
}

export class StaticSdeStore {
  constructor({ sourceDir = '', cacheDir = '', logger = console, autoBuild = false } = {}) {
    this.sourceDir = resolveSourceDirectory(sourceDir);
    this.cacheDir = resolveCacheDirectory(this.sourceDir, cacheDir);
    this.logger = logger;
    this.autoBuild = autoBuild;
    this.cache = new Map();
    this.metadata = new Map();
    this.indexCache = null;
    this.hot = null;
    this.hotLoadPromise = null;
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

  hotCacheMetaPath() {
    return path.join(this.cacheDir, HOT_CACHE_FILES.meta);
  }

  readHotCacheMeta() {
    const metaPath = this.hotCacheMetaPath();
    if (!fileExists(metaPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      return null;
    }
  }

  hotCacheValid(signature = sourceSignature(this.sourceDir)) {
    const meta = this.readHotCacheMeta();
    if (!meta || meta.version !== HOT_CACHE_VERSION || meta.sourceHash !== signature.hash) return false;
    return HOT_COLLECTIONS.every(name => fileExists(path.join(this.cacheDir, HOT_CACHE_FILES[name])));
  }

  async buildHotCache({ force = false } = {}) {
    const signature = sourceSignature(this.sourceDir);
    if (!force && this.hotCacheValid(signature)) return { built: false, cacheDir: this.cacheDir, sourceHash: signature.hash };
    ensureDir(this.cacheDir);
    const tempDir = `${this.cacheDir}.tmp-${process.pid}-${Date.now()}`;
    ensureDir(tempDir);

    const [groups, categories, marketGroups] = await Promise.all([
      this.loadCollection('groups'),
      this.loadCollection('categories'),
      this.loadCollection('marketGroups')
    ]);
    const indexes = { groups, categories, marketGroups };

    const writeCollection = async (collection, mapper, { keepLoaded = false } = {}) => {
      const records = await this.loadCollection(collection);
      const filePath = path.join(tempDir, HOT_CACHE_FILES[collection]);
      const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
      let written = 0;
      try {
        for (const [id, raw] of records) {
          const compact = mapper(id, raw);
          if (!compact) continue;
          await writeJsonLine(stream, compact);
          written += 1;
        }
      } finally {
        stream.end();
        await once(stream, 'finish');
        if (!keepLoaded) this.cache.delete(collection);
      }
      return written;
    };

    const counts = {};
    counts.groups = await writeCollection('groups', (id, raw) => compactLookupRecord(id, raw, 'groupId'), { keepLoaded: true });
    counts.categories = await writeCollection('categories', (id, raw) => compactLookupRecord(id, raw, 'categoryId'), { keepLoaded: true });
    counts.marketGroups = await writeCollection('marketGroups', (id, raw) => compactLookupRecord(id, raw, 'marketGroupId'), { keepLoaded: true });
    counts.types = await writeCollection('types', (id, raw) => compactTypeRecord(id, raw, indexes));
    this.cache.delete('groups');
    this.cache.delete('categories');
    this.cache.delete('marketGroups');
    counts.typeDogma = await writeCollection('typeDogma', compactDogmaRecord);
    counts.mapSolarSystems = await writeCollection('mapSolarSystems', compactSystemRecord);
    counts.dogmaAttributes = await writeCollection('dogmaAttributes', compactDogmaAttributeRecord);
    counts.races = await writeCollection('races', compactRaceRecord);

    fs.writeFileSync(path.join(tempDir, HOT_CACHE_FILES.meta), JSON.stringify({
      version: HOT_CACHE_VERSION,
      sourceDir: this.sourceDir,
      sourceHash: signature.hash,
      sourceFiles: signature.files,
      counts,
      builtAt: new Date().toISOString()
    }, null, 2));

    for (const file of Object.values(HOT_CACHE_FILES)) {
      fs.renameSync(path.join(tempDir, file), path.join(this.cacheDir, file));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    this.cache.clear();
    this.indexCache = null;
    this.logger?.log?.(`[static-sde] built hot cache at ${this.cacheDir}`);
    return { built: true, cacheDir: this.cacheDir, sourceHash: signature.hash, counts };
  }

  async preloadHotData({ rebuild = false, allowBuild = this.autoBuild || rebuild } = {}) {
    if (this.hot && !rebuild) return this.hot;
    if (this.hotLoadPromise && !rebuild) return this.hotLoadPromise;
    this.hotLoadPromise = (async () => {
      if (allowBuild) {
        await this.buildHotCache({ force: rebuild });
      } else if (!this.hotCacheValid()) {
        throw new Error(`static SDE hot cache is missing or stale at ${this.cacheDir}; run npm run build:sde-cache`);
      }
      let loaded;
      try {
        loaded = await this.readHotCacheFiles();
      } catch (error) {
        if (!allowBuild) throw error;
        this.logger?.warn?.(`[static-sde] hot cache read failed, rebuilding: ${error.message}`);
        await this.buildHotCache({ force: true });
        loaded = await this.readHotCacheFiles();
      }
      const { types, typeDogma, systems, dogmaAttributes, races, groups, categories, marketGroups } = loaded;
      const typeById = new Map(types.map(type => [String(type.typeId), type]));
      const typesByKind = new Map();
      for (const type of types) {
        const key = String(type.kind || 'item');
        if (!typesByKind.has(key)) typesByKind.set(key, []);
        typesByKind.get(key).push(type);
      }
      this.hot = {
        version: HOT_CACHE_VERSION,
        cacheDir: this.cacheDir,
        meta: this.readHotCacheMeta(),
        types,
        typeById,
        typesByKind,
        typeDogmaById: new Map(typeDogma.map(record => [String(record.typeId), record])),
        systems,
        systemById: new Map(systems.map(system => [String(system.systemId), system])),
        dogmaAttributes,
        dogmaAttributeById: new Map(dogmaAttributes.map(attr => [String(attr.attributeId), attr])),
        races,
        raceById: new Map(races.map(race => [String(race.raceId), race])),
        groups,
        categories,
        marketGroups
      };
      this.metadata.set('hot-cache', {
        exists: true,
        format: 'jsonl',
        file: this.cacheDir,
        records: types.length + typeDogma.length + systems.length + dogmaAttributes.length + races.length,
        badLines: 0
      });
      this.logger?.log?.(`[static-sde] preloaded hot data: ${types.length} types, ${systems.length} systems`);
      return this.hot;
    })();
    try {
      return await this.hotLoadPromise;
    } finally {
      this.hotLoadPromise = null;
    }
  }

  async readHotCacheFiles() {
    const [
      types,
      typeDogma,
      systems,
      dogmaAttributes,
      races,
      groups,
      categories,
      marketGroups
    ] = await Promise.all([
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.types)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.typeDogma)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.mapSolarSystems)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.dogmaAttributes)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.races)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.groups)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.categories)),
      readJsonlArray(path.join(this.cacheDir, HOT_CACHE_FILES.marketGroups))
    ]);
    return { types, typeDogma, systems, dogmaAttributes, races, groups, categories, marketGroups };
  }

  async getType(typeId) {
    const hot = await this.preloadHotData();
    return hot.typeById.get(String(typeId)) || null;
  }

  async getTypeDogma(typeId) {
    const hot = await this.preloadHotData();
    return hot.typeDogmaById.get(String(typeId)) || null;
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
    const hot = await this.preloadHotData();
    const needle = String(q || '').trim().toLowerCase();
    const wantedKind = String(kind || '').trim().toLowerCase();
    const source = wantedKind ? hot.typesByKind.get(wantedKind) || [] : hot.types;
    const results = [];
    for (const type of source) {
      if (needle && !String(type.searchText || '').includes(needle)) continue;
      results.push(type);
      if (results.length >= limit) break;
    }
    return results;
  }

  async searchSystems({ q = '', limit = 100 } = {}) {
    const hot = await this.preloadHotData();
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    for (const system of hot.systems) {
      if (needle && !String(system.searchText || '').includes(needle)) continue;
      out.push(system);
      if (out.length >= limit) break;
    }
    return out;
  }

  async listRaces() {
    const hot = await this.preloadHotData();
    return hot.races;
  }

  async searchDogmaAttributes({ q = '', limit = 100 } = {}) {
    const hot = await this.preloadHotData();
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    for (const attr of hot.dogmaAttributes) {
      const text = `${attr.attributeId} ${attr.name}`.toLowerCase();
      if (needle && !text.includes(needle)) continue;
      out.push({ ...attr, source: 'static-sde-cache' });
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
    return { collection: normalized, records: [], warning: 'collection is not part of the preloaded static SDE hot cache' };
  }

  async status({ loadCore = false } = {}) {
    if (loadCore) await this.preloadHotData();
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
      cacheDir: this.cacheDir,
      hotCache: {
        loaded: Boolean(this.hot),
        valid: this.hotCacheValid(),
        meta: this.readHotCacheMeta()
      },
      collections,
      loadedCollections: [...new Set([...this.cache.keys(), ...(this.hot ? HOT_COLLECTIONS : [])])],
      loadedRawCollections: [...this.cache.keys()],
      loadedHotCollections: this.hot ? HOT_COLLECTIONS : [],
      mode: 'filesystem-static-sde',
      note: 'Hot SDE collections are compacted into JSONL and preloaded into memory for runtime reads.'
    };
  }
}

let singleton = null;

export function getStaticSdeStore(options = {}) {
  const sourceDir = options.sourceDir || process.env.SDE_STATIC_DIR || process.env.SDE_DIR || './sde/yaml';
  const cacheDir = options.cacheDir || process.env.SDE_STATIC_CACHE_DIR || '';
  const resolvedSource = resolveSourceDirectory(sourceDir);
  const resolvedCache = resolveCacheDirectory(resolvedSource, cacheDir);
  if (!singleton || singleton.sourceDir !== resolvedSource || singleton.cacheDir !== resolvedCache) singleton = new StaticSdeStore({ sourceDir, cacheDir });
  return singleton;
}
