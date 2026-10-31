# VoteNow 数据库设计

* **范围**：PostgreSQL 17；18 张应用表 + 1 张 Alembic 版本表。依据当前 ORM 和迁移链，核对日期 2026-10-31。本文是结构设计文档，不包含运行库中的业务数据或凭据。

  [后端设计](backend-design.md) · [接口文档](backend-api.md) · [详细使用](user-guide.md)

## 数据关系

* 核心关系；图中连线表示外键，不表示客户端获得直接读取权限。

  ```mermaid
  erDiagram
    users ||--o{ auth_sessions : owns
    users ||--o{ polls : creates
    users o|--o{ votes : named_voter
    users ||--o{ audit_events : acts
    users ||--o| demo_fixture_users : registered
    polls ||--o{ poll_options : contains
    polls ||--o{ votes : receives
    votes ||--|{ vote_selections : selects
    poll_options ||--o{ vote_selections : chosen
    polls ||--o{ poll_access_grants : grants
    guest_sessions ||--o{ poll_access_grants : holds
    polls ||--o{ audit_events : recorded
    polls ||--o| demo_poll_fixtures : registered
    polls ||--o| election_configs : configures
    poll_options ||--o| election_candidates : extends
    users ||--o{ voter_identities : owns
    polls ||--o{ election_registrations : receives
    users ||--o{ election_registrations : submits
    voter_identities ||--o{ election_registrations : supports
    election_registrations ||--o{ eligibility_review_events : records
    election_registrations ||--o| election_voter_credentials : issues
    election_candidates ||--o{ election_ballots : receives
  ```

  每份选票至少一条明细由业务事务保证；ER 图中的该基数不是数据库单独强制的约束。`alembic_version` 无业务外键。

## 数据表总览

* 用途与主键

  | 表 | 用途 | 主键 |
  | --- | --- | --- |
  | guest_sessions | 独立浏览器凭据与访客 CSRF，不关联账户 | id |
  | users | 注册账户、角色和账户密码散列 | id |
  | auth_sessions | 账户登录会话与账户 CSRF | id |
  | demo_fixture_users | 初始化账户目录与真实账户映射 | fixture_key |
  | polls | 投票规则、生命周期、时间、创建者和私有访问密码 | id |
  | audit_events | 管理动作和记名投票审计，不保存个人选项 | id |
  | demo_poll_fixtures | 固定投票目录与真实投票映射，支持幂等补齐 | fixture_key |
  | poll_access_grants | 浏览器对某场私有投票的短期授权 | id |
  | poll_options | 投票选项及排序 | id |
  | votes | 一次提交的一份父选票、身份去重信息和回执 | id |
  | vote_selections | 选票选择明细，支持一票多选 | vote_id, option_id |
  | election_configs | 选举配置：登记窗口、名册冻结与合资格人数 | poll_id |
  | election_candidates | 选举候选人拓展表：候选人代号与政纲 | poll_option_id |
  | voter_identities | 选民不可变证件版本（独立密钥 HMAC-SHA-256 指纹，不持久化明文号码） | id |
  | election_registrations | 选民登记快照、模型评分与审核结果 | id |
  | eligibility_review_events | 资格审核不可变事件流（只追加不更新） | id |
  | election_voter_credentials | 内部一次性投票资格凭证（ISSUED -> CONSUMED 单向） | id |
  | election_ballots | 身份分离的选举选票（无 user_id、登记 ID、凭据 ID 或网络追踪字段） | id |
  | alembic_version | 记录已应用迁移版本 | version_num |

## 字段与建表语句

* 下列 SQL 是按当前最终模型整理的空库结构，包含字段、约束及独立索引；按章节顺序可满足外键依赖。`SERIAL` 自动创建序列，唯一约束／主键由 PostgreSQL 自动建立索引，不另重复创建。

  正常安装必须执行 `alembic upgrade head`，不要在已经迁移的库里重复执行这些 CREATE 语句，也不要将建表快照作为旧库升级脚本。历史数据回填仍由迁移负责。`effective_status`、`ballot_count`、`close_reason` 和汇总百分比是计算结果，不是 `polls` 的存储列。

### guest_sessions

* 独立浏览器凭据与访客 CSRF，不关联账户。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | activity_type | VARCHAR(16) | 否 | POLL | POLL 或 ELECTION，隔离普通投票与选举。 |
  | token_hash | VARCHAR(64) | 否 | — | 访客 token 的散列。 |
  | csrf_token | VARCHAR(128) | 否 | — | 本访客凭据的写请求校验值。 |
  | created_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 创建时间，UTC。 |
  | expires_at | TIMESTAMP WITH TIME ZONE | 否 | — | 到期时间，UTC。 |

  ```sql
  CREATE TABLE guest_sessions (
  	id SERIAL NOT NULL, 
  	token_hash VARCHAR(64) NOT NULL, 
  	csrf_token VARCHAR(128) NOT NULL, 
  	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
  	PRIMARY KEY (id), 
  	UNIQUE (token_hash)
  );
  CREATE INDEX ix_guest_sessions_expires_at ON guest_sessions (expires_at);
  ```

