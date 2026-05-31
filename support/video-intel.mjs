/**
 * yt-dlp metadata, chapters (scene cuts), and captions for feed cards.
 */
import { spawn } from "node:child_process";
import https from "node:https";
import http from "node:http";

const INTEL_TTL_MS = 30 * 60 * 1000;
const LIVE_INTEL_TTL_MS = 25 * 1000;
const LIVE_WINDOW_SEC = 20 * 60;
const LIVE_STEP_SEC = 90;

const FFMPEG_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.BLANK_FFMPEG_CONCURRENCY) || 2),
);
let ffmpegActive = 0;
/** @type {Array<() => void>} */
const ffmpegWait = [];

/** Serialize ffmpeg (scene thumbs, gsplat frames) to avoid stampedes + browser aborts. */
function runFfmpegQueued(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      ffmpegActive++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          ffmpegActive--;
          const next = ffmpegWait.shift();
          if (next) next();
        });
    };
    if (ffmpegActive < FFMPEG_CONCURRENCY) run();
    else ffmpegWait.push(run);
  });
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
function onClientGone(req, res, fn) {
  const fire = () => {
    if (!res.writableEnded) fn();
  };
  req.once("aborted", fire);
  res.once("close", fire);
}

/** @type {Map<string, { data: object, created: number }>} */
const intelCache = new Map();

/** @type {Map<string, { buf: Buffer, created: number }>} */
const sceneThumbCache = new Map();

/** @type {Map<string, { buf: Buffer, created: number }>} */
const sceneAudioCache = new Map();

/** @type {Map<string, { rgb: Uint8Array, created: number }>} */
const sceneRgbCache = new Map();

/** @type {Map<string, { bundle: object, created: number }>} */
const gsplatCache = new Map();

function sceneThumbApiUrl(pageUrl, startSec) {
  const q = new URLSearchParams({
    url: pageUrl,
    t: String(Math.max(0, Math.floor(startSec))),
  });
  return `/api/ingest/scene-thumb?${q}`;
}

function scenePoseThumbApiUrl(pageUrl, startSec) {
  const q = new URLSearchParams({
    url: pageUrl,
    t: String(Math.max(0, Math.floor(startSec))),
  });
  return `/api/ingest/pose-thumb?${q}`;
}

import {
  sceneAnalysisThumbApiUrl,
  SCENE_ANALYSIS_KINDS,
} from "./scene-analysis-api.js";
import {
  decodeJpegToRgb,
  analysisSvgFromRgb,
  poseJointsFromRgb,
  poseSvgFromJoints,
} from "./scene-frame-analysis.mjs";
import { estimateCinematography } from "./scene-cinematography.mjs";
import { buildGsplatBundle } from "./scene-gsplat-pipeline.mjs";

export { sceneAnalysisThumbApiUrl, SCENE_ANALYSIS_KINDS };

/** @param {string} s */
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic multi-joint stick figure (placement viz — MediaPipe / OpenPose style).
 * Seeded from url + scene time so each cut gets a stable pose estimate thumbnail.
 */
