/**
 * Host half of the archived-sessions page (@muwinds/dsh-archived-sessions).
 *
 * Exposes a small JSON API under /dsh-archived/* on the harness web server:
 *   POST /dsh-archived/list       {}                -> { items, totalBytes }
 *   POST /dsh-archived/unarchive  { sessionId }     -> { ok, changed, archivedSessionIds }
 *   POST /dsh-archived/delete     { sessionId }     -> { ok, deleted, sessionId, path?, sizeBytes?, reason? }
 *   POST /dsh-archived/detail     { sessionId }     -> { id, createdAt, cwd, totalEvents, messageCount, truncated, messages }
 *
 * The browser half ships in the same package
 * (exports["./client"], dsh.client declaration).
 */

import { rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, parse } from "node:path";

/** Wait for the browser HTTP carrier before registering the route. */
export const inject = ["webServer"];

/** Plugin display name for the loader. */
export const name = "dsh-archived-sessions";

// ---------- helpers ----------

function parentDir(p) {
  return dirname(p);
}

function sessionIdOf(args) {
  if (args === null || typeof args !== "object") throw new Error("sessionId is required");
  const id = args.sessionId;
  if (typeof id !== "string" || id.length === 0) throw new Error("sessionId is required");
  return id;
}

/** Extract readable text from a content-block array. */
function blocksText(blocks) {
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    else if (b.type === "reasoning" && typeof b.text === "string") parts.push("[思考] " + b.text);
    else if (b.type === "tool-call") parts.push("[调用 " + (b.name || "?") + "]");
    else if (b.type === "tool-result") parts.push("[工具结果]");
    else if (b.type === "image") parts.push("[图片]");
  }
  return parts.join("\n");
}

/**
 * Recursive byte size of a session directory via the fs service.
 * Returns null when the path cannot be resolved (missing on disk).
 */
async function dirSizeBytes(fsSvc, dirPath, depth) {
  let target;
  try {
    target = await fsSvc.resolve(dirPath);
  } catch (e) {
    return null;
  }
  try {
    const info = await fsSvc.stat(target);
    if (!info) return 0;
    if (info.type !== "directory") return info.size || 0;
    if (depth > 10) return 0;
    let total = 0;
    let entries = [];
    try {
      entries = await fsSvc.listDir(target);
    } catch (e) {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.type === "directory") {
        const sub = await dirSizeBytes(fsSvc, fsSvc.processPath(entry.target), depth + 1);
        total += sub === null ? 0 : sub;
      } else {
        total += entry.size || 0;
      }
    }
    return total;
  } catch (e) {
    return 0;
  }
}

/** Resolve one exact JSONL session directory from the persistence-owned locator. */
function removableSessionDir(location) {
  if (!location || location.kind !== "jsonl" || typeof location.path !== "string") {
    throw new Error("refusing unsafe persistence location: expected a JSONL session artifact");
  }
  const artifact = location.path;
  const filename = basename(artifact);
  const dirPath = dirname(artifact);
  if (!isAbsolute(artifact)
    || !/^session\.jsonl(?:\.zstd)?$/.test(filename)
    || dirPath === parse(dirPath).root
    || dirname(dirPath) === dirPath) {
    throw new Error("refusing unsafe persistence location: expected one absolute session artifact path");
  }
  return dirPath;
}

/** Delete exactly one persistence-located session directory without a shell. */
async function removeDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/**
 * Remove one id from the durable archive set and keep the registry's in-memory
 * state consistent so its own later writes cannot clobber it.
 */
async function removeFromArchiveSet(ctx, sessionId) {
  const registry = ctx.get("workspaceRegistry");
  if (!registry) throw new Error("workspace registry unavailable");
  if (!registry.state || typeof registry.state !== "object") throw new Error("workspace registry is not started");
  const current = registry.archivedSessionIds;
  if (!Array.isArray(current) || !current.includes(sessionId)) return false;
  const next = current.filter((id) => id !== sessionId);
  const state = Object.assign({}, registry.state, { archivedSessionIds: next });
  if (typeof registry.setState === "function") {
    await registry.setState(state);
    return true;
  }
  const domain = ctx.get("storageDomain");
  if (!domain) throw new Error("storage domain unavailable");
  const unit = domain.get("workspace");
  if (!unit || !unit.global || typeof unit.global.set !== "function") throw new Error("workspace domain is not open");
  await unit.global.set(state);
  registry.state = state;
  return true;
}

/** A session is deletable unless its agent is actively running a turn. */
function sessionRunning(ctx, sessionId) {
  const agents = ctx.get("agents");
  if (!agents || typeof agents.get !== "function") return false;
  const agent = agents.get(sessionId);
  return !!(agent && agent.status === "running");
}

