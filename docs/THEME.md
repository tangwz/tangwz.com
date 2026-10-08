# Tang 主题维护

博客使用 [tangwz/tang](https://github.com/tangwz/tang) 的源码，固定版本记录在 `theme.lock.json`。构建直接使用仓库内的文件，不下载主题；主题更新经过显式同步和验证后才生效。

## 本地更新

需要 Git、Node.js 24 和 pnpm 11.3.0。先提交或 stash 当前改动，保持工作区干净：

```sh
npm run theme:check
npm run theme:upgrade
git diff --stat
git diff
```

`theme:check` 只报告当前版本和上游版本。`theme:upgrade` 同步源码、按锁文件安装依赖、执行测试并构建。独立执行同步时使用 `npm run theme:update`；执行后还需安装依赖并验证。同步不提交代码，也不发布网站。

需要指定分支、标签或完整 commit SHA 时：

```sh
npm run theme:update -- --ref main
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm format:check
npm run build:release
```

`--ref` 会保存到锁文件；如果临时固定了旧 commit，恢复跟随主分支时需再次指定 `--ref main`。

## 自动更新

`.github/workflows/update-theme.yml` 合入默认分支后，每小时检查一次 `tang/main`。可在 Actions 手动执行 **Update Tang theme**，也支持 `tang-theme-updated` 类型的 `repository_dispatch` 事件。GitHub 的定时任务可能延迟，手动执行适合需要立即同步的情况。

工作流维护一个 `codex/update-tang-theme` 分支和一个普通更新 PR。已有分支会先合并博客默认分支，再同步主题；全程使用普通提交和 push。测试、lint、格式检查及发布构建通过后才推送候选版本并创建或更新 PR。没有差异时不安装依赖、不创建 PR。冲突或验证失败时工作流失败，不推送候选版本。更新需要审核合并，随后由博客原有部署流程发布。

启用前检查博客仓库的 **Settings → Actions → General → Workflow permissions**，允许 GitHub Actions 创建 Pull Request；仓库或组织策略可能禁用这一能力。工作流使用 `GITHUB_TOKEN`，无需额外密钥即可访问公开主题和维护本仓库 PR。

由 `GITHUB_TOKEN` 创建的 PR 或 push 通常不会触发另一个 Actions workflow。因此本工作流在创建 PR 前完成全部验证，并把运行链接写入 PR。如果分支保护要求独立 PR CI，配置仓库 secret `THEME_SYNC_TOKEN`：使用仅授权博客仓库、具备 **Contents: Read and write**、**Pull requests: Read and write** 权限的 fine-grained PAT。该 token 的 push 会触发现有 CI。主题同步不修改工作流文件，不需要 Workflows 写权限。

当前仓库没有生产部署工作流；本机制准备并验证更新 PR，不自动发布。

## 文件归属

| 归属 | 文件                                                                     | 更新行为     |
| ---- | ------------------------------------------------------------------------ | ------------ |
| 主题 | `src/` 中的组件、视图、路由、样式、字体、工具及测试                      | 三方合并     |
| 主题 | `public/images/`、Astro/TypeScript/lint 配置、依赖及锁文件、构建检查脚本 | 三方合并     |
| 博客 | `src/content/`、`src/data/`、`astro-paper.config.ts`                     | 不从主题写入 |
| 博客 | favicon、个人 OG 图片、README、AGENTS、GitHub workflows、同步脚本        | 不从主题写入 |

`package.json` 按字段合并，保留博客名称和同步命令，同时同步主题依赖。新增主题文件如果与博客文件重名且内容不同，会报告冲突。上游删除的文件只有在本地未修改时才删除。图片等二进制文件如果双方都修改，会报告冲突。

个人配置集中在 `astro-paper.config.ts`、`src/data/` 和内容目录。通用视觉和行为建议在 `tang` 修改，再同步到博客，减少长期分叉。同步脚本不引入主题的示例文章、视频、书籍、课程和公开来信，也不引入 `/design/` 演示路由。

## 博客适配

- 中文在根路径，英文在 `/en/`。上游的 `src/pages/zh/` 文件同步到博客的 `src/pages/en/`，现有路由辅助函数的语言参数会在合并前适配，因此新增同类路由也遵循博客的语言结构。
- 未标注 `lang` 的既有文章按中文处理；新增英文文章需显式填写 `lang: en`，放在 `src/content/posts/en/` 中。译文与原文使用相同 slug。
- 目录文章继续使用 `/posts/<slug>/`，不会重复生成 `<slug>/<slug>`。
- About 视图渲染既有的 `src/content/pages/about.md`。
- 没有真实书籍或课程时对应页面显示 404，避免把主题示例当作个人作品。
- 英文缺少译文时展示原文并设置 `noindex`，canonical 指向中文原文；英文 RSS 不收录这些回退文章。

这些适配是普通本地源码差异，下一次更新会与旧版及新版主题进行三方合并。语义变化仍需 review，构建通过不代表所有视觉或产品行为都兼容。

## 冲突处理与验证

脚本先计算所有文件的合并结果；遇到冲突时不写入任何候选文件，也不更新锁文件。报错会列出冲突路径。比较锁定 commit、上游目标 commit 和本地文件，手工解决冲突文件并提交这些改动，再次执行 `npm run theme:upgrade`。脚本会保留已经手工整合的变化，同步其余文件，并在整批源码同步成功后推进锁文件。不要单独修改锁文件来绕过失败，否则后续更新会把未合入的变更当作已经同步。

```sh
pnpm test
pnpm lint
pnpm format:check
npm run build:release
```

测试覆盖三方合并、个人内容保护、新增文件重名、删除冲突、语言路由映射和重复同步。构建检查覆盖 canonical、站内链接、图片、RSS、sitemap 和 Pagefind；博客专项检查还验证原有文章地址、中文首页和 About 内容。

GitHub Actions 行为参考：[定时与手动触发](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)、[token 与 workflow 触发](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
