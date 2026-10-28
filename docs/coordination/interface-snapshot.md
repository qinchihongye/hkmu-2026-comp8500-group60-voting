# 接口快照

* **范围。** 这里记录已经实现的健康检查、统一信封、账户会话、访客上下文、投票管理、投票文字识别、分享入口、私密授权、选票提交、结果汇总、记名历史、管理员审计和前端页面。不能按本文之外的路径调用。页面路由见文末。

* **写请求。** POST 与 PATCH 的 JSON 只有顶层字段 `data`。缺少 `data`、`data` 为 null，或外层、内层出现未声明字段时，返回 HTTP 422，`code` 为 `42201`。`data.issues` 只含字段名、位置和说明，不回显提交值。GET 仍使用路径和查询参数。

* **统一响应。** 成功和失败都只有四个顶层字段。创建类成功响应保持 HTTP 201，不会被改写成 200。

  | 字段 | 含义 |
  | --- | --- |
  | `code` | 成功为 `0`，失败为下表整数 |
  | `msg` | 给人读的说明 |
  | `data` | 业务数据；无附加数据时为 `null` |
  | `request_id` | 服务端生成的请求标识 |

* **健康检查。** 前缀是 `/api/v1`。

  | 方法与路径 | 结果 |
  | --- | --- |
  | `GET /health/live` | 进程存活时 HTTP 200，`data.status` 为 `live`，不访问数据库 |
  | `GET /health/ready` | 数据库可查询时 HTTP 200，`data.status` 为 `ready`；不可用时 HTTP 503，`code` 为 `50301`，响应不含连接串或密码 |

* **Cookie。** 账户 Cookie 名是 `voting_session`，访客 Cookie 名是 `voting_guest`。两者都是 `HttpOnly`、`SameSite=Lax`、`Path=/`。只有 `COOKIE_SECURE=true` 时才加 `Secure`。原令牌只出现在 Cookie 里，响应 JSON 不包含它。数据库保存这两枚令牌的 SHA-256 十六进制散列。账户会话默认 8 小时，到达 `expires_at` 即失效，访问不会延长。访客默认 30 天。已有未过期访客再次初始化时，不更换令牌，也不延长到期时间。登录和注销也不更换有效访客。注销只清除 `voting_session`。

* **写请求来源与 CSRF。** 来源必须与 `ALLOWED_ORIGINS` 精确匹配，开发默认是 `http://localhost:5173`。缺少来源或来源不在白名单时，写请求返回 HTTP 403，`code` 为 `40302`。CSRF 头是 `X-CSRF-Token`。账户 CSRF 与访客 CSRF 不能互换。

  | 请求 | 校验 |
  | --- | --- |
  | `POST /auth/register` | 只检查来源和 JSON，不要求 CSRF，不设置账户 Cookie |
  | `POST /auth/login` | 只检查来源和 JSON。成功时设置 `voting_session` |
  | `POST /auth/logout`，会话仍有效 | 来源，以及与该会话匹配的账户 CSRF |
  | `POST /auth/logout`，会话缺失、过期、账户停用或重复注销 | 只检查来源和 JSON。仍返回 HTTP 200，`data` 为 `null`，并清除 `voting_session` |
  | `GET /auth/me` | 不检查 CSRF |
  | `POST /guest/context` | 只检查来源和 JSON。新建时设置 `voting_guest`，恢复时不写 Cookie |
  | `POST /polls`、`PATCH /polls/{poll_id}`、`POST /polls/{poll_id}/publish`、`POST /polls/{poll_id}/close` | 来源，以及与当前账户会话匹配的账户 CSRF |
  | `POST /poll-import/parse` | 来源，以及与当前账户会话匹配的账户 CSRF。匿名用户不能调用 |
  | `GET /poll-import/capabilities` | 有效账户会话，不检查 CSRF |
  | `POST /polls/{poll_id}/unlock` | 来源、未过期的 `voting_guest`，以及与该凭据匹配的访客 CSRF。还没有访客上下文时返回 HTTP 403，`code` 为 `40301`，`msg` 为 `需要先建立访客上下文` |
  | `POST /polls/{poll_id}/votes` | 来源、未过期的 `voting_guest`，以及与该凭据匹配的访客 CSRF。记名场次还要有有效账户会话。没有访客上下文时返回 HTTP 403，`code` 为 `40301`，`msg` 为 `需要先建立访客上下文` |
  | 读取投票、分享、汇总、本人列表、记名历史和管理员列表 | 不检查 CSRF |

