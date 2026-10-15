# 老博客迁移设计

## 目标

把旧仓库 `tangwz/tangwz.github.io` 中已经发布的老博文迁移到当前 Astro 站点，并产出可长期维护的 Markdown 源文。

迁移重点是内容源文件质量，而不是像素级还原旧站页面。迁移后的文章应能被当前 `posts` content collection 正常加载、构建、搜索和归档。所有视觉呈现都以当前 Astro 博客样式为准，不参考旧博客样式。

## 背景与约束

- 当前站点使用 Astro，文章目录为 `src/content/posts`。
- 当前文章 schema 至少需要 `title`、`pubDatetime`、`description`。
- 旧仓库远端只有 `master` 分支。
- 旧仓库当前和完整 Git 历史中都没有 Markdown 或 Hugo 源文件，只有静态 HTML、JSON、RSS、图片等生成产物。
- 老站可识别出 25 篇文章页面，路径形如 `/posts/202009-basic-paxos/`。
- 老站包含原始图片和 Hugo 生成的 resize 图片；迁移时只应保留原始图片。
- 不创建新博客内容，不改写正文观点，不做主题或视觉改造。
- 不参考旧博客样式；迁移结果完全使用当前博客的 Markdown 渲染、排版、代码高亮和图片样式。
- 验证使用 `npm run build`，不运行 `npm run dev`。

## 推荐方案

实现一个可重复运行的一次性 Node 迁移脚本，从旧站静态 HTML 反向生成语义化 Markdown。

脚本输入是旧仓库的本地克隆目录。脚本输出到当前站点：

```text
src/content/posts/202009-basic-paxos/index.md
src/content/posts/202009-basic-paxos/assets/cover.png
src/content/posts/202009-basic-paxos/assets/Split-Votes.png
```

选择该方案的原因：

- 比直接保留 HTML 更可维护。
- 比手工重写 25 篇文章更稳定、可复查、可重复。
- 可以用报告暴露转换质量问题，让人工复核集中在少数异常文章。

## 非目标

- 不迁移旧站主题、布局、评论、点赞、分享按钮或页面脚本。
- 不从旧站 HTML 保留与样式相关的 class、wrapper、inline style、srcset 或主题特定结构。
- 不迁移 tags、categories、分页等生成页面。
- 不复制 Hugo resize 派生图片，除非某张图片没有可用原始文件。
- 不对正文做润色、翻译、结构重写或技术内容修订。
- 不在迁移阶段引入重定向系统；旧 URL 语义通过 `canonicalURL` 保留。

## 脚本架构

### Source Discovery

从旧仓库识别 canonical post 页面：

- 只处理 `/posts/<slug>/index.html`。
- 排除 `/posts/index.html`、`/posts/page/*`、tag、category、about、home 等页面。
- slug 取 `<slug>` 目录名，保留旧 URL 路径稳定性。

### Metadata Extraction

优先级：

1. `application/ld+json`
2. Open Graph meta
3. `index.json`
4. HTML `<title>` 和正文摘要 fallback

生成 frontmatter：

```yaml
title: "Understanding Paxos"
pubDatetime: 2020-09-29T00:00:00+00:00
modDatetime: 2020-09-29T00:00:00+00:00
description: "A concise article summary."
tags:
  - "distributed-systems"
canonicalURL: "https://tangwz.com/posts/202009-basic-paxos/"
ogImage: "./assets/cover.png"
draft: false
```

字段规则：

- `title` 来自 JSON-LD `headline` 或 `og:title`。
- `pubDatetime` 来自 JSON-LD `datePublished` 或 `article:published_time`。
- `modDatetime` 来自 JSON-LD `dateModified` 或 `article:modified_time`；缺失则省略。
- `description` 来自 `og:description` 或 JSON-LD `abstract`；缺失则使用文章摘要。
- `tags` 来自 JSON-LD `keywords`；缺失则使用 `["others"]`。
- `canonicalURL` 保留旧站 canonical URL。
- `ogImage` 如果能解析到本地图片，则写相对路径；否则保留远端 URL 或省略。
- 不写 `slug` 字段，让目录路径自然决定 URL。

### Content Conversion

只抽取正文容器，清理主题生成物后转换 Markdown。

清理规则：

