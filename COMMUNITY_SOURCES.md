# Community source records

This repository packages a fixed `dsh-v0.1.0-rc.7` community snapshot. The records below identify the source revisions and the limits of each adaptation; they do not replace the generated dependency notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## DeepSeek Harness base

[deepseek-ai/deepseek-harness@99f6f02fec](https://github.com/deepseek-ai/deepseek-harness/tree/99f6f02fec) is the official `dsh-v0.1.0-rc.7` base. It remains the source for the harness runtime, workspace build graph, and official profiles. Its license is [MIT](https://github.com/deepseek-ai/deepseek-harness/blob/99f6f02fec/LICENSE).

## Session context integration

[leavelet/deepseek-harness](https://github.com/leavelet/deepseek-harness) contributes these seven commits, all under [MIT](https://github.com/leavelet/deepseek-harness/blob/05f82f4cbea20b32de45cd4ea6c22335ece255a4/LICENSE):

- [`05f82f4cbe`](https://github.com/leavelet/deepseek-harness/commit/05f82f4cbea20b32de45cd4ea6c22335ece255a4) — bounded long-session log reads.
- [`e4f8909553`](https://github.com/leavelet/deepseek-harness/commit/e4f89095530baf2751cd3a29ae42968d53806c29) — session context management.
- [`95444660b7`](https://github.com/leavelet/deepseek-harness/commit/95444660b7e8c4740af9c54602725cffe28508fd) — batched terminal readiness checks.
- [`d1c29ca587`](https://github.com/leavelet/deepseek-harness/commit/d1c29ca5877e69210f93208cda200a5eb907041a) — stable context-management Web timing.
- [`e8689437c3`](https://github.com/leavelet/deepseek-harness/commit/e8689437c3337d279dfb965d0e9fbde5ae0fdc19) — range-selection controls.
- [`40ec657488`](https://github.com/leavelet/deepseek-harness/commit/40ec6574884892e995880a42aadb8ac78bf42653) — model-capacity compaction planning.
- [`b2827cad2e`](https://github.com/leavelet/deepseek-harness/commit/b2827cad2eaa1daa6cd0c382253dd6636a58b216) — recoverable compaction review.

The integration adapts these changes to the official rc.7 base. It does not make later leavelet branches part of the supported harness baseline.

## Community modules

[MuWinds/dsh-archived-sessions@7d3ba012d3ed](https://github.com/MuWinds/dsh-archived-sessions/tree/7d3ba012d3ed08c1296446f709b34f25370c4547) supplies the archived-session bundle under [MIT](https://github.com/MuWinds/dsh-archived-sessions/blob/7d3ba012d3ed08c1296446f709b34f25370c4547/LICENSE). Local adaptation `a4bdb236d9` is an audit identifier, not a GitHub link; its durable record is [dsh-archived-sessions-rc7.patch](community/patches/dsh-archived-sessions-rc7.patch). It limits the bundle to rc.7-compatible lifecycle route cleanup, capability detection and error boundaries, bounded detail and packed reads, and safe single-session deletion. It is not an official workspace package.

[xiaobright/dsh-anchored-standard@9298a07d940d](https://github.com/xiaobright/dsh-anchored-standard/tree/9298a07d940dbf311fd34f9db7bc354f4752fbf9) supplies the anchored presets under [MIT](https://github.com/xiaobright/dsh-anchored-standard/blob/9298a07d940dbf311fd34f9db7bc354f4752fbf9/LICENSE). Local adaptation `29f732a5ef` is an audit identifier, not a GitHub link; its durable record is [dsh-anchored-standard-rc7.patch](community/patches/dsh-anchored-standard-rc7.patch). It aligns the wire-think adapter with rc.7; the presets remain runtime compositions outside the workspace build graph.

## Upstream compatibility audit

The source revisions above were checked on 2026-08-28. The archived-session source remains at its recorded revision. The official Harness head is [`cd5ef8148158`](https://github.com/deepseek-ai/deepseek-harness/tree/cd5ef8148158c3a752a658978873241fdf8e2bbc) (`dsh@0.1.2-alpha.1`), but this suite retains rc.7 because the official change is a new developer-preview baseline rather than a community-module update. The anchored preset source advances independently and is adapted to the retained rc.7 interfaces by the recorded patch.