* **账户与访客接口。** 前缀是 `/api/v1`。这些响应带 `Cache-Control: no-store`。

  | 方法与路径 | 结果 |
  | --- | --- |
  | `POST /auth/register` | HTTP 201。`data` 为 `UserPublic`。角色固定 `USER`。重名返回 HTTP 409，`code` 为 `40905` |
  | `POST /auth/login` | HTTP 200。`data` 为 `SessionPublic`，并设置 `voting_session`。未知用户、密码错误和停用账户都返回 HTTP 401，`code` 为 `40102`，说明相同 |
  | `GET /auth/me` | 会话有效时 HTTP 200，`data` 为 `SessionPublic`。缺失、过期或停用返回 HTTP 401，`code` 为 `40101` |
  | `POST /auth/logout` | HTTP 200，`code` 为 `0`，`data` 为 `null` |
  | `POST /guest/context` | HTTP 200。`data` 为 `GuestPublic`。请求体是 `{"data": {}}`。公开资料和 `guest_sessions` 都没有 `user_id` |

* **公开资料。** `Principal`、`SessionContext`、`GuestContext`、`PollAccessContext`、`LoginResult`、`GuestInitResult` 只在服务内部使用，不作为响应。

  | 模型 | 字段 |
  | --- | --- |
  | `UserPublic` | `id`、`username`、`display_name`、`role` |
  | `SessionPublic` | `user`、`csrf_token`、`session_expires_at` |
  | `GuestPublic` | `csrf_token`、`expires_at` |

* **注册与登录字段。** 用户名去掉首尾空白后转成小写，必须匹配 `^[a-z0-9_]{3,32}$`。显示名去掉首尾空白，长度为 1 到 50。注册密码长度为 12 到 128，不裁剪、不改写，只保存 Argon2 散列。登录密码不做长度校验；过短的错误密码返回 HTTP 401，`code` 为 `40102`。外层或 `data` 内出现 `role`、`user_id`、`token` 等未声明字段时返回 HTTP 422，`code` 为 `42201`，响应不回显提交值。

* **演示账户。** 在 `backend/` 执行 `uv run python -m src.main.python.cli seed-demo`。它只确保下表三个账户存在，不创建投票，也不把密码写进日志或标准输出。密码来自对应环境变量；变量为空时交互输入，输入不回显。已存在且角色相同的账户保持原密码和显示名。同名但角色不同则退出码为 1，不会改角色。

  | 用户名 | 显示名 | 角色 | 环境变量 |
  | --- | --- | --- | --- |
  | `admin` | 管理员 | `ADMIN` | `DEMO_ADMIN_PASSWORD` |
  | `demo_user` | 演示用户 | `USER` | `DEMO_USER_PASSWORD` |
  | `demo_voter` | 演示参与者 | `USER` | `DEMO_VOTER_PASSWORD` |

