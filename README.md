# DeepSeek Harness Community Suite

English | [中文](README.zh.md)

DSH Community Suite is a community-maintained distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines the official `dsh-v0.1.0-rc.7` runtime with session-context improvements, an archived-session Web bundle, seven anchored agent presets, and a mobile personal workbench in one repository.

DeepSeek Harness (`dsh`) uses an architecture where **everything is a plugin**. It is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

This repository is not an official DeepSeek AI release. The exact upstream revisions, licenses, and adaptation patches are recorded in [COMMUNITY_SOURCES.md](COMMUNITY_SOURCES.md).

## Status

The suite is fixed to the official `dsh-v0.1.0-rc.7` base and retains the repository's `pnpm@11.22.0` toolchain choice. DeepSeek Harness remains a developer preview and may introduce compatibility-breaking changes; community modules in this snapshot are supported only against the recorded base.

## Recent updates

- **2026-09-11 — The phone works the same session as the PC.** The narrow client presents three pages (conversation, sessions, workbench) with exactly one visible at a time, scales text and controls for a small screen, and shows a connection-loss line when its stream generation dies. A file picked on the phone lands in the session workspace's `uploads/<source>/` under the ingest id the composer minted, a workbench panel groups what each sender sent, and Markdown, source, PDF, image, audio, and video files preview there. The class of client that sent a prompt (`mobile-app`, `mobile-browser`, `desktop-browser`) is recorded on the durable user message and stated to the model once per turn. See the [narrow single-panel note](.agents/notes/implemented/architecture/2026-09-10-narrow-single-panel-workbench.md) and the [client-origin note](.agents/notes/implemented/feature/2026-09-11-model-visible-client-origin.md).
- **2026-09-11 — Android thin shell** (`apps/android-shell/`). A WebView app scoped to the browser layer a stock phone browser does not provide: host-addressed local caching keyed by the revision hash the host advertises, a launcher icon, a foreground service, and a loopback proxy that keeps the host's TLS identity while bypassing the system DNS layer. It carries no LLM key, no second session store, and no agent-loop change.
- **2026-09-09 — Tool-result images reach the model.** A tool result's images now follow its `role: tool` message as one user message, so `read_image` output and any history containing it keep working on the native route. See the [tool-result images note](.agents/notes/implemented/feature/2026-09-09-llm-deepseek-tool-result-images.md).
- **2026-09-08 — Per-model input modalities.** Each `llm-deepseek` catalog entry declares `inputModalities`; omission means `[text]`, and a user image reaches the wire only for an entry naming `image`. See the [input modalities note](.agents/notes/implemented/feature/2026-09-08-llm-deepseek-catalog-input-modalities.md).
- **2026-09-08 — Run instructions restructured** into Requirements, First launch, and Later launches and updates.

## Included improvements

