#!/usr/bin/env node
/**
 * Serves this folder on localhost (no extra dependencies).
 * Usage: node server.mjs [port]
 *
 * Env (optional):
 *   BLANK_HOST, PORT          — bind address / port (default 127.0.0.1 / 5173)
 *   BLANK_MAX_CONNECTIONS     — max simultaneous TCP connections (default 128)
 *   BLANK_MAX_CONCURRENT      — max in-flight request handlers (default 24)
 *   BLANK_KEEP_ALIVE_MS       — HTTP keep-alive timeout (default 5000; lower frees sockets)
 *   BLANK_HEADERS_TIMEOUT_MS  — headers timeout (default 15000)
 *   BLANK_REQUEST_TIMEOUT_MS  — whole request timeout (default 30000)
 *   BLANK_INGEST_TIMEOUT_MS   — ingest/ffmpeg routes (default 600000)
 *   BLANK_QUIET=1             — fewer startup lines (request lines still log)
 *   BLANK_LOG_CONNECTIONS=1   — log each TCP open/close (noisy)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { handleIngestApi } from "./ytdlp-api.mjs";
import {
  addRuntimeTokensForIngest,
  getRuntimeSnapshot,
} from "./runtime-stats.mjs";
import { handleVersionApi } from "./version-hub.mjs";
import { handleStagingApi } from "./staging-hub.mjs";
import { handleLiveConcertsApi } from "./live-concerts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 5173;
const HOST = process.env.BLANK_HOST || process.env.HOST || "127.0.0.1";

const MAX_CONNECTIONS = intEnv("BLANK_MAX_CONNECTIONS", 128);
const MAX_CONCURRENT = intEnv("BLANK_MAX_CONCURRENT", 24);
const KEEP_ALIVE_MS = intEnv("BLANK_KEEP_ALIVE_MS", 12_000);
const INGEST_REQUEST_TIMEOUT_MS = intEnv("BLANK_INGEST_TIMEOUT_MS", 600_000);
const HEADERS_TIMEOUT_MS = intEnv("BLANK_HEADERS_TIMEOUT_MS", 15000);
const REQUEST_TIMEOUT_MS = intEnv("BLANK_REQUEST_TIMEOUT_MS", 30000);
const QUIET = process.env.BLANK_QUIET === "1";
const LOG_CONNECTIONS = process.env.BLANK_LOG_CONNECTIONS === "1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const stats = {
  requests: 0,
  busyRejects: 0,
  clientResets: 0,
  bytesOut: 0,
  inFlight: 0,
  tcpOpen: 0,
  started: Date.now(),
};

/** Browser aborts / stale keep-alive — noisy but harmless. */
function isBenignClientError(err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (code === "ECONNRESET" || code === "EPIPE" || code === "ECANCELED") return true;
  if (/ECONNRESET|EPIPE|aborted|socket hang up/i.test(msg)) return true;
  if (/Parse Error|Invalid method|HPE_/i.test(msg)) return true;
  return false;
}

function intEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const dim = "\x1b[2m";
const bold = "\x1b[1m";
const ylw = "\x1b[33m";
const grn = "\x1b[32m";
const red = "\x1b[31m";
const rst = "\x1b[0m";

