/**
 * Local yt-dlp resolve + HLS proxy for blank preview (TikTok live, watch pages).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const YTDLP_FORMAT = "bv*+ba/b";

const PLAY_TTL_MS = 45 * 60 * 1000;
const RESOLVE_TIMEOUT_MS = 120_000;

/** @type {Map<string, { streamUrl: string, pageUrl: string, allowed: Set<string>, created: number }>} */
const playCache = new Map();

function playId() {
  return randomBytes(12).toString("hex");
}

function expandHome(p) {
  const s = String(p);
  if (s.startsWith("~/")) return path.join(os.homedir(), s.slice(2));
  return s;
}

function runYtDlp(args, timeoutMs = RESOLVE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("yt-dlp timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new Error("yt-dlp not found on PATH") : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = (err || out).trim().split(/\r?\n/).slice(-4).join(" ");
        reject(new Error(tail || `yt-dlp exit ${code}`));
        return;
      }
      resolve(out.trim());
    });
  });
}

/** @param {string} pageUrl @param {string} [format] */
export async function resolveStreamUrl(pageUrl, format = YTDLP_FORMAT) {
  const out = await runYtDlp([
    "-f",
    format,
    "-g",
    "--no-warnings",
    "--no-playlist",
    pageUrl,
  ]);
  const lines = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http://") || l.startsWith("https://"));
  if (!lines.length) throw new Error("yt-dlp returned no stream URL");
  return lines.length === 1 ? lines[0] : lines[0];
}

/** @param {string} pageUrl */
export async function fetchTitle(pageUrl) {
  try {
    const t = await runYtDlp(
      ["--no-warnings", "--no-playlist", "--print", "%(title)s", pageUrl],
      45_000,
    );
    const line = t.split(/\r?\n/).find((l) => l.trim());
    return line?.trim() || null;
  } catch {
    return null;
  }
}

/** @param {string} pageUrl @param {{ format?: string, mergeExt?: string, audioOnly?: boolean }} [opts] */
export function startArchiveDownload(pageUrl, opts = {}) {
  const format = opts.format || YTDLP_FORMAT;
  const mergeExt = opts.mergeExt || "mkv";
  const out = expandHome("~/Downloads/%(title)s.%(ext)s");
  const args = [
    "-f",
    format,
    "-o",
    out,
    "--no-warnings",
    "--no-playlist",
    pageUrl,
  ];
  if (!opts.audioOnly) {
    args.splice(2, 0, "--merge-output-format", mergeExt);
  }
  const child = spawn(
    "yt-dlp",
    args,
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

/**
 * @param {string} pageUrl
 * @returns {Promise<{ playId: string, streamUrl: string, title: string | null }>}
 */
/** @param {string} pageUrl @param {{ download?: boolean, format?: string, mergeExt?: string, audioOnly?: boolean }} [opts] */
export async function registerPlaySession(pageUrl, opts = {}) {
  const format = opts.format || YTDLP_FORMAT;
  const [streamUrl, title] = await Promise.all([
    resolveStreamUrl(pageUrl, format),
    fetchTitle(pageUrl),
  ]);
  const id = playId();
  const allowed = new Set([streamUrl]);
  playCache.set(id, {
    streamUrl,
    pageUrl,
    allowed,
    created: Date.now(),
  });
  if (opts.download) {
    startArchiveDownload(pageUrl, {
      format,
      mergeExt: opts.mergeExt,
      audioOnly: opts.audioOnly,
    });
  }
  prunePlayCache();
  return { playId: id, streamUrl, title };
}

function prunePlayCache() {
  const now = Date.now();
  for (const [id, row] of playCache) {
    if (now - row.created > PLAY_TTL_MS) playCache.delete(id);
  }
}

function getPlayRow(id) {
  prunePlayCache();
  return playCache.get(id) || null;
}

function isM3u8(url, contentType, bodyHead) {
  if (/\.m3u8(\?|$)/i.test(url)) return true;
  if (contentType && /mpegurl|m3u8/i.test(contentType)) return true;
  const head = String(bodyHead || "").trimStart();
  return head.startsWith("#EXTM3U");
}

function rewriteM3u8(body, baseUrl, allowed) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return line;
      let abs;
      try {
        abs = new URL(t, baseUrl).href;
      } catch {
        return line;
      }
      allowed.add(abs);
      return `/api/ingest/proxy?u=${encodeURIComponent(abs)}`;
    })
    .join("\n");
}

function upstreamHeaders(pageUrl) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "*/*",
  };
  if (pageUrl) {
    try {
      const origin = new URL(pageUrl).origin;
      headers.Referer = pageUrl;
      headers.Origin = origin;
    } catch {
      /* noop */
    }
  }
  return headers;
}

function findRowForProxyUrl(target) {
  for (const row of playCache.values()) {
    if (row.allowed.has(target)) return row;
  }
  return null;
}

