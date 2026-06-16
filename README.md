# EVE Idle Game

这是把上一版单文件原型升级后的全栈网络游戏工程：多页面像素前端、Express 5 服务端、Socket.IO 实时频道、MongoDB 持久化账号和游戏状态，并提供 EVE SDE JSON Lines 导入管线。

> 非官方同人/技术原型。EVE、SDE 等名称归其权利方所有。本项目的战斗、工业和经济数值是根据 SDE 字段派生的游戏化规则，不是 EVE Online 官方数值模拟器。

## 已实现内容

- 多页面：指挥室、星图、船坞、仓库、市场、工业、舰队、SDE 资料库、排行榜、管理员导入页。
- 账号登录：注册/登录/退出，密码使用 bcryptjs 哈希，session 存入 MongoDB。
- MongoDB 数据库：账号、角色、库存、市场订单、工业队列、舰队、聊天、世界事件、SDE types/groups/categories/marketGroups/systems/blueprints。
- 网络实时：Socket.IO 在线人数、聊天、本地频道、舰队 Ping、角色状态、世界事件广播。
- 服务端权威挂机：离线收益由服务端 tick 计算，不依赖浏览器开着。
- 搜打撤：扫描、跃迁、战斗、采矿/遗迹/数据/运输、货舱满载、低血线、风险超阈值自动撤离。
- 囤积：站仓、锁仓、保留量、超额卖出、精炼、制造、市场价差。
- SDE 深度利用：types 生成物品/舰船/装备，groups/categories/marketGroups 参与分类，mapSolarSystems 生成星图/风险/收益，blueprints 生成工业队列。

## 快速启动：Docker

```bash
cd eve-idle-game
docker compose up --build
```

浏览器打开：`http://localhost:3000`

默认会自动导入轻量种子并创建演示账号：

- 玩家：`demo / demo1234`
- 管理员：`admin / admin1234`

## 快速启动：本地 Node + MongoDB

```bash
cd eve-idle-game
cp .env.example .env
npm install
npm run seed
npm start
```

## 导入官方 / EVE-China SDE

推荐 JSON Lines 格式。准备好解压后的目录，至少包含：

- `types.jsonl`
- `groups.jsonl`
- `categories.jsonl`
- `marketGroups.jsonl`
- `mapSolarSystems.jsonl`
- `blueprints.jsonl`

命令行导入：

```bash
npm run import:sde -- --dir ./sde-jsonl
```

测试小样本导入：

```bash
npm run import:sde -- --dir ./sde-jsonl --limit 5000
```

管理员网页导入：登录 `admin / admin1234`，进入 `/admin/sde`，填写服务器上的 JSONL 目录。

## 项目结构

```text
src/
  server.js                 Express + Socket.IO 入口
  models/                   MongoDB/Mongoose 模型
  routes/                   页面、API、账号、管理员路由
  services/gameEngine.js    搜打撤、离线收益、工业、舰队 tick
  services/sdeImporter.js   JSONL SDE → MongoDB
  services/catalog.js       内置轻量 SDE 种子和 NPC 市场
public/
  css/pixel.css             像素 UI
  js/app.js                 多页面前端交互和 Canvas
  assets/                   程序生成像素素材、音效、sprite atlas
data/default_sde_seed.json  轻量可玩种子
scripts/                    种子、导入、素材生成工具
tests/                      无数据库烟测和语法检查
```

## 游戏系统说明

### 1. 搜打撤状态机

角色远征状态由服务端维护：

`idle → scanning → warping → fighting/looting → extracting → docked`

触发撤离的条件：货舱接近满载、护盾/结构低于阈值、远征风险超过阈值、舰船被反跳/击毁。

### 2. SDE 字段映射

| SDE 文件 | 游戏用途 |
|---|---|
| `types.jsonl` | 物品、舰船、装备、体积、容量、basePrice、派生属性 |
| `groups.jsonl` / `categories.jsonl` | 判断 ship/module/ore/mineral/salvage/data 等类型 |
| `marketGroups.jsonl` | 市场分类、装备槽位和模块效果推断 |
| `mapSolarSystems.jsonl` | 星图坐标、安等、风险、富集度、贸易枢纽 |
| `blueprints.jsonl` | 产物、材料、生产时间、工业队列 |

### 3. 囤积/工业

- 仓库可设置保留量，自动卖出只卖超过保留量的非锁定库存。
- 矿石可精炼为矿物。
- 蓝图生产会消耗材料，完成后把产物入库。
- 市场价由 `basePrice + 安等 + 富集度 + 每日波动` 派生。

### 4. 多人网络

- 在线玩家会加入 `global`、`system:<systemId>`、`fleet:<fleetId>` 房间。
- 聊天支持全域、本地、舰队频道。
- 舰队有创建、加入、开始、完成和分红。

## 检查

```bash
npm run check
npm run smoke
```

`npm run check` 只做 JS 语法检查，不需要数据库。`npm run smoke` 检查默认种子、市场公式、远征模板。

## 下一步可扩展

- 把舰船和模块槽位改为完全由 dogmaAttributes/dogmaEffects 解释。
- 增加玩家市场订单撮合与税率。
- 增加军团仓库、主权、建筑和星门路线图。
- 增加 GM 后台、日志审计、反作弊和生产部署配置。
