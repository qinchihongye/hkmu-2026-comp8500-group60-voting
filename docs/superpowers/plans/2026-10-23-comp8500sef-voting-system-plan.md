# COMP8500SEF 投票系统代码开发计划

* **目标：** 完成可独立安装、演示和验证的投票系统。本计划聚焦你负责的“电脑编程”，覆盖 `frontend/`、`backend/`、`db/`、编程自测和运行说明。

  **当前状态：** 2026-10-25。修订版仍是 **V6**。T01 至 T12 的实现和本次记录的验证都在工作区里。后端测试 84 passed，前端组件测试 24 passed，Playwright 7 passed。课程规模的读取和投票 p95 低于计划目标。备份已恢复到独立空库并删除。这些任务都还没有提交，所以还不能按一个 commit 做干净检出。

  **本轮文档更新（2026-10-25）：** 仅补全通用 Schema 及访客公开浏览规则，不检查或修改应用代码。上面的实现/测试结果及已勾选任务保留自既有记录；它们不代表本轮新增细化已经实现或重新验证，新增核对项单独列为待办。

  **需求依据：** 已确认的用户要求，加上明确标注的实施默认值，组成当前编码基线 **B0**。需求分析与编程并行；后续需求通过增量修改进入代码，不等待整份 SRS 或正式分析/设计文档完成。

  **阅读方式：** 前半部分回答“先做什么、修改哪些文件、怎样算完成”；后半部分的[技术细则](#技术细则)集中定义业务规则、目录、数据表、接口、页面和测试口径，全部保留在本文中。

* **阅读导航。**

  | 需要解决的问题 | 阅读位置 |
  | --- | --- |
  | 当前需要做哪些功能 | [当前编码基线](#当前编码基线) |
  | 技术选型和代码如何组织 | [技术结构与模块边界](#技术结构与模块边界) |
  | 前后端统一传什么、返回什么 | [通用请求与响应 Schema](#通用请求与响应-schema) |
  | 两名编程成员先做什么、何时联调 | [开发顺序与里程碑](#开发顺序与里程碑) |
  | 开始一个具体任务 | [开发工作包](#开发工作包) |
  | 新需求来了如何调整、交给其他组什么 | [需求变更与编程交接](#需求变更与编程交接) |
  | 编程部分何时可以交付 | [编程完成标准](#编程完成标准) |
  | 查数据表、API、页面与测试细节 | [技术细则](#技术细则) |

## 当前编码基线

* **先固定参与方式和权限。** 创建投票始终需要注册登录；普通用户和管理员都可创建并管理自己的投票。记名方式与公开性是两个独立字段，组合如下。

  | 组合 | 如何进入 | 参与条件 | 防重复依据 |
  | --- | --- | --- | --- |
  | 公开 + 记名 | 访客可从公开广场或分享链接浏览题目和选项 | 提交选票时登录 | 同账号每场一次 |
  | 私密 + 记名 | 分享链接 | 登录 + 本场密码授权 | 同账号每场一次 |
  | 公开 + 不记名 | 访客可从公开广场或分享链接浏览题目和选项 | 无需登录，提交前建立浏览器参与凭据 | 同一有效浏览器凭据每场一次 |
  | 私密 + 不记名 | 分享链接 | 无需登录，本场密码授权 + 浏览器凭据 | 同一有效浏览器凭据每场一次 |

  创建者可以编辑/发布自己的草稿、提前关闭自己的投票；管理员可查看所有投票和汇总结果。当前默认管理员对他人投票只有读取权。创建者/管理员可看进行中汇总，其他有访问权限的参与者结束后查看。创建者/管理员读取私密投票的例外，不免除其实际投票时的参与条件。

  不记名投票即使由已登录用户参与，也不关联账号与选择。浏览器防重复不能保证“一自然人一票”；清 Cookie、换浏览器或凭据过期可能绕过。记名保存账号关联，但第一版不提供他人个人选择名单。

  **访客浏览与投票分开。** 首页、公开广场和公开投票详情允许未登录访问，不因投票是 NAMED 就整页跳转登录。访客在公开记名详情可看题目/选项，点击投票时再登录；公开不记名可直接准备访客凭据并参与。创建、本人记录、管理员功能继续要求登录；私密门禁和结果读取时机/身份按 BR-05/BR-06 执行，本次公开浏览不放开进行中的统计。

* **本轮编程范围。** 需求 ID 沿用旧计划，详细验收见[功能与业务规则](#需求范围与业务规则)。

  | 功能模块 | 需要交付的行为 | 需求对应 |
  | --- | --- | --- |
  | 账户与浏览器身份 | 注册、登录、注销、身份恢复；账户会话与匿名参与凭据独立 | VOT-FR-01、08 |
  | 创建者工作区 | 创建/编辑草稿、发布、关闭、查看本人投票 | VOT-FR-02、03 |
  | 发现与分享 | 公开广场、分享链接、私密密码解锁 | VOT-FR-04、12、13 |
  | 投票与回执 | 两种身份模式、单选、防重复、断网后查询参与状态 | VOT-FR-05、07 |
  | 汇总与监督 | 按权限展示结果、管理员全局只读、去敏审计 | VOT-FR-06、10、14 |
  | 页面与运行 | 响应式页面、概览、数据库迁移、安装说明和可重复演示 | VOT-FR-09、11 |

  **当前默认值：** 单题单选、2–10 个选项、不改票/撤票；发布后配置冻结；服务端时间决定可投窗口；关闭后分享链接仍可访问最终结果。密码长度、授权时长等完整定义见技术细则的 BR-01–BR-13，属于实施默认值，可由后续需求分析提出修订。

  **范围外：** 多选、一次性投票码、密码学匿名、白名单、第三方登录、邮件验证、密码找回、移动客户端和大规模选举。后续新增时先评估影响，不预先搭建通用投票引擎。

* **开发必须遵守的边界。**

  1. `references/` 全部只读；不在其中安装依赖、生成缓存、运行应用或迁移。新系统脱离参考目录也能运行。
  2. 前端使用 React，借鉴 `R_IELTSWORDS` 的浅色靛紫主题、卡片和响应式布局；后端使用 Python，尽量沿用 `R_llm-sale` 的 `src/main/python/`、按业务拆分 API、`fileds/request`、`fileds/response` 和 `algorithms/` 层级。认证、关系数据库和投票事务需要自行实现。
  3. 两名编程成员分别主责前端与后端/数据库，共同联调与代码修复；不额外假设数据库组或第三名开发者。
  4. 当前基线可以演进，但权限、有效票和历史数据不能因赶工被静默改变。已确认的完整约束保留在[需求来源](#全局约束与需求来源)。

## 技术结构与模块边界

* **采用的技术方向。** 具体小版本在初始化时验证兼容性并锁定；当前均为建议选型。

  | 部分 | 技术 | 主要职责 |
  | --- | --- | --- |
  | 前端 | React 19、TypeScript、Vite 8、Ant Design 6、React Router 7、Axios | 页面、表单、状态、API 调用与响应式布局 |
  | 后端 | Python 3.12、FastAPI、Pydantic 2、同步 SQLAlchemy 2、psycopg 3 | 认证、权限、业务规则与事务 |
  | 数据库 | PostgreSQL 17、Alembic、Docker Compose | 持久化、唯一性/外键约束、迁移与本地环境 |
  | 验证工具 | pytest、Ruff、Vitest、Testing Library、Playwright | 后端规则/并发、前端组件、浏览器流程与构建检查 |

  开发环境用同源 `/api/v1` 代理。前端不直接访问数据库；后端采用模块化单体。第一版不引入微服务、Redis、消息队列或外部 AI 服务。

* **目录与调用链。** 先按下列边界理解代码；[完整目录和模块职责](#架构与代码结构)列出具体目标文件。

  ```text
  frontend/                              React 页面、组件、API 客户端与测试
  backend/src/main/python/main.py        FastAPI 应用工厂与路由挂载
  backend/src/main/python/api/           routes.py 汇总；各业务目录放接口文件
  backend/src/main/python/fileds/        request/ 入参、response/ 出参、context.py 内部上下文
  backend/src/main/python/algorithms/    按业务划分的模块，承载规则与事务
  backend/src/main/python/config/        服务、数据库连接与日志配置
  backend/src/main/python/constants/     状态枚举与错误码
  backend/src/main/python/utils/         安全、时钟、限速与异常处理工具
  backend/src/main/python/database/      新增 ORM 模型与约束
  backend/tests/                        单元、API、数据库集成与并发测试
  db/                                   Compose、迁移、初始化/备份说明、本地运行数据
  deploy/                               反向代理与部署说明
  docs/coordination/                    编程基线、接口快照、实现版本交接记录
  ```

  调用链为 **页面/组件 → feature API → api/业务接口 → algorithms/业务模块 → database/模型 → PostgreSQL**。`AuthService`、`PollService`、`VoteService` 等类名与方法契约保留，文件放到对应 `algorithms/*_module/` 下。业务正确性由后端与数据库保证；前端禁用按钮只改善交互。Service 直接使用 SQLAlchemy，暂不增加空壳 Repository 层。

  `fileds` 沿用参考项目的原拼写，便于按熟悉的位置查找；它承载 Pydantic 请求/响应模型。`database/models/` 是为本项目持久化补充的目录，迁移和数据库运行数据仍放仓库根目录的 `db/`。完整映射见[架构与代码结构](#架构与代码结构)。

* **统一通信格式。** POST/PATCH 的 JSON 请求只有一个顶层字段 `data`，其中放该接口的强类型业务参数；GET 继续使用路径和查询参数。所有应用 API 的 JSON 响应使用 `code / msg / data / request_id`：成功 `code=0`，失败使用数值业务码，并保留真实 HTTP 状态。完整模型、示例和前端调用规则见[通用 Schema](#通用请求与响应-schema)。

## 开发顺序与里程碑

* **先交可运行切片，再补齐完整范围。** 下列顺序安排代码交付；I1 是中间演示，不代表 P0 全部完成。日期沿用既有建议作为目标，实际进度或新需求变化时调整范围并说明缺口。

  | 交付点 | 编程内容 | 何时达到 | 建议目标 |
  | --- | --- | --- | --- |
  | 开工基线 B0 | 确认当前字段/规则；初始化后端、数据库与前端外壳 | T01/T02 与 T07 可以并行推进，接口有简短记录 | 10-24 至 10-26 启动 |
  | I1 可运行闭环 | 普通用户创建/发布 → PUBLIC 记名/匿名参与 → 关闭 → 结果 | T01–T03 基础完成；T04–T06、T08/T09 的 PUBLIC 路径真实联调，重复投票与权限测试通过 | 10-31 至 11-02 |
  | I2 完整功能 | 补齐 PRIVATE、分享门禁、全部结果权限、记名记录与管理员监督 | T04–T09 剩余路径完成，四组合全部可操作；P0 齐备 | 11-03 至 11-09 |
  | 稳定编程版本 | P1 概览/审计/响应式、边界回归、安装/迁移/恢复、CI | T10/T11 完成，阻断问题已修复；未完成项据实列出 | 11-10 至 11-23 |
  | 编程交接版本 | 固定可运行版本、更新 API/迁移/功能状态与已知问题 | T12 核对完成，可被其他成员独立运行和核查 | 11-24 至 12-01 |

  **切片执行方式：** T04–T09 是按模块划分的工作包，可以分 PUBLIC/PRIVATE 等能力逐步交付。I1 阶段仍使用完整的模式字段、数据库约束和扩展位置，但未完成的私密创建/分享路径须明确不可用，不能提供缺少门禁的半成品入口。只有整个工作包验收完成，才将该 T 标为完成。

* **两人的并行路线。** 后端主责按 `T01 → T02 → T03 → T04 → T05 → T06` 建立能力；前端主责同时推进 T07，并依据暂定接口准备 T08/T09 的表单和 Mock。接口具备后逐条接入真实服务，两个成员共同完成每个可运行切片。

  | 工作包 | 主责 | 依赖与开始条件 | 本项完成时应看到什么 |
  | --- | --- | --- | --- |
  | [T01 环境](#t01-基础环境与双上下文配置) | 后端 | B0 即可开始 | 健康接口、配置和开发/测试数据库可用 |
  | [T02 数据库](#t02-八张表模式约束与迁移) | 后端 | T01 | 空库可迁移，关键约束拒绝非法票 |
  | [T03 认证](#t03-账户会话访客上下文与-csrf) | 后端 | T02 | 登录与访客上下文独立运行 |
  | [T04 投票管理与门禁](#t04-创建者所有权投票配置分享与密码门禁) | 后端 | T03 | 自己的投票可管理，私密访问有服务端保护 |
  | [T05 投票事务](#t05-两种模式投票匿名去关联与并发) | 后端 | T04 对应路径 | 两模式各自最多一票，截止/并发/未知提交处理正确 |
  | [T06 结果与监督](#t06-分权限汇总记名历史与管理员读取) | 后端 | T05 对应路径 | 汇总、历史与管理员读取遵守权限 |
  | [T07 前端基础](#t07-前端主题公开入口与双会话状态) | 前端 | B0 可先做；真实会话接 T03 | 布局、路由、登录/访客状态与请求层可用 |
  | [T08 参与页面](#t08-分享密码门禁与两种参与流程) | 前端 | T07；联调依赖 T04–T06 对应路径 | 从入口到回执/结果的参与闭环 |
  | [T09 创建与管理页面](#t09-普通用户创建工作区与管理员只读监督) | 前端 | T07；联调依赖 T04/T06 | 普通用户创建/管理，管理员全局读取 |
  | [T10 编程回归](#t10-浏览器联调与编程回归) | 两人共同 | 用例可提前写；执行依赖相应真实页面/API | 四组合、权限、隐私、异常恢复有实际测试证据 |
  | [T11 运行交付](#t11-安装部署备份与持续集成) | 后端主责、前端配合 | 配置从 T01 建立；最终验证接稳定联调版本 | 干净检出可安装，CI/迁移/恢复可复现 |
  | [T12 编程交接](#t12-编程版本交接与需求回流) | 两人共同 | 每个切片更新，最终汇总 T10/T11 | 可运行版本与简短技术交接记录一致 |

  **日常推进原则：** 每人先完成当前切片的一项可验证交付，尽早联调。Mock 不计作真实完成；不同时展开大量页面再集中补后端。需求分析和其他组的正式文档不是上述技术依赖。

## 开发工作包

* **统一执行规则。** T01–T12 是编程工作包，不是团队阶段。每项给出交付文件、接口、关键断言与实施步骤；后端源码路径若未写完整前缀，均相对 `backend/src/main/python/`，测试路径相对 `backend/`。后端命令在 `backend/`，前端命令在 `frontend/`，Compose 在仓库根目录执行。

  核心新行为先写可失败的测试，再实现和验证；纯文档/低风险样式用检查或构建验证。`- [ ]` 仅在完成对应步骤后勾选。下列命令全部供实施时使用；本次只整理计划。后续自动化实施可按 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐项执行。

### T01 基础环境与双上下文配置

* **负责人：** 后端主责；前端成员可同步推进 T07。**依赖：** B0。

* **交付物与文件。** 新建 `backend/pyproject.toml`、`backend/uv.lock`、`backend/.python-version`；源码建立 `main.py`、`config/{server_config.py,database_config.py,logger_config.py}`、`constants/{enums.py,error_codes.py}`、`utils/{error_handlers.py,response_util.py,clock_util.py}`、`fileds/request/request.py`、`fileds/response/response.py`、`api/routes.py` 与 `api/health/health_get.py`。补齐 Python 包的 `__init__.py`，建立 `db/compose.yml`、环境变量示例和简短基线/接口记录，精确扩充根 `.gitignore`。

  **接口：** `main.py` 的 `create_app(settings: Settings | None = None) -> FastAPI`；`config/database_config.py` 的 `create_session_factory(database_url: str) -> sessionmaker[Session]` 使用 READ COMMITTED 与 hide_parameters；`utils/clock_util.py` 的 `Clock.now() -> datetime` 返回 UTC。公共请求文件定义 BaseRequestData、RequestModel、EmptyRequestData、PageQuery；公共响应文件定义 ResponseModel、Page、ValidationIssue 和 ValidationErrorData；数值 ApiCode 在 `constants/error_codes.py` 定义。

  Settings 包含 DATABASE_URL、TEST_DATABASE_URL、ALLOWED_ORIGINS、PUBLIC_BASE_URL、SESSION_TTL_HOURS=8、GUEST_TTL_DAYS=30、POLL_ACCESS_TTL_MINUTES=60、COOKIE_SECURE、ANON_VOTER_HMAC_KEY。最后一项由环境提供至少 32 字节随机密钥，重启/多实例保持一致，示例配置留空，不写真实值。

  - [x] 先建立最小 `pyproject.toml`、测试依赖、Python 包和应用工厂空壳；按下文导入约定从 `backend/` 运行，确认 `src.main.python` 可导入且测试能收集，再检查未实现功能的业务断言失败。
  - [x] 写 `tests/api/test_health.py`：live 为 200，数据库不可用时 ready 为 503，响应没有 DSN/密码。先运行 `uv run python -m pytest tests/api/test_health.py -q` 确认因未实现而失败。
  - [x] 建立 `tests/unit/test_common_schema.py` 和 `tests/api/test_response_contract.py`：缺少 data、data=null、额外外层/内层字段被拒；成功/失败均只有约定的四个顶层字段；创建成功保持 201；401/403/404/405/415/422/500/503 的响应、错误码、脱敏和 OpenAPI 一致。先运行这些用例确认失败。
  - [x] 实现工厂、配置、异常、日志去敏入口与健康路由；同步 ORM 配合 `def` 路由。
  - [x] 实现服务端 request_id 初始化、统一响应构建及异常处理；请求校验失败和框架 404/405 也走相同 Schema。用实际响应验证 Cookie/Retry-After/no-store 等头仍保留，匿名路径不因统一日志而增加关联标识。
  - [ ] 填写根目录 `.env` 后，在根目录执行 `docker compose --env-file .env -f db/compose.yml --profile test up -d --wait`。
  - [ ] 运行健康测试与 Ruff，④记录当时采用的配置/部署边界并交③后续整理，提交 `chore: establish voting application environment`。不读取 references 作为运行依赖。

### T02 八张表、模式约束与迁移

* **负责人：** 后端主责，前端成员交叉核对业务字段。**依赖：** T01。

* **交付物与文件。** 建立 `database/models/` 下的 base/user/session/guest/access_grant/poll/vote/audit 和汇总 `__init__.py`，配置 `backend/alembic.ini` 与根目录 `db/migrations/`；测试为 `test_migrations.py`、`test_constraints.py` 和 conftest。

  **接口：** Base.metadata 汇总八张表。`identity_mode = NAMED | ANONYMOUS`、`visibility = PUBLIC | PRIVATE`；AuditAction 包含 CREATE、UPDATE、PUBLISH、CLOSE、VOTE_NAMED。命名约束沿用[数据库与事务设计](#数据库与事务设计)，分别约束记名账号与匿名浏览器凭据。

  **测试断言：** NAMED 同账号重复、ANONYMOUS 同本场散列重复均失败；不同匿名散列允许；匿名含 voter_id、记名缺 voter_id、票种与 poll 不同均被数据库拒绝；跨场选项失败；PRIVATE 缺密码散列/PUBLIC 带密码散列失败；结束不晚于开始失败。

  - [x] 已写约束与空库迁移测试，并运行 `uv run python -m pytest tests/integration/test_migrations.py tests/integration/test_constraints.py -q`。模型与迁移先于测试落盘，这次运行直接通过。
  - [x] 实现 CHECK、两个条件唯一索引、两组组合 FK、NOT NULL、限制删除与必要索引，人工核对迁移。
  - [x] 在专用测试库执行空库 upgrade，以及仅对测试初始结构的 downgrade/upgrade；不在开发数据上测试降级。
  - [ ] 测试库地址守卫、独立连接并发和 `docs/coordination/schema-snapshot.md` 已完成。尚未提交 `feat: add named anonymous and access-control schema`。

### T03 账户会话、访客上下文与 CSRF

* **负责人：** 后端主责。**依赖：** T02；公开响应供 T07 接入。

* **交付物与文件。** 建立 `utils/security_util.py`、`fileds/request/auth_request.py`、`fileds/response/{auth_response.py,guest_response.py}`、`fileds/context.py`；业务类分别位于 `algorithms/auth_module/auth_service.py`、`algorithms/guest_module/guest_service.py`。建立 `api/auth/{auth_post.py,auth_get.py}`、`api/guest/guest_post.py`、`api/dependencies.py` 和 `cli.py` 的账户种子；测试 `test_auth.py`、`test_guest_context.py`、`test_permissions.py`。

  **接口：** `AuthService.register(payload: RegisterRequest) -> UserPublic`；`login(payload: LoginRequest) -> LoginResult`；`authenticate(raw_token: str) -> SessionContext`；`logout(raw_token: str) -> None`。`GuestService.ensure_context(raw_token: str | None) -> GuestInitResult` 创建或恢复访客，GuestInitResult 的原 token 只用于设置 Cookie；公开返回 GuestPublic。

  UserPublic、SessionPublic、GuestPublic 位于对应 `fileds/response/` 文件；Principal、SessionContext、GuestContext、LoginResult、GuestInitResult 等内部对象位于 `fileds/context.py`，不直接作为公开响应。`api/dependencies.py` 的 `get_optional_principal()` 允许访客；`require_user()` 支持 USER/ADMIN，`require_admin()` 只负责全局读取；投票访问上下文由 T04 按场次构造。

  路由分别接收 `RequestModel[RegisterRequest]`、`RequestModel[LoginRequest]` 或 `RequestModel[EmptyRequestData]`，只把 `.data` 交给 Service。公开身份数据放到 ResponseModel.data；原 token 只经 Cookie 设置。注销含重复注销统一返回 HTTP 200、code=0、data=null。

  **测试断言：** 普通注册固定 USER；外层或 data 内注入 role/user_id/token 等未定义字段为 422；密码散列、过期、注销和停用检查；错误 Origin/CSRF 被拒；guest Cookie 先落盘才可投；刷新/登录/注销不更换有效 guest；新匿名上下文不包含 user_id；200/201 响应解包后的身份模型符合约定。

  - [x] 写上述用例并运行 `uv run python -m pytest tests/integration/test_auth.py tests/integration/test_guest_context.py tests/api/test_permissions.py -q`。实现与测试同一批落盘，这 19 个用例第一次运行即通过。同一轮全量测试中，迁移脚本的 `fileConfig` 关掉了已有日志器，既有响应契约测试因此失败；改为不关闭已有日志器后，`uv run python -m pytest tests/unit tests/api tests/integration -q` 为 49 passed。
  - [x] 实现 Argon2、账户/访客分离的随机 Cookie、散列存储、TTL 与 POST /guest/context；明确各写 API 使用 auth 或 guest CSRF。
  - [x] 实现幂等 seed-demo：一个 ADMIN、两个 USER；不重置密码或静默提升同名账户角色，不输出凭据。
  - [ ] 对应测试与敏感字段检查已通过。尚未提交 `feat: add account sessions and independent guest context`。

### T04 创建者所有权、投票配置、分享与密码门禁

* **负责人：** 后端主责。**依赖：** T03；向 T08/T09 提供管理和访问接口。

* **交付物与文件。** 建立 `fileds/request/{poll_request.py,poll_access_request.py}` 与对应 response 文件；业务类位于 `algorithms/poll_module/poll_service.py`、`algorithms/poll_access_module/poll_access_service.py`、`algorithms/audit_module/audit_service.py`。建立 `api/poll/{poll_get.py,poll_post.py,poll_patch.py}`、`api/poll_access/poll_access_post.py`、`api/share/share_get.py`、`api/admin/admin_get.py` 与 `utils/rate_limit_util.py`；测试 `test_poll_status.py`、`test_schema_validation.py`、`test_polls.py`、`test_poll_access.py`、`test_ownership.py`。

  **接口：** `effective_status(poll: Poll, now: datetime) -> PollStatus`；`PollService.create(principal: Principal, payload: PollCreate) -> ManagePollDetail`；`update(principal, poll_id, payload: PollUpdate) -> ManagePollDetail`；`publish(principal, poll_id, expected_version: int) -> ManagePollDetail`；`close(principal, poll_id, expected_version: int) -> ManagePollDetail`。

  查询为 `list_public(filters) -> Page[PollSummary]`、`list_owned(principal, filters) -> Page[ManagePollSummary]`、`get_owned(principal,poll_id) -> ManagePollDetail`、`list_admin(principal,filters) -> Page[ManagePollSummary]`、`get_admin(principal,poll_id) -> ManagePollDetail`。所有权只比较 creator_id；ADMIN 不覆盖他人的写权限。

  `PollAccessService.resolve_share(share_code: str) -> ShareEntry`；`unlock(guest: GuestContext,poll_id: int,payload: UnlockRequest) -> AccessGrantPublic`；`get_visible(context: PollAccessContext,poll_id: int) -> PollDetail`。UnlockRequest 为 share_code/password，AccessGrantPublic 仅有 poll_id/expires_at。状态恢复在同一事务先获取 poll 共享锁，再查 NAMED 账号或匿名散列。

  `AuditService.record(session: Session,actor_id: int,action: AuditAction,poll_id: int,receipt_id: UUID | None,request_id: str) -> None` 接收调用方事务，不自行提交；仅用于管理和记名事件。私密密码与模式/公开性在发布后冻结，草稿更新可保留原密码散列。

  PollCreate/PollUpdate/UnlockRequest/VersionRequest 继承 BaseRequestData；路由使用 `RequestModel[对应类型]` 并传 `.data` 给业务层。VersionRequest 只含 expected_version，供发布/关闭共用；读取和写入的公开结果统一包为 `ResponseModel[对应资源]`，Service 不承担 HTTP 外层封装。

  **测试断言：** USER 可创建自己投票；他人 USER/非创建者 ADMIN 写入为 403；自己草稿可见、他人草稿不可分享；PRIVATE 不出现在广场/总数/搜索；四组合访问规则正确；密码错误/过期/跨场/跨浏览器授权失败；过期后同浏览器重复解锁可续授权；提前关闭后旧分享链接可进入最终结果；发布与时间边界、旧版本 409；所有响应无密码散列。

  - [x] 写所有权、模式、门禁和状态用例，并运行 `uv run python -m pytest tests/unit tests/integration/test_polls.py tests/integration/test_poll_access.py tests/integration/test_ownership.py -q`。实现与测试同一批落盘，这 21 个用例第一次运行即通过，没有先看到失败。同一轮 `uv run python -m pytest tests/unit tests/api tests/integration -q` 为 63 passed。
  - [x] 实现普通用户创建、自己的草稿编辑/发布/关闭、版本校验，以及统一 poll→必要用户的写锁顺序。
  - [x] 实现分享码解析、最低限度入口、密码授权和失败限速。私密读权限覆盖详情和已投状态恢复；`can_vote`、`can_manage`、`can_view_results` 已按创建者、管理员、关闭和未公布计算。投票提交仍属 T05。
  - [ ] 上述测试已通过。尚未提交 `feat: add creator ownership sharing and private poll access`。

### T05 两种模式投票、匿名去关联与并发

* **负责人：** 后端主责，两人核对前端恢复流程。**依赖：** T04 对应访问路径。

* **交付物与文件。** 建立 `fileds/request/vote_request.py`、`fileds/response/vote_response.py` 中的 VoteReceipt、`algorithms/vote_module/vote_service.py` 和 `api/vote/vote_post.py`，补齐 `test_votes.py`、`test_vote_concurrency.py`、`test_anonymous_privacy.py`；可运行后提供实际调用/事务顺序与自测结果供其他成员整理和验证。

  **接口：** `VoteService.cast_vote(context: PollAccessContext,poll_id: int,option_id: int) -> VoteReceipt`；构造时注入 SessionFactory、Clock 与稳定 HMAC 密钥。锁定 poll 后读取真实模式；NAMED 用有效账号，ANONYMOUS 仅持久化本场浏览器散列，忽略账户关联。路由接收 `RequestModel[VoteRequest]`，data 内只允许 option_id；提交后返回 HTTP 201 的 `ResponseModel[VoteReceipt]`。

  **关键测试：** 两模式各自双连接并发只有一票；独立匿名凭据可另投，明确不是一人一票；PRIVATE 无授权不得投；跨场选项/票种失败；截止/关闭并发遵守锁顺序；NAMED 审计失败回滚；匿名票无账户、guest FK、可关联审计/日志；HMAC 重启稳定且跨场不同；COMMIT 确认丢失返回未知，原上下文可查到票。

  - [x] 写模式/并发/隐私用例，运行 `uv run python -m pytest tests/integration/test_votes.py tests/integration/test_vote_concurrency.py tests/integration/test_anonymous_privacy.py -q`。实现先于测试落盘。第一次运行有 5 个失败，原因是测试自己查错了审计行、过早打补丁，以及等待检测没有按 PostgreSQL 的事务锁观察；修正测试后该命令 14 passed。
  - [x] 按[数据库章节](#数据库与事务设计)的事务顺序实现，两个命名唯一索引冲突才映射 ALREADY_VOTED，不用前端 Cookie 或先查后插代替数据库约束。
  - [x] 关闭与投票复用同一 poll 行锁；事件/数据库锁协调并发测试，不用固定 sleep 猜测顺序。提交前失败与 COMMIT 确认未知分开处理。
  - [x] 检查已登录用户投匿名票的数据、caplog 与响应，确认不会经 receipt/request_id 重建账号关联。修正测试后的全套回归为 77 passed。尚未提交 `feat: enforce atomic named and anonymous voting`。

### T06 分权限汇总、记名历史与管理员读取

* **负责人：** 后端主责。**依赖：** T05 对应投票路径；与 T08/T09 联调。

* **交付物与文件。** 建立 `algorithms/result_module/result_service.py`，补齐 `algorithms/audit_module/audit_service.py` 的查询；`fileds/response/vote_response.py` 定义 PollResults/OptionResult/MyVote，`audit_response.py` 定义 AuditEventPublic。建立 `api/result/result_get.py`、`api/vote/vote_get.py`，补齐 `api/admin/admin_get.py`、`test_results.py`、`test_audit.py`，扩展 new-demo-round。

  **接口：** `ResultService.get_results(context: PollAccessContext,poll_id: int) -> PollResults`；`VoteService.list_my_votes(context: PollAccessContext,page: int,page_size: int) -> Page[MyVote]` 要求有效 principal，仅查本人 NAMED，并用 guest grant/所有权/管理员权限过滤私密记录；`AuditService.list_events(principal,filters) -> Page[AuditEventPublic]`。

  **结果规则：** 同一 READ COMMITTED 事务先取 poll FOR SHARE，再读 Clock 和权限，再聚合。创建者/ADMIN 可读进行中快照，普通参与者必须 CLOSED 且满足 NAMED 登录/PRIVATE 授权。进行中 is_final=false，不将当前最高项称最终胜出者。

  汇总与列表在路由层返回 `ResponseModel[PollResults]`、`ResponseModel[Page[MyVote]]` 等明确类型；分页字段只在 data 内，计票与隐私规则继续由对应 Service 负责。

  **测试断言：** `[2,1,0]` 总数 3，零票项不丢；零票无领先/胜出项；`[2,2]` 全部并列；创建者/ADMIN 开放期 200、其他人 403；私密授权到期不可读，记名历史标题/回执及 total 也不泄露，重新解锁后恢复；账号历史不含匿名票；匿名审计没有可反查账户字段。`test_results_wait_for_inflight_valid_vote` 覆盖合法票跨截止提交，结果必须等待并计入。

  - [x] 写聚合、读取权限和历史隔离测试，运行 `uv run python -m pytest tests/integration/test_results.py tests/integration/test_audit.py -q`。第一次运行 6 passed、1 failed；失败是测试把选项编号 `1` 误当成响应里的选项字段。修正断言后，这两个文件与全套一起通过。
  - [x] 实现共享锁下的访问/结果权限与聚合，明细和总数来自同一次聚合，读操作不改生命周期。
  - [x] 实现普通用户创建四种组合的 new-demo-round，不覆盖历史、不输出私密密码；验证 ADMIN 全局列表/详情/汇总只读能力。
  - [x] 运行后端全部测试，核对模式/访问矩阵与票数。`uv run python -m pytest tests/unit tests/api tests/integration -q` 为 84 passed。尚未提交 `feat: add scoped results and global read-only oversight`。

### T07 前端主题、公开入口与双会话状态

* **负责人：** 前端主责。**依赖：** B0 可先搭建，真实身份接入依赖 T03。

* **交付物与文件。** 初始化 Vite/TypeScript/测试配置，建立 styles/app/layouts/lib，重点新增 `frontend/src/lib/{api-types.ts,api-codes.ts,http.ts,api-error.ts}`；建立 features/auth 与 features/poll-access 的 GuestProvider，完成登录/注册/403/404 和 DashboardPage 基础入口。采用参考视觉，公开/匿名入口不强制登录。

  **接口：** AuthProvider 暴露 status/user/login/logout/refreshSession；GuestProvider 暴露 guestStatus/guestCsrf/ensureGuest；apiClient 按 API 选择 csrfSource，统一包装 `{data: payload}`、校验 HTTP/code 并解包一层 data。共享 RequestModel/ResponseModel/Page/ApiCode 类型；ApiClientError 是前端异常，不是第二种后端响应结构。RequireAuth 只守卫创建者工作区、记名行为与管理员页面，匿名流程不可被全局 401 拦截器强制跳登录。

  **测试文件：** AuthProvider、GuestProvider、RequireAuth、AppLayout 组件测试；断言公开广场可访问、登录初始化不误跳、匿名投票不要求登录、账户失效和密码授权失效分开、USER 不能进管理员页但可以进自己的创建页。

  - [x] 先完成 Vite/TypeScript/Vitest 最小工程。页面和测试同一批落盘，没有单独保留一次“收集失败”的记录。
  - [x] 写双状态/路由用例。实现与测试同时落盘，`npm run test -- --run` 第一次完整结果是 24 passed，没有先看到失败。
  - [x] 在 `lib/__tests__/http.test.ts` 验证 POST/PATCH 只包一层、GET 无 JSON body、200/201 正常解包、失败进入 ApiClientError、字段错误可映射表单、注销 data=null、网络/非 JSON 错误可处理；不重发写请求，不把 request_id 当幂等凭据。该文件 7 个测试通过。
  - [x] 实现靛紫浅色主题、侧栏/抽屉、登录注册、公开入口，所有登录用户显示“创建投票/我创建的/记名参与”。
  - [x] 配置 Cookie、两种 CSRF 来源和错误码；token/密码不放 localStorage。安全 GET 最多有限重试，写操作不自动重试。浏览器确认登录、刷新和注销不更换 `voting_guest`。
  - [ ] 2026-10-25 的 lint、typecheck、24 个组件测试、build 和上述浏览器检查已通过。尚未提交 `feat: add public frontend and separate account guest state`。

### T08 分享、密码门禁与两种参与流程

* **负责人：** 前端主责，后端配合。**依赖：** T07；真实联调依赖 T04–T06 对应路径。

* **交付物与文件。** 建立 ShareEntry/PollAccess/列表/详情/结果/记名历史页面，PollCard、BallotForm、确认框及 poll-access API/状态。

  **接口：** getPolls/getPoll/castVote/getResults/getMyVotes 对应本版 API；新增 `resolveShare(code)`、`unlockPoll(id,{share_code,password})`、`ensureGuest()`。feature API 传业务参数给公共客户端，页面获得解包后的业务资源；不自行重复添加 data 或读取第二层 data。登录返回只接受本站相对路径，保留原分享入口；PRIVATE 密码不出现在跳转参数。

  **组件测试：** 四组合入口；未初始化 guest 不准提交；NAMED 访客登录后返回本场；PRIVATE 解锁前不渲染题目；guest/授权过期分别恢复；重复与网络未知用原账号/浏览器恢复回执，不自动 POST；切页旧响应不覆盖新内容。

  - [x] 写门禁、投票状态和未知提交恢复用例。实现与测试同时落盘，组件测试没有单独的先失败记录。
  - [x] 实现访问状态机、单选确认、截止提示、回执和角色化结果入口，按后端 capability 呈现。已授权的私密记名场次在未登录时进入登录，而不是停在密码页。
  - [x] 匿名页面说明浏览器防重复限制。记名历史不展示匿名记录。一次未查到不宣布原请求确定失败。
  - [ ] 真实 API 已覆盖记名、匿名、公开和私密。`npm exec playwright test` 为 7 passed。尚未提交 `feat: implement shared private and anonymous participation`。

### T09 普通用户创建工作区与管理员只读监督

* **负责人：** 前端主责，后端配合。**依赖：** T07；真实联调依赖 T04/T06 对应接口。

* **交付物与文件。** 建立 features/creator 的 api/types/PollForm/PollFilters/SharePanel；MyPolls/PollWorkspace/PollEdit 页面；features/admin 的只读列表/详情/审计页。

  **接口：** createPoll/updatePoll/publishPoll/closePoll 使用本人所有权接口；getMyPolls/getOwnedPoll/getShareInfo 对应工作区；getAdminPolls/getAdminPoll/getAuditEvents 仅全局读取。均经公共客户端封装请求和解包响应；表单增加 identity_mode/visibility，PRIVATE 要求密码，已存密码不回显。

  **测试断言：** USER 可创建和管理自己，不能管理他人；PRIVATE 密码必填；两维度独立；发布冻结；同一创建者双会话旧版本保存 409；复制链接无密码；ADMIN 可看私密和进行中汇总，但对他人无编辑/发布/关闭按钮，直接写 API 也为 403。

  - [x] 写创建表单、分享与所有权界面用例。实现与测试同时落盘，组件测试没有单独的先失败记录。
  - [x] 实现本人草稿、发布、关闭、分享复制和进行中汇总。普通用户在创建者工作区创建投票。
  - [x] 首页公开进行中数量来自 `GET /polls?status=OPEN` 的 `total`，本人记名数量来自 `GET /me/votes` 的 `total`。
  - [x] 实现 ADMIN 全局只读和去敏审计。管理员没有修改他人投票的入口，直接写接口返回 403。
  - [ ] 375/768/1024/1440 的浏览器检查通过，后端所有权回归包含在 84 passed 里。尚未提交 `feat: add creator workspace and read-only administration`。

### T10 浏览器联调与编程回归

* **负责人：** 两名编程成员共同完成，按前后端模块修复问题。**依赖：** T08/T09 与对应真实 API；用例可以提前准备。⑤组可基于交接版本做独立验收，编程自测仍是代码交付条件。

* **交付物与文件。** 完成 `frontend/tests/e2e/` 下 auth/voting/creator/poll-access/anonymous-voting/admin/responsive 七类用例；必要时添加独立性能测量脚本。将执行环境、结果与未完成项写入实现交接记录。

  **完整流程：** USER A 创建/发布，USER B 或访客按模式参与；PRIVATE 需要密码，NAMED 需要账户；创建者/ADMIN 可看进行中汇总，其他人不能提前看；关闭后有访问权的参与者查结果。四种组合都覆盖，ADMIN 对他人始终只读。

  **完成条件：** 真实服务下主流程、权限、重复投票、未知提交恢复和移动布局可验证；失败用例关联到修复，不能用 Mock 通过替代联调通过。

  - [x] 编写七类 Playwright 用例和匿名丢响应恢复。不同身份使用独立 browser context。用例与页面一起落下，没有另存一次全红记录。
  - [x] `npm exec playwright test` 为 7 passed、31.3 秒。同一浏览器凭据不能再投，独立 context 可以另投。
  - [x] 375/768/1024/1440 的导航、密码页、表单、分享和结果没有页面级横向溢出。
  - [x] 匿名票没有账户或审计关联，私密标题公开搜索总数为 0。20 并发、100 场、1000 账户、10000 张历史票下，读取 p95 为 71.3 毫秒和 58.9 毫秒，记名和匿名投票 p95 为 99.2 毫秒和 82.5 毫秒，失败率为 0。机器是 macOS 15.5 arm64、10 CPU、24.0 GiB。两个目标都达到，只代表这次课程规模。
  - [ ] 注册重挂载和私密记名登录门禁已修并回归。结果写在实现交接里。尚未提交 `test: verify identity visibility ownership and recovery matrix`。

### T11 安装、部署、备份与持续集成

* **负责人：** 后端主责运行配置，前端配合构建，两人共同验证。**依赖：** 配置从 T01 开始，最终验证接 T10 稳定版本。

* **交付物与文件。** 完成 README、deploy 配置、备份说明与 CI；锁定实际验证过的依赖版本。

  **验证契约：** 无 references 的干净检出可安装；SPA 分享/工作区刷新可用；/api 代理正确；账户/访客 Cookie、CSRF、no-store、no-referrer 与私密日志策略有效；HMAC 密钥重启不变；迁移显式执行。

  - [x] README 写明 Python 3.12、Node 22.12+、uv、Compose、`backend/` 和 `src.main.python`，以及两个 Cookie、两种 CSRF、样例密码和稳定 HMAC。`ALLOWED_ORIGINS` 使用 JSON。
  - [x] `.github/workflows/ci.yml` 使用 PostgreSQL 17，把测试库映射到 5433，并分开后端、前端和浏览器 job。浏览器 job 还没有在 GitHub 上跑过。
  - [ ] 同一 HMAC 重启后，原匿名凭据再投得到 HTTP 409、`code` 为 `40901`。`new-demo-round` 写出四种组合。没有 commit，所以还不能从 Git 做干净检出。
  - [x] `pg_dump` 恢复到测试实例上的空库 `voting_restore`，票数、模式、授权和迁移一致。没有覆盖 5432，转储和空库已删除。
  - [ ] README 记录了单进程限流和匿名凭据边界。`deploy/` 只保留配置，没有公网部署。尚未提交 `docs: document reproducible private and anonymous voting setup`。

### T12 编程版本交接与需求回流

* **负责人：** 两名编程成员共同。**依赖：** 每个可运行切片都更新；最终交接以 T10/T11 的验证结果为依据。

* **交付物与文件。** 更新 `docs/coordination/working-baseline.md`、`interface-snapshot.md`、`implementation-snapshot.md`；核对 README、实际 OpenAPI 和 `db/migrations/`。提供其他组可核查的代码事实和运行入口。

  **完成条件：** 另一位成员能定位同一代码版本、按说明运行系统、知道哪些功能已实现和验证、哪些仍未完成；接口/表/页面与交接记录一致。

  - [ ] 没有可固定的 commit。`implementation-snapshot.md` 已把 B0 的 `PROVISIONAL`、迁移 `cdc412846524` 和各项 `VERIFIED` 分开。
  - [x] `create_app()` 的 OpenAPI 有 24 条路径，与接口快照一致。前端类型沿用同一信封。没有代写其他组的正式文档。
  - [x] 启动、演示场次、测试命令、结果和已知问题写在实现交接与 README。
  - [x] 本轮没有新的需求变更。未提交、访问日志和干净检出仍留在已知缺口，没有改写成已支持。
  - [ ] 交接记录已指向 README、OpenAPI 和迁移。尚未提交 `docs: hand off reproducible implementation and known gaps`。

## 需求变更与编程交接

* **新增需求按增量处理。** 当前 B0 不代表需求永久冻结。收到需求组结论后，编程侧按以下步骤处理，不承担其正式 SRS、模型或设计报告的编写任务。

  1. 记录需求 ID、来源、原行为、新行为和验收条件；区分已有规则未实现的缺陷与新的业务变更。
  2. 检查影响的页面、API/schema、Service、表/迁移、历史数据和测试；把影响与预计工作量反馈给需求组。
  3. 确定进入哪个实现增量，更新当前基线和接口快照后实施；涉及计票、隐私、权限和已发布投票时明确迁移/兼容方式，保护已有有效票。
  4. 回归受影响的主流程，更新交接记录；时间不足的需求明确列为待办，不把“已写进需求”标成“代码已支持”。

  `R1/R2` 表示需求版本，`I1/I2` 表示实现版本。需求状态 `PROVISIONAL/CONFIRMED/REJECTED` 与交付状态 `NOT_STARTED/IMPLEMENTED/VERIFIED` 分开维护；两种状态不能互相代替。

* **编程侧只维护够用的交接记录。** ②系统分析、③软件设计依据可运行版本整理各自产物；⑤测试与演进可据真实版本独立验证。编程侧提供下表证据并回答实现问题，不等待其他组文档完成才继续开发。

  | 文件/产物 | 编程侧需要记录什么 | 更新时机 |
  | --- | --- | --- |
  | `docs/coordination/working-baseline.md` | 当前 FR/BR、暂定规则、需求版本、待确认差异及目标增量 | 开工和需求变化时 |
  | `docs/coordination/interface-snapshot.md` + 实际 OpenAPI | 路由、请求响应、错误码、权限、前后端字段变动；记录对应代码版本 | 接口改变与切片交接时 |
  | `docs/coordination/implementation-snapshot.md` | 可运行 commit、启动方法、迁移版本、已完成/待办、测试结果、已知问题 | I1/I2 及后续稳定版本 |
  | 代码、迁移、README 与验证输出 | 真实实现和可复现操作；敏感值不进入 Git | 随代码更新 |

  上述记录可由实际 OpenAPI、迁移和测试输出汇总，避免手抄整套设计。正式课程报告、视频、全组排期和个人日志由相应成员处理，不作为本计划 T12 的编程交付物。课程理论及参考位置保留在[技术细则](#课程理论与项目证据)，方便其他成员查证。

## 编程完成标准

* **满足以下条件，才可将当前编程版本标为可交付。** [详细 NFR 与重点风险](#非功能目标与重点审查)、[启动和检查命令](#运行约定与验收矩阵)提供验证口径。

  - [x] P0 功能齐备，概览、审计和响应式已在当前工作区完成。普通用户创建和四种组合由真实 API 的 Playwright 验证。
  - [x] 应用 API 使用统一信封。OpenAPI 24 条路径与接口快照一致，前端统一包装和解包。
  - [x] 所有权、登录、私密密码和结果时机分开校验。管理员可以全局读取，不能修改他人的投票。
  - [x] 两模式防重复、跨场选项、截止和关闭并发、最终汇总、匿名去关联、未知提交恢复都在后端 84 passed 或浏览器测试中通过。
  - [x] 前端 lint、typecheck、24 个组件测试、build 和 7 条浏览器路径通过。后端 ruff check 与 84 passed 通过。NFR-06 的测量值低于 500 毫秒和 1000 毫秒。其余缺口见实现交接。
  - [x] 375/768/1024/1440 主流程可用。匿名页面说明浏览器凭据限制。
  - [ ] README、锁文件、迁移和备份步骤已写好，恢复演练通过，密钥没有进入 Git。当前没有 commit，不能从 Git 干净检出这份工作区。
  - [x] 基线、接口、迁移 `cdc412846524` 和实现交接指向同一未提交工作区。剩余问题可在实现交接里查到。

  日期只是计划目标，不代替验收；某项未完成时交付实际可运行范围并说明缺口，不虚构测试通过或个人贡献。

* **修订说明。** V2 确立四种投票组合；V3 记录团队实际协作背景；V4 聚焦电脑编程并合为单份计划；V5 沿用 R_llm-sale 的后端目录层级；**V6 精简通用输入，统一 code/msg/data/request_id 输出及数值业务码**，同步 API、前端封装、开发任务和测试口径。投票业务范围与关键正确性约束沿用已有基线。

## 技术细则

* **用途：** 按开发需要查阅详细规则和技术约定；实施顺序与任务完成条件见上文 T01–T12。需求变化时同步更新受影响的规则、接口和工作包。

* **按需查阅。**

  | 查什么 | 章节 |
  | --- | --- |
  | 用户约束、参考资料适用边界 | [全局约束与需求来源](#全局约束与需求来源) |
  | 角色、四组合、FR/BR、状态与输入限制 | [需求范围与业务规则](#需求范围与业务规则) |
  | 完整目标目录、模块依赖、选型 | [架构与代码结构](#架构与代码结构) |
  | 八表、外键/唯一性、锁与提交结果 | [数据库与事务设计](#数据库与事务设计) |
  | 精简输入、统一输出、Pydantic 模型和前端封装 | [通用请求与响应 Schema](#通用请求与响应-schema) |
  | Cookie/CSRF、私密授权、匿名隐私、错误码 | [认证、安全与错误约定](#认证安全与错误约定) |
  | HTTP API、资源类型、页面路由、视觉参考 | [接口契约与前端页面](#接口契约与前端页面) |
  | 质量目标、关键边界、测试归属 | [非功能目标与重点审查](#非功能目标与重点审查) |
  | 安装/检查命令与需求测试映射 | [运行约定与验收矩阵](#运行约定与验收矩阵) |
  | 软件工程依据与源文件 | [课程理论与项目证据](#课程理论与项目证据)、[参考资料索引](#参考资料索引) |

### 全局约束与需求来源

* **必须遵守的用户约束。**

  | 编号 | 约束 | 实施影响 |
  | --- | --- | --- |
  | U-01 | `references/` 下所有文件只能阅读，不能修改 | 不在其中安装依赖、生成缓存、导入运行应用、写测试报告或执行迁移；分析临时文件写到项目外临时目录 |
  | U-02 | 前后端分离，分别使用 `frontend/`、`backend/` | 前端通过 HTTP JSON 调用后端，不直接连接数据库 |
  | U-03 | 数据库放在 `db/` | Compose、Alembic 迁移、种子说明、备份说明与本地数据库数据目录集中放置 |
  | U-04 | 尽量运用课程理论 | 为需求、UML、架构、实现、测试和迭代保留课程出处与实际产物 |
  | U-05 | 前端使用 React，借鉴 `R_IELTSWORDS` 页面设计 | 借鉴视觉与交互模式，独立实现投票业务组件 |
  | U-06 | 后端使用 Python，目录层级尽量沿用熟悉的 `R_llm-sale` | 使用 `src/main/python/`、业务 API、`fileds`、`algorithms`、`config/constants/utils`；补充本项目数据库模型 |
  | U-07 | 先按课程演示版规划 | 保留单题单选、可安装演示与测试的范围，参与规则以 U-08 至 U-11 的新增要求为准 |
  | U-08 | 投票分为记名和不记名，普通用户也可创建 | 创建始终需登录；记名参与需登录；不记名可通过链接免登录参与 |
  | U-09 | 创建者可选择公开或不公开 | 公开投票进入广场；不公开投票仅分享访问且必须设置密码 |
  | U-10 | 创建者可生成分享链接 | 分享定位码不包含密码；私密投票访问者仍需密码，记名投票还需登录 |
  | U-11 | 管理员可查看全部投票及结果 | 管理员全局只读监督；不自动获得修改他人投票的权限，匿名只展示汇总 |
  | U-12 | 小组实际 10 人，五组各 2 人 | 按①需求、②分析、③设计、④编程、⑤测试与演进分工；原⑤⑥合并，不按六组十二人排期 |
  | U-13 | 需求分析与电脑编程并行，后续可能新增需求 | 当前计划是暂定编码基线；按需求增量分析影响、调整代码并回归 |
  | U-14 | 系统分析、软件设计正式产物在编码版本之后反推 | 基于真实代码、接口和迁移整理逻辑模型与设计说明，记录对应版本 |
  | U-15 | 时间紧，编程资源仅两人 | 前后端可在暂定接口上并行，集成共同负责，不额外假设第三支开发队伍 |
  | U-16 | 参考 ChatPostRequest 和 ResponseModel，为投票设计精简的统一输入/输出 | 请求/响应在公共文件定义；API、前端客户端和测试共用这套契约 |
  | U-17 | 允许不登录，以访客身份访问公开投票 | 公开列表/详情允许访客；记名提交需登录，不记名提交用独立浏览器凭据；本轮只更新计划 |

* **资料事实与适用边界。**

  1. 用户已开始编写应用代码，文首保留了现有实现与验证记录。本文目录树和契约用于后续对照，本轮只编辑本文件，未核对代码是否满足本次细化。
  2. 课程材料目前没有找到投票系统专属题目书或详细业务评分标准。用户已确认课程演示版并要求纳入上述新增规则；其余细节以本文标注的默认值为准。后续获得正式题目时，先做需求差异检查。
  3. 旧版曾审阅的 `submission/TeamB_MBC_Specification_14570818.md`（当前参考目录未找到）是银行应用规范，不是投票系统规范。银行转账、MFA、外汇、核心银行接口和“两次点击”等要求不得移植为投票硬性要求。
  4. 旧版曾审阅的 `Assignment_Requirement Engineering_v2.pdf`（当前参考目录未找到）是银行与保险的需求工程练习，其个人作业字数、截止日期不适用于本项目开发计划。
  5. `R_IELTSWORDS` 的真实前端是 JavaScript/JSX；本项目新增 TypeScript 是实施建议。`R_llm-sale` 没有可直接复用的完整关系数据库、投票事务或用户认证实现，这些需要新建。
  6. 参考文件保留在本地且已被主仓库忽略。最终投票应用必须脱离 `references/` 运行，课程报告中通过资料索引说明借鉴来源，不依赖读者拥有这些目录。

### 需求范围与业务规则

* **参与者与范围。**

  | 角色 | 第一版允许的行为 | 权限边界 |
  | --- | --- | --- |
  | 未登录访客 | 浏览公开广场及两种模式的公开详情，免登录参与不记名投票；密码解锁私密不记名投票；查看已结束且有访问权限的匿名汇总 | 不能创建；提交记名选票必须登录；不能访问他人草稿；结果仍按 BR-05 校验 |
  | `USER` 普通用户 | 创建和管理自己的投票、生成分享链接；按记名/公开性规则参与；查看本人记名参与记录 | 不能修改、发布或关闭他人投票，不得提交其他用户身份 |
  | 创建者（所有权） | 编辑/发布自己的草稿、关闭自己已发布投票、分享、查看自己投票的进行中汇总 | 创建者是 `creator_id` 关系，不是额外的账户角色；发布后规则冻结 |
  | `ADMIN` 管理员 | 查看全部投票（含草稿/私密）与各阶段汇总、查看去敏管理审计；也可作为普通登录账户创建和参与 | 全局监督为只读；写操作仍必须是该投票的创建者，不因管理员角色获得他人编辑权 |

  建议允许公开注册 `USER`；管理员只能由初始化命令创建。注册不接收 `role`、`is_active` 等权限字段。记名表示保存账号与选择的关联，不等于向所有参与者公开姓名；第一版仍只开放汇总与本人回执，不新增个人选择名单接口。

  记名只能保证“一账号每场一票”，没有真实学籍或实名校验。不记名只保证“同一有效浏览器凭据每场一票”，清除 Cookie、凭据过期、换浏览器或隐身窗口可以绕过。页面和课程报告不得宣称严格“一自然人一票”；一次性投票码留作增强项，第一版不实现。

* **记名方式与公开性的四种组合。**

  | `identity_mode` | `visibility` | 参与条件 | 发现与访问 |
  | --- | --- | --- | --- |
  | `NAMED` 记名 | `PUBLIC` 公开 | 提交选票需注册登录，以账号防重复 | 访客可从广场或分享链接浏览详情，投票时再引导登录 |
  | `NAMED` 记名 | `PRIVATE` 私密 | 注册登录，并通过本场访问密码 | 不进入广场，仅分享链接进入；登录不能替代密码 |
  | `ANONYMOUS` 不记名 | `PUBLIC` 公开 | 无需登录，提交前初始化浏览器参与凭据 | 访客可从公开广场或分享链接浏览详情 |
  | `ANONYMOUS` 不记名 | `PRIVATE` 私密 | 无需登录，通过访问密码并持有浏览器参与凭据 | 不进入广场，仅分享链接进入 |

  创建者/管理员凭身份读取详情和汇总时可绕过私密密码门禁；实际提交选票仍执行对应访问规则。密码保护详情、选项、提交、状态恢复与普通参与者结果读取，不能只保护投票按钮。未解锁入口仅返回最低限度的门禁信息，不泄露题目或选项。

* **功能清单。**

  | 需求 ID | 优先级 | 拟实现需求 | 可观察的验收结果 |
  | --- | --- | --- | --- |
  | VOT-FR-01 | P0 | 注册、登录、注销与当前身份恢复 | 刷新页面仍可恢复有效会话；注销后后续请求被拒绝 |
  | VOT-FR-02 | P0 | 登录用户创建、编辑自己投票草稿 | 保存标题、说明、选项、时间、记名方式、公开性；私密必须密码 |
  | VOT-FR-03 | P0 | 创建者发布与提前关闭 | 发布后模式、公开性、密码和规则冻结；他人及非创建者管理员不能写入 |
  | VOT-FR-04 | P0 | 公开广场、分享入口与授权详情 | 访客可读两模式的非草稿 PUBLIC 列表/详情；记名提交需登录；私密与草稿不泄露，状态来自服务端 |
  | VOT-FR-05 | P0 | 按模式单选防重复 | NAMED 按账号、ANONYMOUS 按有效浏览器凭据防重复；拒绝跨场选项 |
  | VOT-FR-06 | P0 | 分身份查看汇总结果 | 创建者/管理员可看进行中汇总；其他有权限参与者结束后查看 |
  | VOT-FR-07 | P0 | 记名账号记录与匿名本场回执恢复 | `/me/votes` 仅记名；匿名通过本场浏览器上下文恢复，不挂到账户历史 |
  | VOT-FR-08 | P0 | 身份、所有权与密码门禁独立校验 | USER 不能管理他人；ADMIN 只读全局；私密访问需本场授权 |
  | VOT-FR-09 | P0 | 初始化与可重复运行 | 全新机器可按 README 建库、迁移、创建演示账户并启动 |
  | VOT-FR-10 | P1 | 管理操作审计与匿名去关联 | 创建/编辑/发布/关闭可追踪；匿名逐票不写可关联账号的审计链 |
  | VOT-FR-11 | P1 | 首页概览与响应式优化 | 展示进行中场次、本人参与数量、快捷入口，手机也可完成主流程 |
  | VOT-FR-12 | P0 | 生成并复制分享链接 | 使用不可预测 share_code 定位已发布投票，URL 不含密码或登录凭据 |
  | VOT-FR-13 | P0 | 私密密码验证与短期访问授权 | 密码经散列保存；错误限速；授权只对本浏览器、本场有效 |
  | VOT-FR-14 | P0 | 管理员全局只读监督 | 可看全部投票和各阶段汇总，不泄露匿名身份或密码散列 |

  P0 是 I2 完整功能版本必须具备的能力；I1 仅是中间可运行切片，不代表 P0 已全部完成。P1 在主流程稳定后补齐，并在最终编程交付中完成。不要先实现图表动画或管理统计，再补投票正确性。

* **建议固定的第一版规则。**

  | 规则 ID | 默认值或行为 | 原因与实施位置 |
  | --- | --- | --- |
  | BR-01 | 一场投票只含一个单选问题；选项数 2–10 | 限制范围；`PollCreate`、发布校验与表单共同执行 |
  | BR-02 | NAMED 每账号、ANONYMOUS 每有效浏览器凭据每场最多一次，不允许改票/撤票 | 两个模式对应的条件唯一索引保障，不把匿名防重复称为一人一票 |
  | BR-03 | 投票窗口为 `starts_at <= now < ends_at` | 结束时刻本身不可投票；使用服务端 UTC 时间 |
  | BR-04 | 已发布投票的标题、选项、时间、模式、公开性、访问密码冻结 | 第一版不做发布后改规则、重设密码或轮换分享码 |
  | BR-05 | 创建者/ADMIN 可看进行中汇总，其他有访问权限者在结束后查看 | 公共列表和未授权详情不泄露票数；记名普通参与者仍需登录 |
  | BR-06 | 参与资格按模式、公开性、密码授权共同决定 | 不做白名单；PUBLIC 不代表 NAMED 可免登录，持链接不代表 PRIVATE 已解锁 |
  | BR-07 | 不提供个人选择公开查询或导出 | 应用界面仅展示汇总和本人参与状态 |
  | BR-08 | 不提供已发布投票的删除、重开与票据修改接口 | 保留历史与统计一致性；草稿删除也暂不列入第一版 |
  | BR-09 | 创建者可以提前关闭自己的已发布投票 | 非创建者 ADMIN 无关闭权；尚未开始即关闭时总票数为零 |
  | BR-10 | 最多票相同则展示全部并列项；零票时无胜出项 | 不在没有业务依据时设计抽签或第二轮投票 |
  | BR-11 | 所有创建操作需登录，creator_id 从后端会话取得 | 不接受前端指定他人所有权；creator 是关系，USER/ADMIN 是角色 |
  | BR-12 | 登录用户投匿名票时也不存账号与该票关联 | 账户会话与访客凭据分离；匿名不进入账号历史，日志/审计不重建关联 |
  | BR-13 | 私密密码至少 8、最多 128 字符，使用 Argon2；短期授权默认 1 小时 | 密码只由 POST JSON 提交，不进入 URL、缓存或日志；具体数值为建议 |

  选项数量、密码长度、授权时长和浏览器防重复机制是实施默认值；公开性、记名方式、普通用户创建与管理员查看能力来自新增用户需求。

* **状态设计。**

  数据库存储 `lifecycle = DRAFT | PUBLISHED | CLOSED`，界面/API 另返回 `effective_status = DRAFT | SCHEDULED | OPEN | CLOSED`，避免后台定时任务没有运行时仍显示可投票。

  ```mermaid
  stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> SCHEDULED: 发布且当前时间早于开始时间
    DRAFT --> OPEN: 发布且已到开始时间
    SCHEDULED --> OPEN: 到达开始时间
    SCHEDULED --> CLOSED: 创建者提前关闭
    OPEN --> CLOSED: 到达结束时间或创建者提前关闭
    CLOSED --> [*]
  ```

  `effective_status()` 的判定顺序固定为：草稿首先返回 `DRAFT`；显式关闭或 `now >= ends_at` 返回 `CLOSED`；其余按 `now < starts_at` 区分 `SCHEDULED` 与 `OPEN`。自然结束不要求修改数据库状态；`closed_at` 只记录创建者显式关闭时刻。

* **输入规范与待确认边界。**

  1. 建议用户名规范化为小写，匹配 `[a-z0-9_]{3,32}`，避免大小写重复；显示名 1–50 字符，密码 12–128 字符，不裁剪或改写密码。
  2. 建议标题去首尾空白后 1–120 字符，说明最多 2000 字符，选项文本去空白后 1–200 字符，同一场内不得重复。正文按普通文本展示，不执行 HTML。
  3. API 仅接受带时区的 ISO 8601 时间，存入 PostgreSQL `TIMESTAMPTZ`。前端输入明确标为香港时间 `Asia/Hong_Kong`，转换成 UTC 传输；香港与当前用户时区同为 UTC+8，但代码不能依赖浏览器恰好处于该时区。
  4. 发布必须满足 `ends_at > starts_at` 且 `ends_at > now`。允许开始时间已到，以便立即开始；不允许发布已过期草稿。
  5. 多选、密码学匿名、一次性投票码、面向所有人的实时计票、白名单、邮件验证、密码找回、第三方登录、国际化、移动客户端和大规模选举不在第一版。不记名访客投票属于本版范围。

### 架构与代码结构

* **推荐方案与备选。**

  | 方案 | 优点 | 成本/限制 | 本计划结论 |
  | --- | --- | --- | --- |
  | React + FastAPI + PostgreSQL，单体后端 | 贴近参考代码；有成熟事务与行锁；开发、集成测试与演示一致 | 本地需 Docker Compose 或已有 PostgreSQL | **推荐主方案** |
  | React + FastAPI + SQLite | 单文件，安装简单 | 写入串行；需要单独设计写事务，不能靠其测试证明 PostgreSQL 的并发正确性 | 作为重新选型的备选，不与主方案混用 |
  | React + Django/DRF + PostgreSQL | 内置认证、后台与迁移能力强 | 偏离现有 FastAPI 参考；本项目需要学习另一套框架 | 暂不采用 |

  不采用微服务、消息队列、Redis、向量数据库、LLM 或服务网格；当前投票流程没有对应需求。PostgreSQL 是新增建议，参考后端没有现成的 PostgreSQL 业务层。

* **后端目录与参考项目的对应关系。** 目录和路由组织以 `R_llm-sale` 为依据；业务类沿用本计划的 AuthService/PollService/VoteService 等职责与签名，承载在熟悉的业务模块位置。

  | 参考项目位置 | 本项目相对 `backend/` 的位置 | 沿用方式 |
  | --- | --- | --- |
  | `src/main/python/main.py` | `src/main/python/main.py` | 应用入口与路由挂载集中；保留可注入配置的 create_app 工厂 |
  | `api/routes.py` | `src/main/python/api/routes.py` | 汇总各业务文件导出的 router，统一挂 `/api/v1` 前缀 |
  | `api/customer_appointment/customer_appointment_post.py` 等 | `src/main/python/api/<业务>/<业务>_<方法>.py` | 按业务及 HTTP 方法拆文件，APIRouter 定义接口 |
  | `fileds/request/`、`fileds/response/` | `src/main/python/fileds/{request,response}/` | 请求/响应模型分开，沿用 fileds 原拼写；内部上下文另放 fileds/context.py |
  | `algorithms/*_module/` | `src/main/python/algorithms/*_module/` | 放账户、访问、投票、汇总等业务逻辑；本项目类名使用 Service |
  | `config/` | `src/main/python/config/` | server_config/database_config/logger_config 分别管理配置、会话工厂与日志 |
  | `constants/`、`utils/` | `src/main/python/{constants,utils}/` | 枚举/错误码与通用工具分开 |
  | 本项目新增 | `src/main/python/database/models/` | SQLAlchemy ORM；与请求/响应类型分开，迁移及运行数据仍在根目录 db/ |

  API 文件名中的 get/post/patch 表示 HTTP 方法，不改变本文既定 URL。例如 `api/poll/poll_post.py` 可承载创建、发布和关闭，`poll_get.py` 承载公开/本人列表及读取；`api/vote/vote_get.py` 承载记名参与记录，`api/result/result_get.py` 承载汇总。`routes.py` 显式登记各 router，业务文件不再重复加 `/api/v1`。

  HTTP 状态表达真实结果，JSON key 使用 snake_case；`fileds/request/request.py` 定义 RequestModel，`fileds/response/response.py` 定义 ResponseModel/Page 等公共模型。业务资源统一放在响应 data 中；聊天输出和 SSE 不属于本项目协议。配置值由本项目环境变量提供，参考项目的 LLM、业务素材和外部服务目录不属于当前实现范围。

* **运行与调用关系。**

  ```mermaid
  flowchart LR
    B[浏览器] --> F[React 前端]
    F -->|同源 /api/v1 JSON| P[开发代理或生产反向代理]
    P --> A[FastAPI Router]
    A --> D[身份与权限依赖]
    A --> S[algorithms 业务 Service]
    S --> O[database ORM 与事务]
    O --> DB[(PostgreSQL)]
    M[db/migrations Alembic] --> DB
  ```

  本地前端建议运行于 `localhost:5173`，后端于 `127.0.0.1:8000`，开发数据库仅绑定 `127.0.0.1:5432`。浏览器始终请求前端同源的 `/api/v1`，由 Vite 代理转发；生产以反向代理把静态站点与 `/api` 放在同一来源。

* **约定目录。** 以下是规划采用的结构；当前实现是否完全对应，本轮未检查。这里的目录调整只作为文档约定。

  ```text
  hkmu-2026-comp8500-group60-voting/
  ├── .env.example
  ├── frontend/
  │   ├── package.json
  │   ├── package-lock.json
  │   ├── index.html
  │   ├── tsconfig.json
  │   ├── vite.config.ts
  │   ├── eslint.config.js
  │   ├── playwright.config.ts
  │   ├── src/
  │   │   ├── main.tsx
  │   │   ├── app/{App.tsx,router.tsx,providers.tsx}
  │   │   ├── layouts/{AppLayout.tsx,AppLayout.css}
  │   │   ├── components/{PageState.tsx,StatusTag.tsx,ConfirmVoteModal.tsx}
  │   │   ├── lib/{http.ts,api-error.ts,api-types.ts,api-codes.ts,time.ts}
  │   │   ├── styles/{tokens.css,global.css}
  │   │   ├── features/
  │   │   │   ├── auth/{api.ts,types.ts,AuthProvider.tsx,RequireAuth.tsx}
  │   │   │   ├── polls/{api.ts,types.ts,PollCard.tsx,BallotForm.tsx}
  │   │   │   ├── creator/{api.ts,types.ts,PollForm.tsx,PollFilters.tsx,SharePanel.tsx}
  │   │   │   ├── poll-access/{api.ts,types.ts,GuestProvider.tsx,usePollAccess.ts}
  │   │   │   └── admin/{api.ts,types.ts}
  │   │   ├── pages/
  │   │   │   ├── LoginPage.tsx
  │   │   │   ├── RegisterPage.tsx
  │   │   │   ├── DashboardPage.tsx
  │   │   │   ├── PollListPage.tsx
  │   │   │   ├── PollDetailPage.tsx
  │   │   │   ├── PollResultPage.tsx
  │   │   │   ├── MyVotesPage.tsx
  │   │   │   ├── AdminPollsPage.tsx
  │   │   │   ├── MyPollsPage.tsx
  │   │   │   ├── PollWorkspacePage.tsx
  │   │   │   ├── PollEditPage.tsx
  │   │   │   ├── ShareEntryPage.tsx
  │   │   │   ├── PollAccessPage.tsx
  │   │   │   ├── AdminPollDetailPage.tsx
  │   │   │   ├── AdminAuditPage.tsx
  │   │   │   ├── ForbiddenPage.tsx
  │   │   │   └── NotFoundPage.tsx
  │   │   └── test/{setup.ts,fixtures.ts}
  │   └── tests/e2e/
  │       ├── auth.spec.ts
  │       ├── voting.spec.ts
  │       ├── creator.spec.ts
  │       ├── poll-access.spec.ts
  │       ├── anonymous-voting.spec.ts
  │       ├── admin.spec.ts
  │       └── responsive.spec.ts
  ├── backend/
  │   ├── pyproject.toml
  │   ├── uv.lock
  │   ├── .python-version
  │   ├── alembic.ini
  │   ├── src/
  │   │   ├── __init__.py
  │   │   └── main/
  │   │       ├── __init__.py
  │   │       └── python/
  │   │           ├── __init__.py
  │   │           ├── main.py
  │   │           ├── cli.py
  │   │           ├── api/
  │   │           │   ├── routes.py
  │   │           │   ├── dependencies.py
  │   │           │   ├── health/health_get.py
  │   │           │   ├── auth/{auth_post.py,auth_get.py}
  │   │           │   ├── guest/guest_post.py
  │   │           │   ├── poll/{poll_get.py,poll_post.py,poll_patch.py}
  │   │           │   ├── poll_access/poll_access_post.py
  │   │           │   ├── share/share_get.py
  │   │           │   ├── vote/{vote_post.py,vote_get.py}
  │   │           │   ├── result/result_get.py
  │   │           │   └── admin/admin_get.py
  │   │           ├── fileds/
  │   │           │   ├── context.py
  │   │           │   ├── request/{request.py,auth_request.py,poll_request.py,poll_access_request.py,vote_request.py}
  │   │           │   └── response/{response.py,auth_response.py,guest_response.py,poll_response.py,poll_access_response.py,vote_response.py,audit_response.py}
  │   │           ├── algorithms/
  │   │           │   ├── auth_module/auth_service.py
  │   │           │   ├── guest_module/guest_service.py
  │   │           │   ├── poll_module/poll_service.py
  │   │           │   ├── poll_access_module/poll_access_service.py
  │   │           │   ├── vote_module/vote_service.py
  │   │           │   ├── result_module/result_service.py
  │   │           │   └── audit_module/audit_service.py
  │   │           ├── config/{server_config.py,database_config.py,logger_config.py}
  │   │           ├── constants/{enums.py,error_codes.py}
  │   │           ├── utils/{security_util.py,clock_util.py,error_handlers.py,response_util.py,rate_limit_util.py}
  │   │           └── database/models/{__init__.py,base.py,user.py,session.py,guest.py,access_grant.py,poll.py,vote.py,audit.py}
  │   └── tests/
  │       ├── conftest.py
  │       ├── unit/{test_poll_status.py,test_schema_validation.py,test_common_schema.py}
  │       ├── integration/
  │       │   ├── test_migrations.py
  │       │   ├── test_constraints.py
  │       │   ├── test_auth.py
  │       │   ├── test_guest_context.py
  │       │   ├── test_poll_access.py
  │       │   ├── test_ownership.py
  │       │   ├── test_polls.py
  │       │   ├── test_votes.py
  │       │   ├── test_vote_concurrency.py
  │       │   ├── test_anonymous_privacy.py
  │       │   ├── test_results.py
  │       │   └── test_audit.py
  │       └── api/{test_health.py,test_permissions.py,test_response_contract.py}
  ├── db/
  │   ├── compose.yml
  │   ├── migrations/{env.py,script.py.mako,versions/}
  │   ├── seeds/README.md
  │   ├── backup/README.md
  │   ├── data/                    # 运行时生成，不提交
  │   └── backups/                 # 运行时生成，不提交
  ├── deploy/{nginx.conf,README.md}
  ├── docs/
  │   ├── coordination/{working-baseline.md,interface-snapshot.md,implementation-snapshot.md}
  │   ├── requirements/{srs.md,traceability.md}
  │   ├── design/
  │   ├── adr/
  │   ├── testing/{acceptance.md,results.md,defects.md}
  │   ├── evolution/change-impact.md
  │   ├── coursework/{delivery-checklist.md,presentation-outline.md}
  │   ├── references.md
  │   └── superpowers/plans/       # 本计划
  ├── .github/workflows/ci.yml
  ├── .gitignore
  ├── README.md
  └── references/                  # 用户参考，只读且不提交
  ```

  目录树中的 requirements/design/adr/testing/evolution/coursework 是后续团队资料的预期位置；编程侧维护的文档以上文 T12 为准，不承担这些正式工件的全部编写。

  花括号只是目录树的压缩记法。组件测试放在对应功能目录的 `__tests__/`；目录树没有逐一展开。原生 PostgreSQL 数据不适合提交 Git，`db/` 里的可复现迁移和初始化说明才是交付物。

* **Python 导入与运行约定。** 源码统一使用参考项目的 `from src.main.python... import ...` 绝对导入；所有 Python 包目录都添加 `__init__.py`，树中仅展开部分。API 文件只导出 router，由 `api/routes.py` 汇总，再由 `main.create_app()` 挂载；导入模块时不创建数据库连接或业务单例，不做外部请求。

  `backend/` 是统一执行目录。`pyproject.toml` 设置 `[tool.uv] package = false`，第一版按源码项目运行，`uv sync` 安装锁定依赖；不把源码另装成顶层 api/config 包。服务、种子、测试和迁移均使用下文的 `uv run python -m ...` 命令，让 backend 根目录进入模块搜索路径。CI 设置 `working-directory: backend`，不在各个文件中修改 sys.path。

  pytest 在 `pyproject.toml` 中使用 `--import-mode=importlib`；测试统一导入 `src.main.python` 下的工厂、业务类和 ORM，避免 tests/api 与业务 API 的短名称冲突。Alembic 从同一路径导入 Base.metadata；Settings 将 `.env` 定位到仓库根目录，数据库 URL/HMAC 密钥等仍从本地环境获得。

* **模块职责与依赖规则。**

  | 模块 | 负责 | 不负责 |
  | --- | --- | --- |
  | `api/` Router 与 dependencies | 请求解析、账户/访客上下文、CSRF 来源、所有权/门禁入口、HTTP 映射 | 在路由里拼写复杂投票 SQL |
  | `fileds/request` 与 `fileds/response` | Pydantic 输入输出类型、长度、必填、时区、未知字段拒绝 | 替代数据库唯一性与并发校验 |
  | `algorithms/*_module/` Service | 所有权、四种模式、密码授权、匿名去关联、事务、时钟 | 依赖 React 状态或把 ADMIN 当作全部写权限 |
  | `database/models/` 与根目录 `db/migrations/` | ORM 约束、关系、索引、版本迁移 | 决定页面是否展示按钮 |
  | 前端 feature API | 统一请求、类型、错误码映射 | 本地判定投票已经成功 |
  | 前端页面/组件 | 展示、用户交互、输入反馈、可访问性 | 成为权限或票数的可信来源 |

  第一版让 Service 直接使用 SQLAlchemy，暂不为每张表增加一层没有额外行为的 Repository。配置通过工厂注入，导入模块时不读取个人绝对路径、不启动外部服务。

### 数据库与事务设计

* **表与字段。** ID 建议用数据库生成的整数，回执使用另外的随机 UUID。所有业务时间使用带时区时间类型，外键列建立必要索引。

  | 表 | 主要字段 | 约束与用途 |
  | --- | --- | --- |
  | `users` | `id, username, display_name, password_hash, role, is_active, created_at` | `username` 唯一且已规范化；role 仅 `USER/ADMIN`；不存明文密码 |
  | `auth_sessions` | `id, user_id, token_hash, csrf_token, created_at, expires_at` | token 散列唯一；FK user；过期索引；`csrf_token` 是会话校验随机值，不是登录凭据 |
  | `guest_sessions` | `id, token_hash, csrf_token, created_at, expires_at` | 无 user_id；随机浏览器凭据散列唯一，默认有效 30 天；与账户会话独立 |
  | `poll_access_grants` | `id, poll_id, guest_session_id, expires_at` | FK poll/guest；`UNIQUE(poll_id,guest_session_id)`；只授权本浏览器访问本场 |
  | `polls` | `id, title, description, identity_mode, visibility, private_password_hash, share_code, lifecycle, starts_at, ends_at, creator_id, version, closed_at, created_at, updated_at` | 时间 CHECK；share_code 唯一；`UNIQUE(id,identity_mode)`；PRIVATE 必须有密码散列，PUBLIC 必须为空 |
  | `poll_options` | `id, poll_id, label, position` | FK poll；`UNIQUE(poll_id,id)`、`UNIQUE(poll_id,position)`、`UNIQUE(poll_id,label)` |
  | `votes` | `id, receipt_id, poll_id, identity_mode, voter_id, anonymous_voter_hash, option_id, submitted_at` | 回执 UUID 唯一；模式 CHECK、两类条件唯一索引及两组组合 FK；匿名 voter_id 必须为空 |
  | `audit_events` | `id, actor_id, action, poll_id, receipt_id, created_at, request_id` | 管理操作与记名投票审计；匿名逐票不写事件，避免通过回执/请求标识反查身份 |

  保留 `(poll_id, option_id) → poll_options(poll_id, id)`，新增 `(poll_id, identity_mode) → polls(id, identity_mode)`，防止跨场选项与票种不匹配。命名约束 `fk_votes_poll_option`、`fk_votes_poll_mode`；对既有票据使用限制删除策略，不级联删除历史票。

  `ck_votes_identity` 强制二选一：NAMED 时 `voter_id IS NOT NULL AND anonymous_voter_hash IS NULL`；ANONYMOUS 时 `voter_id IS NULL AND anonymous_voter_hash IS NOT NULL`。两个命名条件唯一索引分别为 `uq_votes_named_poll_voter`（NAMED 的 poll_id/voter_id）、`uq_votes_anon_poll_browser`（ANONYMOUS 的 poll_id/anonymous_voter_hash）。匿名票不存 guest_session_id、账户 ID、IP 或 User-Agent。

  `anonymous_voter_hash` 由服务端稳定密钥对“版本域、poll_id、原始 guest token”做 HMAC-SHA256，按场次隔离，不能跨投票直接比较浏览器散列。`ANON_VOTER_HMAC_KEY` 从本地环境提供并持久保存，第一版不轮换，已结束场次的回执恢复同样依赖该密钥。未来轮换需记录密钥版本并保留旧密钥，不能仅保证开放期稳定。原 guest token 只在 HttpOnly Cookie；数据库存其散列。该设计不存账号与匿名选择映射，但不承诺密码学不可追踪，时间、少人数汇总或运维访问仍可能产生推断。

* **ER 关系。**

  ```mermaid
  erDiagram
    USERS ||--o{ AUTH_SESSIONS : has
    USERS ||--o{ POLLS : creates
    USERS o|--o{ VOTES : named_only
    GUEST_SESSIONS ||--o{ POLL_ACCESS_GRANTS : holds
    POLLS ||--o{ POLL_ACCESS_GRANTS : protects
    POLLS ||--|{ POLL_OPTIONS : contains
    POLLS ||--o{ VOTES : receives
    POLL_OPTIONS ||--o{ VOTES : selected_by
    USERS o|--o{ AUDIT_EVENTS : acts
    POLLS o|--o{ AUDIT_EVENTS : concerns
  ```

  图表达领域关系；数据库层的组合外键、唯一约束和字段限制仍以上表为准。

* **单次投票必须在一个数据库事务中完成。**

  1. 先由 Origin、JSON 与访客 CSRF 校验建立 `PollAccessContext`。NAMED 额外解析有效账户会话；ANONYMOUS 即使浏览器已登录，也不把该账户传入匿名票持久化逻辑。请求体为 `RequestModel[VoteRequest]`，仅 data 内包含 option_id，路由解包后传给 Service。
  2. Service 创建自己的 SQLAlchemy Session 与事务，先对 poll 使用 `SELECT ... FOR UPDATE`；涉及账户时再读取并校验用户。既有 poll 的写操作统一“poll→必要的用户行”顺序，新建 poll 只校验创建者，避免反向加锁。
  3. 从锁定的 poll 读取真实 identity_mode，不信任客户端票种；NAMED 需要有效登录账号，ANONYMOUS 需要有效 guest token。PRIVATE 还必须在同一事务确认该 guest 的访问授权未过期，管理员/创建者参与投票也不跳过这道门禁。
  4. **取得锁后**读取服务端 UTC 当前时间，检查有效状态为 `OPEN`，再确认选项属于该 poll。
  5. NAMED 插入含 voter_id 的票与记名审计；ANONYMOUS 插入仅含本场浏览器散列的票，不写逐票审计。执行 `flush` 检查模式、唯一性与外键。
  6. 提交事务成功后，才向路由返回 `VoteReceipt`。提交前的确定失败需回滚，不能留下票或成功审计；如果已发送 COMMIT 但确认丢失，则可能已经持久化，必须进入结果未知分支，不能宣称回滚就证明未投。
  7. 仅将上述两个命名唯一索引的冲突映射为 `409 ALREADY_VOTED`。其他完整性错误按真实类别处理，不能全部包装成“重复投票”。

  身份/访客依赖使用短生命周期只读 Session，返回不携带 ORM 连接的上下文；写 Service 使用自己的 SessionFactory。不要在已被依赖查询自动开启事务的同一 Session 上再次调用 `begin()`，也不要等响应发送后才提交事务。

  ```mermaid
  sequenceDiagram
    actor U as 登录用户或匿名访客
    participant F as React
    participant A as FastAPI
    participant S as VoteService
    participant D as PostgreSQL
    U->>F: 选择选项并确认
    F->>A: POST /polls/id/votes
    A->>A: 校验访客上下文、Origin与CSRF
    A->>S: cast_vote(access_context,poll_id,option_id)
    S->>D: 开始事务并锁定poll
    S->>S: 按票种检查账户、密码授权、时间与选项
    S->>D: INSERT对应模式vote，按规则审计并提交
    D-->>S: COMMIT成功
    S-->>A: VoteReceipt
    A-->>F: 201回执
    F-->>U: 显示成功与本人已参与
  ```

* **关键边界和数据库一致性。**

  | 场景 | 预期行为 |
  | --- | --- |
  | 两个请求同时为同账号同场投票 | 最多一个 201；其余 409；最终只有一条 vote |
  | 两请求持同一有效匿名浏览器凭据 | 同场最多一票；两个独立浏览器仍可各投，属于已声明限制 |
  | 创建者先取得锁并关闭 | 等待的投票取得锁后看到关闭状态，不入库 |
  | 用户/访客先取得锁且仍在有效时间 | 该票可提交；创建者随后关闭；以后请求全部拒绝 |
  | USER 或非创建者 ADMIN 试图写他人投票 | 拒绝，不因知道 ID、分享码或密码而获得管理权 |
  | PRIVATE 授权失效、授权属于另一浏览器/投票 | 详情、投票、恢复与普通结果均要求重新解锁；不能复用 grant |
  | 登录用户投匿名票 | voter_id 为空，账号历史/日志/审计没有可关联该匿名票的记录 |
  | 请求在截止前到达但截止后才取得锁 | 拒绝；以取得锁后校验时刻为准，不以客户端点击时间为准 |
  | 选项来自另一场 | API 拒绝；即使绕过 Service，组合外键也拒绝插入 |
  | 提交前确定失败 | 回滚，无部分写入；按错误类型返回失败或临时不可用 |
  | COMMIT 阶段断连、提交确认丢失 | 返回 503 `SUBMISSION_STATUS_UNKNOWN`，可能已提交；前端查本人状态，不把 rollback 当作未投证明 |
  | 服务已提交但浏览器没收到响应 | 前端显示“提交结果待确认”，查询本人参与状态；不自动重发投票 POST |
  | 草稿编辑发生版本竞争 | 使用 `expected_version` 与行锁；过期编辑返回 409 `STALE_POLL_VERSION` |
  | 已结束但数据库仍是 PUBLISHED | 仍通过有效状态返回 CLOSED，不能投票且结果可见 |

  创建者关闭接口只修改生命周期，不改票数。结果服务在**同一 READ COMMITTED 事务中**先对 poll 获取 `FOR SHARE`，取得锁后才读 Clock 并检查权限：创建者/ADMIN 可读进行中汇总，其他有访问权限者要求 CLOSED。聚合等待先前持有写锁的有效投票完成；截止后的首轮最终结果不能漏计在途票。进行中汇总标注为即时快照，不称最终结果。结果查询之间可以共享锁，状态检查和统计不拆到不同连接。

  统计通过 `votes GROUP BY option_id` 读取，不维护第二份可失配的计数器。第一版不做有效选民数快照，因此不展示可能因注册数量变化而失真的“投票率”。

* **迁移、初始化与存储。**

  `backend/src/main/python/database/models/` 是 ORM 声明；`db/migrations/versions/` 是数据库变更历史。`backend/alembic.ini` 设置 `script_location = %(here)s/../db/migrations`、`prepend_sys_path = %(here)s`；`db/migrations/env.py` 从 `src.main.python.database.models` 导入汇总了八表的 Base，并设置 `target_metadata = Base.metadata`。迁移复用 `src.main.python.config.server_config` 的数据库配置，不依赖个人绝对路径。每次模型变化生成并人工核对迁移，禁止只在启动时 `create_all()` 代替迁移。

  `db/compose.yml` 定义开发 PostgreSQL 和 `test` profile 下的独立测试 PostgreSQL。开发数据绑定到 `db/data/`；测试库使用容器临时存储、端口建议 5433，不挂载开发数据。测试专用 URL 与开发 URL 必须不同。

  初始化命令计划放在 `backend/src/main/python/cli.py`。`uv run python -m src.main.python.cli seed-demo` 只幂等创建演示账户，不创建或修改投票；密码来自本地环境/交互输入，不从参考项目复制。重跑不得重置已有密码；遇到同名账户但角色不符时明确报错，不静默提权。测试使用 fixture 自建账号、密码与场次。

  `uv run python -m src.main.python.cli new-demo-round` 是显式创建新场次的命令，每次用普通演示用户创建带新批次标识、覆盖四种模式组合与不同生命周期的样例。私密样例密码来自本地环境/交互输入，不输出或写进链接。它在 T06 实现，使用 PollService 创建/发布/关闭，不修改历史场次或已有票，也不承诺幂等；已关闭样例可为零票。

  备份使用 `pg_dump`，恢复使用 `pg_restore`，在独立数据库验证恢复后才能说明备份可用。恢复匿名状态还需要妥善保管的原 HMAC 密钥，数据库备份不能替代密钥保存。`db/backups/` 与 `db/data/` 均加入忽略规则，不提交真实数据、备份或密钥。

### 通用请求与响应 Schema

* **设计依据与精简范围。** 参考 `R_llm-sale` 的 ChatPostRequest 承载业务入参、ResponseModel 使用 code/msg/data 的思路。本项目采用下面的固定外层和每个接口自己的强类型 data；这些是计划契约，当前代码是否一致本轮未核对。

  | 参考字段/结构 | 本项目处理 | 原因 |
  | --- | --- | --- |
  | `extra_input_params` | 改为必填 `data: T` | 由具体路由指定业务类型，不使用所有业务模型混合的 Union 或任意 dict |
  | `session_id`、`user_id`、`token` | 从通用请求删除 | 身份由账户/访客 Cookie 和后端上下文确定；CSRF 走请求头 |
  | `trace_id`、`ts` | 不由客户端填写；响应给服务端生成的 request_id | 避免增加必填项；投票时间以服务端时钟为准 |
  | `user_text`、`history`、`application_setting`、模型采样参数 | 删除 | 投票不是聊天或模型生成请求 |
  | `user_action`、`action_scenario`、`source`、`module_name` 等 | 删除 | 由 HTTP 方法与具体路由表达操作，无需重复描述 |
  | `code`、`msg`、`data` | 保留为统一响应核心字段 | 保持熟悉的调用方式；成功 code=0，失败用固定数值业务码 |
  | `robot_text`、`choices`、`status`、token 用量、流式标记 | 删除 | 投票直接返回业务资源，不需要聊天/SSE 结构 |

  删除的仅是通用输入元数据；PollCreate 中必要的业务字段、URL 中的 poll_id、投票 data.option_id，以及后端内部 Principal 不受影响。响应中的公开 creator_id 也仍由具体资源模型决定。

* **通用输入：一个外层字段。** `RequestModel[T]` 放在 `backend/src/main/python/fileds/request/request.py`。所有有 JSON body 的 POST/PATCH 都传 `{"data": {...}}`；data 必填且必须符合具体模型，不能省略、传 null 或接收未声明的字段。

  ```python
  from typing import Generic, TypeVar

  from pydantic import BaseModel, ConfigDict, Field


  class BaseRequestData(BaseModel):
      """业务入参基类，拒绝未声明字段。"""

      model_config = ConfigDict(extra="forbid")


  TRequest = TypeVar("TRequest", bound=BaseRequestData)


  class RequestModel(BaseModel, Generic[TRequest]):
      """统一 JSON 请求外层，data 由具体接口确定类型。"""

      model_config = ConfigDict(extra="forbid")
      data: TRequest = Field(..., description="当前接口的业务参数")


  class EmptyRequestData(BaseRequestData):
      """没有业务参数时使用的空对象，只接受 {}。"""


  class PageQuery(BaseRequestData):
      """列表接口共享的查询参数，通过 URL query 传递。"""

      page: int = Field(1, ge=1, description="从 1 开始的页码")
      page_size: int = Field(12, ge=1, le=50, description="每页记录数量")
  ```

  RegisterRequest/LoginRequest、PollCreate/PollUpdate/VersionRequest、UnlockRequest、VoteRequest 继承 BaseRequestData，分别留在各业务 request 文件。嵌套输入如选项对象也继承该基类，保证 data 内层未知字段同样被拒；密码不被通用基类裁剪或转换。新增业务只增加对应 data 模型，公共 RequestModel 无需追加字段。

  GET 继续使用路径/查询参数，不发送 JSON body、不把查询字符串包在 data 中。公共 PageQuery 可由 PollListQuery 等模型继承添加 status/q；FastAPI 按查询参数绑定并校验。`POST /guest/context` 和 `/auth/logout` 明确发送 `{"data": {}}`；这样前端写请求只有一条封装路径，也符合 Origin/JSON 校验。Cookie 不放 body，CSRF 通过 `X-CSRF-Token` 按 auth/guest/none 规则选择。

* **通用输出：四个固定顶层字段。** `ResponseModel[T]` 放在 `backend/src/main/python/fileds/response/response.py`。code/msg/data 沿用参考的命名，request_id 用于本次请求定位，业务时间仍由各资源的 server_time/submitted_at 等字段表达。

  | 字段 | JSON 类型 | 约定 |
  | --- | --- | --- |
  | `code` | integer | 0 表示成功；非 0 为 ApiCode 中的固定业务码，不是 HTTP 状态的替代品 |
  | `msg` | string | 可展示的简短提示；前端不通过比较文案判断业务分支 |
  | `data` | object / null | 成功为对应资源或 Page；无返回数据时显式 null；校验错误为 issues 对象，其他错误为 null |
  | `request_id` | string（UUID） | 服务端在处理请求之初生成，每次请求独立；客户端不提交该字段 |

  以下代码是计划中的公共模型定义。ApiCode 的数值和含义以“HTTP 与业务错误”表为准，在 `constants/error_codes.py` 使用 IntEnum 实现；JSON 序列化为整数。

  ```python
  from typing import Generic, TypeVar
  from uuid import UUID

  from pydantic import BaseModel, ConfigDict, Field

  from src.main.python.constants.error_codes import ApiCode


  TResponse = TypeVar("TResponse")


  class ResponseModel(BaseModel, Generic[TResponse]):
      """统一响应外层；具体路由显式指定 data 类型。"""

      model_config = ConfigDict(extra="forbid")
      code: ApiCode = Field(..., description="业务码，0 表示成功")
      msg: str = Field(..., description="面向使用者的简短提示")
      data: TResponse = Field(..., description="资源、分页、错误字段或 null")
      request_id: UUID = Field(..., description="服务端生成的本次请求标识")


  class Page(BaseModel, Generic[TResponse]):
      """统一分页数据，作为 ResponseModel.data 使用。"""

      model_config = ConfigDict(extra="forbid")
      items: list[TResponse] = Field(..., description="当前页记录")
      page: int = Field(..., ge=1, description="当前页码")
      page_size: int = Field(..., ge=1, le=50, description="每页记录数量")
      total: int = Field(..., ge=0, description="当前有权读取的记录总数")


  class ValidationIssue(BaseModel):
      """一个经过脱敏的字段校验问题。"""

      model_config = ConfigDict(extra="forbid")
      field: str = Field(..., description="出错字段名，如 option_id")
      loc: list[str] = Field(..., description="从请求体、路径或查询根开始的位置")
      msg: str = Field(..., description="不包含原始输入值的提示")


  class ValidationErrorData(BaseModel):
      """仅在参数校验失败时返回的字段提示。"""

      model_config = ConfigDict(extra="forbid")
      issues: list[ValidationIssue] = Field(..., description="字段校验问题列表")
  ```

  成功路由声明 `ResponseModel[UserPublic]`、`ResponseModel[VoteReceipt]`、`ResponseModel[Page[PollSummary]]` 等具体类型；注销用 `ResponseModel[None]`。参数校验失败使用 `ResponseModel[ValidationErrorData]`，其他失败使用 `ResponseModel[None]`。成功 data 不允许被任意 dict 或错误对象替代；这些失败模型在 FastAPI 的 responses/OpenAPI 中单独声明，不能沿用默认 HTTPValidationError 结构。存在 INVALID_OPTION 的接口，其 HTTP 422 文档声明两种失败模型的联合，覆盖 42201 的字段错误对象及 42202 的 null。

* **前后端实际传输示例。** 以下 ID 和日期仅为协议示例。URL 为 `POST /api/v1/polls/12/votes`，投票请求不包含账户身份。

  ```json
  {"data": {"option_id": 35}}
  ```

  成功使用 HTTP 201；Service 提交成功后，路由把 VoteReceipt 包装一次。

  ```json
  {
    "code": 0,
    "msg": "投票成功",
    "data": {
      "receipt_id": "768c3303-f87a-491c-b06f-c0345cba4986",
      "poll_id": 12,
      "submitted_at": "2026-10-25T02:30:00Z"
    },
    "request_id": "717f3788-7b4b-4f53-a9fd-69f548c039de"
  }
  ```

  重复投票使用 HTTP 409；code=40901 对应 ALREADY_VOTED。

  ```json
  {
    "code": 40901,
    "msg": "你已参与本次投票",
    "data": null,
    "request_id": "541a0974-9e59-48a6-802f-3c53b54010fc"
  }
  ```

  参数错误使用 HTTP 422；只返回安全字段位置和提示，不回显输入值。路径/查询参数分别使用 path.poll_id、query.page_size；JSON 解析失败使用 body。

  ```json
  {
    "code": 42201,
    "msg": "请求参数不正确",
    "data": {"issues": [{"field": "option_id", "loc": ["body", "data", "option_id"], "msg": "选项编号必须是正整数"}]},
    "request_id": "08e46c79-3ff2-495e-8d37-04ca30f43851"
  }
  ```

  列表成功仍是四字段外层，data 为 `{"items": [], "page": 1, "page_size": 12, "total": 0}`；没有记录时使用空数组。注销成功为 HTTP 200、code=0、data=null，重复注销相同。health/live 和 health/ready 也使用 ResponseModel，健康时 data 分别为 `{"status": "live"}` 与 `{"status": "ready"}`；数据库不可用保持 503。

* **统一封装的位置与异常边界。** Router 接收 RequestModel 后只把 `.data` 交给 Service，Service 返回业务资源；Router 通过 `utils/response_util.py` 构建 ResponseModel。业务异常、RequestValidationError、HTTPException、路由 404/405 和未预期异常统一在 `utils/error_handlers.py` 转换。普通 JSON 路由显式声明 response_model，避免对已封装响应重复套壳。

  构建函数根据 ApiCode 固定对应 HTTP 状态；异常处理返回 JSONResponse 时使用 `model_dump(mode="json")` 并显式传 status_code，正确序列化 UUID、时间和枚举，不能意外变成 HTTP 200。

  每次请求在解析 body 之前生成 request_id，校验失败也有标识；入参不接受 trace_id/request_id 或重用客户端标识。此标识不是 session_id、receipt_id 或防重复键，也不作为未知提交后的查询凭据。匿名链路的日志、审计、错误追踪与前端遥测不得记录 request_id 和账户/回执的映射；只在当前响应中返回它不会赋予身份关联能力。

  HTTP 200/201 搭配 code=0；HTTP 4xx/5xx 搭配对应非零业务码。创建与投票保持 201；本项目 JSON API 的注销使用 200，不采用无 body 的 204。Cookie 设置/清除、Retry-After、Cache-Control 等响应头要与包装后的响应一起保留。OpenAPI/docs、静态文件、CORS OPTIONS 和 HEAD 不强行包装 JSON；代理断连或网关 HTML 错误由前端网络/协议错误分支处理。

* **前端只在公共客户端处理外层。** `frontend/src/lib/api-types.ts` 定义 RequestModel/ResponseModel/Page/ValidationErrorData 类型，`api-codes.ts` 与后端共享同一数值映射；`http.ts` 负责包装/解包，`api-error.ts` 定义 ApiClientError。

  ```typescript
  export type RequestModel<T> = { data: T };
  export type ResponseModel<T> = {
    code: number;
    msg: string;
    data: T;
    request_id: string;
  };
  ```

  1. feature API 只传业务对象给 `apiPost<TRequest,TResponse>` / `apiPatch<TRequest,TResponse>`；http.ts 添加一层 data，设置 JSON、Cookie 与正确 CSRF。空请求传 `{}`，最终 body 为 `{"data": {}}`。`apiGet<TResponse>` 只传 URL 和 query。
  2. HTTP 成功且 code=0 才返回外层 `.data`，组件拿到 VoteReceipt/Page 等原业务类型。Axios 的 response.data 是整个响应体，公共客户端再取其中 data；页面不再重复解包。
  3. HTTP 失败或 code 非零时抛 ApiClientError，含 http_status/code/msg/request_id 和安全字段错误；两种失败通道都处理。按 ApiCode 常量判断重复、未登录、密码授权或提交未知，不比较 msg。无法解析的响应、状态/业务码矛盾、断网和超时走独立网络/协议异常；不能当作业务成功。
  4. POST/PATCH 不自动重试；投票超时、响应无法确认或 `SUBMISSION_STATUS_UNKNOWN`（50302）仍用原账户/浏览器上下文查询本人状态。request_id 不可用作自动重投或身份恢复依据。
  5. 访客访问公开列表/详情时，`/auth/me` 的未登录状态不能触发全站登录跳转；只有需要账户的提交或管理动作才引导登录。页面保留原投票入口，匿名请求不附加账户字段。

* **本轮新增细化的待核对项。** 以下为计划增量，不覆盖原任务的勾选记录；本轮不运行应用测试。

  - [ ] 核对统一模型、数值码、API/OpenAPI 与前端类型均符合本节，特别是空请求、注销、201、422 和两个 503 分支。
  - [ ] 核对外层/嵌套 data 未知字段拒绝、校验错误脱敏、Cookie/响应头保留、公开 API 无账号元数据注入。
  - [ ] 验证访客可浏览 PUBLIC + NAMED/ANONYMOUS 列表与题目选项；NAMED 的投票 POST 仍拒绝未登录，ANONYMOUS 建立访客凭据后可提交。
  - [ ] 验证公开详情没有参与上下文时不泄露个人回执，不误报“确定未投”；私密、本人/管理员入口与结果规则仍按各自权限校验。

### 认证、安全与错误约定

* **会话方案。**

  采用数据库会话，登录时生成高熵随机 token，数据库仅保存其 SHA-256 散列；原 token 通过 `HttpOnly` cookie 交给浏览器。密码使用 `pwdlib[argon2]`。建议会话固定有效 8 小时，暂不实现自动续期。

  开发 cookie 为 `voting_session; HttpOnly; SameSite=Lax; Path=/`；HTTPS 部署时开启 `Secure`。所有写操作检查允许的 Origin 并要求 JSON。HTTP 客户端按下面的精确矩阵选择 `csrfSource: auth | guest | none`，不能混用账户与访客 token。

  | 请求 | CSRF 来源 | 额外身份条件 |
  | --- | --- | --- |
  | 注册、登录、POST /guest/context | none，作为初始化例外只检查 Origin+JSON | 不要求已有账户/访客 CSRF |
  | 创建、编辑、发布、关闭自己的投票 | auth | 有效登录，写入既有 poll 必须是创建者 |
  | PRIVATE 解锁、NAMED/ANONYMOUS 投票 | guest | 有效访客 Cookie；NAMED 额外要求有效账户 Cookie |
  | 有效账户会话注销 | auth | 删除对应账户会话，保留访客 Cookie |
  | 无效/已失效会话的重复注销 | none，仍检查 Origin+JSON | 200、code=0、data=null 并清理账户 Cookie，不能因缺旧 CSRF 无法退出 |
  | GET 读取 | 不要求 CSRF | 仍执行账户、所有权、密码授权与结果时机校验 |

  刷新页面时 AuthProvider 调用 `/auth/me` 并等待结果，再决定是否渲染受保护页面。注销删除服务端 session 并清除 cookie；过期、停用账号和无会话均不能继续通过鉴权。角色不以 localStorage 或用户请求字段为准。

  开发和生产均优先同源代理；若确需跨域，使用精确白名单，不能照抄参考项目的宽泛 CORS。生产部署说明必须覆盖 HTTPS、cookie 和反向代理的实际设置。

* **访客、私密密码与分享。**

  1. 参与页调用 `POST /guest/context` 建立或恢复 `voting_guest` 高熵 Cookie，设置 HttpOnly、SameSite=Lax、Path=/，HTTPS 时开启 Secure；服务端保存 token 散列与访客 CSRF，默认有效 30 天，不含 user_id。首次初始化仅要求 Origin+JSON，已有 Cookie 时复用上下文，不因刷新、登录或注销而更换匿名防重复标识。
  2. **浏览器已成功保存凭据并取得 CSRF 后**才允许投票，避免“投票已提交、首次 Cookie 响应却丢失”后无法恢复。凭据过期时说明此前匿名历史不可恢复，不伪装为永久设备识别。
  3. 分享页 `/s/{share_code}` 通过后端 `GET /shares/{share_code}` 解析。share_code 建议使用至少 128 bit 随机熵的 URL-safe 定位码，数据库唯一；`lifecycle IN (PUBLISHED,CLOSED)` 可解析，DRAFT 不可。提前关闭后旧链接继续有效，以便参与者查看最终结果。定位码不能跳过私密密码或记名提交登录；公开记名详情仍允许访客浏览。
  4. PRIVATE 解锁调用 `POST /polls/{id}/unlock`，JSON 为 `{"data": {"share_code": "本场定位码", "password": "访问密码"}}`，需要访客 Cookie/CSRF/Origin。验证 Argon2 后按 poll_id/guest_session_id UPSERT 授权，到期为 `min(now+1小时,guest.expires_at)`；重复解锁更新到期时间，不能因既有唯一键失败。详情、投票、恢复、结果每次重新校验授权；其他场次或其他浏览器不能复用。
  5. 未授权私密入口仅返回 `poll_id,identity_mode,visibility,password_required,login_required`；不返回标题、选项、创建者或票数。直接猜测私密 ID 的未授权详情返回 404；正确分享入口提示密码/登录。创建者与管理员的只读工作区另走身份/权限检查，不能让密码授予管理权。
  6. 密码只经 POST body 发送，不进路径、query、fragment、localStorage 或分享文案；所有密码/会话/门禁响应使用 `Cache-Control: no-store`。私密入口使用 `Referrer-Policy: no-referrer`，日志屏蔽分享码与敏感请求体。
  7. 解锁失败使用统一提示与 429 限速，建议每来源/场次 5 次失败后限制 5 分钟；开发版可用线程安全的短期内存计数，不持久记录 IP 与投票的对应关系，不宣称多进程共享限速已实现。

* **匿名隐私与审计边界。**

  `/me/votes` 仅返回 NAMED 记录；其中 PRIVATE 的标题/回执也要求有效本场 grant，或者当前身份本就具有创建者/ADMIN 读取权。没有访问权的私密记录从列表和 total 一并排除，可从原分享链接重新解锁后显示，不让账户历史绕过密码。匿名本人状态只由本场浏览器凭据恢复，不加入账户历史。

  匿名提交、恢复、解锁路径不记录账号、IP、User-Agent、Cookie、请求体、匿名散列或回执与请求标识的映射；不要因为浏览器同时有账户 Cookie 就给匿名事件加上 user_id。

  匿名逐票不写 audit_events；仅把 actor_id 清空仍然不够，因为 receipt_id/request_id 可以与其他日志连接。管理审计仍可记录创建者、动作、poll_id 和 request_id；记名票可写实名审计但不公开个人选项。匿名路径的运行观测只保留不可关联身份的路由模板、状态与耗时，不记录完整分享 URL、SQL 参数或可反查账号的 request_id。

* **HTTP 与业务错误。** 顶层统一为 `code/msg/data/request_id`；下面是后端 ApiCode 与前端 ApiCode 共同采用的数值表。文中 ALREADY_VOTED 等名称指枚举成员，实际 JSON code 是整数。每次失败保持对应 HTTP 状态；列表的 items/page/page_size/total 均位于 data 内。

  | HTTP | 数值 code | ApiCode 名称 | 用途 |
  | --- | --- | --- | --- |
  | 200 / 201 | 0 | `SUCCESS` | 读取/更新/注销成功为 200，创建/注册/投票成功为 201 |
  | 400 | 40000 | `BAD_REQUEST` | 其他格式错误的请求，提示不包含原始敏感输入 |
  | 401 | 40101 | `UNAUTHENTICATED` | 当前动作需要登录且会话无效 |
  | 401 | 40102 | `INVALID_CREDENTIALS` | 登录失败，不透露用户名是否存在 |
  | 403 | 40301 | `FORBIDDEN` | 无角色或所有权权限 |
  | 403 | 40302 | `CSRF_FAILED` | 写请求 Origin/CSRF 校验失败 |
  | 403 | 40303 | `RESULTS_NOT_AVAILABLE` | 当前身份尚不可查看汇总 |
  | 403 | 40304 | `POLL_PASSWORD_INVALID` | 分享入口密码错误 |
  | 403 | 40305 | `POLL_ACCESS_REQUIRED` | 本场访问授权未建立或已过期 |
  | 404 | 40400 | `NOT_FOUND` | API 路由不存在 |
  | 404 | 40401 | `POLL_NOT_FOUND` | 投票不存在或当前身份不可见 |
  | 405 | 40500 | `METHOD_NOT_ALLOWED` | 路由不支持当前 HTTP 方法，保留 Allow 头 |
  | 409 | 40901 | `ALREADY_VOTED` | 相应账号或浏览器凭据已投过本场 |
  | 409 | 40902 | `POLL_NOT_OPEN` | 不在开放状态，需刷新服务端状态 |
  | 409 | 40903 | `POLL_IMMUTABLE` | 已发布投票的配置被冻结 |
  | 409 | 40904 | `STALE_POLL_VERSION` | 草稿/管理请求版本过期 |
  | 409 | 40905 | `USERNAME_TAKEN` | 注册用户名已占用 |
  | 415 | 41500 | `UNSUPPORTED_MEDIA_TYPE` | JSON 写接口的 Content-Type 不正确 |
  | 422 | 42201 | `VALIDATION_ERROR` | 输入校验或 JSON 解析失败，data 为 ValidationErrorData |
  | 422 | 42202 | `INVALID_OPTION` | 选项不属于本场，data=null |
  | 429 | 42901 | `TOO_MANY_ATTEMPTS` | 密码尝试过多，保留 Retry-After |
  | 500 | 50000 | `INTERNAL_ERROR` | 未预期故障，不暴露异常堆栈 |
  | 503 | 50301 | `SERVICE_UNAVAILABLE` | 已识别的临时数据库不可用 |
  | 503 | 50302 | `SUBMISSION_STATUS_UNKNOWN` | COMMIT 确认未知，不能宣称确定未投 |

  除 42201 外，失败 data 固定为 null；42201 的 data.issues 只含安全 field/loc/msg。不能直接把 Pydantic `exc.errors()` 的 input/ctx、原始异常消息、密码或完整请求体返回给前端；未知字段名称同样须限制为安全提示。SQLAlchemy 开启 `hide_parameters=True`，异常日志避免 SQL 参数、认证对象和完整验证输入。统一使用 Python logging；公开函数/类方法使用中文 Google 风格 docstring 和类型注解。普通管理请求可记录去敏 request_id 与异常，匿名链路的日志/审计继续遵守上面的去关联限制。

### 接口契约与前端页面

* **目标 API 契约。** 下表路径统一加 `/api/v1`。写请求为 `RequestModel[输入类型]`，成功响应为 `ResponseModel[输出类型]`；表内模型是 data 的类型。GET 查询单独绑定，无 JSON body。当前代码的实际符合情况本轮未检查，后续以真实响应/OpenAPI 对照。

  | 方法与路径 | 身份/访问条件 | 输入 data 或 GET query | 成功 HTTP / 响应 data |
  | --- | --- | --- | --- |
  | `GET /health/live` | 无 | 无 | 200 / HealthStatus；进程存活 |
  | `GET /health/ready` | 无 | 无 | 200 / HealthStatus；数据库不可用时 50301 |
  | `POST /auth/register` | 访客 | RegisterRequest：username/display_name/password | 201 / UserPublic；角色固定 USER |
  | `POST /auth/login` | 访客 | LoginRequest：username/password | 200 / SessionPublic；账户 token 仅 Set-Cookie |
  | `GET /auth/me` | 已登录 | 无 | 200 / SessionPublic；无会话则 40101 |
  | `POST /auth/logout` | 有效/已失效会话 | EmptyRequestData：`{}` | 200 / null；清账户 Cookie，重复注销相同 |
  | `POST /guest/context` | 访客/已登录 | EmptyRequestData：`{}` | 200 / GuestPublic；设置/复用访客 Cookie |
  | `GET /shares/{share_code}` | 任意 | 无 | 200 / ShareEntry；仅 PUBLISHED/CLOSED，草稿拒绝 |
  | `GET /polls` | 允许访客 | query：page/page_size/status?/q? | 200 / Page[PollSummary]；仅非草稿 PUBLIC |
  | `GET /polls/{poll_id}` | PUBLIC 允许访客；PRIVATE 按门禁 | 无 | 200 / PollDetail；公开记名浏览不要求登录 |
  | `POST /polls/{poll_id}/unlock` | 访客凭据 + guest CSRF | UnlockRequest：share_code/password | 200 / AccessGrantPublic；仅短期授权 |
  | `POST /polls/{poll_id}/votes` | guest CSRF；NAMED 另需登录，PRIVATE 另需授权 | VoteRequest：option_id | 201 / VoteReceipt；提交事务后响应 |
  | `GET /polls/{poll_id}/results` | 创建者/ADMIN 或符合 BR-05 的读取者 | 无 | 200 / PollResults；普通读取者仅 CLOSED |
  | `POST /polls` | USER/ADMIN | PollCreate | 201 / ManagePollDetail；creator_id 从会话取 |
  | `GET /me/polls` | USER/ADMIN | query：page/page_size/status?/q? | 200 / Page[ManagePollSummary]；仅本人创建 |
  | `GET /me/polls/{poll_id}` | 创建者 | 无 | 200 / ManagePollDetail；不含密码散列 |
  | `PATCH /polls/{poll_id}` | 创建者 | PollUpdate：完整草稿字段 + expected_version | 200 / ManagePollDetail；已发布不可编辑 |
  | `POST /polls/{poll_id}/publish` | 创建者 | VersionRequest：expected_version | 200 / ManagePollDetail |
  | `POST /polls/{poll_id}/close` | 创建者 | VersionRequest：expected_version | 200 / ManagePollDetail |
  | `GET /me/polls/{poll_id}/share` | 创建者 | 无 | 200 / ShareInfo；PUBLISHED/CLOSED 可分享，链接不含密码 |
  | `GET /me/votes` | USER/ADMIN | query：page/page_size | 200 / Page[MyVote]；仅本人 NAMED 且具有本场读取权 |
  | `GET /admin/polls` | ADMIN | query：page/page_size/status?/q? | 200 / Page[ManagePollSummary]；全局只读 |
  | `GET /admin/polls/{poll_id}` | ADMIN | 无 | 200 / ManagePollDetail；全局只读 |
  | `GET /admin/audit-events` | ADMIN | query：page/page_size/poll_id?/action? | 200 / Page[AuditEventPublic]；去敏审计 |

  所有分页 `page >= 1`、`1 <= page_size <= 50`，默认 12；按 `created_at DESC,id DESC` 保证稳定顺序。`q` 去空白后最多 120 字符，使用参数化查询。总数、筛选、搜索和概览也排除无权看到的私密/草稿，不能只隐藏列表行。第一版不提供个人选择名单、匿名身份反查或任意票据查人接口。

* **关键资源模型。** 下列业务模型作为统一外层的 data 使用。RequestModel/ResponseModel 定义见上文；内部 Context 类型不直接序列化到接口响应。

  | 模型 | 字段约定 |
  | --- | --- |
  | `HealthStatus` | `status: Literal["live","ready"]`，定义在 api/health/health_get.py，用于两个健康接口的成功 data |
  | `UserPublic` | `id,username,display_name,role`，绝无 password_hash |
  | `SessionPublic` | `user:UserPublic,csrf_token,session_expires_at`，是 login 与 me 的公开响应 |
  | `GuestPublic` | `csrf_token,expires_at`；浏览器 token 只放 HttpOnly Cookie，不返回 guest 数据库 ID |
  | `ShareEntry` | `poll_id,identity_mode,visibility,password_required,login_required`；私密未解锁无标题/选项/票数；login_required 表示 NAMED 提交需登录，不用于阻断 PUBLIC 详情浏览 |
  | `ShareInfo` / `AccessGrantPublic` | `share_url,requires_password,requires_login` / `poll_id,expires_at`，定义于 fileds/response/poll_access_response.py；不返回密码或 token |
  | `VoteRequest` / `VersionRequest` | `option_id`（严格正整数） / `expected_version`（服务端给出的整数版本）；分别位于 vote_request.py / poll_request.py，继承 BaseRequestData |
  | `PollCreate` | `title,description,starts_at,ends_at,identity_mode,visibility,access_password?,options:[{label}]`；PRIVATE 密码必填且仅写入散列 |
  | `PollUpdate` | 完整草稿字段加 expected_version；PRIVATE 更新未提供新密码时保留已有散列，改 PUBLIC 时移除散列；不回显原密码 |
  | `PollSummary` | `id,title,identity_mode,visibility,starts_at,ends_at,effective_status,created_at`，公共列表不提供个性化投票状态/实时票数 |
  | `ManagePollSummary` | PollSummary 加 `lifecycle,version,creator_id`，用于本人/管理员只读列表 |
  | `PollDetail` | PollSummary 加 `description,options:[{id,label,position}],has_voted:boolean\|null,receipt?,server_time,can_vote,can_manage,can_view_results,results_access_reason`；无对应账户/访客上下文时 has_voted=null、receipt=null，不把未知状态说成确定未投 |
  | `ManagePollDetail` | PollSummary 加 `description,options,lifecycle,version,creator_id,closed_at,has_access_password,server_time,can_manage,can_view_results`；独立于参与模型，不含 has_voted/receipt/can_vote，也不返回密码或匿名标识 |
  | `VoteReceipt` | `receipt_id,poll_id,submitted_at`，不公开身份与所选项组合 |
  | `MyVote` | `receipt_id,poll_id,poll_title,submitted_at`，仅当前账号且具有读取权的 NAMED 记录 |
  | `PollResults` | `poll_id,total_votes,options:[{option_id,label,count,percentage}],winner_option_ids,is_final,server_time`；进行中 is_final=false，最高项称当前领先项 |
  | `Principal` | 后端内部不可变身份对象，`user_id,role`，不含数据库 Session |
  | `SessionContext` | 内部对象，`principal,user:UserPublic,csrf_token,expires_at`；me/CSRF 使用，不包含原 session token |
  | `LoginResult` | 内部对象，`raw_token,session:SessionPublic`；只有 raw_token 用于设置 cookie，公开响应仅取 session |
  | `GuestContext` | 内部对象，访客 ID/CSRF/到期与请求内 guest token；无 user_id，不写入日志/公开响应 |
  | `PollAccessContext` | 内部读取/访问对象，`principal:Principal\|None,guest:GuestContext\|None`；按服务端 poll 模式处理，匿名写票时丢弃 principal |
  | `Page[T]` | `items,page,page_size,total`；作为 ResponseModel[Page[T]].data，定义在 fileds/response/response.py |
  | `ResponseModel[T]` / `ValidationErrorData` | `code,msg,data:T,request_id` / `issues:[{field,loc,msg}]`；校验失败 data 使用后者，其他失败 data=null |
  | `AuditEventPublic` | `id,actor_id,action,poll_id,receipt_id,created_at,request_id`；不含个人选项 |

  API 时间统一为 UTC 的 ISO 8601；JSON key 使用 snake_case。`percentage` 用有效票数作分母，保留两位小数；零票统一 0，四舍五入可能使总和略偏离 100%，界面保留说明。所有请求模型设置未知字段拒绝，避免用户偷偷提交 role、voter_id 或 lifecycle。

  PUBLIC 详情允许 principal/guest 为空，返回公开题目和选项，不在 GET 时隐式创建访客凭据。未登录访问公开 NAMED 时 can_vote=false；无访客凭据的 ANONYMOUS 页面先浏览，再在准备提交时初始化上下文。存在有效上下文时按读侧共享锁恢复 has_voted/receipt。PRIVATE 的密码与记名身份门禁仍执行；结果读取保留 BR-05，公开记名结果对普通读取者仍需登录，公开匿名结果结束后可供访客查看。

  关闭操作若已显式关闭，重复调用返回现状，不再写第二条关闭审计；首次关闭需匹配 `expected_version`。自然结束的 PUBLISHED 投票可保持自然结束状态，不因读操作改写生命周期。

* **前端页面与状态。**

  | 路由 | 页面 | 内容与关键状态 |
  | --- | --- | --- |
  | `/login` | LoginPage | 双栏品牌/表单；登录中、凭据错误、会话恢复、成功跳转 |
  | `/register` | RegisterPage | 普通账号注册；成功后引导登录，不显示角色选项 |
  | `/` | DashboardPage | 访客看公开投票入口；登录者看本人创建/记名参与概览；ADMIN 另有监督入口 |
  | `/polls` | PollListPage | PUBLIC 广场，访客可浏览；状态、搜索、分页、卡片 |
  | `/s/:share_code` | ShareEntryPage | 解析后在同一分享路由渲染详情/投票；登录后回原入口，刷新保留定位码 |
  | `/s/:share_code/access` | PollAccessPage | 私密密码表单、错误/限速/过期提示；share_code 留路由，密码不留 URL |
  | `/s/:share_code/results` | PollResultPage | 分享上下文下读取汇总；授权失效仍可保留定位码重新解锁 |
  | `/polls/:id` | PollDetailPage | PUBLIC 允许访客浏览题目/选项；NAMED 在提交时引导登录，ANONYMOUS 在准备提交时建立 guest；PRIVATE 按门禁 |
  | `/polls/:id/results` | PollResultPage | 根据 can_view_results；创建者/ADMIN 可看进行中，其他人结束后查看 |
  | `/my-polls`、`/my-polls/:id` | MyPollsPage / PollWorkspacePage | 登录用户自己的列表、草稿、发布/关闭、分享与即时汇总 |
  | `/my-polls/new`、`/my-polls/:id/edit` | PollEditPage | 模式/公开性、私密密码、动态选项与时间；保存版本冲突提示 |
  | `/my-votes` | MyVotesPage | 本人 NAMED；无授权私密记录不列出，原链接解锁后可见；匿名回执留本场 |
  | `/admin/polls`、`/admin/polls/:id` | AdminPollsPage / AdminPollDetailPage | 全局只读详情/汇总，不显示修改他人投票按钮 |
  | `/admin/audit` | AdminAuditPage | 去敏事件、时间、操作者和请求标识 |
  | `/403`、未知地址 | ForbiddenPage / NotFoundPage | 清晰提示与返回入口 |

  账户状态为 `loading | authenticated | anonymous`；本人工作区和管理页需要认证守卫，记名投票的账户检查作用于提交动作。PUBLIC 详情不放在整页 RequireAuth 下，不因 me 返回 401 或 ShareEntry.login_required=true 而隐藏公开内容。单独维护访问状态 `access_loading | login_required | password_required | ready | voted | submission_unknown`；公开浏览可以 ready，同时投票按钮提示登录/初始化凭据。guest/密码授权失效与账户失效分别处理，后端仍独立校验权限。

  私密参与流程始终保留 `/s/:share_code` 路由上下文，避免跳到纯 ID 页面后刷新丢失解锁所需的定位码。分享面板只生成/复制链接，由创建者自行分发；系统不自动发送邮件或消息。

* **参考页面设计如何落地。**

  | 参考事实与位置 | 本项目应用 | 实施限制 |
  | --- | --- | --- |
  | F01 `src/index.css:12–25,98–115`：浅灰底、靛紫主色、玻璃卡片 | `tokens.css` 统一主色 `#6366f1`、hover `#4f46e5`、背景 `#f8fafc`、标题 `#111827`、正文 `#4b5563` | 关键文本有足够实色底，不能为了透明牺牲对比度 |
  | F01 `src/App.jsx:121–142`：12px 组件圆角、输入控件高度 | Ant Design ConfigProvider 集中 theme token；触控目标至少 44px | 颜色/间距不散落在页面字符串中 |
  | F01 `src/components/MainLayout.jsx:274–288,346–355` | 桌面 250px 侧栏，992px 以下抽屉导航；顶栏与用户菜单 | USER 显示创建/我创建的/记名参与，ADMIN 另加监督入口 |
  | F01 `src/pages/Home.css:1–19,107–117,453–513` | 概览卡片、渐变主行动区、窄屏单列 | 只展示当前身份可访问数据；不在广场泄露他人进行中结果 |
  | F01 `src/pages/Login.jsx:517–524,582–603,828–849` | 大屏双栏，小屏单列表单，品牌区换投票主题 | 不复制无实际行为的第三方登录按钮和重复镜头效果 |
  | F01 `src/pages/AdminUsers.jsx:378–399,530–566` | 管理搜索、分页表格、卡片容器 | 手机表格只在容器内部滚动，不让整个页面横向溢出 |
  | F01 `src/api/retryPolicy.js:1–18` | 保留对安全读取失败的有限重试思路 | 投票、注册、发布、关闭 POST 不自动重试 |

  字体优先使用本地系统中西文字体，Outfit 可作为有本地许可资源时的增强，不强制依赖 Google Fonts 网络。第一版保持浅色，与参考项目现状一致；轻动画遵守 `prefers-reduced-motion`。

  BallotForm 需要 `idle → confirming → submitting → success/unknown/error`。提交前等待 guest 初始化、NAMED 登录及 PRIVATE 解锁完成；提交中禁用按钮。断网或 `SUBMISSION_STATUS_UNKNOWN` 时查询同场详情：NAMED 用账号、ANONYMOUS 用原 guest Cookie 恢复 has_voted/receipt。共享锁等待先前写事务，不能丢弃匿名 Cookie 后用账号历史代替查询。

  一次查询未查到记录不能证明原网络请求永远不会抵达服务端；保留“尚未查到记录”的准确提示，可再次查询，或由用户明确重新提交，最终仍由唯一约束保证最多一票。分页参与列表可供展示，不以当前页没有某场记录作为未投证明。

### 非功能目标与重点审查

* **可验证目标。** 下列数值是课程演示的建议目标，不是已测性能，也不是课件强制指标。

  | 编号 | 目标 | 验证方式 |
  | --- | --- | --- |
  | NFR-01 正确性 | NAMED 每账号、ANONYMOUS 每有效浏览器凭据每场最多一票；票种/选项归属正确；确定失败无部分写入 | PostgreSQL 模式 CHECK/组合 FK/条件唯一索引和并发测试 |
  | NFR-02 安全性 | 所有权、密码和公布时机分别校验；匿名票不关联账号；ADMIN 全局只读 | 四组合/访问权矩阵、CSRF、Cookie、去关联日志断言 |
  | NFR-03 易用性 | 375/768/1024/1440px 均可完成登录、投票、查结果，无页面级横向溢出 | 浏览器截图和实际交互；键盘、焦点、表单错误检查 |
  | NFR-04 时间一致性 | 以服务端 UTC 为准，覆盖开始/结束恰好相等及浏览器时钟错误 | 可注入 Clock 的边界测试 |
  | NFR-05 可复现 | 空环境按 README 安装和迁移后可完成一条完整流程 | 从 Git 干净检出进行安装演练，记录命令与版本 |
  | NFR-06 性能 | 本地指定机器、20 并发、100 场/1000 账号/10000 历史票下，读取 p95 < 500ms、投票 p95 < 1000ms | 独立测试库与非默认负载脚本；记录硬件、数据和未达标原因 |
  | NFR-07 可维护性 | 新增迁移和功能可定位到单一模块，依赖锁定，核心规则有自动回归 | lint/typecheck/test/build 与需求追踪 |

  性能目标只用于本地课程规模；不能据此声称支持生产选举。核心权限、时间、唯一性和统计正确性是发布门槛，视觉优化和性能调优不能绕过它们。

* **Review Focus：五类必须有明确测试归属的风险。**

  | 风险输入/条件 | 用户应得到的行为 | 测试归属 |
  | --- | --- | --- |
  | 同账号/同匿名凭据并发，首次 Cookie 或响应丢失 | 提交前初始化凭据；对应模式最多一票；用原上下文恢复 | T03、T05、T08、T10 |
  | 等锁期间截止/创建者关闭，结果与在途票并发 | 锁后判状态；最终汇总等待合法在途提交 | T04–T06 |
  | 他人 USER/ADMIN 伪造所有权、角色、票种或选项 | 写权限来自 creator_id；数据库拒绝票种/选项不匹配 | T02、T04、T05、T09 |
  | 私密链接无密码、跨浏览器授权、普通参与者提前看结果 | 门禁覆盖详情/恢复/结果；创建者/ADMIN 的汇总例外不变成写权 | T04、T06、T08–T10 |
  | 已登录者投匿名票，账号日志/回执可被关联 | voter_id 为空，不入账户历史，无可反查身份的审计链 | T05、T06、T10 |

### 运行约定与验收矩阵

* **本地启动流程。** 下面的命令对应当前代码。真实密钥放在本机环境，不写入仓库。结果见 `docs/coordination/implementation-snapshot.md`。

  项目根目录：依据 `.env.example` 创建本地 `.env`，确保数据库凭据一致，填写稳定 ANON_VOTER_HMAC_KEY、PUBLIC_BASE_URL 和私密演示密码，再启动数据库；这些真实值不进入仓库。

  ```bash
  docker compose --env-file .env -f db/compose.yml up -d --wait
  ```

  后端终端，工作目录 `backend/`：

  ```bash
  uv sync --frozen
  uv run python -m alembic upgrade head
  uv run python -m src.main.python.cli seed-demo
  uv run python -m src.main.python.cli new-demo-round
  uv run python -m uvicorn src.main.python.main:create_app --factory --reload --host 127.0.0.1 --port 8000
  ```

  工厂入口与 T01 的可选 Settings 签名一致，既支持 Uvicorn 无参调用，也支持测试显式注入。以上命令和 CI 均从 `backend/` 执行，Python 按 `src.main.python` 定位源码；不切换到深层源码目录运行。

  前端终端，工作目录 `frontend/`：

  ```bash
  npm ci
  npm run dev -- --host localhost
  ```

  打开 `http://localhost:5173`。前端 host、ALLOWED_ORIGINS 和浏览器地址统一使用 localhost；Vite 后端代理目标使用 `http://127.0.0.1:8000`。浏览器只访问前端来源，由代理传递 cookie；切换 host 时同步调整配置与文档。

* **实施后的完整检查命令。**

  后端工作目录：

  ```bash
  uv run ruff check .
  uv run ruff format --check .
  uv run python -m pytest tests/unit tests/api tests/integration -q
  ```

  前端工作目录：

  ```bash
  npm run lint
  npm run typecheck
  npm run test -- --run
  npm run build
  npm exec playwright test
  ```

  测试环境先启动 test profile 并配置专用库；Playwright 在测试账户、测试场次与真实服务就绪后运行。浏览器安装由 Playwright 的安装命令在实施时执行，不在参考目录执行。验收通过以退出码、断言与报告为据，不以命令“开始运行”代替通过。

* **首轮追踪矩阵。**

  | 需求 | 核心实现 | 测试与演示 |
  | --- | --- | --- |
  | U-01 / U-05 / U-06 | 独立新代码、资料索引与借鉴说明 | 无 references 干净启动；核对编程修改文件范围 |
  | U-02 / U-03 / U-04 | 三目录、API、迁移、架构文档 | 安装演练、架构图与课程映射 |
  | U-12 / U-13 / U-14 / U-15 | 两名开发者、暂定基线与实现交接包、需求变更回归 | 记录实际版本与差异，供其他组据代码整理和验证；不以前置正式文档阻塞编程 |
  | U-08 / VOT-FR-01 / 08 | auth/guest service、AuthProvider/GuestProvider、所有权依赖 | test_auth、test_guest_context、test_ownership |
  | U-08 / VOT-FR-02 / 03 | poll_service、creator PollForm/工作区 | USER 创建/编辑/关闭，非 owner USER/ADMIN 均拒绝 |
  | U-09 / VOT-FR-04 / 11 | PUBLIC 列表过滤、广场/本人概览 | 私密不进搜索/总数；四视口验收 |
  | U-08 / VOT-FR-05 / NFR-01 | vote_service、模式 CHECK、条件 UNIQUE、两组组合 FK | 两模式并发、匿名不绑定账号、跨场拒绝 |
  | U-11 / VOT-FR-06 | result_service、PollResultPage | owner/ADMIN 进行中可读；其他人结束后且通过门禁 |
  | VOT-FR-07 | NAMED 账号记录、匿名本场 Cookie 恢复 | 甲乙隔离、匿名不入账户历史、丢响应恢复 |
  | VOT-FR-09 / NFR-05 / 07 | db migrations、cli、README、锁文件、CI | 空库迁移与干净检出安装 |
  | VOT-FR-10 / NFR-02 | 管理/记名审计、匿名去关联、双 CSRF 来源 | test_audit、test_anonymous_privacy、跨站拒绝 |
  | U-10 / VOT-FR-12 | SharePanel、shares 路由与 share_code | 分享刷新保留上下文、URL 无密码、草稿不可分享 |
  | U-09 / VOT-FR-13 | PollAccessService、密码散列与短期 grant | 错误/过期/跨场/跨浏览器授权拒绝 |
  | U-11 / VOT-FR-14 | admin 只读列表/详情、聚合结果 | ADMIN 可读全局，但不能修改非本人投票 |
  | U-16 | RequestModel/ResponseModel、ApiCode、公共前端客户端 | 通用模型/响应契约、422/OpenAPI、分页、Cookie 与一次封装/解包核对 |
  | U-17 / VOT-FR-04 | PUBLIC 详情读取与提交鉴权分开 | 访客能浏览两模式公开详情；NAMED 提交需登录；本人状态未知与私密门禁核对 |
  | NFR-03 / 04 / 06 | 响应式主题、Clock、并发事务 | 四视口浏览器检查、边界测试、负载测量 |

### 课程理论与项目证据

* **将理论落到可展示的产物。** 下表页码均为本地 PDF 的物理页码；出处编号见文末。编程侧保留真实代码、测试和选型依据；表中正式需求、分析与设计产物由对应成员整理，本表供查证使用。

  | 课程依据 | 已核对的页码与内容 | 在投票系统中的应用 | 应保留的证据 |
  | --- | --- | --- | --- |
  | C02 Software Processes | p3：规格、设计实现、验证、演进；p25：架构、数据库、接口和组件设计 | 以四类活动组织证据；实际采用需求/编码并行、实现后模型与设计整理、持续验证改进 | 需求/实现/文档版本、实际决策、测试和变更记录 |
  | C02 Software Processes | p27、29：验证确认与组件、系统、客户测试 | 单元与集成测试验证规则；完整演示确认需求是否满足 | 测试报告和验收脚本 |
  | C03 Agile Software Development | p15–16：小版本、故事拆分、测试先行、持续集成；p19：故事到任务与估时 | 以可演示的用户故事组织增量，每个关键规则先写失败用例 | Backlog、任务完成记录、CI |
  | C03 Agile Software Development | p36–40：Scrum/backlog/sprint/评审 | 小组采用轻量迭代和短评审，不为了术语增加仪式 | 会议纪要、阶段演示与反馈 |
  | C04 Requirement Engineering | p14：功能与非功能需求；p24、26：质量目标量化 | 给 VOT-FR、NFR 编号，写清前置条件、异常与可测目标 | 需求表、验收条件 |
  | C04 Requirement Engineering | p46：场景含正常、异常、并发和结束条件；p54：标准化需求与 rationale | 投票场景覆盖重复、截止、网络未知和关闭并发 | 用例描述、异常分支与测试对应 |
  | C04 Requirement Engineering | p72：有效、一致、完整、现实、可验证；p75、80–82：来源、唯一 ID、追踪、变更 | 区分用户要求与建议；需求变更更新影响分析 | 需求追踪矩阵、变更日志 |
  | C05 System Modeling | p6：UML；p10：系统边界；p16：用例；p20：时序；p25：类；p41：状态机 | 建立参与者用例、投票时序、领域类和生命周期模型 | UML 图及对应业务规则 |
  | C06 Architectural Design | p19：4+1 的开发视图；p26–27：分层；p33–34：客户端服务器 | 前后端分离，后端路由/服务/持久化分层，三目录是开发视图的一部分 | 架构图、目录职责、部署视图 |
  | C06 Architectural Design | p47、51：Web UI、应用逻辑与数据库事务职责 | 浏览器处理交互；后端决定可否投；数据库约束保障唯一性 | 接口契约、事务设计与集成测试 |
  | C07 Design and Implementation | p7：上下文到架构、对象、模型、接口；p27：接口规格 | 当前切片先约定必要接口，前端 Mock 与后端实现并行；正式设计随后与代码核对 | 暂定接口快照、OpenAPI、TS 类型和实现后设计 |
  | C07 Design and Implementation | p45–46：配置管理 | 锁依赖、提交迁移、记录版本与可重复安装 | `uv.lock`、`package-lock.json`、迁移和发布记录 |

  旧版曾核对 `Course_syllabus.pdf` p3 列出 Software testing 和 Software evolution；该文件当前未在参考目录找到。当前提供的独立课件只到 Lecture 7，测试和维护计划可由 C02/C03 支持；不要虚构 Lecture 8/9 页码或声称已经读过尚未提供的课件。

  课件提供方法和概念；“①④并行、②③依据编码版本后整理”是本组受时间约束的实际安排，不宣称课程规定应将设计放在编码之后。最终报告解释采用的过程、反馈和文档校验方式，以真实产物说明理解。

### 参考资料索引

* **C01：课程整体要求（历史来源）。** 旧版记录曾核对 `references/R_COMP8500SEF/Course_Introduction.pdf` p18、20、22、24–30，以及 `Course_syllabus.pdf` p3。**本次整理时这两个文件在当前参考目录中未找到**，因此不保留失效链接；涉及课程提交要求时需重新核对实际资料。

* **C02：软件过程。** [Lecture 2_Software Processes.pdf](../../../references/R_COMP8500SEF/3_20260914/Lecture%202_Software%20Processes.pdf)，重点 p3、25、27、29。

  > ../../../references/R_COMP8500SEF/3_20260914/Lecture%202_Software%20Processes.pdf

* **C03：敏捷开发。** [Lecture 3_Agile Software Development](../../../references/R_COMP8500SEF/5_20260921/Lecture%203_%20Agile_Software_Development.pdf)，重点 p15–16、19、36–40。

  > ../../../references/R_COMP8500SEF/5_20260921/Lecture%203_%20Agile_Software_Development.pdf

* **C04：需求工程。** [Lecture 4_Requirement Engineering.pdf](../../../references/R_COMP8500SEF/7_20260928/Lecture%204_Requirement%20Engineering.pdf)，重点 p14、24、26、46、54、72、75、80–82。

  > ../../../references/R_COMP8500SEF/7_20260928/Lecture%204_Requirement%20Engineering.pdf

* **C05：系统建模。** [Lecture 5_System_Modeling.pdf](../../../references/R_COMP8500SEF/8_20261006/Lecture%205_System_Modeling.pdf)，重点 p6、10、16、20、25、41。

  > ../../../references/R_COMP8500SEF/8_20261006/Lecture%205_System_Modeling.pdf

* **C06：架构设计。** [Lecture 6_Architectural_Design.pdf](../../../references/R_COMP8500SEF/9_20261013/Lecture%206_Architectural_Design.pdf)，重点 p19、26–27、33–34、47、51。

  > ../../../references/R_COMP8500SEF/9_20261013/Lecture%206_Architectural_Design.pdf

* **C07：设计与实现。** [Lecture 7_Design_and_Implementation.pdf](../../../references/R_COMP8500SEF/10_20261019_online/Lecture%207_Design_and_Implementation.pdf)，重点 p7、27、45–46。

  > ../../../references/R_COMP8500SEF/10_20261019_online/Lecture%207_Design_and_Implementation.pdf

* **C08：案例边界（历史来源）。** 旧版记录曾核对 `references/R_COMP8500SEF/Assignment_Requirement Engineering_v2.pdf` p1 为银行与保险案例，以及 `submission/TeamB_MBC_Specification_14570818.md` 行 1、6、11 和 FR-01–16 为银行业务。**本次整理时这两个文件在当前参考目录中未找到**，仅保留来源说明，不把这些案例当作投票需求。

* **F01：前端参考项目。** [R_IELTSWORDS frontend](../../../references/R_IELTSWORDS/frontend/)，重点 `package.json:18–45`、`src/index.css:12–25,98–115`、`src/App.jsx:118–179`、`src/components/MainLayout.jsx`、`src/pages/Home.css`、`src/pages/Login.jsx`、`src/pages/AdminUsers.jsx`。

  > ../../../references/R_IELTSWORDS/frontend/

  其 `AuthContext.jsx:91–95` 把 token/user 写入 localStorage，是需要重新设计的做法；学习/AI/离线/Capacitor 依赖不属于本项目。这里只借鉴代码组织与可见设计模式，不宣称已启动参考应用做逐像素比对。

* **B01：后端参考项目。** [R_llm-sale Python](../../../references/R_llm-sale/src/main/python/)，重点 `main.py:13–16,30–39,57–67`、`api/routes.py:14–39`、`api/customer_appointment/customer_appointment_post.py:19–27,43–60`、`fileds/request/customer_appointment_request.py:10–59`。

  > ../../../references/R_llm-sale/src/main/python/

  本项目沿用参考的 `src/main/python/`、`api/routes.py`、按业务拆接口、`fileds/request` 与 `fileds/response`、`algorithms/*_module`、`config/constants/utils` 层级，并有意保留 `fileds` 原拼写，便于按熟悉的位置开发。投票业务类使用 Service 命名，ORM 另放新增的 `database/models/`；`db/` 仍集中保存迁移和运行数据。现有配置、生成器、LLM 调用不能证明已有可靠认证或业务持久化；新项目的 SQLAlchemy、迁移、会话、事务与自动化测试均为新增工作，个人静态路径、宽泛 CORS 与外部服务凭据不沿用。

  通用输入/输出另外参考已读取的 [ChatPostRequest 定义](../../../references/R_llm-sale/src/main/python/fileds/request/request.py) 和 [ResponseModel 定义](../../../references/R_llm-sale/src/main/python/fileds/response/response.py)：保留业务参数集中承载及 code/msg/data 的形式，精简聊天字段并新增服务端 request_id。

  > ../../../references/R_llm-sale/src/main/python/fileds/request/request.py
  > ../../../references/R_llm-sale/src/main/python/fileds/response/response.py
