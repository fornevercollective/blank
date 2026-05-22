/**
 * Feed card intel: IA+ (program meta + scene segments) and Implementation (full transcript).
 */

import { escapeHtml } from "./video-ingest.js";
import { qualityPayloadForApi } from "./ingest-settings.js";

/** @param {number} sec */
export function formatIntelClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** @param {number} seconds */
export function seekPreview(seconds) {
  const host = document.getElementById("ffplay-embed");
  if (!host) return;
  const video = host.querySelector("video");
  if (video instanceof HTMLVideoElement) {
    video.currentTime = seconds;
    void video.play().catch(() => {});
    return;
  }
  const frame = host.querySelector("iframe");
  if (frame instanceof HTMLIFrameElement && frame.src.includes("youtube")) {
    try {
      const u = new URL(frame.src);
      u.searchParams.set("start", String(Math.floor(seconds)));
      u.searchParams.set("autoplay", "1");
      frame.src = u.toString();
    } catch {
      /* noop */
    }
  }
}

/** @param {string} t */
function parseVttStart(t) {
  const m = String(t).trim().match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return NaN;
  const h = Number(m[1] || 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] || "0").padEnd(3, "0").slice(0, 3));
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/** @param {object} intel */
export function deriveShowFromIntel(intel) {
  const title = String(intel.title || "").trim();
  const parts = title.split(/\s*\|\s*/);
  if (parts.length >= 2) {
    return {
      show: parts[parts.length - 1].trim(),
      headline: parts.slice(0, -1).join(" | ").trim(),
    };
  }
  const uploader = String(intel.uploader || "").trim();
  if (uploader) return { show: uploader, headline: title };
  return { show: title || "Program", headline: "" };
}

/** @param {object} intel */
function descriptionBreakdownHtml(intel) {
  const raw = String(intel.description || "").trim();
  if (!raw) {
    return '<p class="card-intel-muted">No program description in metadata.</p>';
  }

  const bullets = [];
  const links = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (/^https?:\/\//i.test(line)) {
      links.push(line);
      continue;
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s/.test(line)) continue;
    if (/^00:\d{2}\s/.test(line)) continue;
    bullets.push(line);
  }

  if (!bullets.length && !links.length) {
    return `<div class="card-intel-breakdown"><p>${escapeHtml(raw).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p></div>`;
  }

  let html = '<div class="card-intel-breakdown"><h4 class="card-intel-sub">Program breakdown</h4><ul class="card-intel-breakdown-list">';
  for (const item of bullets.slice(0, 28)) {
    html += `<li>${escapeHtml(item)}</li>`;
  }
  html += "</ul>";
  if (links.length) {
    html += '<h4 class="card-intel-sub">Related links</h4><ul class="card-intel-links">';
    for (const u of links.slice(0, 8)) {
      html += `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a></li>`;
    }
    html += "</ul>";
  }
  html += "</div>";
  return html;
}

