# SDE 数据字典与可用数据清单

## 目标

这份文档确认一件事：技能、装备、装配限制、主动装备效果、弹药消耗、种族初始包不应该手写。EVE SDE 已经提供了大部分源数据，项目应该把手写表降级为 fallback 或平衡覆盖层。

公开数据源：`https://github.com/EVE-China/sde`。

该仓库包含 `yaml/` 目录，当前可直接使用的核心文件包括：

```text
types.yaml
groups.yaml
categories.yaml
marketGroups.yaml
typeDogma.yaml
dogmaAttributes.yaml
dogmaEffects.yaml
dogmaUnits.yaml
typeBonus.yaml
certificates.yaml
masteries.yaml
races.yaml
bloodlines.yaml
ancestries.yaml
blueprints.yaml
typeMaterials.yaml
mapSolarSystems.yaml
mapStargates.yaml
mapRegions.yaml
mapConstellations.yaml
factions.yaml
npcCorporations.yaml
npcStations.yaml
dungeons.yaml
icons.yaml
graphics.yaml
```

## 使用方式

先初始化项目内置的 SDE submodule：

```bash
git submodule update --init --depth 1 sde
```

然后在本项目里扫描：

```bash
npm install
npm run scan:sde -- --dir ./sde/yaml
```

默认输出：

```text
data/generated/sde_data_dictionary.json
docs/generated_sde_data_dictionary.md
```

扫描 JSONL 解压目录也可以：

```bash
npm run scan:sde -- --dir ../sde-jsonl --record-limit 1000
```

`--record-limit` 适合快速查看字段结构；正式生成字典时不要设置限制。

## 数据可用性总表

| 游戏系统 | 主要 SDE 文件 | 能做什么 | 当前项目应该怎么用 |
| --- | --- | --- | --- |
| 技能训练 | `types`, `groups`, `categories`, `typeDogma`, `dogmaAttributes`, `certificates`, `masteries` | 技能类型、技能组、训练等级、训练倍数、前置技能、推荐证书、舰船精通 | 删除手写技能表；导入时生成技能字典和训练树 |
| 技能效果 | `typeDogma`, `dogmaAttributes`, `dogmaEffects`, `typeBonus` | required skill、per-level bonus、属性修正、舰船/模块加成 | 从 Dogma 属性名和 effect 名映射到游戏属性，不写死数值 |
| 舰船属性 | `types`, `groups`, `categories`, `marketGroups`, `typeDogma`, `dogmaAttributes`, `typeBonus` | HP、容量、质量、槽位、炮台/发射器硬点、无人机舱、电容、速度、抗性、舰船加成 | 生成 `ship.stats`、`ship.slots`、`hardpoints`、role bonus |
| 装配限制 | `typeDogma`, `dogmaAttributes`, `dogmaEffects` | CPU、powergrid、calibration、slot、rig size、module online、技能需求 | 装配校验必须由 Dogma 派生，不再根据名字猜槽位 |
| 被动模块 | `typeDogma`, `dogmaEffects`, `dogmaAttributes` | Shield extender、armor plate、damage mod、resistance mod、cargo mod、rig 效果 | 根据 passive effect 和属性修正生成 `effects` |
| 主动模块 | `typeDogma`, `dogmaEffects`, `dogmaAttributes` | cycle time、电容消耗、维修量、推进、扫描、破解、电子战、武器开火 | 根据 active effect 生成循环、消耗和回合效果 |
| 武器系统 | `types`, `marketGroups`, `typeDogma`, `dogmaAttributes`, `dogmaEffects` | 炮台/发射器分类、伤害、射程、跟踪、发射间隔、弹药组、晶体/导弹/炮弹 | 生成武器 profile；战斗回合读取 profile 而不是手写 DPS |
| 消耗品 | `types`, `marketGroups`, `typeDogma`, `dogmaAttributes`, `dogmaEffects` | 弹药、晶体、导弹、脚本、电容注入器装药、维修胶等 | 主动模块循环时消耗对应 charge group/type |
| 种族初始包 | `races`, `bloodlines`, `ancestries`, `factions`, `types`, `marketGroups`, `typeDogma` | 种族、血统、属性倾向、派系身份、对应 T1 新手船/技能/模块候选 | 初始包从种族和派系规则生成，保留最少 fallback |
| 工业制造 | `blueprints`, `types`, `typeMaterials` | 蓝图材料、产物、时间、精炼产物 | 制造和精炼继续由 SDE 驱动 |
| 星图/路线 | `mapSolarSystems`, `mapStargates`, `mapRegions`, `mapConstellations` | 星系、安等、坐标、星门邻接、区域 | 搜打撤风险、收益、路线、低安/零安判断 |
| PvE 异常 | `dungeons`, `types`, `factions`, `npcCorporations` | 异常模板、NPC/派系/站点风味 | 生成简化挂机站点、波次和掉落池 |
| UI/素材引用 | `icons`, `graphics`, `skins`, `skinLicenses` | icon、graphic、skin 元数据 | 用作程序化像素素材映射，不直接打包原始资产 |

## 关键关系图

```text
types.groupID ───────────────> groups.groupID
groups.categoryID ───────────> categories.categoryID
types.marketGroupID ─────────> marketGroups.marketGroupID
marketGroups.parentGroupID ──> marketGroups.marketGroupID

types.typeID ────────────────> typeDogma.typeID
typeDogma.attributeID ───────> dogmaAttributes.attributeID
typeDogma.effectID ─────────> dogmaEffects.effectID
dogmaAttributes.unitID ─────> dogmaUnits.unitID

types.typeID ────────────────> typeBonus.typeID
types.typeID ────────────────> blueprints.blueprintTypeID / product.typeID
blueprints.material.typeID ──> types.typeID
typeMaterials.material.typeID -> types.typeID

races.raceID ────────────────> bloodlines.raceID
bloodlines.bloodlineID ──────> ancestries.bloodlineID
factions.raceIDs ────────────> races.raceID

mapSolarSystems.regionID ────> mapRegions.regionID
mapSolarSystems.constellationID -> mapConstellations.constellationID
mapStargates.solarSystemID ──> mapSolarSystems.solarSystemID
```

## 对上一版 V3 的修正方向

上一版 V3 中的 `data/skills/skills.json`、`data/fitting/rules.json`、`data/game/race_starters.json` 只能作为临时 fallback。下一步应改成：

1. `scan:sde` 生成数据字典。
2. `import:sde` 根据数据字典导入 SDE。
3. 新增 `sdeSkillImporter`：从 `types + groups/categories + typeDogma + dogmaAttributes` 生成技能训练树。
4. 新增 `sdeFittingImporter`：从 `typeDogma + dogmaEffects + dogmaAttributes` 生成槽位、CPU、PG、硬点和模块效果。
5. 新增 `sdeStarterGenerator`：从 `races + factions + types + marketGroups + typeDogma` 生成不同种族初始船、技能、装备和物品。
6. 仅在 SDE 缺失或本地没有导入时，使用 fallback 数据。

## 不能再做的事情

- 不再手写固定技能列表作为主数据源。
- 不再根据模块英文名正则猜测所有装备效果。
- 不再为每个种族手写固定船和模块，而是用 SDE 分类和派系偏好生成候选。
- 不把完整 SDE 原始大文件提交进本仓库；本仓库只提交扫描器、字典 manifest、导入映射和生成结果说明。
