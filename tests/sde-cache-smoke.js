import fs from 'fs';
import os from 'os';
import path from 'path';
import { StaticSdeStore } from '../src/services/staticSdeStore.js';

const tmpSrc = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-sde-cache-src-'));
const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-sde-cache-out-'));

function write(name, content) {
  fs.writeFileSync(path.join(tmpSrc, name), content.trimStart());
}

write('categories.yaml', `
6:
  name: { en: Ship, zh: 舰船 }
  published: true
25:
  name: { en: Asteroid, zh: 小行星 }
  published: true
`);

write('groups.yaml', `
25:
  name: { en: Frigate, zh: 护卫舰 }
  categoryID: 6
  published: true
450:
  name: { en: Veldspar, zh: 维尔德 }
  categoryID: 25
  published: true
`);

write('marketGroups.yaml', `
4:
  name: { en: Ships, zh: 舰船 }
`);

write('types.yaml', `
603:
  name: { en: Merlin, zh: 灰背隼级 }
  groupID: 25
  published: true
  capacity: 150
1230:
  name: { en: Veldspar, zh: 维尔德矿 }
  groupID: 450
  published: true
  portionSize: 100
  volume: 0.1
`);

write('typeDogma.yaml', `
603:
  dogmaAttributes:
    - attributeID: 50
      value: 180
`);

write('dogmaAttributes.yaml', `
50:
  name: cpuOutput
  unitID: 30
  published: true
`);

write('races.yaml', `
1:
  name: { en: Caldari, zh: 加达里 }
`);

write('mapSolarSystems.yaml', `
30000142:
  solarSystemName: { en: Jita }
  securityStatus: 0.946
`);

try {
  // Build the cache from the temp YAML sources into the temp cache dir.
  const builder = new StaticSdeStore({ sourceDir: tmpSrc, cacheDir: tmpCache, logger: null });
  await builder.buildCache(tmpCache, { builtAt: new Date().toISOString() });

  if (!fs.existsSync(path.join(tmpCache, 'meta.json'))) throw new Error('meta.json was not written to cache dir');

  // A fresh store must read from the compiled cache, not the raw YAML.
  const store2 = new StaticSdeStore({ sourceDir: tmpSrc, cacheDir: tmpCache, logger: null });
  const ore = await store2.getType('1230');
  if (!ore) throw new Error('type 1230 not found via cache');
  if (ore.source !== 'static-sde-cache') throw new Error(`expected source 'static-sde-cache', got '${ore.source}'`);
  if (ore.portionSize !== 100) throw new Error(`expected portionSize 100, got ${ore.portionSize}`);

  const ship = await store2.getType('603');
  if (!ship || ship.source !== 'static-sde-cache') throw new Error('ship type not served from cache');

  console.log('sde cache smoke ok', {
    cacheDir: path.basename(tmpCache),
    oreSource: ore.source,
    portionSize: ore.portionSize,
    shipKind: ship.kind
  });
} finally {
  fs.rmSync(tmpSrc, { recursive: true, force: true });
  fs.rmSync(tmpCache, { recursive: true, force: true });
}