/** @param {string} s */
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const POSE_BONES = [
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

/**
 * Map analyzed frame coords (0…1) into SVG viewBox 104×88.
 * @param {Record<string, { x: number, y: number }>} norm
 */
function normJointsToSvg(norm) {
  const map = (x, y) => ({ x: 8 + x * 88, y: 6 + y * 76 });
  /** @type {Record<string, { x: number, y: number }>} */
  const j = {};
  for (const [k, p] of Object.entries(norm)) {
    j[k] = map(p.x, p.y);
  }
  return j;
}

/**
 * Lightweight IK from scene still: edge + mass in center-weighted ROI (desk / two-shot).
 * @param {HTMLImageElement} img
 */
function analyzeFrameForJoints(img) {
  const SW = 96;
  const SH = 72;
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, SW, SH);
  } catch {
    return null;
  }
  const { data } = ctx.getImageData(0, 0, SW, SH);
  const lum = new Float32Array(SW * SH);
  const edge = new Float32Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) {
    const o = i * 4;
    lum[i] = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) / 255;
  }
  for (let y = 1; y < SH - 1; y++) {
    for (let x = 1; x < SW - 1; x++) {
      const i = y * SW + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + SW] - lum[i - SH];
      edge[i] = Math.hypot(gx, gy);
    }
  }
  const rowL = new Int32Array(SH).fill(SW);
  const rowR = new Int32Array(SH).fill(-1);
  const rowMass = new Float32Array(SH);
  let mass = 0;
  let massX = 0;
  let massY = 0;
  let yMin = SH;
  let yMax = 0;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const cxW = 1 - Math.abs(x / SW - 0.5) * 1.85;
      const i = y * SW + x;
      const score = edge[i] * 0.7 + (1 - lum[i]) * 0.3;
      if (score * (0.35 + 0.65 * cxW) < 0.11) continue;
      rowMass[y] += 1;
      rowL[y] = Math.min(rowL[y], x);
      rowR[y] = Math.max(rowR[y], x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      mass += 1;
      massX += x;
      massY += y;
    }
  }
  if (mass < 28 || yMax - yMin < 10) {
    return { noFigure: true, joints: seededJoints(img.src || "frame", 0, "") };
  }

  const height = yMax - yMin;
  let shoulderY = yMin + height * 0.2;
  let maxW = 0;
  for (let y = yMin; y <= yMin + height * 0.42; y++) {
    const w = rowR[y] - rowL[y];
    if (w > maxW) {
      maxW = w;
      shoulderY = y;
    }
  }
  const hipY = yMin + height * 0.58;
  const headY = yMin + height * 0.08;
  const cx = massX / mass;
  const shoulderCx = (rowL[shoulderY] + rowR[shoulderY]) / 2;
  const shoulderHalf = Math.max(4, (rowR[shoulderY] - rowL[shoulderY]) / 2);
  const hipHalf = shoulderHalf * 0.55;
  const ankleY = yMax - 1;
  const kneeY = yMin + height * 0.78;

  const nx = (x) => x / SW;
  const ny = (y) => y / SH;

  const norm = {
    nose: { x: nx(shoulderCx + (cx - shoulderCx) * 0.15), y: ny(headY) },
    lEye: { x: nx(shoulderCx - shoulderHalf * 0.22), y: ny(headY + 1) },
    rEye: { x: nx(shoulderCx + shoulderHalf * 0.22), y: ny(headY + 1) },
    lEar: { x: nx(shoulderCx - shoulderHalf * 0.38), y: ny(headY + 2) },
    rEar: { x: nx(shoulderCx + shoulderHalf * 0.38), y: ny(headY + 2) },
    neck: { x: nx(shoulderCx), y: ny(yMin + height * 0.2) },
    lShoulder: { x: nx(shoulderCx - shoulderHalf), y: ny(shoulderY) },
    rShoulder: { x: nx(shoulderCx + shoulderHalf), y: ny(shoulderY) },
    lElbow: { x: nx(shoulderCx - shoulderHalf * 1.15), y: ny(shoulderY + height * 0.18) },
    rElbow: { x: nx(shoulderCx + shoulderHalf * 1.1), y: ny(shoulderY + height * 0.16) },
    lWrist: { x: nx(rowL[shoulderY] + 2), y: ny(shoulderY + height * 0.32) },
    rWrist: { x: nx(rowR[shoulderY] - 2), y: ny(shoulderY + height * 0.3) },
    midHip: { x: nx(shoulderCx), y: ny(hipY) },
    lHip: { x: nx(shoulderCx - hipHalf), y: ny(hipY) },
    rHip: { x: nx(shoulderCx + hipHalf), y: ny(hipY) },
    lKnee: { x: nx(shoulderCx - hipHalf * 1.05), y: ny(kneeY) },
    rKnee: { x: nx(shoulderCx + hipHalf * 1.02), y: ny(kneeY) },
    lAnkle: { x: nx(shoulderCx - hipHalf * 1.1), y: ny(ankleY) },
    rAnkle: { x: nx(shoulderCx + hipHalf * 1.08), y: ny(ankleY) },
  };

  return { noFigure: false, joints: normJointsToSvg(norm) };
}

/** @param {string} pageUrl @param {number} tSec @param {string} ikHint */
function seededJoints(pageUrl, tSec, ikHint) {
  let seed = hashSeed(`${pageUrl}\0${Math.floor(tSec)}`);
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const seated = /seated|desk|anchor/i.test(ikHint);
  const twoShot = /two-shot|dialogue|conversation/i.test(ikHint);
  const standing = /standing|gestur|walk|podium|stage/i.test(ikHint);
  const cx = 52 + (rnd() - 0.5) * (twoShot ? 14 : 8);
  const lean = (rnd() - 0.5) * (standing ? 0.28 : 0.16);
  const reach = (standing ? 1.05 : seated ? 0.75 : 0.9) + rnd() * 0.25;
  const stance = seated ? 0.75 : 0.9 + rnd() * 0.2;
  const drop = seated ? 6 : 0;

  return normJointsToSvg({
    nose: { x: (cx + lean * 4) / 104, y: (11 + drop) / 88 },
    lEye: { x: (cx - 4 + lean * 3) / 104, y: (10 + drop) / 88 },
    rEye: { x: (cx + 4 + lean * 3) / 104, y: (10 + drop) / 88 },
    lEar: { x: (cx - 7) / 104, y: (12 + drop) / 88 },
    rEar: { x: (cx + 7) / 104, y: (12 + drop) / 88 },
    neck: { x: (cx + lean * 6) / 104, y: (20 + drop) / 88 },
    lShoulder: { x: (cx - 14 - lean * 4) / 104, y: (26 + drop) / 88 },
    rShoulder: { x: (cx + 14 + lean * 4) / 104, y: (26 + drop) / 88 },
    lElbow: { x: (cx - 22 * reach - lean * 8) / 104, y: (38 + drop) / 88 },
    rElbow: { x: (cx + 20 * reach + lean * 6) / 104, y: (36 + drop) / 88 },
    lWrist: { x: (cx - 18 * reach - lean * 12) / 104, y: (50 + drop) / 88 },
    rWrist: { x: (cx + 16 * reach + lean * 10) / 104, y: (48 + drop) / 88 },
    midHip: { x: (cx + lean * 8) / 104, y: (52 + drop) / 88 },
    lHip: { x: (cx - 10) / 104, y: (54 + drop) / 88 },
    rHip: { x: (cx + 10) / 104, y: (54 + drop) / 88 },
    lKnee: { x: (cx - 12 * stance) / 104, y: (68 + drop) / 88 },
    rKnee: { x: (cx + 11 * stance) / 104, y: (67 + drop) / 88 },
    lAnkle: { x: (cx - 14 * stance) / 104, y: (82 + drop) / 88 },
    rAnkle: { x: (cx + 13 * stance) / 104, y: (81 + drop) / 88 },
  });
}

