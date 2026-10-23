# Tang 主题维护

博客使用 [tangwz/tang](https://github.com/tangwz/tang) 的源码，固定版本记录在 `theme.lock.json`。构建直接使用仓库内的文件，不下载主题；主题更新经过显式同步和验证后才生效。

## 日常同步

主题更新后，博客的 **Update Tang theme** 工作流每小时准备一个升级 PR。审核并合并该 PR 即可使用新主题；需要立即同步时，在 Actions 手动执行该工作流。首次使用前需把本同步机制合入博客默认分支，并允许 Actions 创建 PR。

本地更新只需在干净工作区执行 `npm run theme:upgrade`。正常升级自动保留个人内容和已有博客适配，不需要重新迁移页面或重复修改主题源码。通用视觉和行为改动应优先提交到 `tang`，再通过同步进入博客，避免不断积累两套实现。

## 本地更新

需要 Git、Node.js 24 和 pnpm 11.3.0。先提交或 stash 当前改动，保持工作区干净：

```sh
npm run theme:check
npm run theme:upgrade
git diff --stat
git diff
```

`theme:check` 只报告当前版本和上游版本。`theme:upgrade` 先同步源码，再执行统一的 `theme:verify`。该入口按锁文件安装依赖、强制刷新内容缓存、执行测试、lint 和格式检查、完成发布构建，随后安装匹配版本的 Chromium 并验证生产页面。浏览器版本已缓存时不会重复下载。本地升级、普通 CI 和自动更新使用同一套验证，CI 还会安装浏览器所需系统依赖。同步不提交代码，也不发布网站。

验证失败时保留已生成的升级候选。修复原因后执行下面的命令即可重新验证，无需重新拉取主题或提前提交失败的候选：

```sh
npm run theme:verify
```

独立执行同步时使用 `npm run theme:update`，随后运行 `npm run theme:verify`。同步发生合并冲突时，脚本不写入候选文件；处理方式见下文。

远端拉取遇到临时错误时最多尝试三次。拉取始终在临时目录中完成，全部失败时不会写入博客文件或推进主题基线。

需要指定分支、标签或完整 commit SHA 时：

```sh
npm run theme:update -- --ref main
npm run theme:verify
```

`--ref` 会保存到锁文件；如果临时固定了旧 commit，恢复跟随主分支时需再次指定 `--ref main`。

## 自动更新

`.github/workflows/update-theme.yml` 合入默认分支后，每小时检查一次 `tang/main`。可在 Actions 手动执行 **Update Tang theme**，也支持 `tang-theme-updated` 类型的 `repository_dispatch` 事件。GitHub 的定时任务可能延迟，手动执行适合需要立即同步的情况。

工作流维护一个 `codex/update-tang-theme` 分支和一个普通更新 PR。已有分支会先合并博客默认分支，再同步主题；全程使用普通提交和 push。测试、lint、格式检查、发布构建及浏览器布局检查通过后才推送候选版本并创建或更新 PR。没有差异时不安装依赖、不创建 PR。冲突或验证失败时工作流失败，不推送候选版本。更新需要审核合并，随后由博客原有部署流程发布。

启用前检查博客仓库的 **Settings → Actions → General → Workflow permissions**，允许 GitHub Actions 创建 Pull Request；仓库或组织策略可能禁用这一能力。工作流使用 `GITHUB_TOKEN`，无需额外密钥即可访问公开主题和维护本仓库 PR。

由 `GITHUB_TOKEN` 创建的 PR 或 push 通常不会触发另一个 Actions workflow。因此本工作流在创建 PR 前完成全部验证，并把运行链接写入 PR。如果分支保护要求独立 PR CI，配置仓库 secret `THEME_SYNC_TOKEN`：使用仅授权博客仓库、具备 **Contents: Read and write**、**Pull requests: Read and write** 权限的 fine-grained PAT。该 token 创建或更新的 PR 会触发现有 CI。主题同步不修改工作流文件，不需要 Workflows 写权限。普通 CI 只响应 PR 的代码更新或重新打开，避免与 push 触发重复执行。

当前仓库没有生产部署工作流；本机制准备并验证更新 PR，不自动发布。

## 文件归属

| 归属 | 文件                                                                     | 更新行为     |
| ---- | ------------------------------------------------------------------------ | ------------ |
| 主题 | `src/` 中的组件、视图、路由、样式、字体、工具及测试                      | 三方合并     |
| 主题 | `public/images/`、Astro/TypeScript/lint 配置、依赖及锁文件、构建检查脚本 | 三方合并     |
| 博客 | `src/content/`、`src/data/`、`astro-paper.config.ts`                     | 不从主题写入 |
| 博客 | favicon、个人 OG 图片、README、AGENTS、GitHub workflows、同步脚本        | 不从主题写入 |

`package.json` 按字段合并，保留博客名称和同步命令，同时同步主题依赖；依赖锁文件也参与三方合并，随后以 frozen install 验证一致性。普通依赖更新也可能在锁文件中产生文本冲突，需要处理这份锁文件；不会默默重新解析或批量升级无关依赖。新增主题文件如果与博客文件重名且内容不同，会报告冲突。上游删除的文件只有在本地未修改时才删除。图片等二进制文件如果双方都修改，会报告冲突。

个人配置集中在 `astro-paper.config.ts`、`src/data/` 和内容目录。通用视觉和行为建议在 `tang` 修改，再同步到博客，减少长期分叉。同步脚本不引入主题的示例文章、视频、书籍、课程和公开来信，也不引入 `/design/` 演示路由。

Google Analytics 使用主题内置的可选 `site.googleAnalyticsId`，博客只在 `astro-paper.config.ts` 填写 GA4 Measurement ID。该文件不会被主题同步覆盖；删除或留空即可关闭统计。主题默认关闭统计，博客启用后，中英文隐私页自动显示对应说明。生产构建及其本地预览会加载 Google tag，浏览器回归测试应拦截 Google 请求。GA4 增强型衡量需保留网页浏览和历史记录变更统计，作品库筛选、分页及搜索查询造成的 URL 变化也会纳入浏览统计；主题不额外手动上报 `page_view`。

保留上游英文页面、动态 OG 生成器及暂时没有内容的页面入口，避免维护功能裁剪分支。仅删除未引用的 DM Sans 和 Instrument Serif 字体文件；上游未修改这些资产时，同步会保留本地删除。上游开始修改或使用这些资产时，应评估并恢复所需文件，不要用排除规则掩盖依赖变化。博客专项检查、浏览器配置和 `tests/` 属于博客，不从主题覆盖。

## 博客适配

- 中文在根路径，英文在 `/en/`。上游的 `src/pages/zh/` 文件同步到博客的 `src/pages/en/`，现有路由辅助函数的语言参数会在合并前适配，因此新增同类路由也遵循博客的语言结构。
- 未标注 `lang` 的既有文章按中文处理；新增英文文章需显式填写 `lang: en`，放在 `src/content/posts/en/` 中。译文与原文使用相同 slug。
- 目录文章继续使用 `/posts/<slug>/`，不会重复生成 `<slug>/<slug>`。
- About 视图渲染既有的 `src/content/pages/about.md`。
- 没有真实书籍或课程时对应页面显示 404，避免把主题示例当作个人作品。
- 英文缺少译文时展示原文并设置 `noindex`，canonical 指向中文原文；英文 RSS 不收录这些回退文章。

这些适配是普通本地源码差异，下一次更新会与旧版及新版主题进行三方合并。语义变化仍需 review，构建通过不代表所有视觉或产品行为都兼容。

## 冲突处理与验证

脚本先计算所有文件的合并结果；遇到冲突时不写入任何候选文件，也不更新锁文件。报错会列出冲突路径。同一字段或文本区域的手工整合结果仍可能被三方合并判为冲突，因此不能仅提交后重复运行原命令。

先固定本次准备审阅的完整目标 SHA，避免解决冲突期间上游分支移动：

```sh
theme_revision=$(git ls-remote https://github.com/tangwz/tang.git refs/heads/main | cut -f1)
npm run theme:update -- --ref "$theme_revision"
```

比较锁定 commit、该目标 commit 和本地文件，手工整合冲突文件中的全部上游变化及博客适配，然后提交这些文件，保持工作区干净。对仍会冲突的文件显式接受已经审阅的本地版本，例如：

```sh
npm run theme:update -- --ref "$theme_revision" --resolved-file package.json
```

`--resolved-file` 可重复传入，使用博客仓库中的文件路径，包括映射后的 `src/pages/en/` 路径。该参数只接受本批同步中确实发生冲突的整份文件；不存在、不属于主题、能自动合并或重复的路径会使整批同步失败。语法错误等非合并冲突不能通过该参数跳过。其余文件仍执行三方合并，尚有任何未解决的冲突时不会写入任何候选文件。接受整份文件意味着需要自己确认其中没有遗漏目标版本的其他改动。

恢复操作必须显式提供 `--ref` 完整 SHA，不能使用移动的分支名或与 `--check` 同用；换用新目标 SHA 时需重新审阅冲突。整批同步成功后才推进锁文件，再执行下面的完整验证。提交同步结果后使用 `npm run theme:update -- --ref main` 恢复跟随主分支。不要单独修改锁文件来绕过失败，否则后续更新会把未合入的变更当作已经同步。

```sh
npm run theme:verify
```

统一验证会自动刷新 Markdown 内容缓存，主题渲染插件的更新会进入新的构建产物。

测试覆盖三方合并、个人内容保护、新增文件重名、删除冲突、语言路由映射、重复同步、未引用资产的本地删除，以及绑定目标版本的显式冲突恢复。连续版本测试核对逐次升级与直接跨版本升级的结果一致，并验证后续升级继续保留博客新增适配和独立依赖。统一验证入口还测试执行顺序、CI 浏览器安装和失败时停止。构建检查覆盖 canonical、站内链接、图片、RSS、sitemap 和 Pagefind；博客专项检查复用文章发布规则，根据已发布文章的 Markdown 或 MDX 正文核对公式及其重复次数，排除草稿、模板和未到发布时间的文章。MDX 导出变量、表达式、属性和注释中的公式文本不作为正文公式。所有 HTML（包括 noindex 页面）都会扫描示例标记和中英文示例说明；真实书籍和课程不会显示主题示例说明。

`check:layout` 针对真实生产产物，核对中英文作品库与两个 RSS 中全部文章的链接集合，再检查 1218px 桌面视口下的三列网格、完整行分页和最后一页，以及 768px、390px 视口下的两列、单列和水平溢出。文章数量不写死，空列表或遗漏文章也会失败。浏览器检查还验证英文 About 回退的中文 canonical、noindex、hreflang 和 sitemap。该检查在普通 CI 和主题更新流程中都会执行。

GitHub Actions 行为参考：[定时与手动触发](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)、[token 与 workflow 触发](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