### users

* 注册账户、角色和账户密码散列。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | username | VARCHAR(32) | 否 | — | 小写规范化后的唯一用户名。 |
  | display_name | VARCHAR(50) | 否 | — | 显示名。 |
  | password_hash | VARCHAR(255) | 否 | — | 密码散列。 |
  | role | VARCHAR(16) | 否 | — | USER 或 ADMIN。 |
  | is_active | BOOLEAN | 否 | true | 停用后不能继续通过鉴权。 |
  | created_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 创建时间，UTC。 |

  ```sql
  CREATE TABLE users (
  	id SERIAL NOT NULL, 
  	username VARCHAR(32) NOT NULL, 
  	display_name VARCHAR(50) NOT NULL, 
  	password_hash VARCHAR(255) NOT NULL, 
  	role VARCHAR(16) NOT NULL, 
  	is_active BOOLEAN DEFAULT 'true' NOT NULL, 
  	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	PRIMARY KEY (id), 
  	CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN')), 
  	CONSTRAINT ck_users_username CHECK (username ~ '^[a-z0-9_]{3,32}$'), 
  	CONSTRAINT ck_users_display_name CHECK (char_length(display_name) BETWEEN 1 AND 50), 
  	UNIQUE (username)
  );
  ```

### auth_sessions

* 账户登录会话与账户 CSRF。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | user_id | INTEGER | 否 | — | 所属账户。 |
  | token_hash | VARCHAR(64) | 否 | — | 会话 token 的 SHA-256 散列。 |
  | csrf_token | VARCHAR(128) | 否 | — | 本会话的写请求校验值。 |
  | created_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 创建时间，UTC。 |
  | expires_at | TIMESTAMP WITH TIME ZONE | 否 | — | 到期时间，UTC。 |

  ```sql
  CREATE TABLE auth_sessions (
  	id SERIAL NOT NULL, 
  	user_id INTEGER NOT NULL, 
  	token_hash VARCHAR(64) NOT NULL, 
  	csrf_token VARCHAR(128) NOT NULL, 
  	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
  	PRIMARY KEY (id), 
  	CONSTRAINT fk_auth_sessions_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT, 
  	UNIQUE (token_hash)
  );
  CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at);
  CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);
  ```

### demo_fixture_users

* 初始化账户目录与真实账户映射。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | fixture_key | VARCHAR(64) | 否 | — | 目录中的账户键。 |
  | user_id | INTEGER | 否 | — | 对应账户。唯一，删除账户时限制。 |

  ```sql
  CREATE TABLE demo_fixture_users (
  	fixture_key VARCHAR(64) NOT NULL, 
  	user_id INTEGER NOT NULL, 
  	PRIMARY KEY (fixture_key), 
  	CONSTRAINT uq_demo_fixture_users_user_id UNIQUE (user_id), 
  	CONSTRAINT fk_demo_fixture_users_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT
  );
  ```

### polls

