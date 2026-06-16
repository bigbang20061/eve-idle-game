# SDE 技能导入计划

技能不应手写。EVE 技能在 SDE 中本身就是 `types` 记录，训练倍率、主副属性、前置技能应由 `typeDogma + dogmaAttributes` 派生。

## 已新增命令

```bash
npm run sde:skills
```

默认读取：

```text
SDE_STATIC_DIR 或 SDE_DIR 或 ./sde/yaml
```

默认输出：

```text
data/generated/skills_from_sde.json
```

## 派生链路

```text
categories
  -> 定位 Skill category

groups
  -> 找到 categoryID 属于 Skill 的技能组

types
  -> 找到 groupID 属于技能组的技能 type

typeDogma
  -> 读取每个技能的 dogmaAttributes

dogmaAttributes
  -> 按 attribute name 解析 skillTimeConstant、primaryAttribute、secondaryAttribute、requiredSkill1..6
```

## 下一步迁移

当前 `src/services/skillSystem.js` 仍读取 `data/game/skills.json` 作为游戏化技能目录。后续要改为：

```text
SDE skills_from_sde.json
  + 游戏平衡配置，例如训练速度倍率、起始等级上限、UI 分组别名
  -> 最终技能训练目录
```

也就是说：

- 技能名、rank、前置技能来自 SDE。
- 游戏只维护倍率、显示分组、起始预算等平衡项。
- 不再手写技能全集。