- **Session context and compaction** — bounded long-session reads, packed retention, context inspection and range selection, history recall, model-capacity-aware compaction planning, and recoverable summary review, adapted from [leavelet/deepseek-harness](https://github.com/leavelet/deepseek-harness).
- **Archived sessions** — a Web settings bundle for listing, previewing, restoring, deleting, and measuring archived sessions, adapted from [MuWinds/dsh-archived-sessions](https://github.com/MuWinds/dsh-archived-sessions).
- **Anchored agents** — seven self-contained agent compositions with controlled first-turn tool exposure, context gates, wire-think routing, compaction-aware promotion, default-session prefab seeding, cross-platform shell paths, and resilient instruction discovery, adapted from [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard).
- **DeepSeek image input** — the bundled `llm-deepseek` adapter declares per-model input modalities and carries both user-uploaded images and images produced by tools to the model as `image_url` data URLs.
- **Human-Agent shared workbench** — a docked column whose panels and file viewers register through declared slots (`workbench.panel`, `workbench.viewer`), one host-owned view the browser and the agent both mutate (`ctx.workbench` plus the forwarded `workbench/changed` event), a fenced byte route that streams workspace files with `Range`/`206`/`416`,. First-party packages on rc.7 seams; the design follows [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (panel and file-viewer registry), [kendu76/dsh-music-player](https://github.com/kendu76/dsh-music-player) (host-owned intent both planes mutate), and [tsonglew/dsh-media-preview](https://github.com/tsonglew/dsh-media-preview) (Range/streaming handler). No community code was lifted.
- **Mobile personal workbench** — the phone is a first-class client of the same session, not a second product: three pages under one bar with one visible at a time, an interface scale for narrow screens, a composer upload control whose files reach the session workspace through a fenced host route, ingest ids that make a repeated upload answer with the first result instead of storing the bytes twice, an uploads panel grouped by sender, and file viewers for Markdown, source, PDF, images, audio, and video. The mobile presentation reads the shared workbench view and never writes it.
- **Android thin shell** — `apps/android-shell/`, scoped to four things a phone browser cannot be configured to do: local assets, launcher icon, foreground service, and a loopback proxy. It exists because the target phone's stock browser ignores `cache-control`, cannot install a PWA, reclaims long connections, and resolves through its own DNS layer — none of which is a Web API capability gap.
- **Plugin catalog** — a `marketplace` workbench panel plus the `plugin_search` and `plugin_install` tools over the CC0 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) index. Both paths share one install capability: the panel's confirmed click is the human gesture, the tool adds `ctx.approval`, and either way the entry's own target is validated and run as an argv array. The install-target validator and the search/install split follow [DshMarketPlace/dsh-plugins-store](https://github.com/DshMarketPlace/dsh-plugins-store); the index is consumed as data at runtime, never re-generated or mirrored.

Audited but deliberately not shipped: agent-authored workbench extensions (design from [saya-ch/dsh-mobile](https://github.com/saya-ch/dsh-mobile)), the full Android and desktop clients ([ZSeven-W/dsh-android](https://github.com/ZSeven-W/dsh-android), [ZgblKylin/dsh-gui](https://github.com/ZgblKylin/dsh-gui), and the AGPL-3.0/GPL-3.0 projects, which permit design study only), and the device-capability protocol that would let the agent call a phone's own camera, files, or location — the shell app above carries the browser layer only, and does not implement that protocol. Their decisions and the exact revert for every shipped row are recorded in the workbench [Agent Notes](.agents/notes/implemented/feature/2026-09-09-workbench-shared-view.md).

See [Community optimizations](docs/community-optimizations.md) ([中文](docs/community-optimizations.zh.md)) for the feature audit and compatibility boundaries, and [Community source records](COMMUNITY_SOURCES.md) for the exact upstream revisions and licenses.

## Run

### Requirements

Install Node.js `^22.19.0` or `>=24.0.0` and pnpm 11.22:

```sh
npm install --global pnpm@11.22.0
```

### First launch

Clone the repository, install dependencies, run the keyless community checks, and build the Harness:

```sh
git clone https://github.com/jiale-li-orion/dsh-community-suite.git
cd dsh-community-suite
pnpm install --frozen-lockfile
pnpm run community:check
pnpm run build
```

Choose a DSH home, install the community modules, and start the Web UI:

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
pnpm run community:install -- --dsh-home "$DSH_HOME"
pnpm dsh web
```

The installer adds the archived-session bundle only to the `web` profile and installs these preset ids under `.agent-presets`: `anchored-standard`, `prefab-anchored-standard`, `combo-anchored-standard`, `eternal-minimal`, `whoami-standard`, `wire-think-standard`, and `zero-anchored-standard`. It refuses foreign destinations, backs up owned installations before `--update`, and never accesses the sessions directory.

The Web UI is served at `http://127.0.0.1:3080` by default. Keep this terminal open while using DSH.

### Later launches and updates

Start an installed checkout again with the same DSH home:

```sh
cd dsh-community-suite
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
pnpm dsh web
```

After pulling suite updates, refresh dependencies, rebuild, and update only installations owned by this suite:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run community:check
pnpm run build
pnpm run community:install -- --dsh-home "$DSH_HOME" --update
```

See the [Web UI guide](docs/user/guide/index.md) ([中文](docs/user/guide/index.zh.md)) for profile and interface details.

### Official npm distribution

To run the unmodified official npm distribution without this suite's community modules:

```sh
npx @deepseek-ai/dsh web
```

## Repository layout

```text
community/
├── bundles/archived-sessions/
├── presets/anchored-standard/
├── patches/
└── install.mjs
packages/
apps/android-shell/
apps/cli/
apps/web/
docs/community-optimizations.md
COMMUNITY_SOURCES.md
```

## Community and support

- Report suite integration problems in this repository's [issue tracker](https://github.com/jiale-li-orion/dsh-community-suite/issues).
- Report upstream Harness problems through the official [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to a plugin repository for discoverability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Start development work with the [development guide](docs/development.md) ([中文](docs/development.zh.md)), [architecture documentation](docs/architecture.md) ([中文](docs/architecture.zh.md)), and [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party source revisions and licenses are recorded in [COMMUNITY_SOURCES.md](COMMUNITY_SOURCES.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Each imported community module retains its own license and notices.