- 删除目录折叠块、heading anchor `span`、like/share/footer、脚本和主题 wrapper。
- 删除代码高亮内部展示用 `span`，保留代码文本。
- 删除图片 `srcset` 派生噪音，只保留一个可维护的图片引用。
- 解码 HTML entity，例如 `&rsquo;`、`&gt;`、`&quot;`。

Markdown 转换规则：

- 段落转普通段落。
- `h1`、`h2`、`h3` 等按原层级转换。
- 列表、引用、链接按 Markdown 语义输出。
- `<pre><code>` 转 fenced code block；无法可靠识别语言时不猜测语言。
- `<figure><img>` 或 `<img>` 转 Markdown 图片，保留 alt。
- 残留复杂 HTML 允许保留少量原始 HTML，但必须在报告中列出。

### Asset Migration

图片处理规则：

- 每篇文章的图片复制到 `src/content/posts/<slug>/assets/`。
- 优先复制非 resize 原始图片。
- 如果 HTML 只引用 resize 图片，脚本根据 Hugo resize 文件名反查同目录原图。
- Markdown 中统一使用相对路径，例如 `![Split Votes](./assets/Split-Votes.png)`。
- 缺失图片不静默忽略，必须进入报告。

## 错误处理与报告

脚本应输出迁移报告，建议为 `migration-report.json`，并在控制台输出 summary。

报告至少包含：

- 迁移文章数量。
- 每篇文章的输出路径。
- 每篇文章复制的图片列表。
- 无法解析的图片引用。
- 使用 fallback 的 metadata 字段。
- 转换后仍残留 HTML 的文章。
- 正文为空或文本长度异常偏短的文章。
- 转换前后图片数、代码块数、文本长度的对比。

如果存在高风险异常，脚本应最后返回非零退出码：

- 文章正文为空。
- 必需 frontmatter 缺失。
- 本地图片引用不存在。
- 文章数量和预期 25 篇不一致。

## 验证计划

### 结构验证

- 确认生成 25 篇 `index.md`。
- 确认每篇文章路径位于 `src/content/posts/<slug>/index.md`。
- 确认 Markdown 内所有本地图片引用都指向存在文件。

### 内容验证

- 对比旧 HTML 抽取文本长度和新 Markdown 文本长度。
- 对比旧 HTML 图片数量和新 Markdown 图片数量。
- 对比旧 HTML 代码块数量和新 Markdown 代码块数量。
- 对偏差过大的文章进行人工复核。

### 构建验证

运行：

```bash
npm run build
```

通过标准：

- Astro content schema 校验通过。
- Markdown 渲染无失败。
- 本地图片路径无失败。
- RSS、Pagefind 和静态构建全部完成。

## 实施顺序

1. 在临时目录 clone 或更新旧仓库。
2. 编写迁移脚本和最小必要的转换 helper。
3. 先对 1 篇图片和代码块较多的文章试跑，检查 Markdown 可读性。
4. 扩展到全部 25 篇文章。
5. 生成迁移报告。
6. 修复报告中的阻断问题。
7. 运行 `npm run build`。
8. 人工抽查代表性文章，包括 Paxos、TLA+、无图片文章和代码块文章。

## 风险与缓解

- 风险：静态 HTML 丢失了原始 Markdown 的精确换行和 fenced code language。
  缓解：优先保持语义结构，不猜测语言；通过报告列出需要人工复核的代码块文章。
- 风险：Hugo 主题生成的包装 HTML 混入正文。
  缓解：正文容器白名单抽取，并在报告中扫描残留 HTML。
- 风险：图片只存在 resize 版本。
  缓解：先根据 Hugo 命名反查原图；找不到原图时复制最佳可用版本并记录。
- 风险：迁移覆盖当前示例文章。
  缓解：输出到旧 slug 对应目录，不删除现有文章；如 slug 冲突则报告失败。

## 验收标准

- 25 篇老文章以 Markdown 形式进入 `src/content/posts`。
- 文章 frontmatter 符合当前 Astro schema。
- 本地图片跟随文章目录管理，未批量引入 Hugo resize 派生图。
- 文章渲染样式完全由当前博客控制，不携带旧博客主题样式残留。
- `npm run build` 通过。
- 迁移报告没有阻断级异常。
- 抽查文章正文、图片、链接和代码块可读且可维护。
