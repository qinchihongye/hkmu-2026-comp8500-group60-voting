# VoteNow 后端接口文档

* **版本**：v1；核对日期 2026-10-30；覆盖当前注册的全部 **27 个应用操作**。依据路由生成的 OpenAPI、请求／响应模型、校验器及服务代码，按 `http-api-doc-writer` 模板整理。请求／响应字段集中定义，避免每个接口重复相同表格。

  [后端设计](backend-design.md) · [数据库设计](database-design.md) · [详细使用](user-guide.md)

## 接口概述

* 环境与协议

  | 项目 | 值 |
  | --- | --- |
  | Docker 前端同源地址 | `http://localhost:8188/api/v1` |
  | 本机后端地址 | `http://127.0.0.1:8000/api/v1` |
  | Vite 开发代理 | `http://localhost:5173/api/v1` → 后端 |
  | 请求／响应 | JSON；GET 无请求体；POST／PATCH 使用 Content-Type: application/json |
  | 鉴权 | Cookie，会话接口返回 CSRF；不使用 Bearer Token |
  | 框架辅助路由 | GET `/openapi.json`、`/docs`、`/docs/oauth2-redirect`、`/redoc`，本机后端可访问；不使用统一业务信封 |
  | 生产地址／接口负责人 | 待团队确认 |

* 接口索引。下表路径已包含 `/api/v1`，不要重复拼接前缀。

  | 方法 | 路径 | 权限／防护 | 成功 data 类型 | HTTP |
  | --- | --- | --- | --- | --- |
  | GET | /api/v1/health/live | 无 | HealthStatus | 200 |
  | GET | /api/v1/health/ready | 无 | HealthStatus | 200 |
  | GET | /api/v1/auth/me | 账户 Cookie | SessionPublic | 200 |
  | POST | /api/v1/auth/register | Origin | UserPublic | 201 |
  | POST | /api/v1/auth/login | Origin | SessionPublic | 200 |
  | POST | /api/v1/auth/logout | Origin + 有效会话时账户 CSRF | null | 200 |
  | POST | /api/v1/guest/context | Origin | GuestPublic | 200 |
  | GET | /api/v1/polls | 无 | Page_PollSummary_ | 200 |
  | POST | /api/v1/polls | Origin + 账户 CSRF | ManagePollDetail | 201 |
  | GET | /api/v1/polls/{poll_id} | 按投票规则 | PollDetail | 200 |
  | PATCH | /api/v1/polls/{poll_id} | Origin + 账户 CSRF + 创建者 | ManagePollDetail | 200 |
  | GET | /api/v1/me/polls | 账户 Cookie | Page_ManagePollSummary_ | 200 |
  | GET | /api/v1/me/polls/{poll_id} | 账户 Cookie + 创建者 | ManagePollDetail | 200 |
  | GET | /api/v1/me/polls/{poll_id}/share | 账户 Cookie + 创建者 | ShareLink | 200 |
  | POST | /api/v1/polls/{poll_id}/publish | Origin + 账户 CSRF + 创建者 | ManagePollDetail | 200 |
  | POST | /api/v1/polls/{poll_id}/close | Origin + 账户 CSRF + 创建者 | ManagePollDetail | 200 |
  | POST | /api/v1/polls/{poll_id}/unlock | Origin + 访客 CSRF | AccessGrantPublic | 200 |
  | GET | /api/v1/poll-import/capabilities | 账户 Cookie | PollImportCapabilities | 200 |
  | POST | /api/v1/poll-import/parse | Origin + 账户 CSRF | PollTextParseResult | 200 |
  | POST | /api/v1/polls/{poll_id}/votes | Origin + 访客 CSRF；记名另需账户 Cookie | VoteReceipt | 201 |
  | GET | /api/v1/me/votes | 账户 Cookie | Page_MyVote_ | 200 |
  | GET | /api/v1/polls/{poll_id}/results | 按投票规则 | PollResults | 200 |
  | GET | /api/v1/shares/{share_code} | 无 | ShareEntry | 200 |
  | GET | /api/v1/admin/polls | 账户 Cookie + ADMIN | Page_ManagePollSummary_ | 200 |
  | GET | /api/v1/admin/polls/{poll_id} | 账户 Cookie + ADMIN | ManagePollDetail | 200 |
  | GET | /api/v1/admin/audit-events | 账户 Cookie + ADMIN | Page_AuditEventPublic_ | 200 |
  | GET | /api/v1/demo-polls | 账户 Cookie | Page_DemoPollSummary_ | 200 |
  | GET | /api/v1/elections | 无 | Page_ElectionSummary_ | 200 |
  | GET | /api/v1/elections/{election_id} | 无 | ElectionDetail | 200 |
  | POST | /api/v1/elections/{election_id}/registrations | Origin + 账户 CSRF | VoterRegistrationSummary | 201 |
  | GET | /api/v1/me/election-registrations | 账户 Cookie | Page_VoterRegistrationSummary_ | 200 |
  | POST | /api/v1/elections/{election_id}/ballots | Origin + 账户 CSRF | BallotReceiptResponse | 201 |
  | GET | /api/v1/elections/{election_id}/results | 按实时结果权限矩阵 | ElectionResultResponse | 200 |
  | GET | /api/v1/admin/elections | 账户 Cookie + ADMIN | Page_ElectionSummary_ | 200 |
  | GET | /api/v1/admin/elections/{election_id} | 账户 Cookie + ADMIN | ElectionDetail | 200 |
  | POST | /api/v1/admin/elections | Origin + 账户 CSRF + ADMIN | ElectionDetail | 201 |
  | PATCH | /api/v1/admin/elections/{election_id} | Origin + 账户 CSRF + ADMIN | ElectionDetail | 200 |
  | POST | /api/v1/admin/elections/{election_id}/publish | Origin + 账户 CSRF + ADMIN | ElectionDetail | 200 |
  | POST | /api/v1/admin/elections/{election_id}/freeze-roster | Origin + 账户 CSRF + ADMIN | RosterFreezeResponse | 200 |
  | POST | /api/v1/admin/elections/{election_id}/close | Origin + 账户 CSRF + ADMIN | ElectionDetail | 200 |
  | GET | /api/v1/admin/elections/{election_id}/registrations | 账户 Cookie + ADMIN | Page_VoterRegistrationSummary_ | 200 |
  | POST | /api/v1/admin/elections/{election_id}/registrations/{reg_id}/review | Origin + 账户 CSRF + ADMIN | VoterRegistrationSummary | 200 |

## 请求与响应公共约定

* 外壳结构

  ```text
  RequestModel<T>                    ResponseModel<T>
  └── data: T                       ├── code: integer
                                    ├── msg: string
                                    ├── data: T | null
                                    └── request_id: string
  Page<T>
  ├── items: T[]
  ├── page: integer
  ├── page_size: integer
  └── total: integer
  ```

  | 字段／规则 | 说明 |
  | --- | --- |
  | RequestModel.data | 必填且不可为 null；空操作也提交 `{"data":{}}` |
  | 未声明请求字段 | 外层和业务模型均拒绝；不能传 creator_id、voter_id、role 等未定义字段 |
  | ResponseModel.code | 成功 0；失败为数值业务码，不能当作 HTTP 状态码 |
  | ResponseModel.msg | 给人阅读；前端业务分支应以 code 判断 |
  | ResponseModel.data | 成功数据或错误附加信息；注销成功为 null |
  | ResponseModel.request_id | 请求中间件生成；响应包含该标识，但匿名参与链路的日志不记录该标识 |
  | 分页 | items 是当前页；total 是符合筛选条件的总条数 |
  | 空值与省略 | `null` 不等于字段省略；识别结果有明确的省略规则，见 PollTextFields |
  | 时间 | ISO 8601 带时区；一般响应为 UTC，文字识别参考时区为 Asia/Hong_Kong |

* Cookie、Origin 和 CSRF

  | 项目 | 获取方式／传递方式 |
  | --- | --- |
  | voting_session | 登录响应 Set-Cookie；HttpOnly、SameSite=Lax、Path=/；Secure 取决于配置 |
  | 账户 CSRF | 登录或 GET /auth/me 的 data.csrf_token → X-CSRF-Token |
  | voting_guest | POST /guest/context 的 Set-Cookie；与账户会话分离 |
  | 访客 CSRF | POST /guest/context 的 data.csrf_token → X-CSRF-Token |
  | Origin | 所有业务写请求必需；来源在 ALLOWED_ORIGINS 或与 Host 同主机端口 |
  | 默认有效期 | 账户8小时、访客30天、私有授权60分钟；可由配置覆盖 |
  | Cookie 保存 | 浏览器 credentials: include；原令牌不在响应 JSON 中返回 |

  GET 无 CSRF。注册、登录、访客上下文仍需 Origin，但不要求已有 CSRF。投票和解锁使用访客 CSRF，即使用户已登录也不能用账户 CSRF 替代。

