# Skills / Fitting / Starter Loadouts V1

## 任务表

| 序号 | 任务 | 状态 | 实现方式 |
| --- | --- | --- | --- |
| 1 | 玩家技能训练和效果 | 已完成初版 | `data/game/skills.json` 配置技能、等级、训练时间、每级效果；`src/services/skillSystem.js` 负责训练队列、完成结算和效果汇总。 |
| 2 | 飞船装配限制 | 已完成初版 | `data/game/fitting_rules.json` 配置槽位资源、挂点、模块角色和技能需求；`src/services/fittingSystem.js` 校验 slot / CPU / powergrid / calibration / hardpoint / skills。 |
| 3 | 装备效果生效 | 已完成初版 | 被动效果在 `deriveEffectiveStats()` 中生效；主动/武器模块在 `resolveCombatRound()` 中通过 `cycleActiveModules()` 消耗电容/弹药并产生 DPS、维修、推进等效果。 |
| 4 | 武器和主动装备消耗品 | 已完成初版 | 弹药/晶体/导弹由 `chargeGroup` 驱动；战斗轮消耗 cargo 中对应 charge，并按配置修改伤害分布和 DPS。 |
| 5 | 不同种族初始包 | 已完成初版 | `data/game/starter_loadouts.json` 定义 Amarr/Caldari/Gallente/Minmatar 的起始技能、船、装备、弹药、矿物和钱包。注册页从 `/api/auth/starter-options` 获取选项。 |

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
```

业务代码只读取配置、校验和结算；技能数值、模块资源、主动循环、chargeGroup、种族起始包都不写死在路由或战斗循环里。

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