* 投票规则、生命周期、时间、创建者和私有访问密码。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | title | VARCHAR(120) | 否 | — | 标题。 |
  | description | TEXT | 是 | — | 说明，可空。 |
  | identity_mode | VARCHAR(16) | 否 | — | NAMED 或 ANONYMOUS。 |
  | visibility | VARCHAR(16) | 否 | — | PUBLIC 或 PRIVATE。 |
  | private_password_hash | VARCHAR(255) | 是 | — | 旧私密投票留下的密码散列。新投票不再写入。 |
  | private_password | TEXT | 是 | — | 私密投票的访问密码明文。公开投票必须为空。 |
  | vote_limit | INTEGER | 是 | — | 整场最多接收的选票份数。为空表示不限，填写时为 1 到 100000。 |
  | selection_mode | VARCHAR(16) | 否 | SINGLE | SINGLE 或 MULTIPLE。 |
  | allow_live_results | BOOLEAN | 否 | false | 进行中是否允许参与者查看汇总。结束后仍可查看。 |
  | share_code | VARCHAR(128) | 是 | — | 分享定位码。草稿可为空，有值时唯一。 |
  | lifecycle | VARCHAR(16) | 否 | — | DRAFT、PUBLISHED 或 CLOSED。 |
  | starts_at | TIMESTAMP WITH TIME ZONE | 否 | — | 开始时间，UTC。结束时间必须更晚。 |
  | ends_at | TIMESTAMP WITH TIME ZONE | 否 | — | 结束时间，UTC。 |
  | creator_id | INTEGER | 否 | — | 创建者账户。 |
  | version | INTEGER | 否 | 1 | 草稿乐观锁版本。 |
  | closed_at | TIMESTAMP WITH TIME ZONE | 是 | — | 创建者显式关闭的时间。自然结束保持为空。 |
  | created_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 创建时间，UTC。 |
  | updated_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 更新时间，UTC。 |

  ```sql
  CREATE TABLE polls (
  	id SERIAL NOT NULL, 
	activity_type VARCHAR(16) DEFAULT 'POLL' NOT NULL,
  	title VARCHAR(120) NOT NULL, 
  	description TEXT, 
  	identity_mode VARCHAR(16) NOT NULL, 
  	visibility VARCHAR(16) NOT NULL, 
  	private_password_hash VARCHAR(255), 
  	private_password TEXT, 
  	vote_limit INTEGER, 
  	selection_mode VARCHAR(16) DEFAULT 'SINGLE' NOT NULL, 
  	allow_live_results BOOLEAN DEFAULT 'false' NOT NULL, 
  	share_code VARCHAR(128), 
  	lifecycle VARCHAR(16) NOT NULL, 
  	starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
  	ends_at TIMESTAMP WITH TIME ZONE NOT NULL, 
  	creator_id INTEGER NOT NULL, 
  	version INTEGER DEFAULT '1' NOT NULL, 
  	closed_at TIMESTAMP WITH TIME ZONE, 
  	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	PRIMARY KEY (id), 
  	CONSTRAINT uq_polls_id_identity_mode UNIQUE (id, identity_mode), 
	CONSTRAINT ck_polls_activity_type CHECK (activity_type IN ('POLL', 'ELECTION')),
  	CONSTRAINT ck_polls_identity_mode CHECK (identity_mode IN ('NAMED', 'ANONYMOUS')), 
  	CONSTRAINT ck_polls_visibility CHECK (visibility IN ('PUBLIC', 'PRIVATE')), 
  	CONSTRAINT ck_polls_lifecycle CHECK (lifecycle IN ('DRAFT', 'PUBLISHED', 'CLOSED')), 
  	CONSTRAINT ck_polls_visibility_password CHECK ((visibility = 'PUBLIC' AND private_password_hash IS NULL AND private_password IS NULL) OR (visibility = 'PRIVATE' AND (private_password IS NOT NULL OR private_password_hash IS NOT NULL))), 
  	CONSTRAINT ck_polls_time_window CHECK (ends_at > starts_at), 
  	CONSTRAINT ck_polls_title CHECK (char_length(title) BETWEEN 1 AND 120), 
  	CONSTRAINT ck_polls_description CHECK (description IS NULL OR char_length(description) <= 2000), 
  	CONSTRAINT ck_polls_version CHECK (version >= 1), 
  	CONSTRAINT ck_polls_vote_limit CHECK (vote_limit IS NULL OR (vote_limit >= 1 AND vote_limit <= 100000)), 
  	CONSTRAINT ck_polls_selection_mode CHECK (selection_mode IN ('SINGLE', 'MULTIPLE')), 
  	UNIQUE (share_code), 
  	CONSTRAINT fk_polls_creator_id_users FOREIGN KEY(creator_id) REFERENCES users (id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_polls_creator_id ON polls (creator_id);
  CREATE INDEX ix_polls_activity_lifecycle_starts ON polls (activity_type, lifecycle, starts_at);
  ```

### audit_events

* 管理动作和记名投票审计，不保存个人选项。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | actor_id | INTEGER | 否 | — | 执行操作的账户。 |
  | action | VARCHAR(32) | 否 | — | CREATE、UPDATE、PUBLISH、CLOSE、VOTE_NAMED 或 FREEZE_ROSTER。 |
  | poll_id | INTEGER | 否 | — | 相关投票。 |
  | receipt_id | UUID | 是 | — | 记名选票回执。管理操作可为空。 |
  | created_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 记录时间，UTC。 |
  | request_id | VARCHAR(64) | 否 | — | 触发这次操作的请求标识。 |

  ```sql
  CREATE TABLE audit_events (
  	id SERIAL NOT NULL, 
  	actor_id INTEGER NOT NULL, 
  	action VARCHAR(32) NOT NULL, 
  	poll_id INTEGER NOT NULL, 
  	receipt_id UUID, 
  	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	request_id VARCHAR(64) NOT NULL, 
  	PRIMARY KEY (id), 
	CONSTRAINT ck_audit_events_action CHECK (action IN ('CREATE', 'UPDATE', 'PUBLISH', 'CLOSE', 'VOTE_NAMED', 'FREEZE_ROSTER')),
  	CONSTRAINT fk_audit_events_actor_id_users FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE RESTRICT, 
  	CONSTRAINT fk_audit_events_poll_id_polls FOREIGN KEY(poll_id) REFERENCES polls (id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_audit_events_actor_id ON audit_events (actor_id);
  CREATE INDEX ix_audit_events_poll_id ON audit_events (poll_id);
  ```