* 主要调用顺序

  ```mermaid
  sequenceDiagram
    participant UI as 前端
    participant API as 后端
    UI->>API: POST /guest/context + Origin
    API-->>UI: 访客 Cookie + 访客 CSRF
    opt 记名投票
      UI->>API: POST /auth/login + Origin
      API-->>UI: 账户 Cookie + 账户 CSRF
    end
    opt 私有投票
      UI->>API: GET /shares/{share_code}
      API-->>UI: poll_id 与访问要求
      UI->>API: POST /polls/{id}/unlock + 访客 CSRF
      API-->>UI: 授权到期时间
    end
    UI->>API: GET /polls/{id}
    API-->>UI: 选项、能力与参与状态
    UI->>API: POST /polls/{id}/votes + 访客 CSRF
    API-->>UI: HTTP 201 + VoteReceipt
  ```

## 各接口使用说明

* 各节参数表只列路径和查询参数；JSON body 的完整结构、默认值和示例见后续对应模型。统一错误表为全局协议，不表示每个端点都会触发所有错误；下列“主要业务错误”另列重点分支，鉴权、参数错误和数据库故障仍可能出现。

### GET /api/v1/health/live

* 只报告进程存活，不访问数据库。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 无 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = HealthStatus / null；对应模型示例加统一信封 |
  | 主要业务错误 | — |
  | 实现 | backend/src/main/python/api/health/health_get.py |

### GET /api/v1/health/ready

* 执行 SELECT 1；失败返回 50301，Retry-After: 5。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 无 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = HealthStatus / null；对应模型示例加统一信封 |
  | 主要业务错误 | 50301 |
  | 实现 | backend/src/main/python/api/health/health_get.py |

### GET /api/v1/auth/me

* 恢复账户身份和账户 CSRF，不返回原令牌。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = SessionPublic / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101 |
  | 实现 | backend/src/main/python/api/auth/auth_get.py |

### POST /api/v1/auth/register

* 注册 USER；不自动登录，不能指定 role。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin |
  | 请求 body | RequestModel<RegisterRequest>；完整示例见 RegisterRequest |
  | 成功响应 | HTTP 201；ResponseModel.data = UserPublic / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40905、42201 |
  | 实现 | backend/src/main/python/api/auth/auth_post.py |

### POST /api/v1/auth/login

* 成功写入 voting_session Cookie。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin |
  | 请求 body | RequestModel<LoginRequest>；完整示例见 LoginRequest |
  | 成功响应 | HTTP 200；ResponseModel.data = SessionPublic / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40102、42201 |
  | 实现 | backend/src/main/python/api/auth/auth_post.py |

### POST /api/v1/auth/logout

* 移除账户会话和 Cookie；过期会话无需旧 CSRF；访客 Cookie 不变。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 有效会话时账户 CSRF |
  | 请求 body | RequestModel<EmptyRequestData>；完整示例见 EmptyRequestData |
  | 成功响应 | HTTP 200；ResponseModel.data = null；对应模型示例加统一信封 |
  | 主要业务错误 | 40302 |
  | 实现 | backend/src/main/python/api/auth/auth_post.py |

### POST /api/v1/guest/context

* 恢复或建立访客上下文；有效凭据不会被替换。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin |
  | 请求 body | RequestModel<EmptyRequestData>；完整示例见 EmptyRequestData |
  | 成功响应 | HTTP 200；ResponseModel.data = GuestPublic / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40302 |
  | 实现 | backend/src/main/python/api/guest/guest_post.py |

### GET /api/v1/polls

* 只返回公开且非草稿投票；status=DRAFT 无公开结果。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 无 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = Page_PollSummary_ / null；对应模型示例加统一信封 |
  | 主要业务错误 | 42201 |
  | 实现 | backend/src/main/python/api/poll/poll_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | page | query | integer | 否 | {"minimum": 1, "default": 1} |
  | page_size | query | integer | 否 | {"maximum": 50, "minimum": 1, "default": 12} |
  | status | query | PollStatus / null | 否 | {} |
  | q | query | string / null | 否 | {} |
  | sort_by | query | string / null | 否 | {} |

### POST /api/v1/polls

* 创建 DRAFT；创建者从会话取得。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 账户 CSRF |
  | 请求 body | RequestModel<PollCreate>；完整示例见 PollCreate |
  | 成功响应 | HTTP 201；ResponseModel.data = ManagePollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40302、42201 |
  | 实现 | backend/src/main/python/api/poll/poll_post.py |

### GET /api/v1/polls/{poll_id}

* 草稿不可见；记名需登录；私有需创建者／管理员或有效授权。普通私有未授权返回 40401；登记示例对已登录用户可返回锁定摘要（无选项）。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 按投票规则 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = PollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40401 |
  | 实现 | backend/src/main/python/api/poll/poll_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### PATCH /api/v1/polls/{poll_id}

* PATCH 实际是完整替换草稿；不是局部合并。未提供新密码可保留现有明文；公开转私有或旧密码无法保留时需新密码。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 账户 CSRF + 创建者 |
  | 请求 body | RequestModel<PollUpdate>；完整示例见 PollUpdate |
  | 成功响应 | HTTP 200；ResponseModel.data = ManagePollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40301、40903、40904、42201 |
  | 实现 | backend/src/main/python/api/poll/poll_patch.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### GET /api/v1/me/polls

* 仅自己的场次，包含草稿、私有投票。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = Page_ManagePollSummary_ / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101 |
  | 实现 | backend/src/main/python/api/poll/poll_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | page | query | integer | 否 | {"minimum": 1, "default": 1} |
  | page_size | query | integer | 否 | {"maximum": 50, "minimum": 1, "default": 12} |
  | status | query | PollStatus / null | 否 | {} |
  | q | query | string / null | 否 | {} |
  | sort_by | query | string / null | 否 | {} |

### GET /api/v1/me/polls/{poll_id}

* 自己的管理详情，不包含访问密码；他人投票按不存在处理。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie + 创建者 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = ManagePollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40401 |
  | 实现 | backend/src/main/python/api/poll/poll_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### GET /api/v1/me/polls/{poll_id}/share

* 仅已发布／关闭投票；链接不含密码，access_password 为独立可空字段。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie + 创建者 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = ShareLink / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40401、40902 |
  | 实现 | backend/src/main/python/api/poll/poll_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### POST /api/v1/polls/{poll_id}/publish

* 检查 expected_version 后发布草稿；按时间进入 SCHEDULED 或 OPEN，结束时间须仍在未来。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 账户 CSRF + 创建者 |
  | 请求 body | RequestModel<VersionRequest>；完整示例见 VersionRequest |
  | 成功响应 | HTTP 200；ResponseModel.data = ManagePollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40301、40903、40904、42201 |
  | 实现 | backend/src/main/python/api/poll/poll_post.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### POST /api/v1/polls/{poll_id}/close

* 显式关闭已发布投票；重复关闭返回现状，具体版本检查以当前状态为准。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 账户 CSRF + 创建者 |
  | 请求 body | RequestModel<VersionRequest>；完整示例见 VersionRequest |
  | 成功响应 | HTTP 200；ResponseModel.data = ManagePollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40301、40902、40904 |
  | 实现 | backend/src/main/python/api/poll/poll_post.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### POST /api/v1/polls/{poll_id}/unlock

* 核对 poll_id、share_code、password，创建或延长当前浏览器授权。解锁不等于记名登录。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 访客 CSRF |
  | 请求 body | RequestModel<UnlockRequest>；完整示例见 UnlockRequest |
  | 成功响应 | HTTP 200；ResponseModel.data = AccessGrantPublic / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40304、40401、40902、42901 |
  | 实现 | backend/src/main/python/api/poll_access/poll_access_post.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### GET /api/v1/poll-import/capabilities

* 只检查配置，不调用模型；enabled 不保证上游可达。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = PollImportCapabilities / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101 |
  | 实现 | backend/src/main/python/api/poll_import/poll_import_get.py |

### POST /api/v1/poll-import/parse

* 只返回候选字段，不创建或发布投票。每账号每60秒5次、并发1次；全进程并发4次。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 账户 CSRF |
  | 请求 body | RequestModel<PollTextParseRequest>；完整示例见 PollTextParseRequest |
  | 成功响应 | HTTP 200；ResponseModel.data = PollTextParseResult / null；对应模型示例加统一信封 |
  | 主要业务错误 | 42901、50201、50303、50304、50401 |
  | 实现 | backend/src/main/python/api/poll_import/poll_import_post.py |

### POST /api/v1/polls/{poll_id}/votes