export function buildPoseEstimateSvg(pageUrl, tSec) {
  let seed = hashSeed(`${pageUrl}\0${Math.floor(tSec)}`);
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const cx = 52 + (rnd() - 0.5) * 10;
  const lean = (rnd() - 0.5) * 0.22;
  const reach = 0.85 + rnd() * 0.35;
  const stance = 0.9 + rnd() * 0.25;

  /** @type {Record<string, { x: number, y: number }>} */
  const j = {
    nose: { x: cx + lean * 4, y: 11 },
    lEye: { x: cx - 4 + lean * 3, y: 10 },
    rEye: { x: cx + 4 + lean * 3, y: 10 },
    lEar: { x: cx - 7, y: 12 },
    rEar: { x: cx + 7, y: 12 },
    neck: { x: cx + lean * 6, y: 20 },
    lShoulder: { x: cx - 14 - lean * 4, y: 26 },
    rShoulder: { x: cx + 14 + lean * 4, y: 26 },
    lElbow: { x: cx - 22 * reach - lean * 8, y: 38 },
    rElbow: { x: cx + 20 * reach + lean * 6, y: 36 },
    lWrist: { x: cx - 18 * reach - lean * 12, y: 50 },
    rWrist: { x: cx + 16 * reach + lean * 10, y: 48 },
    midHip: { x: cx + lean * 8, y: 52 },
    lHip: { x: cx - 10, y: 54 },
    rHip: { x: cx + 10, y: 54 },
    lKnee: { x: cx - 12 * stance, y: 68 },
    rKnee: { x: cx + 11 * stance, y: 67 },
    lAnkle: { x: cx - 14 * stance, y: 82 },
    rAnkle: { x: cx + 13 * stance, y: 81 },
  };

  const bones = [
    ["nose", "neck"],
    ["nose", "lEye"],
    ["nose", "rEye"],
    ["lEye", "lEar"],
    ["rEye", "rEar"],
    ["neck", "lShoulder"],
    ["neck", "rShoulder"],
    ["lShoulder", "lElbow"],
    ["lElbow", "lWrist"],
    ["rShoulder", "rElbow"],
    ["rElbow", "rWrist"],
    ["neck", "midHip"],
    ["midHip", "lHip"],
    ["midHip", "rHip"],
    ["lHip", "lKnee"],
    ["lKnee", "lAnkle"],
    ["rHip", "rKnee"],
    ["rKnee", "rAnkle"],
    ["lShoulder", "rShoulder"],
    ["lHip", "rHip"],
  ];

  const boneLines = bones
    .map(([a, b]) => {
      const p = j[a];
      const q = j[b];
      return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>`;
    })
    .join("\n    ");

  const joints = Object.values(j)
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="#9ed4f0" stroke="#141414" stroke-width="0.6"/>`,
    )
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#141414"/>
  <g stroke="#7eb8da" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.95">
    ${boneLines}
  </g>
  <g>${joints}</g>
  <text x="52" y="86" text-anchor="middle" fill="#6b7280" font-size="6.5" font-family="ui-monospace,monospace">pose est.</text>
</svg>`;
}

/**
 * Deterministic analysis preview thumbnails (SAM / alpha / watermark / vectorscope).
 * @param {string} pageUrl
 * @param {number} tSec
 * @param {string} kind
 */
export function buildSceneAnalysisSvg(pageUrl, tSec, kind) {
  let seed = hashSeed(`${pageUrl}\0${Math.floor(tSec)}\0${kind}`);
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  if (kind === "sam") {
    const blobs = [];
    for (let i = 0; i < 7; i++) {
      const cx = 12 + rnd() * 80;
      const cy = 10 + rnd() * 68;
      const rx = 8 + rnd() * 18;
      const ry = 6 + rnd() * 14;
      const hue = Math.floor(rnd() * 300);
      blobs.push(
        `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="hsla(${hue},72%,52%,0.72)" stroke="hsla(${hue},80%,28%,0.9)" stroke-width="1.2"/>`,
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#1a1a1a"/>
  <g opacity="0.35">${blobs.join("\n  ")}</g>
  <rect x="1" y="1" width="102" height="86" fill="none" stroke="#404040" stroke-width="0.5"/>
  <text x="52" y="84" text-anchor="middle" fill="#a3a3a3" font-size="6" font-family="ui-monospace,monospace">SAM mask</text>
</svg>`;
  }

  if (kind === "alpha") {
    const checker = [];
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 13; x++) {
        if ((x + y) % 2 === 0) {
          checker.push(
            `<rect x="${x * 8}" y="${y * 8}" width="8" height="8" fill="#c8c8c8"/>`,
          );
        }
      }
    }
    const alpha = 0.35 + rnd() * 0.45;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <g>${checker.join("\n  ")}</g>
  <ellipse cx="52" cy="42" rx="28" ry="22" fill="rgba(250,250,250,${alpha.toFixed(2)})"/>
  <ellipse cx="52" cy="42" rx="28" ry="22" fill="none" stroke="#525252" stroke-width="1"/>
  <text x="52" y="84" text-anchor="middle" fill="#525252" font-size="6" font-family="ui-monospace,monospace">alpha</text>
