# 数据库快照

* **范围。** 2026-10-24 核对的是 T02 初始迁移 `cdc412846524`，文件为 `db/migrations/versions/cdc412846524_add_named_anonymous_and_access_control_.py`。空库 upgrade，以及降到初始结构后再 upgrade，只连了 `127.0.0.1:5433` 的 `voting_test`。当时库里的 Alembic 版本就是这一条。宿主机 5432 上的开发和既有数据库没有执行这次迁移。

* **八张业务表。** 另有 Alembic 自己的 `alembic_version`。`poll_options` 写在 `backend/src/main/python/database/models/poll.py`，没有单独的选项文件。主键是数据库生成的整数，选票回执是 UUID。业务时间是 `timestamptz`。角色、记名方式、公开性和生命周期用 CHECK 保存字符串，不用 PostgreSQL 枚举类型。

  | 表 | 字段 |
  | --- | --- |
  | `users` | `id`, `username`, `display_name`, `password_hash`, `role`, `is_active`, `created_at` |
  | `auth_sessions` | `id`, `user_id`, `token_hash`, `csrf_token`, `created_at`, `expires_at` |
  | `guest_sessions` | `id`, `token_hash`, `csrf_token`, `created_at`, `expires_at` |
  | `poll_access_grants` | `id`, `poll_id`, `guest_session_id`, `expires_at` |
  | `polls` | `id`, `title`, `description`, `identity_mode`, `visibility`, `private_password_hash`, `share_code`, `lifecycle`, `starts_at`, `ends_at`, `creator_id`, `version`, `closed_at`, `created_at`, `updated_at` |
  | `poll_options` | `id`, `poll_id`, `label`, `position` |
  | `votes` | `id`, `receipt_id`, `poll_id`, `identity_mode`, `voter_id`, `anonymous_voter_hash`, `option_id`, `submitted_at` |
  | `audit_events` | `id`, `actor_id`, `action`, `poll_id`, `receipt_id`, `created_at`, `request_id` |

* **选票与场次约束。** 记名和匿名不能出现在同一行。同一场里，同一个记名账户或同一个匿名散列只能有一票。选项和记名方式都必须属于这场投票。私密场必须有密码散列，公开场必须为空。结束时间必须晚于开始时间。两个独立连接同时提交同一张记名票时，只有一个提交成功。

  | 名称 | 作用 |
  | --- | --- |
  | `ck_votes_identity` | `NAMED` 要求 `voter_id` 非空且 `anonymous_voter_hash` 为空；`ANONYMOUS` 相反 |
  | `uq_votes_named_poll_voter` | 部分唯一索引，条件 `identity_mode = 'NAMED'`，列是 `(poll_id, voter_id)` |
  | `uq_votes_anon_poll_browser` | 部分唯一索引，条件 `identity_mode = 'ANONYMOUS'`，列是 `(poll_id, anonymous_voter_hash)` |
  | `fk_votes_poll_option` | `(poll_id, option_id)` 指向 `poll_options(poll_id, id)` |
  | `fk_votes_poll_mode` | `(poll_id, identity_mode)` 指向 `polls(id, identity_mode)` |
  | `uq_polls_id_identity_mode` | 给票种组合外键提供唯一目标 |
  | `uq_poll_options_poll_id_id` | 给选项组合外键提供唯一目标；同场还有 `position`、`label` 两个唯一约束 |
  | `ck_polls_visibility_password` | `PRIVATE` 的密码散列非空，`PUBLIC` 的密码散列为空 |
  | `ck_polls_time_window` | `ends_at > starts_at` |

* **删除和匿名边界。** 业务外键都是 `ON DELETE RESTRICT`。已经有票时，删除选项会命中 `fk_votes_poll_option`，删除投票也会被外键拒绝。`votes` 只有上表那些列，没有访客编号、IP 或 User-Agent。`guest_sessions` 没有 `user_id`。`audit_events.receipt_id` 可空，审计表的外键只指向 `users` 和 `polls`。

* **自动命名的唯一约束。** 模型里没有另起名字的唯一列，在库里是 `users_username_key`、`auth_sessions_token_hash_key`、`guest_sessions_token_hash_key`、`polls_share_code_key`、`votes_receipt_id_key`。`share_code` 可空。外键列和会话过期时间还有 `ix_` 开头的普通索引。

* **迁移入口。** 在 `backend/` 运行 Alembic。`db/migrations/env.py` 优先读取 `VOTING_MIGRATION_URL`，这个值必须指向 `127.0.0.1:5433/voting_test`。降级会删掉测试库里的业务表，只用于空的测试结构。
