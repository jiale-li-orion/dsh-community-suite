# Agent Note: one attempt per ingest id, and an index that survives concurrency

Status: implemented

English | [中文](2026-09-11-one-attempt-per-ingest.zh.md)

> Scope: how the upload route keeps one client retry from becoming two files, and why the ingest index is committed the way it is.

## Problem

The upload route answered a retry from the ingest record only once that record existed. Between the first byte and the committed record the two requests were independent: both called the free-name helper, which checked with `existsSync` and then handed out a path, so two uploads arriving together could pick the same name and stream their bodies into one file, interleaving bytes neither client sent. Two uploads of one name were only half the problem: each read the index, added its record, and wrote the whole file back, so the later writer's snapshot dropped the earlier writer's record. The index write was a plain `writeFileSync`, which a crash can leave half-written — and the reader treats an unreadable index as empty, so one interrupted write lost every record in it.

## Decision

**A path is claimed, not chosen.** `reservePath` creates the candidate with `openSync(candidate, 'wx')`, and only a taken name (`EEXIST`) moves on to the next number. The claim is the create itself, so two simultaneous uploads of one name own two files; the empty file it leaves is what the body streams into, and both failure paths of `writeBody` remove it.

**One attempt per id, per plugin instance.** `apply` owns a map of in-flight attempts keyed by session and ingest id. A request that finds its id there waits for that attempt and is answered from its outcome — stored, or refused — and the entry is removed when the attempt settles, so a later retry is a fresh attempt rather than a replay of a failure. A retry arriving after the attempt finished still reads the record, which is the path that existed before this change. The map is registration state, not module state: it lives exactly as long as the routes that can answer from it.

**The index commit is a locked read-modify-write with an atomic replacement.** `recordIngest` runs under `withFileLock` on the index file and writes through `writeFileAtomic`, so concurrent acceptances serialize instead of dropping each other's records and no reader observes a partial index. `readIndex` stays lock-free: the rename is what makes either the complete old or the complete new file observable.

**The digest is taken as the body goes past**, so recording what was accepted never reads a multi-megabyte file back.

**The record carries the media type** `contentTypeForPath` derives from the written name, so a reader of the index does not re-derive it. The field is optional on read: a record written before it existed stays valid, and a reader that needs the type derives it from the path rather than inventing one.

**The file is written first, the record second.** A crash between the two leaves an orphan file, which anyone looking at the directory can see; the opposite order would leave a record naming a file that does not exist, which a retry would replay as a completed upload. The recovery cost is one duplicate copy, chosen over a false statement about what was received.

## Alternatives considered

- **Serialize whole uploads on the index lock.** Rejected: that lock's deadline is two seconds, so holding it while a phone streams 64 MiB would fail every upload queued behind one, to protect a decision that needs only the record.
- **Read the file back when answering a retry.** Rejected: the retry would pay the whole body's I/O to re-establish what the record already states, and the digest was taken for free while streaming.
- **Hold the body in memory to hash and store it once.** Rejected: the limit is 64 MiB per request, and the route exists to keep large bodies off the heap.
- **Answer a concurrent duplicate with a conflict status.** Rejected: that retry is a client doing the right thing after a dropped connection, and a conflict would push a retry loop into every client for a case the host can settle once.
- **Record every upload, ingest id or not.** Rejected: an upload without an id is a deliberate one-shot, and recording it would turn the index into a second directory listing that can disagree with the directory.
- **Commit the record before writing the file.** Rejected: the index could then name bytes that were never written, and replaying it would tell a client its upload was stored when nothing was.

## Consequences

A client's retry is idempotent across the whole window of an upload, not only after it, and two phones uploading a same-named photo at once produce two intact files instead of one interleaved file. The index is a record of what was received: entries are added under a lock and the file is replaced atomically, so a concurrent acceptance cannot drop another's entry and a crash cannot truncate it. An upload still costs one file write plus one small locked rewrite of the index, and the lock is held only for that JSON.

## Verification

`packages/workbench/workbench-bytes/tests/route.spec.ts` drives the registered routes through a real `WebServer`: a retry arriving while its pick is still being written is answered `repeat: true` from that attempt, two uploads of one name arriving together produce two files whose contents are each exactly one body with both records present, a refused attempt leaves neither a record nor a file, a write failure that is not a name collision is reported as a server failure instead of being numbered, and the record carries the media type of the written name. The record-validation matrix covers a device outside the closed set, a nested path inside the right bucket, and an empty media type.
