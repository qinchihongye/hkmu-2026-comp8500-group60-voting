# VoteNow 后端设计

* **范围**：Python 3.12 / FastAPI 后端；核对日期 2026-11-04。入口 `backend/src/main/python/main.py:create_app`。

  [数据库设计](database-design.md) · [全部接口](backend-api.md) · [前端设计](frontend-design.md) · [详细使用](user-guide.md)

## 总体架构

* 部署与依赖

  ```mermaid
  flowchart LR
    Browser[浏览器 React] --> Web[Nginx 宿主机 :80]
    Web -->|静态页面| Static[frontend/dist]
    Web -->|/api/| API[FastAPI / Uvicorn :8000]
    API --> PG[(PostgreSQL 17)]
    API -.可选文字识别.-> LLM[OpenAI SDK / 兼容模型服务]
    CLI[迁移与初始化 CLI] --> PG
  ```

* 应用内部调用

  ```mermaid
  flowchart TB
    Request[HTTP 请求] --> Middleware[请求标识 / JSON 类型检查 / 日志]
    Middleware --> Route[api 路由]
    Route --> Guard[会话 / Origin / CSRF / 角色]
    Guard --> Model[fileds 请求模型与校验]
    Model --> Service[algorithms 业务服务]
    Service --> DB[SQLAlchemy Session / 事务]
    DB --> PG[(PostgreSQL)]
    Service -.文字识别.-> External[external_services / OpenAIService]
    Service --> Response[fileds 响应模型]
    Response --> Envelope[统一 code / msg / data / request_id]
    Guard --> Error[AppError / 统一异常处理]
    Model --> Error
    Service --> Error
    Error --> Envelope
  ```

  上图表达职责，不保证所有校验都按图中固定先后执行：FastAPI 请求解析与依赖解析、服务内权限判断分别发生在对应层。

## 模块与边界

* 路径均相对 `backend/src/main/python/`；`fileds` 为当前目录实际拼写。

  | 模块 | 职责 | 主要依赖 |
  | --- | --- | --- |
  | main.py | 应用工厂、中间件、生命周期 | Settings、路由、会话工厂、模型客户端 |
  | api/ | 42 个应用操作；调用业务服务、设置 Cookie 与响应头 | dependencies、fileds |
  | fileds/request | 统一 data 外壳与业务输入 | Pydantic、枚举、校验函数 |
  | fileds/response | 统一信封、分页、公开／管理输出 | Pydantic |
  | fileds/context | Principal、GuestContext、PollAccessContext | 已验证身份与请求上下文 |
  | algorithms/auth_module | 注册、登录、会话恢复／注销 | users、auth_sessions、Argon2 |
  | algorithms/guest_module | 浏览器凭据创建与恢复 | guest_sessions |
  | algorithms/poll_module | 创建、替换草稿、发布、关闭、列表 | polls、poll_options、审计 |
  | algorithms/poll_access_module | 分享码解析、密码解锁、可见详情 | poll_access_grants、访客凭据 |
  | algorithms/vote_module | 一次提交、去重、限额、账户关联参与历史 | votes、vote_selections |
  | algorithms/result_module | 授权后汇总与最终状态 | 投票共享锁、父票与明细统计 |
  | algorithms/audit_module | 审计写入与管理员读取 | audit_events |
  | algorithms/poll_import_module | 文字候选字段、时间解析、问题码 | 外部提取器，不直接创建投票 |
  | algorithms/demo_module | 固定投票初始化与目录查询 | 两张登记表、普通业务服务 |
  | algorithms/election_module | 选举、资格审核、名册冻结、秘密选票与结果授权 | 7 张选举表、polls、poll_options |
  | algorithms/election_module/mock_eligibility_model.py | 本地课程演示规则引擎 | 证件格式、校验位与签发方关键字 |
  | database/models | ORM 表、索引与约束 | PostgreSQL |
  | config/ | 环境、连接、日志配置 | 根目录 .env |
  | external_services/ | OpenAI SDK 调用与上游错误转换 | 可选模型服务 |
  | utils/ | 密码、Cookie、错误响应、限流、时钟 | 公共基础能力 |
  | cli.py | seed-demo、seed-elections、ensure-demo-polls、new-demo-round | 初始化服务 |

