# Agent Note: The privileged method set follows declared authorities only when a deployment opts in

Status: implemented

English | [中文](2026-09-09-privileged-authority-opt-in.zh.md)

## Problem

The `/api` fence accepts a request whose Host is loopback or a declared `trustedHosts` authority, but the privileged method set — `host.pickDirectory`, `host.openPath`, the settings and credential planes, the agent-preset authoring plane, and `llm.discoverModels` — passed the fence with an **empty** trust list, so those methods answered 403 to every non-loopback caller regardless of `trustedHosts` ([the fence note](../architecture/2026-07-28-api-browser-trust-boundary.md)). A deployment that reaches the Web GUI from a second device over a private device fabric — the Tailscale-tailnet case the multi-device design targets — therefore loads the GUI, lists sessions and workspaces, and streams turns, while its settings panel, credential view, preset roster, and the "add workspace" native picker all fail. The pin was deliberate and stays correct as a default: those methods read the exposed configuration, drive the host desktop, or manage secrets, and `trustedHosts` is a DNS-rebinding fence rather than authentication.

## Decision

**One opt-in config field moves the privileged set from loopback to the declared authorities.** `@deepseek-ai/dsh-client-connection` gains `privilegedAuthority: 'loopback' | 'trusted'`, default `'loopback'`. The node half resolves it once per apply into the list the privileged check passes to `isTrustedApiRequest`: `[]` under the default, `trustedHosts` under `'trusted'`. Every other gate — the Host/Origin/cross-site fences, the canonical-authority load check, the loopback pin for the WebSocket upgrades — is unchanged, so `'trusted'` widens exactly one decision and nothing else.

**The default stays the shipped behavior.** Deployments that do not set the field keep the loopback pin byte-for-byte, so no existing composition changes behavior and the security argument in the fence note still holds for them.

**The value is validated as a closed union at the config boundary.** An unknown string fails the plugin load loud rather than falling back to a value the operator did not choose.

## Alternatives considered

- **Drop the pin entirely.** Rejected: it would hand the settings and credential planes to every LAN caller on the default `0.0.0.0`-derived trust list, which is precisely the reconnaissance the pin exists to refuse.
- **Let a `trustedHosts` entry carry a per-authority privilege flag.** Rejected: the privileged set is a property of the method, not of the caller, and a per-authority flag would let two authorities reach different halves of one plane with no way to express that in the fence's authority comparison.
- **Keep the pin and make the second device reach the GUI over loopback** (an SSH or `tailscale serve` tunnel terminating on the host). Rejected as the product answer: it works for a human typing a URL, but the request's authority stays non-loopback unless the tunnel rewrites Host and Origin, which defeats the fence instead of deciding it.
- **Wait for an authentication layer.** Deferred, not rejected: a real authentication layer is the correct long-term answer for an untrusted network, and `'loopback'` remains the default until one exists. The opt-in covers the case the design targets now — peers that are the operator's own devices.

## Consequences

A tailnet deployment sets `privilegedAuthority: 'trusted'` and its second device gets the whole GUI, including settings, credentials, presets, and the native directory picker. The cost is that the fence's authority list now governs a second decision, so an operator who declares a wide `trustedHosts` list while opting in widens more than they may expect; the README states that `'trusted'` widens reachability, not trust. No new events, no session-log impact, and no model-visible surface: the change is one config field and one list passed to an existing fence.

## Testing

`packages/client/connection/tests/node-half.host.spec.ts` covers both values: the existing loopback-pin test still asserts 403 for every privileged method under a declared authority with the default config, and the new test asserts the same set reaches the carrier under `privilegedAuthority: 'trusted'` while an authority that is not declared still fails the fence outright. `pnpm run gen-config-catalog` records the new field in the generated config catalog.
