# HKMU COMP8500SEF 第六十组在线投票

* **这个仓库做什么。** 它是一个可在本机安装的投票系统：注册用户创建投票，参与者按记名或匿名、公开或私密四种组合投票，创建者和管理员按权限看汇总。运行不读取 `references/`。下面的值都是课程样例，不能当作生产密钥。

* **选票份数和选择方式。** 新建投票默认不限份数，并且是单选。份数上限为空表示不限；填写时必须是 1 到 100000 的整数。至少三个有效选项才能改成多选。一份多选只占一个名额、只产生一个回执，可以选择一项直到全部选项。达到上限的那一份提交成功时，场次同时结束。百分比按全部选择次数计算，结果同时给出选票份数和选择次数。当前迁移是 `c4e8a1b07d33`。

* **Ballot limit and selection mode.** A new poll is unlimited and single-choice. An empty limit means unlimited; a set limit is an integer from 1 to 100000. Multiple choice needs at least three options. One multiple-choice submission uses one ballot and one receipt, and can select anywhere from one option to every option. The ballot that fills the limit closes the poll in the same commit. Percentages use all selections, and results show both the ballot count and the selection count. The current migration is `c4e8a1b07d33`.

* **环境。** 后端使用 Python 3.12 和 [uv](https://docs.astral.sh/uv/)。前端目标是 Node.js 22.12 或更新的 22。数据库是 PostgreSQL 17，由 Compose 启动。2026-10-25 在本机验证时，Python 是 3.12.15，uv 是 0.13.5，Node 是 v23.9.0。组件测试和浏览器测试在这台 Node 23 上通过。持续集成仍使用 Node 22。

* **本地配置。** 在仓库根目录把 `.env.example` 复制为 `.env`。后端、数据库和前端三个消费方共用这一份文件，各自只读自己需要的变量。`.env` 已在 `.gitignore` 中，不要提交；`.env.example` 是提交的模板。

  1. 开发库是 `127.0.0.1:5432/voting`，测试库是 `127.0.0.1:5433/voting_test`。两个连接串必须不同。测试、测量和恢复都不要指向 5432。全栈 Docker 模式下，`compose.yml` 会把主机名自动覆盖成容器内的 `postgres` 服务名，无需手改。
  2. `ANON_VOTER_HMAC_KEY` 一旦填写，至少 32 字节，并且每次重启保持同一值。匿名防重复依赖这把密钥。示例文件留空。
  3. `PUBLIC_BASE_URL` 和 `ALLOWED_ORIGINS` 填浏览器访问地址。Docker 模式是 `http://localhost:8188`（Nginx 8188 端口）；本机直跑 Vite 则是 `http://localhost:5173`。`ALLOWED_ORIGINS` 是 JSON 列表，写成不带方括号的字符串会在启动时失败。部署到服务器时改成服务器实际域名或 IP。
  4. 账户 Cookie 是 `voting_session`，访客 Cookie 是 `voting_guest`。写请求还要带 `X-CSRF-Token`。账户 CSRF 和访客 CSRF 不能互换。注册、登录和首次建立访客只检查来源。开发环境 `COOKIE_SECURE=false`。
  5. `DEMO_ADMIN_PASSWORD`、`DEMO_USER_PASSWORD`、`DEMO_VOTER_PASSWORD` 是演示账户密码，长度 12 到 128。`DEMO_POLL_PASSWORD` 是私密样例场次的访问密码，不能为空，不限制长度。浏览器测试使用的课程样例写在 `frontend/tests/e2e/support.ts`，持续集成使用同一组。本地要跑这组浏览器测试时，演示账户密码必须与该文件一致。
  6. `DEMO_POLLS_ENABLED` 默认在应用配置里是关闭的。本仓库的 Compose 会把它显式映射成 `${DEMO_POLLS_ENABLED:-true}`，所以 `docker compose up -d --build` 会在迁移和 `seed-demo` 之后执行 `ensure-demo-polls`。启用时 `DEMO_POLL_PASSWORD` 必须已在环境中，容器不会交互询问，也不会把密码写入日志。`demo_user` 是这些固定示例的创建者，`demo_voter` 是普通参与者，用来核对进行中的实时结果开关；`admin` 是管理员。三者都不要被种子预先投票。关闭开关不会删除已有示例，只会让目录接口和 Overview 示例区变空；公开示例仍出现在普通公开列表。之后改 `DEMO_POLL_PASSWORD` 不会改写已经生成的私密示例密码。
  7. 投票文字识别默认关闭，不调用模型，也不影响手动创建投票。要启用时设置 `POLL_TEXT_PARSE_ENABLED=true`，并填写 `OPENAI_API_KEY` 和 `POLL_TEXT_PARSE_MODEL`。`OPENAI_BASE_URL` 可空，空则使用 SDK 默认地址；DeepSeek 兼容地址是 `https://api.deepseek.com`。`POLL_TEXT_PARSE_TIMEOUT_SECONDS` 默认为 20，范围是 1 到 60。`POLL_TEXT_PARSE_THINKING` 可空，或填 `enabled` / `disabled`。`POLL_TEXT_PARSE_REASONING_EFFORT` 可空，或填 `low` 等强度。`POLL_TEXT_PARSE_STREAM` 请保持 `false`，识别只读取一次完整 JSON。`POLL_TEXT_PARSE_RESPONSE_FORMAT` 默认 `json_schema`；DeepSeek 当前要改成 `json_object`。这些值都只从环境读取，密钥不要写入仓库。登录用户把一段投票文字交给 `POST /api/v1/poll-import/parse`，结果只用来填表，不会创建投票。

* **Poll text recognition.** It is off by default, does not call a model, and does not affect creating a poll by hand. To enable it, set `POLL_TEXT_PARSE_ENABLED=true`, `OPENAI_API_KEY`, and `POLL_TEXT_PARSE_MODEL` in the root `.env`. Leave `OPENAI_BASE_URL` empty to use the SDK default, or set `https://api.deepseek.com` for DeepSeek. `POLL_TEXT_PARSE_TIMEOUT_SECONDS` defaults to 20 and must be from 1 to 60. `POLL_TEXT_PARSE_THINKING` may be empty, `enabled`, or `disabled`. `POLL_TEXT_PARSE_REASONING_EFFORT` may be empty or a value such as `low`. Keep `POLL_TEXT_PARSE_STREAM` false, because recognition reads one JSON body. `POLL_TEXT_PARSE_RESPONSE_FORMAT` defaults to `json_schema`; DeepSeek currently needs `json_object`. All of these values come from the environment. Keep the key out of the repository. A logged-in user posts poll text to `POST /api/v1/poll-import/parse`. The result can fill the form and does not create a poll.

* **启动（Docker 一键，推荐）。** 先按上面填好 `.env`，然后在仓库根目录一条命令起整个系统（数据库 + 后端 + 前端 Nginx）：

  ```bash
  docker compose up -d --build
  ```

  浏览器访问 `http://localhost:8188`。首次启动会自动建表、幂等创建演示账户，并在示例开关打开时补齐 38 场固定示例。登录后的 Overview 顶部有“示例投票”，下面仍是原来的公开投票。要再新建四场随机演示投票，执行：

  ```bash
  docker compose exec backend /app/backend/.venv/bin/python -m src.main.python.cli new-demo-round
  ```

  停止：`docker compose down`；连同数据卷一起删除：`docker compose down -v`；改了代码或依赖后重新构建：`docker compose up -d --build`。

  `up -d --build`、`restart` 和 `down` 后再 `up` 都保留 PostgreSQL 卷。固定示例再次启动只补缺失目录，不改已有标题、密码、时间、选票、分享码或关闭状态。试投、投满和手动关闭都会留下来。30 天后自然结束的示例保持结束，不会被启动悄悄重开。`docker compose down -v` 会删除整个数据库，这不是持久保存；下次启动只能重建示例基线，不能恢复旧的试投记录。要留住试投结果，请备份数据库。

* **Persistent examples.** A normal image rebuild keeps the database volume. `ensure-demo-polls` fills missing catalog rows and leaves existing titles, passwords, times, ballots, share codes, and closed polls untouched. `docker compose down -v` deletes the database. The next start can rebuild the baseline examples, but it cannot restore earlier trial votes. Back up the database if those votes must be kept. `demo_user` owns the examples. `demo_voter` is a normal participant. `admin` is the administrator. None of those accounts is given a seed ballot.

* **部署到服务器。** 对外端口是 Nginx 的 8188（`compose.yml` 里 `"8188:80"`，服务器按需在防火墙放行 8188）。把仓库推到服务器后，只需改 `.env` 里这几个值，其余保持不动，再 `docker compose up -d --build`：

  1. `PUBLIC_BASE_URL` 改成浏览器实际打开的地址，例如 `http://<服务器公网IP或域名>:8188`。`ALLOWED_ORIGINS` 仍要包含开发时用的来源。写请求还接受与当前 Host 主机和端口相同的 Origin，所以用 IP 打开本站可以注册和登录。其他网站的 Origin 仍会得到 403。
  2. 把课程样例密钥换成真实值：`ANON_VOTER_HMAC_KEY`（≥32 字节，每次重启保持同一值）、`POSTGRES_PASSWORD`。四个 `DEMO_*_PASSWORD` 必须先在 `.env` 填好——docker 启动是无交互的，留空会让 `seed-demo` 调 `getpass` 读终端而失败。示例开关打开时，`DEMO_POLL_PASSWORD` 为空会让 `ensure-demo-polls` 直接失败，同样不会询问。
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
  uv run python -m src.main.python.cli ensure-demo-polls
  uv run python -m src.main.python.cli new-demo-round
  uv run python -m uvicorn src.main.python.main:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log
  ```

  最后在 `frontend/` 起 Vite，浏览器打开 `http://localhost:5173`。这种模式要把 `.env` 里的 `PUBLIC_BASE_URL` 和 `ALLOWED_ORIGINS` 改回 `http://localhost:5173`。

  ```bash
  npm ci
  npm run dev -- --host localhost
  ```

  `seed-demo` 只确保 `admin`、`demo_user`、`demo_voter` 存在，不创建投票，也不重置已有密码。`ensure-demo-polls` 在开关关闭时什么都不写；开关打开且 `DEMO_POLL_PASSWORD` 已设置时，只补缺失的固定示例。`new-demo-round` 每次用 `demo_user` 新建四场：记名公开、匿名公开并关闭、记名私密并排期、匿名私密草稿，不修改历史票，也不会登记进固定示例。密码只来自环境变量（`new-demo-round` 未设置时交互输入；`ensure-demo-polls` 不交互），不会出现在输出和分享链接里。

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
