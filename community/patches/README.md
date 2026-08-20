# Community adaptation patches

English | [中文](README.zh.md)

This directory preserves the exact one-commit rc.7 adaptations imported into this snapshot. The patch files are durable review records: their base and target commits remain audit identifiers, not links that assume an upstream branch continues to publish the local commits.

## Records

- [dsh-archived-sessions-rc7.patch](dsh-archived-sessions-rc7.patch) is the `7d3ba012d3ed..a4bdb236d9` adaptation.
- [dsh-anchored-standard-rc7.patch](dsh-anchored-standard-rc7.patch) is the `25f21aefaf8d..e6b41438ca` adaptation.

Each file is the byte-for-byte `git format-patch --stdout <base>..<target>` export from its source repository. Read it with [COMMUNITY_SOURCES.md](../../COMMUNITY_SOURCES.md), which records ownership, license, and the supported rc.7 boundary.
