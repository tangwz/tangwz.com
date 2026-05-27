---
title: "如何编写 C++ 20 协程(Coroutines)"
pubDatetime: 2021-03-06T00:00:00+00:00
modDatetime: 2021-03-06T00:00:00+00:00
description: "C++20 带着 Coroutines 来了！ 花了一两周的时间后，我想写写 C++20 协程的基本用法，"
tags:
  - "C++"
canonicalURL: "https://tangwz.com/posts/202103-cpp-coroutine/"
ogImage: "./assets/featured.png"
draft: false
---
<!-- migrated-from: https://tangwz.com/posts/202103-cpp-coroutine/ -->

C++20 带着 Coroutines 来了！

花了一两周的时间后，我想写写 C++20 协程的基本用法，因为 C++ 的协程让我感到很奇怪，写一个协程程序十分费劲。让我们抛去复杂的东西，来看看写一个 C++ 协程需要哪些东西。

## 编译器支持

由于 C++ 20 还没被所有编译器完全支持，首先需要确保你的编译器实现了 Coroutines，可以通过下面的网站查看编译器支持情况：https://en.cppreference.com/w/cpp/compiler\_support#cpp20

值得一提，我使用的 MacOS 自带的 Apple Clang 对 C++20 支持很弱，我选择通过 Homebrew 安装最新版的 GNU GCC (10 以上版本)来编译。

我使用的 GNU GCC 10.2 版本编译指令：

```
g++ -fcoroutines -std=c++20
```

**Clang 支持不够好，不推荐使用**。Clang 可以使用如下命令编译：

```
clang++ -std=c++20 -stdlib=libc++ -fcoroutines-ts
```

不推荐 Clang 还有一个理由：使用 Clang 需要 include 头文件 `<experimental/coroutine>` 而不是 `<coroutine>`。此外，一些类型被命名为 `std::experimental:xxx` 而不是 `std:xxx`。

以下示例代码只支持 GNU GCC 版本的编译器。

## C++ 协程简介

在正式开始之前，我们先要理解 C++20 中协程使用的一些术语。

首先，什么是协程？

协程就是一个可以\*\*挂起(suspend)**和**恢复(resume)\*\*的函数(但无论如何不能是 main 函数)。你可以暂停协程的执行，去做其他事情，然后在适当的时候恢复到暂停的位置继续执行。**协程让我们使用同步方式写异步代码**。

怎么挂起协程呢？C++ 提供了三个方法：`co_await`, `co_yield` 和 `co_return`。

> 顺便说一句：coroutine 不是并行(parallelism)，和 Go 语言的 goroutine 不一样！

与你之前接触到的协程完全不同，一个 C++ 协程一般长这样：

```c++
struct ReturnObject {

    struct promise_type {

        ReturnObject get_return_object() { return {}; }

        std::suspend_never initial_suspend() { return {}; }

        std::suspend_never final_suspend() { return {}; }

        void unhandled_exception() {}

    };

};

struct Awaitable {

    std::coroutine_handle<> *hp_;

    constexpr bool await_ready() const noexcept { return false; }

    void await_suspend(std::coroutine_handle<> h) { *hp_ = h; }

    void await_resume() noexcept {

        std::cout << "Event signaled, resuming." << std::endl;

    }

};

ReturnObject counter(std::coroutine_handle<> *continuation_out) {

    Awaitable a{continuation_out};

    for (unsigned i = 0;; ++i) {

        co_await a;

        std::cout << "counter: " << i << std::endl;

    }

}
```

这奇怪的协程代码涉及了 C++ 协程很重要的三个概念：

*   `promise_type`
*   `Awaitable`
*   `std::coroutine_handle<>`

在写 C++20 的协程之前，我们必须需要先了解三个概念，可以用这三张图来形容这三个概念：

