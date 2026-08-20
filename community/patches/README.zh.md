# 社区适配补丁

[English](README.md) | 中文

本目录保留导入此快照的精确单提交 rc.7 适配。补丁文件是持久的评审记录：其基础与目标提交仍是审计标识，而不是假定上游分支继续发布本地提交的链接。

## 记录

- [dsh-archived-sessions-rc7.patch](dsh-archived-sessions-rc7.patch) 是 `7d3ba012d3ed..a4bdb236d9` 适配。
- [dsh-anchored-standard-rc7.patch](dsh-anchored-standard-rc7.patch) 是 `25f21aefaf8d..e6b41438ca` 适配。

每个文件都是从其源仓库以 `git format-patch --stdout <base>..<target>` 导出的逐字节结果。请与 [COMMUNITY_SOURCES.md](../../COMMUNITY_SOURCES.md) 一同阅读；该文件记录所有权、许可证和受支持的 rc.7 边界。
