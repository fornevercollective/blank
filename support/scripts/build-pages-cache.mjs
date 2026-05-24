#!/usr/bin/env node
/**
 * Pre-cache video intel + scene JPEGs for GitHub Pages.
 * Usage: node support/scripts/build-pages-cache.mjs [youtube-url]
 * Requires: yt-dlp, ffmpeg on PATH.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPoseEstimateSvg, buildSceneAnalysisSvg, fetchVideoIntel } from "../video-intel.mjs";
import { captureSceneThumb } from "../video-intel.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPPORT = path.resolve(__dirname, "..");
const DEFAULT_URL = "https://www.youtube.com/watch?v=SKia5QUiGkE";
const MAX_SCENES = 28;

const argv = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const pageUrl = (argv[0] || process.env.PAGES_CACHE_URL || DEFAULT_URL).trim();

function youtubeId(url) {
  const m = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function main() {
  const id = youtubeId(pageUrl);
  if (!id) {
    console.error("Need a YouTube watch URL with 11-char id");
    process.exit(1);
  }

  const outRoot = path.join(SUPPORT, "pages-cache", id);
  const intelPath = path.join(outRoot, "intel.json");
  if (!force && fs.existsSync(intelPath)) {
    const manifestPath = path.join(outRoot, "manifest.json");
    let hint = "";
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      hint = ` (${m.sceneCount} scenes, ${m.captionLines} captions)`;
    } catch {
      /* ignore */
    }
    console.log(`Pages cache already present at ${intelPath}${hint} — use --force to rebuild`);
    return;
  }

  const scenesDir = path.join(outRoot, "scenes");
  const posesDir = path.join(outRoot, "poses");
  const analysisDir = path.join(outRoot, "analysis");
  ensureDir(scenesDir);
  ensureDir(posesDir);
  ensureDir(analysisDir);

  console.log(`Fetching intel for ${pageUrl} …`);
  const intel = await fetchVideoIntel(pageUrl, "en-auto");
  const scenes = Array.isArray(intel.scenes) ? intel.scenes.slice(0, MAX_SCENES) : [];

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const t = Number(sc.start) || 0;
    const file = `${String(i + 1).padStart(2, "0")}.jpg`;
    const outPath = path.join(scenesDir, file);
    process.stdout.write(`  scene ${file} @ ${t}s … `);
    try {
      const buf = await captureSceneThumb(pageUrl, t);
      fs.writeFileSync(outPath, buf);
      sc.thumbFile = file;
      console.log(`${(buf.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.log(`skip (${e instanceof Error ? e.message : e})`);
      sc.thumbFile = null;
    }

    const poseSvg = buildPoseEstimateSvg(pageUrl, t);
    const poseFile = `${String(i + 1).padStart(2, "0")}.svg`;
    fs.writeFileSync(path.join(posesDir, poseFile), poseSvg, "utf8");
    sc.poseFile = poseFile;

    const analysisFiles = {};
    for (const kind of ["sam", "alpha", "watermark", "vectorscope"]) {
      const svg = buildSceneAnalysisSvg(pageUrl, t, kind);
      const aFile = `${String(i + 1).padStart(2, "0")}-${kind}.svg`;
      fs.writeFileSync(path.join(analysisDir, aFile), svg, "utf8");
      analysisFiles[kind] = aFile;
    }
    sc.analysisFiles = analysisFiles;

    delete sc.thumb;
    delete sc.poseThumb;
    delete sc.analysis;
    delete sc.waveUrl;
  }

  const bundle = {
    ok: true,
    pagesCacheVersion: 1,
    videoId: id,
    webpageUrl: pageUrl,
    title: intel.title,
    description: intel.description,
    duration: intel.duration,
    durationLabel: intel.durationLabel,
    uploader: intel.uploader,
    uploadDate: intel.uploadDate,
    viewCount: intel.viewCount,
    thumb: intel.thumb,
    camera: intel.camera,
    captions: intel.captions,
    scenes,
  };

  fs.writeFileSync(intelPath, JSON.stringify(bundle, null, 2), "utf8");

  const manifest = {
    videoId: id,
    url: pageUrl,
    title: intel.title,
    sceneCount: scenes.length,
    captionLines: Array.isArray(intel.captions?.lines) ? intel.captions.lines.length : 0,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`\nWrote ${intelPath} (${scenes.length} scenes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
