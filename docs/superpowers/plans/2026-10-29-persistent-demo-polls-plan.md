# 固定投票示例生成计划

* **目标**：在项目中保存可重复生成的投票示例，每次运行 `docker compose up -d --build` 后，公开投票通过 Overview 正常展示，私密投票通过现有授权入口访问，覆盖匿名、公开、票数上限、多选、实时结果的所有组合。

  日期：2026-10-29。本文件依据当前代码制定，仅为计划，尚未实现。方案选择与下述默认数量、文案、时间窗口是建议，不是已经存在的功能。实施时逐项执行并验证；本轮不修改代码、数据库或 references。只维护这一份示例计划。

  架构：版本化初始化配方 + 内部执行账本 + 正常业务服务链路 + 启动幂等初始化；不新增产品内的示例分类或展示入口。继续使用 FastAPI、SQLAlchemy、PostgreSQL、Alembic、React 和现有 PollCard。代码及注释使用英文，README 同步中英文。

## 当前代码与方案选择

* **已经核对的实现。**

  | 文件 | 当前行为与影响 |
  |---|---|
  | `compose.yml` | PostgreSQL 使用 `postgres_data` 命名卷；普通重建镜像不会清空数据 |
  | `backend/docker-entrypoint.sh` | 顺序执行迁移、`seed-demo`、启动 Uvicorn；当前没有自动创建投票 |
  | `backend/src/main/python/cli.py` | `seed-demo` 幂等创建 admin/demo_user/demo_voter；`new-demo-round` 每次随机批次新建四场，不能直接挂入启动脚本 |
  | `frontend/src/pages/DashboardPage.tsx` | Overview 使用 getPolls，每页 8 条，有搜索和分页；路由要求登录 |
  | `algorithms/poll_module/poll_service.py::list_public` | 仅 PUBLIC 且非 DRAFT；私密示例即使存在也不出现在当前 Overview |
  | `frontend/src/features/polls/PollCard.tsx` | 展示公开性、身份模式、有效状态、时间；尚未展示 vote_limit、selection_mode、allow_live_results |
  | `fileds/response/poll_response.py::PollSummary` | 已包含五个组合字段，无需为三个新标签扩展业务摘要 |
  | `database/models/poll.py` | 已有 allow_live_results；票数上限 1–100000；多选由业务校验至少三个选项 |
  | `algorithms/result_module/result_service.py` | 创建者／管理员有管理查看权限，不能用他们验证普通参与者的实时结果开关 |

  表中省略前缀的后端路径均相对 `backend/src/main/python`。当前没有 voting_frequency 字段；每日一次不作为这次示例的既有能力，不虚构可用场景。

* **按用户补充要求修订：所有生成数据都是正常投票。**

  取消上一版的独立示例区、示例目录接口、特殊摘要公开规则和直接写入业务表的 fixture writer。数据库使用原 users、polls、poll_options、votes、vote_selections 及正常授权／审计表；Poll 不增加 is_demo、示例分类或展示优先级，响应也不返回 fixture_key。

  初始化程序只模拟普通账户的操作，复用注册／账户创建、创建草稿、发布、密码授权、提交选票和关闭的正常业务服务。界面、权限、搜索、排序、统计和结果与手工创建完全一致。内部需要执行账本来判断启动操作是否已完成；这是初始化的幂等记录，不是投票业务分类，不供前端查询。

  所有公开投票自然进入 Overview；私密投票保持不公开，只能从创建者 My polls、管理员列表或分享入口访问。不能同时要求私密数据遵循正常权限又在所有用户的 Overview 展示；本版以正常业务链路为准，不新增私密摘要泄露例外。不置顶初始化投票，数据增多后按原分页和搜索查找。

## 组合与内容设计