* 单选与多选都传 option_ids；私有场次需参与授权；创建者／管理员身份不替代投票所需的私有授权。满额关闭与提交同事务。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | Origin + 访客 CSRF；记名另需账户 Cookie |
  | 请求 body | RequestModel<VoteRequest>；完整示例见 VoteRequest |
  | 成功响应 | HTTP 201；ResponseModel.data = VoteReceipt / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40305、40901、40902、40906、42202、42203、50302 |
  | 实现 | backend/src/main/python/api/vote/vote_post.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### GET /api/v1/me/votes

* 仅可访问的记名记录；匿名票及未解锁的私有记录不返回。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = Page_MyVote_ / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101 |
  | 实现 | backend/src/main/python/api/vote/vote_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | page | query | integer | 否 | {"minimum": 1, "default": 1} |
  | page_size | query | integer | 否 | {"maximum": 50, "minimum": 1, "default": 12} |

### GET /api/v1/polls/{poll_id}/results

* 非草稿；创建者／管理员可读；普通参与者结束后或 OPEN 且 allow_live_results 时可读，同时仍检查记名登录与私有授权。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 按投票规则 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = PollResults / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40303、40401 |
  | 实现 | backend/src/main/python/api/result/result_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### GET /api/v1/shares/{share_code}

* 仅解析非草稿入口；不返回标题、选项、密码或结果。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 无 |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = ShareEntry / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40401 |
  | 实现 | backend/src/main/python/api/share/share_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | share_code | path | string | 是 | {} |

### GET /api/v1/admin/polls

* 全量管理列表；不获得修改他人投票的权限。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie + ADMIN |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = Page_ManagePollSummary_ / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40301 |
  | 实现 | backend/src/main/python/api/admin/admin_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | page | query | integer | 否 | {"minimum": 1, "default": 1} |
  | page_size | query | integer | 否 | {"maximum": 50, "minimum": 1, "default": 12} |
  | status | query | PollStatus / null | 否 | {} |
  | q | query | string / null | 否 | {} |
  | sort_by | query | string / null | 否 | {} |

### GET /api/v1/admin/polls/{poll_id}

* 任意场次管理详情；can_manage 仍取决于是否创建者。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie + ADMIN |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = ManagePollDetail / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40301、40401 |
  | 实现 | backend/src/main/python/api/admin/admin_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | poll_id | path | integer | 是 | {} |

### GET /api/v1/admin/audit-events

* 按投票、动作分页；不含个人选项与匿名逐票记录。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie + ADMIN |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = Page_AuditEventPublic_ / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、40301、42201 |
  | 实现 | backend/src/main/python/api/admin/admin_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | page | query | integer | 否 | {"minimum": 1, "default": 1} |
  | page_size | query | integer | 否 | {"maximum": 50, "minimum": 1, "default": 12} |
  | poll_id | query | integer / null | 否 | {} |
  | action | query | AuditAction / null | 否 | {} |

### GET /api/v1/demo-polls

* 登记目录仍保留后端接口；开关关闭返回空页，不删除场次。当前 Overview 不单设该分区。

  | 项目 | 约定 |
  | --- | --- |
  | 权限 | 账户 Cookie |
  | 请求 body | 无 |
  | 成功响应 | HTTP 200；ResponseModel.data = Page_DemoPollSummary_ / null；对应模型示例加统一信封 |
  | 主要业务错误 | 40101、42201 |
  | 实现 | backend/src/main/python/api/demo/demo_get.py |

  | 参数 | 位置 | 类型 | 必填 | 默认／范围 |
  | --- | --- | --- | --- | --- |
  | page | query | integer | 否 | {"minimum": 1, "default": 1} |
  | page_size | query | integer | 否 | {"maximum": 50, "minimum": 1, "default": 8} |
  | q | query | string / null | 否 | {} |

## 字段校验补充

* 自定义校验器规则（OpenAPI 不一定完整显示）

  | 模型／字段 | 规则 |
  | --- | --- |
  | RegisterRequest / LoginRequest.username | trim 后转小写；3–32 位 a-z、0-9、下划线 |
  | RegisterRequest.display_name | trim 后1–50字符 |
  | RegisterRequest.password | 12–128字符，不裁剪；LoginRequest 不做该长度限制 |
  | PollCreate / PollUpdate.title | trim 后1–120字符 |
  | description | trim 后最多2000字符；空白转 null |
  | starts_at / ends_at | 必须带时区；结束晚于开始；发布时结束时间仍须在未来 |
  | options | 2–10项；label trim 后1–200字符，去空白后不得重复 |
  | selection_mode | MULTIPLE 需要至少3项；不能通过单选接口重复提交 |
  | vote_limit | 严格整数1–100000或 null；不接受布尔值和数字字符串 |
  | visibility / access_password | PUBLIC 不可带非空密码；创建 PRIVATE 必须提供非空密码；密码不裁剪，不设置长度上限 |
  | PollUpdate | 完整替换；vote_limit、selection_mode、expected_version 必填；其他可选字段省略会使用模型默认值，不表示保留原值 |
  | VoteRequest.option_ids | 1–10个不同的正整数，不接受布尔值或数字字符串；服务再检查归属、单／多选数量 |
  | UnlockRequest.share_code | 非空且最多128字符；不裁剪 |
  | PollTextParseRequest.text | trim 后1–10000个Unicode码点 |
  | sort_by | created_at、starts_at、ends_at、popularity；其他值归一化为默认排序，不返回枚举校验失败 |

## 请求与响应模型

* 每个模型的结构树、字段表和 JSON 示例集中列在这里。请求模型示例已经包含 `data` 外壳；响应业务模型示例仅代表 `ResponseModel.data`，需加上 code、msg、request_id。示例 ID、时间和凭据占位文本均为文档演示值，不代表当前数据库存在对应记录。

### AccessGrantPublic

* 字段结构。

  ```text
  AccessGrantPublic
  ├── poll_id: integer
  └── expires_at: string:date-time
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | poll_id | integer | 是 | — | 被授权的投票。 |
  | expires_at | string:date-time | 是 | — | 授权到期时间，UTC。 |

  **业务数据示例**

  ```json
  {
    "poll_id": 1,
    "expires_at": "2026-11-01T02:00:00Z"
  }
  ```

### AuditAction

* 枚举。

  | 值 |
  | --- |
  | CREATE |
  | UPDATE |
  | PUBLISH |
  | CLOSE |
  | VOTE_NAMED |

### AuditEventPublic

* 字段结构。

  ```text
  AuditEventPublic
  ├── id: integer
  ├── actor_id: integer
  ├── action: string
  ├── poll_id: integer
  ├── receipt_id: string:uuid / null
  ├── created_at: string:date-time
  └── request_id: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 审计主键。 |
  | actor_id | integer | 是 | — | 执行操作的账户。 |
  | action | string | 是 | — | 管理或记名动作。 |
  | poll_id | integer | 是 | — | 相关投票。 |
  | receipt_id | string:uuid / null | 是 | — | 记名回执。管理操作可为空。 |
  | created_at | string:date-time | 是 | — | 记录时间，UTC。 |
  | request_id | string | 是 | — | 触发这次操作的请求标识。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "actor_id": 1,
    "action": "CREATE",
    "poll_id": 1,
    "receipt_id": "00000000-0000-4000-8000-000000000001",
    "created_at": "2026-11-01T02:00:00Z",
    "request_id": "<request-id>"
  }
  ```

### DemoPollSummary

* 字段结构。

  ```text
  DemoPollSummary
  ├── id: integer
  ├── title: string
  ├── identity_mode: string
  ├── visibility: string
  ├── vote_limit: integer / null
  ├── selection_mode: string
  ├── allow_live_results: boolean
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── effective_status: string
  ├── created_at: string:date-time
  ├── description: string / null
  ├── closed_at: string:date-time / null
  ├── ballot_count: integer
  ├── close_reason: string / null
  ├── fixture_key: string
  └── display_order: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 投票主键。 |
  | title | string | 是 | — | 标题。 |
  | identity_mode | string | 是 | — | NAMED 或 ANONYMOUS。 |
  | visibility | string | 是 | — | PUBLIC 或 PRIVATE。 |
  | vote_limit | integer / null | 是 | — | 整场选票份数上限。为空表示不限。 |
  | selection_mode | string | 是 | — | SINGLE 或 MULTIPLE。 |
  | allow_live_results | boolean | 是 | — | 进行中是否允许参与者查看汇总。 |
  | starts_at | string:date-time | 是 | — | 开始时间，UTC。 |
  | ends_at | string:date-time | 是 | — | 结束时间，UTC。 |
  | effective_status | string | 是 | — | 按当前时间计算出的状态。 |
  | created_at | string:date-time | 是 | — | 创建时间，UTC。 |
  | description | string / null | 否 | — | 投票说明，可空 |
  | closed_at | string:date-time / null | 否 | — | 显式或满额关闭时间，可空 |
  | ballot_count | integer | 否 | {"default": 0} | 当前父选票数量 |
  | close_reason | string / null | 否 | — | BALLOT_CAP_REACHED / CLOSED_EARLY / ENDED 或 null（以计算结果为准） |
  | fixture_key | string | 是 | — | 目录键。 |
  | display_order | integer | 是 | — | 固定展示顺序。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "title": "Friday sharing",
    "identity_mode": "ANONYMOUS",
    "visibility": "PUBLIC",
    "vote_limit": null,
    "selection_mode": "SINGLE",
    "allow_live_results": true,
    "starts_at": "2026-11-01T01:00:00Z",
    "ends_at": "2026-11-02T03:00:00Z",
    "effective_status": "OPEN",
    "created_at": "2026-11-01T02:00:00Z",
    "description": null,
    "closed_at": null,
    "ballot_count": 1,
    "close_reason": null,
    "fixture_key": "sample-fixture",
    "display_order": 1
  }
  ```

### EmptyRequestData

* 字段结构。

  ```text
  EmptyRequestData
  ```

  无业务字段，必须为空对象。

  **请求示例**

  ```json
  {
    "data": {}
  }
  ```

### FieldError

* 字段结构。

  ```text
  FieldError
  ├── field: string
  └── message: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | field | string | 是 | — | 从 data 起的字段路径，例如 data.option_ids。 |
  | message | string | 是 | — | 不含原始输入的说明。 |

  **业务数据示例**

  ```json
  {
    "field": "data.title",
    "message": "标题长度需为 1 到 120 个字符"
  }
  ```