### demo_poll_fixtures

* 固定投票目录与真实投票映射，支持幂等补齐。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | fixture_key | VARCHAR(64) | 否 | — | 目录键，例如 named-public-01。 |
  | poll_id | INTEGER | 否 | — | 对应投票。唯一，删除投票时限制。 |
  | dataset_version | VARCHAR(32) | 否 | — | 生成该行时的目录版本。 |
  | display_order | INTEGER | 否 | — | Overview 中的固定顺序。 |
  | initialized_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 首次写入该行的 UTC 时间。 |

  ```sql
  CREATE TABLE demo_poll_fixtures (
  	fixture_key VARCHAR(64) NOT NULL, 
  	poll_id INTEGER NOT NULL, 
  	dataset_version VARCHAR(32) NOT NULL, 
  	display_order INTEGER NOT NULL, 
  	initialized_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	PRIMARY KEY (fixture_key), 
  	CONSTRAINT uq_demo_poll_fixtures_poll_id UNIQUE (poll_id), 
  	CONSTRAINT fk_demo_poll_fixtures_poll_id_polls FOREIGN KEY(poll_id) REFERENCES polls (id) ON DELETE RESTRICT, 
  	CONSTRAINT uq_demo_poll_fixtures_display_order UNIQUE (display_order)
  );
  ```

### poll_access_grants

* 浏览器对某场私有投票的短期授权。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | poll_id | INTEGER | 否 | — | 被授权的投票。 |
  | guest_session_id | INTEGER | 否 | — | 被授权的浏览器凭据。 |
  | expires_at | TIMESTAMP WITH TIME ZONE | 否 | — | 授权到期时间，UTC。 |

  ```sql
  CREATE TABLE poll_access_grants (
  	id SERIAL NOT NULL, 
  	poll_id INTEGER NOT NULL, 
  	guest_session_id INTEGER NOT NULL, 
  	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
  	PRIMARY KEY (id), 
  	CONSTRAINT uq_poll_access_grants_poll_guest UNIQUE (poll_id, guest_session_id), 
  	CONSTRAINT fk_poll_access_grants_poll_id_polls FOREIGN KEY(poll_id) REFERENCES polls (id) ON DELETE RESTRICT, 
  	CONSTRAINT fk_poll_access_grants_guest_session_id_guest_sessions FOREIGN KEY(guest_session_id) REFERENCES guest_sessions (id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_poll_access_grants_guest_session_id ON poll_access_grants (guest_session_id);
  ```

### poll_options

* 投票选项及排序。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | poll_id | INTEGER | 否 | — | 所属投票。 |
  | label | VARCHAR(200) | 否 | — | 选项文本。 |
  | position | INTEGER | 否 | — | 展示顺序。 |

  ```sql
  CREATE TABLE poll_options (
  	id SERIAL NOT NULL, 
  	poll_id INTEGER NOT NULL, 
  	label VARCHAR(200) NOT NULL, 
  	position INTEGER NOT NULL, 
  	PRIMARY KEY (id), 
  	CONSTRAINT uq_poll_options_poll_id_id UNIQUE (poll_id, id), 
  	CONSTRAINT uq_poll_options_poll_id_position UNIQUE (poll_id, position), 
  	CONSTRAINT uq_poll_options_poll_id_label UNIQUE (poll_id, label), 
  	CONSTRAINT ck_poll_options_label CHECK (char_length(label) BETWEEN 1 AND 200), 
  	CONSTRAINT ck_poll_options_position CHECK (position >= 0), 
  	CONSTRAINT fk_poll_options_poll_id_polls FOREIGN KEY(poll_id) REFERENCES polls (id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_poll_options_poll_id ON poll_options (poll_id);
  ```

### votes

