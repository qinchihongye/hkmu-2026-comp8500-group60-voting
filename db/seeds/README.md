# 演示数据

* **命令。** 演示数据不放 SQL 文件。在 `backend/` 使用应用命令写入，密码来自环境变量或交互输入，不写入仓库、日志或分享链接。

  ```bash
  uv run python -m src.main.python.cli seed-demo
  uv run python -m src.main.python.cli new-demo-round
  ```

* **账户。** `seed-demo` 只确保三个账户存在：`admin` 是管理员，`demo_user` 和 `demo_voter` 是普通用户。同一角色再次执行不会重置密码或显示名。同名但角色不同会退出，并且不会提升权限。它不创建投票。

* **场次。** `new-demo-round` 要求 `demo_user` 已经存在并且是普通用户。每次新建四场，批次不同，不修改已有场次和已有票。四场分别是记名公开并发布、匿名公开并关闭、记名私密并排期发布、匿名私密草稿。私密场次的密码来自 `DEMO_POLL_PASSWORD`。测试和测量夹具自己建数据，不依赖这两条命令。
