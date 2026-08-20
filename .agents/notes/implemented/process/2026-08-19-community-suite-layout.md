# Agent Note: Community suite layout

Status: implemented

English | [中文](2026-08-19-community-suite-layout.zh.md)

## Problem

The archived-session bundle and anchored presets need a reproducible rc.7 distribution without becoming official workspace packages or changing profiles a user did not select. Their source history also needs a concise, durable record so a later update can distinguish official code, imported changes, and local compatibility work.

## Decision

The repository keeps community code under `community/`. The archived-session module remains an out-of-tree bundle that the installer adds only to the `web` profile. The seven anchored modes remain copied runtime compositions under `.agent-presets`, not workspace members, package dependencies, or official profiles.

The installer stages presets, marks each published directory as owned by `dsh-community-suite`, and refuses an existing destination unless `--update` names an owned installation. It reserves backups before replacing owned presets or Web profile files and does not enumerate, read, or write the sessions directory.

`COMMUNITY_SOURCES.md` records the fixed official rc.7 base, the seven leavelet session-context commits, and the archived-session and anchored-preset source revisions with their local adaptations. The repository begins with one root snapshot commit and no imported parents. That concise distribution history makes a later import review the stated revisions and adaptation limits rather than inferring them from copied files.

## Verification

`pnpm run community:check` runs installer tests, archived-session bundle tests, and anchored-preset synchronization and Node tests. The installer tests cover Web-only bundle invocation, the seven public preset identifiers, ownership checks, update backups, rollback, and the sessions-directory prohibition. Documentation checks keep source links, bilingual records, Agent Note structure, and generated third-party notices valid.

## Alternatives considered

- **Add the modules to the official workspace graph** — rejected: workspace membership would make community packages part of the official build and dependency closure, obscuring their separate compatibility and support limits.
- **Install presets as official profiles** — rejected: preset selection is per-user runtime composition, and publishing them as official profiles would broaden the default product without a separate product decision.
- **Overwrite matching preset names unconditionally** — rejected: a name alone does not establish ownership. The marker plus explicit `--update` preserves user-managed or foreign directories.
- **Record provenance only in generated notices or copied source headers** — rejected: generated notices describe dependencies, while source headers drift and do not express the rc.7 adaptation limits. A short source ledger keeps the import decision reviewable.
- **Preserve or import all three source histories** — rejected: their unrelated parent graphs would turn a distributable rc.7 snapshot into a history-integration project. The source ledger retains the revisions and adaptation boundaries needed for maintenance without presenting copied ancestry as this repository's development history.

## Consequences

The official workspace and default profiles stay focused on official code, while users can install the community modules through one checked entry point. The layout gives up automatic workspace builds, releases, and compatibility promises for the community code; maintainers must update its snapshot record and rerun its focused checks when its sources or rc.7 adaptations change.