* **投票管理。** 前缀是 `/api/v1`。创建、修改、发布、关闭、本人列表、分享面板和管理员读取都带 `Cache-Control: no-store`。分享面板、解锁和私密详情再加 `Referrer-Policy: no-referrer`。响应不含访问密码和 `$argon2` 散列。

  创建者来自会话。他人 USER 和非创建者 ADMIN 的修改、发布、关闭返回 HTTP 403，`code` 为 `40301`。读取别人的草稿或未授权私密投票返回 HTTP 404，`code` 为 `40401`。管理员可以读全部投票，`can_manage` 仍只在本人创建时为真。

  草稿可以整份替换。已发布或已关闭后再修改或再次发布，返回 HTTP 409，`code` 为 `40903`。版本不一致返回 HTTP 409，`code` 为 `40904`。发布要求结束时间仍晚于服务端当前时间，开始时间可以已经过去；结束时间已到、关闭草稿，或读取草稿分享，都返回 HTTP 409，`code` 为 `40902`。已经显式关闭时再次关闭返回现状，不检查版本，也不再写第二条 `CLOSE` 审计。自然结束只把 `effective_status` 变为 `CLOSED`，不改 `lifecycle`，`closed_at` 仍为空。

  | 方法与路径 | 结果 |
  | --- | --- |
  | `POST /polls` | HTTP 201。`data` 为 `ManagePollDetail`，`lifecycle` 为 `DRAFT`，`version` 为 1 |
  | `PATCH /polls/{poll_id}` | HTTP 200。只替换自己的草稿。私密场次未提交新密码时保留原散列；改成公开时清除散列；公开改私密必须提交新密码 |
  | `POST /polls/{poll_id}/publish` | HTTP 200。请求体是 `{"data": {"expected_version": 版本}}`。成功后生成分享码 |
  | `POST /polls/{poll_id}/close` | HTTP 200。首次关闭使用同一个版本字段，并写入 `closed_at` |
  | `GET /me/polls` | HTTP 200。只列当前账户创建的投票，包含草稿和私密场次 |
  | `GET /me/polls/{poll_id}` | 自己的 `ManagePollDetail`。不是创建者时 HTTP 404，`code` 为 `40401` |
  | `GET /me/polls/{poll_id}/share` | 已发布或已关闭时返回 `ShareLink`。链接是 `{PUBLIC_BASE_URL}/s/{share_code}`，不含密码 |
  | `GET /admin/polls` | 管理员读取全部投票。普通用户 HTTP 403，`code` 为 `40301` |
  | `GET /admin/polls/{poll_id}` | 管理员读取任意 `ManagePollDetail`，不含密码散列 |

* **广场、分享和参与详情。** `GET /polls` 接受 `page`、`page_size`、`status`、`q`。`page` 从 1 开始，`page_size` 为 1 到 50，默认 12。排序是 `created_at DESC, id DESC`。`q` 去掉空白后最多 120 个字符，按标题做转义后的 `ILIKE`。只返回 `PUBLIC` 且非草稿的投票；`status=DRAFT` 的总数为 0。`status` 按有效状态计算，不是库存列。

  `effective_status`：草稿仍是 `DRAFT`；生命周期已关闭，或当前时间大于等于 `ends_at`，为 `CLOSED`；尚未到 `starts_at` 为 `SCHEDULED`；否则为 `OPEN`。

  `GET /shares/{share_code}` 只对已发布或已关闭的投票返回 `ShareEntry`。草稿分享码返回 HTTP 404，`code` 为 `40401`。提前关闭后旧链接仍然可以解析。

  `GET /polls/{poll_id}` 先取共享锁，再按服务端时间判断状态和已投记录。草稿返回 HTTP 404。私密投票没有创建者、管理员或未过期授权时也返回 HTTP 404，避免确认场次存在。公开记名投票在确认可见后，未登录返回 HTTP 401，`code` 为 `40101`。详情带 `Cache-Control: no-store`；私密详情同时带 `Referrer-Policy: no-referrer`。

  `can_vote` 同时要求有效状态为 `OPEN`、记名已登录或匿名已有访客、尚未投票，并且未达选票份数上限。私密场次还要有未过期授权，创建者和管理员不能跳过这一步。尚未授权时 `needs_access_password` 为真，并给出 `passcode_entry_path`（`/s/{share_code}/access`）。该路径不含访问密码；已授权、公开场次或没有分享码时为空。`can_view_results` 对创建者和管理员为真。其他已经能看这场的人，在 `CLOSED` 时为真；在 `OPEN` 且 `allow_live_results` 为真时也为真。未开始仍然不能看。`results_access_reason` 依次是 `creator`、`admin`、`closed`、`live`、`unavailable`。详情和列表带 `vote_limit`、`selection_mode`、`allow_live_results`。公开列表不返回当前票数或剩余名额。

  匿名已投状态用 `voting-anon-v1`、场次编号和原访客令牌计算 HMAC。没有访客 Cookie 时不计算，`has_voted` 为假。密钥缺失却要计算时返回 HTTP 503，`code` 为 `50301`，不把状态说成未投。

* **私密解锁。** `POST /polls/{poll_id}/unlock` 的 `data` 含 `share_code` 和 `password`。密码不能为空，不限制长度，不裁剪。成功时 HTTP 200，`data` 只有 `poll_id` 和 `expires_at`。到期时间是当前时间加 `POLL_ACCESS_TTL_MINUTES`（默认 60）与访客到期时间中较早的一个。同一浏览器再次解锁会续期，不因为唯一键失败。

  分享码错误和密码错误都返回 HTTP 403，`code` 为 `40304`，说明都是 `投票密码错误`。同一访客对同一场连续 5 次失败后返回 HTTP 429，`code` 为 `42901`，并带 `Retry-After`。锁定 5 分钟，期间不再核对密码，也不把窗口往后推。公开投票调用解锁返回 HTTP 409，`code` 为 `40902`。这些失败响应同样 `no-store`。