## 身份与访问控制

* 三种资格相互独立

  | 资格 | 载体 | 用途 |
  | --- | --- | --- |
  | 账户 | voting_session → auth_sessions → users | 创建投票、记名参与、本人历史、管理员角色 |
  | 浏览器凭据 | voting_guest → guest_sessions | 匿名防重复、投票写请求和密码解锁的 CSRF |
  | 私有授权 | poll_access_grants | 某浏览器在有效期内访问指定投票 |

* 权限矩阵（API 仍校验生命周期与授权）

  | 能力 | 访客 | 普通用户 | 创建者 | 管理员 |
  | --- | --- | --- | --- | --- |
  | 公共列表 | 是 | 是 | 是 | 是 |
  | 创建投票 | 否 | 是 | 是 | 是 |
  | 公开匿名投票 | 浏览器凭据 | 浏览器凭据 | 浏览器凭据 | 浏览器凭据 |
  | 记名投票 | 否 | 是 | 是 | 是 |
  | 私有参与 | 需解锁；记名另需登录 | 需解锁 | 投票仍需解锁 | 投票仍需解锁 |
  | 管理详情 | 否 | 仅自己的 | 是 | 可读全部 |
  | 修改／发布／关闭 | 否 | 仅自己的 | 是 | 仅自己的 |
  | 进行中结果 | 依投票规则 | 依投票规则 | 非草稿可读 | 非草稿可读 |
  | 审计 | 否 | 否 | 否 | 是 |
  | 浏览选举 | 公开摘要 | 公开摘要和个人状态 | 同普通用户 | 包括草稿 |
  | 登记／投选举票 | 否 | 符合阶段与资格时 | 符合阶段与资格时 | 管理权限不替代选民资格 |
  | 管理选举／审核／冻结名册 | 否 | 否 | 否 | 是 |

  私有未授权读取通常返回404，避免暴露资源；固定登记投票对已登录用户存在锁定摘要例外。管理详情可读取草稿，但通用结果端点仍拒绝草稿，不能将“管理员可看全部”解释为草稿也有参与结果。

## 生命周期与事务

* 存储状态与展示状态

  ```mermaid
  stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PUBLISHED: 创建者发布
    PUBLISHED --> CLOSED: 创建者关闭或满额
    state PUBLISHED {
      [*] --> SCHEDULED
      SCHEDULED --> OPEN: 到达 starts_at
      OPEN --> EXPIRED: 到达 ends_at
    }
  ```

  | 概念 | 值／行为 |
  | --- | --- |
  | polls.lifecycle | DRAFT / PUBLISHED / CLOSED |
  | effective_status | DRAFT / SCHEDULED / OPEN / CLOSED |
  | 自然结束 | 计算为 CLOSED，但不要求把 lifecycle 写成 CLOSED；上图 EXPIRED 只是说明标签，并非存储枚举 |
  | 显式关闭／满额 | 写 lifecycle=CLOSED、closed_at、updated_at，version递增 |
  | 草稿替换 | 锁投票行，核对创建者和 expected_version；完整替换输入 |
  | 乐观版本 | 前端提交 expected_version；过期返回40904 |

