#!/usr/bin/env node
/**
 * Smoke-test blank ingest + intel (for CLI / CI / agents).
 * Usage: node support/scripts/smoke-ingest.mjs [url] [--base http://127.0.0.1:5173]
 */
import http from "node:http";
import https from "node:https";

const DEFAULT_URL = "https://www.youtube.com/watch?v=GzYOpKWClNg";
const pageUrl = process.argv.find((a) => a.startsWith("http")) || DEFAULT_URL;
const baseArg = process.argv.find((a) => a.startsWith("--base="));
const base = baseArg ? baseArg.slice("--base=".length) : process.env.BLANK_BASE || "http://127.0.0.1:5173";

function request(method, path, body) {
  const u = new URL(path, base);
  const lib = u.protocol === "https:" ? https : http;
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      u,
      {
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* plain */
          }
          resolve({ status: res.statusCode || 0, text, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const home = await request("GET", "/");
if (home.status !== 200) {
  console.error(`FAIL home ${home.status}`);
  process.exit(1);
}

const intel = await request("POST", "/api/ingest/intel", { url: pageUrl });
if (intel.status !== 200 || !intel.json?.ok) {
  console.error(`FAIL intel ${intel.status}`, intel.json?.error || intel.text.slice(0, 200));
  process.exit(1);
}

console.log("OK", {
  base,
  pageUrl,
  title: intel.json.title,
  scenes: Array.isArray(intel.json.scenes) ? intel.json.scenes.length : 0,
  captions: Boolean(intel.json.captions),
});
console.log(`Open in browser: ${base}/?url=${encodeURIComponent(pageUrl)}`);
