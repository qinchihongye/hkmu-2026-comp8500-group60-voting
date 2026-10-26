# 部署配置

* **范围。** 这里只保留一份本机 Nginx 示例，供课程演示同一来源下的页面和接口。不执行公网部署，也不把机器地址、证书或密钥写进仓库。

* **怎么接。** 先按根目录 `README.md` 在 `127.0.0.1:8000` 启动后端，并带上 `--no-access-log`。再在 `frontend/` 执行 `npm run build`，把 `frontend/dist/` 的内容放到 `deploy/nginx.conf` 里的 `root`。示例写成 `/var/www/voting`，可以按本机目录修改。然后让 Nginx 加载这份配置。浏览器只访问 Nginx 的地址，页面和 `/api` 必须是同一个来源，这样两个 Cookie 和来源校验才成立。

* **日志。** `/s/`、`/api/v1/shares/`、投票和解锁路径关闭了访问日志，避免分享码留在日志里。其余接口仍由应用返回 `Cache-Control: no-store`。分享、解锁、私密详情、汇总和审计还会带 `Referrer-Policy: no-referrer`。这份示例没有打开 HTTPS。如果前面另有 TLS 终结，需要继续把原始主机和协议传给后端，并只在 HTTPS 下把 `COOKIE_SECURE` 设为 `true`。