### GuestPublic

* 字段结构。

  ```text
  GuestPublic
  ├── csrf_token: string
  └── expires_at: string:date-time
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | csrf_token | string | 是 | — | 后续访客写请求要带回的 CSRF。 |
  | expires_at | string:date-time | 是 | — | 访客凭据到期时间，UTC。 |

  **业务数据示例**

  ```json
  {
    "csrf_token": "<csrf-from-response>",
    "expires_at": "2026-11-01T02:00:00Z"
  }
  ```

### HealthStatus

* 字段结构。

  ```text
  HealthStatus
  └── status: live / ready
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | status | live / ready | 是 | — | live 表示进程存活，ready 表示数据库可查询。 |

  **业务数据示例**

  ```json
  {
    "status": "live"
  }
  ```

### IdentityMode

* 枚举。

  | 值 |
  | --- |
  | NAMED |
  | ANONYMOUS |

### LoginRequest

* 字段结构。

  ```text
  LoginRequest
  ├── username: string
  └── password: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | username | string | 是 | — | 规范化后的用户名。 |
  | password | string | 是 | — | 原密码。 |

  **请求示例**

  ```json
  {
    "data": {
      "username": "sample_user",
      "password": "<your-password>"
    }
  }
  ```

### ManagePollDetail

* 字段结构。

  ```text
  ManagePollDetail
  ├── id: integer
  ├── title: string
  ├── identity_mode: string
  ├── visibility: string
  ├── vote_limit: integer / null
  ├── selection_mode: string
  ├── allow_live_results: boolean
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── effective_status: string
  ├── created_at: string:date-time
  ├── description: string / null
  ├── closed_at: string:date-time / null
  ├── ballot_count: integer
  ├── close_reason: string / null
  ├── options: array<OptionPublic>
  ├── lifecycle: string
  ├── version: integer
  ├── creator_id: integer
  ├── has_access_password: boolean
  ├── server_time: string:date-time
  ├── can_manage: boolean
  └── can_view_results: boolean
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 投票主键。 |
  | title | string | 是 | — | 标题。 |
  | identity_mode | string | 是 | — | NAMED 或 ANONYMOUS。 |
  | visibility | string | 是 | — | PUBLIC 或 PRIVATE。 |
  | vote_limit | integer / null | 是 | — | 整场选票份数上限。为空表示不限。 |
  | selection_mode | string | 是 | — | SINGLE 或 MULTIPLE。 |
  | allow_live_results | boolean | 是 | — | 进行中是否允许参与者查看汇总。 |
  | starts_at | string:date-time | 是 | — | 开始时间，UTC。 |
  | ends_at | string:date-time | 是 | — | 结束时间，UTC。 |
  | effective_status | string | 是 | — | 按当前时间计算出的状态。 |
  | created_at | string:date-time | 是 | — | 创建时间，UTC。 |
  | description | string / null | 否 | — | 投票说明，可空 |
  | closed_at | string:date-time / null | 否 | — | 显式或满额关闭时间，可空 |
  | ballot_count | integer | 否 | {"default": 0} | 当前父选票数量 |
  | close_reason | string / null | 否 | — | BALLOT_CAP_REACHED / CLOSED_EARLY / ENDED 或 null（以计算结果为准） |
  | options | array<OptionPublic> | 是 | — | 按位置排列的选项。 |
  | lifecycle | string | 是 | — | 库存生命周期。 |
  | version | integer | 是 | — | 乐观锁版本。 |
  | creator_id | integer | 是 | — | 创建者账户。 |
  | has_access_password | boolean | 是 | — | 是否配置了访问密码。不返回密码本身。 |
  | server_time | string:date-time | 是 | — | 服务端当前时间，UTC。 |
  | can_manage | boolean | 是 | — | 调用者是否为创建者。 |
  | can_view_results | boolean | 是 | — | 管理读取始终可以看汇总。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "title": "Friday sharing",
    "identity_mode": "ANONYMOUS",
    "visibility": "PUBLIC",
    "vote_limit": null,
    "selection_mode": "SINGLE",
    "allow_live_results": true,
    "starts_at": "2026-11-01T01:00:00Z",
    "ends_at": "2026-11-02T03:00:00Z",
    "effective_status": "OPEN",
    "created_at": "2026-11-01T02:00:00Z",
    "description": null,
    "closed_at": null,
    "ballot_count": 1,
    "close_reason": null,
    "options": [
      {
        "id": 1,
        "label": "React",
        "position": 0
      }
    ],
    "lifecycle": "PUBLISHED",
    "version": 1,
    "creator_id": 1,
    "has_access_password": false,
    "server_time": "2026-11-01T02:00:00Z",
    "can_manage": false,
    "can_view_results": true
  }
  ```

### ManagePollSummary

* 字段结构。

  ```text
  ManagePollSummary
  ├── id: integer
  ├── title: string
  ├── identity_mode: string
  ├── visibility: string
  ├── vote_limit: integer / null
  ├── selection_mode: string
  ├── allow_live_results: boolean
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── effective_status: string
  ├── created_at: string:date-time
  ├── description: string / null
  ├── closed_at: string:date-time / null
  ├── ballot_count: integer
  ├── close_reason: string / null
  ├── lifecycle: string
  ├── version: integer
  └── creator_id: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 投票主键。 |
  | title | string | 是 | — | 标题。 |
  | identity_mode | string | 是 | — | NAMED 或 ANONYMOUS。 |
  | visibility | string | 是 | — | PUBLIC 或 PRIVATE。 |
  | vote_limit | integer / null | 是 | — | 整场选票份数上限。为空表示不限。 |
  | selection_mode | string | 是 | — | SINGLE 或 MULTIPLE。 |
  | allow_live_results | boolean | 是 | — | 进行中是否允许参与者查看汇总。 |
  | starts_at | string:date-time | 是 | — | 开始时间，UTC。 |
  | ends_at | string:date-time | 是 | — | 结束时间，UTC。 |
  | effective_status | string | 是 | — | 按当前时间计算出的状态。 |
  | created_at | string:date-time | 是 | — | 创建时间，UTC。 |
  | description | string / null | 否 | — | 投票说明，可空 |
  | closed_at | string:date-time / null | 否 | — | 显式或满额关闭时间，可空 |
  | ballot_count | integer | 否 | {"default": 0} | 当前父选票数量 |
  | close_reason | string / null | 否 | — | BALLOT_CAP_REACHED / CLOSED_EARLY / ENDED 或 null（以计算结果为准） |
  | lifecycle | string | 是 | — | 库存生命周期。 |
  | version | integer | 是 | — | 乐观锁版本。 |
  | creator_id | integer | 是 | — | 创建者账户。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "title": "Friday sharing",
    "identity_mode": "ANONYMOUS",
    "visibility": "PUBLIC",
    "vote_limit": null,
    "selection_mode": "SINGLE",
    "allow_live_results": true,
    "starts_at": "2026-11-01T01:00:00Z",
    "ends_at": "2026-11-02T03:00:00Z",
    "effective_status": "OPEN",
    "created_at": "2026-11-01T02:00:00Z",
    "description": null,
    "closed_at": null,
    "ballot_count": 1,
    "close_reason": null,
    "lifecycle": "PUBLISHED",
    "version": 1,
    "creator_id": 1
  }
  ```

### MyVote

* 字段结构。

  ```text
  MyVote
  ├── receipt_id: string:uuid
  ├── poll_id: integer
  ├── poll_title: string
  └── submitted_at: string:date-time
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | receipt_id | string:uuid | 是 | — | 回执编号。 |
  | poll_id | integer | 是 | — | 投票主键。 |
  | poll_title | string | 是 | — | 投票标题。 |
  | submitted_at | string:date-time | 是 | — | 提交时间，UTC。 |

  **业务数据示例**

  ```json
  {
    "receipt_id": "00000000-0000-4000-8000-000000000001",
    "poll_id": 1,
    "poll_title": "Friday sharing",
    "submitted_at": "2026-11-01T02:00:00Z"
  }
  ```

