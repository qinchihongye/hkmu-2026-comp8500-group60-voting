# 实现交接

* **版本。** 2026-10-25 的编程交接就是当前工作区。还没有 git commit，因此不能把某个提交号交给其他组。迁移只有 `db/migrations/versions/cdc412846524_add_named_anonymous_and_access_control_.py`。需求基线是计划中的 B0，需求状态记为 `PROVISIONAL`，因为正式 SRS 还没由需求组定稿。代码状态是 `IMPLEMENTED`。下面的 `VERIFIED` 只表示列出的命令已经跑过，不能反过来把需求说成已经冻结。

* **运行入口。** 按根目录 `README.md` 启动。后端工作目录是 `backend/`，工厂是 `src.main.python.main:create_app`。数据库迁移用 `uv run python -m alembic upgrade head`。演示账户和四场样例分别用 `seed-demo`、`new-demo-round`。页面在 `frontend/`，浏览器地址是 `http://localhost:5173`。启动 Uvicorn 时加上 `--no-access-log`。

* **需求与交付分开看。**

  | 需求 | 需求状态 | 代码状态 | 验证 |
  | --- | --- | --- | --- |
  | VOT-FR-01、08 账户与访客 | `PROVISIONAL` | `IMPLEMENTED` | `VERIFIED`，后端会话测试和浏览器刷新、注销 |
  | VOT-FR-02、03 创建、发布、关闭 | `PROVISIONAL` | `IMPLEMENTED` | `VERIFIED`，所有权测试和创建者浏览器流程 |
  | VOT-FR-04、12、13 广场、分享、私密密码 | `PROVISIONAL` | `IMPLEMENTED` | `VERIFIED`，公开列表不返回私密标题，密码不进入地址 |
  | VOT-FR-05、07 投票、回执和未知提交 | `PROVISIONAL` | `IMPLEMENTED` | `VERIFIED`，并发、隐私和丢响应恢复 |
  | VOT-FR-06、10、14 汇总、审计、管理员只读 | `PROVISIONAL` | `IMPLEMENTED` | `VERIFIED`，进行中结果权限和管理员写接口被拒绝 |
  | VOT-FR-09、11 安装与响应式页面 | `PROVISIONAL` | `IMPLEMENTED` | 页面和说明 `VERIFIED`；Git 干净检出仍做不到，因为没有 commit |
  | NFR-06 课程规模性能 | `PROVISIONAL` | `IMPLEMENTED` | `VERIFIED`，见下面这台机器的数字 |

* **2026-10-25 跑过的命令。** 后端在 `backend/` 执行 `uv run ruff check .`，结果干净。`uv run python -m pytest tests/unit tests/api tests/integration -q` 为 84 passed、1 条 StarletteDeprecationWarning、4.49 秒。前端 `npm run test -- --run` 为 10 个文件、24 个测试通过。同一轮早些时候的 `npm exec playwright test` 为 7 passed、31.3 秒，接着 `npm run typecheck` 和 `npm run lint` 退出码为 0。`npm run build` 已由 Vite 8.3.5 完成。浏览器测试打的是真实 API，不是页面 Mock。

  1. Playwright 覆盖注册和登录不更换访客、记名公开一账户一票、私密记名先密码再登录、匿名同浏览器不能再投而另一个浏览器可以、丢响应后用原凭据找回、创建者发布后冻结、管理员只读，以及 375、768、1024、1440 宽度下没有页面级横向溢出。
  2. 匿名票核对是 `anon_with_voter=0`、`anon_audit_links=0`。用最新一场私密投票的标题搜索公开广场，`private_search_hits=0`。
  3. NFR-06 在 macOS 15.5 arm64、10 个 CPU、24.0 GiB 内存上测量。数据是 100 场、1000 个账户、10000 张历史票，20 并发，每类 100 个样本。结果读取 p95 是 71.3 毫秒，公开列表 p95 是 58.9 毫秒，记名投票 p95 是 99.2 毫秒，匿名投票 p95 是 82.5 毫秒，失败率都是 0。读取低于 500 毫秒，投票低于 1000 毫秒。测完 `nfr-` 场次和 `nfru` 账户为 0，原有访客还在。
  4. 用同一把 HMAC 重启 API 后，原来的匿名 Cookie 再投一次，得到 HTTP 409，`code` 为 `40901`。`new-demo-round` 写出了四场预期组合，输出里没有访问密码。
  5. `pg_dump` 恢复到测试实例上的空库 `voting_restore` 后，票数、模式、授权、迁移版本和唯一索引与当时的 `voting_test` 一致，细节在 `db/backup/README.md`。空库和转储文件已经删除。

* **已知缺口。** 这些项保持未完成，不能写成已经支持。

  1. T04 到 T12 的建议提交都没有执行。没有 commit，也就不能做一份包含当前代码的 Git 干净检出。
  2. 不加 `--no-access-log` 时，Uvicorn 默认访问日志会记录完整 URL，分享码可能出现在里面。应用日志本身已经改成路由模板。
  3. 本机 Node 是 v23.9.0，计划和持续集成是 Node 22.12 或更新的 22。没有改这台机器的全局 Node。
  4. `ruff format --check` 还会改 8 个文件。持续集成只跑 `ruff check`，这次没有为了格式化去改那些文件。
  5. 性能数字只属于上面这台机器和这次数据量。同一场的 20 个并发投票会在行锁上排队。它不是生产选举能力。
  6. 匿名限制是同一枚浏览器凭据，不是一个自然人一票。密码错误限流按访客和场次，不按 IP，锁定 5 次失败后的 5 分钟。
  7. 没有公网部署。`deploy/nginx.conf` 只是本机示例。

* **给其他组。** 2026-10-25 用 `create_app()` 导出的 OpenAPI 有 22 条路径，与 `docs/coordination/interface-snapshot.md` 一致。表以 `docs/coordination/schema-snapshot.md` 和迁移 `cdc412846524` 为准，当前规则以 `docs/coordination/working-baseline.md` 为准。编程侧不代写正式 SRS、设计报告、测试报告或演进文档。新的需求或缺陷进来时，先记下原行为、新行为和影响的页面、接口、表、测试，再排进下一个增量。没实现的行为继续留在待办里。
