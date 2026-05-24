#!/usr/bin/env node
/**
 * One-shot: blank gsplat bundle → on-disk training kit (+ frame JPEGs).
 * SuperSplat (https://github.com/playcanvas/supersplat) opens *trained* splat PLY, not this sparse PLY.
 *
 * Usage:
 *   ./start.sh   # in another terminal
 *   node support/scripts/gsplat-export-kit.mjs "https://www.youtube.com/watch?v=…" [--out ./gsplat-export] [--base http://127.0.0.1:5173]
 *     [--filter=wh-lawn] [--filter=aerial,wide] [--scenes=0,2,5] [--caption=lawn] [--max-scenes=8]
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import process from "node:process";

const pageUrl = process.argv.find((a) => a.startsWith("http")) || "";
const outArg = process.argv.find((a) => a.startsWith("--out="));
const baseArg = process.argv.find((a) => a.startsWith("--base="));
const outDir = path.resolve(outArg ? outArg.slice("--out=".length) : "./gsplat-export");
const base = baseArg ? baseArg.slice("--base=".length) : process.env.BLANK_BASE || "http://127.0.0.1:5173";
const filterArg = process.argv.find((a) => a.startsWith("--filter="));
const scenesArg = process.argv.find((a) => a.startsWith("--scenes="));
const captionArg = process.argv.find((a) => a.startsWith("--caption="));
const maxScenesArg = process.argv.find((a) => a.startsWith("--max-scenes="));

if (!pageUrl.startsWith("http")) {
  process.stderr.write(
    "Usage: node support/scripts/gsplat-export-kit.mjs <video-url> [--out ./gsplat-export] [--base http://127.0.0.1:5173]\n",
  );
  process.exit(1);
}

function request(method, urlPath, body) {
  const u = new URL(urlPath, base);
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
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode || 0, buf, type: res.headers["content-type"] || "" });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  process.stdout.write(`Building gsplat bundle for ${pageUrl}\n`);
  /** @type {Record<string, unknown>} */
  const buildBody = { url: pageUrl, useFrames: true };
  if (filterArg) {
    buildBody.filterTypes = filterArg
      .slice("--filter=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (scenesArg) {
    buildBody.sceneIndices = scenesArg
      .slice("--scenes=".length)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  if (captionArg) buildBody.captionQuery = captionArg.slice("--caption=".length);
  if (maxScenesArg) buildBody.maxScenes = Number(maxScenesArg.slice("--max-scenes=".length)) || 14;

  const build = await request("/api/ingest/gsplat/build", "POST", buildBody);
  let meta;
  try {
    meta = JSON.parse(build.buf.toString("utf8"));
  } catch {
    meta = null;
  }
  if (build.status !== 200 || !meta?.ok) {
    process.stderr.write(`Build failed (${build.status}): ${build.buf.toString("utf8").slice(0, 500)}\n`);
    process.exit(1);
  }

  const q = encodeURIComponent(pageUrl);
  const plyRes = await request(`/api/ingest/gsplat/pointcloud.ply?url=${q}`, "GET");
  const trRes = await request(`/api/ingest/gsplat/transforms.json?url=${q}`, "GET");
  const camRes = await request(`/api/ingest/gsplat/cameras.json?url=${q}`, "GET");
  if (plyRes.status !== 200 || trRes.status !== 200) {
    process.stderr.write("Download PLY/transforms failed\n");
    process.exit(1);
  }

  const transforms = JSON.parse(trRes.buf.toString("utf8"));
  const cameras = camRes.status === 200 ? JSON.parse(camRes.buf.toString("utf8")) : transforms.frames || [];

  fs.mkdirSync(path.join(outDir, "frames"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "pointcloud.ply"), plyRes.buf);
  fs.writeFileSync(path.join(outDir, "transforms.json"), trRes.buf);
  if (camRes.status === 200) fs.writeFileSync(path.join(outDir, "cameras.json"), camRes.buf);

  const camList = Array.isArray(cameras) ? cameras : cameras.cameras || transforms.frames || [];
  let frameN = 0;
  for (let i = 0; i < camList.length; i++) {
    const cam = camList[i];
    const t = Number(cam.t ?? cam.time ?? 0);
    const rel =
      cam.imageName ||
      cam.file_path ||
      `frames/${String(i + 1).padStart(5, "0")}.jpg`;
    const dest = path.join(outDir, rel.replace(/^frames\//, "frames/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const thumb = await request(
      `/api/ingest/scene-thumb?url=${q}&t=${encodeURIComponent(String(t))}`,
      "GET",
    );
    if (thumb.status === 200 && thumb.buf.length > 64) {
      fs.writeFileSync(dest, thumb.buf);
      frameN++;
      process.stdout.write(`  frame ${rel}\n`);
    }
  }

  const readme = `# gsplat-export kit (from blank)

Source: ${pageUrl}
Points: ${meta.pointCount} · Cameras: ${meta.cameraCount} · ${meta.geoSummary || ""}

## 1. Train (required before SuperSplat)

This folder's \`pointcloud.ply\` is a **sparse RGB point cloud** (init hint), not a Gaussian splat.

\`\`\`bash
cd ${outDir}
# Option A — nerfstudio splatfacto (common)
ns-train splatfacto --data .
# Option B — gsplat CLI
# gsplat train --data . --output-dir ./splat-out
\`\`\`

Trained output is usually under \`outputs/…/point_cloud.ply\` (nerfstudio) or \`splat-out/…/*.ply\`.

## 2. Open in SuperSplat

- Editor: https://supersplat.at/editor
- Repo: https://github.com/playcanvas/supersplat

Drag the **trained** \`point_cloud.ply\` (or export \`.compressed.ply\` / \`.sog\` for web).

Do **not** import blank's \`pointcloud.ply\` into SuperSplat — it lacks Gaussian scales/rotations/opacity.

## 3. Publish / compress (optional)

- Edit/crop in SuperSplat, then File → Export (.sog recommended for web)
- Or CLI: https://github.com/playcanvas/splat-transform

${meta.gsplatCommand ? `\n## Printed train hint\n\n\`\`\`\n${meta.gsplatCommand}\n\`\`\`\n` : ""}
`;

  fs.writeFileSync(path.join(outDir, "SUPERSPLAT.md"), readme);
  process.stdout.write(`\nWrote ${outDir}/ (${frameN} frames, pointcloud.ply, transforms.json)\n`);
  process.stdout.write(`Next: train locally, then open trained PLY in https://supersplat.at/editor\n`);
  process.stdout.write(`See ${outDir}/SUPERSPLAT.md\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
