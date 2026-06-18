# AGENTS.md — 后端工程规范

本文件定义本项目**后端**(`src/`)的代码风格与文件结构规范,目标是让后续模块**工业化、可预测、可维护**。新增/修改后端代码前必须遵循本文件。人类与 AI 代理都以此为准。

> 适用范围:`src/`、`scripts/`、`tests/`、`data/`。前端(`client/`)不在此约束内。
> 语言:本文档用中文叙述,**代码/标识符/注释一律英文**。

---

## 0. 核心原则

1. **分层单向依赖**:`routes → services → models`。下层不得反向 import 上层。
2. **服务层与传输层解耦**:`services/` 不感知 HTTP(不出现 `req`/`res`/Express 类型)。
3. **纯函数优先**:能不依赖 DB / IO 的逻辑就写成纯函数,便于 `smoke-no-db` 测试。
4. **防御式取值**:外部输入一律强转 —— `String(x || '')`、`Number(x || 0)`。
5. **零硬编码文案**:所有面向用户的字符串走 i18n(见 §8),禁止内联中文。
6. **配置集中**:`process.env` 只在 `src/config/env.js` 读取,其它地方一律 `import { env }`。
7. **改动前先读本文件 + 邻近同层文件**,新代码风格必须与同层既有文件一致。

---

## 1. 目录结构与各层职责

```
src/
  config/        环境与全局配置(只读冻结对象);唯一允许读 process.env 的地方
  db.js          mongoose 连接 / 断开
  middleware/    Express 中间件(鉴权、asyncHandler、attach* 等)
  models/        Mongoose 模型,一文件一模型 + index.js 桶导出
  routes/        Express 路由,一域一 Router(*ApiRoutes.js)
  services/      业务逻辑,无 HTTP 依赖,纯/半纯函数,命名导出
  socket/        Socket.IO 服务端
  server.js      组装入口:连库 → 中间件 → 路由 → 静态 → 监听
data/            JSON 配置 / i18n / SDE 数据(运行期只读)
scripts/         一次性 / 运维 CLI 脚本;scripts/dev/ 放本地开发工具
tests/           *-smoke.js 冒烟测试(无测试框架,纯 node 脚本)
```

**依赖方向(硬性)**:
- `routes` 可 import `services`、`models`、`middleware`、`config`。
- `services` 可 import `services`、`models`、`config`、`data`(经 loader)。**不得** import `routes`/`middleware`/`socket`。
- `models` 只 import `mongoose`。**不得** import 任何业务代码。

---

## 2. 语言与模块系统

- **ESM**(`package.json` 已 `"type": "module"`)。用 `import`/`export`,**禁用** `require`/`module.exports`。
- 相对导入**必须带 `.js` 后缀**:`import { User } from '../models/index.js'`。
- **一律命名导出,禁用 `export default`**(模型、服务、路由、中间件都如此)。
- import 顺序:① Node 内置(`node:` 前缀优先)→ ② 第三方 → ③ 本项目(config/models/services…),组间空行可选,但同层文件保持一致。

---

## 3. 命名约定

| 对象 | 规范 | 例 |
|---|---|---|
| 文件 - 模型 | PascalCase,= 模型名 | `User.js`、`IndustryJob.js`、`SdeType.js` |
| 文件 - 服务/中间件/工具 | camelCase | `fittingSystem.js`、`skillSystem.js` |
| 文件 - 路由 | camelCase,后缀 `ApiRoutes` | `combatApiRoutes.js` |
| 变量 / 函数 | camelCase | `publicCharacter`、`getCharacterDoc` |
| 类 / Mongoose 模型 | PascalCase | `User`、`Character` |
| 常量(模块级、不可变) | SCREAMING_SNAKE | `DEFAULT_LOCALE`、`SUPPORTED` |
| 布尔 | is/has/can 前缀 | `isProduction`、`banned` |

SDE 相关模型统一 `Sde` 前缀(`SdeType`、`SdeGroup`…)。

---

## 4. 模型层(`src/models/`)

- 一个文件一个 schema + 一个 `mongoose.model`,以命名导出收尾:
  ```js
  export const User = mongoose.model('User', userSchema);
  ```
