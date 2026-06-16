# Combat System V2 + SDE Dogma Mapping

## 目标

本阶段把战斗从简单 DPS 对撞升级为服务端权威、配置驱动的战斗系统，并开始接入 SDE Dogma 映射。原则：

- 不在 JS 中写死战斗数值。
- 前端只展示和提交选择，不参与结算。
- 不引入第二套前端框架或微服务架构。

## 配置文件

- `data/combat/rules.json`：伤害类型、护盾/装甲/结构、抗性、NPC 势力、NPC 原型、波次、姿态、目标优先级、反跳和电子战。
- `data/combat/site_templates.json`：星系安等分段、异常名称、危险度、富集度、扫描需求、敌人基础强度。
- `data/sde/dogma_mapping.json`：Dogma 属性别名、舰船槽位、模块槽位、伤害属性、射速、采矿量、反跳强度和关键词映射。

## 服务端流程

```text
idle -> scanning -> warping -> fighting -> looting -> extracting -> idle
```

当状态进入 `fighting` 时，`gameEngine` 调用 `ensureCombat()` 初始化配置化波次，然后每个 tick 调用 `resolveCombatRound()`：

1. 根据玩家姿态、伤害配置和目标优先级选择目标。
2. 根据 NPC 抗性计算实际输出。
3. NPC 按势力伤害配置反击玩家护盾/装甲/结构。
4. 处理反跳、电子战、后勤维修和赏金。
5. 全部波次清理后进入 looting；玩家结构归零则进入 repairing。

## 前端流程

前端页面从 `/api/combat/options` 获取战斗配置，生成下拉框。保存时提交到 `/api/combat/settings`。前端不会计算伤害，也不会决定胜负。

## 后续

下一阶段应在 `sdeImporter` 中把完整 `typeDogma` / `dogmaAttributes` 写入 `SdeType.dogma`，并调用 `deriveDogmaTypeData()` 生成舰船和模块的初始 stats/effects。当前 PR 已提交映射层和烟测，为全量 SDE 导入做好接口。
