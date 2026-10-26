# 数据库备份

* **备份对象。** 使用 PostgreSQL 17 的 `pg_dump` 自定义格式。备份文件放在本机临时目录，不提交到 Git。`db/backups/` 已被忽略。开发库是宿主机 `127.0.0.1:5432` 的 `voting`。测试和恢复演练只用 Compose 的 `test` profile，也就是 `voting-postgres-test-1` 里映射到 `127.0.0.1:5433` 的实例。

* **恢复规则。** 恢复目标必须是同一测试实例上新建的空库，例如 `voting_restore`。不要恢复到 `voting`，也不要覆盖正在使用的 `voting_test`。执行 `DROP DATABASE` 之前，先在 `postgres` 维护库里确认要删除的名字就是 `voting_restore`。`DROP DATABASE` 不能和其他语句放在同一个事务里。

  ```bash
  docker exec voting-postgres-test-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d voting_test --format=custom --no-owner --no-privileges' > /tmp/voting_test.dump
  docker exec voting-postgres-test-1 sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE voting_restore;"'
  docker exec -i voting-postgres-test-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d voting_restore --no-owner --no-privileges --exit-on-error' < /tmp/voting_test.dump
  ```

  核对时比较两边的票数、记名和匿名是否各自带上正确的账户或散列、匿名票是否出现账户、场次数、用户数、授权数、Alembic 版本，以及 `uq_votes_named_poll_voter`、`uq_votes_anon_poll_browser`、`ck_polls_visibility_password`、`fk_votes_poll_mode`、`fk_votes_poll_option`。核对后删除 `voting_restore` 和临时转储文件。

* **2026-10-25 的核对。** 当时从 `voting_test` 恢复到 `voting_restore`，两边都是：票 11，其中记名且只关联账户 5、匿名且不关联账户 6、匿名却带账户 0；场次 20；用户 32；授权 4；迁移 `cdc412846524`。上面的两个部分唯一索引和三个约束都在。随后删除了 `voting_restore` 和 `/tmp/voting_test.dump`。宿主机 5432 上的数据库容器没有启动。这次数字是转储当时的测试库，后来的测试会清空 `voting_test`，所以它不是一份需要长期保存的黄金数据。
