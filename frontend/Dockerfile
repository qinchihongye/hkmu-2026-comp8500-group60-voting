# 前端：多阶段构建。阶段一用 Node 构建静态资源，阶段二用 Nginx 服务并反代后端。
# 构建上下文是仓库根目录。

# 阶段一：构建
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 阶段二：服务
FROM nginx:1.27-alpine
COPY deploy/nginx-docker.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html