/** @param {Record<string, { x: number, y: number }>} joints @param {boolean} noFigure */
function renderPoseSkeleton(joints, noFigure) {
  if (noFigure) {
    return `<text x="52" y="48" text-anchor="middle" fill="#6b7280" font-size="7" font-family="ui-monospace,monospace">no figure</text>`;
  }
  const boneLines = POSE_BONES.map(([a, b]) => {
    const p = joints[a];
    const q = joints[b];
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>`;
  }).join("");
  const dots = Object.values(joints)
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="#9ed4f0" stroke="#141414" stroke-width="0.6"/>`,
    )
    .join("");
  return `${boneLines}${dots}`;
}

/** @param {HTMLElement} seg @param {string} pageUrl @param {number} startSec */
function mountPoseFromFrame(seg, pageUrl, startSec) {
  const frame = seg.querySelector(".card-scene-frame-img");
  const svg = seg.querySelector(".card-pose-svg");
  const skel = seg.querySelector(".card-pose-skeleton");
  if (!svg || !skel) return;

  const ikHint = seg.dataset.ikEstimate || "";
  const noFigureHint = /no figure|screen content|graphics/i.test(ikHint);

  const apply = (joints, noFigure) => {
    skel.innerHTML = renderPoseSkeleton(joints, noFigure || noFigureHint);
    svg.classList.add("is-loaded");
    svg.classList.toggle("card-pose-svg--empty", noFigure || noFigureHint);
  };

  const fromFrame = () => {
    if (!(frame instanceof HTMLImageElement) || !frame.naturalWidth) return false;
    const parsed = analyzeFrameForJoints(frame);
    if (!parsed) return false;
    apply(parsed.joints, parsed.noFigure);
    return true;
  };

  const fromSeed = () => apply(seededJoints(pageUrl, startSec, ikHint), noFigureHint);

  const run = () => {
    if (!fromFrame()) fromSeed();
  };

  if (frame instanceof HTMLImageElement) {
    frame.addEventListener("load", () => requestAnimationFrame(run));
    frame.addEventListener("error", fromSeed, { once: true });
    if (frame.complete) requestAnimationFrame(run);
  } else {
    fromSeed();
  }
}

/** @param {object[]} scenes @param {object} intel @param {string} [pageUrl] */
function enrichScenes(scenes, intel, pageUrl = "") {
  const duration = Number(intel.duration) || null;
  const capLines = Array.isArray(intel.captions?.lines) ? intel.captions.lines : [];
  const normalized = scenes.map((sc, i) => {
    const start = Number(sc.start) || 0;
    const nextStart = scenes[i + 1] ? Number(scenes[i + 1].start) : null;
    const end =
      Number(sc.end) > start
        ? Number(sc.end)
        : nextStart != null && nextStart > start
          ? nextStart
          : duration != null
            ? duration
            : start + 90;
    return { ...sc, start, end };
  });

  return normalized.map((sc) => {
    const lines = capLines.filter((row) => {
      const t =
        typeof row.startSec === "number" && Number.isFinite(row.startSec)
          ? row.startSec
          : parseVttStart(row.time);
      return Number.isFinite(t) && t >= sc.start && t < sc.end;
    });
    return { ...sc, lines };
  });
}

/** Light-track waveform: white surface, dark or multi-hue ribbon. */
const WAVE_TRACK = "#ffffff";
const WAVE_AXIS = "rgba(23, 23, 23, 0.12)";
const WAVE_STROKE = "#171717";
const WAVE_STROKE_PLACEHOLDER = "#737373";
const WAVE_PLAYHEAD = "#171717";

/** @param {HTMLCanvasElement} canvas */
function waveCanvasMetrics(canvas) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  let cssW = canvas.clientWidth || rect.width || 0;
  if (cssW < 8) {
    const panel = canvas.closest(".card-scene-panel");
    cssW = panel?.clientWidth || canvas.parentElement?.clientWidth || 0;
  }
  if (cssW < 8) cssW = Number(canvas.getAttribute("width")) || 280;
  cssW = Math.max(120, Math.floor(cssW));
  const cssH = 36;
  const w = Math.floor(cssW * dpr);
  const h = Math.floor(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr, cssW };
}

/** @param {number[]} values */
function smoothWaveEnvelope(values) {
  if (values.length < 4) return values;
  const next = values.slice();
  for (let i = 1; i < values.length - 1; i++) {
    next[i] = values[i - 1] * 0.22 + values[i] * 0.56 + values[i + 1] * 0.22;
  }
  return next;
}

/** @param {Float32Array} channel @param {number} pointCount */
function envelopeFromChannel(channel, pointCount) {
  const n = Math.max(32, pointCount);
  const out = [];
  const step = Math.max(1, Math.floor(channel.length / n));
  for (let i = 0; i < n; i++) {
    let peak = 0;
    const i0 = i * step;
    for (let j = i0; j < i0 + step && j < channel.length; j++) {
      const v = Math.abs(channel[j]);
      if (v > peak) peak = v;
    }
    out.push(Math.min(1, peak * 1.15));
  }
  return smoothWaveEnvelope(out);
}