### OptionInput

* 字段结构。

  ```text
  OptionInput
  └── label: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | label | string | 是 | — | 去掉首尾空白后的选项文本。 |

  **业务数据示例**

  ```json
  {
    "label": "React"
  }
  ```

### OptionPublic

* 字段结构。

  ```text
  OptionPublic
  ├── id: integer
  ├── label: string
  └── position: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 选项主键。 |
  | label | string | 是 | — | 选项文本。 |
  | position | integer | 是 | — | 展示顺序，从 0 开始。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "label": "React",
    "position": 0
  }
  ```

### OptionResult

* 字段结构。

  ```text
  OptionResult
  ├── option_id: integer
  ├── label: string
  ├── count: integer
  └── percentage: number
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | option_id | integer | 是 | — | 选项主键。 |
  | label | string | 是 | — | 选项文本。 |
  | count | integer | 是 | — | 该选项被选中的次数。 |
  | percentage | number | 是 | {"maximum": 100.0, "minimum": 0.0} | 占全部选择次数的百分比，保留两位小数。没有选择时为 0。 |

  **业务数据示例**

  ```json
  {
    "option_id": 1,
    "label": "React",
    "count": 1,
    "percentage": 100.0
  }
  ```

### Page_AuditEventPublic_

* 字段结构。

  ```text
  Page_AuditEventPublic_
  ├── items: array<AuditEventPublic>
  ├── page: integer
  ├── page_size: integer
  └── total: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | items | array<AuditEventPublic> | 是 | — | 当前页记录。 |
  | page | integer | 是 | — | 当前页码。 |
  | page_size | integer | 是 | — | 每页条数。 |
  | total | integer | 是 | — | 符合条件的总条数。 |

  **业务数据示例**

  ```json
  {
    "items": [
      {
        "id": 1,
        "actor_id": 1,
        "action": "CREATE",
        "poll_id": 1,
        "receipt_id": "00000000-0000-4000-8000-000000000001",
        "created_at": "2026-11-01T02:00:00Z",
        "request_id": "<request-id>"
      }
    ],
    "page": 1,
    "page_size": 12,
    "total": 1
  }
  ```

### Page_DemoPollSummary_

* 字段结构。

  ```text
  Page_DemoPollSummary_
  ├── items: array<DemoPollSummary>
  ├── page: integer
  ├── page_size: integer
  └── total: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | items | array<DemoPollSummary> | 是 | — | 当前页记录。 |
  | page | integer | 是 | — | 当前页码。 |
  | page_size | integer | 是 | — | 每页条数。 |
  | total | integer | 是 | — | 符合条件的总条数。 |

  **业务数据示例**

  ```json
  {
    "items": [
      {
        "id": 1,
        "title": "Friday sharing",
        "identity_mode": "ANONYMOUS",
        "visibility": "PUBLIC",
        "vote_limit": null,
        "selection_mode": "SINGLE",
        "allow_live_results": true,
        "starts_at": "2026-11-01T01:00:00Z",
        "ends_at": "2026-11-02T03:00:00Z",
        "effective_status": "OPEN",
        "created_at": "2026-11-01T02:00:00Z",
        "description": null,
        "closed_at": null,
        "ballot_count": 1,
        "close_reason": null,
        "fixture_key": "sample-fixture",
        "display_order": 1
      }
    ],
    "page": 1,
    "page_size": 12,
    "total": 1
  }
  ```

### Page_ManagePollSummary_

* 字段结构。

  ```text
  Page_ManagePollSummary_
  ├── items: array<ManagePollSummary>
  ├── page: integer
  ├── page_size: integer
  └── total: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | items | array<ManagePollSummary> | 是 | — | 当前页记录。 |
  | page | integer | 是 | — | 当前页码。 |
  | page_size | integer | 是 | — | 每页条数。 |
  | total | integer | 是 | — | 符合条件的总条数。 |

  **业务数据示例**

  ```json
  {
    "items": [
      {
        "id": 1,
        "title": "Friday sharing",
        "identity_mode": "ANONYMOUS",
        "visibility": "PUBLIC",
        "vote_limit": null,
        "selection_mode": "SINGLE",
        "allow_live_results": true,
        "starts_at": "2026-11-01T01:00:00Z",
        "ends_at": "2026-11-02T03:00:00Z",
        "effective_status": "OPEN",
        "created_at": "2026-11-01T02:00:00Z",
        "description": null,
        "closed_at": null,
        "ballot_count": 1,
        "close_reason": null,
        "lifecycle": "PUBLISHED",
        "version": 1,
        "creator_id": 1
      }
    ],
    "page": 1,
    "page_size": 12,
    "total": 1
  }
  ```

### Page_MyVote_

* 字段结构。

  ```text
  Page_MyVote_
  ├── items: array<MyVote>
  ├── page: integer
  ├── page_size: integer
  └── total: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | items | array<MyVote> | 是 | — | 当前页记录。 |
  | page | integer | 是 | — | 当前页码。 |
  | page_size | integer | 是 | — | 每页条数。 |
  | total | integer | 是 | — | 符合条件的总条数。 |

  **业务数据示例**

  ```json
  {
    "items": [
      {
        "receipt_id": "00000000-0000-4000-8000-000000000001",
        "poll_id": 1,
        "poll_title": "Friday sharing",
        "submitted_at": "2026-11-01T02:00:00Z"
      }
    ],
    "page": 1,
    "page_size": 12,
    "total": 1
  }
  ```

### Page_PollSummary_

* 字段结构。

  ```text
  Page_PollSummary_
  ├── items: array<PollSummary>
  ├── page: integer
  ├── page_size: integer
  └── total: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | items | array<PollSummary> | 是 | — | 当前页记录。 |
  | page | integer | 是 | — | 当前页码。 |
  | page_size | integer | 是 | — | 每页条数。 |
  | total | integer | 是 | — | 符合条件的总条数。 |

  **业务数据示例**

  ```json
  {
    "items": [
      {
        "id": 1,
        "title": "Friday sharing",
        "identity_mode": "ANONYMOUS",
        "visibility": "PUBLIC",
        "vote_limit": null,
        "selection_mode": "SINGLE",
        "allow_live_results": true,
        "starts_at": "2026-11-01T01:00:00Z",
        "ends_at": "2026-11-02T03:00:00Z",
        "effective_status": "OPEN",
        "created_at": "2026-11-01T02:00:00Z",
        "description": null,
        "closed_at": null,
        "ballot_count": 1,
        "close_reason": null
      }
    ],
    "page": 1,
    "page_size": 12,
    "total": 1
  }
  ```

### ParsedOption

* 字段结构。

  ```text
  ParsedOption
  └── label: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | label | string | 是 | — | 选项文本。 |

  **业务数据示例**

  ```json
  {
    "label": "React"
  }
  ```

### PollCreate

