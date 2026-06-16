# 技能、装配、武器消耗品与种族初始包

## 任务表

| 任务 | 状态 | 说明 |
| --- | --- | --- |
| 玩家技能训练和效果 | 已实现初版 | `data/game/skills.json` 定义技能、等级上限、训练时间、效果；`src/services/skills.js` 负责训练队列和属性加成。 |
| 飞船装配限制 | 已实现初版 | `data/game/fitting_rules.json` 定义槽位、CPU、能栅、校准、挂点、同组限制和技能需求；`src/services/fitting.js` 统一校验。 |
| 装备效果生效 | 已实现初版 | 被动模块直接进入 `deriveEffectiveStats`；主动模块在战斗结算中消耗电容/弹药并应用修盾、修甲、推进、武器等效果。 |
| 武器与主动装备消耗品 | 已实现初版 | `data/game/consumables.json` 定义弹药/晶体/导弹伤害分布；`/api/hangar/load-charge` 支持装填。 |
| 种族初始装备 | 已实现初版 | `data/game/starter_kits.json` 按加达里、盖伦特、艾玛、米玛塔尔配置不同技能、舰船、装备、弹药和物资。 |
| 前后端分离 | 保持 | 只增加 `client/` 静态页面交互和 `/api/*` JSON 接口，不恢复 EJS。 |
| 禁止硬编码 | 保持 | 规则和初始包均在 JSON 中，JS 只做通用读取、校验和结算。 |

## 新增/修改接口

```text
GET  /api/auth/starter-options      注册页读取种族选项
POST /api/auth/register             新增 race 参数
GET  /api/skills/options            读取技能、等级和训练队列
POST /api/skills/train              将技能加入训练队列
POST /api/hangar/equip              按装配规则装配模块
POST /api/hangar/unfit              卸下模块并返还已装填弹药
POST /api/hangar/module-state       启用/停用主动模块
POST /api/hangar/load-charge        给主动武器装填弹药、晶体、导弹
```

## SDE 数据源说明

`EVE-China/sde` 是公开仓库，README 指向 EVE 官方 SDE 自动化入口、最新 JSON Lines ZIP 和 YAML ZIP。本项目的运行时仍以 MongoDB 中已导入的数据为准，避免战斗 tick 依赖外部网络。推荐流程是：

1. 从公开 SDE/官方 latest JSONL 地址下载数据。
2. 使用 `npm run import:sde -- --dir ./sde-jsonl` 导入 MongoDB。
3. 导入后的 `SdeType` 继续通过 `kind/slot/effects/stats/raw` 进入市场、装配、武器和制造系统。

后续可以新增定时同步脚本，但不要让游戏运行时直接请求 GitHub 或官方 SDE。这样能保证服务器 tick 稳定，也方便版本锁定和平衡回滚。