* 一次提交的一份父选票、身份去重信息和回执。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | id | INTEGER | 否 | — | 数据库生成的主键。 |
  | receipt_id | UUID | 否 | — | 对外回执。 |
  | poll_id | INTEGER | 否 | — | 所属投票。 |
  | identity_mode | VARCHAR(16) | 否 | — | 必须与所属投票的记名方式一致。 |
  | voter_id | INTEGER | 是 | — | 记名投票的账户。匿名投票为空。 |
  | anonymous_voter_hash | VARCHAR(64) | 是 | — | 本场浏览器凭据散列。记名投票为空。 |
  | submitted_at | TIMESTAMP WITH TIME ZONE | 否 | now() | 提交时间，UTC。 |

  ```sql
  CREATE TABLE votes (
  	id SERIAL NOT NULL, 
  	receipt_id UUID NOT NULL, 
  	poll_id INTEGER NOT NULL, 
  	identity_mode VARCHAR(16) NOT NULL, 
  	voter_id INTEGER, 
  	anonymous_voter_hash VARCHAR(64), 
  	submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
  	PRIMARY KEY (id), 
  	CONSTRAINT ck_votes_identity CHECK ((identity_mode = 'NAMED' AND voter_id IS NOT NULL AND anonymous_voter_hash IS NULL) OR (identity_mode = 'ANONYMOUS' AND voter_id IS NULL AND anonymous_voter_hash IS NOT NULL)), 
  	CONSTRAINT uq_votes_poll_id_id UNIQUE (poll_id, id), 
  	CONSTRAINT fk_votes_poll_mode FOREIGN KEY(poll_id, identity_mode) REFERENCES polls (id, identity_mode) ON DELETE RESTRICT, 
  	UNIQUE (receipt_id), 
  	CONSTRAINT fk_votes_voter_id_users FOREIGN KEY(voter_id) REFERENCES users (id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_votes_poll_id ON votes (poll_id);
  CREATE UNIQUE INDEX uq_votes_anon_poll_browser ON votes (poll_id, anonymous_voter_hash) WHERE identity_mode = 'ANONYMOUS';
  CREATE UNIQUE INDEX uq_votes_named_poll_voter ON votes (poll_id, voter_id) WHERE identity_mode = 'NAMED';
  ```

### vote_selections

* 选票选择明细，支持一票多选。

  | 字段 | PostgreSQL 类型 | 可空 | 默认值 | 用途 |
  | --- | --- | --- | --- | --- |
  | vote_id | INTEGER | 否 | — | 所属选票。 |
  | option_id | INTEGER | 否 | — | 被选中的选项。 |
  | poll_id | INTEGER | 否 | — | 所属投票，必须与父票和选项一致。 |

  ```sql
  CREATE TABLE vote_selections (
  	vote_id INTEGER NOT NULL, 
  	option_id INTEGER NOT NULL, 
  	poll_id INTEGER NOT NULL, 
  	PRIMARY KEY (vote_id, option_id), 
  	CONSTRAINT fk_vote_selections_vote FOREIGN KEY(poll_id, vote_id) REFERENCES votes (poll_id, id) ON DELETE RESTRICT, 
  	CONSTRAINT fk_vote_selections_option FOREIGN KEY(poll_id, option_id) REFERENCES poll_options (poll_id, id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_vote_selections_poll_option ON vote_selections (poll_id, option_id);
  ```

### election_configs

* 每场选举一行，保存登记窗口与名册冻结快照。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | poll_id | INTEGER | 否 | 选举主键，同时引用 polls。 |
  | registration_starts_at / registration_ends_at | TIMESTAMPTZ | 否 | 登记窗口。 |
  | roster_frozen_at | TIMESTAMPTZ | 是 | 名册冻结时间。 |
  | eligible_voter_count | INTEGER | 是 | 冻结时的合资格人数。 |
  | created_at / updated_at | TIMESTAMPTZ | 否 | 创建／更新时间。 |

  ```sql
  CREATE TABLE election_configs (
    poll_id INTEGER NOT NULL,
    registration_starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    roster_frozen_at TIMESTAMP WITH TIME ZONE,
    eligible_voter_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_election_configs PRIMARY KEY (poll_id),
    CONSTRAINT fk_election_configs_poll_id_polls FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE RESTRICT,
    CONSTRAINT ck_election_configs_reg_window CHECK (registration_starts_at < registration_ends_at),
    CONSTRAINT ck_election_configs_freeze CHECK ((roster_frozen_at IS NULL AND eligible_voter_count IS NULL) OR (roster_frozen_at IS NOT NULL AND eligible_voter_count IS NOT NULL AND eligible_voter_count >= 0))
  );
  ```

### election_candidates

* 一对一扩展普通选项，增加候选人代号与政纲。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | poll_option_id | INTEGER | 否 | 主键，引用选项。 |
  | poll_id | INTEGER | 否 | 所属选举。 |
  | candidate_code | VARCHAR(32) | 否 | 场内唯一候选人代号。 |
  | statement | VARCHAR(500) | 是 | 候选人简介。 |
  | created_at | TIMESTAMPTZ | 否 | 创建时间。 |

  ```sql
  CREATE TABLE election_candidates (
    poll_option_id INTEGER NOT NULL,
    poll_id INTEGER NOT NULL,
    candidate_code VARCHAR(32) NOT NULL,
    statement VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_election_candidates PRIMARY KEY (poll_option_id),
    CONSTRAINT fk_election_candidates_option_poll FOREIGN KEY (poll_id, poll_option_id) REFERENCES poll_options (poll_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_election_candidates_poll_option UNIQUE (poll_id, poll_option_id),
    CONSTRAINT uq_election_candidates_poll_code UNIQUE (poll_id, candidate_code)
  );
  ```

