# dsh-archived-sessions

English | [中文](README.zh.md)

An archived-session manager — a settings-page extension for the DeepSeek Harness Web UI, distributed as a single bundle package and installed with one command.

The Harness **Settings → Archived Sessions** page lets you:

- List every archived session, including its title, creation time, working directory, and actual on-disk path.
- View each session's disk usage and the total.
- Restore sessions (unarchive them to their original workspace), individually, in bulk, or all at once.
- Delete session files from disk, individually, in bulk, or all at once, with two-step confirmation.
- Open a session title to view its latest 100 user, assistant, and tool messages; long sessions use rc.7's bounded log-slice read rather than expanding the whole event array.

> ⚠️ **Safety notice:** This plugin can delete session files from disk, and deletion is irreversible. Installing it means trusting this repository's code to run on your machine with your permissions; review the source yourself.

## Install (recommended: suite installer)

From the suite root, install the archived-session bundle and all seven presets together:

```sh
pnpm run community:install -- --dsh-home /path/to/.dsh
```

The installer adds this bundle only to the `web` profile, installs owned presets with recoverable backups, and never accesses the sessions directory. Restart Harness after installation; the **Archived Sessions** page appears at the bottom of the settings panel.

> This pure-JS package has no `prepare` build script, so it **does not** need pnpm `allowBuilds` permission.

### Low-level local install (development only)

```sh
dsh plugin --profile web add ./community/bundles/archived-sessions
```

Run this from the suite root only when developing the bundle. It bypasses the suite preset installation, ownership markers, and backups; it does not change the bundle's safety boundaries.

## Repository layout

```
dsh-archived-sessions/
├── package.json          # dsh.bundle + dsh.client declarations (one package, two ends)
├── cordis.patch.yml      # inserts one archived-sessions row (Host + browser)
├── lib/
│   ├── index.js          # Host plugin: webServer /dsh-archived/* routes + all business logic
│   └── client.js         # browser plugin: settings-page UI (__ModuleLoader__ bundle)
├── README.md
└── LICENSE               # MIT
```

Host API (`POST /dsh-archived/*`, unauthenticated and same-origin):

| Route | Request body | Response |
| --- | --- | --- |
| `/dsh-archived/list` | `{}` | `{ items, totalBytes }` |
| `/dsh-archived/unarchive` | `{ sessionId }` | `{ ok, changed, archivedSessionIds }` |
| `/dsh-archived/delete` | `{ sessionId }` | `{ ok, deleted, sessionId, path?, sizeBytes?, reason? }` |
| `/dsh-archived/detail` | `{ sessionId }` | `{ id, createdAt, cwd, totalEvents, messageCount, truncated, messages }` |

## Compatibility

- Target Harness version: `0.1.0-rc.7` (the Web profile composition layout and bounded `SessionLogCut` reads).
- The Host plugin has no third-party runtime dependencies (pure ESM, imports no `@deepseek-ai/*`, and obtains every needed capability from `ctx`); the browser plugin depends only on `react` (provided by the Harness frontend runtime as the platform seed).

## License

MIT