</svg>`;
  }

  if (kind === "watermark") {
    const x = 58 + rnd() * 8;
    const y = 52 + rnd() * 8;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#2a2a2a"/>
  <rect x="8" y="12" width="88" height="52" fill="#3f3f46" opacity="0.5"/>
  <g opacity="0.55" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(-12 52 44)">
    <rect x="0" y="0" width="44" height="18" rx="3" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.45)"/>
    <text x="22" y="12" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="7" font-weight="700" font-family="ui-sans-serif,system-ui,sans-serif">WM</text>
  </g>
  <text x="52" y="84" text-anchor="middle" fill="#a3a3a3" font-size="6" font-family="ui-monospace,monospace">watermark</text>
</svg>`;
  }

  if (kind === "vectorscope") {
    const bars = [];
    const colors = ["#ef4444", "#22c55e", "#3b82f6"];
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 10; i++) {
        const h = 4 + rnd() * 20;
        bars.push(
          `<rect x="${58 + c * 14 + i * 1.2}" y="${40 - h}" width="1.1" height="${h}" fill="${colors[c]}" opacity="0.9"/>`,
        );
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#0f0f0f"/>
  ${bars.join("\n  ")}
  <circle cx="26" cy="36" r="20" fill="#141414" stroke="#525252" stroke-width="1"/>
  <circle cx="26" cy="36" r="12" fill="none" stroke="#404040" stroke-width="0.6"/>
  <ellipse cx="26" cy="36" rx="9" ry="5" fill="none" stroke="#eab308" stroke-width="1.2" opacity="0.9"/>
  <line x1="26" y1="16" x2="26" y2="56" stroke="#404040" stroke-width="0.5"/>
  <line x1="6" y1="36" x2="46" y2="36" stroke="#404040" stroke-width="0.5"/>
  <text x="52" y="84" text-anchor="middle" fill="#a3a3a3" font-size="5.5" font-family="ui-monospace,monospace">RGB parade · vectorscope</text>
</svg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#141414"/>
  <text x="52" y="48" text-anchor="middle" fill="#6b7280" font-size="7" font-family="ui-monospace,monospace">analysis</text>
</svg>`;
}

/** @param {object} sc @param {{ text: string }[]} segLines @param {object} data */
function estimateSceneExtras(sc, segLines, data) {
  const programCtx = `${data.title || ""} ${data.description || ""}`.slice(0, 6000);
  const blob = `${sc.title} ${segLines.map((l) => l.text).join(" ")} ${programCtx}`.toLowerCase();
  let shot = "Medium";
  let angle = "Eye-level";
  let movement = "Static";
  let sceneType = "Studio segment";
  let ikPose = "Presenter · seated";

  if (
    /\b(spacex|starbase|starship|falcon|dragon\s*spacecraft)\b/.test(blob) ||
    /\b(launch\s*(pad|site|complex|area)|liftoff|booster|lc-39|kennedy\s*space|cape\s*canaveral)\b/.test(
      blob,
    )
  ) {
    sceneType = "SpaceX Launch area";
    ikPose = /launch|liftoff|pad|booster|rocket/.test(blob)
      ? "Pad / vehicle · exterior"
      : "Mission control · seated";
    if (/wide|establish|aerial|drone|exterior|pad/.test(blob)) shot = "Wide";
    if (/close|tight|engine|plume|flame/.test(blob)) shot = "Close-up";
    if (/aerial|drone|helicopter|tracking/.test(blob)) movement = "Aerial / track";
  }
  if (/wide|establish|exterior|crowd/.test(blob)) shot = "Wide";
  if (/close|tight|face|head\s*shot/.test(blob)) shot = "Close-up";
  if (/graphic|chart|screen|ticker|data|b-roll|broll/.test(blob)) {
    sceneType = "Graphics / B-roll";
    ikPose = "No figure · screen content";
  }
  if (
    /\b(two|2|dual)\s*(host|anchor|presenter)s?\b/.test(blob) ||
    /\bco-?hosts?\b/.test(blob) ||
    /\b(host|anchor)s?\s+(desk|studio|table)\b/.test(blob) ||
    /\bpersonnel\s+behind\b/.test(blob) ||
    /\b(crew|staff|producers?|team)\s+behind\b/.test(blob) ||
    /\bbehind\s+the\s+(desk|anchors?|hosts?)\b/.test(blob) ||
    /\bnews\s+desk\b/.test(blob) ||
    /\bjoining (me|us)|with us (today|now)|both anchors\b/.test(blob)
  ) {
    ikPose = "Two hosts · personnel behind";
    if (sceneType === "Studio segment") {
      shot = /wide|establish/.test(blob) ? "Wide" : "Medium";
    }
  } else if (/interview|guest|panel|conversation/.test(blob)) {
    sceneType = "Interview / dialogue";
    ikPose = "Two-shot · conversational";
  }
  if (/walk|standing|podium|stage/.test(blob)) {
    ikPose = "Standing · gesturing";
    movement = "Slow pan";
  }
  if (/handheld|shaky|field/.test(blob)) {
    movement = "Handheld";
    angle = "Slight dutch";
  }
  if (/low angle|looking up/.test(blob)) angle = "Low";
  if (/high angle|overhead|top down/.test(blob)) angle = "High";

  const w = data.width;
  const h = data.height;
  const lens =
    w && h
      ? `${w}×${h}${data.fps ? ` @ ${Math.round(data.fps)}fps` : ""}`
      : data.format_note || "unknown";

  const cine = estimateCinematography(
    {},
    {
      title: [sc.title, data.title].filter(Boolean).join(" · "),
      lines: segLines,
    },
    {
      width: w,
      height: h,
      fps: data.fps,
      vcodec: data.vcodec,
      programContext: programCtx,
    },
  );

  if (
    ikPose === "Presenter · seated" &&
    (/\b(closing bell|squawk box|fast money|power lunch|worldwide exchange)\b/.test(blob) ||
      /\btwo-shot\b/i.test(cine.framing || ""))
  ) {
    ikPose = "Two hosts · personnel behind";
  }

  const sceneEstimate = (() => {
    if (!cine.locationTag) return sceneType;
    const st = sceneType.toLowerCase();
    const lt = cine.locationTag.toLowerCase();
    if (
      (st.includes("spacex") && lt.includes("spacex")) ||
      (st.includes("wh") && lt.includes("wh"))
    ) {
      return sceneType;
    }
    return `${sceneType} · ${cine.locationTag}`;
  })();

  return {
    cameraEstimate: `${shot} · ${angle} · ${movement} · ${cine.lensMm}`,
    sceneEstimate,
    ikPoseEstimate: ikPose,
    lensHint: lens,
    cinematography: cine,
    geoOverlay: cine.geoHint,
    cameraPoseSource: "heuristic-scatter",
  };
}

/** @param {string} pageUrl @param {object[]} scenes @param {object|null} captions @param {object} data */
function attachSceneEstimates(pageUrl, scenes, captions, data) {
  const lines = Array.isArray(captions?.lines) ? captions.lines : [];
  const duration = Number(data.duration) || null;
  return scenes.map((sc, i) => {
    const end =
      Number(sc.end) > sc.start
        ? Number(sc.end)
        : scenes[i + 1]
          ? Number(scenes[i + 1].start)
          : duration != null
            ? duration
            : sc.start + 90;
    const segLines = lines.filter(
      (row) =>
        Number.isFinite(row.startSec) && row.startSec >= sc.start && row.startSec < end,
    );
    const extras = estimateSceneExtras(sc, segLines, data);
    return {
      ...sc,
      end,
      poseThumb: scenePoseThumbApiUrl(pageUrl, sc.start),
      analysis: {
        sam: sceneAnalysisThumbApiUrl(pageUrl, sc.start, "sam"),
        alpha: sceneAnalysisThumbApiUrl(pageUrl, sc.start, "alpha"),
        watermark: sceneAnalysisThumbApiUrl(pageUrl, sc.start, "watermark"),
        vectorscope: sceneAnalysisThumbApiUrl(pageUrl, sc.start, "vectorscope"),
      },
      ...extras,
    };
  });
}

async function resolveStreamForThumb(pageUrl) {
  const out = await runYtDlpForPage(
    pageUrl,
    ["-f", "b", "-g", "--no-warnings", "--no-playlist"],
    120_000,
  );
  const lines = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http://") || l.startsWith("https://"));
  if (!lines.length) throw new Error("no stream URL for scene thumb");
  return lines[0];
}

/** @param {string} pageUrl @param {number} tSec @param {{ isAborted?: () => boolean }} [opts] */
async function loadSceneRgb(pageUrl, tSec, opts = {}) {
  const key = `${pageUrl}\0${Math.floor(tSec)}`;
  const cached = sceneRgbCache.get(key);
  if (cached && Date.now() - cached.created < INTEL_TTL_MS) return cached.rgb;

  try {
    const jpeg = await captureSceneThumb(pageUrl, tSec, opts);
    const rgb = await decodeJpegToRgb(jpeg);
    if (rgb) sceneRgbCache.set(key, { rgb, created: Date.now() });
    return rgb;
  } catch {
    return null;
  }
}

/** @param {string} pageUrl @param {number} tSec @param {{ isAborted?: () => boolean, live?: boolean }} [opts] */
async function captureSceneThumb(pageUrl, tSec, opts = {}) {
  if (opts.isAborted?.()) throw new Error("client aborted");
  const live = opts.live ?? intelIsLive(pageUrl);
  return runFfmpegQueued(() => captureSceneThumbFfmpeg(pageUrl, tSec, { ...opts, live }));
}

/** @param {string} pageUrl @param {number} tSec @param {{ isAborted?: () => boolean, live?: boolean }} [opts] */
async function captureSceneThumbFfmpeg(pageUrl, tSec, opts = {}) {
  const streamUrl = await resolveStreamForThumb(pageUrl);
  if (opts.isAborted?.()) throw new Error("client aborted");
  const back = opts.live ? liveBackFromT(pageUrl, tSec) : 0;
  const seekFront = opts.live ? [] : ["-ss", String(Math.max(0, tSec))];
  const seekEof = opts.live ? ["-sseof", `-${back}`] : [];
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...seekFront,
        ...seekEof,
        "-i",
        streamUrl,
        "-vframes",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    /** @type {Buffer[]} */
    const chunks = [];
    let err = "";
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("ffmpeg scene thumb timed out")));
    }, 25_000);
    const abortCheck = () => {
      if (opts.isAborted?.()) {
        child.kill("SIGTERM");
        finish(() => reject(new Error("client aborted")));
      }
    };
    const abortIv = setInterval(abortCheck, 200);
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearInterval(abortIv);
      finish(() =>
        reject(e.code === "ENOENT" ? new Error("ffmpeg not found on PATH") : e),
      );
    });
    child.on("close", (code) => {
      clearInterval(abortIv);
      finish(() => {
        if (opts.isAborted?.()) {
          reject(new Error("client aborted"));
          return;
        }
        if (code !== 0) {
          reject(new Error(err.trim() || `ffmpeg exit ${code}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  });
}