### voter_identities

* 保存证件版本及独立密钥 HMAC-SHA-256 指纹；不持久化完整证件号码。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | id | BIGSERIAL | 否 | 主键。 |
  | user_id / version | INTEGER | 否 | 账户与其证件版本号。 |
  | document_type | VARCHAR(32) | 否 | RESIDENT_ID、HK_MACAU_PERMIT 或 STUDENT_ID。 |
  | issuer | VARCHAR(120) | 否 | 规范化签发机构。 |
  | document_fingerprint | VARCHAR(64) | 否 | HMAC-SHA-256 十六进制指纹。 |
  | document_suffix | VARCHAR(8) | 否 | 脱敏显示尾号。 |
  | fingerprint_key_version | SMALLINT | 否 | 指纹密钥版本。 |
  | created_at / updated_at | TIMESTAMPTZ | 否 | 创建／更新时间。 |

  ```sql
  CREATE TABLE voter_identities (
    id BIGSERIAL NOT NULL,
    user_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    document_type VARCHAR(32) NOT NULL,
    issuer VARCHAR(120) NOT NULL,
    document_fingerprint VARCHAR(64) NOT NULL,
    document_suffix VARCHAR(8) NOT NULL,
    fingerprint_key_version SMALLINT DEFAULT 1 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_voter_identities PRIMARY KEY (id),
    CONSTRAINT fk_voter_identities_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT uq_voter_identities_fingerprint UNIQUE (document_type, issuer, document_fingerprint),
    CONSTRAINT uq_voter_identities_user_version UNIQUE (user_id, version),
    CONSTRAINT uq_voter_identities_user_id UNIQUE (user_id, id),
    CONSTRAINT ck_voter_identities_doc_type CHECK (document_type IN ('RESIDENT_ID', 'HK_MACAU_PERMIT', 'STUDENT_ID')),
    CONSTRAINT ck_voter_identities_version CHECK (version >= 1)
  );
  ```

### election_registrations

* 保存账户对某场选举的登记、身份快照引用和当前审核状态。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | id | BIGSERIAL | 否 | 主键。 |
  | poll_id / user_id / identity_id | INTEGER／BIGINT | 否 | 选举、账户和证件版本。 |
  | legal_name_snapshot | VARCHAR(120) | 否 | 登记时姓名快照。 |
  | status | VARCHAR(24) | 否 | PENDING、NEEDS_REVIEW、APPROVED 或 REJECTED。 |
  | model_score / model_reason_codes / model_version | SMALLINT／JSONB／VARCHAR(64) | 是 | 规则引擎结果。 |
  | reviewed_by / reviewed_at | INTEGER／TIMESTAMPTZ | 是 | 人工审核信息，必须同时为空或同时有值。 |
  | submitted_at / updated_at | TIMESTAMPTZ | 否 | 提交／更新时间。 |

  ```sql
  CREATE TABLE election_registrations (
    id BIGSERIAL NOT NULL,
    poll_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    identity_id BIGINT NOT NULL,
    legal_name_snapshot VARCHAR(120) NOT NULL,
    status VARCHAR(24) DEFAULT 'PENDING' NOT NULL,
    model_score SMALLINT,
    model_reason_codes JSONB,
    model_version VARCHAR(64),
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_election_registrations PRIMARY KEY (id),
    CONSTRAINT fk_election_registrations_poll_id_polls FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE RESTRICT,
    CONSTRAINT fk_election_registrations_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_election_registrations_reviewed_by_users FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_election_registrations_user_identity FOREIGN KEY (user_id, identity_id) REFERENCES voter_identities (user_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_election_registrations_poll_user UNIQUE (poll_id, user_id),
    CONSTRAINT uq_election_registrations_poll_id UNIQUE (poll_id, id),
    CONSTRAINT ck_election_registrations_status CHECK (status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED')),
    CONSTRAINT ck_election_registrations_score CHECK (model_score IS NULL OR (model_score >= 0 AND model_score <= 100)),
    CONSTRAINT ck_election_registrations_review_meta CHECK ((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
  );
  CREATE INDEX ix_election_registrations_poll_status_sub ON election_registrations (poll_id, status, submitted_at);
  ```

### eligibility_review_events

