# 架构说明

## 分层

- Browser：EJS 多页面 + Canvas 像素视图 + fetch API + Socket.IO client。
- Express：页面路由、账号登录、API、管理员导入。
- Game Engine：服务端权威 tick，处理离线收益、搜打撤、工业、舰队。
- MongoDB：所有持久化数据，包括账号、角色、SDE、市场、聊天和事件。
- SDE Importer：流式读取 JSON Lines，bulkWrite upsert 到 MongoDB。

## 关键设计

1. 客户端永远不直接决定收益，只能提交调度、市场、装配、制造等意图。
2. 每次进入页面或 API 请求时都会先 tick 角色，保证离线收益落库。
3. 全局游戏循环周期性 tick 所有开启挂机的角色，并用 Socket.IO 推送更新。
4. SDE 导入是增量 upsert，不会清空玩家资产。

## MongoDB 集合

- users
- characters
- sdetypes
- sdesystems
- sdeblueprints
- sdegroups
- sdecategories
- sdemarketgroups
- marketorders
- industryjobs
- fleets
- gameevents
- chatmessages
- sessions
