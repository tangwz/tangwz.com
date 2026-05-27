---
title: "条分缕析 Raft 算法(续)：日志压缩和性能优化"
pubDatetime: 2021-02-19T00:00:00+00:00
modDatetime: 2021-02-19T00:00:00+00:00
description: "在上篇《条分缕析 Raft 算法》中推导和梳理了 Raft 算法，但仍有一些细节"
tags:
  - "分布式"
canonicalURL: "https://tangwz.com/posts/202102-raft-extension/"
draft: false
---
<!-- migrated-from: https://tangwz.com/posts/202102-raft-extension/ -->

在上篇[《条分缕析 Raft 算法》](https://mp.weixin.qq.com/s/lUbVBVzvNVxhgbcHQBbkkQ)中推导和梳理了 Raft 算法，但仍有一些细节没有包含到，这篇文章作为补充。

## 1 日志压缩

随着时间推移，存储的日志会越来越多，不但占据很多磁盘空间，服务器重启做日志重放也需要更多的时间。如果没有办法来压缩日志，将会导致可用性问题：要么磁盘空间被耗尽，要么花费太长时间启动。所以日志压缩是必要的。

日志压缩的一般思路是，日志中的许多信息随着时间推移会变成过时的，可以丢弃。例如：一个将 x 设置为 2 的操作，如果在未来将 x 设置为了 3，那么 x=2 这个操作就过时了，可以丢弃。

一旦日志记录被提交并应用于状态机，那么用于到达当前状态的中间状态和操作就不再需要了，它们可以被压缩掉。

和配置变化不同，不同的系统有不同的日志压缩方式，取决于你的性能考量，以及基于硬盘还是基于内存。**日志压缩的大部分责任都落在状态机上。**

不同的压缩方法有几个核心的共同点：

*   **不将压缩决定集中在 Leader 上，每个服务器独立地压缩其已提交的日志**。这就避免了 Leader 将日志传递给已有该日志的 Follower，同时也增强了模块化，减少交互，将整个系统的复杂性最小化。（对于非常小的状态机，基于 Leader 的日志压缩也许更好。）
*   **将之前的 log 的维护责任从 Raft 转移到状态机**。Raft 要保存最后被丢弃的记录的index和term，用于 `AppendEntries RPC` 一致性检查。同时，也需要保存最新的配置信息：成员变更失败需要回退配置，最近的配置必须保存。
*   一旦丢弃了前面部分的日志，状态机就承担两个新的责任：1. 如果服务器重启了，需要将最新的快照加载到状态机后再接受 log；此外，2. 需要向较慢的 follower(日志远落后于 Leader)发送一致的状态镜像。

### 1.1 基于内存的状态机的快照

状态机的数据集小于 10GB 的时候选择 memory-based 状态机是合理的。

![](https://i.loli.net/2021/03/03/tAcXgHFsBaS2P4V.jpg)

上图显示了 memory-based 状态机的基本想法：对内存的数据结构(树形或哈希等)进行序列化并存储，同时存储 Raft 重启需要的状态：最后一条记录的 index 和 term 以及该索引处的最新配置，然后这个 index 之前的日志和快照都可以丢弃了。

**memory-based 状态机的快照的大部分工作是序列化内存中的数据结构**。

通过上面的介绍，Leader 可能偶尔需要把它的状态发送给慢 Followers 或新加入集群的服务器。快照信息通过 `InstallSnapshot RPC` 来传输。你肯定在论文中看过下图：

![](https://i.loli.net/2021/03/03/Zsaif9XzjgPo8Kb.jpg)

#### 1.1.1 快照的并发性

创建一个快照需要耗费很长时间，包括序列化和写入磁盘。

> 例如，在今天的服务器上拷贝 10GB 的内存花费大约1秒钟，序列化它通常将花费更长的时间：即使 SSD 1秒钟也仅能写入大约 100MB。

因此，序列化和写快照都要与常规操作并发进行，避免服务不可用。

copy-on-write 技术允许进行新的更新而不影响写快照。有两个方法来实现：

*   状态机可以用不可变的(immutable)数据结构来实现。因为状态机命令不会 in-place 的方式来修改状态(通常使用追加的方式)，快照任务可以引用之前状态的并把状态一致地写入到快照。
*   另外，也可以使用操作系统的 copy-on-write。例如，在 Linux 上可以使用 fork 来复制父进程的整个地址空间，然后子进程就可以把状态机的状态写出并退出，整个过程中父进程都可以持续地提供服务。[LogCabin](https://github.com/logcabin/logcabin)中当前使用的就是这种方法。

#### 1.1.2 何时做快照

服务器需要决定什么时候做快照。太过频繁地做快照，将会浪费磁盘带宽和其他资源；太不频繁地做快照，则有存储空间耗尽的风险，并且重启服务需要更长的重放日志时间。

一个简单的策略是设置一个阈值，当日志大小超过阈值则做快照。然而，这会导致对于小型状态机时有着不必要的大日志。

一个更好的方法是引入快照大小和日志大小的对比，如果日志超过快照好几倍，可能就需要做快照。但是在做快照之前计算快照的大小是困难并且繁重的，会引入额外负担。所以使用前一个快照的大小是比较合理的行为，一旦日志大小超过之前的快照的大小乘以扩展因子(expansion factor)，服务器就做快照。

这个扩展因子权衡空间和带宽利用率。例如，扩展因子为 4 的话会有 20% 的带宽用于快照(每1byte 的快照写入有对应的 4bytes 的 log 写入)和大约 6 倍的硬盘空间使用(旧的快照+日志+新的快照)。

快照仍然会导致 CPU 和磁盘的占用率突发，可以增加额外的磁盘来减轻该现象。

同时，可以通过调度使得做快照对客户端请求没有影响。服务器需要协调保证在某一时刻集群只有小部分成员集同时在做快照。由于 Raft 是多数派成员构成的 commit，所以这样就不会影响请求的提交了。当 Leader 想做快照的时候，首先要先下台，让其他服务器选出另一个 Leader 接替工作。如果这个方法充分地可行，就可能消除快照的并发，服务器在快照期间其实是不可用的(这可能会造成集群的容错能力降低的问题)。这是一个令人兴奋的提升集群性能并降低实现机制的机会。（这里其实可以通过实现指定服务器做快照来优化，braft 里就有提到这点。）

#### 1.1.3 实现的关注点

这一节回顾快照的主要组件的实现并讨论实现的难点：

*   **保存和加载快照**：保存快照需要对其序列化并写入磁盘，而加载则是反序列化。通过流式接口(streaming interface)可以避免将整个快照缓冲到内存中。可能对流进行压缩并附带一个 checksum 比较好。LogCabin 先把快照写入一个临时文件，当写完并且刷到磁盘后，再把文件改名。这是为了避免server启动的时候加载到部分的快照。
*   **传输快照**：传输快照牵涉到如何实现 `InstallSnapshot RPC`。传输的性能通常不是非常重要(一个需要这种动作的 Follower 不会参与到日志的 commit 决策中，因此不需要立即完成)。
*   **消除不安全的日志访问和丢弃日志条目**：最初设计 LogCabin 的时候没有考虑日志压缩，因此代码上假定了如果 entry i 在日志中，那么 entry 1 到 i - 1 也一定在日志中。有了日志压缩，这就不再成立了，前面的 entry 可能已经被丢弃了。这里需要仔细推理和测试。可能对一些强类型的系统做这些是简单的，编译器会强制检查日志访问并处理越界的问题。一旦我们使得所有的日志访问都是安全的，丢弃前面的日志就很直接了。在这之前，我们都只能单独地测试保存、加载和传输快照。
*   **通过 copy-on-write 并发地做快照**：可能需要重新设计状态机或利用操作系统的 fork。LogCabin 当前使用的是 fork，相比于线程交互性很差，要使其正确工作也有一定的难度。然而，它的代码量很小，而且不需要修改状态机数据结构。
*   **决定何时做快照**：我们建议**在开发的过程中每应用一条日志就做一个快照，这样便于快速定位问题**。一旦实现完成，就需要增加一个更有效的机制选择什么时候做快照。

### 1.2 基于磁盘的状态机的快照

对于几十或上百 GB 的状态机，需要使用磁盘作为主要存储。对于每一条记录，当其被提交并应用到状态机后，其实就可以被丢弃了，因为磁盘已经持久化存储了，可以理解为每条日志就做了一个快照。

Disk-based 状态机的主要问题是，磁盘会导致性能不佳。在没有写缓冲的情况下，每应用一条命了都需要进行一次或多次随机磁盘写入，这会限制系统的整体吞吐量。

Disk-based 状态机仍然需要支持向日志落后的 Follower 提供最新的快照，而写快照也要继续提供服务，所以仍然需要 copy-on-write 技术以在一定期间内保持一个一致地快照传输。幸运的是，磁盘总是被划分为逻辑块，因此在状态机中实现应该是直接的。基于磁盘的状态机也可以依靠操作系统的支持，例如 Linux 的 LVM 也可以用来创建快照。

#### 1.2.1 增量清理的方法

增量的方法做压缩如 log cleaning 或 LSM tree，是可能的。他们快照的实现会更复杂，但有如下优点：

*   每次只操作数据的一部分，所以压缩的负载随着时间来看是均匀的。
*   写入磁盘的效率更高。它们使用大范围的、连续的写入。递增清理的方法可以有选择的压缩磁盘中拥有最多可重复使用空间的部分，可以写入更少的数据。
*   传递快照更为简单，因为它们不会 in-place 地修改磁盘的区域。

#### 1.2.2 Log cleaning

来自于 [The Design and Implementation of a Log-Structured File System](https://people.eecs.berkeley.edu/~brewer/cs262/LFS.pdf)。

Log cleaning 写入时直接追加，日志被切分为多个连续的 Segments。每一个 segment 通过以下三个步骤进行压缩：

*   首先选择要清理的段，这些段累积了大量废弃的记录；
*   把有效的记录(live entry)从那些段中拷贝到日志的开头
*   释放那些段的空间

为了最小化对正常操作的影响，这个过程应该并发地做。

由于将有效的记录转存到日志的头部，日志出现乱序，可以包含附加的信息(比如 version number)以在日志应用的时候重建正确的顺序。

选择哪些段做清理的策略对性能有非常大的影响。Log cleaning 建立了一个模型，不仅考虑live entry 的占比，同时考虑这些 entry 会存活多长时间。**但不幸的是，每个状态机的 live entry 会有所不同**。

#### 1.2.3 LSM tree

LSM tree 由于 BigTable 的提出被广泛使用。

LSM tree 是树型的数据结构，存储有序的键值对。在高层次上和 Log cleaning 一样：大的顺序写并且不 in-place 地修改磁盘上的数据。。然而，LSM tree 并没有在日志中维护所有状态，而是重新组织状态以便更好地进行随机读。

典型的 LSM tree 将最近的写入在磁盘上保持一份小的 log。当 log 达到一定的大小后，对 key 进行排序并且写入一个叫做 run 的文件中。Runs 不会 in-place 修改，但是会周期性地对 runs 进行 merge，产生新的 runs 并丢弃旧的，merge 的过程像 merge sort。

![](https://i.loli.net/2021/03/03/oWIq71g9eakLO6r.jpg)

在正常操作期间，状态机可以直接在这些数据上操作。对于读一个 key 来说，首先检查是否在最近的 log 中有修改，之后检查每一个 run。为了避免对每一个 run 做 key 的检查，一些系统对每一个 run 创建了 bloom filter。

#### 1.2.4 Raft 中的 Log cleaning 和 LSM tree

LogCabin 还未实现 Log cleaning 或 LSM tree，把 LSM tree 应用到 Raft 是直截了当的，因为 Raft 日志已经将最近的记录持久地存储在磁盘上，LSM tree 可以将最近的数据以更方便的树型保存在内存中，这将提高查找的性能。并且当 Raft 日志达到指定大小的时候，这个树按顺序写到磁盘作为一个新的 run。传输状态的时候 Leader 需要把所有的 run 发送给Follower(不包含内存中的树)；幸运的是，runs 都是不可变的，所以不必担心传输过程中 runs 被修改。

把 Log cleaning 应用到 Raft 就不是这么明显了。

![](https://i.loli.net/2021/03/03/KwAeYbOmDtnuWoy.jpg)

### 1.3 其它日志压缩

略。

## 2 性能优化

### 2.1 Writing to the leader’s disk in parallel

在前面的实现中，Leader 将日志写到磁盘后，再将该日志复制到它的 Follower，然后等待 Follower 将该日志写到他们的磁盘上。这里出现了两次连续的磁盘写入等待，这将导致显著的延迟。

Leader 可以在向 Follower 并行复制日志的同时写入自己的磁盘，如图：

![](https://i.loli.net/2021/03/03/3Ztc6qVuaB7bXKO.jpg)

a 是没有并行优化的，而 b 是进行并行优化的。

如果多数派 Follower 已经写入磁盘，Leader 甚至可以在该记录写入自己的磁盘之前就提交，这仍然是安全的。

### 2.2 Batch 和 Pipeline

Raft 支持 Batch 和 Pipeline，这两者对性能提升都很重要。

*   Batch：Leader 可以一次收集多个客户端 requests，然后一批发送给 Follower。当然，我们也需要有一个最大发送 size 来限制每次最多可以发送多少数据，LogCabin 使用 1M 大小。
*   Pipeline：如果只是用 batch，Leader 还是需要等待 Follower 返回才能继续后面的流程，我们这里还可以使用 Pipeline 来进行加速。Leader 会维护一个 `nextIndex` 的变量来表示下一个给 Follower 发送的 log 位置，通常情况下，只要 Leader 跟 Follower 建立起了连接，我们都会认为网络是稳定互通的。所以当 Leader 给 Follower 发送了一批 log 之后，它可以直接更新 `nextIndex`，并且立刻发送后面的 log，不需要等待 Follower 的返回。如果网络出现了错误，或者 Follower 返回一些错误，Leader 就重新调整 `nextIndex`，然后重新发送 log。

`AppendEntries RPC` 一致性检查保证了 pipeline 的安全性，但是，如果 RPC 失败/超时了，Leader 就要将 `nextIndex` 递减回到初始值重来。如果 `AppendEntries RPC` 一致性检查还是失败，Leader 可能进一步递减 `nextIndex` 重试发送前一个记录，或者等待前一个记录被确认。

最初的线程架构阻碍了 pipeline，因为它只能支持每个 Follower 一个 RPC。这里 Leader 必须多线程地与一个 Follower 建立多个连接。

如果 Leader 与一个 Follower 共用一个连接使用 pipeline 的话, 那么效果会是怎样的呢?其实这样和 Batch 没有多大区别，tcp 层面已经是串行的了，tcp 有滑动窗口来做 batch，同时单条连接保证了消息很少会乱序。

那么，如果使用多线程连接的话可能存在什么问题？即使因为在多个连接中不能保证有序，但是大部分情况还是先发送的先到达；即使后发送的先到达了，由于有 `AppendEntries RPC` 一致性检查的存在，后发送的自然会失败，失败后重试即可。

Raft 系统的整体性能在很大程度上取决于如何安排 batch 和 pipeline。如果在高负载的情况下，一个 batch 中积累的请求数量不够，整体处理效率就会很低，导致低吞吐量和高延迟。另一方面，如果在一个 batch 中积累了太多的请求，延迟将不必要地变高，因为早期的请求要等待后来的请求到达。

### 2.3 pre-vote

网络分区会导致某个节点的数据与集群最新数据差距拉大，但是 term 因为不断尝试选主而变得很大。网络恢复之后，Leader 向其进行日志复制时，就会导致 Leader 因为 term 较小而下台。这种情况可以引入 pre-vote 来避免。Follower 在转变为 Candidate 之前，先与集群节点通信，获得集群 Leader 是否存活的信息，如果当前集群有 Leader 存活，Follower 就不会转变为 Candidate，也不会增加term。

### 2.4 MultiRaft

来自 CockroachDB 的优化：https://www.cockroachlabs.com/blog/scaling-RAFT/

Raft 的 Leader 向 Follower 的心跳间隔一般都较小，在 100ms 粒度，当复制实例数较多的时候，心跳包的数量就呈指数增长。如图：

![](https://i.loli.net/2021/03/03/1FdxmHgjYuTwOqk.jpg)

这里将复制组之间的心跳合并到节点之间的心跳。如图：

![](https://i.loli.net/2021/03/03/zcNXjMZSORmeyn1.jpg)

[braft 提供了静默模式](https://github.com/baidu/braft/blob/master/docs/cn/raft_protocol.md)：通常复制组不需要频繁的切换 Leader，我们可以将主动 Leader Election 的功能关闭，这样就不需要维护 Leader Lease 的心跳了。复制组依靠业务 Master 进行被动触发 Leader Election，这个可以只在 Leader 节点宕机时触发，整体的心跳数就从复制实例数降为节点数。

## Reference

1.  [CONSENSUS BRIDGING THEORY AND PRACTICE](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf): [https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf)

2.  [理论基础 · Raft phd 论文中的pipeline 优化](http://mysql.taobao.org/monthly/2019/03/08/): [http://mysql.taobao.org/monthly/2019/03/08/](http://mysql.taobao.org/monthly/2019/03/08/)

3.  [TiKV 源码解析系列 - Raft 的优化](https://zhuanlan.zhihu.com/p/25735592): [https://zhuanlan.zhihu.com/p/25735592](https://zhuanlan.zhihu.com/p/25735592)

4.  [Scaling Raft](https://www.cockroachlabs.com/blog/scaling-RAFT/): [https://www.cockroachlabs.com/blog/scaling-RAFT/](https://www.cockroachlabs.com/blog/scaling-RAFT/)

5.  [RAFT介绍](https://github.com/baidu/braft/blob/master/docs/cn/raft_protocol.md): [https://github.com/baidu/braft/blob/master/docs/cn/raft\_protocol.md](https://github.com/baidu/braft/blob/master/docs/cn/raft_protocol.md)


## 相关阅读
