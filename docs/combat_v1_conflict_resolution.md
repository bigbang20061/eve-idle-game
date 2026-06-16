# Combat V1 PR 冲突处理记录

## 背景

PR #1 `feat: add configurable combat system v1` 基于旧的 EJS + API 混合项目结构提交。之后 `main` 已合并更高版本的前后端分离与 Combat V2 / SDE Dogma 映射实现，因此 PR #1 原始分支和 `main` 在下列方向发生冲突：

- `src/server.js`：旧 PR 仍保留 EJS 页面渲染路径；`main` 已改为静态前端 + JSON API。
- `src/services/gameEngine.js`：旧 PR 接入 Combat V1；`main` 已接入更完整的 Combat V2 / Dogma 映射版。
- `data/combat/*`：旧 PR 拆分了多份 V1 配置；`main` 已统一为当前配置入口。
- `public/app/*` 与 `client/*`：旧 PR 使用 `/public/app` 战斗页；`main` 已统一到 `client/` 静态前端。

## 处理原则

按照当前项目约束处理：

| 约束 | 处理方式 |
| --- | --- |
| 前后端分离 | 保留 `main` 的 `client/` 静态前端和 `/api/*` 后端接口，不回退到 EJS 页面。 |
| 禁止硬编码 | 保留 `main` 的配置化战斗规则、站点规则和 Dogma 映射，不恢复旧的固定数值逻辑。 |
| 禁止多架构 | 不再引入 `/public/app` 作为第二套前端入口，不恢复 EJS + 静态前端混用。 |
| SDE 深度利用 | 保留 Combat V2 的 SDE Dogma 映射方向。 |

## 本次实际处理

1. 已将旧 PR 分支备份到：`backup/pr-1-combat-v1-before-conflict-resolution`。
2. 已将 `feature/combat-system-v1` 对齐到当前 `main`，避免旧 V1 代码覆盖 V2。
3. 本文件作为冲突处理说明提交，使 PR #1 重新具备可合并差异。

## 后续建议

PR #1 可以安全合并为“冲突处理记录”。后续战斗系统开发应继续基于当前 `main` 的 Combat V2 / SDE Dogma 架构推进，而不是继续使用旧 V1 分支。