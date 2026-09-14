# Meshfin

English | [中文](README.zh.md)

**One agent across many devices.** Meshfin is a multi-device capability runtime and personal workbench for persistent agents.

Meshfin is a community-maintained distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It combines the official `dsh-v0.1.0-rc.7` runtime with session-context improvements, an archived-session Web bundle, seven anchored agent presets, and a mobile personal workbench in one repository.

DeepSeek Harness (`dsh`) uses an architecture where **everything is a plugin**. It is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

This repository is not an official DeepSeek AI release. The exact upstream revisions, licenses, and adaptation patches are recorded in [COMMUNITY_SOURCES.md](COMMUNITY_SOURCES.md).

## What this repository contains

Two halves, installed and updated separately:

| Half | What it is | Where |
| --- | --- | --- |
| **Local DSH** | The harness on your own computer: the Web UI, the community modules, the shared workbench, and the mobile presentation of the same session. This is the half you run. | [`packages/`](packages/README.md), [`community/`](community/), [`apps/cli`](apps/cli/README.md), [`apps/web`](apps/web) |
| **Android app** | An optional thin shell for the phone. It carries only the browser layer a stock phone browser cannot be configured to provide, and it views the host's Web UI rather than being a second client. | [`apps/android-shell/`](apps/android-shell/README.md) |

The local half is usable from a phone's browser with no app at all. The app exists because the phone browser in this deployment cannot be configured the way the Web UI needs.

## Highlights

- **One session, every device.** A conversation continues on the computer and the phone; the phone works the same session, and the model is told which kind of client sent each prompt.
- **The phone can hand things over.** A file picked on the phone reaches the session workspace through a fenced host route, appears in an uploads panel grouped by sender, and previews in the workbench. Retrying one pick answers with the first result instead of storing the bytes twice.
- **A workbench both sides share.** Panels and file viewers register through declared slots, the browser and the agent mutate one host-owned view, and a fenced byte route streams workspace files with `Range`/`206`/`416`, so a video seeks and a long PDF previews.
- **The phone is a first-class narrow client**, not a second product: three pages under one bar with exactly one visible, an interface scale for small screens, and a connection-loss line when the stream generation dies.
- **An optional thin Android shell** carries only the browser layer a stock phone browser cannot supply — local asset caching, launcher identity, a foreground service, a loopback proxy — with no API key, no second session store, and no agent-loop change.
- **Agent presets that pace themselves.** Seven anchored compositions: a controlled first-turn tool face, context gates, wire-think routing, compaction-aware promotion.
- **Long sessions stay affordable**, through bounded log reads, context inspection and range compaction, history recall, and model-capacity-aware summary planning.
- **Session archive management**, and a **plugin catalog** whose search and install paths share one validated install capability.

Imported community modules and their exact provenance are audited in [Community optimizations](docs/community-optimizations.md) ([中文](docs/community-optimizations.zh.md)); upstream revisions and licenses are recorded in [COMMUNITY_SOURCES.md](COMMUNITY_SOURCES.md).

## Quick start

### What you need

| | |
| --- | --- |
| Computer | Windows with PowerShell, or WSL/Linux |
| Phone (optional) | Android; the browser alone is enough — the [app](apps/android-shell/README.md) adds what a browser cannot be configured to do |
| API key | a DeepSeek API key |
| Network | one private network joining the two; this deployment uses [Tailscale](https://tailscale.com/) |

### 1. The computer

Download and run — nothing to build:

**WSL / Linux x64**

```sh
curl -L -o meshfin.tar.gz https://github.com/jiale-li-orion/dsh-meshfin/releases/download/pc-wsl/meshfin-linux-x64.tar.gz
tar xzf meshfin.tar.gz
cd meshfin-linux-x64
./meshfin web
```

**Windows x64, in PowerShell** — download and expand [meshfin-windows-x64.zip](https://github.com/jiale-li-orion/dsh-meshfin/releases/download/pc-windows/meshfin-windows-x64.zip), then:

```powershell
cd meshfin-windows-x64
Set-ExecutionPolicy -Scope Process RemoteSigned
.\meshfin.ps1 web
```

Both archives carry the harness, its dependencies, a Node runtime, and the community modules already installed, so `DSH_HOME` defaults to the distribution's own `data/` directory and nothing is written outside the extracted folder unless you set it. The WSL/Linux build was smoke-tested end to end; the Windows build has **not** been run on Windows yet, so treat its first launch as the check.

**Or build the checkout yourself.** Install Node.js `^22.19.0` or `>=24.0.0`, install pnpm 11.22, clone the repository, run the keyless community checks, and build the Harness:

```sh
npm install --global pnpm@11.22.0
git clone https://github.com/jiale-li-orion/dsh-meshfin.git
cd dsh-meshfin
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

### 2. The API key

Give the harness a DeepSeek API key: export `DEEPSEEK_API_KEY`, put it in a `.env` at the repository root, or add it in the Web UI's settings. Until a key is present the Web UI still starts; model turns cannot.

### 3. The phone

The Web UI binds to `127.0.0.1`, so a phone reaches it over a private network, never the public internet. [Tailscale](https://tailscale.com/) is what this deployment uses: sign the computer and the phone into the same tailnet, then open the computer's tailnet address in the phone's browser. Nothing about DSH changes; the tailnet only extends where its address resolves.

The phone needs no Google Play account for that — Tailscale publishes its Android build for direct download at <https://pkgs.tailscale.com/stable/#android>.

Whatever private network you use, the deployment fact is the same: the host answers at one stable name and only from inside that network. Our own deployment record stays outside this repository, because it names a specific host.

The thin Android app is optional and separate; when the phone browser is not enough, see [the app's README](apps/android-shell/README.md).

### Later launches and updates

Start an installed checkout again with the same DSH home:

```sh
cd dsh-meshfin
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

- Report suite integration problems in this repository's [issue tracker](https://github.com/jiale-li-orion/dsh-meshfin/issues).
- Report upstream Harness problems through the official [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to a plugin repository for discoverability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Start development work with the [development guide](docs/development.md) ([中文](docs/development.zh.md)), [architecture documentation](docs/architecture.md) ([中文](docs/architecture.zh.md)), and [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party source revisions and licenses are recorded in [COMMUNITY_SOURCES.md](COMMUNITY_SOURCES.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Each imported community module retains its own license and notices.