/**
 * Evict a live session from the in-memory store (the store's own detach path),
 * so a deleted session cannot resurface in the workspace afterward.
 */
function evictSessionFromMemory(ctx, sessionId) {
  const sessions = ctx.get("sessions");
  if (!sessions) return false;
  try {
    const store = sessions.store;
    if (!store || typeof store.get !== "function") return false;
    const entry = store.get(sessionId);
    if (!entry || typeof entry.detach !== "function") return false;
    entry.detach();
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- API handlers ----------

export async function handleList(ctx) {
  const registry = ctx.get("workspaceRegistry");
  const persistence = ctx.get("sessionPersistence");
  if (!registry || !Array.isArray(registry.archivedSessionIds)) {
    throw new Error("workspace registry capability unavailable");
  }
  if (!persistence || typeof persistence.list !== "function" || typeof persistence.locate !== "function") {
    throw new Error("session persistence list capability unavailable");
  }
  const archived = Array.isArray(registry.archivedSessionIds) ? [...registry.archivedSessionIds] : [];
  if (archived.length === 0) return { items: [], totalBytes: 0 };

  const headers = await persistence.list();
  const byId = new Map();
  for (const h of headers) byId.set(h.id, h);

  const titles = new Map();
  const query = ctx.get("sessionQuery");
  if (query && typeof query.readTitleSnapshots === "function") {
    try {
      const results = await query.readTitleSnapshots(archived);
      for (const r of results) {
        if (r && r.status === "fulfilled" && r.value && r.value.title && typeof r.value.title.title === "string") {
          titles.set(r.sessionId, r.value.title.title);
        }
      }
    } catch (e) {
      // best effort
    }
  }

  const liveSvc = ctx.get("sessions");
  const fsSvc = ctx.get("fs");
  const items = [];
  let totalBytes = 0;
  for (const id of archived) {
    const header = byId.get(id);
    let sizeBytes = 0;
    let missing = false;
    let path = null;
    if (header) {
      let location = null;
      try {
        location = persistence.locate(header);
      } catch (e) {
        location = null;
      }
      if (location && typeof location.path === "string" && location.path.length > 0) {
        path = location.path;
        if (fsSvc) {
          const size = await dirSizeBytes(fsSvc, parentDir(location.path), 0);
          if (size === null) missing = true;
          else sizeBytes = size;
        }
      } else {
        missing = true;
      }
    } else {
      missing = true;
    }
    totalBytes += sizeBytes;
    items.push({
      id,
      title: titles.get(id) || null,
      createdAt: header ? header.createdAt : null,
      cwd: header ? header.cwd || null : null,
      parentSession: header ? header.parentSession || null : null,
      sizeBytes,
      missing,
      live: !!(liveSvc && liveSvc.get(id) !== undefined),
      running: sessionRunning(ctx, id),
      path
    });
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { items, totalBytes };
}

export async function handleUnarchive(ctx, args) {
  const sessionId = sessionIdOf(args);
  const registry = ctx.get("workspaceRegistry");
  if (!registry) throw new Error("workspace registry unavailable");
  if (!Array.isArray(registry.archivedSessionIds) || !registry.archivedSessionIds.includes(sessionId)) {
    throw new Error("会话 '" + sessionId + "' 不在归档集合中");
  }
  const changed = await removeFromArchiveSet(ctx, sessionId);
  return { ok: true, changed, archivedSessionIds: [...registry.archivedSessionIds] };
}

export async function handleDelete(ctx, args) {
  const sessionId = sessionIdOf(args);
  const registry = ctx.get("workspaceRegistry");
  const persistence = ctx.get("sessionPersistence");
  if (!registry || !persistence) throw new Error("workspace registry or session persistence unavailable");
  if (!Array.isArray(registry.archivedSessionIds) || !registry.archivedSessionIds.includes(sessionId)) {
    throw new Error("会话 '" + sessionId + "' 不在归档集合中");
  }
  if (sessionRunning(ctx, sessionId)) {
    throw new Error("会话 '" + sessionId + "' 正在运行中，无法删除");
  }
  // A live (in-memory) session would otherwise resurface in the workspace once
  // the archive entry is pruned; evict it so the deletion is complete.
  const liveSvc = ctx.get("sessions");
  const isLive = !!(liveSvc && typeof liveSvc.get === "function" && liveSvc.get(sessionId) !== undefined);
  if (isLive && !evictSessionFromMemory(ctx, sessionId)) {
    throw new Error("会话 '" + sessionId + "' 仍驻留内存且无法移除，删除未完成；请重启 Harness 后重试");
  }
  const headers = await persistence.list();
  let header = null;
  for (const h of headers) {
    if (h.id === sessionId) {
      header = h;
      break;
    }
  }
  if (!header) {
    // Already gone from persistence: just prune the archive id.
    await removeFromArchiveSet(ctx, sessionId);
    return { ok: true, deleted: false, reason: "no-artifact", sessionId };
  }
  let location = null;
  try {
    location = persistence.locate(header);
  } catch (e) {
    location = null;
  }
  if (!location || typeof location.path !== "string" || location.path.length === 0) {
    await removeFromArchiveSet(ctx, sessionId);
    return { ok: true, deleted: false, reason: "no-artifact", sessionId };
  }
  const dirPath = removableSessionDir(location);
  const fsSvc = ctx.get("fs");
  let sizeBytes = 0;
  if (fsSvc) {
    const size = await dirSizeBytes(fsSvc, dirPath, 0);
    sizeBytes = size === null ? 0 : size;
  }
  await removeDir(dirPath);
  await removeFromArchiveSet(ctx, sessionId);
  return { ok: true, deleted: true, sessionId, path: dirPath, sizeBytes };
}

export async function handleDetail(ctx, args) {
  const sessionId = sessionIdOf(args);
  const persistence = ctx.get("sessionPersistence");
  if (!persistence || typeof persistence.inspect !== "function") {
    throw new Error("session persistence inspect capability unavailable");
  }
  let snapshot;
  try {
    snapshot = await persistence.inspect(sessionId);
  } catch (e) {
    throw new Error("无法读取会话内容（可能已从磁盘删除）: " + String((e && e.message) || e));
  }
  if (!snapshot || !snapshot.log || typeof snapshot.log.reverseValuesOf !== "function") {
    throw new Error("会话内容为空或不可读");
  }
  const messages = [];
  const MAX_MESSAGES = 100;
  const MAX_TEXT = 8000;
  for (const ev of snapshot.log.reverseValuesOf(["user/message", "assistant/message", "tool/call"])) {
    if (!ev || typeof ev !== "object" || !ev.data || typeof ev.data !== "object") continue;
    const data = ev.data;
    let message = null;
    if (ev.type === "user/message") {
      const text = blocksText(data.content);
      if (text) message = { seq: ev.seq, time: ev.time, role: "user", text: text.slice(0, MAX_TEXT) };
    } else if (ev.type === "assistant/message" && data.message && typeof data.message === "object") {
      const text = blocksText(data.message.content);
      if (text) message = { seq: ev.seq, time: ev.time, role: "assistant", text: text.slice(0, MAX_TEXT) };
    } else if (ev.type === "tool/call") {
      const name = typeof data.name === "string" ? data.name : "?";
      const argsText = typeof data.arguments === "string" ? data.arguments.slice(0, 300) : "";
      message = { seq: ev.seq, time: ev.time, role: "tool", text: "[" + name + "] " + argsText };
    }
    if (message !== null) messages.push(message);
    if (messages.length > MAX_MESSAGES) break;
  }
  const truncated = messages.length > MAX_MESSAGES;
  if (truncated) messages.length = MAX_MESSAGES;
  messages.reverse();
  const header = snapshot.meta || null;
  return {
    id: sessionId,
    createdAt: header ? header.createdAt : null,
    cwd: header ? header.cwd || null : null,
    parentSession: header ? header.parentSession || null : null,
    totalEvents: snapshot.log.length,
    messageCount: messages.length,
    truncated,
    messages
  };
}

// ---------- HTTP route ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

export function apply(ctx) {
  const handlers = {
    list: () => handleList(ctx),
    unarchive: (args) => handleUnarchive(ctx, args),
    delete: (args) => handleDelete(ctx, args),
    detail: (args) => handleDetail(ctx, args)
  };

  async function handler(req, res) {
    if ((req.method || "") !== "POST") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    const pathname = (req.url || "").split("?")[0].replace(/\/+$/, "");
    let action = null;
    for (const key of Object.keys(handlers)) {
      if (pathname === "/dsh-archived/" + key) {
        action = key;
        break;
      }
    }
    if (action === null) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    let body = {};
    try {
      const raw = await readBody(req);
      if (raw.trim().length > 0) body = JSON.parse(raw);
    } catch (e) {
      sendJson(res, 400, { error: "invalid JSON body" });
      return;
    }
    try {
      sendJson(res, 200, await handlers[action](body));
    } catch (e) {
      sendJson(res, 500, { error: (e && e.message) || String(e) });
    }
  }

  if (!ctx.webServer || typeof ctx.webServer.register !== "function") {
    throw new Error("web server route registration capability unavailable");
  }
  if (typeof ctx.effect !== "function") {
    throw new Error("Cordis lifecycle effect capability unavailable");
  }
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/dsh-archived",
    handler
  }), "dsh-archived-sessions: /dsh-archived route");
}