* **五个二元维度共 32 种组合，全部生成，不只做两两覆盖。**

  | 维度 | 取值 |
  |---|---|
  | identity_mode | NAMED / ANONYMOUS |
  | visibility | PUBLIC / PRIVATE |
  | vote_limit | null / 20 |
  | selection_mode | SINGLE / MULTIPLE |
  | allow_live_results | false / true |

  使用四组主题，各自套用下面八种设置；四组 × 八种 = 32 场。内部配方键与实际数据库 ID 分离，例如 `named-public-01`，不能使用随机标题、随机批次或数据库 ID 作为去重依据。

  | 组别／键前缀 | 标题主题 | 身份／公开性 | 四个固定选项 |
  |---|---|---|---|
  | A / named-public | Technical sharing topics | 记名／公开 | React concurrency; PostgreSQL indexing; Automated testing; API design |
  | B / anonymous-public | Campus activity preferences | 匿名／公开 | Film night; Hiking; Board games; Photography |
  | C / named-private | Project workshop priorities | 记名／私密 | Requirements; Architecture; Implementation; Testing |
  | D / anonymous-private | Team retrospective priorities | 匿名／私密 | Communication; Planning; Tooling; Workload |

  | 编号 | vote_limit | selection_mode | allow_live_results | 每组对应示例 |
  |---|---|---|---|---|
  | 01 | null | SINGLE | false | A01、B01、C01、D01 |
  | 02 | null | SINGLE | true | A02、B02、C02、D02 |
  | 03 | null | MULTIPLE | false | A03、B03、C03、D03 |
  | 04 | null | MULTIPLE | true | A04、B04、C04、D04 |
  | 05 | 20 | SINGLE | false | A05、B05、C05、D05 |
  | 06 | 20 | SINGLE | true | A06、B06、C06、D06 |
  | 07 | 20 | MULTIPLE | false | A07、B07、C07、D07 |
  | 08 | 20 | MULTIPLE | true | A08、B08、C08、D08 |

  初始化编号只留在配方和本计划中，不进入标题。标题使用自然主题和场次名称，例如 `Technical sharing topics — October workshop`；每组八个标题在配方中明确配置，使用不同活动名称区分，不含 demo、fixture、示例或 A01 等测试标记。描述只写自然投票内容，例如 `Choose the topic you would like to discuss.`，多选可用 `Choose the topics you would like to discuss.`。不在页面放 32 种组合矩阵、开发计划、测试说明等长文。界面标签用既有 i18n，示例内容是固定英文数据，不随页面切换语言重新写库。

  32 场创建时均为已发布 OPEN，使用四个选项，避免把多选能力与选项数量差异混在一起。全场最多 20 份指选票父记录数，多选一次也只占一份。false 表示进行中不可看结果，不是结束后永远不可看。

* **额外补充 6 场状态示例，总计 38 场。**

  | 键／标题 | 设置与初始数据 | 展示目的 |
  |---|---|---|
  | state-scheduled / Upcoming campus event | PUBLIC、NAMED、SINGLE、无限额、live=false；T+24h 开始、T+7d 结束，0 票 | 未开始卡片、装饰和按钮 |
  | state-closed / Completed workshop survey | PUBLIC、ANONYMOUS、MULTIPLE、无限额、live=false；T-7d 到 T-1d，3 票 | 自然结束、最终结果 |
  | state-manually-closed / Completed team decision | PRIVATE、NAMED、SINGLE、无限额、live=true；时间仍有效但显式 CLOSED，3 票 | 私密关闭卡片、密码后结果 |
  | state-cap-full / Fully booked activity | PUBLIC、ANONYMOUS、MULTIPLE、limit=3、live=true；3 票且 CLOSED | 达上限关闭、多选不按选择数扣容量 |
  | state-cap-last / Final workshop place | PUBLIC、NAMED、SINGLE、limit=4、live=true；3 票 | 剩最后一票、提交即关闭 |
  | state-empty / New campus suggestion | PUBLIC、ANONYMOUS、SINGLE、无限额、live=true；0 票 | 零结果、零分母、空图表 |

  T 是首次成功初始化时固定的服务端 UTC 时间，界面按香港时间显示。32 场主组合及有效时间示例默认开始 T-1h、结束 T+30d。补充场次各自使用四个自然、唯一选项，复用对应主题即可。草稿故意不放 Overview；如需测试草稿，沿用 My polls 或旧手动命令，不把草稿改成可参与投票。