* **投票字段。** 标题去掉首尾空白，长度为 1 到 120。说明去掉首尾空白，全空白变成 `null`，最长 2000。选项 2 到 10 个，文本去掉首尾空白后长度为 1 到 200，同一场内区分大小写且不能重复。时间必须带时区，结束时间晚于开始时间。`PRIVATE` 创建时必须带访问密码，`PUBLIC` 不能带。未声明字段返回 HTTP 422，`code` 为 `42201`。

  | 模型 | 字段 |
  | --- | --- |
  | `PollSummary` | `id`、`title`、`identity_mode`、`visibility`、`vote_limit`、`selection_mode`、`allow_live_results`、`starts_at`、`ends_at`、`effective_status`、`created_at`。`vote_limit` 为空表示不限，`selection_mode` 默认 `SINGLE`，`allow_live_results` 默认关闭 |
  | `ManagePollSummary` | `PollSummary` 再加 `lifecycle`、`version`、`creator_id` |
  | `ManagePollDetail` | `ManagePollSummary` 的列表字段，再加 `description`、`options`、`closed_at`、`has_access_password`、`server_time`、`can_manage`、`can_view_results` |
  | `PollDetail` | `PollSummary` 再加 `description`、`options`、`has_voted`、`receipt`、`server_time`、`can_vote`、`can_manage`、`can_view_results`、`results_access_reason`、`needs_access_password`、`passcode_entry_path` |
  | `OptionPublic` | `id`、`label`、`position` |
  | `ShareEntry` | `poll_id`、`identity_mode`、`visibility`、`password_required`、`login_required` |
  | `ShareLink` | `share_url`、`requires_password`、`requires_login`、`access_password`。链接本身不含密码；只剩旧散列时 `access_password` 为空 |
  | `AccessGrantPublic` | `poll_id`、`expires_at` |
  | `VoteReceipt` | `receipt_id`、`poll_id`、`submitted_at`。成功提交时由 `POST /polls/{poll_id}/votes` 返回，也会出现在已投详情里 |
  | `PollResults` | `poll_id`、`total_votes`、`total_selections`、`selection_mode`、`vote_limit`、`options`、`winner_option_ids`、`is_final`、`server_time`。`total_votes` 是选票份数，`total_selections` 是选择次数 |
  | `OptionResult` | `option_id`、`label`、`count`、`percentage`。`count` 是该选项被选中的次数。百分比是 `count / total_selections`，四舍五入到两位小数；没有选择时为 0 |
  | `MyVote` | `receipt_id`、`poll_id`、`poll_title`、`submitted_at`。不含选项 |
  | `AuditEventPublic` | `id`、`actor_id`、`action`、`poll_id`、`receipt_id`、`created_at`、`request_id`。不含选项 |

* **选票提交。** `POST /polls/{poll_id}/votes` 的 `data` 只有 `option_ids`，是 1 到 10 个不重复的正整数。不再接受 `option_id`。单选必须恰好一项；多选可以是一项到本场全部有效选项。成功时 HTTP 201，`data` 为 `VoteReceipt`，一次提交只有一个回执，响应带 `Cache-Control: no-store`。服务先锁定投票行，再检查访问、选项、选择数量、是否已投、容量和有效状态。已投返回 HTTP 409，`code` 为 `40901`，并且先于容量和结束判断。达到上限返回 HTTP 409，`code` 为 `40906`。选项不属于本场返回 HTTP 422，`code` 为 `42202`；选项合法但数量不符合当前模式返回 HTTP 422，`code` 为 `42203`。记名票写入 `voter_id` 和一条 `VOTE_NAMED` 审计；匿名票只写本场 HMAC，忽略同时存在的账户，不写逐票审计。父票和全部明细在同一事务提交。刚好达到上限时，同一事务把生命周期写成 `CLOSED`，不另写 `CLOSE` 审计。只有 `uq_votes_named_poll_voter` 和 `uq_votes_anon_poll_browser` 映射为 HTTP 409，`code` 为 `40901`。提交前的数据库失败回滚并返回 HTTP 503，`code` 为 `50301`。COMMIT 确认丢失返回 HTTP 503，`code` 为 `50302`，不能据此断定没有入库。匿名访问日志不记录请求标识、账户、Cookie 或回执。

  私密场次没有未过期授权时，创建者和管理员投票返回 HTTP 403，`code` 为 `40305`；其他人返回 HTTP 404，`code` 为 `40401`。草稿返回 HTTP 404。未达上限但有效状态不是 `OPEN` 返回 HTTP 409，`code` 为 `40902`。创建和草稿更新可以保存 `vote_limit` 与 `selection_mode`；发布后这两项只读。少于三个有效选项不能保存或发布多选，返回 HTTP 422，`code` 为 `42201`。