function heroThumbFromIntelCache(pageUrl) {
  for (const [key, row] of intelCache.entries()) {
    if (key.startsWith(`${pageUrl}\0`) && row.data?.thumb) return row.data.thumb;
  }
  return null;
}

function intelIsLive(pageUrl) {
  for (const [key, row] of intelCache.entries()) {
    if (key.startsWith(`${pageUrl}\0`) && row.data?.isLive) return true;
  }
  return false;
}

/** Convert a scene start (elapsed seconds since broadcast start) to a "seconds back from current live edge" offset. */
function liveBackFromT(pageUrl, tSec) {
  for (const [key, row] of intelCache.entries()) {
    if (key.startsWith(`${pageUrl}\0`) && row.data?.isLive && row.data?.liveStartedAt) {
      const elapsedNow = (Date.now() - row.data.liveStartedAt) / 1000;
      const back = Math.max(1, Math.round(elapsedNow - tSec));
      return back;
    }
  }
  return 1;
}

function runYtDlp(args, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
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
        reject(new Error((err || out).trim().split(/\r?\n/).slice(-3).join(" ") || `exit ${code}`));
        return;
      }
      resolve(out.trim());
    });
  });
}

/** @param {string} pageUrl @param {string[]} args without URL @param {number} [timeoutMs] */
async function runYtDlpForPage(pageUrl, args, timeoutMs = 90_000) {
  const isYoutube = /youtube\.com|youtu\.be/i.test(pageUrl);
  if (!isYoutube) return runYtDlp([...args, pageUrl], timeoutMs);

  const clients = (process.env.YTDLP_PLAYER_CLIENT || "android,tv_embedded,ios,mweb")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  /** @type {Error | null} */
  let lastErr = null;
  for (const client of clients) {
    try {
      return await runYtDlp(
        [...args, "--extractor-args", `youtube:player_client=${client}`, pageUrl],
        timeoutMs,
      );
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message;
      if (!/bot|sign in|confirm you/i.test(msg)) throw lastErr;
    }
  }
  const cookies = process.env.YTDLP_COOKIES || process.env.YTDLP_COOKIES_FILE;
  if (cookies) {
    return runYtDlp([...args, "--cookies", cookies, pageUrl], timeoutMs);
  }
  throw lastErr || new Error("yt-dlp failed for YouTube URL");
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    lib
      .get(url, { headers: { "User-Agent": "blank-intel/1" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(new URL(res.headers.location, url).href).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

function formatClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** @param {string} t */
export function parseVttClock(t) {
  const m = String(t).trim().match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return NaN;
  const h = Number(m[1] || 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] || "0").padEnd(3, "0").slice(0, 3));
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/** @param {string} vtt */
export function vttToTranscript(vtt) {
  const lines = [];
  const blocks = vtt.split(/\n\n+/);
  for (const block of blocks) {
    const rows = block.trim().split(/\r?\n/).filter(Boolean);
    if (!rows.length) continue;
    let i = 0;
    if (/^\d+$/.test(rows[0])) i = 1;
    const timeRow = rows[i];
    if (!timeRow?.includes("-->")) continue;
    const text = rows.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    const parts = timeRow.split("-->").map((s) => s.trim());
    const start = parts[0];
    const end = parts[1] || start;
    lines.push({
      time: start,
      text,
      startSec: parseVttClock(start),
      endSec: parseVttClock(end),
    });
  }
  return lines;
}

function sceneAudioApiUrl(pageUrl, startSec, durSec) {
  const q = new URLSearchParams({
    url: pageUrl,
    t: String(Math.max(0, Math.floor(startSec))),
    d: String(Math.max(3, Math.min(45, Math.floor(durSec)))),
  });
  return `/api/ingest/scene-audio?${q}`;
}

/** @param {string} pageUrl @param {number} tSec @param {number} durSec */
async function captureSceneAudio(pageUrl, tSec, durSec) {
  const streamUrl = await resolveStreamForThumb(pageUrl);
  const dur = Math.max(3, Math.min(45, durSec));
  const live = intelIsLive(pageUrl);
  const back = live ? liveBackFromT(pageUrl, tSec) : 0;
  const seekArgs = live
    ? ["-sseof", `-${Math.max(back, dur + 1)}`]
    : ["-ss", String(Math.max(0, tSec))];
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...seekArgs,
        "-i",
        streamUrl,
        "-t",
        String(dur),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "wav",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    /** @type {Buffer[]} */
    const chunks = [];
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("ffmpeg scene audio timed out"));
    }, 35_000);
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new Error("ffmpeg not found on PATH") : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim() || `ffmpeg exit ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

function pickThumbUrl(data) {
  const thumbs = data.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length) {
    const best = thumbs.find((t) => t.preference === 0) || thumbs[thumbs.length - 1];
    if (best?.url) return best.url;
  }
  const id = data.id;
  if (id && /youtube|youtu/i.test(data.extractor || data.webpage_url || "")) {
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return null;
}

const NON_VTT_CAPTION_LANGS = new Set(["live_chat", "rechat"]);

function pickSubtitleTrack(data, captionPref = "en-auto") {
  if (captionPref === "none") return null;
  const manual = data.subtitles || {};
  const auto = data.automatic_captions || {};
  const langOrder =
    captionPref === "en"
      ? ["en", "en-US", "en-orig"]
      : captionPref === "all"
        ? [...Object.keys(manual), ...Object.keys(auto)].filter(
            (l) => !NON_VTT_CAPTION_LANGS.has(l),
          )
        : ["en", "en-US", "en-orig"];
  for (const lang of langOrder) {
    if (NON_VTT_CAPTION_LANGS.has(lang)) continue;
    const tracks = manual[lang] || auto[lang];
    if (Array.isArray(tracks) && tracks.length) {
      const vtt = tracks.find((t) => /vtt/i.test(t.ext || t.name || ""));
      const pick = vtt || tracks[0];
      if (pick?.url) return { lang, label: pick.name || lang, url: pick.url, ext: pick.ext || "vtt", auto: !manual[lang] };
    }
  }
  const langs = [...Object.keys(manual), ...Object.keys(auto)].filter(
    (l) => !NON_VTT_CAPTION_LANGS.has(l),
  );
  for (const lang of langs) {
    const tracks = manual[lang] || auto[lang];
    if (Array.isArray(tracks) && tracks[0]?.url) {
      return {
        lang,
        label: tracks[0].name || lang,
        url: tracks[0].url,
        ext: tracks[0].ext || "vtt",
        auto: !manual[lang],
      };
    }
  }
  return null;
}

/** @param {string} pageUrl @param {string} [captionPref] */
export async function fetchVideoIntel(pageUrl, captionPref = "en-auto") {
  const cacheKey = `${pageUrl}\0${captionPref}`;
  const cached = intelCache.get(cacheKey);
  if (cached) {
    const ttl = cached.data?.isLive ? LIVE_INTEL_TTL_MS : INTEL_TTL_MS;
    if (Date.now() - cached.created < ttl) return cached.data;
  }

  const raw = await runYtDlpForPage(pageUrl, ["-J", "--no-warnings", "--no-playlist"]);
  const data = JSON.parse(raw);
  const tiktok = /tiktok\.com/i.test(pageUrl);
  const posterThumb = pickThumbUrl(data);
  const isLive =
    data.is_live === true ||
    data.live_status === "is_live" ||
    data.live_status === "post_live";
  const livePosterThumb = isLive && data.id
    ? `https://i.ytimg.com/vi/${data.id}/hqdefault_live.jpg?_=${Math.floor(Date.now() / 30_000)}`
    : null;
  const sceneThumbFor = (startSec) => {
    if (isLive) return livePosterThumb || posterThumb || sceneThumbApiUrl(pageUrl, startSec);
    return tiktok && posterThumb ? posterThumb : sceneThumbApiUrl(pageUrl, startSec);
  };

  /** @type {{ start: number, end: number, title: string, thumb: string|null }[]} */
  const scenes = [];
  if (isLive) {
    const nowMs = Date.now();
    const startedMs = data.release_timestamp
      ? Number(data.release_timestamp) * 1000
      : nowMs - LIVE_WINDOW_SEC * 1000;
    const elapsedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    const window = Math.min(LIVE_WINDOW_SEC, Math.max(LIVE_STEP_SEC * 4, elapsedSec));
    const steps = Math.max(1, Math.floor(window / LIVE_STEP_SEC));
    for (let i = 0; i < steps; i++) {
      const back = i * LIVE_STEP_SEC;
      const sceneEnd = Math.max(LIVE_STEP_SEC, elapsedSec - back);
      const sceneStart = Math.max(0, sceneEnd - LIVE_STEP_SEC);
      const elapsedLabel = formatClock(sceneEnd);
      const label =
        back === 0
          ? `Live · now (${elapsedLabel})`
          : `Live −${formatClock(back)} · ${elapsedLabel}`;
      scenes.push({
        start: sceneStart,
        end: sceneEnd,
        title: label,
        thumb: sceneThumbFor(sceneStart),
        live: true,
        liveOffsetSec: -back,
        startEpoch: Math.floor(startedMs / 1000) + sceneStart,
        endEpoch: Math.floor(startedMs / 1000) + sceneEnd,
        liveEdge: back === 0,
      });
    }
  } else if (Array.isArray(data.chapters) && data.chapters.length) {
    for (const ch of data.chapters) {
      const start = Number(ch.start_time) || 0;
      const end = Number(ch.end_time) || start;
      scenes.push({
        start,
        end,
        title: String(ch.title || "Chapter").trim(),
        thumb: sceneThumbFor(start),
      });
    }
  }

  if (!scenes.length && !isLive && Number.isFinite(data.duration) && data.duration > 30) {
    const maxSynthetic = 24;
    const step = Math.max(45, Math.floor(data.duration / maxSynthetic));
    for (let t = 0; t < data.duration; t += step) {
      scenes.push({
        start: t,
        end: Math.min(t + step, data.duration),
        title: `Scene ${formatClock(t)}`,
        thumb: sceneThumbFor(t),
      });
    }
  }

  const maxScenes = 48;
  if (scenes.length > maxScenes) scenes.length = maxScenes;

  const sub = pickSubtitleTrack(data);
  let captions = null;
  if (sub?.url) {
    try {
      const vtt = await fetchText(sub.url);
      captions = {
        lang: sub.lang,
        label: sub.label,
        auto: sub.auto,
        vtt,
        lines: vttToTranscript(vtt),
      };
    } catch {
      captions = { lang: sub.lang, label: sub.label, auto: sub.auto, error: "Could not fetch caption file" };
    }
  }

  let enrichedScenes = attachSceneEstimates(pageUrl, scenes, captions, data);
  for (const sc of enrichedScenes) {
    const span = Math.max(8, (sc.end || sc.start + 60) - sc.start);
    sc.waveUrl = sceneAudioApiUrl(pageUrl, sc.start, span);
  }

  const intel = {
    ok: true,
    title: String(data.title || "").trim(),
    description: String(data.description || "").trim(),
    duration: Number(data.duration) || null,
    durationLabel: isLive
      ? "LIVE"
      : Number.isFinite(data.duration)
        ? formatClock(data.duration)
        : null,
    isLive,
    liveStatus: data.live_status || (isLive ? "is_live" : null),
    liveConcurrentViewers: Number(data.concurrent_view_count) || null,
    liveStartedAt: data.release_timestamp
      ? Number(data.release_timestamp) * 1000
      : null,
    liveFetchedAt: isLive ? Date.now() : null,
    uploader: String(data.uploader || data.channel || "").trim(),
    uploadDate: String(data.upload_date || "").trim(),
    viewCount: data.view_count ?? null,
    webpageUrl: String(data.webpage_url || pageUrl).trim(),
    thumb: pickThumbUrl(data),
    camera: {
      width: data.width ?? null,
      height: data.height ?? null,
      fps: data.fps ?? null,
      aspect: data.aspect_ratio ? String(data.aspect_ratio) : null,
      vcodec: data.vcodec ? String(data.vcodec) : null,
      acodec: data.acodec ? String(data.acodec) : null,
    },
    scenes: enrichedScenes,
    captions,
  };

  intelCache.set(cacheKey, { data: intel, created: Date.now() });
  return intel;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export async function handleSceneThumbApi(req, res) {
  let u;
  try {
    u = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    return false;
  }
  if (u.pathname !== "/api/ingest/scene-thumb" || req.method !== "GET") return false;

  const pageUrl = (u.searchParams.get("url") || "").trim();
  const t = Math.max(0, Number(u.searchParams.get("t")) || 0);
  if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
    json(res, 400, { ok: false, error: "need http(s) url" });
    return true;
  }

  const cacheKey = `${pageUrl}\0${t}`;
  const cached = sceneThumbCache.get(cacheKey);
  if (cached && Date.now() - cached.created < INTEL_TTL_MS) {
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": cached.buf.length,
      "Cache-Control": "private, max-age=3600",
    });
    res.end(cached.buf);
    return true;
  }

  let aborted = false;
  onClientGone(req, res, () => {
    aborted = true;
  });
  try {
    const buf = await captureSceneThumb(pageUrl, t, { isAborted: () => aborted });
    if (buf.length > 64) {
      sceneThumbCache.set(cacheKey, { buf, created: Date.now() });
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": buf.length,
        "Cache-Control": "private, max-age=3600",
      });
      res.end(buf);
      return true;
    }
  } catch {
    /* fall through to poster redirect */
  }

  const hero = heroThumbFromIntelCache(pageUrl);
  if (hero) {
    res.writeHead(302, { Location: hero, "Cache-Control": "private, max-age=600" });
    res.end();
    return true;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("scene thumb unavailable");
  return true;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export async function handlePoseThumbApi(req, res) {
  let u;
  try {
    u = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    return false;
  }
  if (u.pathname !== "/api/ingest/pose-thumb" || req.method !== "GET") return false;

  const pageUrl = (u.searchParams.get("url") || "").trim();
  const t = Math.max(0, Number(u.searchParams.get("t")) || 0);
  if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
    json(res, 400, { ok: false, error: "need http(s) url" });
    return true;
  }

  let aborted = false;
  onClientGone(req, res, () => {
    aborted = true;
  });
  let svg = buildPoseEstimateSvg(pageUrl, t);
  try {
    const rgb = await loadSceneRgb(pageUrl, t, { isAborted: () => aborted });
    if (rgb) {
      const { joints, noFigure } = poseJointsFromRgb(rgb);
      if (!noFigure) svg = poseSvgFromJoints(joints, false);
    }
  } catch {
    /* seeded fallback */
  }
  const buf = Buffer.from(svg, "utf8");
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "private, max-age=3600",
  });
  res.end(buf);
  return true;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export async function handleSceneAnalysisThumbApi(req, res) {
  let u;
  try {
    u = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    return false;
  }
  if (u.pathname !== "/api/ingest/scene-analysis-thumb" || req.method !== "GET") return false;

  const pageUrl = (u.searchParams.get("url") || "").trim();
  const t = Math.max(0, Number(u.searchParams.get("t")) || 0);
  const kind = (u.searchParams.get("kind") || "sam").trim().toLowerCase();
  if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
    json(res, 400, { ok: false, error: "need http(s) url" });
    return true;
  }
  if (!(kind in SCENE_ANALYSIS_KINDS)) {
    json(res, 400, { ok: false, error: "kind must be sam, alpha, watermark, or vectorscope" });
    return true;
  }

  let aborted = false;
  onClientGone(req, res, () => {
    aborted = true;
  });
  let svg = buildSceneAnalysisSvg(pageUrl, t, kind);
  try {
    const rgb = await loadSceneRgb(pageUrl, t, { isAborted: () => aborted });
    if (rgb) svg = analysisSvgFromRgb(rgb, kind);
  } catch {
    /* decorative fallback */
  }
  const buf = Buffer.from(svg, "utf8");
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "private, max-age=3600",
  });
  res.end(buf);
  return true;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export async function handleSceneAudioApi(req, res) {
  let u;
  try {
    u = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    return false;
  }
  if (u.pathname !== "/api/ingest/scene-audio" || req.method !== "GET") return false;

  const pageUrl = (u.searchParams.get("url") || "").trim();
  const t = Math.max(0, Number(u.searchParams.get("t")) || 0);
  const d = Math.max(3, Math.min(45, Number(u.searchParams.get("d")) || 20));
  if (!pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
    json(res, 400, { ok: false, error: "need http(s) url" });
    return true;
  }

  const cacheKey = `${pageUrl}\0${t}\0${d}`;
  const cached = sceneAudioCache.get(cacheKey);
  if (cached && Date.now() - cached.created < INTEL_TTL_MS) {
    res.writeHead(200, {
      "Content-Type": "audio/wav",
      "Content-Length": cached.buf.length,
      "Cache-Control": "private, max-age=3600",
    });
    res.end(cached.buf);
    return true;
  }

  try {
    const buf = await runFfmpegQueued(() => captureSceneAudio(pageUrl, t, d));
    if (buf.length > 128) {
      sceneAudioCache.set(cacheKey, { buf, created: Date.now() });
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": buf.length,
        "Cache-Control": "private, max-age=3600",
      });
      res.end(buf);
      return true;
    }
  } catch {
    /* 404 */
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("scene audio unavailable");
  return true;
}