* 字段结构。

  ```text
  PollCreate
  ├── title: string
  ├── description: string / null
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── identity_mode: IdentityMode
  ├── visibility: Visibility
  ├── access_password: string / null
  ├── vote_limit: integer / null
  ├── selection_mode: SelectionMode
  ├── allow_live_results: boolean
  └── options: array<OptionInput>
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | title | string | 是 | — | 标题。 |
  | description | string / null | 否 | — | 说明。空白会变成空值。 |
  | starts_at | string:date-time | 是 | — | 开始时间，必须带时区。 |
  | ends_at | string:date-time | 是 | — | 结束时间，必须晚于开始时间。 |
  | identity_mode | IdentityMode | 是 | — | 记名方式。 |
  | visibility | Visibility | 是 | — | 公开性。 |
  | access_password | string / null | 否 | — | 私密投票密码。公开投票不能携带。 |
  | vote_limit | integer / null | 否 | — | 整场最多接收的选票份数。为空表示不限，填写时为 1 到 100000。 |
  | selection_mode | SelectionMode | 否 | {"default": "SINGLE"} | 一份选票是单选还是多选。 |
  | allow_live_results | boolean | 否 | {"default": false} | 进行中是否允许参与者查看汇总。未提交时关闭。 |
  | options | array<OptionInput> | 是 | {"maxItems": 10, "minItems": 2} | 2 到 10 个选项。 |

  **请求示例**

  ```json
  {
    "data": {
      "title": "Friday sharing",
      "description": null,
      "starts_at": "2026-11-01T01:00:00Z",
      "ends_at": "2026-11-02T03:00:00Z",
      "identity_mode": "ANONYMOUS",
      "visibility": "PUBLIC",
      "access_password": null,
      "vote_limit": null,
      "selection_mode": "SINGLE",
      "allow_live_results": true,
      "options": [
        {
          "label": "React"
        },
        {
          "label": "PostgreSQL"
        },
        {
          "label": "Testing"
        }
      ]
    }
  }
  ```

### PollDetail

* 字段结构。

  ```text
  PollDetail
  ├── id: integer
  ├── title: string
  ├── identity_mode: string
  ├── visibility: string
  ├── vote_limit: integer / null
  ├── selection_mode: string
  ├── allow_live_results: boolean
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── effective_status: string
  ├── created_at: string:date-time
  ├── description: string / null
  ├── closed_at: string:date-time / null
  ├── options: array<OptionPublic>
  ├── has_voted: boolean
  ├── receipt: VoteReceipt / null
  ├── server_time: string:date-time
  ├── can_vote: boolean
  ├── can_manage: boolean
  ├── can_view_results: boolean
  ├── results_access_reason: string
  ├── needs_access_password: boolean
  └── passcode_entry_path: string / null
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 投票主键。 |
  | title | string | 是 | — | 标题。 |
  | identity_mode | string | 是 | — | NAMED 或 ANONYMOUS。 |
  | visibility | string | 是 | — | PUBLIC 或 PRIVATE。 |
  | vote_limit | integer / null | 是 | — | 整场选票份数上限。为空表示不限。 |
  | selection_mode | string | 是 | — | SINGLE 或 MULTIPLE。 |
  | allow_live_results | boolean | 是 | — | 进行中是否允许参与者查看汇总。 |
  | starts_at | string:date-time | 是 | — | 开始时间，UTC。 |
  | ends_at | string:date-time | 是 | — | 结束时间，UTC。 |
  | effective_status | string | 是 | — | 按当前时间计算出的状态。 |
  | created_at | string:date-time | 是 | — | 创建时间，UTC。 |
  | description | string / null | 是 | — | 说明。 |
  | closed_at | string:date-time / null | 否 | — | 显式或满额关闭时间，可空 |
  | options | array<OptionPublic> | 是 | — | 按位置排列的选项。 |
  | has_voted | boolean | 是 | — | 当前身份是否已投。 |
  | receipt | VoteReceipt / null | 否 | — | 已投时的回执。未投时为空。 |
  | server_time | string:date-time | 是 | — | 服务端当前时间，UTC。 |
  | can_vote | boolean | 是 | — | 当前身份现在能否提交。 |
  | can_manage | boolean | 是 | — | 当前账户是否为创建者。 |
  | can_view_results | boolean | 是 | — | 当前身份能否看汇总。 |
  | results_access_reason | string | 是 | — | creator、admin、closed、live 或 unavailable。 |
  | needs_access_password | boolean | 是 | — | 私密场次是否还没有这个浏览器的有效授权。 |
  | passcode_entry_path | string / null | 否 | — | 密码页路径。不含访问密码；不需要时为空。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "title": "Friday sharing",
    "identity_mode": "ANONYMOUS",
    "visibility": "PUBLIC",
    "vote_limit": null,
    "selection_mode": "SINGLE",
    "allow_live_results": true,
    "starts_at": "2026-11-01T01:00:00Z",
    "ends_at": "2026-11-02T03:00:00Z",
    "effective_status": "OPEN",
    "created_at": "2026-11-01T02:00:00Z",
    "description": null,
    "closed_at": null,
    "options": [
      {
        "id": 1,
        "label": "React",
        "position": 0
      }
    ],
    "has_voted": false,
    "receipt": null,
    "server_time": "2026-11-01T02:00:00Z",
    "can_vote": true,
    "can_manage": false,
    "can_view_results": true,
    "results_access_reason": "live",
    "needs_access_password": false,
    "passcode_entry_path": null
  }
  ```

### PollImportCapabilities

* 字段结构。

  ```text
  PollImportCapabilities
  ├── enabled: boolean
  ├── max_text_length: integer
  └── timezone: Asia/Hong_Kong
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | enabled | boolean | 是 | — | 配置是否齐全。不表示上游此刻可达。 |
  | max_text_length | integer | 否 | {"default": 10000} | 原文最多接受的 Unicode 码点数。 |
  | timezone | Asia/Hong_Kong | 否 | {"default": "Asia/Hong_Kong"} | 识别时间使用的时区。 |

  **业务数据示例**

  ```json
  {
    "enabled": false,
    "max_text_length": 10000,
    "timezone": "Asia/Hong_Kong"
  }
  ```

### PollParseIssue

* 字段结构。

  ```text
  PollParseIssue
  ├── field: title / description / options / starts_at / ends_at / selection_mode / text
  └── code: PollParseIssueCode
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | field | title / description / options / starts_at / ends_at / selection_mode / text | 是 | — | 相关字段。整段原文的问题使用 text。 |
  | code | PollParseIssueCode | 是 | — | 固定问题码。 |

  **业务数据示例**

  ```json
  {
    "field": "ends_at",
    "code": "TIME_AMBIGUOUS"
  }
  ```

### PollParseIssueCode

* 枚举。

  | 值 |
  | --- |
  | FIELD_TOO_LONG |
  | OPTION_COUNT_INVALID |
  | DUPLICATE_OPTIONS |
  | MULTIPLE_REQUIRES_THREE_OPTIONS |
  | TIME_AMBIGUOUS |
  | TIME_IN_PAST |
  | TIME_RANGE_CONFLICT |
  | MULTIPLE_POLLS |
  | NO_POLL_CONTENT |

### PollResults

* 字段结构。

  ```text
  PollResults
  ├── poll_id: integer
  ├── total_votes: integer
  ├── total_selections: integer
  ├── selection_mode: string
  ├── vote_limit: integer / null
  ├── options: array<OptionResult>
  ├── winner_option_ids: array<integer>
  ├── is_final: boolean
  ├── server_time: string:date-time
  └── poll_title: string / null
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | poll_id | integer | 是 | — | 投票主键。 |
  | total_votes | integer | 是 | — | 选票份数，等于父票行数。 |
  | total_selections | integer | 是 | — | 选择次数，等于明细行数。 |
  | selection_mode | string | 是 | — | SINGLE 或 MULTIPLE。 |
  | vote_limit | integer / null | 是 | — | 整场最多接收的选票份数。为空表示不限。 |
  | options | array<OptionResult> | 是 | — | 按位置排列的选项汇总，包含未被选中的选项。 |
  | winner_option_ids | array<integer> | 是 | — | 当前最高且选择次数大于 0 的选项。并列时全部列出。 |
  | is_final | boolean | 是 | — | 有效状态已结束时为真。进行中为假，最高项不是最终胜出者。 |
  | server_time | string:date-time | 是 | — | 取得共享锁之后的服务端时间，UTC。 |
  | poll_title | string / null | 否 | — | 投票标题；兼容字段，可空 |

  **业务数据示例**

  ```json
  {
    "poll_id": 1,
    "total_votes": 1,
    "total_selections": 1,
    "selection_mode": "SINGLE",
    "vote_limit": null,
    "options": [
      {
        "option_id": 1,
        "label": "React",
        "count": 1,
        "percentage": 100.0
      }
    ],
    "winner_option_ids": [
      1
    ],
    "is_final": false,
    "server_time": "2026-11-01T02:00:00Z",
    "poll_title": "Friday sharing"
  }
  ```

### PollStatus

* 枚举。

  | 值 |
  | --- |
  | DRAFT |
  | SCHEDULED |
  | OPEN |
  | CLOSED |

### PollSummary