![](https://i.loli.net/2021/03/06/9om1brcaIDQl374.jpg)

_图来源: [https://www.youtube.com/watch?v=vzC2iRfO\_H8](https://www.youtube.com/watch?v=vzC2iRfO_H8)_

## Promise

C++ 协程的**返回类型**必须是 `promise_type`，`promise_type` 是一个 interface，你可以用它来控制协程，在协程的生命周期中注入自定义行为：

*   `get_return_object`： 控制协程的返回对象
*   `initial_suspend`：在协程开始的时候挂起
*   `final_suspend`：在协程结束的时候挂起

协程的生命周期如下，用户自定义的函数 `<function-body>` 被包裹在下面的伪代码中(来源：http://eel.is/c++draft/dcl.fct.def.coroutine#5)：

```c++
{

   promise-type promise promise-constructor-arguments ;

   try {

      co_await promise.initial_suspend() ;

      <function-body>

   } catch ( ... ) {

      if (!initial-await-resume-called)

         throw ;

      promise.unhandled_exception() ;

   }

final-suspend :

   co_await promise.final_suspend() ;

}

// coroutine 被销毁
```

可以看到，`initial_suspend` 会在进入协程(也就是函数)之前执行，`final_suspend` 会在协程返回之前执行。

如果 `final_suspend` 真的挂起了协程，那么作为协程的调用者，你需要手动的调用 destroy 来释放协程；如果 `final_suspend` 没有挂起协程，那么协程将自动销毁。先记住这句话，在后面还会提到。

除此之外，Promise 还有一些其它责任：

*   `return_void()`/`return_value()`/`yield_value()` 方法: 用来控制 `co_return` 和 `co_yield` 的行为；
*   `unhandled_exception()` 处理异常
*   创建和销毁协程的 `stackframe`
*   处理 `stackframe` 创建可能发生的异常

> stackframe ：函数运行时占用的内存空间，是栈上的数据集合，它包括：

*   Local variables
*   Saved copies of registers modified by subprograms that could need restoration
*   Argument parameters
*   Return address

## Awaitable

第二个概念是 `Awaitable`，`Awaitable` 负责管理协程挂起时的行为。

一个 Awaitable 对象可以成为 `co_await` 调用的对象。Awaitable 拥有以下方法：

*   `await_ready()`：是否要挂起，如果返回 true，那么 `co_await` 就不会挂起函数；
*   `await_resume()`：`co_await` 的返回值，通常返回空；
*   `await_suspend()`：协程挂起时的行为；

> 可以在 `await_suspend` 中实现 `await_ready` 的效果，例如直接不挂起当前的协程，但在调用 `await_suspend` 之前，编译器必须将所有状态捆绑到协程的 `stackframe` 中，这会更耗时。

有时候我们的协程并不需要自定义复杂的行为，C++ 提供了两个默认的 `Awaitable`：

```c++
namespace std {

    struct suspend_never {

        constexpr bool await_ready() const noexcept { return true; }

        constexpr void await_suspend(coroutine_handle<>) const noexcept {}

        constexpr void await_resume() const noexcept {}

    };



    struct suspend_always {

        constexpr bool await_ready() const noexcept { return false; }

        constexpr void await_suspend(coroutine_handle<>) const noexcept {}

        constexpr void await_resume() const noexcept {}

    };

}
```

`suspend_always::await_ready()` 总是返回 false，而 `suspend_always::await_ready()` 总是返回 true。其他的方法都是空的，没有任何作用。

如果没有其它多余的行为，我们可以在函数中直接调用 `co_await std::suspend_always{}` 来挂起一个函数。

## Coroutine Handle

`co_await` 挂起函数，并创建了一个可调用对象，这个对象可以用来恢复Hanns乎的执行。这个可调用对象的类型就是 `std::coroutine_handle<>`，最常用的两个方法是：

*   `handle.resume()`：恢复协程的执行；
*   `handle.destroy()`：销毁协程；

`Coroutine Handle` 很像指针，我们可以复制它，但析构函数不会释放相关状态的内存。为了避免内存泄漏，一般要调用 `handle.destroy()` 来释放（尽管在某些情况下，协程会在完成后自行销毁——前文有提到）。同样像指针一样，一旦销毁了一个 `Coroutine Handle` ，指向同一个协程的另一个 `Coroutine Handle` 将指向垃圾，并在调用时表现出未定义行为。

学习更复杂的用法之前，我们先看下示例。

## 示例

```c++
#include <coroutine>

#include <iostream>

struct HelloCoroutine {

    struct HelloPromise {

        HelloCoroutine get_return_object() {

            return std::coroutine_handle<HelloPromise>::from_promise(*this);

        }

        std::suspend_never initial_suspend() { return {}; }

        // 在 final_suspend() 挂起了协程，所以要手动 destroy

        std::suspend_always final_suspend() { return {}; }

        void unhandled_exception() {}

    };

    using promise_type = HelloPromise;

    HelloCoroutine(std::coroutine_handle<HelloPromise> h) : handle(h) {}

    std::coroutine_handle<HelloPromise> handle;

};

HelloCoroutine hello() {

    std::cout << "Hello " << std::endl;

    co_await std::suspend_always{};

    std::cout << "world!" << std::endl;

}

int main() {

    HelloCoroutine coro = hello();



    std::cout << "calling resume" << std::endl;

    coro.handle.resume();



    std::cout << "destroy" << std::endl;

    coro.handle.destroy();

    return 0;

}
```

这个简短的示例展示了 C++ 实现协程 “Hello world” 程序。我们执行完 “Hello " 后挂起函数，又在执行 `handle.resume()` 后恢复函数的运行。

非常简单，不再过多解释。

## `co_yield`

C++ 协程与一个 Promise 交互之所以如此笨拙，有一个特殊原因就是为了 `co_yield`。

如果 promise 是当前协程的 Promise 对象，那么执行：

```c++
co_yield <expression>;
```

相当于执行了：

```c++
co_await promise.yield_value(<expression>);
```

所以，需要在 promise\_type 中添加一个 `yield_value` 方法。上面的例子可以改为：

```c++
#include <coroutine>

#include <iostream>

#include <string_view>

struct HelloCoroutine {

    struct HelloPromise {

        std::string_view value_;

        HelloCoroutine get_return_object() {

            return std::coroutine_handle<HelloPromise>::from_promise(*this);

        }

        std::suspend_never initial_suspend() { return {}; }

        std::suspend_always final_suspend() { return {}; }

        void unhandled_exception() {}

        std::suspend_always yield_value(std::string_view value) {

            value_ = value;

            std::cout << value_ << std::endl;

            return {};

        }

    };

    using promise_type = HelloPromise;

    HelloCoroutine(std::coroutine_handle<HelloPromise> h) : handle(h) {}

    std::coroutine_handle<HelloPromise> handle;

};

HelloCoroutine hello() {

    std::string_view s = "Hello ";

    co_yield s;

    std::cout << "world" << std::endl;

}

int main() {

    HelloCoroutine coro = hello();

    std::cout << "calling resume" << std::endl;

    coro.handle.resume();

    std::cout << "destroy" << std::endl;

    coro.handle.destroy();

    return 0;

}
```

可以用 `co_yield` 实现 Python 中的生成器，参考：https://lewissbaker.github.io/2018/09/05/understanding-the-promise-type

## `co_return`

执行 `co_return` 语句时：

```c++
co_return <expression>;
```

相当于执行了：

```c++
co_return promise.return_value(<expression>); goto end;
```

下面再给出示例加上 `co_return` 的版本：

```c++
#include <coroutine>

#include <iostream>

struct HelloCoroutine {

    struct HelloPromise {

        HelloCoroutine get_return_object() {

            return std::coroutine_handle<HelloPromise>::from_promise(*this);

        }

        std::suspend_never initial_suspend() { return {}; }

        std::suspend_always final_suspend() { return {}; }

        void unhandled_exception() {}

        void return_value(int value) {

            std::cout << "got co_return value " << value << std::endl;

        }

    };

    using promise_type = HelloPromise;

    HelloCoroutine(std::coroutine_handle<HelloPromise> h) : handle(h) {}

    std::coroutine_handle<HelloPromise> handle;

};

HelloCoroutine hello() {

    std::cout << "Hello " << std::endl;

    co_await std::suspend_always{};

    std::cout << "world!" << std::endl;

    co_return 42;

}

int main() {

    HelloCoroutine coro = hello();

    std::cout << "calling resume" << std::endl;

    coro.handle.resume();

    std::cout << "destroy" << std::endl;

    coro.handle.destroy();

    return 0;

}
```

## 复杂一些

到此， `Awaitable` 和 `Coroutine Handle` 好像还没有发挥什么作用，我写的示例程序都非常简单。

如果我们想在协程挂起的时候，做更多的动作，一般将 `Coroutine Handle` 传到 Awaitable 的 `await_suspend()` 中，用一个[官网的例子](https://en.cppreference.com/w/cpp/language/coroutines)展示一下：

```c++
#include <coroutine>

#include <iostream>

#include <stdexcept>

#include <thread>



auto switch_to_new_thread(std::jthread& out) {

  struct awaitable {

    std::jthread* p_out;

    bool await_ready() { return false; }

    void await_suspend(std::coroutine_handle<> h) {

      std::jthread& out = *p_out;

      if (out.joinable())

        throw std::runtime_error("Output jthread parameter not empty");

      out = std::jthread([h] { h.resume(); });

      // Potential undefined behavior: accessing potentially destroyed *this

      // std::cout << "New thread ID: " << p_out->get_id() << '\n';

      std::cout << "New thread ID: " << out.get_id() << '\n'; // this is OK

    }

    void await_resume() {}

  };

  return awaitable{&out};

}



struct task{

  struct promise_type {

    task get_return_object() { return {}; }

    std::suspend_never initial_suspend() { return {}; }

    std::suspend_never final_suspend() noexcept { return {}; }

    void return_void() {}

    void unhandled_exception() {}

  };

};



task resuming_on_new_thread(std::jthread& out) {

  std::cout << "Coroutine started on thread: " << std::this_thread::get_id() << '\n';

  co_await switch_to_new_thread(out);

  // awaiter destroyed here

  std::cout << "Coroutine resumed on thread: " << std::this_thread::get_id() << '\n';

}



int main() {

  std::jthread out;

  resuming_on_new_thread(out);

}
```

## 小结

本文简单介绍了 C++ 协程，希望下次你写 C++ 协程的时候，首先想到这三个东西：

![](https://i.loli.net/2021/03/06/9om1brcaIDQl374.jpg)

我不是编程语言专家，对于 C++ 也没有很深入的研究，C++ 在万众期待下终于支持了协程，但用了一下发现，C++ 的协程显得有些繁琐、怪异，或许是我不清楚 C++ 在原有情况下支持协程的困难，但我依然觉得 C++ 团队可以做得更好。

我本人确实还没明白到底该如何在项目中使用这臃肿的协程。

不过，可以预见到的是，我们会在越来越多的 C++ 项目中看到协程的身影。比如 facebook folly 就已经实现了一个实验阶段的协程框架: [https://github.com/facebook/folly/tree/master/folly/experimental/coro](https://github.com/facebook/folly/tree/master/folly/experimental/coro)

也许等我再研究一段时间，会写一篇到底该如何使用 C++ 协程。

## Reference

*   C++ Coroutine definitions: [http://eel.is/c++draft/dcl.fct.def.coroutine#5](http://eel.is/c++draft/dcl.fct.def.coroutine#5)
*   C++ draft expr.await: [http://eel.is/c++draft/expr.await](http://eel.is/c++draft/expr.await)
*   C++ Coroutines: Understanding the promise type: [https://lewissbaker.github.io/2018/09/05/understanding-the-promise-type](https://lewissbaker.github.io/2018/09/05/understanding-the-promise-type)
*   官网的例子：https://en.cppreference.com/w/cpp/language/coroutines
*   My tutorial and take on C++20 coroutines：https://www.scs.stanford.edu/~dm/blog/c++-coroutines.html#coroutine-handles
