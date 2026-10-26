#!/bin/sh
set -e

# 数据库就绪由 compose 的 depends_on + healthcheck 保证。
# 迁移 + 幂等建演示账户。new-demo-round 每次会新建场次，故留给手动执行：
#   docker compose exec backend uv run python -m src.main.python.cli new-demo-round
/app/backend/.venv/bin/python -m alembic upgrade head
/app/backend/.venv/bin/python -m src.main.python.cli seed-demo

# 起应用。容器内监听 0.0.0.0，供同网络的 web(nginx) 访问。
exec /app/backend/.venv/bin/python -m uvicorn src.main.python.main:create_app \
  --factory --host 0.0.0.0 --port 8000 --no-access-log