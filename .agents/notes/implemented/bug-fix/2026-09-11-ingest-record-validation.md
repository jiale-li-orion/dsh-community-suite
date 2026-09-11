# Agent Note: Validate persisted upload records before replay

Status: implemented

English | [中文](2026-09-11-ingest-record-validation.zh.md)

## Problem

Upload IDs come from HTTP requests, and the receipt index is editable workspace JSON. Object property lookup can mistake inherited names for completed uploads; accepting every JSON object also lets arrays lose newly assigned records and malformed entries produce false success responses.

## Decision

The upload route reads own JSON entries into a Map and validates each receipt before replay. Accepted metadata contains a nonnegative safe integer byte count and timestamp, a SHA-256 hex digest, a known client class or `unknown`, and a plain file name under that class's upload directory. Invalid entries are ignored independently, preserving usable receipts. Object.fromEntries serializes IDs as own JSON keys, including `__proto__`.

## Alternatives considered

**Reserve JavaScript property names.** Rejected because opaque upload IDs have no relationship to the object prototype; reserving a few strings leaves the disk-validation problem unsolved.

**Discard the entire index when one record is invalid.** Rejected because this would erase usable retry records for unrelated uploads.

## Consequences

Sequential retries of validated completed records return the same path and byte count. Ignoring unusable metadata preserves the existing upload fallback but cannot guarantee idempotence after index corruption. This does not serialize concurrent uploads, atomically commit the file and index, or verify that recorded bytes still exist. Those recovery obligations remain separate E2 work.

## Testing

Real HTTP route cases cover prototype-named IDs, array indexes, invalid receipt fields, and path/source mismatches. The shipped Web composition owns a keyless upload response transcript in `apps/web/tests/upload-ingest.e2e.ts`; it also proves valid receipts survive beside an invalid entry.