* **预置选票让实时结果有内容，但不占用可登录演示账户的资格。**

  32 场每场初始化 3 张合成票：单选依次选择 [1]、[2]、[2]，计数 [1,2,0,0]，分母 3；多选依次 [1,2]、[2,3]、[2,4]，计数 [1,3,1,1]，分母 6。比例分别约 33.33/66.67/0/0 和 16.67/50/16.67/16.67，显示总和可能因四舍五入为 100.01%，不能错误判失败。父票数始终为 3。

  记名预置票由三个正常 USER 账户参与，例如 `alex_chen`、`jamie_wong`、`sam_lee`；使用正常账户创建服务、有效密码散列、is_active=true，不增加专用角色。凭据通过初始化配置安全提供，不写进配方／日志；已有同名账户不得未经身份验证直接认领。demo_user 为创建者，demo_voter 和 admin 不预先投票，保留人工试用资格。

  每份匿名预置票使用正常访客凭据创建流程，三个独立浏览器身份模拟三位参与者，经过现有 VoteService 生成按场次散列。私密场次先调用真实密码授权服务，再使用授权上下文提交；记名场次使用有效 USER Principal。所有选票都调用 cast_vote，不直接插入 Vote/VoteSelection，不跳过容量、身份、开放状态或选项校验。回执、分享码、审计记录均由业务服务正常产生，actor 是执行动作的普通账户。

  特殊状态也由动作产生：先创建再发布；state-manually-closed 在三次投票后调用 close；state-cap-full 由第三次 cast_vote 自动关闭；scheduled 通过未来开始时间产生。为了首次启动即可看到自然结束场次，初始化命令使用限定在本进程的注入 Clock 重放过去的创建、发布、投票，再回到真实现在读取 CLOSED；所有操作时间在对应窗口内递增。不得给在线 HTTP 接口开放自定义时间或 backdate 参数，不直接改 lifecycle、计数或 closed_at。

  该历史重放是初始化模拟，不代表真实用户曾在这些日期操作；仅在部署文档说明，不向产品页面增加分类。普通主组合也按其 starts_at 前后的逻辑时钟执行创建／发布／投票，以通过服务层时间校验；实际服务运行始终使用真实 Clock。

## 持久化与启动策略

* **永久保存意味着重建后还在，不意味着自动恢复成未投票状态。**

  普通 `up -d --build`、restart、down 后再 up 都保留数据库卷，重复初始化先查执行账本，已成功完成则跳过，不重写已有标题、密码、开始结束、选票、share_code、版本或关闭状态。用户试投、投满、手动关闭后仍保留其结果。30 天后自然结束的投票继续在正常列表显示为 CLOSED，不会凭启动悄悄重开。

  若将来要求每次演示均有全新可投数据，应新增显式的示例新一轮操作；保留历史数据并创建普通新投票，属于额外功能，不作为普通启动的隐式副作用。当前验收是“38 场存在且可展示”，初次初始化时主组合为 OPEN；不承诺它们永远开放。

  `docker compose down -v` 或删除卷会删除整个数据库，不能称为持久保存；再次启动可从版本化 fixture 重建基线，但不能恢复旧试投记录。必须在 README 区分 rebuild 与删卷。数据库备份仍是保存真实试投结果的方式。

