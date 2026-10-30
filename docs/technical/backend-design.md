# VoteNow 后端设计

* **范围**：Python 3.12 / FastAPI 后端；核对日期 2026-10-30。入口 `backend/src/main/python/main.py:create_app`。

  [数据库设计](database-design.md) · [全部接口](backend-api.md) · [前端设计](frontend-design.md) · [详细使用](user-guide.md)

## 总体架构

* 部署与依赖

  ```mermaid
  flowchart LR
    Browser[浏览器 React] --> Web[Nginx :8188]
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
  | api/ | 27个应用操作；调用业务服务、设置Cookie与响应头 | dependencies、fileds |
  | fileds/request | 统一 data 外壳与业务输入 | Pydantic、枚举、校验函数 |
  | fileds/response | 统一信封、分页、公开／管理输出 | Pydantic |
  | fileds/context | Principal、GuestContext、PollAccessContext | 已验证身份与请求上下文 |
  | algorithms/auth_module | 注册、登录、会话恢复／注销 | users、auth_sessions、Argon2 |
  | algorithms/guest_module | 浏览器凭据创建与恢复 | guest_sessions |
  | algorithms/poll_module | 创建、替换草稿、发布、关闭、列表 | polls、poll_options、审计 |
  | algorithms/poll_access_module | 分享码解析、密码解锁、可见详情 | poll_access_grants、访客凭据 |
  | algorithms/vote_module | 一次提交、去重、限额、记名历史 | votes、vote_selections |
  | algorithms/result_module | 授权后汇总与最终状态 | 投票共享锁、父票与明细统计 |
  | algorithms/audit_module | 审计写入与管理员读取 | audit_events |
  | algorithms/poll_import_module | 文字候选字段、时间解析、问题码 | 外部提取器，不直接创建投票 |
  | algorithms/demo_module | 固定投票初始化与目录查询 | 两张登记表、普通业务服务 |
  | database/models | ORM 表、索引与约束 | PostgreSQL |
  | config/ | 环境、连接、日志配置 | 根目录 .env |
  | external_services/ | OpenAI SDK 调用与上游错误转换 | 可选模型服务 |
  | utils/ | 密码、Cookie、错误响应、限流、时钟 | 公共基础能力 |
  | cli.py | seed-demo、ensure-demo-polls、new-demo-round | 初始化服务 |

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
  | 可选候选键 | description、starts_at、ends_at、selection_mode；不可靠则省略 |
  | 不推断字段 | 匿名／公开／密码／人数上限／结果开关等不由该输出模型提供 |
  | 时间参考 | Asia/Hong_Kong，服务提供 reference_time |
  | 数据库 | 等待模型时不持有业务数据库事务；识别不创建投票 |
  | 限额 | 每账户60秒5次、并发1次，全进程并发4次；不是跨实例分布式限流 |
  | 默认关闭 | POLL_TEXT_PARSE_ENABLED=false 时普通功能继续可用 |

* 运行与保护

  | 项目 | 当前行为 |
  | --- | --- |
  | 启动 | Alembic迁移 → seed-demo → 按开关补固定投票 → Uvicorn |
  | 存活／就绪 | /health/live 不读库；/health/ready 执行 SELECT 1 |
  | 异常 | AppError 保留HTTP与业务码；框架校验转换为 data.errors；未知错误固定50000 |
  | 请求日志 | 请求标识、归类路由、耗时；匿名参与日志不写请求标识 |
  | 隐私响应 | 会话、门禁、结果等设置 no-store；分享与私有入口设置 no-referrer |
  | 账户密码 | Argon2；原登录令牌仅进 HttpOnly Cookie |
  | 私有访问密码 | 当前可取回明文存储；不能声称全部秘密都只保存散列 |
  | 配置 | 根目录.env；模型密钥仅后端读取 |
  | 备份 | 数据卷持久化不等于备份；操作步骤见使用文档 |

  详细字段和全部错误码见 [后端接口文档](backend-api.md)，DDL与索引见 [数据库设计文档](database-design.md)。本次文档整理未修改服务实现或执行数据迁移。