/** @param {number} pointCount */
function placeholderWaveEnvelope(pointCount) {
  const n = Math.max(32, pointCount);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const v =
      0.1 +
      0.32 * Math.abs(Math.sin(t * Math.PI * 5.4 + 0.35)) +
      0.2 * Math.abs(Math.sin(t * Math.PI * 12.1 + 0.9)) +
      0.06 * Math.sin(t * 38);
    out.push(Math.min(0.88, v));
  }
  return smoothWaveEnvelope(out);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} envelope 0…1 amplitudes
 * @param {{ playhead?: number | null, placeholder?: boolean }} [opts]
 */
function drawSceneWave(canvas, envelope, opts = {}) {
  const { playhead = null, placeholder = false } = opts;
  const { w, h, dpr } = waveCanvasMetrics(canvas);
  const g = canvas.getContext("2d");
  if (!g || envelope.length < 2) return;

  g.fillStyle = WAVE_TRACK;
  g.fillRect(0, 0, w, h);

  const mid = h * 0.5;
  const amp = h * 0.42;
  const pad = 2 * dpr;
  const usable = w - pad * 2;
  const pts = envelope.map((v, i) => {
    const t = i / (envelope.length - 1);
    const x = pad + t * usable;
    return { x, yTop: mid - v * amp, yBot: mid + v * amp * 0.52 };
  });

  const fillGrad = g.createLinearGradient(pad, 0, pad + usable, 0);
  if (placeholder) {
    fillGrad.addColorStop(0, "rgba(115, 115, 115, 0.28)");
    fillGrad.addColorStop(0.5, "rgba(163, 163, 163, 0.22)");
    fillGrad.addColorStop(1, "rgba(115, 115, 115, 0.28)");
  } else {
    fillGrad.addColorStop(0, "rgba(37, 99, 235, 0.22)");
    fillGrad.addColorStop(0.35, "rgba(124, 58, 237, 0.18)");
    fillGrad.addColorStop(0.65, "rgba(234, 88, 12, 0.16)");
    fillGrad.addColorStop(1, "rgba(22, 163, 74, 0.2)");
  }
  g.fillStyle = fillGrad;
  g.beginPath();
  g.moveTo(pts[0].x, mid);
  for (const p of pts) g.lineTo(p.x, p.yTop);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i].x, pts[i].yBot);
  g.closePath();
  g.fill();

  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = Math.max(1.1, 0.95 * dpr);
  g.strokeStyle = placeholder ? WAVE_STROKE_PLACEHOLDER : WAVE_STROKE;
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) g.moveTo(p.x, p.yTop);
    else g.lineTo(p.x, p.yTop);
  }
  g.stroke();

  g.strokeStyle = placeholder ? "rgba(115, 115, 115, 0.35)" : "rgba(23, 23, 23, 0.45)";
  g.lineWidth = Math.max(0.8, 0.7 * dpr);
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) g.moveTo(p.x, p.yBot);
    else g.lineTo(p.x, p.yBot);
  }
  g.stroke();

  g.strokeStyle = WAVE_AXIS;
  g.lineWidth = Math.max(0.6, 0.55 * dpr);
  g.beginPath();
  g.moveTo(0, mid);
  g.lineTo(w, mid);
  g.stroke();

  if (playhead != null && Number.isFinite(playhead)) {
    const px = pad + Math.max(0, Math.min(1, playhead)) * usable;
    g.strokeStyle = WAVE_PLAYHEAD;
    g.lineWidth = Math.max(1.4, 1.2 * dpr);
    g.beginPath();
    g.moveTo(px, 2 * dpr);
    g.lineTo(px, h - 2 * dpr);
    g.stroke();
  }
}

/** @param {HTMLCanvasElement} canvas */
function drawPlaceholderWave(canvas) {
  const { w } = waveCanvasMetrics(canvas);
  drawSceneWave(canvas, placeholderWaveEnvelope(Math.floor(w / 3)), { placeholder: true });
}

/** @param {HTMLCanvasElement} canvas @param {Float32Array} channel */
function drawPeaks(canvas, channel) {
  const { w } = waveCanvasMetrics(canvas);
  drawSceneWave(canvas, envelopeFromChannel(channel, Math.floor(w / 3)));
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} pageUrl
 * @param {number} startSec
 * @param {number} durSec
 */
async function mountSceneWaveform(canvas, pageUrl, startSec, durSec) {
  const dur = Math.max(8, Math.min(45, durSec));
  const q = new URLSearchParams({
    url: pageUrl,
    t: String(Math.floor(startSec)),
    d: String(Math.floor(dur)),
  });
  canvas.classList.add("card-scene-wave");
  canvas.setAttribute("role", "slider");
  canvas.setAttribute("aria-label", `Audio waveform ${formatIntelClock(startSec)} – click to scrub`);
  canvas.title = "Click waveform to scrub preview";

  /** @type {number[] | null} */
  let envelope = null;
  let playhead = null;
  let placeholder = true;
  let ro = null;

  const paint = () => {
    const { w } = waveCanvasMetrics(canvas);
    if (w < 4) return;
    const env =
      envelope ?? placeholderWaveEnvelope(Math.max(32, Math.floor(w / 3)));
    drawSceneWave(canvas, env, { playhead, placeholder });
  };

  const scrubAt = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    playhead = frac;
    paint();
    seekPreview(startSec + frac * dur);
    return frac;
  };

  canvas.addEventListener("click", (ev) => scrubAt(ev.clientX));
  canvas.addEventListener("mousemove", (ev) => {
    if (ev.buttons !== 1) return;
    scrubAt(ev.clientX);
  });

  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
  }

  const details = canvas.closest("details");
  details?.addEventListener("toggle", () => {
    if (details.open) requestAnimationFrame(() => paint());
  });

  paint();
  requestAnimationFrame(() => paint());

  try {
    const res = await fetch(`/api/ingest/scene-audio?${q}`);
    if (!res.ok) throw new Error("no audio");
    const buf = await res.arrayBuffer();
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    await ctx.close();
    const { w } = waveCanvasMetrics(canvas);
    envelope = envelopeFromChannel(audio.getChannelData(0), Math.max(32, Math.floor(w / 3)));
    placeholder = false;
    canvas.classList.remove("card-scene-wave--placeholder");
    paint();
  } catch {
    placeholder = true;
    envelope = null;
    canvas.classList.add("card-scene-wave--placeholder");
    paint();
  }
}

