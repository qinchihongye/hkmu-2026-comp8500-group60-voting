# 后端运行镜像。构建上下文是仓库根目录。
# 保留 backend/ 与 db/migrations/ 的相对结构，让 alembic.ini 的 script_location
# 和 server_config 的 _REPO_ROOT（parents[5]）都能按原样工作。

FROM python:3.12-slim

# 安装 uv（通过 pip 安装，配置国内镜像源与官方源兜底，避免从 ghcr.io 拉取镜像时的 401 权限及网络超时问题）
RUN pip install --no-cache-dir "uv==0.13.5" -i https://pypi.tuna.tsinghua.edu.cn/simple --extra-index-url https://pypi.org/simple

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app/backend

# 先复制依赖清单，利用 Docker 层缓存
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev

# 再复制源码、alembic 配置与迁移脚本
COPY backend/alembic.ini ./
COPY backend/src ./src
COPY db/migrations /app/db/migrations

# 入口脚本
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["docker-entrypoint.sh"]