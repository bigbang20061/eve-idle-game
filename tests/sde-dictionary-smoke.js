import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanSdeDirectory } from '../src/services/sdeDataDictionary.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-sde-dict-'));

function write(name, content) {
  fs.writeFileSync(path.join(dir, name), content.trimStart());
}

write('categories.yaml', `
7:
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
    zh: 炮台
  categoryID: 7
  published: true
25:
  name:
    en: Frigate
    zh: 护卫舰
  categoryID: 6
  published: true
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
`);

write('dogmaAttributes.yaml', `
275:
  name: skillTimeConstant
  displayNameID:
    en: Training time multiplier
  unitID: 124
  published: true
50:
  name: cpuOutput
  displayNameID:
    en: CPU Output
  unitID: 30
  published: true
`);

write('dogmaEffects.yaml', `
11:
  effectName: loPower
  effectCategory: 0
  published: true
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

const report = await scanSdeDirectory(dir, { sampleRecords: 2 });
const types = report.sources.find(source => source.key === 'types');
const dogma = report.sources.find(source => source.key === 'typeDogma');
if (!types?.exists || types.recordCount !== 2) throw new Error('types scan failed');
if (!dogma?.exists || dogma.recordCount !== 2) throw new Error('typeDogma scan failed');
if (!report.usageMatrix.some(row => row.domain === 'skills')) throw new Error('usage matrix missing skills domain');

console.log('sde dictionary smoke ok', {
  presentSources: report.summary.presentSources,
  totalRecords: report.summary.totalRecords,
  typeFields: types.fields.length
});
