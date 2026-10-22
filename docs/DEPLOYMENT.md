# ECS 发布

生产域名为 `https://tangwz.com/`，`www.tangwz.com` 指向同一台阿里云深圳地域 ECS。站点使用系统 Nginx 提供静态文件，不在服务器运行 Astro 开发服务。

## 发布产物

先完成主题同步并提交代码，再从干净工作区构建。发布构建必须使用真实域名，并通过内容、公式、链接和浏览器检查。

```sh
npm run theme:verify
git status --short
cat dist/build-info.json
```

`build-info.json` 中的 `site` 必须为 `https://tangwz.com/`，`revision` 必须对应本次提交，`dirty` 为 `false`，`validated` 为 `true`。浏览器下载失败时可使用本机已有 Chromium 进行检查，并由 GitHub CI 补充标准环境验证，不降低依赖版本。

仅打包 `dist/`，将压缩包和 SHA-256 校验文件保存到博客仓库的 GitHub Release。不要打包源代码、环境文件、凭据或 `node_modules/`。Release 固定到已推送的完整提交 SHA，ECS 下载后必须核对校验和及构建信息。

ECS 传输使用深圳地域的私有 OSS 桶 `tangwz-com-releases-4336f3c3`，对象路径为 `releases/<source-sha>/tangwz-com.tar.gz`。上传同一份发布包并保持桶和对象私有，为单个对象生成 30 分钟有效的 HTTPS 签名地址供 ECS 下载；不要把签名地址写入仓库或日志，也不要将本机长期凭据复制到 ECS。GitHub Release 保留固定版本及校验和，OSS 仅作为同地域传输中转，下载后仍核对原始 SHA-256。

## ECS 目录与切换

- 版本目录：`/var/www/tangwz.com/releases/<source-sha>/`。
- 当前版本：`/var/www/tangwz.com/current`，指向一个已验证的版本目录。
- Nginx 站点配置：`/etc/nginx/conf.d/tangwz.com.conf`。
- 发布通过现有阿里云 Cloud Assistant 执行，不向服务器复制本地 OAuth 凭据、GitHub token 或 AccessKey。

将新产物解压到独立版本目录，校验成功后原子切换 `current`。保留旧版本和 Nginx 配置备份。首次接入时只调整 HTTPS 静态文件入口；保留现有 HTTP 到 HTTPS 跳转、ACME 验证路径和证书配置。配置检查通过后再平滑 reload Nginx。

```sh
nginx -t
systemctl reload nginx
curl --fail https://tangwz.com/build-info.json
```

发布后核对公网返回的 `revision`，并检查首页、作品库、旧文章、公式、RSS、搜索、静态资源及 404 状态。首页桌面精选为 3 个，作品库每页 9 个；移动端不得出现横向溢出。

## 回滚

后续版本回滚时，将 `current` 原子切回上一版本目录，再检查 Nginx 与公网构建信息。若修改了 Nginx 配置，同时恢复发布前的配置备份，并执行 `nginx -t` 和平滑 reload。不得直接覆盖或删除旧版本目录；首次部署失败时恢复原有占位站点配置。