/** @param {string} pageUrl @param {object} intel */
function videoPosterFallback(pageUrl, intel) {
  if (intel?.thumb) return String(intel.thumb);
  const m = String(pageUrl).match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  return null;
}

/** @param {HTMLElement} root */
function preloadSceneMedia(root) {
  root.querySelectorAll(".card-scene-frame-img").forEach((el) => {
    if (!(el instanceof HTMLImageElement)) return;
    const mark = () => el.classList.add("is-loaded");
    el.addEventListener("load", mark, { once: true });
    el.addEventListener("error", () => {
      const fb = el.getAttribute("data-fallback");
      if (fb && el.src !== fb) {
        el.src = fb;
        return;
      }
      el.classList.add("is-error");
    });
    if (el.complete && el.naturalWidth > 0) mark();
  });
}

/**
 * @param {object} sc
 * @param {number} i
 * @param {string} capLabel
 * @param {string} capAuto
 * @param {string|null} posterFallback
 */
function sceneCardHtml(sc, i, capLabel, capAuto, posterFallback) {
  const start = sc.start;
  const end = sc.end;
  const dur = end > start ? end - start : 30;
  const sceneNum = String(i + 1).padStart(2, "0");
  const label = String(sc.title || `Scene ${formatIntelClock(start)}`).trim();
  const fb = posterFallback ? escapeHtml(posterFallback) : "";
  const frameSrc = sc.thumb ? escapeHtml(String(sc.thumb)) : fb;
  const frameCors =
    frameSrc && (frameSrc.startsWith("/api/") || frameSrc.includes("/api/ingest/"))
      ? ' crossorigin="anonymous"'
      : "";
  const frameImg = frameSrc
    ? `<img class="card-scene-frame-img" src="${frameSrc}"${fb ? ` data-fallback="${fb}"` : ""}${frameCors} alt="" width="92" height="52" loading="${i < 4 ? "eager" : "lazy"}" decoding="async" />`
    : `<span class="card-thumb card-scene-frame-thumb" aria-hidden="true"></span>`;
  const ikHint = String(sc.ikPoseEstimate || "");
  const estimatesHtml = `<dl class="card-scene-estimates">
    <div><dt>Camera est.</dt><dd>${escapeHtml(sc.cameraEstimate || "—")}</dd></div>
    <div><dt>Scene est.</dt><dd>${escapeHtml(sc.sceneEstimate || "—")}</dd></div>
    <div><dt>IK pose est.</dt><dd>${escapeHtml(sc.ikPoseEstimate || "—")}</dd></div>
    ${sc.lensHint ? `<div><dt>Frame</dt><dd>${escapeHtml(sc.lensHint)}</dd></div>` : ""}
  </dl>`;
  const captionLines = (sc.lines || []).slice(0, 48);
  const captionsBlock = captionLines.length
    ? `<div class="card-scene-captions" role="list">${captionLines
        .map((row) => {
          const seek =
            typeof row.startSec === "number" && Number.isFinite(row.startSec)
              ? row.startSec
              : parseVttStart(row.time);
          const seekAttr = Number.isFinite(seek) ? ` data-seek="${seek}"` : "";
          const seekBtn = Number.isFinite(seek)
            ? `<button type="button" class="card-scene-caption-seek"${seekAttr}><span class="card-scene-caption-text">${escapeHtml(row.text)}</span></button>`
            : `<span class="card-scene-caption-text">${escapeHtml(row.text)}</span>`;
          return `<div class="card-scene-caption-line" role="listitem"${seekAttr ? ` data-seek="${seek}"` : ""}>
            <input type="text" class="card-scene-ai-input" placeholder="AI note…" aria-label="AI note for caption at ${escapeHtml(row.time)}" autocomplete="off" spellcheck="true" />
            ${seekBtn}
            <time class="card-scene-caption-time">${escapeHtml(row.time)}</time>
          </div>`;
        })
        .join("")}</div>`
    : `<p class="card-scene-caption-empty">No captions in this segment.</p>`;
  const poseSvg = `<svg class="card-pose-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88" role="img" aria-label="IK pose estimate from scene frame">
        <rect width="104" height="88" fill="#141414"/>
        <g class="card-pose-skeleton" stroke="#7eb8da" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.95"></g>
      </svg>`;

  return `<details class="card card-scene-card card--visible" role="listitem" data-start="${start}" data-end="${end}" data-ik-estimate="${escapeHtml(ikHint)}"${i === 0 ? " open" : ""}>
    <summary class="card-summary card-scene-summary">
      <span class="sr-only">Toggle scene: ${escapeHtml(label)}</span>
      <figure class="card-scene-media card-scene-media--frame">
        ${frameImg}
        <figcaption class="card-scene-media-cap"><span class="card-scene-media-num">#${sceneNum}</span><time>${escapeHtml(formatIntelClock(start))}</time></figcaption>
      </figure>
      <span class="card-chevron" aria-hidden="true"></span>
      <div class="card-head card-scene-head">
        <h2 class="card-title">${escapeHtml(label)}</h2>
      </div>
      <figure class="card-scene-media card-scene-media--pose" aria-label="IK pose placement estimate">
        ${poseImg}
        <figcaption class="card-scene-media-cap"><span>IK pose</span></figcaption>
      </figure>
      <span class="card-cta">${Math.round(dur)}s</span>
    </summary>
    <div class="card-panel card-scene-panel">
      ${estimatesHtml}
      <p class="card-scene-range">${escapeHtml(formatIntelClock(start))} → ${escapeHtml(formatIntelClock(end))}</p>
      <button type="button" class="card-scene-play" data-seek="${start}">Preview segment</button>
      <canvas class="card-scene-wave" width="280" height="36"></canvas>
      <p class="card-scene-wave-hint">Waveform · click to scrub${capLabel ? ` · ${escapeHtml(capLabel)}${capAuto}` : ""}</p>
      ${captionsBlock}
    </div>
  </details>`;
}

