# 唐师兄的个人主页

个人博客 [tangwz.com](https://tangwz.com/)，使用自己的 [Tang 主题](https://github.com/tangwz/tang)。文章与图片由博客仓库维护，主题源码固定到 `theme.lock.json` 记录的 commit，并通过三方合并更新。

## 构建与预览

使用 Node.js 24 和 pnpm 11.3.0：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm format:check
npm run build
npm run preview
```

构建产物为 `dist/`。构建包含类型检查、静态页面生成、Pagefind 索引、主题产物检查和博客专项检查。发布前使用 `npm run build:release` 验证真实域名。

## 主题更新

先提交或 stash 当前改动，再执行：

```sh
npm run theme:check
npm run theme:upgrade
```

GitHub Actions 每小时检查主题更新，验证通过后创建或更新一个 PR；也可手动触发 **Update Tang theme**。工作流需合入默认分支，并允许 Actions 创建 PR。个人文章、About 正文、站点配置及作品数据不从主题覆盖。

完整操作、权限设置、冲突处理及文件归属见 [主题维护文档](docs/THEME.md)。

## 配置与内容

| 内容                                       | 位置                                           |
| ------------------------------------------ | ---------------------------------------------- |
| 域名、名称、作者、时区、社交链接和功能开关 | `astro-paper.config.ts`                        |
| 博客文章和本地图片                         | `src/content/posts/<slug>/index.md`、`assets/` |
| About 正文                                 | `src/content/pages/about.md`                   |
| 视频与文字稿                               | `src/content/videos/`                          |
| 个人照片、书籍、课程和 Newsletter 数据     | `src/data/`                                    |
| 可选 Newsletter 服务公开配置               | `.env.example`                                 |

中文页面使用根路径，英文页面使用 `/en/`。既有文章地址保持 `/posts/<slug>/`；原有文章默认中文，英文内容需显式设置 `lang: en`。当前不导入主题示例作品，Newsletter 默认未启用。

## 来源与许可

Tang 基于 [AstroPaper](https://github.com/satnaing/astro-paper)。保留 [MIT 许可证](LICENSE)，字体许可证位于 `src/assets/fonts/`，主题图片来源记录在 `public/images/CREDITS.txt`。