* 提交一票的事务边界

  ```mermaid
  sequenceDiagram
    participant Route as 投票接口
    participant Service as VoteService
    participant DB as PostgreSQL
    Route->>Route: 校验访客 CSRF，读取可选账户
    Route->>Service: cast_vote(context, poll_id, option_ids)
    Service->>DB: SELECT polls FOR UPDATE
    Service->>Service: 锁后取时钟，核对访问、选项、去重、上限、状态
    Service->>DB: INSERT votes + vote_selections
    opt 记名
      Service->>DB: INSERT audit_events
    end
    opt 达到上限
      Service->>DB: UPDATE polls 为 CLOSED
    end
    Service->>DB: COMMIT
    Service-->>Route: VoteReceipt
  ```

  | 保障 | 机制 |
  | --- | --- |
  | 最后名额竞争 | 同场投票行锁串行化计数与插入 |
  | 重复提交兜底 | 记名／匿名部分唯一索引 |
  | 多选不拆成多票 | 一行 votes + 多行 vote_selections |
  | 事务失败 | 回滚父票、明细及同事务状态变化 |
  | 提交确认不明 | 50302；客户端先查参与详情，不自动重投 |
  | 一致结果 | 锁定投票读取，分别统计父票数量和明细选择次数 |
  | 百分比 | 选项选择次数 / 总选择次数 ×100；两位小数；零票项保留 |
  | 并列 | winner_option_ids 包含所有最高且大于0的选项；is_final 区分进行中与结束 |

## 选举 B2 流程

* 普通投票和选举共用 `polls`、`poll_options`，由 `activity_type` 隔离；资格链与选票链在数据库结构上分离。

  ```mermaid
  flowchart LR
    Upcoming[UPCOMING 草稿或等待登记] --> Registration[REGISTRATION 登记窗口]
    Registration --> Review[REVIEW 复核与冻结名册]
    Review -->|名册冻结且到投票时间| Voting[VOTING 正式投票]
    Voting --> Results[RESULTS 结束或关闭]
  ```

  `phase` 为标准五阶段，`lifecycle` 仍保存 DRAFT／PUBLISHED／CLOSED。草稿的 phase 为 UPCOMING，但不进入公共列表。登记结束后未冻结名册，或冻结后尚未到投票时间，都为 REVIEW；超过结束时间即为 RESULTS。旧阶段字符串仅作为兼容别名解析。

  | 规则 | 实现 |
  | --- | --- |
  | 时间顺序 | `registration_starts_at < registration_ends_at < starts_at < ends_at` |
  | 创建／修改 | 仅 ADMIN；新建为 DRAFT；修改仅限草稿并校验 version |
  | 发布 | 将草稿变为 PUBLISHED，之后不可编辑候选人和时间 |
  | 身份登记 | 登录用户在登记窗口提交姓名、证件类型、签发方与号码 |
  | 证件存储 | 号码经 NFKC、大小写和空白规范化后生成独立密钥 HMAC-SHA-256 指纹；数据库只保存指纹和尾号 |
  | 资格判断 | 本地规则引擎输出 APPROVED、NEEDS_REVIEW 或 REJECTED；不连接政府、院校或第三方身份库 |
  | 人工复核 | 仅 NEEDS_REVIEW 可由 ADMIN 设为 APPROVED／REJECTED；冻结后禁止复核；PENDING 会阻止冻结但当前复核接口不接受该状态 |
  | 冻结名册 | 登记结束后显式执行；存在 PENDING／NEEDS_REVIEW 时拒绝；行锁、幂等，为每个 APPROVED 登记生成内部 UUID 凭证 |
  | 投票 | 只允许 VOTING；锁定并消费 ISSUED 凭证，同时插入一张单选选票 |
  | 票数门槛 | 可选 winning_threshold；选票提交后另行检查该候选人累计票数，达到门槛时尝试关闭选举；该检查不在选票事务内，失败只记日志，不撤销回执 |
  | 未投票 | 结束后的 `abstention_count = eligible_voter_count - ballot_count` |
  | 回执 | 返回随机 UUID；用于提交确认，不是密码学可验证回执 |

* 凭证消费和选票写入属于同一事务，但两条数据链不以外键互联。

  ```mermaid
  sequenceDiagram
    participant V as 已登录选民
    participant S as ElectionBallotService
    participant DB as PostgreSQL
    V->>S: candidate_option_id
    S->>DB: 锁选举与该用户凭证
    S->>S: 校验阶段、名册、候选人、ISSUED
    S->>DB: UPDATE credential = CONSUMED
    S->>DB: INSERT election_ballots
    S->>DB: COMMIT
    S-->>V: receipt_id + submitted_at
  ```