- 新增模型后,**务必**在 `src/models/index.js` 加一行桶导出;其它代码统一从 `../models/index.js` 取模型,**不**直连单文件。
- schema 规范:
  - 一律 `{ timestamps: true }`(自动 createdAt/updatedAt)。
  - 字段写明 `type`、`required`、`default`;枚举用 `enum` + `default`。
  - 需要查询的字段加 `index: true`,复合索引用 `schema.index({...})`。
  - 字符串输入字段加 `trim`、`minlength`/`maxlength`。
- 模型层**不写业务逻辑**(派生/计算放 `services/`)。

---

## 5. 路由层(`src/routes/`)

模板(以此为准):

```js
import express from 'express';
import { SomeModel } from '../models/index.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { doDomainThing } from '../services/domain.js';
import { t } from '../services/i18n.js';

export const domainApiRoutes = express.Router();
domainApiRoutes.use(requireAuth);                 // 整组需要登录时

domainApiRoutes.get('/thing', asyncHandler(async (req, res) => {
  const data = await doDomainThing(req.session.userId);
  res.json({ ok: true, data });
}));

// 路由组末尾挂错误处理,把抛出的 Error 收敛为 4xx + 统一信封
domainApiRoutes.use((err, req, res, next) => {
  console.error('[domain-api]', err);
  res.status(err.status || 400).json({ ok: false, error: err.message || t('error.generic') });
});
```

规则:
- 每个域一个 `express.Router()`,命名导出 `xxxApiRoutes`,在 `server.js` 用 `app.use('/api/xxx', xxxApiRoutes)` 挂载。
- **所有 async handler 必须用 `asyncHandler` 包裹**(`middleware/auth.js` 已提供),让异常进入错误处理而非吞掉。
- 路由内**只做**:鉴权 → 取参校验 → 调 service → 拼响应。**业务逻辑下沉到 service**。
- 入参防御式取值并校验,校验失败 `throw new Error(<i18n 文案>)`:
  ```js
  const name = String(req.body.name || '').trim();
  if (name.length < 2) throw new Error(t('error.name_too_short'));
  ```
- 敏感/写操作加限流:`express-rate-limit`(参考 `authApiRoutes` 的 `authLimiter`)。
- 不要把 Mongoose 文档原样返回前端;经 service 的 `publicXxx()` 投影(剔除 `passwordHash` 等),如 `publicUser`/`publicCharacter`。

---

## 6. 响应与错误约定

- **统一信封**:成功 `{ ok: true, ...payload }`;失败 `{ ok: false, error: <用户可读文案> }`。
- HTTP 状态码语义:
  - `400` 参数/校验错误(默认:抛 `Error` → 路由错误处理收敛为 400)
  - `401` 未登录、`403` 无权限、`404` 不存在、`409` 冲突、`429` 限流、`500` 服务端异常
  - 需要非 400 时,给 error 对象挂 `err.status = 401`(错误处理读取)或直接 `res.status(...).json(...)`。
- 面向用户的 `error` 文案必须经 i18n;`console.error` 才打印技术细节,带 `[域-标签]` 前缀。

---

## 7. 服务层(`src/services/`)

- **无 HTTP 依赖**:不 import express,不接 `req`/`res`。入参是普通数据 / Mongoose 文档,出参是普通数据。
- 命名导出函数;模块级缓存/常量放文件顶部。
- 数据/规则配置经 loader 读取并缓存,**不要**在 service 里 `fs.readFileSync` 散落:
  ```js
  import { loadJsonConfig } from './jsonConfig.js';
  const rules = loadJsonConfig('data/game/xxx.json');   // 进程内缓存
  ```
- 数值/数据派生大量使用防御式默认值:`Number(x || 0)`、`?? fallback`、`Array.isArray(x) ? x : []`。
- DB 访问规范:
  - 只读用 `.lean()`;需要 `.save()` 时取完整文档。
  - 并行无依赖查询用 `Promise.all([...])`。
  - 写操作幂等、可重入(游戏 tick 会反复调用)。
- 装备/数值来源遵循既有口径:可由 SDE 推导的属性走 SDE(`dogmaMapper` + 缩放),游戏层属性(extract/lootBonus/scan/salvage/drone 等)留在游戏层。详见项目记忆 `equipment-sde-data-model`。

---

## 8. 国际化(强制)

