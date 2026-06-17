import fs from 'fs';
import os from 'os';
import path from 'path';
import { StaticSdeStore } from '../src/services/staticSdeStore.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-static-sde-'));
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-static-sde-cache-'));

function write(name, content) {
  fs.writeFileSync(path.join(dir, name), content.trimStart());
}

write('categories.yaml', `
7:
  name:
    en: Module
    zh: 装备
  published: true
16:
  name:
    en: Skill
    zh: 技能
  published: true
6:
  name:
    en: Ship
    zh: 舰船
  published: true
`);

write('groups.yaml', `
255:
  name:
    en: Gunnery
    zh: 炮术
  categoryID: 16
  published: true
25:
  name:
    en: Frigate
    zh: 护卫舰
  categoryID: 6
  published: true
74:
  name:
    en: Hybrid Weapon
    zh: 混合炮
  categoryID: 7
  published: true
`);

write('marketGroups.yaml', `
150:
  name:
    en: Skills
    zh: 技能
300:
  name:
    en: Turrets
    zh: 炮台
`);

write('types.yaml', `
3300:
  name:
    en: Gunnery
    zh: 炮台操作
  groupID: 255
  marketGroupID: 150
  published: true
  basePrice: 20000
603:
  name:
    en: Merlin
    zh: 灰背隼级
  groupID: 25
  published: true
  capacity: 150
12344:
  name:
    en: 125mm Railgun I
    zh: 125mm磁轨炮 I
  groupID: 74
  marketGroupID: 300
  published: true
`);

write('dogmaAttributes.yaml', `
275:
  name: skillTimeConstant
  unitID: 124
  published: true
50:
  name: cpuOutput
  unitID: 30
  published: true
`);

write('dogmaEffects.yaml', `
12:
  effectName: hiPower
  effectCategory: 0
  published: true
`);

write('typeDogma.yaml', `
3300:
  dogmaAttributes:
    - attributeID: 275
      value: 1
603:
  dogmaAttributes:
    - attributeID: 50
      value: 180
  dogmaEffects:
    - effectID: 12
      isDefault: true
`);

write('races.yaml', `
1:
  name:
    en: Caldari
    zh: 加达里
  description:
    en: Caldari State
`);

const store = new StaticSdeStore({ sourceDir: dir, cacheDir, logger: null, autoBuild: true });
if (!store.available()) throw new Error('static SDE should be available');

const skill = await store.getType('3300');
if (skill.kind !== 'skill') throw new Error(`expected skill kind, got ${skill.kind}`);

const moduleResults = await store.searchTypes({ q: 'railgun', kind: 'module', limit: 5 });
if (moduleResults.length !== 1 || moduleResults[0].typeId !== '12344') throw new Error('module search failed');

const races = await store.listRaces();
if (races[0]?.zh !== '加达里') throw new Error('race list failed');

const dogma = await store.getTypeDogma('603');
if (!dogma?.dogmaAttributes?.length) throw new Error('typeDogma lookup failed');

const status = await store.status({ loadCore: true });
if (!status.loadedCollections.includes('types')) throw new Error('status did not load core collections');
if (!status.loadedHotCollections.includes('types')) throw new Error('hot cache did not load types');
if (!status.hotCache.valid) throw new Error('hot cache should be valid');

const warmStore = new StaticSdeStore({ sourceDir: dir, cacheDir, logger: null });
const warmStatus = await warmStore.status();
if (!warmStatus.hotCache.valid) throw new Error('existing hot cache should be reusable');
const warmResults = await warmStore.searchTypes({ q: 'railgun', kind: 'module', limit: 5 });
if (warmResults.length !== 1 || warmResults[0].typeId !== '12344') throw new Error('warm cache module search failed');

console.log('static SDE store smoke ok', {
  sourceDir: status.sourceDir,
  skill: skill.zh,
  modules: moduleResults.length,
  races: races.length
});
