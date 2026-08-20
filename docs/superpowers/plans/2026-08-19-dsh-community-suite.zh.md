# DSH Community Suite 实施计划

[English](2026-08-19-dsh-community-suite.md) | 中文

> **供 agentic worker 使用：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐项实施本计划。步骤以复选框（`- [ ]`）语法跟踪。

**目标：** 发布一个私有且历史简洁的仓库，包含适配后的 DSH rc.7 核心、归档会话 bundle、七个 anchored-standard preset、安装器和三仓库优化审计。

**架构：** DSH 源码树位于仓库根目录。第三方扩展存于 `community/` 下，作为树外 `dsh.bundle` 包和用户 agent preset 集合，符合官方对随附包和 profile 安装扩展的区分。创建孤立 `main` 快照，用 notices 而非导入 Git 对象来表示上游历史。

**技术栈：** Git、GitHub CLI、Node.js 22 ESM、pnpm 11.22、Cordis bundle manifest、DSH profile 与 agent preset、Node test runner、Vitest。

---

### 任务 1：创建简洁历史的仓库快照

**文件：**
- 创建仓库：`<workspace-root>/dsh-community-suite`
- 源快照：`<workspace-root>/deepseek-harness/.worktrees/integration-rc7-three-repos`

- [ ] **步骤 1：验证源 worktree 和固定输入**

运行：

```sh
git -C <workspace-root>/deepseek-harness/.worktrees/integration-rc7-three-repos status --short --branch
git -C <workspace-root>/dsh-archived-sessions status --short --branch
git -C <workspace-root>/dsh-anchored-standard status --short --branch
```

预期：集成 worktree 仅包含已提交的设计/计划变更；两个社区仓库均在 `local/rc7-compat` 上干净。

- [ ] **步骤 2：导出不含 Git 历史的受跟踪核心文件**

从集成 worktree 将 `git archive HEAD` 导出至尚不存在的 `<workspace-root>/dsh-community-suite`。归档按构造排除 `.git`、worktree、依赖、构建缓存、凭据和会话。

- [ ] **步骤 3：初始化新仓库**

运行：

```sh
git init -b main <workspace-root>/dsh-community-suite
git -C <workspace-root>/dsh-community-suite config user.name "$(git config user.name)"
git -C <workspace-root>/dsh-community-suite config user.email "$(git config user.email)"
```

预期：未出生的 `main` 分支没有 remote 和父提交。

### 任务 2：将社区模块作为源快照导入

**文件：**
- 创建：`community/bundles/archived-sessions/**`
- 创建：`community/presets/anchored-standard/**`
- 修改：`.gitignore`

- [ ] **步骤 1：复制受跟踪的 bundle 文件**

通过 `git archive` 将 `dsh-archived-sessions` 的 `local/rc7-compat` 导出到 `community/bundles/archived-sessions`。验证目标包含 `package.json`、`cordis.patch.yml`、`lib/`、`test/`、`README.md` 和 `LICENSE`，且没有 `.git` 目录。

- [ ] **步骤 2：复制受跟踪的 preset 文件**

通过 `git archive` 将 `dsh-anchored-standard` 的 `local/rc7-compat` 导出到 `community/presets/anchored-standard`。验证七个公开 preset 目录、`shared/`、`scripts/`、`test/`、`verify/`、包 manifest、notices 和许可证均存在且没有 `.git` 目录。

- [ ] **步骤 3：加入社区产物忽略规则**

若官方文件尚未覆盖，则向 `.gitignore` 追加：

```gitignore
/community/**/node_modules/
/community/**/.coverage/
/community/**/coverage/
```

- [ ] **步骤 4：逐字节验证导入快照**

比较每个源分支与目标之间的 `git archive` 文件列表和 SHA-256 值，只排除仓库元数据。预期没有丢失或变化的导入文件。

### 任务 3：添加安全的社区安装器

**文件：**
- 创建：`community/install.mjs`
- 创建：`community/install.test.mjs`
- 修改：`package.json`

- [ ] **步骤 1：编写会失败的安装器测试**