/** @param {HTMLElement} root @param {string} pageUrl */
function bindSceneCards(root, pageUrl) {
  root.querySelectorAll(".card-scene-card").forEach((seg) => {
    if (!(seg instanceof HTMLElement)) return;
    const start = Number(seg.dataset.start);
    const end = Number(seg.dataset.end);
    const dur = end > start ? end - start : 30;

    seg.querySelectorAll(".card-scene-ai-input").forEach((input) => {
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => e.stopPropagation());
    });

    seg.querySelectorAll("[data-seek]").forEach((el) => {
      if (el.classList.contains("card-scene-ai-input")) return;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const sec = Number(el.getAttribute("data-seek"));
        if (Number.isFinite(sec)) seekPreview(sec);
      });
    });

    seg.querySelectorAll(".card-scene-caption-line[data-seek]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target instanceof HTMLInputElement) return;
        const sec = Number(row.getAttribute("data-seek"));
        if (Number.isFinite(sec)) seekPreview(sec);
      });
    });

    const canvas = seg.querySelector("canvas.card-scene-wave");
    if (canvas instanceof HTMLCanvasElement && pageUrl) {
      requestAnimationFrame(() => {
        void mountSceneWaveform(canvas, pageUrl, start, dur);
      });
    }
    mountPoseFromFrame(seg, pageUrl, start);
  });
}

/** @param {string} pageUrl */
export async function requestVideoIntel(pageUrl) {
  const res = await fetch("/api/ingest/intel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: pageUrl, ...qualityPayloadForApi() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `intel failed (${res.status})`);
  }
  return data;
}

const SCENE_REVEAL_MS = 36;

/** @param {HTMLElement} slot @param {'loading'|'error'|'ready'} state @param {string} [message] */
function setSlotState(slot, state, message = "") {
  slot.dataset.state = state;
  if (state === "loading") {
    slot.innerHTML = `<p class="card-intel-status">Pulling metadata, scenes, and thumbnails…</p>`;
    return;
  }
  if (state === "error") {
    slot.innerHTML = `<p class="card-intel-status card-intel-status--err">${escapeHtml(message || "Pull failed")}</p>`;
  }
}

