# DSH Community Suite repository design

English | [中文](2026-08-19-dsh-community-suite-design.zh.md)

## Purpose

`dsh-community-suite` distributes the locally adapted DeepSeek Harness rc.7 core, the archived-session bundle, and the anchored-standard agent presets from one repository. The repository uses one concise history beginning from the verified integration snapshot rather than importing the three source histories.

The GitHub repository is private by default. Its `main` branch is the locally supported release line. No command in the migration reads a real DeepSeek API key or writes existing session data.

## Repository layout

The DeepSeek Harness source tree remains the repository root so its documented source commands continue to work without a wrapper directory.

```text
dsh-community-suite/
├── apps/
├── packages/
│   └── ...
├── community/
│   ├── bundles/
│   │   └── archived-sessions/
│   ├── presets/
│   │   └── anchored-standard/
│   │       ├── preset/
│   │       ├── prefab/
│   │       ├── combo-anchored/
│   │       ├── eternal-minimal/
│   │       ├── whoami-standard/
│   │       ├── wire-think-standard/
│   │       └── zero-anchored-standard/
│   └── install.mjs
├── docs/
│   └── community-optimizations.zh.md
├── package.json
└── pnpm-workspace.yaml
```

The archived-session implementation remains an out-of-tree installable bundle under `community/bundles/`. Its package manifest declares `dsh.bundle` and keeps Host and Client lifecycle ownership inside the package. This follows the official distinction between bundles shipped with DSH under `packages/bundle/` and community bundles installed into a profile with `dsh plugin add`.

The seven anchored modes remain user-authored agent preset directories. They live outside `packages/` because they are runtime compositions rather than npm workspaces. Shared source used to construct or verify the presets remains under `community/presets/anchored-standard/shared`, while each installable directory is self-contained.

## Source ownership

The core snapshot comes from the clean `integration/rc7-three-repos` worktree based on `deepseek-ai/deepseek-harness@99f6f02fec`. It includes the pnpm 11.22 selection, the seven leavelet feature commits as adapted to rc.7, and the local integration fixes.

The archived-session snapshot comes from `MuWinds/dsh-archived-sessions@7d3ba012d3ed` plus local commit `a4bdb236d94411819bc4e9bbd2fcd1cf0b7198a0`. The anchored-standard snapshot comes from `xiaobright/dsh-anchored-standard@25f21aefaf8d` plus local commit `e6b41438ca55f2e04e8a225e4e2da3e59bc1c068`.

`COMMUNITY_SOURCES.md` records these origins, fixed revisions, licenses, and local adaptation boundaries. The official generated `THIRD_PARTY_NOTICES.md` remains generator-owned. Imported repository metadata, nested `.git` directories, installed dependencies, generated caches, user profiles, credentials, and session data are excluded.

## Workspace and installation

The community bundle and preset collection stay outside the official pnpm workspace build graph. Root package scripts expose focused community checks and a keyless installer without changing the official build entry points.

`community/install.mjs` accepts an explicit `--dsh-home`; otherwise it uses a nonblank `DSH_HOME`, then `homedir()/.dsh`. The explicit value supports `~` and `~/` expansion. It installs the archived-session bundle only into the `web` profile and copies the seven presets into `.agent-presets` using their public ids: `anchored-standard`, `prefab-anchored-standard`, `combo-anchored-standard`, `eternal-minimal`, `whoami-standard`, `wire-think-standard`, and `zero-anchored-standard`. It refuses to overwrite an existing destination unless the destination is an installation owned by the same source snapshot and the caller explicitly requests an update.

Installation first creates a recoverable backup outside the target directories. Session directories are never enumerated, copied, changed, or deleted. Tests point the installer at a temporary DSH home.

## Documentation

The root README retains the official title, short introduction, run instructions, community links, contribution links, and license section. A concise Community Modules section links to the bundle, preset collection, installation instructions, and the Chinese audit reference.

`docs/community-optimizations.zh.md` is a current-state reference written with the root README's direct style. It describes bounded and packed session reads, context management and compaction review, process-table batching, archived-session operations, and the seven anchored compositions. It identifies which repository contributed each capability without narrating the merge procedure.

## Verification

Verification does not run `test:e2e`, Prefab roll/probe, or commands that can consume real credentials.

The core snapshot runs the relevant unit tests, typecheck, lint, build, keyless snapshots, Web tests, documentation synchronization, and hygiene checks required by the integration plan. The archived-session bundle runs its Host tests against temporary JSONL fixtures, including lifecycle cleanup, bounded detail reads, safe deletion, and path rejection. The anchored-standard collection runs `npm run check` and mounts all seven presets in a temporary DSH home to verify discovery, composition, and first-turn tool registration.

Before publication, the repository must have no tracked generated residue, nested repository metadata, credentials, user home paths, or session artifacts. The final commit is pushed to the private GitHub repository `dsh-community-suite` with `main` as its default branch.
