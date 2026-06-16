# 静态 SDE 数据源架构

## 结论

SDE 是游戏内容静态数据，不是玩家动态数据。项目不应该把 SDE 全量导入 MongoDB 作为主路径。

新的边界是：

| 数据类型 | 存储位置 | 原因 |
| --- | --- | --- |
| 玩家账号、session、角色、钱包、仓库、飞船实例、舰队、聊天、工业任务 | MongoDB | 这些是会变化的用户/世界状态 |
| EVE SDE：types、groups、categories、typeDogma、dogmaAttributes、races、blueprints、mapSolarSystems 等 | 本地静态文件目录 | 这些是随游戏版本更新的静态内容，不属于用户状态 |
| 从 SDE 派生出的技能树、装配规则、武器 profile、种族初始候选 | 程序启动或按需加载的内存索引/cache | 可以从静态 SDE 重建，不需要写入数据库 |

## 数据源

使用你提供的公开仓库：

```text
https://github.com/EVE-China/sde
```

本项目把该仓库作为 Git submodule 固定到 `./sde`，仓库正文只记录 submodule 指针，不提交完整 SDE 文件：

```bash
git submodule update --init --depth 1 sde
cp .env.example .env
# .env 中设置：
SDE_STATIC_DIR=./sde/yaml
```

Docker：

```bash
git submodule update --init --depth 1 sde
docker compose up --build
```

`docker-compose.yml` 会把 `./sde` 只读挂载到容器的 `/app/sde`，并设置：

```text
SDE_STATIC_DIR=/app/sde/yaml
```

## 新增程序结构

```text
src/services/staticSdeStore.js       # 文件系统 SDE store，按需加载 YAML/JSONL 并缓存
src/routes/staticSdeRoutes.js        # /api/static-sde/* 查询接口
scripts/scanSdeDictionary.js         # 扫描 SDE 并生成数据字典报告
data/sde/sde_usable_sources.json     # SDE 文件可用性 manifest
docs/sde_data_dictionary.md          # 哪些 SDE 文件能用于哪些游戏系统
```

## API

这些 API 读取的是静态 SDE 文件，不查询 MongoDB：

```text
GET /api/static-sde/status?loadCore=true
GET /api/static-sde/search?collection=types&q=Merlin&kind=ship
GET /api/static-sde/search?collection=types&q=Gunnery&kind=skill
GET /api/static-sde/search?collection=systems&q=Jita
GET /api/static-sde/types/:typeId
GET /api/static-sde/races
GET /api/static-sde/dogma-attributes?q=skill
```

返回数据会带：

```json
{
  "source": "static-sde"
}
```

表示这些数据来自本地 SDE 文件，而不是 MongoDB。

## 加载策略

`staticSdeStore` 默认是懒加载：

1. 启动服务时不会把整个 SDE 塞进内存。
2. 第一次查询某个 collection 时才读取对应 YAML/JSONL 文件。
3. 读取后缓存在内存 Map 中。
4. SDE 更新时，重启进程即可重新加载。

当前支持的 collection 包括：

```text
types
groups
categories
marketGroups
typeDogma
dogmaAttributes
dogmaEffects
dogmaUnits
typeBonus
blueprints
typeMaterials
races
bloodlines
ancestries
factions
mapSolarSystems
mapStargates
mapRegions
mapConstellations
npcCorporations
npcStations
dungeons
icons
graphics
```

## 后续迁移计划

当前 PR 先建立静态 SDE store 和 API，避免一次性重写所有游戏逻辑造成大面积回归。

后续应逐步迁移：

| 模块 | 当前状态 | 下一步 |
| --- | --- | --- |
| SDE 查询页 | 可以改用 `/api/static-sde/search` | 前端切换到静态 SDE API |
| 技能系统 | 不再手写技能表 | 从 `types + groups/categories + typeDogma + dogmaAttributes` 生成技能树 |
| 装配系统 | 不再手写槽位和装备效果 | 从 `typeDogma + dogmaEffects + dogmaAttributes` 生成装配约束和主动/被动效果 |
| 武器系统 | 不再写固定武器 profile | 从 `typeDogma` 派生伤害、射程、循环、电容、弹药组 |
| 种族初始包 | 不再固定种族物品 | 从 `races + factions + types + marketGroups` 生成候选池 |
| 市场/工业/星图 | 逐步删除 SDE Mongo 依赖 | 使用静态 store 查询 types、blueprints、mapSolarSystems、mapStargates |

## 原有 `import:sde` 的定位

`npm run import:sde` 可以暂时保留，作为兼容旧功能和开发辅助。但它不再是长期主路径。

长期目标：

```text
MongoDB = 用户动态状态
Static SDE Store = 游戏静态内容
```

这样数据边界更干净，也符合 SDE 的静态属性。
