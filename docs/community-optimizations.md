# Community optimizations

English | [中文](community-optimizations.zh.md)

This rc.7 community snapshot combines `leavelet/deepseek-harness` session-context work, the `MuWinds/dsh-archived-sessions` bundle, and `xiaobright/dsh-anchored-standard` runtime presets. Source revisions and adaptation limits are recorded in [COMMUNITY_SOURCES.md](../COMMUNITY_SOURCES.md).

## Session context

The leavelet integration reads long histories through bounded log cuts rather than expanding complete JSONL or packed logs. Packed retention remains a persistence implementation detail, while `SessionLogCut` supplies stable boundaries for incremental folds. History entries carry `firstSeq`, so paging, forks, rewrites, and compaction share one event-range meaning.

Session Context exposes recall, range compaction, reviewed summaries, and continuation through Remote RPC and the Web UI. Summary planning uses model input and output capacity, while terminal readiness reads process state in batches.

## Archived sessions

The MuWinds bundle adds a Web Settings page that lists archived sessions, shows metadata and bounded message previews, restores one or more sessions, and deletes selected session artifacts. Its Host routes clean up with the Cordis lifecycle, detect required capabilities, and return explicit errors when a required service is absent. Detail reads use persistence inspection and bounded log slices.

Deletion validates only a persistence-provided location: an absolute path with basename `session.jsonl` or `session.jsonl.zstd` whose parent is a non-root directory. It rejects running sessions; an idle live session may be evicted. A missing artifact is pruned from archived ids and returns `deleted: false` with reason `no-artifact`. Node.js filesystem operations perform the deletion rather than a shell command.

The bundle installs only into the `web` profile. It does not modify existing session data during installation.

## Anchored presets

The xiaobright collection provides seven runtime presets. `anchored-standard` begins with Minimal's `bash` and `str_replace_editor`, then promotes to a discoverable resident catalog after a durable event. `prefab-anchored-standard` hydrates an empty session with a bundled successful trajectory. `zero-anchored-standard` runs one zero-tool anchor turn, while `whoami-standard` uses a fixed self-introduction turn before the user task.

`eternal-minimal` has no phase transition: it keeps only the Minimal pair visible and executes heavier tools through the `dshx` bash gateway. `wire-think-standard` keeps tool schemas visible, sends `tool_choice: none` for thinking on the wire, then returns to the regular provider. `combo-anchored-standard` combines think/execute splitting, a reasoning-depth gate, and deliberation reminders during tool loops. The phaseful modes persist and restore their state from durable session events and use discovery tools where their composition needs heavier tools on demand.

The rc.7 wire-think adapter supports low reasoning, rejects unsupported effort values, preserves an explicitly empty system prompt, and reports the model's `maxOutputTokens`. Its serialization and replay behavior match the official rc.7 DeepSeek adapter.

The preset maintenance layer normalizes Git Bash working directories on Windows, probes the full instruction-file chain, and gives each injected instruction hint a unique id so a host-restart race cannot stop history assembly. Development-tool search uses fuzzy token scoring and explains direct `toolNames` unlocks when no catalog match is found. Prefab seeding covers both sessions switched to the preset and sessions created with it as their default, including agents published after skill loading completes.

The installer publishes them under `.agent-presets` and refuses to replace a preset unless `--update` identifies an installer-owned destination.

## Verification and compatibility

Focused session, persistence, projection, Context, compaction, API proxy, terminal, and Web tests pass. The archived-session bundle has 8 passing tests for lifecycle handling, bounded detail, restore, and safe deletion. The adapted preset package has 216 passing keyless checks, including shared-file synchronization, maintenance regressions, and rc.7 adapter behavior. The installer has 16 tests for the Web-only bundle target, seven preset identifiers, owned-update checks, backup behavior, the pnpm `--` separator regression, and no access to the sessions directory.

Keyless snapshots report 118 passing and 1 skipped; the explicit-empty-key Web lane reports 255 passing and 15 skipped. No verification issues a real DeepSeek API request. The coverage summary is 98.36% statements, 97.33% branches, 98.28% functions, and 98.64% lines; the ported code remains below rc.7's per-file 100% coverage gate.

The snapshot targets `dsh-v0.1.0-rc.7`. DeepSeek Harness remains in developer preview, so later official releases can require compatibility changes. These checks cover the stated rc.7 paths; they do not establish compatibility with every profile, plugin, host filesystem, or future release.