* **内部初始化账本：只用于去重和恢复，不给投票分类。**

  使用通用 `initialization_runs` 保存唯一 dataset_key、recipe_version、anchor_time、completed_at；`initialization_steps` 保存 run_id、唯一 step_key、resource_type、resource_id 和完成时间。step_key 例如 `named-public-01:create`、`:publish`、`:vote-1`；不在 Poll 增加字段，不让普通列表 join 账本，也不按标题判断是否执行过。

  账本由 Alembic 建表，配方随源码管理，业务数据不放入 Alembic migration。已有配方版本成功执行后重复启动直接跳过，不能重设已有投票或补投“丢失的预置票”。版本冲突、资源缺失或关联异常明确报错待处理，不按标题抢占其他用户的数据。用户合法修改产生的状态不当成初始化错误；若将来支持删除投票，默认尊重删除并保留完成标记，不自动复活。

  同名账户存在时仅可通过所配置凭据的正常验证确认可用于此次模拟；不能重置密码、停用账户、变更角色或仅凭用户名构造 Principal。没有有效授权则失败。首次创建的账户 ID 同样登记在内部步骤账本。

* **新增 `ensure-demo-polls`，不要复用非幂等 new-demo-round。**

  入口顺序：alembic upgrade head → seed-demo → 根据开关执行 ensure-demo-polls → uvicorn。服务级 `DEMO_POLLS_ENABLED` 默认 false；根 Compose 显式映射 `${DEMO_POLLS_ENABLED:-true}`，保证此课程栈运行用户指定命令即可生成，其他部署可关闭。启用且需要首次执行时 `DEMO_POLL_PASSWORD` 必填且通过既有密码校验；无值要明确失败退出，不能容器内交互 getpass、不能使用硬编码通用密码。沿用现有三个登录账户的密码环境变量，README 和 .env.example 仅写占位符。

  关闭开关只停止自动初始化，已经生成的所有投票继续按正常规则访问，不隐藏、不删除。固定配方 key 和版本进入源码；JSON fixture 放在 `backend/src/main/python/fixtures/demo_polls.json`，现有 Dockerfile 的 COPY backend/src 可包含它，读取用包资源路径而非当前工作目录。

  整批初始化建议使用一个数据库事务及固定 PostgreSQL advisory transaction lock，执行正常业务操作并登记步骤账本，失败整批回滚。现有 PollService 等服务会自己 commit，不能直接外面套 begin 后声称原子完成。实施时提取使用共享 Session、由调用方管理提交的业务操作层：HTTP 原有包装器仍独立提交，初始化编排在同一事务调用完全相同的校验和写入逻辑，最后一次性 commit。审计与授权写入也必须使用同一事务。禁止复制一个“跳过权限的 seed 版本”。

  对已经存在的账户只验证；正常账户创建操作和本批新建资源参与同一事务。取得锁后再检查完成账本，第二个初始化进程等待后发现已完成即跳过。锁与步骤唯一键共同防止重复；如果共享事务改造尚未完成，不得先上直接写表的临时实现。

  默认单 backend Compose；若未来多个副本同时跑迁移，要单独串行化迁移步骤，seed 的锁不等于迁移锁。种子失败时不启动应用，日志输出失败 fixture_key／原因但不输出密码、散列、分享凭据。普通启动最终输出 created/skipped 数量，便于验证。完整批次已提交时先依据账本跳过业务模拟，不重新登录参与账户或要求已过时的私密密码；登录账户原有 seed-demo 步骤的配置要求独立保留。

## Overview 与访问权限

* **完全沿用普通接口和页面，不添加示例 API。**

  Overview 继续请求 `/api/v1/polls`，每页 8 条，保持原搜索、排序、分页和统计。首次初始化新增 21 场公开非草稿投票（主矩阵 16 场＋状态场次 5 场），17 场私密投票不进入公开列表；已有业务数据会另外计入 total，因此只在空测试库断言绝对总数。

  demo_user 的 My polls 和管理员列表可找到全部 38 场。分享链接由既有 get_share 获取，私密密码从既有创建者管理流程查看／配置，不在普通列表附密码。普通参与者通过链接输入密码进入，创建者／管理员保留现有管理权限。已关闭私密场次的结果入口也需验证密码流程。

  无 DemoPollSection，无独立目录搜索，无 fixture_key 响应字段，无示例标识、置顶或特殊跳转。所有初始化数据自然计入正常公开／管理统计。匿名访客仍通过公开或分享入口参与，Overview 本身继续要求登录。