* **结果、记名历史和审计。** `GET /polls/{poll_id}/results` 在同一事务里先取共享锁，再读时钟和权限。选票份数按父票计数，不连接明细；选择次数按 `vote_selections` 聚合。零选择选项保留。没有选择时没有领先项。并列时 `winner_option_ids` 包含每一个最高项。`is_final` 在有效状态为 `CLOSED` 时为真，包括达额关闭、创建者关闭和自然结束后的读取。进行中的最高项不是最终胜出者。读取不改生命周期。创建者和管理员在开放期返回 HTTP 200。其他已经能看这场的人，未结束时返回 HTTP 403，`code` 为 `40303`。私密场次没有授权时返回 HTTP 404，创建者和管理员读汇总不必先解锁。响应带 `Cache-Control: no-store` 和 `Referrer-Policy: no-referrer`。单选时份数和选择次数相等。

  `GET /me/votes` 只返回当前账户的记名记录，分页字段在 `data` 内。匿名票不出现。私密记录还要有未过期授权、创建者身份或管理员身份，否则不进入 `items`，也不计入 `total`。响应带 `Cache-Control: no-store`。

  `GET /admin/audit-events` 接受 `page`、`page_size`、`poll_id`、`action`。普通用户返回 HTTP 403，`code` 为 `40301`。排序是 `created_at DESC, id DESC`。匿名票没有对应审计。响应带 `Cache-Control: no-store` 和 `Referrer-Policy: no-referrer`。

* **演示场次。** 在 `backend/` 执行 `uv run python -m src.main.python.cli new-demo-round`。它用已有的普通用户 `demo_user` 新建四场投票：记名公开并发布、匿名公开并关闭、记名私密并排期发布、匿名私密草稿。每次都是新批次，不修改历史场次或已有票。私密密码来自 `DEMO_POLL_PASSWORD`；变量为空时交互输入，不回显，也不写入日志或分享链接。缺少 `demo_user` 或该账户不是 `USER` 时退出码为 1。

* **已登记的业务码。** 名称供对照，响应里的 `code` 使用整数。

  | 名称 | 整数 | HTTP |
  | --- | --- | --- |
  | `OK` | `0` | 200 或 201 |
  | `UNAUTHENTICATED` | `40101` | 401 |
  | `INVALID_CREDENTIALS` | `40102` | 401 |
  | `FORBIDDEN` | `40301` | 403 |
  | `CSRF_FAILED` | `40302` | 403 |
  | `RESULTS_NOT_AVAILABLE` | `40303` | 403 |
  | `POLL_PASSWORD_INVALID` | `40304` | 403 |
  | `POLL_ACCESS_REQUIRED` | `40305` | 403 |
  | `NOT_FOUND` | `40400` | 404 |
  | `POLL_NOT_FOUND` | `40401` | 404 |
  | `METHOD_NOT_ALLOWED` | `40500` | 405 |
  | `ALREADY_VOTED` | `40901` | 409 |
  | `POLL_NOT_OPEN` | `40902` | 409 |
  | `POLL_IMMUTABLE` | `40903` | 409 |
  | `STALE_POLL_VERSION` | `40904` | 409 |
  | `USERNAME_TAKEN` | `40905` | 409 |
  | `POLL_CAPACITY_REACHED` | `40906` | 409 |
  | `UNSUPPORTED_MEDIA_TYPE` | `41500` | 415 |
  | `VALIDATION_ERROR` | `42201` | 422 |
  | `INVALID_OPTION` | `42202` | 422 |
  | `INVALID_SELECTION_COUNT` | `42203` | 422 |
  | `TOO_MANY_ATTEMPTS` | `42901` | 429 |
  | `INTERNAL_ERROR` | `50000` | 500 |
  | `SERVICE_UNAVAILABLE` | `50301` | 503 |
  | `SUBMISSION_STATUS_UNKNOWN` | `50302` | 503 |
  | `POLL_PARSE_INVALID_OUTPUT` | `50201` | 502 |
  | `POLL_PARSE_DISABLED` | `50303` | 503 |
  | `POLL_PARSE_UNAVAILABLE` | `50304` | 503 |
  | `POLL_PARSE_TIMEOUT` | `50401` | 504 |

