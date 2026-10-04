---
title: "软件架构基础 3: 什么是好的模块化代码？高内聚、低耦合如何衡量？"
pubDatetime: 2021-01-14T00:00:00+00:00
modDatetime: 2021-01-14T00:00:00+00:00
description: "《软件架构基础（Fundamentals of Software Architecture）》读书笔记（3）"
tags:
  - "架构"
canonicalURL: "https://tangwz.com/posts/202101-fosa3/"
draft: false
---

<!-- migrated-from: https://tangwz.com/posts/202101-fosa3/ -->

## 0\. 写在前面

什么是好的代码？好的代码应该模块化。

王垠在其[《编程的智慧》](https://www.yinwang.org/blog-cn/2015/11/21/programming-philosophy)中也提到，要“写模块化的代码”。(不对人做评价，这篇文章写得是非常好的。)

如果你读过《代码大全》和《代码整洁之道》等书，一定对\*\*“高内聚、低耦合”\*\*不陌生。

**好的模块化代码就是要高内聚、低耦合。**

事实上，内聚和耦合是 1972 年就提出的概念，由于耦合不好具体的衡量，Meilir Page-Jones 在 1992 年提出了共生性（Connascence）。本章重点就是介绍如何评估模块化架构，以及引入共生性这一概念来帮助更好的模块化。

## 1\. 模块化

不同的平台、语言为代码提供了不同的复用机制，将相关代码组合成模块。

理解模块对于架构师来说非常重要，因为用来分析架构的工具（可视化等）常常都依赖于模块化的概念。如果一个架构师在设计一个系统时，没有注意到各个部分是如何连接在一起的，那么他们最终创建的系统会带来无数的问题。

架构师必须保持良好的结构，这不会偶然发生。

模块的代码到底是什么？我们用模块化来描述相关代码中的逻辑分组，这些模块可以用来构造一个更复杂的结构。

现代的语言有各种各样的封装机制，例如，许多语言可以在函数/方法、类、包/命名空间中定义行为，每个包都有不同的可见性和范围规则。（这有时候也会让开发人员选择困难）

架构师必须意识到开发者是如何组织包的，如果几个包紧密的耦合在一起，那么重用其中一个包就变得非常困难。

鉴于模块化的重要性，研究人员提供了各种语言无关的标准来衡量，我们专注于三个关键概念：

- 内聚（Cohesion）
- 耦合（Coupling）
- 共生性（Connascence）（注：参考[《UML面向对象设计基础》](https://book.douban.com/subject/10737799/)的翻译）

## 2\. 内聚（Cohesion）

内聚性是指子程序中各种操作之间联系的紧密程度，我们的目标是让每一个模块只做好一件事，不去做其他事情。

> 试图分割一个内聚的模块只会导致耦合性增加和可读性降低。（Attempting to divide a cohesive module would only result in increased coupling and decreased readability.） —— Larry Constantine

![](https://s2.loli.net/2022/10/08/6GNUwBlED5vRmbn.jpg)

计算机科学家们已经定义了一系列的内聚的衡量标准，从最好到最坏列出如下：

- 功能性内聚（Functional cohesion）：模块内所有元素都为完成同一个功能而存在，共同完成一个单一的功能，模块已不可再分，具有最高的内聚；
- 顺序内聚（Sequential cohesion）：模块必须顺序执行；
- 通信内聚（Communicational cohesion）：两个不同操作的模块使用同样的数据。例如，在数据库中添加一条记录，并根据该信息生成一封邮件；
- 过程内聚（Procedural cohesion）：两个模块必须以特定的次序执行。
- 时间内聚（Temporal cohesion）：把需要同时执行的动作组合在一起形成的模块。
- 逻辑内聚（Logical cohesion）：这种模块把几种相关的功能组合在一起， 每次被调用时，由传送给模块参数来确定该模块应完成哪一种功能。
- 巧合内聚（Coincidental cohesion）：模块内的各个元素之间没有任何联系，只是偶然地被凑到一起；内聚程度最低。

![](https://s2.loli.net/2022/10/08/8vpR6lMsAuCDNgb.jpg)

内聚不容易考量，特定的模块需要架构师来具体决定，例如，考虑一个模块定义了：

Customer：

- add customer
- update customer
- get customer
- notify customer
- get customer orders
- cancel customer orders

或者说将后两个函数剥离出来，分成两个模块：

Customer：

- add customer
- update customer
- get customer
- notify customer

Order：

- get customer orders
- cancel customer orders

哪个更好？一如既往，这要看情况：

- 订单只有这两个操作吗？如果是这样，将这些操作放在客户包中维护可能是有意义的；
- 客户包按预期是否会变得更大？
- 订单是否需要如此多的客户信息？

这些问题代表了软件架构师工作核心的权衡分析。

由于内聚非常主观，计算机科学家制定了一个标准来衡量内聚性，其中 **LCOM(Lack of Cohesion in Methods)** 为著名。这里涉及到的数学公式平时很少用到，在此不再展开，只需要知道有这么一个公式，在需要的时候可以再查询拿出来用。想进一步了解的读者可以查看：[https://en.wikipedia.org/wiki/Programming_complexity](https://en.wikipedia.org/wiki/Programming_complexity)

## 3\. 耦合（Coupling）

我们常常谈到要“解耦”，弱耦合是系统可维护的关键。

耦合其实也有多种类型，但在此不再介绍，因为它们已经被共生性（Connascence）所取代。

## 4\. 共生性（Connascence）

1996 年 Meilir Page-Jones 发表了 [《What Every Programmer Should Know About Object-Oriented Design》](https://dl.acm.org/doi/book/10.5555/231061)，完善了耦合的度量，并命名为：Connascence。

他是这样定义的：

> 如果一个组件的改变会要求另一个组件进行修改，才能保持系统的整体正确性，那么这两个组件就是共生的。 —— Meilir Page-Jones

共生性分为静态的和动态的。我们将分别介绍各种类型的共生性，对于部分重要的、不易理解的，我将补充一些代码案例，作为具体的参考来帮助理解。

**静态共生性：**

### 4.1 名称共生性（Connascence of Name, CoN）

`methodA()` 改名为 `methodB()` 时,　调用 `methodA()` 的地方都要改名，这是代码库中最常见的耦合方式，现代的 IDE 的检索功能使修改代码的名称变得很容易，这是最理想的耦合方式；

![](https://s2.loli.net/2022/10/08/5SEocW9LM4z1G3y.jpg)

### 4.2 类型共生性（Connascence of Type, CoT)

如果一个变量从值 100 变成了一个很大的数，变量的类型可能要从 int 改成 BigInteger

### 4.3 意义共生性（Connascence of Meaning, CoM）

例如，在很多语言中，通常会把大于 0 的数字认为是 True，0 认为是 False。下面是 Java 中的一个具体例子：

```java
a.compareTo(b)
// 如果 a = b，则返回值 0；
// 如果 a > b，则返回大于 0 的值；
// 如果 a < b，则返回小于 0 的值。
```

### 4.4 位置共生性（Connascence of Position, CoP）

函数的参数的位置顺序或个数耦合，例如下面的函数增加一个参数后，函数调用将会出错。

![](https://s2.loli.net/2022/10/08/3Gh7R8QvAUf6pjS.jpg)

![](https://s2.loli.net/2022/10/08/wGxCyqflgDovW8p.jpg)

针对这个例子，我们可以通过下面的办法，将位置共生性转为名称共生性来降低耦合性：

```javascript
class User { FirstName, LastName, Address }
void SaveUser(User);

myrepo.SaveUser(new User{
        FirstName = "bob",
        LastName = "Marley",
        Address = "Jamaica"});
```

### 4.5 算法共生性（Connascence of Algorithm, CoA）

多个组件必须就一个特定的算法达成一致。例如：客户端和服务端用相同的算法验证用户身份。这代表一种较高的耦合形式——如果算法细节改变，验证将不再有效。

---

**动态共生性：**

### 4.6 执行共生性（Connascence of Execution, CoE）

代码的执行顺序上的耦合。例如下面的代码，在设置主题之前就发送了，明显在顺序上有问题。

```
email = new Email();
email.setRecipient("foo@example.com");
email.setSender("me@me.com");
email.send();
email.setSubject("whoops");
```

### 4.7 时间共生性（Connascence of Timing, CoT）

常见情况是两个线程同时执行造成的竞赛条件。

这里我们可以看一个有趣的例子，发生在 bootstrap 的一个 issue：[https://github.com/twbs/bootstrap/issues/3902](https://github.com/twbs/bootstrap/issues/3902)

```javascript
// using bootstrap modal
$(element).modal("hide");
$(element).modal("show"); // Error!

// 隐藏一个 modal 大约需要 500ms 的动画，
// 如果你在这时候直接调用了 'show'，将会发生异常

// 我们必须这样做
$(element).modal("hide");
$(element).on("hidden.bs.modal", () => {
  $(element).modal("show"); // ok
});
```

### 4.8 值共生性（Connascence of Values, CoV）

常见的情况在分布式事务中，例如需要在多个独立的数据库中做分布式事务。

### 4.9 身份共生性（Connascence of Identity, CoI）

两个独立的模块需要共享和更新同一个数据结构，例如：分布式队列。

## 5\. 共生性的属性

### 5.1 强度（Strength）

Page-Jones 指出，共生性有明确的强弱谱系，如下图所示，按强度递增排序。identity 具有最强的共生性，name 具有最弱的共生性。——也就是说用 name 的方式耦合则为最弱的耦合方式。

![](https://s2.loli.net/2022/10/08/Jb2KGNITkjmpc3P.jpg)

**架构师应该倾向于静态共生性而不是动态共生性**，因为开发人员可以通过现代的 IDE 来很快地确定它。

### 5.2 局部性（Locality）

局部性指两个模块的之间的远近程度。

通常情况下，在同一模块中、距离较近的类比在不同模块中、距离距离较远的类具有更高的共生性。换句话说，随着两个模块在代码中的距离增加，共生性会减弱。

### 5.3 程度（Degree）

共生性的程度与模块的影响大小有关——它影响了几个类还是几十个类？影响较小的共生性对代码库的损坏就较小。

## 6\. 如何通过共生性来提高系统模块化

讲了这么多，我们到底如何实践共生性呢？

Page-Jones 提供了三个使用共生性来提高系统模块化的指南： 1.通过将系统拆分成封装的元素，使得整体的共生性达到最弱 2.最大限度地减少任何跨越封装边界的共生性 3.最大限度地提高封装边界的共生性

Jim Weirich （传奇的软件架构创新者，Ruby 社区活跃人士）简化了上面较为抽象的指导，提供了两个更具体的建议：

- **程度法则（Rule of Degree）：将强共生性转化为弱共生性。**
- **局部性规则（Rule of Locality）：随着软件元素之间距离的增加，应使用较弱的共生性。**

## 7\. 耦合性和共生性

从架构师的角度来看，耦合和共生是有所重叠的，这是不同时代的产物，下图列出两者重叠的部分：

![](https://s2.loli.net/2022/10/08/tJkAi3D86nZRNG7.jpg)

共生性提供了更精细化的考量，例如左边的数据耦合，在右边的静态共生性提供了更具体的建议。

## 8\. 局限性

尽管如此，架构师在应用这些指标来分析和设计系统时，存在几个问题：

- 这些度量从代码层面考察细节，关注代码质量，而不一定是架构。架构师更关注模块如何耦合，而不是耦合程度，例如，架构师关心的是同步或异步通信，而不关心如何实现。
- 共生性并没有真正解决许多现代架构师必须做出的一个基本决定–在分布式架构（例如：微服务）中，使用同步还是异步通信？在后面会介绍新的方法来思考现代的共生性。

虽然对模块化进行了大量的介绍和思考，**开发人员和架构师在实际实施过程中，还是会遇到很多的困难。**

纸上得来终觉浅，绝知此事要躬行。

设计良好的架构，并非易事！
