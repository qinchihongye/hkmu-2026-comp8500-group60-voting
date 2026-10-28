# 编程基线记录

* **当前实现。** 2026-10-25 的工作区已落地 T01 到 T06 的库表、账户、访客、投票、汇总和演示场次，以及 T07 到 T09 的页面。T10 的浏览器路径、T11 的运行说明和 T12 的交接记录也已写上。后端从 `backend/` 启动，页面从 `frontend/` 启动。数据库由 Compose 启动 PostgreSQL 17。表见 `docs/coordination/schema-snapshot.md`，接口见 `docs/coordination/interface-snapshot.md`，命令和数字见 `docs/coordination/implementation-snapshot.md`。这些任务都还没有提交。

* **运行边界。**

  1. Python 3.12、uv，工作目录是 `backend/`。应用工厂是 `src.main.python.main:create_app`。导入模块时不连接数据库。
  2. `db/compose.yml` 只启动数据库。开发库绑定 `127.0.0.1:5432`，数据在 `db/data/`。`test` profile 的测试库绑定 `127.0.0.1:5433`，使用容器临时存储，不挂载开发数据。迁移测试只允许连接这个测试库。
  3. `DATABASE_URL` 与 `TEST_DATABASE_URL` 必须不同。`ANON_VOTER_HMAC_KEY` 示例留空；一旦填写，至少 32 字节。本地 `.env`、`db/data/` 和备份不进入 Git。
  4. 运行不读取 `references/`。浏览器来源使用配置中的白名单，不使用全开放跨域。`ALLOWED_ORIGINS` 在环境里要写成 JSON 列表，或省略以使用默认的 `http://localhost:5173`。

* **账户边界。** 注册只创建 `USER`。`voting_session` 与 `voting_guest` 分开保存。刷新、登录和注销不更换仍有效的访客。`seed-demo` 确保 `admin`、`demo_user`、`demo_voter` 存在，不重置已有密码，也不创建投票。

* **响应契约。** 应用 API 的 JSON 只有 `code`、`msg`、`data`、`request_id`。成功时 `code` 为 0，并保留真实 HTTP 状态。失败码是整数 `ApiCode`。匿名投票和解锁路径的应用日志只记录方法、路由模板、状态和耗时。Uvicorn 默认访问日志仍会记录完整地址，启动时要加 `--no-access-log`。

* **投票边界。** 写权限只比较 `creator_id`，管理员不能改别人的投票。广场只列公开且非草稿的投票，总数和搜索同样排除。私密场次要先用访客 CSRF 解锁；授权默认 60 分钟，且不超过访客到期时间。访问密码不能为空，不限制长度。新场次存明文，旧场次可以只剩 Argon2 散列。分享链接不带密码。自然结束不改写生命周期。记名和匿名各自靠数据库唯一约束最多一票。匿名票不写账户、逐票审计或可关联日志。汇总在共享锁后计算；创建者和管理员可看进行中快照，其他人要等到结束。记名历史不含匿名票，未授权的私密记录也不计入总数。
