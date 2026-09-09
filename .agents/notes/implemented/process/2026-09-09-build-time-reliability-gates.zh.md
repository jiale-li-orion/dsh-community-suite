# Agent Note：插件加载失败的两道构建期门禁

Status: implemented

[English](2026-09-09-build-time-reliability-gates.md) | 中文

## 问题

插件市场那批改动里有两个缺陷进入了运行中的部署，而且对操作者看起来完全一样：插件页显示 "Failed to load plugins"，服务端却照常服务。两者都没有让构建、类型检查或任何单元测试失败。

1. 生成的 Remote 代码 import 了 `zod`，但 `plugin-catalog-awesome` 与 `plugin-install` 都没声明它。bundler 于是把 `require("zod")` 留成外部引用，而浏览器模块表只有三种来源——平台 seed 词、shell static、已注册的插件 bundle——该 bundle 永远加载不了。重启进程也没用，因为故障在浏览器侧。
2. `@Remote('install')` 撞上了 `RemoteNamespaceService.prototype` 上的 `install`。gateway 在挂载 namespace 时就拒绝这种描述符，于是那一行什么都没贡献，它的面板也失去了 Remote 面。

两者的共同点是：它们都能从构建产物和源码判定，不需要运行中的服务端，也不需要浏览器。

## 决定

**构建步骤执行每个客户端 bundle 的注册信封，并检查它的外部 require。** `pnpm run verify-client-bundles`（接在 `pnpm run build` 的库构建与 web 构建之间）发现每个声明了 `./client` 的包，读取它产出的 `lib/client.js`，在 `node:vm` 里跑顶层 `window.__ModuleLoader__.load({ id, factory })` 调用而**不**执行 factory，然后断言：该 bundle 只注册一次且 id 等于包名；每个字面量 `require("<specifier>")` 都是模块表里的词。被外置的未声明依赖会在这里当场失败，不必等到有人重启部署。seed 词从 `packages/client/web/src/platform.ts` 按文本读取，因为 host 面不得 import 客户端工程文件。

**Typert 分析器拒绝 namespace 服务自答的 Remote 名。** `@deepseek-ai/dsh-typert-protocol` 导出 `REMOTE_RESERVED_NAMES`；客户端 gateway 用它做挂载期检查，分析器则对**显式 `@Remote('name')`** 和**裸方法名本身保留**两种形态都让生成失败，并给出建议加后缀改名的诊断（`install` → `installPlugin`）。

**同一步还检查每条声明的图边。** 每个 `dsh.client.inject` 条目必须是已注册的客户端 bundle 或平台 seed 模块。指向 host-only 包的边今天只是惰性元数据，但它声称了一个客户端图永远不会有的一行；真正提供该服务的包才是该写在这里的东西。

已有的[纯净门禁](../architecture/2026-07-23-client-plugin-loading-model.md)在构建期判断插件的*源码* import 是否落在平台清单内；这一步判断的是*产出*的信封是否能在运行期模块表里解析，因此「bundler 在没有任何源码层违规的情况下把依赖外置」也会被抓到。

**分析器自持一份该清单的副本。** `tsdown.config.ts` 从生成器**上一次构建**的 `lib/types/tsdown-plugin.js` 加载它，而它经 `lib/` 产物解析工作区 import。因此在构建期 import 一个「由本次构建引入的常量」会死锁：必须导出该常量的产物，正是本次构建要产出的东西。副本由 `packages/typert/generator/tests/remote-model.spec.ts` 里的等价断言守护——测试经 tsconfig `paths` 把两侧都解析到源码，不一致即红。

## 考虑过的替代方案

- **靠重启并盯页面来发现。** 否决：它需要一个人、一个浏览器、以及每个缺陷一次重启，而这两个缺陷恰恰都是在这么做的过程中存活下来的。
- **为出问题的两个 bundle 各加一个单元测试。** 否决：它钉住已知的两个案例，却漏掉下一个「忘记声明生成代码依赖」的包。
- **在 bundler 配置里检查 externals。** 否决：模块表在浏览器 shell 里，只有 shell 自己的词表能决定一个 specifier 能否解析；bundler 侧的允许清单会变成第二份、且会漂移的事实来源。
- **让分析器 import `REMOTE_RESERVED_NAMES`。** 否决：构建无法自举它自己正要引入的导出（见上）。
- **在生成期从构建好的 namespace 服务推导保留名。** 否决：这让生成依赖运行期产物，并且在第一次新增成员的那次构建上仍然会失败。

## 后果

`pnpm run build` 现在会在「加载不了的客户端 bundle」上失败，Typert 生成也会在保留 Remote 名上失败，所以这两类缺陷都在部署重启之前被拦住。代价是多了一个覆盖 41 个 bundle 的构建步骤，以及一份十一项的名字副本加一条漂移测试。这条门禁同时定住了契约的形状：客户端 bundle 的依赖必须被声明、被内联，或者已经在模块表里。

## 测试

`scripts/verify-client-bundles.spec.ts` 用合成 bundle 驱动检查器，证明五条拒绝路径：未知外部、图边指向不存在的行、注册 id 不符、信封抛错、零注册。`packages/typert/generator/tests/remote-model.spec.ts` 覆盖显式保留名、裸保留方法名，以及清单等价。`pnpm run build:lib:host` 是「生成器不再 import 工作区产物」的集成证明。