function fetchUpstream(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers }, (up) => {
      if (up.statusCode && up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
        const next = new URL(up.headers.location, url).href;
        up.resume();
        fetchUpstream(next, headers).then(resolve).catch(reject);
        return;
      }
      resolve(up);
    });
    req.on("error", reject);
    req.setTimeout(60_000, () => {
      req.destroy();
      reject(new Error("upstream timeout"));
    });
  });
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export async function handleIngestApi(req, res, urlPath) {
  const { handleIntelApi, handleSceneThumbApi, handleSceneAudioApi, handlePoseThumbApi } =
    await import("./video-intel.mjs");
  if (await handleSceneThumbApi(req, res)) return true;
  if (await handlePoseThumbApi(req, res)) return true;
  if (await handleSceneAudioApi(req, res)) return true;
  if (await handleIntelApi(req, res, urlPath)) return true;

  if (urlPath === "/api/ingest/resolve" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }
    const pageUrl = typeof parsed.url === "string" ? parsed.url.trim() : "";
    if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
      json(res, 400, { ok: false, error: "need http(s) url" });
      return true;
    }
    try {
      const download = parsed.download === true;
      const session = await registerPlaySession(pageUrl, {
        download,
        format: typeof parsed.format === "string" ? parsed.format : undefined,
        mergeExt: typeof parsed.mergeExt === "string" ? parsed.mergeExt : undefined,
        audioOnly: parsed.audioOnly === true,
      });
      json(res, 200, {
        ok: true,
        playId: session.playId,
        title: session.title,
        streamKind: isM3u8(session.streamUrl, "", "") ? "hls" : "direct",
        downloadStarted: download,
      });
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (urlPath === "/api/ingest/download" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }
    const pageUrl = typeof parsed.url === "string" ? parsed.url.trim() : "";
    if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
      json(res, 400, { ok: false, error: "need http(s) url" });
      return true;
    }
    try {
      startArchiveDownload(pageUrl, {
        format: typeof parsed.format === "string" ? parsed.format : undefined,
        mergeExt: typeof parsed.mergeExt === "string" ? parsed.mergeExt : undefined,
        audioOnly: parsed.audioOnly === true,
      });
      json(res, 200, { ok: true, downloadStarted: true });
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  const playMatch = urlPath.match(/^\/api\/ingest\/play\/([a-f0-9]+)$/);
  if (playMatch && (req.method === "GET" || req.method === "HEAD")) {
    const row = getPlayRow(playMatch[1]);
    if (!row) {
      if (req.method === "HEAD") {
        res.writeHead(410, { Connection: "close" });
        res.end();
        return true;
      }
      res.writeHead(410, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "close",
      });
      res.end("play session expired — resolve again\n");
      return true;
    }
    try {
      const up = await fetchUpstream(row.streamUrl, upstreamHeaders(row.pageUrl));
      const chunks = [];
      up.on("data", (c) => chunks.push(c));
      up.on("end", () => {
        const buf = Buffer.concat(chunks);
        const ct = String(up.headers["content-type"] || "");
        const isPlaylist = isM3u8(row.streamUrl, ct, buf.toString("utf8", 0, 32));
        if (up.statusCode && up.statusCode >= 400) {
          if (!res.headersSent) {
            res.writeHead(up.statusCode, {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              Connection: "close",
            });
            res.end(`upstream ${up.statusCode}\n`);
          }
          return;
        }
        if (isPlaylist) {
          const text = rewriteM3u8(buf.toString("utf8"), row.streamUrl, row.allowed);
          const body = Buffer.from(text, "utf8");
          res.writeHead(200, {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Content-Length": body.length,
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          });
          if (req.method === "HEAD") res.end();
          else res.end(body);
          return;
        }
        res.writeHead(up.statusCode || 200, {
          "Content-Type": ct || "application/octet-stream",
          "Content-Length": buf.length,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        if (req.method === "HEAD") res.end();
        else res.end(buf);
      });
      up.on("error", () => {
        if (!res.headersSent) json(res, 502, { ok: false, error: "upstream error" });
      });
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (urlPath.startsWith("/api/ingest/proxy") && (req.method === "GET" || req.method === "HEAD")) {
    const u = new URL(req.url || "/", "http://localhost").searchParams.get("u");
    if (!u || (!u.startsWith("http://") && !u.startsWith("https://"))) {
      json(res, 400, { ok: false, error: "bad proxy url" });
      return true;
    }
    let allowed = false;
    for (const row of playCache.values()) {
      if (row.allowed.has(u)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      json(res, 403, { ok: false, error: "url not in active play session" });
      return true;
    }
    const row = findRowForProxyUrl(u);
    try {
      const up = await fetchUpstream(u, upstreamHeaders(row?.pageUrl));
      const headers = { ...up.headers, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
      delete headers["transfer-encoding"];
      if (req.method === "HEAD") {
        res.writeHead(up.statusCode || 200, headers);
        up.resume();
        res.end();
        return true;
      }
      res.writeHead(up.statusCode || 200, headers);
      up.pipe(res);
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  return false;
}

/** @param {import("node:http").ServerResponse} res @param {number} code @param {object} obj */
function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}