function getGsplatBundle(pageUrl) {
  const row = gsplatCache.get(pageUrl);
  if (!row || Date.now() - row.created > INTEL_TTL_MS) return null;
  return row.bundle;
}

/** @param {Record<string, unknown>} parsed */
function parseGsplatSceneFilter(parsed) {
  /** @type {Record<string, unknown>} */
  const sceneFilter = {};
  if (Array.isArray(parsed.sceneIndices)) {
    sceneFilter.sceneIndices = parsed.sceneIndices
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 0);
  }
  if (Array.isArray(parsed.filterTypes)) {
    sceneFilter.filterTypes = parsed.filterTypes.filter((t) => typeof t === "string" && t);
  } else if (typeof parsed.filterType === "string" && parsed.filterType) {
    sceneFilter.filterTypes = [parsed.filterType];
  }
  if (typeof parsed.captionQuery === "string" && parsed.captionQuery.trim()) {
    sceneFilter.captionQuery = parsed.captionQuery.trim();
  }
  for (const key of ["timeStart", "timeEnd", "maxDurationSec", "minDurationSec"]) {
    const n = Number(parsed[key]);
    if (Number.isFinite(n)) sceneFilter[key] = n;
  }
  return sceneFilter;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res @param {string} urlPath */
export async function handleGsplatApi(req, res, urlPath) {
  let u;
  try {
    u = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    return false;
  }

  const pageUrl = (u.searchParams.get("url") || "").trim();
  const needsUrl =
    urlPath.startsWith("/api/ingest/gsplat/") &&
    urlPath !== "/api/ingest/gsplat/build";

  if (urlPath === "/api/ingest/gsplat/build" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }
    const buildUrl = typeof parsed.url === "string" ? parsed.url.trim() : "";
    if (!buildUrl.startsWith("http://") && !buildUrl.startsWith("https://")) {
      json(res, 400, { ok: false, error: "need http(s) url" });
      return true;
    }
    try {
      const captionPref =
        typeof parsed.captionPref === "string" ? parsed.captionPref : "en-auto";
      const intel = await fetchVideoIntel(buildUrl, captionPref);
      const useFrames = parsed.useFrames !== false;
      const sceneFilter = parseGsplatSceneFilter(parsed);
      const bundle = await buildGsplatBundle({
        pageUrl: buildUrl,
        intel,
        sampleRgb: useFrames ? (url, t) => loadSceneRgb(url, t) : undefined,
        maxScenes: Math.min(24, Math.max(1, Number(parsed.maxScenes) || 14)),
        sceneFilter,
      });
      gsplatCache.set(buildUrl, { bundle, created: Date.now(), sceneFilter });
      json(res, 200, {
        ok: true,
        pointCount: bundle.pointCount,
        cameraCount: bundle.cameraCount,
        meanBaselineM: bundle.meanBaselineM,
        geoSummary: bundle.geoSummary,
        segmentLabel: bundle.segmentLabel,
        includedScenes: bundle.includedScenes,
        metaUrl: `/api/ingest/gsplat/meta?url=${encodeURIComponent(buildUrl)}`,
        plyUrl: `/api/ingest/gsplat/pointcloud.ply?url=${encodeURIComponent(buildUrl)}`,
        transformsUrl: `/api/ingest/gsplat/transforms.json?url=${encodeURIComponent(buildUrl)}`,
        camerasUrl: `/api/ingest/gsplat/cameras.json?url=${encodeURIComponent(buildUrl)}`,
        gsplatCommand: bundle.gsplatCommand,
      });
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (needsUrl && !pageUrl.startsWith("http://") && !pageUrl.startsWith("https://")) {
    json(res, 400, { ok: false, error: "need http(s) url" });
    return true;
  }

  const bundle = needsUrl ? getGsplatBundle(pageUrl) : null;
  if (needsUrl && !bundle) {
    json(res, 404, {
      ok: false,
      error: "no gsplat bundle — POST /api/ingest/gsplat/build first",
    });
    return true;
  }

  if (urlPath === "/api/ingest/gsplat/meta" && req.method === "GET") {
    json(res, 200, {
      ok: true,
      pointCount: bundle.pointCount,
      cameraCount: bundle.cameraCount,
      meanBaselineM: bundle.meanBaselineM,
      geoSummary: bundle.geoSummary,
      segmentLabel: bundle.segmentLabel,
      includedScenes: bundle.includedScenes,
      sceneOrigin: bundle.sceneOrigin,
      plyUrl: `/api/ingest/gsplat/pointcloud.ply?url=${encodeURIComponent(pageUrl)}`,
      transformsUrl: `/api/ingest/gsplat/transforms.json?url=${encodeURIComponent(pageUrl)}`,
    });
    return true;
  }

  if (urlPath === "/api/ingest/gsplat/pointcloud.ply" && req.method === "GET") {
    const body = Buffer.from(bundle.ply, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="blank-scene-${hashSeed(pageUrl) % 100000}.ply"`,
      "Content-Length": body.length,
      "Cache-Control": "private, max-age=3600",
    });
    res.end(body);
    return true;
  }

  if (urlPath === "/api/ingest/gsplat/transforms.json" && req.method === "GET") {
    sendJsonAttachment(res, bundle.transforms, "transforms.json");
    return true;
  }

  if (urlPath === "/api/ingest/gsplat/cameras.json" && req.method === "GET") {
    sendJsonAttachment(res, bundle.cameras, "cameras.json");
    return true;
  }

  return false;
}

/** @param {import("node:http").ServerResponse} res @param {object} obj @param {string} filename */
function sendJsonAttachment(res, obj, filename) {
  const body = Buffer.from(JSON.stringify(obj, null, 2), "utf8");
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": body.length,
    "Cache-Control": "private, max-age=3600",
  });
  res.end(body);
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export async function handleIntelApi(req, res, urlPath) {
  if (urlPath !== "/api/ingest/intel" || req.method !== "POST") return false;

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
    const captionPref =
      typeof parsed.captionPref === "string" ? parsed.captionPref : "en-auto";
    const intel = await fetchVideoIntel(pageUrl, captionPref);
    const gsplat = getGsplatBundle(pageUrl);
    if (gsplat) {
      intel.gsplat = {
        pointCount: gsplat.pointCount,
        cameraCount: gsplat.cameraCount,
        meanBaselineM: gsplat.meanBaselineM,
        geoSummary: gsplat.geoSummary,
        metaUrl: `/api/ingest/gsplat/meta?url=${encodeURIComponent(pageUrl)}`,
        plyUrl: `/api/ingest/gsplat/pointcloud.ply?url=${encodeURIComponent(pageUrl)}`,
        transformsUrl: `/api/ingest/gsplat/transforms.json?url=${encodeURIComponent(pageUrl)}`,
        camerasUrl: `/api/ingest/gsplat/cameras.json?url=${encodeURIComponent(pageUrl)}`,
        gsplatCommand: gsplat.gsplatCommand,
        segmentLabel: gsplat.segmentLabel,
        includedScenes: gsplat.includedScenes,
        cameras: (gsplat.cameras || []).map((c) => ({
          id: c.id,
          t: c.t,
          position: c.position,
          source: c.source,
          fovDeg: c.fovDeg,
        })),
      };
    }
    json(res, 200, intel);
  } catch (e) {
    json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}

function json(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  /** @type {import("node:http").ServerResponse & { __blankOutBytes?: number }} */ (res).__blankOutBytes =
    buf.length;
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buf);
}

export { captureSceneThumb };