* 结果权限

  | 阶段／设置 | 管理员 | 已投选民 | 其他调用者 |
  | --- | --- | --- | --- |
  | 进行中，实时结果开启 | 规模与候选人票数 | 规模与候选人票数 | 403 |
  | 进行中，实时结果关闭 | 仅规模数据 | 403 | 403 |
  | 已结束 | 最终规模与票数 | 最终规模与票数 | 最终规模与票数 |

  进行中使用 `remaining_count`，结束后使用 `abstention_count`；零票不产生胜者，并列时返回全部最高票候选项。

## 智能识别、日志与运行

* 可选识别流程

  ```mermaid
  flowchart LR
    Text[用户原文] --> Guard[登录与账户CSRF / 长度校验 / 限流]
    Guard --> Parse[PollTextParseService]
    Parse --> LLM[OpenAIService]
    LLM --> Validate[输出校验 / 时间解析]
    Validate --> Fields[fields + issues + reference_time]
    Fields --> Form[前端填表并由用户确认]
  ```

  | 项目 | 当前约定 |
  | --- | --- |
  | 输入 | trim后1–10000个Unicode码点 |
  | 必有输出键 | fields.title、fields.options；无法提取时可为null／空数组 |
  | 可选候选键 | description、starts_at、ends_at、selection_mode、identity_mode、visibility、vote_limit、allow_live_results；原文未明确或不可靠时省略 |
  | 规则边界 | 不从“私有”推断“匿名”；上限须为 1–100000，否则返回 VOTE_LIMIT_INVALID；关闭实时结果可返回 false；访问密码始终手填 |
  | 时间参考 | Asia/Hong_Kong，服务提供 reference_time |
  | 数据库 | 等待模型时不持有业务数据库事务；识别不创建投票 |
  | 限额 | 每账户60秒5次、并发1次，全进程并发4次；不是跨实例分布式限流 |
  | 默认关闭 | POLL_TEXT_PARSE_ENABLED=false 时普通功能继续可用 |

* 运行与保护

  | 项目 | 当前行为 |
  | --- | --- |
  | 启动 | Alembic 迁移 → seed-demo → seed-elections → 按 DEMO_POLLS_ENABLED 补固定普通投票 → Uvicorn |
  | 存活／就绪 | /health/live 不读库；/health/ready 执行 SELECT 1 |
  | 异常 | AppError 保留HTTP与业务码；框架校验转换为 data.errors；未知错误固定50000 |
  | 请求日志 | 请求标识、归类路由、耗时；匿名参与日志不写请求标识 |
  | 隐私响应 | 会话、门禁、结果等设置 no-store；分享与私有入口设置 no-referrer |
  | 账户密码 | Argon2；原登录令牌仅进 HttpOnly Cookie |
  | 私有访问密码 | 当前可取回明文存储；不能声称全部秘密都只保存散列 |
  | 配置 | 根目录.env；模型密钥仅后端读取 |
  | 备份 | 数据卷持久化不等于备份；操作步骤见使用文档 |

* 当前实现边界

  | 项目 | 事实与影响 |
  | --- | --- |
  | 普通匿名票 | 登录提交时会写 voter_id；数据库允许并限制同账户同场匿名票唯一；账户历史查询包含这些关联票，不能与 B2 秘密选举的身份分离混为一谈 |
  | 演示初始化 | seed-demo 和 seed-elections 无条件执行；普通投票开关不能禁用样本选民；选举种子含内置演示密码，对外部署需单独处理 |
  | 已结束选举示例 | 基线 24 名合资格选民、24 张票、100% 投票率、0 弃权；种子包含特定旧示例人数修复，不是通用数据重置 |
  | 部署端口 | 当前 web 为 80:80，模板仍指向 localhost:8188；实际部署必须对齐 PUBLIC_BASE_URL、ALLOWED_ORIGINS 和端口映射 |

  详细字段和全部错误码见 [后端接口文档](backend-api.md)，DDL与索引见 [数据库设计文档](database-design.md)。本次文档整理未修改服务实现或执行数据迁移。
