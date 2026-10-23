# AGENTS.md

本文件记录 Codex 在本仓库工作时需要遵守的项目约定。

## 核心原则

- 未经明确要求，不要新建、续写或虚构博客正文。
- 如果用户只说要新建博客但没有给主题或标题，先询问主题或标题。
- 修改既有文章时，以修复、迁移、格式化和资产整理为边界，不主动扩展观点或补写内容。
- 不要为了迁移旧内容保留旧站样式；页面呈现应始终服从当前 Astro 站点的样式系统。

## 常用命令

不要在 agent 模式运行 `npm run dev`。验证改动优先使用：

```bash
npm run build
```

旧博客迁移相关命令：

```bash
pnpm migrate:old-blog
pnpm test:migrate-old-blog
```

## 项目结构

- `src/content/posts/`：博客文章源文件。目录型文章使用 `src/content/posts/<slug>/index.md`。
- `src/pages/`：Astro 页面和路由。
- `src/components/`：可复用组件。
- `src/layouts/`：页面布局。
- `src/styles/`：全局样式。
- `scripts/migrate-old-blog/`：旧博客静态 HTML 到 Markdown 的迁移工具。
- `src/views/`：Tang 主题的页面视图；路由文件主要负责页面入口。
- `src/data/`：博客专属的创作者、书籍、课程和 Newsletter 数据。

## 主题同步

- 主题来源为 `https://github.com/tangwz/tang`，当前基线记录在 `theme.lock.json`。
- 本仓库对站点的定制仅限文字内容、个人数据和主题已提供的配置项；不得手工修改 Tang 主题的样式、排版、布局、组件或交互实现，也不得通过额外 CSS、内联样式或组件分叉绕过此限制。
- 所有主题修改（包括缺陷修复和新增配置项）必须先在 [tangwz/tang](https://github.com/tangwz/tang) 仓库实现并验证，再通过主题同步进入本项目，不在博客仓库维护主题补丁。
- 现有配置无法满足需求时，先在主题仓库补充配置能力，再同步并调整博客配置，不直接修改本地主题源码。
- 使用 `npm run theme:upgrade` 同步并验证主题，先提交或 stash 当前改动。
- 主题同步采用三方合并；发生冲突时先解决冲突，不要直接覆盖本地文件或跳过构建。
- `src/content/`、`src/data/`、`astro-paper.config.ts`、个人 favicon 和 OG 图片属于博客，不从主题覆盖。
- 中文使用根路径，英文使用 `/en/`；保持既有文章 URL 不变。
- 不迁入主题示例文章、视频、书籍、课程或公开来信。
- 同步机制与 GitHub Actions 配置见 `docs/THEME.md`。

## 发布与云资源

- 禁止使用 OSS 保存发布包或作为发布中转；不得重新创建 OSS 发布桶。
- 发布包通过现有博客仓库的 GitHub Release 分发，ECS 下载后核对 SHA-256 和构建信息，再原子切换版本。
- 下载失败时重试、断点续传或排查网络；已配置授权的 SSH 连接时可使用 SCP 直传。不得自动回退到 OSS 或新建收费中转资源。
- 保留 ECS 上的已发布版本和回滚目录，不因清理传输介质删除线上文件。具体流程见 `docs/DEPLOYMENT.md`。

## 文章与资源

- 文章 frontmatter 使用当前项目已有字段约定，例如 `title`、`description`、`pubDatetime`、`modDatetime`、`tags`、`canonicalURL`、`ogImage`、`draft`。
- 迁移文章的本地图片放在对应文章目录的 `assets/` 下，并使用 `./assets/...` 引用。
- 不要引用旧站生成的 `resize_` 派生图片；如果可用，优先迁移原始图片。
- 目录型文章的 URL 应为 `/posts/<slug>/`，不要生成 `/posts/<slug>/<slug>/`。

## 依赖管理

- 不要降级依赖来规避问题。
- 检查依赖版本时使用包管理工具，不要凭记忆猜版本。

```bash
npm outdated
npm view astro version
```

## 编辑约定

- 手工编辑文件优先使用 `apply_patch`。
- 如果需要 sed 类操作，优先使用 `gsed`；若本机不可用，改用更明确的脚本或补丁方式。
- 保持改动范围集中，不顺手重构无关模块。
- 提交前确认 `git status --short`，不要把无关产物、报告文件或缓存目录混入提交。

## 验证建议

- 文章、路由、构建相关改动至少运行 `npm run build`。
- 旧博客迁移脚本改动至少运行 `pnpm test:migrate-old-blog`，必要时再运行 `pnpm migrate:old-blog`。
- 迁移内容需要检查：
  - 生成文章数量和 `migration-report.json` blocker 数量；
  - 本地图片引用是否存在；
  - 是否残留旧站样式属性或 heading anchor 文本；
  - `dist/posts/<slug>/index.html` 是否存在。
