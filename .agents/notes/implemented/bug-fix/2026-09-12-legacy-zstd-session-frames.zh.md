# Agent Note: 读取旧版单帧 Zstandard 会话日志

Status: implemented

[English](2026-09-12-legacy-zstd-session-frames.md) | 中文

## Problem

部分已有会话文件把会话 header 和全部初始 JSONL 事件放在同一个 Zstandard frame 中。当前写入器改为 header 独立 frame、事件另写 frame，因此启动时强制检查新布局会让有效历史会话导致 workspace 插件初始化失败。

## Decision

持久化读取器接受首 frame 中的有效 header 及其后的有效事件坐标行（`seq`、`seq0` 或 `start`）。没有换行结束的 header 或正文行损坏时仍拒绝。新写入继续使用两 frame 布局。列举会话时不自动重写或删除文件。

## Alternatives considered

**删除或隔离旧会话。** 不采用，因为这些会话包含用户历史且仍是可读数据。

**启动时重写所有旧文件。** 不采用，因为列举操作应保持读向，迁移过程中崩溃会扩大启动失败风险。

## Consequences

workspace 初始化可以列举和加载两种布局。旧文件在单独的迁移方案确定前保持原格式；损坏或截断文件仍快速失败。列举旧 artifact 时会多做轻量 JSON 解析。

## Testing

持久化包测试覆盖旧版单帧 artifact、损坏 header 拒绝、frame 校验和失败、尾部截断及现有写入布局。重建 host 包后，真实 `dsh web --port 0` 启动成功枚举当前会话根目录并打印监听地址。
