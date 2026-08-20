import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { apply, handleDelete, handleDetail, handleList } from "../lib/index.js";

function context(services) {
  return {
    get(name) {
      return services[name];
    }
  };
}

function registry(ids) {
  return {
    state: { initialized: true, workspaceIds: [], archivedSessionIds: [...ids] },
    get archivedSessionIds() {
      return this.state.archivedSessionIds;
    },
    async setState(next) {
      this.state = next;
    }
  };
}

test("registers the route as a lifecycle-owned effect", () => {
  let effect;
  let disposed = false;
  const ctx = {
    effect(callback, label) {
      effect = { callback, label };
    },
    webServer: {
      register(route) {
        assert.equal(route.kind, "prefix");
        assert.equal(route.path, "/dsh-archived");
        return () => {
          disposed = true;
        };
      }
    }
  };

  apply(ctx);
  assert.match(effect.label, /dsh-archived/);
  const dispose = effect.callback();
  dispose();
  assert.equal(disposed, true);
});

test("reads only a bounded reverse cut for detail previews", async () => {
  const events = Array.from({ length: 140 }, (_, seq) => ({
    type: "user/message",
    seq,
    time: seq,
    data: { content: [{ type: "text", text: `message-${seq}` }] }
  }));
  let requestedTypes;
  const log = {
    length: events.length,
    *reverseValuesOf(types) {
      requestedTypes = types;
      for (let index = events.length - 1; index >= 0; index -= 1) yield events[index];
    }
  };
  const inspection = {
    meta: { id: "archived", createdAt: 1, cwd: "/workspace" },
    log,
    get events() {
      throw new Error("detail must not materialize the complete log");
    }
  };
  const result = await handleDetail(context({
    sessionPersistence: { inspect: async () => inspection }
  }), { sessionId: "archived" });

  assert.deepEqual(requestedTypes, ["user/message", "assistant/message", "tool/call"]);
  assert.equal(result.totalEvents, 140);
  assert.equal(result.messageCount, 100);
  assert.equal(result.truncated, true);
  assert.equal(result.messages[0].text, "message-40");
  assert.equal(result.messages.at(-1).text, "message-139");
});

test("deletes only the single directory located by JSONL persistence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dsh-archived-delete-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const sessionDir = join(root, "project", "session-id");
  const neighbor = join(root, "project", "keep");
  await mkdir(sessionDir, { recursive: true });
  await mkdir(neighbor, { recursive: true });
  const artifact = join(sessionDir, "session.jsonl.zstd");
  await writeFile(artifact, "fixture");
  await writeFile(join(sessionDir, "attachment.bin"), "attachment");
  await writeFile(join(neighbor, "keep.txt"), "keep");
  const archived = registry(["session-id"]);
  const result = await handleDelete(context({
    workspaceRegistry: archived,
    sessionPersistence: {
      list: async () => [{ id: "session-id", createdAt: 1 }],
      locate: () => ({ kind: "jsonl", path: artifact })
    },
    sessions: { get: () => undefined },
    agents: { get: () => undefined }
  }), { sessionId: "session-id" });

  assert.equal(result.deleted, true);
  await assert.rejects(stat(sessionDir), { code: "ENOENT" });
  assert.equal(await readFile(join(neighbor, "keep.txt"), "utf8"), "keep");
  assert.deepEqual(archived.archivedSessionIds, []);
});

test("refuses running sessions before touching persistence", async () => {
  let listed = false;
  await assert.rejects(handleDelete(context({
    workspaceRegistry: registry(["running"]),
    sessionPersistence: { list: async () => { listed = true; return []; } },
    agents: { get: () => ({ status: "running" }) }
  }), { sessionId: "running" }), /正在运行/);
  assert.equal(listed, false);
});

test("prunes an archive id when its durable artifact is already absent", async () => {
  const archived = registry(["missing"]);
  const result = await handleDelete(context({
    workspaceRegistry: archived,
    sessionPersistence: { list: async () => [] },
    sessions: { get: () => undefined },
    agents: { get: () => undefined }
  }), { sessionId: "missing" });
  assert.deepEqual(result, {
    ok: true,
    deleted: false,
    reason: "no-artifact",
    sessionId: "missing"
  });
  assert.deepEqual(archived.archivedSessionIds, []);
});

test("rejects a persistence location that is not one session artifact", async () => {
  const archived = registry(["unsafe"]);
  await assert.rejects(handleDelete(context({
    workspaceRegistry: archived,
    sessionPersistence: {
      list: async () => [{ id: "unsafe", createdAt: 1 }],
      locate: () => ({ kind: "jsonl", path: "/tmp/not-a-session.txt" })
    },
    sessions: { get: () => undefined },
    agents: { get: () => undefined }
  }), { sessionId: "unsafe" }), /refusing unsafe persistence location/);
  assert.deepEqual(archived.archivedSessionIds, ["unsafe"]);
});

test("reports an unavailable inspect capability", async () => {
  await assert.rejects(handleDetail(context({
    sessionPersistence: { list: async () => [] }
  }), { sessionId: "missing" }), /session persistence inspect capability unavailable/);
});

test("reports missing list capabilities instead of returning a false empty archive", async () => {
  await assert.rejects(handleList(context({})), /workspace registry capability unavailable/);
  await assert.rejects(handleList(context({
    workspaceRegistry: registry([])
  })), /session persistence list capability unavailable/);
});