* 字段结构。

  ```text
  PollSummary
  ├── id: integer
  ├── title: string
  ├── identity_mode: string
  ├── visibility: string
  ├── vote_limit: integer / null
  ├── selection_mode: string
  ├── allow_live_results: boolean
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── effective_status: string
  ├── created_at: string:date-time
  ├── description: string / null
  ├── closed_at: string:date-time / null
  ├── ballot_count: integer
  └── close_reason: string / null
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 投票主键。 |
  | title | string | 是 | — | 标题。 |
  | identity_mode | string | 是 | — | NAMED 或 ANONYMOUS。 |
  | visibility | string | 是 | — | PUBLIC 或 PRIVATE。 |
  | vote_limit | integer / null | 是 | — | 整场选票份数上限。为空表示不限。 |
  | selection_mode | string | 是 | — | SINGLE 或 MULTIPLE。 |
  | allow_live_results | boolean | 是 | — | 进行中是否允许参与者查看汇总。 |
  | starts_at | string:date-time | 是 | — | 开始时间，UTC。 |
  | ends_at | string:date-time | 是 | — | 结束时间，UTC。 |
  | effective_status | string | 是 | — | 按当前时间计算出的状态。 |
  | created_at | string:date-time | 是 | — | 创建时间，UTC。 |
  | description | string / null | 否 | — | 投票说明，可空 |
  | closed_at | string:date-time / null | 否 | — | 显式或满额关闭时间，可空 |
  | ballot_count | integer | 否 | {"default": 0} | 当前父选票数量 |
  | close_reason | string / null | 否 | — | BALLOT_CAP_REACHED / CLOSED_EARLY / ENDED 或 null（以计算结果为准） |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "title": "Friday sharing",
    "identity_mode": "ANONYMOUS",
    "visibility": "PUBLIC",
    "vote_limit": null,
    "selection_mode": "SINGLE",
    "allow_live_results": true,
    "starts_at": "2026-11-01T01:00:00Z",
    "ends_at": "2026-11-02T03:00:00Z",
    "effective_status": "OPEN",
    "created_at": "2026-11-01T02:00:00Z",
    "description": null,
    "closed_at": null,
    "ballot_count": 1,
    "close_reason": null
  }
  ```

### PollTextFields

* 字段结构。

  ```text
  PollTextFields
  ├── title: string / null
  ├── options: array<ParsedOption>
  ├── description: string / null
  ├── starts_at: string:date-time / null
  ├── ends_at: string:date-time / null
  └── selection_mode: SelectionMode / null
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | title | string / null | 是 | — | 标题。没识别到时为 null。 |
  | options | array<ParsedOption> | 是 | — | 可填入的选项。没有可应用列表时为空数组。 |
  | description | string / null | 否 | — | 说明。没有可靠内容时省略。 |
  | starts_at | string:date-time / null | 否 | — | 香港时间的开始时刻。不可靠时省略。 |
  | ends_at | string:date-time / null | 否 | — | 香港时间的结束时刻。不可靠时省略。 |
  | selection_mode | SelectionMode / null | 否 | — | 原文明确写出的选择方式。没说明时省略。 |

  `title` 和 `options` 始终出现；description、starts_at、ends_at、selection_mode 无可靠值时省略，不输出 null 来清空表单。

  **业务数据示例**

  ```json
  {
    "title": "Friday sharing",
    "options": [
      {
        "label": "React"
      },
      {
        "label": "PostgreSQL"
      }
    ]
  }
  ```

### PollTextParseRequest

* 字段结构。

  ```text
  PollTextParseRequest
  └── text: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | text | string | 是 | — | 去掉首尾空白后的原文，长度为 1 到 10000 个 Unicode 码点。 |

  **请求示例**

  ```json
  {
    "data": {
      "text": "Friday sharing: 1. React 2. PostgreSQL 3. Testing"
    }
  }
  ```

### PollTextParseResult

* 字段结构。

  ```text
  PollTextParseResult
  ├── fields: PollTextFields
  ├── issues: array<PollParseIssue>
  ├── reference_time: string:date-time
  └── timezone: Asia/Hong_Kong
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | fields | PollTextFields | 是 | — | 可填入表单的字段。 |
  | issues | array<PollParseIssue> | 是 | — | 需要人工确认的问题。 |
  | reference_time | string:date-time | 是 | — | 这次识别使用的香港时间，精确到分钟。 |
  | timezone | Asia/Hong_Kong | 否 | {"default": "Asia/Hong_Kong"} | 固定为 Asia/Hong_Kong。 |

  **业务数据示例**

  ```json
  {
    "fields": {
      "title": "Friday sharing",
      "options": [
        {
          "label": "React"
        },
        {
          "label": "PostgreSQL"
        }
      ]
    },
    "issues": [],
    "reference_time": "2026-10-29T12:00:00+08:00",
    "timezone": "Asia/Hong_Kong"
  }
  ```

### PollUpdate

* 字段结构。

  ```text
  PollUpdate
  ├── title: string
  ├── description: string / null
  ├── starts_at: string:date-time
  ├── ends_at: string:date-time
  ├── identity_mode: IdentityMode
  ├── visibility: Visibility
  ├── access_password: string / null
  ├── vote_limit: integer / null
  ├── selection_mode: SelectionMode
  ├── allow_live_results: boolean
  ├── options: array<OptionInput>
  └── expected_version: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | title | string | 是 | — | 标题。 |
  | description | string / null | 否 | — | 说明。空白会变成空值。 |
  | starts_at | string:date-time | 是 | — | 开始时间，必须带时区。 |
  | ends_at | string:date-time | 是 | — | 结束时间，必须晚于开始时间。 |
  | identity_mode | IdentityMode | 是 | — | 记名方式。 |
  | visibility | Visibility | 是 | — | 公开性。 |
  | access_password | string / null | 否 | — | 私密投票密码。公开投票不能携带。 |
  | vote_limit | integer / null | 是 | — | 整场选票份数上限。空表示不限，填写时为 1 到 100000。 |
  | selection_mode | SelectionMode | 是 | — | 一份选票是单选还是多选。 |
  | allow_live_results | boolean | 否 | {"default": false} | 进行中是否允许参与者查看汇总。未提交时关闭。 |
  | options | array<OptionInput> | 是 | {"maxItems": 10, "minItems": 2} | 2 到 10 个选项。 |
  | expected_version | integer | 是 | {"minimum": 1.0} | 客户端看到的版本。 |

  **请求示例**

  ```json
  {
    "data": {
      "title": "Friday sharing",
      "description": null,
      "starts_at": "2026-11-01T01:00:00Z",
      "ends_at": "2026-11-02T03:00:00Z",
      "identity_mode": "ANONYMOUS",
      "visibility": "PUBLIC",
      "access_password": null,
      "vote_limit": null,
      "selection_mode": "SINGLE",
      "allow_live_results": true,
      "options": [
        {
          "label": "React"
        },
        {
          "label": "PostgreSQL"
        },
        {
          "label": "Testing"
        }
      ],
      "expected_version": 1
    }
  }
  ```

### RegisterRequest

* 字段结构。

  ```text
  RegisterRequest
  ├── username: string
  ├── display_name: string
  └── password: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | username | string | 是 | — | 规范化后的用户名。 |
  | display_name | string | 是 | — | 显示名。 |
  | password | string | 是 | — | 原密码。只用于计算散列，不进入响应。 |

  **请求示例**

  ```json
  {
    "data": {
      "username": "sample_user",
      "display_name": "Sample User",
      "password": "<your-password>"
    }
  }
  ```

### SelectionMode

* 枚举。

  | 值 |
  | --- |
  | SINGLE |
  | MULTIPLE |

### SessionPublic

* 字段结构。

  ```text
  SessionPublic
  ├── user: UserPublic
  ├── csrf_token: string
  └── session_expires_at: string:date-time
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | user | UserPublic | 是 | — | 账户身份。 |
  | csrf_token | string | 是 | — | 后续账户写请求要带回的 CSRF。 |
  | session_expires_at | string:date-time | 是 | — | 会话到期时间，UTC。 |

  **业务数据示例**

  ```json
  {
    "user": {
      "id": 1,
      "username": "sample_user",
      "display_name": "Sample User",
      "role": "USER"
    },
    "csrf_token": "<csrf-from-response>",
    "session_expires_at": "2026-11-01T02:00:00Z"
  }
  ```

### ShareEntry