使用 `node:test` fixture 覆盖：

```js
test('installs all seven preset ids into an empty temporary DSH home')
test('refuses an existing preset without --update')
test('backs up and replaces an owned preset with --update')
test('passes only the web profile and local bundle path to dsh plugin add')
test('never reads or writes the sessions directory')
```

测试以 `--dsh-home <temporary path>` 和 `--dsh-command <recording fixture executable>` 调用 `community/install.mjs`。记录 fixture 将收到的 argv 和选定环境变量写在 DSH home 之外；测试期间 sentinel `sessions` 目录的模式为 `000`。

- [ ] **步骤 2：运行测试以验证失败**

运行：

```sh
node --test community/install.test.mjs
```

预期：因 `community/install.mjs` 不存在而失败。

- [ ] **步骤 3：实现参数解析和目标所有权**

`community/install.mjs` 接受 `--dsh-home <path>`、`--update`、`--presets-only` 及仅供测试使用的 `--dsh-command <path>`。它先解析非空 `DSH_HOME`，再使用 `${homedir()}/.dsh`。未知 flag、重复的带值 flag 和缺失值都在写入前以非零状态退出。

每个已安装 preset 获得包含以下内容的 `.dsh-community-suite.json`：

```json
{
  "source": "dsh-community-suite",
  "module": "anchored-standard",
  "presetId": "<public id>"
}
```

未使用 `--update` 时拒绝所有既有目标；使用时仅在标记匹配 preset id 时允许替换。

- [ ] **步骤 4：实现可恢复的 preset 替换**

在 `$DSH_HOME/backups/dsh-community-suite-<UTC timestamp>` 下创建备份根目录。删除目标前，将每个被替换 preset 复制到 `presets/<id>`。将每个源复制到同级临时目录、添加所有权标记后再重命名为最终目标，避免发布部分复制结果。

- [ ] **步骤 5：通过官方 CLI 路径安装 bundle**

除非设置 `--presets-only`，否则执行：

```text
<dsh-command> plugin --profile web add <absolute community/bundles/archived-sessions path>
```

继承环境中只设置选定的 `DSH_HOME`。执行前将现有 `profiles/web/package.json`、`pnpm-lock.yaml` 和 `cordis.patch.yml` 复制到 `backups/.../profile-web/`。不枚举或触碰 `$DSH_HOME/sessions`。

- [ ] **步骤 6：暴露根脚本**

添加这些脚本，且不改变官方命令：

```json
"community:check": "node --test community/install.test.mjs && npm --prefix community/bundles/archived-sessions test && npm --prefix community/presets/anchored-standard run check",
"community:install": "node community/install.mjs"
```

- [ ] **步骤 7：运行安装器测试**

运行 `node --test community/install.test.mjs`。预期全部 16 个用例通过，sentinel sessions 目录不变。

### 任务 4：添加来源归属和用户文档

**文件：**
- 修改：`README.md`
- 创建：`COMMUNITY_SOURCES.md`
- 创建：`docs/community-optimizations.zh.md`
- 创建：`.agents/notes/implemented/process/2026-08-19-community-suite-layout.md`

- [ ] **步骤 1：添加 Community Modules README 部分**

在 Run 部分后添加简洁链接和命令：

```sh
pnpm run community:check
pnpm run community:install -- --dsh-home /path/to/.dsh
```

说明归档会话仅安装到 `web`，preset 安装在 `.agent-presets` 下，且不会在没有已拥有的 `--update` 安装时覆盖既有 preset。

- [ ] **步骤 2：添加第三方来源记录**

创建简洁来源账册，列出这些不可变修订和 MIT 许可证：

```text
leavelet/deepseek-harness: 05f82f4cbe through b2827cad2e
MuWinds/dsh-archived-sessions: 7d3ba012d3ed plus local rc.7 adaptation a4bdb236d9
xiaobright/dsh-anchored-standard: 25f21aefaf8d plus local rc.7 adaptation e6b41438ca
```

从 `README.md` 链接账册。不要编辑生成的 `THIRD_PARTY_NOTICES.md`。

