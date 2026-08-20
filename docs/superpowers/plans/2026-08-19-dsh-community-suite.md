# DSH Community Suite Implementation Plan

English | [中文](2026-08-19-dsh-community-suite.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one private, concise-history repository containing the adapted DSH rc.7 core, the archived-session bundle, the seven anchored-standard presets, their installer, and the three-repository optimization audit.

**Architecture:** Keep the DSH source tree at the repository root. Store third-party extensions below `community/` as an out-of-tree `dsh.bundle` package and user agent preset collection, matching the official distinction between shipped packages and profile-installed extensions. Create an orphan `main` snapshot so upstream histories are represented by notices rather than imported Git objects.

**Tech Stack:** Git, GitHub CLI, Node.js 22 ESM, pnpm 11.22, Cordis bundle manifests, DSH profiles and agent presets, Node test runner, Vitest.

---

### Task 1: Create the concise-history repository snapshot

**Files:**
- Create repository: `<workspace-root>/dsh-community-suite`
- Source snapshot: `<workspace-root>/deepseek-harness/.worktrees/integration-rc7-three-repos`

- [ ] **Step 1: Verify the source worktree and fixed inputs**

Run:

```sh
git -C <workspace-root>/deepseek-harness/.worktrees/integration-rc7-three-repos status --short --branch
git -C <workspace-root>/dsh-archived-sessions status --short --branch
git -C <workspace-root>/dsh-anchored-standard status --short --branch
```

Expected: the integration worktree contains only the committed design/plan changes; both community repositories are clean on `local/rc7-compat`.

- [ ] **Step 2: Export tracked core files without Git history**

Run `git archive HEAD` from the integration worktree into the absent directory `<workspace-root>/dsh-community-suite`. The archive excludes `.git`, worktrees, dependencies, build caches, credentials, and sessions by construction.

- [ ] **Step 3: Initialize the new repository**

Run:

```sh
git init -b main <workspace-root>/dsh-community-suite
git -C <workspace-root>/dsh-community-suite config user.name "$(git config user.name)"
git -C <workspace-root>/dsh-community-suite config user.email "$(git config user.email)"
```

Expected: an unborn `main` branch with no remote and no parent commits.

### Task 2: Import the community modules as source snapshots

**Files:**
- Create: `community/bundles/archived-sessions/**`
- Create: `community/presets/anchored-standard/**`
- Modify: `.gitignore`

- [ ] **Step 1: Copy tracked bundle files**

Export `local/rc7-compat` from `dsh-archived-sessions` into `community/bundles/archived-sessions` with `git archive`. Verify that the destination contains `package.json`, `cordis.patch.yml`, `lib/`, `test/`, `README.md`, and `LICENSE`, with no `.git` directory.

- [ ] **Step 2: Copy tracked preset files**

Export `local/rc7-compat` from `dsh-anchored-standard` into `community/presets/anchored-standard` with `git archive`. Verify that the seven public preset directories, `shared/`, `scripts/`, `test/`, `verify/`, package manifest, notices, and licenses are present with no `.git` directory.

- [ ] **Step 3: Add community artifact ignores**

Append these scoped entries to `.gitignore` if the official file does not already cover them:

```gitignore
/community/**/node_modules/
/community/**/.coverage/
/community/**/coverage/
```

- [ ] **Step 4: Verify the imported snapshots byte-for-byte**

Compare `git archive` file lists and SHA-256 values between each source branch and its destination, excluding only repository metadata. Expected: no missing or changed imported file.

### Task 3: Add a safe community installer

**Files:**
- Create: `community/install.mjs`
- Create: `community/install.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing installer tests**

Use `node:test` fixtures to cover:

```js
test('installs all seven preset ids into an empty temporary DSH home')
test('refuses an existing preset without --update')
test('backs up and replaces an owned preset with --update')
test('passes only the web profile and local bundle path to dsh plugin add')
test('never reads or writes the sessions directory')
```

The tests invoke `community/install.mjs` with `--dsh-home <temporary path>` and `--dsh-command <recording fixture executable>`. The recording fixture writes received argv and selected environment variables outside the DSH home; a sentinel `sessions` directory has mode `000` during the test.

- [ ] **Step 2: Run the tests to verify failure**

Run:

```sh
node --test community/install.test.mjs
```

Expected: FAIL because `community/install.mjs` does not exist.

- [ ] **Step 3: Implement argument parsing and destination ownership**

`community/install.mjs` accepts `--dsh-home <path>`, `--update`, `--presets-only`, and the test-only `--dsh-command <path>`. It resolves the default home from nonblank `DSH_HOME`, then `${homedir()}/.dsh`. Unknown flags, duplicate value flags, and missing values exit nonzero before writing.

Each installed preset receives `.dsh-community-suite.json` containing:

```json
{
  "source": "dsh-community-suite",
  "module": "anchored-standard",
  "presetId": "<public id>"
}
```

Without `--update`, every existing destination is rejected. With `--update`, replacement is allowed only when this marker matches the preset id.

- [ ] **Step 4: Implement recoverable preset replacement**

Create the backup root below `$DSH_HOME/backups/dsh-community-suite-<UTC timestamp>`. Copy every replaced preset to `presets/<id>` before removing the destination. Copy each source into a sibling temporary directory, add the ownership marker, then rename it to the final destination so partial copies are never published.

- [ ] **Step 5: Install the bundle through the official CLI path**

Unless `--presets-only` is set, execute:

```text
<dsh-command> plugin --profile web add <absolute community/bundles/archived-sessions path>
```

Set only the selected `DSH_HOME` in the inherited environment. Before execution, copy existing `profiles/web/package.json`, `pnpm-lock.yaml`, and `cordis.patch.yml` files into `backups/.../profile-web/`. Do not enumerate or touch `$DSH_HOME/sessions`.

- [ ] **Step 6: Expose root scripts**

Add these scripts without changing official commands:

```json
"community:check": "node --test community/install.test.mjs && npm --prefix community/bundles/archived-sessions test && npm --prefix community/presets/anchored-standard run check",
"community:install": "node community/install.mjs"
```

- [ ] **Step 7: Run the installer tests**

Run `node --test community/install.test.mjs`. Expected: all 16 cases pass and the sentinel sessions directory remains unchanged.

### Task 4: Add source attribution and user documentation

**Files:**
- Modify: `README.md`
- Create: `COMMUNITY_SOURCES.md`
- Create: `docs/community-optimizations.zh.md`
- Create: `.agents/notes/implemented/process/2026-08-19-community-suite-layout.md`

- [ ] **Step 1: Add the Community Modules README section**

After the Run section, add concise links and commands:

```sh
pnpm run community:check
pnpm run community:install -- --dsh-home /path/to/.dsh
```

State that archived sessions install only into `web`, presets install under `.agent-presets`, and existing presets are not overwritten without an owned `--update` installation.

- [ ] **Step 2: Add third-party source records**

Create a concise source ledger naming these immutable source revisions and their MIT licenses:

```text
leavelet/deepseek-harness: 05f82f4cbe through b2827cad2e
MuWinds/dsh-archived-sessions: 7d3ba012d3ed plus local rc.7 adaptation a4bdb236d9
xiaobright/dsh-anchored-standard: 25f21aefaf8d plus local rc.7 adaptation e6b41438ca
```

Link the ledger from `README.md`. Do not edit the generated `THIRD_PARTY_NOTICES.md`.

- [ ] **Step 3: Import and edit the Chinese audit reference**

Use `<workspace-root>/DSH-THREE-REPO-AUDIT.md` as the source. Save it as `docs/community-optimizations.zh.md`, remove machine-specific installation paths and completed-work narration, retain the capability descriptions and verification facts, and style headings and prose after `README.md`.

- [ ] **Step 4: Document the layout decision**

The Agent Note records why community bundles remain out of the official workspace build graph, why presets remain runtime compositions, why the repository starts with a snapshot commit, and which verification keeps these boundaries honest.

- [ ] **Step 5: Run documentation checks**

Run:

```sh
pnpm run verify-md-wrap
pnpm run verify-md-links
pnpm run verify-third-party-notices
```

Expected: all commands exit 0 and the official generated notice remains byte-identical.

### Task 5: Validate modules and isolated installation

**Files:**
- Test only; no production files expected

- [ ] **Step 1: Run focused community checks**

Run `pnpm run community:check`. Expected: installer tests pass, archived-session Host tests pass, and all anchored-standard synchronization and Node tests pass.

- [ ] **Step 2: Verify a real temporary installation**

Create a temporary DSH home and run:

```sh
DSH_HOME=<temporary-home> pnpm run community:install -- --dsh-home <temporary-home>
DSH_HOME=<temporary-home> pnpm dsh --profile web --dump-config
```

Expected: the Web composition includes `@muwinds/dsh-archived-sessions`; `.agent-presets` contains exactly the seven expected ids; no `sessions` directory is created by the installer.

- [ ] **Step 3: Verify preset discovery without a model request**

Use the rc.7 preset roster service or its existing keyless fixture against the temporary home. Expected: seven community ids are discovered with no broken entries, and each composition can mount its first-turn tool surface without a DeepSeek credential.

- [ ] **Step 4: Run core regression checks**

Run:

```sh
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:snapshot
pnpm run test:web:built
pnpm run doc-sync
pnpm run hygiene
```

Expected: every command exits 0, with only previously documented keyless skips. Do not run `test:e2e`, Prefab roll/probe, or any credentialed command.

- [ ] **Step 5: Audit repository contents**

Run searches for nested `.git`, `.env`, credential names, `<workspace-root>`, `.dsh/sessions`, tracked `node_modules`, and generated coverage directories. Expected: no secret or machine-state artifacts are tracked; documentation may name symbolic `$DSH_HOME/sessions` only.

### Task 6: Create the snapshot commit and publish

**Files:**
- All files in `<workspace-root>/dsh-community-suite`

- [ ] **Step 1: Review the complete snapshot**

Run `git status --short`, `git diff --check`, `git ls-files`, and a staged secret scan. Confirm every file belongs to the core snapshot, community modules, documentation, installer, or repository metadata.

- [ ] **Step 2: Create the root commit**

Stage the complete clean snapshot and commit:

```sh
git commit -m "feat: assemble DSH rc.7 community suite"
```

Expected: the commit has no parent and the worktree is clean.

- [ ] **Step 3: Verify GitHub authentication and repository availability**

Run `gh --version`, `gh auth status`, and query the authenticated account for `dsh-community-suite`. If the name already exists and is unrelated, use `dsh-community-suite-rc7`.

- [ ] **Step 4: Create and push the private repository**

Run from the new repository:

```sh
gh repo create dsh-community-suite --private --source . --remote origin --push
```

Expected: `origin` points to the authenticated account, `main` tracks `origin/main`, and GitHub reports the repository as private.

- [ ] **Step 5: Verify the remote result**

Run:

```sh
git status --short --branch
git ls-remote --heads origin main
gh repo view --json nameWithOwner,isPrivate,defaultBranchRef,url
```

Expected: the local and remote `main` commit ids match, the worktree is clean, the repository is private, and `main` is the default branch.