* **投票文字识别。** 前缀是 `/api/v1`。识别不创建、不发布投票，也不写业务表。响应带 `Cache-Control: no-store`。`GET /poll-import/capabilities` 不调用模型。配置关闭或缺少密钥、模型名时 HTTP 200，`data.enabled` 为 false，同时返回 `max_text_length=10000` 和 `timezone=Asia/Hong_Kong`，不返回模型名、密钥或地址。`POST /poll-import/parse` 的 `data.text` 去掉首尾空白后为 1 到 10000 个 Unicode 码点。成功时 HTTP 200，`data.fields` 至少有 `title` 和 `options`；`description`、`starts_at`、`ends_at`、`selection_mode` 没有可靠值时省略。`issues` 只含 `field` 和 `code`。时间用香港时间、分钟精度和 `+08:00`。功能关闭返回 HTTP 503，`code` 为 `50303`。上游不可用返回 HTTP 503，`code` 为 `50304`。总时限耗尽返回 HTTP 504，`code` 为 `50401`。输出无法使用返回 HTTP 502，`code` 为 `50201`。同一账户 60 秒内超过 5 次、同时超过 1 次，或全进程同时超过 4 个模型请求，返回 HTTP 429，`code` 为 `42901`，并带 `Retry-After`。这些限额只在当前进程内有效。

* **前端页面。** 页面在 `frontend/src`。Docker 入口是 `http://localhost:8188`。本机 Vite 是 `http://localhost:5173`，并把 `/api` 代理到 `http://127.0.0.1:8000`。账户 CSRF 和访客 CSRF 只留在内存，不写入 `localStorage`。POST 和 PATCH 的正文是一层 `data`，空写请求是 `{"data": {}}`。选票正文是 `{"data":{"option_ids":[...]}}`。注销允许 `data` 为 `null`。安全读取遇到网络错误或 `50301` 最多再试两次。投票、注册、发布和关闭不自动重试。写请求读到响应头后正文断开，按网络未知处理，不自动再投。单选用单选按钮，多选用复选框；确认框按界面顺序列出所选项。

  | 路径 | 页面 |
  | --- | --- |
  | `/`、`/overview` | `/` 转到登录。总览在 `/overview`，进行中公开场次和本人记名参与数使用接口里的 `total` |
  | `/login`、`/register` | 账户。登录后的 `next` 只能是本站相对路径 |
  | `/public-polls`、`/polls/:id`、`/polls/:id/results` | 公开列表、详情和结果。`/polls` 没有列表页 |
  | `/s/:shareCode`、`/s/:shareCode/access`、`/s/:shareCode/results` | 分享入口、密码页和结果。密码不进入地址 |
  | `/my-polls`、`/my-polls/new`、`/my-polls/:id`、`/my-polls/:id/edit` | 创建者工作区，需要登录 |
  | `/my-votes` | 记名历史，需要登录。匿名票不在这里 |
  | `/admin/polls`、`/admin/polls/:id`、`/admin/audit` | 管理员只读。普通用户进入 `/403` |
  | `/403`、其他路径 | 无权限和未找到 |

  私密场次没有授权时停在密码页，不先画出题目。授权已经有效但记名场次还没登录时，显示登录。提交前有确认。网络失败、响应无法解析、`50302` 或 `40901` 会用原来的账户或访客再查一次，不自动重投。进行中汇总写“当前领先”，结束后写“最终结果”。创建表单的时间按 `Asia/Hong_Kong` 生成，并带 `+08:00`。