- [ ] **步骤 3：导入并编辑中文审计参考**

以 `<workspace-root>/DSH-THREE-REPO-AUDIT.md` 为来源，保存为 `docs/community-optimizations.zh.md`，删除机器特定安装路径和已完成工作叙述，保留能力描述和验证事实，并将标题和正文样式调整为 `README.md` 的样式。

- [ ] **步骤 4：记录布局决策**

Agent Note 记录社区 bundle 为何留在官方 workspace 构建图外、preset 为何仍是运行时组合、仓库为何从快照提交开始，以及哪些验证保持这些边界可信。

- [ ] **步骤 5：运行文档检查**

运行：

```sh
pnpm run verify-md-wrap
pnpm run verify-md-links
pnpm run verify-third-party-notices
```

预期：全部命令退出 0，官方生成 notice 保持逐字节不变。

### 任务 5：验证模块和隔离安装

**文件：**
- 仅测试；预期没有生产文件

- [ ] **步骤 1：运行聚焦的社区检查**

运行 `pnpm run community:check`。预期安装器测试、归档会话 Host 测试以及全部 anchored-standard 同步和 Node 测试通过。

- [ ] **步骤 2：验证真实的临时安装**

创建临时 DSH home 并运行：

```sh
DSH_HOME=<temporary-home> pnpm run community:install -- --dsh-home <temporary-home>
DSH_HOME=<temporary-home> pnpm dsh --profile web --dump-config
```

预期：Web 组合包含 `@muwinds/dsh-archived-sessions`；`.agent-presets` 恰含七个预期 id；安装器不创建 `sessions` 目录。

- [ ] **步骤 3：在没有模型请求的情况下验证 preset 发现**

针对临时 home 使用 rc.7 preset roster 服务或既有无凭据 fixture。预期发现七个社区 id 且无损坏条目，每个组合均可在没有 DeepSeek 凭据时挂载首轮工具表面。

- [ ] **步骤 4：运行核心回归检查**

运行：

```sh
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:snapshot
pnpm run test:web:built
pnpm run doc-sync
pnpm run hygiene
```

预期每个命令退出 0，仅有此前文档化的无凭据跳过。不要运行 `test:e2e`、Prefab roll/probe 或任何需要凭据的命令。

- [ ] **步骤 5：审计仓库内容**

搜索嵌套 `.git`、`.env`、凭据名称、`<workspace-root>`、`.dsh/sessions`、已跟踪的 `node_modules` 与生成 coverage 目录。预期没有跟踪的秘密或机器状态产物；文档只可写符号化的 `$DSH_HOME/sessions`。

### 任务 6：创建快照提交并发布

**文件：**
- `<workspace-root>/dsh-community-suite` 中的所有文件

- [ ] **步骤 1：审查完整快照**

运行 `git status --short`、`git diff --check`、`git ls-files` 和暂存秘密扫描。确认每个文件都属于核心快照、社区模块、文档、安装器或仓库元数据。

- [ ] **步骤 2：创建根提交**

暂存完整干净快照并提交：

```sh
git commit -m "feat: assemble DSH rc.7 community suite"
```

预期：提交没有父提交，worktree 干净。

- [ ] **步骤 3：验证 GitHub 认证和仓库可用性**

运行 `gh --version`、`gh auth status`，并在已认证账号中查询 `dsh-community-suite`。若该名字已存在且无关，则使用 `dsh-community-suite-rc7`。

- [ ] **步骤 4：创建并推送私有仓库**

从新仓库运行：

```sh
gh repo create dsh-community-suite --private --source . --remote origin --push
```

预期：`origin` 指向认证账号，`main` 跟踪 `origin/main`，GitHub 报告该仓库为私有。

- [ ] **步骤 5：验证远程结果**

运行：

```sh
git status --short --branch
git ls-remote --heads origin main
gh repo view --json nameWithOwner,isPrivate,defaultBranchRef,url
```

预期：本地和远程 `main` 提交 id 匹配，worktree 干净，仓库私有，`main` 是默认分支。