* 只追加的模型、管理员或系统审核事件。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | id / registration_id | BIGSERIAL／BIGINT | 否 | 事件与登记。 |
  | actor_type / actor_id | VARCHAR(16)／INTEGER | 否／是 | MODEL、ADMIN、SYSTEM；仅 ADMIN 必须有 actor_id。 |
  | from_status / to_status | VARCHAR(24) | 是／否 | 状态迁移。 |
  | score / reason_codes / model_version | SMALLINT／JSONB／VARCHAR(64) | 是／否／是 | 判断依据。 |
  | review_note / request_id | VARCHAR(500)／VARCHAR(64) | 是 | 人工备注与请求跟踪。 |
  | created_at | TIMESTAMPTZ | 否 | 事件时间。 |

  ```sql
  CREATE TABLE eligibility_review_events (
    id BIGSERIAL NOT NULL,
    registration_id BIGINT NOT NULL,
    actor_type VARCHAR(16) NOT NULL,
    actor_id INTEGER,
    from_status VARCHAR(24),
    to_status VARCHAR(24) NOT NULL,
    score SMALLINT,
    reason_codes JSONB NOT NULL,
    model_version VARCHAR(64),
    review_note VARCHAR(500),
    request_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_eligibility_review_events PRIMARY KEY (id),
    CONSTRAINT fk_eligibility_review_events_reg_id FOREIGN KEY (registration_id) REFERENCES election_registrations (id) ON DELETE RESTRICT,
    CONSTRAINT fk_eligibility_review_events_actor_id_users FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_eligibility_review_events_actor_type CHECK (actor_type IN ('MODEL', 'ADMIN', 'SYSTEM')),
    CONSTRAINT ck_eligibility_review_events_to_status CHECK (to_status IN ('PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED')),
    CONSTRAINT ck_eligibility_review_events_actor CHECK ((actor_type = 'ADMIN' AND actor_id IS NOT NULL) OR (actor_type IN ('MODEL', 'SYSTEM') AND actor_id IS NULL)),
    CONSTRAINT ck_eligibility_review_events_score CHECK (score IS NULL OR (score >= 0 AND score <= 100))
  );
  CREATE INDEX ix_eligibility_review_events_reg_created ON eligibility_review_events (registration_id, created_at);
  ```

### election_voter_credentials

* 名册冻结时为每个 APPROVED 登记生成一个内部 UUID 凭证；凭证不返回前端。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | id | UUID | 否 | 内部凭证主键。 |
  | poll_id / registration_id | INTEGER／BIGINT | 否 | 所属选举与登记。 |
  | status | VARCHAR(16) | 否 | ISSUED 或 CONSUMED。 |
  | issued_at / consumed_at | TIMESTAMPTZ | 否／是 | 签发与消费时间。 |

  ```sql
  CREATE TABLE election_voter_credentials (
    id UUID NOT NULL,
    poll_id INTEGER NOT NULL,
    registration_id BIGINT NOT NULL,
    status VARCHAR(16) DEFAULT 'ISSUED' NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pk_election_voter_credentials PRIMARY KEY (id),
    CONSTRAINT fk_election_voter_credentials_reg FOREIGN KEY (poll_id, registration_id) REFERENCES election_registrations (poll_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_election_voter_credentials_poll_reg UNIQUE (poll_id, registration_id),
    CONSTRAINT ck_election_credentials_status_val CHECK (status IN ('ISSUED', 'CONSUMED')),
    CONSTRAINT ck_election_credentials_status CHECK ((status = 'ISSUED' AND consumed_at IS NULL) OR (status = 'CONSUMED' AND consumed_at IS NOT NULL))
  );
  CREATE INDEX ix_election_voter_credentials_poll_status ON election_voter_credentials (poll_id, status);
  ```

### election_ballots

* 单选选举票。只保存候选项、时间及随机 UUID 回执，不保存账户、登记、凭证、IP 或 User-Agent。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | id | BIGSERIAL | 否 | 选票主键。 |
  | receipt_id | UUID | 否 | 唯一随机回执。 |
  | poll_id / candidate_option_id | INTEGER | 否 | 选举与候选项。 |
  | submitted_at | TIMESTAMPTZ | 否 | 提交时间。 |

  ```sql
  CREATE TABLE election_ballots (
    id BIGSERIAL NOT NULL,
    receipt_id UUID NOT NULL,
    poll_id INTEGER NOT NULL,
    candidate_option_id INTEGER NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_election_ballots PRIMARY KEY (id),
    CONSTRAINT uq_election_ballots_receipt_id UNIQUE (receipt_id),
    CONSTRAINT fk_election_ballots_candidate FOREIGN KEY (poll_id, candidate_option_id) REFERENCES election_candidates (poll_id, poll_option_id) ON DELETE RESTRICT
  );
  CREATE INDEX ix_election_ballots_poll_submitted ON election_ballots (poll_id, submitted_at);
  CREATE INDEX ix_election_ballots_poll_candidate ON election_ballots (poll_id, candidate_option_id);
  ```

