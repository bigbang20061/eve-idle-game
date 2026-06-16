# 任务执行表

| 序号 | 任务 | 约束 | 状态 | 说明 |
|---:|---|---|---|---|
| 1 | 扫描项目现状 | 不直接覆盖 main | 已完成 | 确认旧项目为 Express + EJS + API 混用，战斗逻辑集中在 gameEngine fighting 状态。 |
| 2 | 前后端分离 | 禁止多架构 | 已完成 | 新增 `client/` 静态前端，服务端只提供 API、Socket.IO、MongoDB 和静态文件。 |
| 3 | 删除运行态 EJS 架构 | 禁止多架构 | 已完成 | 服务端不再设置 view engine，不再加载 pageRoutes；旧 EJS/SSR 文件从功能树移除。 |
| 4 | 战斗规则配置化 | 禁止硬编码 | 已完成 | 新增 `data/combat/rules.json`，伤害类型、姿态、NPC、势力、波次、反跳、电子战均从配置读取。 |
| 5 | 站点生成配置化 | 禁止硬编码 | 已完成 | 新增 `data/combat/site_templates.json`，异常名称、安等分段、危险/富集/强度公式从配置读取。 |
| 6 | 服务端战斗系统 | 前端不结算 | 已完成 | 新增 `combatSystem`，由 `gameEngine` 在 fighting 状态调用。 |
| 7 | 战斗 API | 前端只调用接口 | 已完成 | 新增 `/api/combat/options` 和 `/api/combat/settings`。 |
| 8 | SDE Dogma 映射初版 | 禁止写死模块属性 | 已完成 | 新增 `data/sde/dogma_mapping.json` 和 `dogmaMapper`，用于派生舰船槽位、舰船属性和模块效果。 |
| 9 | 多页面静态前端 | 前后端分离 | 已完成 | 新增指挥室、星图、船坞、仓库、市场、工业、舰队、SDE、榜单页面。 |
| 10 | 测试 | 可本地检查 | 已完成 | 新增/更新 syntax、combat、dogma smoke 测试。 |

下一阶段：把 `sdeImporter` 中的 types/typeDogma 导入进一步全量对齐 `dogmaMapper`，并补充工业蓝图 UI、舰队战斗 UI、玩家市场撮合。