* **卡片保持同一组件，展示五个维度，而不是用不同代码画示例。**

  原有公开／私密、记名／匿名保留；增加简洁信息：“单选／多选”“不限票数／上限 20 票”“实时结果／结束后公布”。这些标签也作用于普通投票，取值都来自 PollSummary，禁止按标题或 fixture_key 猜配置。关闭状态下统一表达已结束／最终结果，避免 live=false 仍显示“结果不可看”的误导；开关的原始配置可在详情保留。

  若将来展示“3/20”进度，需要专门的汇总字段和查询优化；当前摘要没有选票总数，本计划只展示上限，不给每张卡片额外发结果请求。布局允许换行，移动端和中英文长文本不溢出。页面只保留自然标题、必要标签和操作，不放实现说明。

* **验收必须切换角色和浏览器。**

  demo_user 是创建者，admin 是管理员，两者都有管理结果权限；用 demo_voter 验证 live=false 在 OPEN 时拒绝、live=true 时允许。访客匿名试投通过分享／普通公开入口验证，不能因 Overview 要登录就误认为匿名投票必须注册。私密分别验证未输密码、错密码、正确密码，记名私密还需登录；公开匿名不要求账户。关闭后的结果仍受原访问权限约束。

## 文件与实施任务

* **文件职责。以下新增文件名为本计划建议。**

  | 文件 | 变更 |
  |---|---|
  | `backend/src/main/python/fixtures/demo_polls.json` | 32 组合＋6 状态的英文内容、固定键与模板版本 |
  | `backend/src/main/python/algorithms/demo_module/demo_seed_service.py` | 目录校验、数据库锁、原子写入和幂等核对 |
  | `backend/src/main/python/database/models/initialization.py` | 内部 initialization_runs / initialization_steps 账本 |
  | `db/migrations/versions/<new_revision>_initialization_ledger.py` | 只建初始化账本，不改 Poll 的业务分类；revision 实施时生成 |
  | `backend/src/main/python/cli.py`、`config/server_config.py`、`database/models/__init__.py` | 命令、路由、依赖、配置和模型注册 |
  | `backend/docker-entrypoint.sh`、`compose.yml`、`.env.example`、`README.md` | 启动顺序、启用配置、中英文说明 |
  | 后端账户、访客、授权、投票及结果所用业务服务 | 共享事务能力，原 HTTP 包装行为保持不变；先逐个核对现有实现 |
  | `frontend/src/pages/DashboardPage.tsx`、`features/polls/PollCard.tsx`、`i18n/messages.ts`、`styles/polls.css` | 正常卡片标签和样式；Dashboard 仅按必要程度补测试，不新增区域 |

  后端新包增加必要 __init__.py。本轮不引入 LLM，不消耗模型额度；不改现有投票／结果权限规则来迁就示例。旧 new-demo-round 留作手动工具，生成的随机旧场次不被自动登记或删除。

* **任务 1：目录和数据约束。**

  先在 `backend/tests/unit/test_demo_catalog.py` 写测试：32 个核心记录的五元组集合恰好等于五维笛卡尔积；38 个内部配方 key/order 唯一；所有 MULTIPLE 至少 3 项；标题／选项长度与去重通过既有限制；示例选票与票数上限一致。再实现目录加载与验证。

  接口建议 `load_demo_specs() -> tuple[DemoPollSpec, ...]`，`DemoPollSpec` 包含 key/order/version、PollCreate 对应业务字段、相对时间、目标生命周期和选项索引形式的 seed_ballots；不保存真实 ID、密码或访问令牌。非法目录在任何写库前失败。

