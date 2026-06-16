# Skills / Fitting / Starter Loadouts V1

## 任务表

| 序号 | 任务 | 状态 | 实现方式 |
| --- | --- | --- | --- |
| 1 | 玩家技能训练和效果 | 已完成初版 | `data/game/skills.json` 配置技能、等级、训练时间、每级效果；`src/services/skillSystem.js` 负责训练队列、完成结算和效果汇总。 |
| 2 | 飞船装配限制 | 已完成初版 | `data/game/fitting_rules.json` 配置槽位资源、挂点、模块角色和技能需求；`src/services/fittingSystem.js` 校验 slot / CPU / powergrid / calibration / hardpoint / skills。 |
| 3 | 装备效果生效 | 已完成初版 | 被动效果在 `deriveEffectiveStats()` 中生效；主动/武器模块在 `resolveCombatRound()` 中通过 `cycleActiveModules()` 消耗电容/弹药并产生 DPS、维修、推进等效果。 |
| 4 | 武器和主动装备消耗品 | 已完成初版 | 弹药/晶体/导弹由 `chargeGroup` 驱动；战斗轮消耗 cargo 中对应 charge，并按配置修改伤害分布和 DPS。 |
| 5 | 不同种族初始包 | 已完成初版 | `data/game/starter_loadouts.json` 定义 Amarr/Caldari/Gallente/Minmatar 的起始技能、船、装备、弹药、矿物和钱包。注册页从 `/api/auth/starter-options` 获取选项。 |
| 6 | 公开 SDE 来源 | 已完成初版 | `data/sde/sources.json` 记录 `EVE-China/sde` 公开仓库和官方 latest JSONL/YAML 下载入口；`scripts/fetchSde.js` 可按配置下载/克隆。 |

## 架构约束

本次没有引入新后端、微服务、前端框架或第二套渲染架构。仍然保持：

```text
client/ 静态前端
Express JSON API
Socket.IO
MongoDB / Mongoose
```

## 配置化边界

新增的主要配置：

```text
data/game/skills.json
data/game/fitting_rules.json
data/game/starter_loadouts.json
data/sde/sources.json
```

业务代码只读取配置、校验和结算；技能数值、模块资源、主动循环、chargeGroup、种族起始包都不写死在路由或战斗循环里。

## 公开 SDE 来源

`EVE-China/sde` 是公开 SDE 仓库，本项目把它记录为可发现的公开来源之一：

```bash
npm run fetch:sde -- --source eveChinaGitHub --out ./vendor-sde
```

如果要直接导入到当前 JSONL 流式导入器，推荐走官方 latest JSON Lines ZIP：

```bash
npm run fetch:sde -- --source officialLatestJsonl --out ./sde-jsonl
npm run import:sde -- --dir ./sde-jsonl
```

这样可以继续复用现有 `scripts/importSde.js` / `src/services/sdeImporter.js` 的大文件流式导入逻辑。

## 新增 API

```text
GET  /api/auth/starter-options
GET  /api/skills
GET  /api/skills/options
POST /api/skills/train
GET  /api/fitting
POST /api/hangar/module/active
```

已有 API 增强：

```text
POST /api/auth/register      # 支持 race
POST /api/hangar/equip       # 走装配系统校验
POST /api/hangar/unfit       # 保留模块元信息
GET  /api/state              # 返回 skills / fitting 摘要
GET  /api/combat/options     # 返回 combat / dogma / fitting / skills 元数据
```

## 后续建议

下一步可以把 SDE `typeDogma` 的属性映射继续补深：射程、跟踪、爆炸半径、签名半径、无人机带宽、CPU/PG 更真实的单位换算，以及蓝图/技能书的市场和掉落来源。
