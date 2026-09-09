# @deepseek-ai/dsh-plugin-install

English | [中文](README.zh.md)

The browser calls `ctx.remote.pluginInstall.installPlugin(url)`; the Host method remains `ctx.pluginInstall.install(url)`. The Remote name avoids the namespace service's internal `install` method. Both generated Remote providers declare `zod` as a runtime dependency so the client bundle can inline their codecs.

The install capability behind both planes. `ctx.pluginInstall.install(url)` resolves the catalog entry a URL names, hands the entry's own install command to `parseInstallTarget`, derives the target profile from this build's own module path, and runs `dsh plugin --profile <profile> add <target>` through the subprocess seam as an argv array. One implementation serves the agent tool (which gates the call behind `ctx.approval`) and the marketplace panel (where the click is the human's own gesture), so a validated target, a derived profile, and one process path exist once.

## Model Experience

None, as this package only runs an install; the model-facing tools live in `dsh-plugin-catalog-tools`.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Restart required** — a plugin installed into the running profile is not mounted until the process restarts; the caller reports that, the service cannot reload the composition.
- **No uninstall** — removing a plugin is a separate operation the catalog does not describe, so it is deferred rather than guessed.
- **One target grammar** — npm specifiers and `github:owner/repo[#subpath]` only; any other install source needs an explicit decision, not a widened regex.
