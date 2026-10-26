# HKMU COMP8500SEF 第六十组在线投票

* **这个仓库做什么。** 它是一个可在本机安装的投票系统：注册用户创建投票，参与者按记名或匿名、公开或私密四种组合投票，创建者和管理员按权限看汇总。运行不读取 `references/`。下面的值都是课程样例，不能当作生产密钥。

* **环境。** 后端使用 Python 3.12 和 [uv](https://docs.astral.sh/uv/)。前端目标是 Node.js 22.12 或更新的 22。数据库是 PostgreSQL 17，由 Compose 启动。2026-10-25 在本机验证时，Python 是 3.12.15，uv 是 0.13.5，Node 是 v23.9.0。组件测试和浏览器测试在这台 Node 23 上通过。持续集成仍使用 Node 22。

* **本地配置。** 在仓库根目录把 `.env.example` 复制为 `.env`。后端、数据库和前端三个消费方共用这一份文件，各自只读自己需要的变量。`.env` 已在 `.gitignore` 中，不要提交；`.env.example` 是提交的模板。

  1. 开发库是 `127.0.0.1:5432/voting`，测试库是 `127.0.0.1:5433/voting_test`。两个连接串必须不同。测试、测量和恢复都不要指向 5432。全栈 Docker 模式下，`compose.yml` 会把主机名自动覆盖成容器内的 `postgres` 服务名，无需手改。
  2. `ANON_VOTER_HMAC_KEY` 一旦填写，至少 32 字节，并且每次重启保持同一值。匿名防重复依赖这把密钥。示例文件留空。
  3. `PUBLIC_BASE_URL` 和 `ALLOWED_ORIGINS` 填浏览器访问地址。Docker 模式是 `http://localhost:8188`（Nginx 8188 端口）；本机直跑 Vite 则是 `http://localhost:5173`。`ALLOWED_ORIGINS` 是 JSON 列表，写成不带方括号的字符串会在启动时失败。部署到服务器时改成服务器实际域名或 IP。
  4. 账户 Cookie 是 `voting_session`，访客 Cookie 是 `voting_guest`。写请求还要带 `X-CSRF-Token`。账户 CSRF 和访客 CSRF 不能互换。注册、登录和首次建立访客只检查来源。开发环境 `COOKIE_SECURE=false`。
  5. `DEMO_ADMIN_PASSWORD`、`DEMO_USER_PASSWORD`、`DEMO_VOTER_PASSWORD` 是演示账户密码，长度 12 到 128。`DEMO_POLL_PASSWORD` 是私密样例场次的访问密码，长度 8 到 128。浏览器测试使用的课程样例写在 `frontend/tests/e2e/support.ts`，持续集成使用同一组。本地要跑这组浏览器测试时，演示账户密码必须与该文件一致。

* **启动（Docker 一键，推荐）。** 先按上面填好 `.env`，然后在仓库根目录一条命令起整个系统（数据库 + 后端 + 前端 Nginx）：

  ```bash
  docker compose up -d --build
  ```

  浏览器访问 `http://localhost:8188`。首次启动会自动建表并幂等创建演示账户；要再新建四场演示投票，执行：

  ```bash
  docker compose exec backend /app/backend/.venv/bin/python -m src.main.python.cli new-demo-round
  ```

  停止：`docker compose down`；连同数据卷一起删除：`docker compose down -v`；改了代码或依赖后重新构建：`docker compose up -d --build`。

* **部署到服务器。** 对外端口是 Nginx 的 8188（`compose.yml` 里 `"8188:80"`，服务器按需在防火墙放行 8188）。把仓库推到服务器后，只需改 `.env` 里这几个值，其余保持不动，再 `docker compose up -d --build`：

  1. `PUBLIC_BASE_URL` 与 `ALLOWED_ORIGINS`：从 `http://localhost:8188` 改成 `http://<服务器公网IP或域名>:8188`。两者主机和端口必须一致；`ALLOWED_ORIGINS` 是严格跨源白名单，没有同源豁免，写错会把所有写请求拦成 403。
  2. 把课程样例密钥换成真实值：`ANON_VOTER_HMAC_KEY`（≥32 字节，每次重启保持同一值）、`POSTGRES_PASSWORD`。四个 `DEMO_*_PASSWORD` 必须先在 `.env` 填好——docker 启动是无交互的，留空会让 `seed-demo` 调 `getpass` 读终端而失败。
  3. 前面有 HTTPS（TLS 终结）时把 `COOKIE_SECURE` 设为 `true`；本机直连 HTTP 保持 `false`。

  内部地址不用动：`DATABASE_URL`、`TEST_DATABASE_URL` 保持 `127.0.0.1`，docker 模式由 `compose.yml` 覆盖成容器内 `postgres` 服务名；`VITE_API_PROXY` 只用于本机 Vite 开发代理，docker 里浏览器走同源 `/api/v1`，用不到它。反向代理与 TLS 细节见 `deploy/README.md`。

* **启动（本机直跑，不用 Docker）。** 需要本机装好 Python/uv 和 Node。先在仓库根目录只起数据库：

  ```bash
  docker compose --env-file .env -f db/compose.yml up -d --wait
  ```

  然后在 `backend/` 迁移、建演示账户、新建样例场次，再起后端：

  ```bash
  uv sync --frozen
  uv run python -m alembic upgrade head
  uv run python -m src.main.python.cli seed-demo
  uv run python -m src.main.python.cli new-demo-round
  uv run python -m uvicorn src.main.python.main:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log
  ```

  最后在 `frontend/` 起 Vite，浏览器打开 `http://localhost:5173`。这种模式要把 `.env` 里的 `PUBLIC_BASE_URL` 和 `ALLOWED_ORIGINS` 改回 `http://localhost:5173`。

  ```bash
  npm ci
  npm run dev -- --host localhost
  ```

  `seed-demo` 只确保 `admin`、`demo_user`、`demo_voter` 存在，不创建投票，也不重置已有密码。`new-demo-round` 每次用 `demo_user` 新建四场：记名公开、匿名公开并关闭、记名私密并排期、匿名私密草稿，不修改历史票。密码只来自环境变量（未设置时交互输入），不会出现在输出和分享链接里。

* **检查。** 后端命令在 `backend/`，前端命令在 `frontend/`。后端测试默认连接 `127.0.0.1:5433/voting_test`，不会读取根目录 `.env`。持续集成不执行 `ruff format --check`，因为当前还有文件未按该格式排过。

  ```bash
  uv run ruff check .
  uv run python -m pytest tests/unit tests/api tests/integration -q
  ```

  ```bash
  npm run lint
  npm run typecheck
  npm run test -- --run
  npm run build
  npm exec playwright test
  ```

  浏览器测试会自己启动 Vite，并要求 8000 上已有使用同一套课程样例的后端。测量脚本是 `uv run python -m src.main.python.probes.nfr06_probe`。它只接受 `127.0.0.1:5433/voting_test`，测完删除自己写入的 `nfr-` 场次和 `nfru` 账户。

* **边界。** 匿名防重复只约束同一枚仍有效的浏览器凭据，清掉 Cookie、换浏览器或凭据过期后不能保证一个自然人只有一票。记名票按账户唯一。私密密码错误按访客和场次限流，不按 IP。同一场的并发投票会在数据库行锁上排队。性能数字只描述课程里的单机规模，不能据此声称可以承办生产选举。本仓库不包含公网部署。部署和备份说明分别在 `deploy/README.md` 和 `db/backup/README.md`。