/** @param {HTMLElement} slot @param {object} intel @param {string} pageUrl */
export async function renderIaIntel(slot, intel, pageUrl = "") {
  slot.dataset.pageUrl = pageUrl;
  slot.dataset.state = "ready";
  const { show, headline } = deriveShowFromIntel(intel);
  const cap = intel.captions;
  const capLabel = cap?.label || cap?.lang || "";
  const capAuto = cap?.auto ? " · auto captions" : "";

  const metaRows = [];
  if (headline) metaRows.push(["Segment", headline]);
  if (intel.uploader) metaRows.push(["Channel", intel.uploader]);
  if (intel.durationLabel) metaRows.push(["Duration", intel.durationLabel]);
  if (intel.uploadDate) metaRows.push(["Uploaded", intel.uploadDate]);
  if (intel.viewCount != null) metaRows.push(["Views", String(intel.viewCount)]);
  const cam = intel.camera;
  if (cam && (cam.width || cam.vcodec)) {
    const parts = [];
    if (cam.width && cam.height) parts.push(`${cam.width}×${cam.height}`);
    if (cam.fps) parts.push(`${Math.round(cam.fps)} fps`);
    if (cam.aspect) parts.push(String(cam.aspect));
    if (cam.vcodec) parts.push(String(cam.vcodec).split(".")[0]);
    metaRows.push(["Camera", parts.join(" · ")]);
  }

  const metaHtml = metaRows.length
    ? `<dl class="card-intel-meta">${metaRows
        .map(
          ([k, v]) =>
            `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`,
        )
        .join("")}</dl>`
    : "";

  const scenes = enrichScenes(Array.isArray(intel.scenes) ? intel.scenes : [], intel, pageUrl);
  const posterFallback = videoPosterFallback(pageUrl, intel);
  const programHtml = descriptionBreakdownHtml(intel);

  slot.innerHTML = `
    <header class="card-intel-head">
      <span class="card-intel-cue" aria-hidden="true">&gt;</span>
      <span class="card-intel-show">${escapeHtml(show)}</span>
    </header>
    ${metaHtml}
    <h4 class="card-intel-sub">Program breakdown</h4>
    ${programHtml}
    <h4 class="card-intel-sub">Scene / camera cuts <span class="card-scene-count" data-scene-count></span></h4>
    <div class="card-scene-stack" data-scene-stack role="list"></div>
  `;

  const stack = slot.querySelector("[data-scene-stack]");
  const countEl = slot.querySelector("[data-scene-count]");
  if (!(stack instanceof HTMLElement)) return;

  if (!scenes.length) {
    stack.outerHTML =
      '<p class="card-intel-muted">No scene markers — add a video with chapters or a long runtime.</p>';
    return;
  }

  if (countEl) countEl.textContent = `(${scenes.length})`;
  stack.innerHTML = `<p class="card-intel-status card-scene-loading">Rendering ${scenes.length} scenes…</p>`;

  for (let i = 0; i < scenes.length; i++) {
    if (i === 0) stack.replaceChildren();

    const wrap = document.createElement("div");
    wrap.innerHTML = sceneCardHtml(scenes[i], i, capLabel, capAuto, posterFallback);
    const card = wrap.firstElementChild;
    if (!(card instanceof HTMLElement)) continue;

    stack.appendChild(card);
    requestAnimationFrame(() => card.classList.add("card--visible"));
    bindSceneCards(card, pageUrl);
    preloadSceneMedia(card);

    if (i < scenes.length - 1) {
      await new Promise((r) => window.setTimeout(r, SCENE_REVEAL_MS));
    }
  }
}

/** @param {HTMLElement} thumbEl @param {string|null} thumbUrl */
function paintCardThumb(thumbEl, thumbUrl) {
  if (!(thumbEl instanceof HTMLElement) || !thumbUrl) return;
  thumbEl.classList.add("has-video-thumb");
  thumbEl.style.backgroundImage = `url("${String(thumbUrl).replace(/"/g, "%22")}")`;
  thumbEl.style.backgroundSize = "cover";
  thumbEl.style.backgroundPosition = "center";
}

