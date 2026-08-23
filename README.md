# DeepSeek Harness Community Suite

English | [中文](README.zh.md)

DSH Community Suite is a community-maintained distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines the official `dsh-v0.1.0-rc.7` runtime with session-context improvements, an archived-session Web bundle, and seven anchored agent presets in one repository.

DeepSeek Harness (`dsh`) uses an architecture where **everything is a plugin**. It is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

This repository is not an official DeepSeek AI release. The exact upstream revisions, licenses, and adaptation patches are recorded in [COMMUNITY_SOURCES.md](COMMUNITY_SOURCES.md).

## Status

The suite is fixed to the official `dsh-v0.1.0-rc.7` base and retains the repository's `pnpm@11.22.0` toolchain choice. DeepSeek Harness remains a developer preview and may introduce compatibility-breaking changes; community modules in this snapshot are supported only against the recorded base.

## Included improvements

- **Session context and compaction** — bounded long-session reads, packed retention, context inspection and range selection, history recall, model-capacity-aware compaction planning, and recoverable summary review, adapted from [leavelet/deepseek-harness](https://github.com/leavelet/deepseek-harness).
- **Archived sessions** — a Web settings bundle for listing, previewing, restoring, deleting, and measuring archived sessions, adapted from [MuWinds/dsh-archived-sessions](https://github.com/MuWinds/dsh-archived-sessions).
- **Anchored agents** — seven self-contained agent compositions with controlled first-turn tool exposure, context gates, wire-think routing, compaction-aware promotion, and prefab workflows, adapted from [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard).

See [Community optimizations](docs/community-optimizations.md) ([中文](docs/community-optimizations.zh.md)) for the feature audit and compatibility boundaries.

## Run

### Run from source

Install Node.js, clone this repository, and build the Harness:

```sh
git clone https://github.com/jiale-li-orion/dsh-community-suite.git
cd dsh-community-suite
pnpm install --frozen-lockfile
pnpm run build
```

Run the keyless community checks, then install the bundle and presets into a DSH home:

```sh
pnpm run community:check
pnpm run community:install -- --dsh-home /path/to/.dsh
```

The installer adds the archived-session bundle only to the `web` profile and installs these preset ids under `.agent-presets`: `anchored-standard`, `prefab-anchored-standard`, `combo-anchored-standard`, `eternal-minimal`, `whoami-standard`, `wire-think-standard`, and `zero-anchored-standard`. It refuses foreign destinations, backs up owned installations before `--update`, and never accesses the sessions directory.

Start the Web UI with the same DSH home:

```sh
DSH_HOME=/path/to/.dsh pnpm dsh web
```

The Web UI is served at `http://127.0.0.1:3080` by default. See the [Web UI guide](docs/user/guide/index.md) ([中文](docs/user/guide/index.zh.md)).

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