* 字段结构。

  ```text
  ShareEntry
  ├── poll_id: integer
  ├── identity_mode: string
  ├── visibility: string
  ├── password_required: boolean
  └── login_required: boolean
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | poll_id | integer | 是 | — | 投票主键。 |
  | identity_mode | string | 是 | — | NAMED 或 ANONYMOUS。 |
  | visibility | string | 是 | — | PUBLIC 或 PRIVATE。 |
  | password_required | boolean | 是 | — | 是否还要访问密码。 |
  | login_required | boolean | 是 | — | 是否必须登录账户。 |

  **业务数据示例**

  ```json
  {
    "poll_id": 1,
    "identity_mode": "ANONYMOUS",
    "visibility": "PUBLIC",
    "password_required": false,
    "login_required": false
  }
  ```

### ShareLink

* 字段结构。

  ```text
  ShareLink
  ├── share_url: string
  ├── requires_password: boolean
  ├── requires_login: boolean
  └── access_password: string / null
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | share_url | string | 是 | — | 对外分享地址。 |
  | requires_password | boolean | 是 | — | 参与者是否还要输入访问密码。 |
  | requires_login | boolean | 是 | — | 参与者是否必须登录。 |
  | access_password | string / null | 否 | — | 创建者可复制的访问密码。旧场次只剩散列时为空。 |

  **业务数据示例**

  ```json
  {
    "share_url": "http://localhost:8188/s/<share-code>",
    "requires_password": false,
    "requires_login": false,
    "access_password": null
  }
  ```

### UnlockRequest

* 字段结构。

  ```text
  UnlockRequest
  ├── share_code: string
  └── password: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | share_code | string | 是 | — | 这场投票的分享码。 |
  | password | string | 是 | — | 访问密码。不裁剪。 |

  **请求示例**

  ```json
  {
    "data": {
      "share_code": "<share-code>",
      "password": "<poll-passcode>"
    }
  }
  ```

### UserPublic

* 字段结构。

  ```text
  UserPublic
  ├── id: integer
  ├── username: string
  ├── display_name: string
  └── role: string
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | id | integer | 是 | — | 账户主键。 |
  | username | string | 是 | — | 规范化用户名。 |
  | display_name | string | 是 | — | 显示名。 |
  | role | string | 是 | — | USER 或 ADMIN。 |

  **业务数据示例**

  ```json
  {
    "id": 1,
    "username": "sample_user",
    "display_name": "Sample User",
    "role": "USER"
  }
  ```

### ValidationErrorData

* 字段结构。

  ```text
  ValidationErrorData
  └── errors: array<FieldError>
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | errors | array<FieldError> | 是 | — | 字段错误列表。 |

  **业务数据示例**

  ```json
  {
    "errors": [
      {
        "field": "data.title",
        "message": "标题长度需为 1 到 120 个字符"
      }
    ]
  }
  ```

### VersionRequest

* 字段结构。

  ```text
  VersionRequest
  └── expected_version: integer
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | expected_version | integer | 是 | {"minimum": 1.0} | 客户端看到的版本。 |

  **请求示例**

  ```json
  {
    "data": {
      "expected_version": 1
    }
  }
  ```

### Visibility

* 枚举。

  | 值 |
  | --- |
  | PUBLIC |
  | PRIVATE |

### VoteReceipt

* 字段结构。

  ```text
  VoteReceipt
  ├── receipt_id: string:uuid
  ├── poll_id: integer
  └── submitted_at: string:date-time
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | receipt_id | string:uuid | 是 | — | 对外回执编号。 |
  | poll_id | integer | 是 | — | 所属投票。 |
  | submitted_at | string:date-time | 是 | — | 提交时间，UTC。 |

  **业务数据示例**

  ```json
  {
    "receipt_id": "00000000-0000-4000-8000-000000000001",
    "poll_id": 1,
    "submitted_at": "2026-11-01T02:00:00Z"
  }
  ```

### VoteRequest

* 字段结构。

  ```text
  VoteRequest
  └── option_ids: array<integer>
  ```

  | 字段 | 类型／嵌套模型 | 模型必需 | 默认／约束 | 含义 |
  | --- | --- | --- | --- | --- |
  | option_ids | array<integer> | 是 | — | 本次选中的选项。必须属于路径中的那场投票，且不能重复。 |

  **请求示例**

  ```json
  {
    "data": {
      "option_ids": [
        1
      ]
    }
  }
  ```

## 错误响应与自测

* HTTP 与业务码

  | 业务码 | 名称 | HTTP | 默认说明 |
  | --- | --- | --- | --- |
  | 0 | OK | 200 | ok |
  | 40101 | UNAUTHENTICATED | 401 | 需要登录 |
  | 40102 | INVALID_CREDENTIALS | 401 | 用户名或密码错误 |
  | 40301 | FORBIDDEN | 403 | 没有权限 |
  | 40302 | CSRF_FAILED | 403 | 请求来源校验失败 |
  | 40303 | RESULTS_NOT_AVAILABLE | 403 | 结果尚未公布 |
  | 40304 | POLL_PASSWORD_INVALID | 403 | 投票密码错误 |
  | 40305 | POLL_ACCESS_REQUIRED | 403 | 需要先完成本场访问验证 |
  | 40400 | NOT_FOUND | 404 | 资源不存在 |
  | 40401 | POLL_NOT_FOUND | 404 | 投票不存在 |
  | 40500 | METHOD_NOT_ALLOWED | 405 | 请求方法不被允许 |
  | 40901 | ALREADY_VOTED | 409 | 你已参与本次投票 |
  | 40902 | POLL_NOT_OPEN | 409 | 当前不能参与这次投票 |
  | 40903 | POLL_IMMUTABLE | 409 | 已发布的投票不能修改 |
  | 40904 | STALE_POLL_VERSION | 409 | 投票已被其他人更新，请刷新后重试 |
  | 40905 | USERNAME_TAKEN | 409 | 用户名已被使用 |
  | 40906 | POLL_CAPACITY_REACHED | 409 | This poll has reached its ballot limit. |
  | 41500 | UNSUPPORTED_MEDIA_TYPE | 415 | 不支持的内容类型 |
  | 42201 | VALIDATION_ERROR | 422 | 请求参数不合法 |
  | 42202 | INVALID_OPTION | 422 | 选项不属于这次投票 |
  | 42203 | INVALID_SELECTION_COUNT | 422 | The number of selected options is not allowed. |
  | 42901 | TOO_MANY_ATTEMPTS | 429 | 尝试次数过多，请稍后再试 |
  | 50000 | INTERNAL_ERROR | 500 | 服务内部错误 |
  | 50201 | POLL_PARSE_INVALID_OUTPUT | 502 | Poll text recognition returned an unusable result. |
  | 50301 | SERVICE_UNAVAILABLE | 503 | 服务暂时不可用 |
  | 50302 | SUBMISSION_STATUS_UNKNOWN | 503 | 提交结果待确认，请查询本人参与状态 |
  | 50303 | POLL_PARSE_DISABLED | 503 | Poll text recognition is turned off. |
  | 50304 | POLL_PARSE_UNAVAILABLE | 503 | Poll text recognition is unavailable. |
  | 50401 | POLL_PARSE_TIMEOUT | 504 | Poll text recognition timed out. |

  成功 HTTP 可以为 200 或 201。字段校验错误 data 为 `{ "errors": [{ "field": "data.title", "message": "..." }] }`；其他错误通常 data=null。限速错误可带 Retry-After，应按响应等待；SUBMISSION_STATUS_UNKNOWN 表示提交结果未确认，先 GET 投票详情检查 has_voted／receipt，不能自动重投。

* 完整成功与失败信封示例

  ```json
  {"code":0,"msg":"ok","data":{"status":"live"},"request_id":"<request-id>"}
  ```

  ```json
  {"code":42201,"msg":"请求参数不合法","data":{"errors":[{"field":"data.title","message":"标题长度需为 1 到 120 个字符"}]},"request_id":"<request-id>"}
  ```

* 无写入自测（Docker 模式）

  ```bash
  curl -i http://localhost:8188/api/v1/health/live
  curl -i http://localhost:8188/api/v1/health/ready
  curl -i 'http://localhost:8188/api/v1/polls?page=1&page_size=12'
  ```

  | 操作 | 预期 |
  | --- | --- |
  | live | HTTP 200、code=0、data.status=live |
  | ready | 数据库可查询时 ready；不可查询时 HTTP 503、code=50301 |
  | polls | Page<PollSummary>；不包含私有或草稿 |
  | 未登录访问 /me/polls | HTTP 401、code=40101 |
  | 已登录写请求 CSRF 错误 | HTTP 403、code=40302 |
  | 重复提交同场选票 | HTTP 409、code=40901 |

  有状态联调使用独立测试数据，先登录或建立访客上下文，从对应响应取 CSRF 并保存 Cookie，再按各接口示例提交。不要用文档占位符替代真实会话，也不要自动重复写请求。

  | 测试依据 | 文件 |
  | --- | --- |
  | 信封与权限 | `backend/tests/api/test_response_contract.py`、`test_permissions.py` |
  | 投票和并发 | `backend/tests/integration/test_votes.py`、`test_vote_concurrency.py`、`test_vote_limits.py` |
  | 私有访问／结果 | `backend/tests/integration/test_poll_access.py`、`test_results.py` |
  | 文字识别 | `backend/tests/api/test_poll_import.py`、`backend/tests/unit/test_poll_text_import.py` |
