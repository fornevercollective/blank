/**
 * Serve yt-dlp archives from ~/Downloads with Range support for preview controls.
 * MKV/AVI (typical yt-dlp AV1+Opus) are ffmpeg → HLS for in-browser playback.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const FILE_TTL_MS = 6 * 60 * 60 * 1000;
const LIST_LIMIT = 40;

const MEDIA_EXT = new Set([
  ".mkv",
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".avi",
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".flac",
  ".opus",
]);

/** @typedef {"direct"|"hls"|"audio"} LocalStreamKind */

/**
 * @typedef {{
 *   filePath: string,
 *   created: number,
 *   streamKind: LocalStreamKind,
 *   hlsDir?: string,
 *   hlsState?: "idle"|"starting"|"ready"|"error",
 *   hlsError?: string,
 *   hlsPoll?: ReturnType<typeof setInterval>,
 *   hlsChild?: import("node:child_process").ChildProcess,
 * }} FilePlayRow
 */

/** @type {Map<string, FilePlayRow>} */
const filePlayCache = new Map();

const HLS_CONTAINER_EXT = new Set([".mkv", ".avi"]);

function filePlayId() {
  return randomBytes(12).toString("hex");
}

function expandHome(p) {
  const s = String(p);
  if (s.startsWith("~/")) return path.join(os.homedir(), s.slice(2));
  return s;
}

export function downloadsDir() {
  return path.resolve(expandHome("~/Downloads"));
}

/**
 * @param {string} name basename or relative path under Downloads
 * @returns {string}
 */
export function resolveDownloadFile(name) {
  const base = downloadsDir();
  const target = path.resolve(base, String(name).replace(/^\/+/, ""));
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error("path must stay under Downloads");
  }
  const st = fs.statSync(target);
  if (!st.isFile()) throw new Error("not a file");
  const ext = path.extname(target).toLowerCase();
  if (!MEDIA_EXT.has(ext)) throw new Error(`unsupported type ${ext || "(none)"}`);
  return target;
}

function hlsDirFor(id) {
  return path.join(os.tmpdir(), "blank-file-hls", id);
}

function removeHlsDir(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

function stopFileHls(row) {
  if (row.hlsPoll) {
    clearInterval(row.hlsPoll);
    row.hlsPoll = undefined;
  }
  if (row.hlsChild && !row.hlsChild.killed) {
    try {
      row.hlsChild.kill("SIGTERM");
    } catch {
      /* noop */
    }
  }
  row.hlsChild = undefined;
  removeHlsDir(row.hlsDir);
  row.hlsDir = undefined;
  row.hlsState = "idle";
  row.hlsError = undefined;
}

function pruneFileCache() {
  const now = Date.now();
  for (const [id, row] of filePlayCache) {
    if (now - row.created > FILE_TTL_MS) {
      stopFileHls(row);
      filePlayCache.delete(id);
    }
  }
}

/** @param {string} filePath */
function localStreamKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".mp3", ".m4a", ".wav", ".aac", ".flac", ".opus"].includes(ext)) return "audio";
  if (HLS_CONTAINER_EXT.has(ext)) return "hls";
  return "direct";
}

/**
 * @param {string} id
 * @param {FilePlayRow} row
 */
