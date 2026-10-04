---
title: "同样更新分支，git merge 和 rebase 有什么区别？"
pubDatetime: 2020-09-13T00:00:00+00:00
modDatetime: 2020-09-13T00:00:00+00:00
description: "最近在给 kubernetes 提交代码，k8s 社区要求非常严格，既要分支保持与主"
tags:
  - "git"
canonicalURL: "https://tangwz.com/posts/202009-git-merge-vs-rebase/"
draft: false
---

<!-- migrated-from: https://tangwz.com/posts/202009-git-merge-vs-rebase/ -->

> 最近在给 kubernetes 提交代码，k8s 社区要求非常严格，既要分支保持与主干的代码同步，还要一次只能有一条 commit。过程中我错误地使用了一把 git merge 和 git rebase，特此总结一下。

## 区别

同样更新分支，git merge 和 rebase 有什么区别？让我们从这个例子来看：

```
* 33facc8  (master) Commit 3
|
| * 3b36f32  (second_branch) Detached commit
| |
|/
* 29af11f  Commit 2
|
* 1439f8e  Commit 1
```

我们在 `Commit 2` 创建分支 `second_branch` 写代码，并提交了一个 `commit`: `3b36f32`，在这之后，主干有人也提交了代码 `Commit 3`。

问题来了：如何把 `Commit 3` 拉到我们的分支继续开发？（你的领导或同事肯定经常让你这样干！）

这时候用 `git merge master` 或 `git rebase master` 都能更新 `second_branch`，也许有时候还要处理下冲突。但他们的结果却不相同，如下图：

![](https://s2.loli.net/2022/10/09/KtYySIDbahx5MBH.jpg)

git merge master

git rebase master

合并 `master` 的记录到分支，合并之后的所有 `commit` 会按提交时间从新到旧排列。

当前分支的 `HEAD` 会移动到 master 的结尾，但会变成一个新的 `commit`。

用 `git log --graph` 查看的话，会有一条**丑陋的**边！

`git log --graph` 是一条漂亮的直线

保持了所有 `commit` 的连贯性

`commit` 历史被修改了，`3b36f32` 被修改成了 `a018520`

## 什么时候用 rebase，什么时候用 merge？

- 用 `merge` 来把分支合并到主干。（废话！）
- 如果你的分支要跟别人共享，则**不建议**用 `rebase`，因为 `rebase` 会创建不一致的提交历史。
- 如果只有你个人开发推荐使用 `rebase`。
- 如果你想保留完整的提交历史，推荐使用 `merge`，`merge` 保留历史 而 `rebase` 重写历史。
- `rebase` 还可以压缩、简化历史，通过 `git rebase -i` 可以在分支合并到主干前，整理自己分支的提交历史，把很多细碎的 `commit` 整理成一条详细的 `commit`。
- `rebase` 一次只处理一个冲突，`merge` 则一次处理全部冲突。处理冲突 `rebase` 更方便，但如果有很多冲突的话，撤销一个 `rebase` 会比 `merge` 更复杂，`merge` 只需要撤销一次。