function ts() {
  const d = new Date();
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function banner(url) {
  if (QUIET) {
    process.stdout.write(`${bold}blank${rst} → ${url}\n`);
    process.stdout.write(`${dim}pid ${process.pid} · root ${ROOT}${rst}\n`);
    return;
  }
  const lines = [
    `${dim}══════════════════════════════════════════════════════════════${rst}`,
    `${bold} blank${rst} dev server ${dim}·${rst} Node ${process.version} · pid ${process.pid}`,
    `${dim}──────────────────────────────────────────────────────────────${rst}`,
    ` ${bold}listen${rst}   ${url}`,
    ` ${bold}root${rst}     ${ROOT}`,
    ` ${bold}caps${rst}     maxConnections=${MAX_CONNECTIONS}  maxConcurrent=${MAX_CONCURRENT}`,
    ` ${bold}timeouts${rst} keepAlive=${KEEP_ALIVE_MS}ms  headers=${HEADERS_TIMEOUT_MS}ms  request=${REQUEST_TIMEOUT_MS}ms`,
    ` ${bold}signal${rst}   ${dim}SIGUSR1${rst} → print stats   ${dim}SIGINT / Ctrl+C${rst} → stop`,
    `${dim}══════════════════════════════════════════════════════════════${rst}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

function printStats() {
  const uptime = ((Date.now() - stats.started) / 1000).toFixed(1);
  process.stdout.write(
    `\n${bold}[stats]${rst} uptime ${uptime}s  requests ${stats.requests}  bytes-out ~${fmtBytes(stats.bytesOut)}  busy-rejects ${stats.busyRejects}\n` +
      `         in-flight ${stats.inFlight}  tcp-open ${stats.tcpOpen}  client-resets ${stats.clientResets}  caps concurrent≤${MAX_CONCURRENT} connections≤${MAX_CONNECTIONS}\n\n`,
  );
}

process.on("SIGUSR1", () => {
  printStats();
});

const server = http.createServer((req, res) => {
  const t0 = performance.now();
  const remote = req.socket.remoteAddress || "-";
  const method = req.method || "GET";
  const urlPathRaw = req.url || "/";

  const logLine = (status, bodyBytes) => {
    const ms = performance.now() - t0;
    const b = bodyBytes == null ? 0 : bodyBytes;
    const code = status >= 500 ? red : status >= 400 ? ylw : grn;
    process.stdout.write(
      `${dim}${ts()}${rst} ${bold}${method}${rst} ${urlPathRaw} ${code}${status}${rst} ${ms.toFixed(1)}ms ${fmtBytes(b)} ${dim}${remote}${rst}\n`,
    );
  };

  if (stats.inFlight >= MAX_CONCURRENT) {
    stats.busyRejects++;
    stats.requests++;
    const msg = Buffer.from(
      `blank: concurrent cap (${MAX_CONCURRENT}) — try BLANK_MAX_CONCURRENT or free local ports/services.\n`,
      "utf8",
    );
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "1",
      "Content-Length": msg.length,
      Connection: "close",
    });
    res.end(msg);
    logLine(503, msg.length);
    return;
  }

  stats.inFlight++;
  stats.requests++;

  let finalized = false;
  const finalize = (status, outBytes) => {
    if (finalized) return;
    finalized = true;
    stats.inFlight--;
    if (typeof outBytes === "number" && outBytes > 0) {
      stats.bytesOut += outBytes;
    }
    logLine(status, outBytes);
  };

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(urlPathRaw, "http://localhost").pathname);
  } catch {
    const body = Buffer.from("Bad Request", "utf8");
    res.writeHead(400, { "Content-Length": body.length, Connection: "close" });
    res.end(body);
    finalize(400, body.length);
    return;
  }

  if (urlPath.startsWith("/api/version/")) {
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Connection: "close",
      });
      res.end();
      finalize(204, 0);
      return;
    }
    if (method === "GET") {
      handleVersionApi(req, res, urlPath, ROOT)
        .then((handled) => {
          if (handled) {
            if (!finalized) finalize(res.statusCode || 200, 0);
            return;
          }
          const body = Buffer.from("Version API not found\n", "utf8");
          res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
          res.end(body);
          finalize(404, body.length);
        })
        .catch((err) => {
          const msg = Buffer.from(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            "utf8",
          );
          if (!res.headersSent) {
            res.writeHead(500, {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Length": msg.length,
              Connection: "close",
            });
            res.end(msg);
          }
          finalize(500, msg.length);
        });
      return;
    }
  }

  if (urlPath.startsWith("/api/staging/")) {
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Connection: "close",
      });
      res.end();
      finalize(204, 0);
      return;
    }
    if (method === "GET") {
      handleStagingApi(req, res, urlPath, ROOT)
        .then((handled) => {
          if (handled) {
            if (!finalized) finalize(res.statusCode || 200, 0);
            return;
          }
          const body = Buffer.from("Staging API not found\n", "utf8");
          res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
          res.end(body);
          finalize(404, body.length);
        })
        .catch((err) => {
          const msg = Buffer.from(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            "utf8",
          );
          if (!res.headersSent) {
            res.writeHead(500, {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Length": msg.length,
              Connection: "close",
            });
            res.end(msg);
          }
          finalize(500, msg.length);
        });
      return;
    }
  }

  if (urlPath === "/staging" || urlPath === "/staging/") {
    const stagingFile = path.join(ROOT, "staging.html");
    fs.stat(stagingFile, (err, st) => {
      if (err || !st.isFile()) {
        const body = Buffer.from("Not found", "utf8");
        res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
        res.end(body);
        finalize(404, body.length);
        return;
      }
      const size = st.size;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "no-store");
      if (method === "HEAD") {
        res.writeHead(200);
        res.end();
        finalize(200, 0);
        return;
      }
      const stream = fs.createReadStream(stagingFile);
      res.writeHead(200);
      stream.pipe(res);
      res.once("finish", () => finalize(200, size));
    });
    return;
  }

  if (urlPath === "/versions" || urlPath === "/versions/") {
    const versionsFile = path.join(ROOT, "versions.html");
    fs.stat(versionsFile, (err, st) => {
      if (err || !st.isFile()) {
        const body = Buffer.from("Not found", "utf8");
        res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
        res.end(body);
        finalize(404, body.length);
        return;
      }
      const size = st.size;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "no-store");
      if (method === "HEAD") {
        res.writeHead(200);
        res.end();
        finalize(200, 0);
        return;
      }
      const stream = fs.createReadStream(versionsFile);
      res.writeHead(200);
      stream.pipe(res);
      res.once("finish", () => finalize(200, size));
    });
    return;
  }

  if (urlPath.startsWith("/api/live/")) {
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Connection: "close",
      });
      res.end();
      finalize(204, 0);
      return;
    }
    handleLiveConcertsApi(req, res, urlPath)
      .then((handled) => {
        if (handled) {
          if (!finalized) finalize(res.statusCode || 200, 0);
          return;
        }
        const body = Buffer.from("Live API not found\n", "utf8");
        res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
        res.end(body);
        finalize(404, body.length);
      })
      .catch((err) => {
        const msg = Buffer.from(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          "utf8",
        );
        if (!res.headersSent) {
          res.writeHead(500, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": msg.length,
            Connection: "close",
          });
          res.end(msg);
        }
        finalize(500, msg.length);
      });
    return;
  }

  if (urlPath === "/live-multiview" || urlPath === "/live-multiview/") {
    const mvFile = path.join(ROOT, "live-multiview.html");
    fs.stat(mvFile, (err, st) => {
      if (err || !st.isFile()) {
        const body = Buffer.from("Not found", "utf8");
        res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
        res.end(body);
        finalize(404, body.length);
        return;
      }
      const size = st.size;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Length", size);
      res.setHeader("Cache-Control", "no-store");
      if (method === "HEAD") {
        res.writeHead(200);
        res.end();
        finalize(200, 0);
        return;
      }
      const stream = fs.createReadStream(mvFile);
      res.writeHead(200);
      stream.pipe(res);
      res.once("finish", () => finalize(200, size));
    });
    return;
  }

  if (urlPath === "/api/runtime" && (method === "GET" || method === "HEAD")) {
    const body = Buffer.from(JSON.stringify(getRuntimeSnapshot(stats)), "utf8");
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      Connection: "close",
    });
    if (method === "HEAD") res.end();
    else res.end(body);
    finalize(200, body.length);
    return;
  }

  if (urlPath.startsWith("/api/ingest/")) {
    req.setTimeout(INGEST_REQUEST_TIMEOUT_MS);
    res.setTimeout?.(INGEST_REQUEST_TIMEOUT_MS);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Connection: "close",
      });
      res.end();
      finalize(204, 0);
      return;
    }
    handleIngestApi(req, res, urlPath)
      .then((handled) => {
        if (handled) {
          addRuntimeTokensForIngest(urlPath, method);
          if (!finalized) finalize(res.statusCode || 200, 0);
          return;
        }
        const allow = "GET, HEAD, POST, OPTIONS";
        const body = Buffer.from(
          `${req.method} ${urlPath} — ingest: POST /api/ingest/resolve, GET /api/ingest/play/:id, scene-thumb, scene-audio, pose-thumb, scene-analysis-thumb, POST /api/ingest/intel, POST /api/ingest/gsplat/build, GET gsplat/pointcloud.ply transforms.json\n`,
          "utf8",
        );
        res.writeHead(405, {
          Allow: allow,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": body.length,
          Connection: "close",
        });
        res.end(body);
        finalize(405, body.length);
      })
      .catch((err) => {
        const msg = Buffer.from(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
          "utf8",
        );
        if (!res.headersSent) {
          res.writeHead(500, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": msg.length,
            Connection: "close",
          });
          res.end(msg);
        }
        finalize(500, msg.length);
      });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    const body = Buffer.from("Method Not Allowed\n", "utf8");
    res.writeHead(405, { Allow: "GET, HEAD, POST, OPTIONS", Connection: "close", "Content-Length": body.length });
    res.end(body);
    finalize(405, body.length);
    return;
  }

  let filePath;
  try {
    const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
    filePath = path.join(ROOT, safe === path.sep ? "" : safe);
    if (urlPath.endsWith("/") || urlPath === "/") {
      filePath = path.join(ROOT, "index.html");
    }
    if (!filePath.startsWith(ROOT)) {
      const body = Buffer.from("Forbidden", "utf8");
      res.writeHead(403, { "Content-Length": body.length, Connection: "close" });
      res.end(body);
      finalize(403, body.length);
      return;
    }
  } catch {
    const body = Buffer.from("Bad Request", "utf8");
    res.writeHead(400, { "Content-Length": body.length, Connection: "close" });
    res.end(body);
    finalize(400, body.length);
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      const body = Buffer.from("Not found", "utf8");
      res.writeHead(404, { "Content-Length": body.length, Connection: "close" });
      res.end(body);
      finalize(404, body.length);
      return;
    }
    const ext = path.extname(filePath);
    const size = st.size;
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Content-Length", size);
    if (ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css" || ext === ".json") {
      res.setHeader("Cache-Control", "no-store");
    }
    if (method === "HEAD") {
      res.writeHead(200);
      res.end();
      finalize(200, 0);
      return;
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200);

    stream.on("error", () => {
      if (finalized) return;
      if (!res.headersSent) {
        const body = Buffer.from("Internal Server Error\n", "utf8");
        res.writeHead(500, { "Content-Length": body.length, Connection: "close" });
        res.end(body);
        finalize(500, body.length);
      } else {
        res.destroy();
        finalize(500, 0);
      }
    });

    res.once("finish", () => {
      finalize(200, size);
    });

    res.once("close", () => {
      const doneWriting = res.writableFinished || res.finished;
      if (!finalized && !doneWriting) {
        stream.destroy();
        process.stdout.write(
          `${dim}${ts()}${rst} ${dim}${method}${rst} ${urlPathRaw} ${ylw}response cut short${rst} ${dim}${remote}${rst}\n`,
        );
        finalize(408, 0);
      }
    });

    stream.pipe(res);
  });
});

/* —— Networking: tune for busy multi-service localhost —— */
server.maxConnections = MAX_CONNECTIONS;
server.keepAliveTimeout = KEEP_ALIVE_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
try {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
} catch {
  /* older Node without requestTimeout */
}

server.on("connection", (socket) => {
  stats.tcpOpen++;
  if (LOG_CONNECTIONS) {
    process.stdout.write(
      `${dim}${ts()}${rst} ${dim}tcp + open${rst} (${stats.tcpOpen} live) ${dim}${socket.remoteAddress}${rst}\n`,
    );
  }
  socket.on("close", () => {
    stats.tcpOpen = Math.max(0, stats.tcpOpen - 1);
    if (LOG_CONNECTIONS) {
      process.stdout.write(
        `${dim}${ts()}${rst} ${dim}tcp − close${rst} (${stats.tcpOpen} live)\n`,
      );
    }
  });
});

server.on("clientError", (err, socket) => {
  if (isBenignClientError(err)) {
    stats.clientResets++;
    if (LOG_CONNECTIONS) {
      process.stdout.write(
        `${dim}${ts()}${rst} ${dim}http client reset${rst} ${dim}${err.message}${rst}\n`,
      );
    }
  } else {
    process.stdout.write(
      `${dim}${ts()}${rst} ${red}http clientError${rst} ${err.message}${err.code ? ` (${err.code})` : ""}\n`,
    );
  }
  try {
    if (!socket.destroyed) socket.destroy();
  } catch {
    /* noop */
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  banner(url);
  process.stdout.write(`${dim}Serving. Request log:${rst}\n`);
});

server.on("error", (err) => {
  process.stderr.write(`${red}listen error:${rst} ${err.message}\n`);
  if (err.code === "EADDRINUSE") {
    process.stderr.write(
      `${dim}Port ${PORT} is in use — try ${bold}PORT=8080${rst}${dim} or stop the other process.${rst}\n`,
    );
  }
  process.exit(1);
});
