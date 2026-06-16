import fs from 'fs';
import path from 'path';
import { getStaticSdeStore } from '../src/services/staticSdeStore.js';

const sourceDir = process.env.SDE_STATIC_DIR || process.env.SDE_DIR || './sde/yaml';
const out = process.env.SDE_SKILLS_OUT || './data/generated/skills_from_sde.json';
const store = getStaticSdeStore({ sourceDir });

function asId(value) {
  return value === undefined || value === null ? '' : String(value);
}

function text(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  return raw.en || raw['en-us'] || raw.en_us || raw.zh || raw['zh-cn'] || raw.zh_cn || Object.values(raw).find(v => typeof v === 'string') || '';
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function attrMap(rawDogma) {
  const out = new Map();
  for (const attr of rawDogma?.dogmaAttributes || rawDogma?.attributes || []) {
    const id = asId(attr.attributeID ?? attr.attributeId ?? attr._key);
    if (id) out.set(id, Number(attr.value ?? attr._value ?? attr.defaultValue ?? 0));
  }
  return out;
}

function findAttributeId(attributeByName, ...names) {
  for (const candidate of names.map(normalize)) {
    const exact = attributeByName.get(candidate);
    if (exact) return exact;
    for (const [name, id] of attributeByName) if (name.includes(candidate)) return id;
  }
  return '';
}

const [types, groups, categories, dogmaAttributes, typeDogma] = await Promise.all([
  store.loadCollection('types'),
  store.loadCollection('groups'),
  store.loadCollection('categories'),
  store.loadCollection('dogmaAttributes'),
  store.loadCollection('typeDogma')
]);

const attributeByName = new Map();
for (const [attributeId, raw] of dogmaAttributes) {
  const name = raw.name || text(raw.displayNameID || raw.displayName) || attributeId;
  attributeByName.set(normalize(name), attributeId);
}
const attrIds = {
  primaryAttribute: findAttributeId(attributeByName, 'primaryAttribute'),
  secondaryAttribute: findAttributeId(attributeByName, 'secondaryAttribute'),
  skillTimeConstant: findAttributeId(attributeByName, 'skillTimeConstant')
};
for (let i = 1; i <= 6; i += 1) {
  attrIds[`requiredSkill${i}`] = findAttributeId(attributeByName, `requiredSkill${i}`);
  attrIds[`requiredSkill${i}Level`] = findAttributeId(attributeByName, `requiredSkill${i}Level`);
}

const skillCategoryIds = new Set();
for (const [categoryId, raw] of categories) {
  if (/skill/i.test(`${text(raw.name || raw.nameID)} ${text(raw.displayName)}`)) skillCategoryIds.add(categoryId);
}
const skillGroupIds = new Set();
for (const [groupId, raw] of groups) {
  const categoryId = asId(raw.categoryID ?? raw.categoryId);
  if (skillCategoryIds.has(categoryId)) skillGroupIds.add(groupId);
}

const skills = [];
for (const [typeId, rawType] of types) {
  const groupId = asId(rawType.groupID ?? rawType.groupId);
  if (!skillGroupIds.has(groupId)) continue;
  const dogma = attrMap(typeDogma.get(typeId));
  const value = id => id ? dogma.get(id) : undefined;
  const prerequisites = [];
  for (let i = 1; i <= 6; i += 1) {
    const requiredType = value(attrIds[`requiredSkill${i}`]);
    if (requiredType) prerequisites.push({ typeId: String(Math.trunc(requiredType)), level: Math.trunc(value(attrIds[`requiredSkill${i}Level`]) || 1) });
  }
  skills.push({
    typeId,
    name: text(rawType.name || rawType.nameID) || `Skill ${typeId}`,
    zh: text(rawType.name || rawType.nameID) || `Skill ${typeId}`,
    groupId,
    groupName: text(groups.get(groupId)?.name || groups.get(groupId)?.nameID),
    rank: Number(value(attrIds.skillTimeConstant) || 1),
    primaryAttribute: value(attrIds.primaryAttribute) ?? null,
    secondaryAttribute: value(attrIds.secondaryAttribute) ?? null,
    prerequisites
  });
}

skills.sort((a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), sourceDir: store.sourceDir, count: skills.length, attributeIds: attrIds, skills }, null, 2));
console.log(JSON.stringify({ ok: true, sourceDir: store.sourceDir, out: path.resolve(out), count: skills.length }, null, 2));