function startFileHlsTranscode(id, row) {
  if (row.hlsState === "starting" || row.hlsState === "ready") return;
  const dir = hlsDirFor(id);
  fs.mkdirSync(dir, { recursive: true });
  const playlist = path.join(dir, "index.m3u8");
  const segPattern = path.join(dir, "seg%03d.ts");

  row.hlsDir = dir;
  row.hlsState = "starting";
  row.hlsError = undefined;

  const args = [
    "-hide_banner",
    "-nostats",
    "-loglevel",
    "error",
    "-i",
    row.filePath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "0",
    "-hls_flags",
    "independent_segments+omit_endlist",
    "-hls_segment_filename",
    segPattern,
    playlist,
  ];

  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  row.hlsChild = child;
  let err = "";
  child.stderr?.on("data", (d) => {
    err += d.toString();
  });
  child.on("error", (e) => {
    row.hlsState = "error";
    row.hlsError =
      e && typeof e === "object" && "code" in e && e.code === "ENOENT"
        ? "ffmpeg not found on PATH"
        : e instanceof Error
          ? e.message
          : String(e);
  });
  child.on("close", (code) => {
    row.hlsChild = undefined;
    if (row.hlsState === "error") return;
    try {
      const pl = fs.readFileSync(playlist, "utf8");
      if (/#EXTINF:/.test(pl)) row.hlsState = "ready";
      else if (code !== 0) {
        row.hlsState = "error";
        row.hlsError =
          err.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ||
          `ffmpeg exit ${code}`;
      }
    } catch {
      if (code !== 0) {
        row.hlsState = "error";
        row.hlsError =
          err.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ||
          `ffmpeg exit ${code}`;
      }
    }
    if (row.hlsPoll) {
      clearInterval(row.hlsPoll);
      row.hlsPoll = undefined;
    }
  });

  row.hlsPoll = setInterval(() => {
    if (row.hlsState === "ready" || row.hlsState === "error") {
      if (row.hlsPoll) clearInterval(row.hlsPoll);
      row.hlsPoll = undefined;
      return;
    }
    try {
      const pl = fs.readFileSync(playlist, "utf8");
      if (/#EXTINF:/.test(pl)) row.hlsState = "ready";
    } catch {
      /* playlist not written yet */
    }
  }, 400);
}

/**
 * @param {string} absPath
 * @returns {{ filePlayId: string, playPath: string, title: string, streamKind: LocalStreamKind }}
 */
export function registerLocalFilePlay(absPath) {
  const resolved = path.resolve(absPath);
  const base = downloadsDir();
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("only files under ~/Downloads are allowed");
  }
  const id = filePlayId();
  const streamKind = localStreamKind(resolved);
  /** @type {FilePlayRow} */
  const row = { filePath: resolved, created: Date.now(), streamKind };
  filePlayCache.set(id, row);
  pruneFileCache();
  if (streamKind === "hls") startFileHlsTranscode(id, row);
  const title = path.basename(resolved);
  const playPath =
    streamKind === "hls"
      ? `/api/ingest/file/${id}/index.m3u8`
      : `/api/ingest/file/${id}`;
  return {
    filePlayId: id,
    playPath,
    title,
    streamKind,
  };
}

/** @returns {Promise<{ name: string, size: number, mtime: number, ext: string }[]>} */
export async function listDownloadFiles() {
  const dir = downloadsDir();
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const ext = path.extname(name).toLowerCase();
    if (!MEDIA_EXT.has(ext)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fsp.stat(full);
      if (!st.isFile()) continue;
      rows.push({ name, size: st.size, mtime: st.mtimeMs, ext });
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows.slice(0, LIST_LIMIT);
}

function mimeForExt(ext) {
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".aac":
      return "audio/aac";
    default:
      return "application/octet-stream";
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
/** @param {string} body @param {string} id */
function rewriteLocalM3u8(body, id) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      if (/^seg\d{3}\.ts$/i.test(t)) {
        return `/api/ingest/file/${id}/${t}`;
      }
      return line;
    })
    .join("\n");
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function serveLocalHlsPlaylist(req, res, id) {
  const row = filePlayCache.get(id);
  if (!row || row.streamKind !== "hls") {
    res.writeHead(410, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" });
    res.end("file session expired — open the file again\n");
    return;
  }
  if (row.hlsState === "error") {
    res.writeHead(502, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "close",
    });
    res.end(`${row.hlsError || "transcode failed"}\n`);
    return;
  }
  const playlist = path.join(row.hlsDir || hlsDirFor(id), "index.m3u8");
  let text = "";
  try {
    text = fs.readFileSync(playlist, "utf8");
  } catch {
    if (row.hlsState !== "ready") {
      res.writeHead(503, {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "2",
        "Cache-Control": "no-store",
        Connection: "close",
      });
      res.end("preparing browser preview (ffmpeg)…\n");
      return;
    }
    res.writeHead(502, { Connection: "close" });
    res.end("playlist missing\n");
    return;
  }
  if (!/#EXTINF:/.test(text)) {
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "2",
      "Cache-Control": "no-store",
      Connection: "close",
    });
    res.end("preparing browser preview (ffmpeg)…\n");
    return;
  }
  const body = Buffer.from(rewriteLocalM3u8(text, id), "utf8");
  res.writeHead(200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 * @param {string} segment
 */
function serveLocalHlsSegment(req, res, id, segment) {
  const row = filePlayCache.get(id);
  if (!row?.hlsDir) {
    res.writeHead(410, { Connection: "close" });
    res.end();
    return;
  }
  const segPath = path.join(row.hlsDir, segment);
  if (!segPath.startsWith(row.hlsDir + path.sep)) {
    res.writeHead(403, { Connection: "close" });
    res.end();
    return;
  }
  let stat;
  try {
    stat = fs.statSync(segPath);
  } catch {
    res.writeHead(404, { Connection: "close" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Length": stat.size,
    "Content-Type": "video/mp2t",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(segPath).pipe(res);
}

function serveLocalFile(req, res, id) {
  pruneFileCache();
  const row = filePlayCache.get(id);
  if (!row) {
    res.writeHead(410, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" });
    res.end("file session expired — open the file again\n");
    return;
  }
  const filePath = row.filePath;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404, { Connection: "close" });
    res.end();
    return;
  }
  const total = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeForExt(ext);
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range));
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end < total) {
        const chunk = end - start + 1;
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunk,
          "Content-Type": type,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, {
    "Content-Length": total,
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

/** @param {import("node:http").ServerResponse} res @param {number} code @param {object} obj */
function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  /** @type {import("node:http").ServerResponse & { __blankOutBytes?: number }} */ (res).__blankOutBytes =
    body.length;
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} urlPath
 * @returns {boolean}
 */
export async function handleLocalIngestApi(req, res, urlPath) {
  if (urlPath === "/api/ingest/downloads" && (req.method === "GET" || req.method === "HEAD")) {
    try {
      const files = await listDownloadFiles();
      const payload = { ok: true, dir: downloadsDir(), files };
      if (req.method === "HEAD") {
        const body = Buffer.from(JSON.stringify(payload), "utf8");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": body.length,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        res.end();
      } else {
        json(res, 200, payload);
      }
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (urlPath === "/api/ingest/local" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    if (!name) {
      json(res, 400, { ok: false, error: "need name (file in ~/Downloads)" });
      return true;
    }
    try {
      const abs = resolveDownloadFile(name);
      const session = registerLocalFilePlay(abs);
      json(res, 200, { ok: true, ...session, name });
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  const hlsPlaylistMatch = urlPath.match(/^\/api\/ingest\/file\/([a-f0-9]+)\/index\.m3u8$/);
  if (hlsPlaylistMatch && (req.method === "GET" || req.method === "HEAD")) {
    serveLocalHlsPlaylist(req, res, hlsPlaylistMatch[1]);
    return true;
  }

  const hlsSegMatch = urlPath.match(/^\/api\/ingest\/file\/([a-f0-9]+)\/(seg\d{3}\.ts)$/);
  if (hlsSegMatch && (req.method === "GET" || req.method === "HEAD")) {
    serveLocalHlsSegment(req, res, hlsSegMatch[1], hlsSegMatch[2]);
    return true;
  }

  const fileMatch = urlPath.match(/^\/api\/ingest\/file\/([a-f0-9]+)$/);
  if (fileMatch && (req.method === "GET" || req.method === "HEAD")) {
    serveLocalFile(req, res, fileMatch[1]);
    return true;
  }

  return false;
}
