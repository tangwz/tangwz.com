---
title: "Golang 实现 Paxos 分布式共识算法"
pubDatetime: 2020-12-13T00:00:00+00:00
modDatetime: 2020-12-13T00:00:00+00:00
description: "前文《理解 Paxos》只包含伪代码，帮助了理解但又不够爽，既"
tags:
  - "分布式"
canonicalURL: "https://tangwz.com/posts/202012-impl-basic-paxos/"
draft: false
---

<!-- migrated-from: https://tangwz.com/posts/202012-impl-basic-paxos/ -->

前文[《理解 Paxos》](https://mp.weixin.qq.com/s/lbauCATMesqTEeIQuCsz9A)只包含伪代码，帮助了理解但又不够爽，既然现在都讲究 **Talk is cheap. Show me the code.** 这次就把文章中的伪代码用 Go 语言实现出来，希望能帮助各位朋友更直观的感受 Paxos 论文中的细节。

但我们需要对算法做一些简化，有多简单呢？**我们不持久化存储任何变量，并且用 `chan` 直接代替 RPC 调用。**

代码地址：[https://github.com/tangwz/paxos/tree/naive](https://github.com/tangwz/paxos/tree/naive)

**记得切换到 naive 分支。**

## 定义相关结构体

我们定义 Proposer 如下：

```go
type proposer struct {
	// server id
	id int
	// the largest round number the server has seen
	round int
	// proposal number = (round number, serverID)
	number int
	// proposal value
	value     string
	acceptors map[int]bool
	net       network
}
```

这些结构体成员都很容易理解，其中 `acceptors` 我们主要用来存储 Acceptors 的地址，以及记录我们收到 Acceptor 的成功/失败响应。

Acceptor 的结构体：

```go
type acceptor struct {
	// server id
	id int
	// the number of the proposal this server will accept, or 0 if it has never received a Prepare request
	promiseNumber int
	// the number of the last proposal the server has accepted, or 0 if it never accepted any.
	acceptedNumber int
	// the value from the most recent proposal the server has accepted, or null if it has never accepted a proposal
	acceptedValue string

	learners []int
	net      network
}
```

主要成员解释都有注释，简单来说我们需要记录三个信息：

- `promiseNumber`： 承诺的提案编号
- `acceptedNumber`： 接受的提案编号
- `acceptedValue`： 接受的提案值

## 定义消息结构体

消息结构体定义了 Proposer 和 Acceptor 之间、Acceptor 和 Leaner 之间的通讯协议。最主要的还是 Paxos 的两阶段的四个消息。

- Phase 1 请求：**提案编号**
- Phase 1 响应：如果有被 Accepted 的提案，返回**提案编号**和**提案值**
- Phase 2 请求：**提案编号**和**提案值**
- Phase 2 响应：Accepted 的**提案编号**和**提案值**

这样看，我们的消息结构体只需要提案编号和提案值，加上一个消息类型，用来区分是哪个阶段的消息。消息结构体定义在 message.go 文件，具体如下：

```go
// MsgType represents the type of a paxos phase.
type MsgType uint8

const (
	Prepare MsgType = iota
	Promise
	Propose
	Accept
)

type message struct {
	tp     MsgType
	from   int
	to     int
	number int    // proposal number
	value  string // proposal value
}
```

## 实现网络

网络上可以做的选择和优化很多，但这里为了保持简单的原则，我们将网络定义成 `interface`。后面完全可以改成 RPC 或 API 等其它通信方式来实现（没错，我已经实现了一个 Go RPC 的版本了）。

```go
type network interface {
	send(m message)
	recv(timeout time.Duration) (message, bool)
}
```

接下里我们去实现 network 接口：

```go
type Network struct {
	queue map[int]chan message
}

func newNetwork(nodes ...int) *Network {
	pn := &Network{
		queue: make(map[int]chan message, 0),
	}

	for _, a := range nodes {
		pn.queue[a] = make(chan message, 1024)
	}
	return pn
}

func (net *Network) send(m message) {
	log.Printf("net: send %+v", m)
	net.queue[m.to] <- m
}

func (net *Network) recvFrom(from int, timeout time.Duration) (message, bool) {
	select {
	case m := <-net.queue[from]:
		log.Printf("net: recv %+v", m)
		return m, true
	case <-time.After(timeout):
		return message{}, false
	}
}
```

就是用 `queue` 来记录每个节点的 `chan`，key 则是节点的 server id。

发送消息则将 `Message` 发送到目标节点的 `chan` 中，接受消息直接从 `chan` 中读取数据，并等待对应的超时时间。

不需要做其它网络地址、包相关的东西，所以非常简单。具体在 `network.go` 文件。

## 实现单元测试

这个项目主要使用 go 单元测试来检验正确性，我们主要测试两种场景：

- TestSingleProposer（单个 Proposer）
- TestTwoProposers（多个 Proposer）

测试代码通过运行 Paxos 后检查 Chosen 返回的提案值是否符合预期。

## 实现算法流程

按照角色将文件分为 proposer.go, acceptor.go 和 learner.go，每个文件都有一个 `run()` 函数来运行程序，`run()` 函数执行条件判断，并在对应的阶段执行对应的函数。

按照伪代码描述，我们很容易实现 Phase 1 和 Phase 2，把每个阶段的请求响应都作为一个函数，我们一步步来看。

### 第一轮 Prepare RPCs 请求阶段：

```go
// Phase 1. (a) A proposer selects a proposal number n
// and sends a prepare request with number n to a majority of acceptors.
func (p *proposer) prepare() []message {
	p.round++
	p.number = p.proposalNumber()
	msg := make([]message, p.majority())
	i := 0

	for to := range p.acceptors {
		msg[i] = message{
			tp:     Prepare,
			from:   p.id,
			to:     to,
			number: p.number,
		}
		i++
		if i == p.majority() {
			break
		}
	}
	return msg
}

// proposal number = (round number, serverID)
func (p *proposer) proposalNumber() int {
	return p.round<< 16 | p.id
}
```

Prepare 请求阶段我们将 round+1 然后发送给多数派 Acceptors。

> 注：这里很多博客和教程都会将 Prepare RPC 发给**所有的** Acceptors，6.824 的 paxos 实验就将 RPC 发送给所有 Acceptors。这里保持和论文一致，只发送给 a majority of acceptors。

### 第一轮 Prepare RPCs 响应阶段：

接下来在 `acceptor.go` 文件中处理请求：

```go
func (a *acceptor) handlePrepare(args message) (message, bool) {
	if a.promiseNumber >= args.number {
		return message{}, false
	}
	a.promiseNumber = args.number
	msg := message{
		tp:     Promise,
		from:   a.id,
		to:     args.from,
		number: a.acceptedNumber,
		value:  a.acceptedValue,
	}
	return msg, true
}
```

- 如果 `args.number` 大于 `acceptor.promiseNumber`，则承诺将不会接收编号小于 `args.number` 的提案（即 `a.promiseNumber = args.number`）。如果之前有提案被 Accepted 的话，响应还应包含 a.acceptedNumber 和 a.acceptedValue。
- 否则忽略，返回 `false`。

### 第二轮 Accept RPCs 请求阶段：

```go
func (p *proposer) accept() []message {
	msg := make([]message, p.majority())
	i := 0
	for to, ok := range p.acceptors {
		if ok {
			msg[i] = message{
				tp:     Propose,
				from:   p.id,
				to:     to,
				number: p.number,
				value:  p.value,
			}
			i++
		}

		if i == p.majority() {
			break
		}
	}
	return msg
}
```

当 Proposer 收到超过半数 Acceptor 的响应后，Proposer 向多数派的 Acceptor 发起请求并带上提案编号和提案值。

### 第二轮 Accept RPCs 响应阶段：

```go
func (a *acceptor) handleAccept(args message) bool {
	number := args.number
	if number >= a.promiseNumber {
		a.acceptedNumber = number
		a.acceptedValue = args.value
		a.promiseNumber = number
		return true
	}

	return false
}
```

Acceptor 收到 `Accept()` 请求，在这期间如果 Acceptor 没有对比 a.promiseNumber 更大的编号另行 Promise，则接受该提案。

### 别忘了：Learning a Chosen Value

在 Paxos 中有一个十分容易混淆的概念：Chosen Value 和 Accepted Value，但如果你看过论文，其实已经说得非常直接了。论文的 2.3 节 Learning a Chosen Value 开头就说：

> To learn that a value has been chosen, a learner must find out that a proposal has been accepted by a majority of acceptors.

所以 Acceptor 接受提案后，会将接受的提案广播 Leaners，一旦 Leaners 收到超过半数的 Acceptors 的 Accepted 提案，我们就知道这个提案被 Chosen 了。

```go
func (l *learner) chosen() (message, bool) {
	acceptCounts := make(map[int]int)
	acceptMsg := make(map[int]message)

	for _, accepted := range l.acceptors {
		if accepted.number != 0 {
			acceptCounts[accepted.number]++
			acceptMsg[accepted.number] = accepted
		}
	}

	for n, count := range acceptCounts {
		if count >= l.majority() {
			return acceptMsg[n], true
		}
	}
	return message{}, false
}
```

## 运行和测试

代码拉下来后，直接运行：

```
go test
```

## 写在后面

### 为什么不用 mit 6.824 的课程代码？

之前我曾把 mit 6.824 的 Raft 答案推到自己的 Github，直到 2020 开课的时候 mit 的助教发邮件让我将我的代码转为 private，因为这样会导致学习课程的人直接搜到代码，而无法保证作业独立完成。

确实，实验是计算机最不可或缺的环节，用 mit 6.824 2015 的 paxos 代码会导致很多学习者不去自己解决困难，直接上网搜代码，从而导致学习效果不好，违背了 mit 的初衷。

当然，你也可以说现在网上以及很容易搜到 6.824 的各种代码了，但出于之前 mit 助教的邮件，我不会将作业代码直接发出来。

感兴趣的同学可以到 2015 版本学习：http://nil.csail.mit.edu/6.824/2015/

### 未来计划

- 实现一个完整的（包含网络和存储的） Paxos
- 基于 Paxos 实现一个 Paxos KV 存储
- 实现其它 Paxos 变种

欢迎各位朋友催更……

## 结语

本文代码在 Github 上，如本文有什么遗漏或者不对之处，或者各位朋友有什么新的想法，欢迎提 issue 讨论。