/** Apply poster + titles across all four feed deliverable cards. */
export function applyIntelToFeedCards(intel) {
  const { show, headline } = deriveShowFromIntel(intel);
  const thumb = intel.thumb ? String(intel.thumb) : null;

  document.querySelectorAll("#feed > details.card").forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    const thumbEl = card.querySelector(".card-summary .card-thumb");
    if (thumbEl) paintCardThumb(thumbEl, thumb);
  });

  const iaCard = document.querySelector('[data-intel-slot="ia"]')?.closest("details.card");
  if (iaCard) {
    const titleEl = iaCard.querySelector(".card-title");
    if (titleEl) {
      const label = headline ? `${show} — ${headline}` : show;
      titleEl.textContent = label.length > 72 ? `${label.slice(0, 69)}…` : label;
    }
    iaCard.setAttribute("open", "");
    iaCard.classList.add("card--visible");
    window.requestAnimationFrame(() => {
      iaCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

/** @param {HTMLElement} slot @param {object} intel */
export function renderUxIntel(slot, intel) {
  const { show, headline } = deriveShowFromIntel(intel);
  const scenes = Array.isArray(intel.scenes) ? intel.scenes : [];
  slot.innerHTML = `
    <header class="card-intel-head">
      <span class="card-intel-cue" aria-hidden="true">&gt;</span>
      <span class="card-intel-show">UX split</span>
    </header>
    <p class="card-intel-track"><strong>${escapeHtml(show)}</strong>${headline ? ` — ${escapeHtml(headline)}` : ""}</p>
    <dl class="card-intel-meta">
      <div><dt>Header strip</dt><dd>Prompt chips <strong>#01–#04</strong> mirror these four cards; pinned snapshot + subject update from this video.</dd></div>
      <div><dt>IA + card</dt><dd>Program breakdown + <strong>${scenes.length}</strong> scene/camera cuts with frame + IK pose previews.</dd></div>
      <div><dt>Implementation</dt><dd>Full captions/transcript; click lines to seek preview.</dd></div>
      <div><dt>Feed below</dt><dd>Collapsible spec text stays under each block — video intel fills the slots above it.</dd></div>
    </dl>
  `;
}

/** @param {HTMLElement} slot @param {object} intel @param {string} pageUrl */
export function renderStaggerIntel(slot, intel, pageUrl = "") {
  const scenes = enrichScenes(Array.isArray(intel.scenes) ? intel.scenes : [], intel, pageUrl);
  const poster = videoPosterFallback(pageUrl, intel);
  const rows = scenes.length
    ? `<ol class="card-stagger-list">${scenes
        .map((sc, i) => {
          const src = sc.thumb || poster || "";
          const thumb = src
            ? `<img class="card-stagger-thumb" src="${escapeHtml(src)}"${poster ? ` data-fallback="${escapeHtml(poster)}"` : ""} alt="" width="64" height="36" loading="${i < 6 ? "eager" : "lazy"}" decoding="async" />`
            : `<span class="card-stagger-thumb-ph" aria-hidden="true"></span>`;
          return `<li class="card-stagger-item">
            ${thumb}
            <span class="card-stagger-meta"><span class="card-stagger-idx">#${String(i + 1).padStart(2, "0")}</span> <time>${escapeHtml(formatIntelClock(sc.start))}</time> — ${escapeHtml(String(sc.title || "Scene"))}</span>
          </li>`;
        })
        .join("")}</ol>`
    : `<p class="card-intel-muted">No scenes to stagger — queue a longer video or one with chapters.</p>`;

  slot.innerHTML = `
    <header class="card-intel-head">
      <span class="card-intel-cue" aria-hidden="true">&gt;</span>
      <span class="card-intel-show">Staggered feed</span>
    </header>
    <p class="card-intel-muted">Scene handoffs load sequentially in <strong>IA +</strong> (${scenes.length} cuts); list mirrors reveal order.</p>
    ${rows}
  `;
  preloadSceneMedia(slot);
}

/** @param {object} intel */
export function renderImplIntel(slot, intel) {
  const cap = intel.captions;
  if (!cap) {
    slot.innerHTML = `
      <header class="card-intel-head"><span class="card-intel-cue" aria-hidden="true">&gt;</span> Implementation</header>
      <p class="card-intel-muted">No captions/subtitles found for this URL.</p>
    `;
    return;
  }
  if (cap.error) {
    slot.innerHTML = `
      <header class="card-intel-head"><span class="card-intel-cue" aria-hidden="true">&gt;</span> Implementation</header>
      <p class="card-intel-status card-intel-status--err">${escapeHtml(cap.error)}</p>
    `;
    return;
  }

  const lines = Array.isArray(cap.lines) ? cap.lines : [];
  const transcriptHtml = lines.length
    ? `<div class="card-transcript" tabindex="0">${lines
        .map((row) => {
          const seek =
            typeof row.startSec === "number" && Number.isFinite(row.startSec)
              ? row.startSec
              : parseVttStart(row.time);
          const seekAttr = Number.isFinite(seek) ? ` data-seek="${seek}"` : "";
          return `<button type="button" class="card-transcript-line"${seekAttr}><time>${escapeHtml(row.time)}</time><span>${escapeHtml(row.text)}</span></button>`;
        })
        .join("")}</div>`
    : `<pre class="card-transcript-raw">${escapeHtml((cap.vtt || "").slice(0, 12000))}</pre>`;

  slot.innerHTML = `
    <header class="card-intel-head"><span class="card-intel-cue" aria-hidden="true">&gt;</span> Implementation</header>
    <p class="card-intel-track"><strong>Captions</strong> ${escapeHtml(cap.label || cap.lang)}${cap.auto ? " · auto" : ""}</p>
    <p class="card-intel-muted">Full transcript below; segment thumbnails and waves live under <strong>${escapeHtml(deriveShowFromIntel(intel).show)}</strong> scenes.</p>
    <h4 class="card-intel-sub">Transcript</h4>
    ${transcriptHtml}
  `;

  slot.querySelectorAll(".card-transcript-line[data-seek]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = Number(btn.getAttribute("data-seek"));
      if (Number.isFinite(sec)) seekPreview(sec);
    });
  });
}

/**
 * @param {string} pageUrl
 * @param {{ iaSlot: HTMLElement|null, implSlot: HTMLElement|null }} slots
 * @param {{ onIntel?: (intel: object) => void }} [hooks]
 */
export async function refreshFeedIntel(pageUrl, slots, hooks = {}) {
  for (const slot of [slots.iaSlot, slots.implSlot, slots.uxSlot, slots.staggerSlot]) {
    if (slot) setSlotState(slot, "loading");
  }
  try {
    const intel = await requestVideoIntel(pageUrl);
    applyIntelToFeedCards(intel);
    hooks.onIntel?.(intel);
    if (slots.iaSlot) await renderIaIntel(slots.iaSlot, intel, pageUrl);
    if (slots.implSlot) renderImplIntel(slots.implSlot, intel);
    if (slots.uxSlot) renderUxIntel(slots.uxSlot, intel);
    if (slots.staggerSlot) renderStaggerIntel(slots.staggerSlot, intel, pageUrl);
    return intel;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const slot of [slots.iaSlot, slots.implSlot, slots.uxSlot, slots.staggerSlot]) {
      if (slot) setSlotState(slot, "error", msg);
    }
    throw e;
  }
}

export function isIaFeedCard(item) {
  return item.id === "core-0" || /IA\s*\+/i.test(item.title || "");
}

export function isImplFeedCard(item) {
  return item.id === "core-1" || /^implementation/i.test(item.title || "");
}

export function isUxFeedCard(item) {
  return item.id === "core-2" || /ux split/i.test(item.title || "");
}

export function isStaggerFeedCard(item) {
  return item.id === "core-3" || /staggered feed/i.test(item.title || "");
}

/** @param {{ id?: string, title?: string }} item */
export function feedIntelSlotKind(item) {
  if (isIaFeedCard(item)) return "ia";
  if (isImplFeedCard(item)) return "impl";
  if (isUxFeedCard(item)) return "ux";
  if (isStaggerFeedCard(item)) return "stagger";
  return null;
}