- **任何**面向用户的字符串(API 错误、事件日志、标签)都不得内联,统一放 `data/i18n/<locale>.json`,经 `t(key, vars)` / `label(category, id)` 解析(`services/i18n.js`)。
- 新增文案 = 在 `data/i18n/zh-CN.json` 加 key,代码里用 `t('your.key')`。缺失 key 会回退为 key 本身(便于发现遗漏)。
- 现存路由里仍有内联中文属历史债;**新代码一律走 i18n**,改到旧文件时顺手迁移。
- 详见项目记忆 `no-hardcoded-i18n-strings`。

---

## 9. 配置与密钥

- 新增环境变量:在 `src/config/env.js` 的冻结对象里加字段 + 合理默认值 + 用 `intEnv`/布尔解析助手;**严禁**在其它文件直接读 `process.env`。
- 同步更新 `.env.example`(**只放占位/示例,绝不写真实密钥**)。`.env` 已 gitignore。
- 提交前确认无明文密钥/口令进入版本库。

---

## 10. 日志

- 用 `console.log`/`console.error`,消息以 `[模块-标签]` 前缀:`console.error('[auth-api]', err)`、`[catalog]`、`[static-sde]`。
- 正常请求日志交给 `morgan`(已在 server.js 配置),业务代码不再逐请求打印。

---

## 11. 测试(`tests/`)

- 形式:纯 node 脚本,文件名 `<topic>-smoke.js`;断言用 `node:assert`,失败 `process.exit(1)`。
- 不依赖 DB 的逻辑要能进 `smoke-no-db.js` 路径;依赖 DB 的单独成文件。
- 新增测试后**加入 `package.json` 的 `smoke` 串联**,确保 `npm run smoke` 全绿。
- 提交前至少跑:`npm run check`(语法)与相关 `npm run smoke:*`。

---

## 12. 脚本(`scripts/`)

- 运维/一次性任务放 `scripts/`,本地开发工具放 `scripts/dev/`。
- 每个脚本在 `package.json` 注册可读的 npm script 名(`build:sde-cache`、`sde:seed`…)。
- 脚本可读 `process.env`/接 CLI 参数,但共享逻辑仍应复用 `services/`,不要复制粘贴业务代码。

---

## 13. 新增一个后端域模块 — 标准流程(工业化清单)

以新增 `corporation`(军团)为例,按序产出:

1. **模型** `src/models/Corporation.js`(schema + `export const Corporation`),并在 `src/models/index.js` 加桶导出。
2. **服务** `src/services/corporation.js`:纯业务逻辑 + `publicCorporation()` 投影;配置走 `loadJsonConfig`,文案走 `t()`。
3. **路由** `src/routes/corporationApiRoutes.js`:`export const corporationApiRoutes`,handler 用 `asyncHandler`,末尾挂错误处理。
4. **挂载**:`server.js` 加 `app.use('/api/corporation', corporationApiRoutes)`(放在 `/api` 通配 404 之前)。
5. **配置/文案**:`data/game/*.json` 放规则,`data/i18n/zh-CN.json` 加 key。
6. **测试** `tests/corporation-smoke.js`,并加入 `npm run smoke`。
7. **自检**:`npm run check && npm run smoke` 通过。

---

## 14. 提交前检查清单

- [ ] 分层依赖方向正确(service 无 HTTP、无反向 import)。
- [ ] 命名导出、import 带 `.js`、无 `export default`、无 `require`。
- [ ] 外部输入已强转 + 校验;响应用 `{ ok, ... }` 信封。
- [ ] 无内联用户文案(走 i18n);无散落 `process.env`(走 `env`);无明文密钥。
- [ ] 新模型进了 `index.js`;新路由已在 `server.js` 挂载;新测试进了 `smoke`。
- [ ] `npm run check` 与相关 `npm run smoke` 全绿。

---

## 15. 禁止清单(反模式)

- ❌ `export default` / `require()` / 缺 `.js` 后缀的相对导入。
- ❌ 在 `services/` 出现 `req`/`res`/express;在 `models/` 写业务逻辑。
- ❌ 在路由里堆业务逻辑;直接把 Mongoose 文档返回前端。
- ❌ 内联中文/英文用户文案;在 config 之外读 `process.env`。
- ❌ 在多处 `fs.readFileSync` 读同一份配置(用 `loadJsonConfig` 缓存)。
- ❌ 留死代码(如已被 `fittingSystem.js` 取代的 `fitting.js` 一类未引用文件)——发现即清理或删除。