### alembic_version

* 迁移工具管理的版本表；当前 head 为 `b2e1ec710001`。不要手工改写版本值。

  | 字段 | 类型 | 可空 | 用途 |
  | --- | --- | --- | --- |
  | version_num | VARCHAR(32) | 否 | 已应用迁移版本，主键 |

  ```sql
  CREATE TABLE alembic_version (
      version_num VARCHAR(32) NOT NULL,
      CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
  );
  ```

## 约束、事务与存储边界

* 约束分工

  | 规则 | 数据库 | 服务层 |
  | --- | --- | --- |
  | 每账号每场一票 | 记名部分唯一索引 | 提交前检查并转换重复错误 |
  | 每浏览器凭据每场一票 | 匿名部分唯一索引 | 场次隔离的 HMAC-SHA256 |
  | 身份模式一致 | `votes` 复合外键、身份 CHECK | 会话与投票身份检查 |
  | 明细不能跨场 | 两个复合外键 | 选项归属检查 |
  | 一票同项不可重复 | 明细复合主键 | 数组去重校验 |
  | 2–10 个选项／多选至少三项 | 无跨行 CHECK | 创建／更新模型校验 |
  | 不超选票上限 | 上限字段范围 CHECK | 锁定 polls 行、计数、插父票与明细、必要时关闭，同事务提交 |
  | 并发更新草稿 | version 列 | 行锁 + expected_version |
  | 删除关系数据 | 业务外键 `ON DELETE RESTRICT` | 当前无公开删除投票 API |
  | 同一账户每场只登记一次 | `(poll_id, user_id)` 唯一约束 | 登记窗口与冻结状态检查 |
  | 同一证件不能绑定多个账户 | 证件类型、签发方、HMAC 指纹唯一 | NFKC、大小写及空白规范化 |
  | 名册冻结后凭证固定 | 登记与凭证一对一唯一约束 | 行锁；有待审核登记时拒绝冻结；重复冻结幂等返回 |
  | 每个合资格登记最多一票 | 凭证状态与消费时间 CHECK | 锁定并消费凭证、插入选票，同一事务提交 |
  | 选票不能跨场选择候选人 | 选举与候选项复合外键 | 候选项归属检查 |

* 存储事实

  | 数据 | 当前方式 |
  | --- | --- |
  | 账户密码 | Argon2 散列，`users.password_hash` |
  | 会话原令牌 | 浏览器 HttpOnly Cookie；数据库保存 SHA-256 散列 |
  | CSRF | 账户和访客各保存自己的校验值 |
  | 私有访问密码 | 新投票保存可取回明文 `private_password`；旧记录可保留 `private_password_hash`，二者不能与账户密码混为一谈 |
  | 匿名选票 | 不保存 voter_id、访客编号、IP 或 User-Agent；保存场次专用浏览器散列 |
  | 审计 | 不记录匿名逐票事件；记名事件不包含选项 |
  | 时间 | `TIMESTAMP WITH TIME ZONE`；服务按 UTC 处理，前端按香港时间显示／输入 |
  | updated_at | 默认 now() 仅用于插入；更新由业务代码赋值，没有自动更新时间触发器 |
  | 完整证件号 | 请求内用于规则校验和生成指纹；不写入数据库，只保存 HMAC 指纹与尾号 |
  | 选举选票 | 与身份链在表结构上分离；随机 UUID 回执不是密码学可验证或端到端匿名证明 |

## 迁移与初始化

* 迁移链

  | 版本 | 变更 |
  | --- | --- |
  | cdc412846524 | 账户、会话、投票、单选选票、授权和审计基础表 |
  | f3b8a1c04e27 | 增加可取回访问密码列，保留旧散列兼容 |
  | 6154e827a884 | vote_limit、selection_mode、vote_selections；回填旧单选数据并删除 votes.option_id |
  | c4e8a1b07d33 | 上限最大值收紧到 100000 |
  | d5a9c3e17b42 | allow_live_results，既有记录默认关闭 |
  | e7c4a91b2d58 | 两张初始化目录登记表 |
  | b2e1ec710001 | `activity_type`、FREEZE_ROSTER 审计动作与 7 张 B2 选举表 |

  多选迁移回退会检查是否仍能无损恢复单选结构，不满足条件时拒绝。固定投票初始化与数据库迁移分离，CLI 在迁移后补齐数据；不会靠重启覆盖已有选票。

  | 事实来源 | 位置 |
  | --- | --- |
  | ORM | `backend/src/main/python/database/models/` |
  | 迁移 | `db/migrations/versions/` |
  | 并发／约束测试 | `backend/tests/integration/` 下的投票与选举测试 |
