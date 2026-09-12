# Agent Note: Read legacy single-frame Zstandard session logs

Status: implemented

English | [中文](2026-09-12-legacy-zstd-session-frames.zh.md)

## Problem

Some existing session artifacts store the session header and all initial JSONL events in one Zstandard frame. The current writer emits a header-only frame followed by event frames, so enforcing the new layout during workspace listing made valid historical sessions fail plugin initialization.

## Decision

The persistence reader accepts a first frame containing a valid header followed by valid event-coordinate rows (`seq`, `seq0`, or `start`). It still rejects a frame with no newline-terminated header or malformed body rows. New writes retain the two-frame layout. No automatic rewrite or deletion occurs during listing.

## Alternatives considered

**Delete or quarantine legacy sessions.** Rejected because the sessions contain user history and are readable data.

**Rewrite every legacy file during startup.** Rejected because listing must remain read-oriented and a crash during migration would expand startup failure risk.

## Consequences

Workspace initialization can list and load both layouts. Legacy files remain in their original format until a separately owned migration is designed; malformed or truncated files still fail closed. The first-frame compatibility check performs lightweight JSON parsing while listing legacy artifacts.

## Testing

The persistence package tests cover a legacy single-frame artifact, malformed header rejection, frame checksum failures, torn tails, and the existing write layout. A real `dsh web --port 0` startup after rebuilding the host package enumerated the installed session root and reached its listening URL.
