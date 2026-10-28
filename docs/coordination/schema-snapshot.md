# 数据库快照

* **范围。** 2026-10-28 的迁移 head 是 `6154e827a884`，文件为 `db/migrations/versions/6154e827a884_add_vote_limit_and_multi_selection.py`，上一条是明文访问密码 `f3b8a1c04e27`。空库升级、带历史票升级和安全降级演练只连 `127.0.0.1:5433` 的 `voting_test`。开发库前进到同一条，不在这里降级或清表。

* **九张业务表。** 另有 Alembic 自己的 `alembic_version`。`poll_options` 写在 `backend/src/main/python/database/models/poll.py`，没有单独的选项文件。主键是数据库生成的整数，选票回执是 UUID。业务时间是 `timestamptz`。角色、记名方式、公开性、生命周期和选择方式用 CHECK 保存字符串，不用 PostgreSQL 枚举类型。

  | 表 | 字段 |
  | --- | --- |
  | `users` | `id`, `username`, `display_name`, `password_hash`, `role`, `is_active`, `created_at` |
  | `auth_sessions` | `id`, `user_id`, `token_hash`, `csrf_token`, `created_at`, `expires_at` |
  | `guest_sessions` | `id`, `token_hash`, `csrf_token`, `created_at`, `expires_at` |
  | `poll_access_grants` | `id`, `poll_id`, `guest_session_id`, `expires_at` |
  | `polls` | `id`, `title`, `description`, `identity_mode`, `visibility`, `private_password_hash`, `private_password`, `vote_limit`, `selection_mode`, `share_code`, `lifecycle`, `starts_at`, `ends_at`, `creator_id`, `version`, `closed_at`, `created_at`, `updated_at` |
  | `poll_options` | `id`, `poll_id`, `label`, `position` |
  | `votes` | `id`, `receipt_id`, `poll_id`, `identity_mode`, `voter_id`, `anonymous_voter_hash`, `submitted_at` |
  | `vote_selections` | `vote_id`, `poll_id`, `option_id` |
  | `audit_events` | `id`, `actor_id`, `action`, `poll_id`, `receipt_id`, `created_at`, `request_id` |

* **选票与场次约束。** 记名和匿名不能出现在同一行。同一场里，同一个记名账户或同一个匿名散列只能有一票。选项和记名方式都必须属于这场投票。私密场必须有密码散列，公开场必须为空。结束时间必须晚于开始时间。两个独立连接同时提交同一张记名票时，只有一个提交成功。

  | 名称 | 作用 |
  | --- | --- |
  | `ck_votes_identity` | `NAMED` 要求 `voter_id` 非空且 `anonymous_voter_hash` 为空；`ANONYMOUS` 相反 |
  | `uq_votes_named_poll_voter` | 部分唯一索引，条件 `identity_mode = 'NAMED'`，列是 `(poll_id, voter_id)` |
  | `uq_votes_anon_poll_browser` | 部分唯一索引，条件 `identity_mode = 'ANONYMOUS'`，列是 `(poll_id, anonymous_voter_hash)` |
  | `uq_votes_poll_id_id` | `(poll_id, id)`，给选择明细提供组合外键目标 |
  | `vote_selections_pkey` | `(vote_id, option_id)`，同一份选票不能重复选同一项 |
  | `fk_vote_selections_vote` | `(poll_id, vote_id)` 指向 `votes(poll_id, id)` |
  | `fk_vote_selections_option` | `(poll_id, option_id)` 指向 `poll_options(poll_id, id)` |
  | `ix_vote_selections_poll_option` | `(poll_id, option_id)`，供本场选项聚合 |
  | `ck_polls_vote_limit` | `vote_limit` 为空，或是 1 到 2147483647 的整数 |
  | `ck_polls_selection_mode` | `selection_mode` 只能是 `SINGLE` 或 `MULTIPLE` |
  | `fk_votes_poll_mode` | `(poll_id, identity_mode)` 指向 `polls(id, identity_mode)` |
  | `uq_polls_id_identity_mode` | 给票种组合外键提供唯一目标 |
  | `uq_poll_options_poll_id_id` | 给选项组合外键提供唯一目标；同场还有 `position`、`label` 两个唯一约束 |
  | `ck_polls_visibility_password` | `PUBLIC` 的明文和散列都为空；`PRIVATE` 至少有明文或旧散列其中一个 |
  | `ck_polls_time_window` | `ends_at > starts_at` |

* **删除和匿名边界。** 业务外键都是 `ON DELETE RESTRICT`。已经有选择明细时，删除选项会命中 `fk_vote_selections_option`；删除父票前要先删明细。`votes` 不再保存 `option_id`。跨表“至少三项才能多选”、每份选择数量和容量由服务事务保证，不放进一条 CHECK。`votes` 没有访客编号、IP 或 User-Agent。`guest_sessions` 没有 `user_id`。`audit_events.receipt_id` 可空，审计表的外键只指向 `users` 和 `polls`。达额关闭只改生命周期，不写 `CLOSE` 审计。

* **自动命名的唯一约束。** 模型里没有另起名字的唯一列，在库里是 `users_username_key`、`auth_sessions_token_hash_key`、`guest_sessions_token_hash_key`、`polls_share_code_key`、`votes_receipt_id_key`。`share_code` 可空。外键列和会话过期时间还有 `ix_` 开头的普通索引。

* **迁移入口。** 在 `backend/` 运行 Alembic。`db/migrations/env.py` 优先读取 `VOTING_MIGRATION_URL`，这个值必须指向 `127.0.0.1:5433/voting_test`。降级会删掉测试库里的业务表，只用于空的测试结构。