* **任务 2：持久登记与幂等生成。**

  在 `backend/tests/integration/test_demo_seed.py` 覆盖通过正常服务首建 38 场、第二次 0 新增、并发两次仍 38、写一半故障整批回滚、同名账户凭据无效时冲突且不改原账户。实现迁移和 `ensure_demo_polls(session_factory, clock, access_password) -> DemoSeedReport`，报告 created/skipped，复用类型校验及注入 Clock。

  首次生成预置选票总数为 108：主矩阵 96，4 个有预置票的状态样例 12，scheduled/empty 为 0。断言每份父票与选择明细对应，记名／匿名约束正确。再次生成前模拟正常用户投票、关闭和修改草稿之外的真实投票；生成后这些内容和 share_code/receipt 必须保持不变。补测版本冲突、缺失关联、跨日期启动不会改旧时间；断言业务审计 actor、有效用户状态和私密授权均正确；故障回滚不残留账户、授权、审计或账本。

* **任务 3：启动接入与可重复部署。**

  为 CLI 增加 ensure-demo-polls，启用时非交互读取密码，失败退出非零；Docker 入口按既定顺序调用。验证开关关闭不写 fixture，启用缺配置明确失败，已存在且密码环境变量变化时不自动改旧私密密码。正确配置启动后日志显示首建 38、再次 0；容器无需网络模型服务。

  在隔离 Compose 项目／测试卷中运行两次 `docker compose up -d --build`，查询执行账本、普通投票总数及种子票数，验证 down 后 up 仍保留试投。禁止用真实开发卷执行 down -v 测试。README 记录显示入口、demo_user/demo_voter 的角色区别、DEMO_POLL_PASSWORD 配置、有效期及卷删除行为，不写真实密码。

* **任务 4：普通接口与权限回归。**

  在 `backend/tests/api/test_initialized_polls.py` 验证空测试库初始化后普通公开列表有 21 场，My polls／管理员列表有 38 场；搜索和分页规则与手工创建一致。对全部 17 场私密投票确认公开列表不含其摘要、未经授权不能读内容／结果，正确登录和密码授权后可进入。所有 API 响应均没有示例分类字段。

  比较通过 HTTP 手工创建与初始化调用共享业务服务产生的投票，断言相同字段、状态、访问规则与计票行为；新增共享事务后，原 HTTP 成功时仍正常提交、失败时仍完整回滚。

* **任务 5：正常 Overview 与卡片联调。**

  扩展 DashboardPage/PollCard 测试验证五维标签、正常分页、关闭状态文案、搜索归第一页、语言切换和窄屏布局。断言不存在示例区域、示例徽章或目录接口请求；普通新增投票与初始化投票使用同一个渲染和访问流程。

  增加 `frontend/tests/e2e/demo-polls.spec.ts`：demo_voter 查看实时／非实时结果、匿名新浏览器试投、私密分享密码入口、最后容量一票关闭、零票结果及结束场次结果。测试代码可以称 demo，产品数据不分类。使用独立数据库，不消耗开发库有限额度。

* **任务 6：最终验收。**

  后端在 backend 目录执行 `uv run ruff check .` 与使用安全测试数据库配置的 `uv run python -m pytest tests/unit tests/api tests/integration -q`；前端执行 `npm run lint`、`npm run typecheck`、`npm run test -- --run`、`npm run build`。再执行隔离环境的 Docker 重建和浏览器验收，记录实际结果而非仅检查源文件。

  必须满足：初始化账本对应 38 场普通投票；32 组合无遗漏；普通重启不重复、不清票；Overview 按普通规则展示 21 场公开投票，17 场私密投票走原授权入口；普通私密投票没有泄露；私密示例仍需密码；结果权限以参与者验证；预置统计口径正确；默认启动失败不会静默留下半批示例。格式化、构建与测试通过后才宣称完成实现。
