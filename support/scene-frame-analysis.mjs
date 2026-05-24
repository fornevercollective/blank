/**
 * Frame-derived scene analysis SVGs (SAM / alpha / watermark / vectorscope / pose).
 * Uses ffmpeg to decode JPEG → small RGB buffer; no extra npm deps.
 */
import { spawn } from "node:child_process";

const W = 104;
const H = 58;

/**
 * @param {Buffer} jpegBuf
 * @returns {Promise<Uint8Array|null>} rgb24 W×H
 */
export async function decodeJpegToRgb(jpegBuf) {
  if (!jpegBuf?.length) return null;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vframes",
        "1",
        "-vf",
        `scale=${W}:${H}`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    /** @type {Buffer[]} */
    const chunks = [];
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("ffmpeg rgb decode timed out"));
    }, 12_000);
    child.stdin.write(jpegBuf);
    child.stdin.end();
    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.trim() || `ffmpeg rgb exit ${code}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < W * H * 3) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(buf.subarray(0, W * H * 3)));
    });
  });
}

/**
 * @param {Uint8Array} rgb
 * @returns {{ lum: Float32Array, edge: Float32Array, rHist: number[], gHist: number[], bHist: number[] }}
 */
function frameStats(rgb) {
  const n = W * H;
  const lum = new Float32Array(n);
  const edge = new Float32Array(n);
  const rHist = new Array(16).fill(0);
  const gHist = new Array(16).fill(0);
  const bHist = new Array(16).fill(0);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const r = rgb[o];
    const g = rgb[o + 1];
    const b = rgb[o + 2];
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    rHist[Math.min(15, (r * 16) >> 8)]++;
    gHist[Math.min(15, (g * 16) >> 8)]++;
    bHist[Math.min(15, (b * 16) >> 8)]++;
  }
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      edge[i] = Math.hypot(lum[i + 1] - lum[i - 1], lum[i + W] - lum[i - W]);
    }
  }
  return { lum, edge, rHist, gHist, bHist };
}

/** @param {number} x @param {number} y */
function px(rgb, x, y) {
  const i = (y * W + x) * 3;
  return [rgb[i], rgb[i + 1], rgb[i + 2]];
}

/**
 * @param {Uint8Array} rgb
 * @param {string} kind
 */
export function analysisSvgFromRgb(rgb, kind) {
  const { lum, edge, rHist, gHist, bHist } = frameStats(rgb);
  const bg = "#0f0f0f";

  if (kind === "sam") {
    const blobs = [];
    const thresh = 0.14;
    for (let y = 1; y < H - 2; y++) {
      for (let x = 1; x < W - 2; x++) {
        const i = y * W + x;
        if (edge[i] < thresh) continue;
        const hue = Math.floor(((x / W) * 0.6 + (y / H) * 0.4) * 300);
        blobs.push(
          `<rect x="${x}" y="${y}" width="2" height="2" fill="hsla(${hue},75%,55%,0.85)"/>`,
        );
      }
    }
    const sample = blobs.length > 800 ? blobs.filter((_, i) => i % 3 === 0) : blobs;
    return svgWrap(sample.join("\n"), "SAM · edges", bg);
  }

  if (kind === "alpha") {
    let rects = "";
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = 1 - lum[y * W + x];
        if (a < 0.12) continue;
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgba(255,255,255,${(a * 0.92).toFixed(2)})"/>`;
      }
    }
    return svgWrap(rects, "alpha", "#1a1a1a", true);
  }

  if (kind === "watermark") {
    const corners = [
      [0, 0, 28, 16],
      [W - 28, 0, W, 16],
      [0, H - 14, 32, H],
      [W - 32, H - 14, W, H],
    ];
    let marks = "";
    for (const [x0, y0, x1, y1] of corners) {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += lum[y * W + x];
          n++;
        }
      }
      const avg = sum / Math.max(1, n);
      if (avg > 0.72 || avg < 0.22) {
        marks += `<rect x="${x0 + 2}" y="${y0 + 2}" width="${x1 - x0 - 4}" height="${y1 - y0 - 4}" fill="none" stroke="#fbbf24" stroke-width="1" opacity="0.9"/>`;
      }
    }
    const [r, g, b] = px(rgb, W >> 1, H >> 1);
    const band = `<rect x="8" y="12" width="88" height="34" fill="rgb(${r},${g},${b})" opacity="0.35"/>`;
    return svgWrap(`${band}${marks}`, "watermark", bg);
  }

  if (kind === "vectorscope") {
    const bars = (hist, color, ox) => {
      let s = "";
      const max = Math.max(1, ...hist);
      for (let i = 0; i < 16; i++) {
        const bh = Math.round((hist[i] / max) * 22);
        s += `<rect x="${ox + i * 1.4}" y="${40 - bh}" width="1.2" height="${bh}" fill="${color}"/>`;
      }
      return s;
    };
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3;
        const r = rgb[o] / 255;
        const g = rgb[o + 1] / 255;
        const b = rgb[o + 2] / 255;
        cx += (r - g) * 0.5 + 0.5;
        cy += (r + g) / 2 - b;
        n++;
      }
    }
    cx = 26 + (cx / n) * 18;
    cy = 36 + (cy / n) * 14;
    return svgWrap(
      `${bars(rHist, "#ef4444", 58)}${bars(gHist, "#22c55e", 58 + 22)}${bars(bHist, "#3b82f6", 58 + 44)}
      <circle cx="26" cy="36" r="20" fill="#141414" stroke="#525252"/>
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="#eab308"/>`,
      "RGB · scope",
      bg,
    );
  }

  return svgWrap("", kind, bg);
}

/**
 * @param {Uint8Array} rgb
 * @returns {{ joints: Record<string, {x:number,y:number}>, noFigure: boolean }}
 */
export function poseJointsFromRgb(rgb) {
  const { lum, edge } = frameStats(rgb);
  const SW = W;
  const SH = H;
  const rowL = new Int32Array(SH).fill(SW);
  const rowR = new Int32Array(SH).fill(-1);
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
      rowL[y] = Math.min(rowL[y], x);
      rowR[y] = Math.max(rowR[y], x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      mass++;
      massX += x;
      massY += y;
    }
  }
  if (mass < 20 || yMax - yMin < 8) {
    return { noFigure: true, joints: {} };
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
  const shoulderCx = (rowL[shoulderY] + rowR[shoulderY]) / 2;
  const shoulderHalf = Math.max(3, (rowR[shoulderY] - rowL[shoulderY]) / 2);
  const nx = (x) => (x / SW) * 104;
  const ny = (y) => (y / SH) * 88;
  const joints = {
    nose: { x: nx(shoulderCx), y: ny(yMin + height * 0.08) },
    lShoulder: { x: nx(shoulderCx - shoulderHalf), y: ny(shoulderY) },
    rShoulder: { x: nx(shoulderCx + shoulderHalf), y: ny(shoulderY) },
    neck: { x: nx(shoulderCx), y: ny(yMin + height * 0.2) },
    lElbow: { x: nx(shoulderCx - shoulderHalf * 1.1), y: ny(shoulderY + height * 0.18) },
    rElbow: { x: nx(shoulderCx + shoulderHalf * 1.05), y: ny(shoulderY + height * 0.16) },
    lHip: { x: nx(shoulderCx - shoulderHalf * 0.55), y: ny(yMin + height * 0.58) },
    rHip: { x: nx(shoulderCx + shoulderHalf * 0.55), y: ny(yMin + height * 0.58) },
    lWrist: { x: nx(rowL[shoulderY] + 2), y: ny(shoulderY + height * 0.32) },
    rWrist: { x: nx(rowR[shoulderY] - 2), y: ny(shoulderY + height * 0.3) },
    lKnee: { x: nx(shoulderCx - shoulderHalf * 0.5), y: ny(yMin + height * 0.78) },
    rKnee: { x: nx(shoulderCx + shoulderHalf * 0.5), y: ny(yMin + height * 0.78) },
    lAnkle: { x: nx(rowL[yMax] + 1), y: ny(yMax - 1) },
    rAnkle: { x: nx(rowR[yMax] - 1), y: ny(yMax - 1) },
  };
  return { noFigure: false, joints };
}

const POSE_BONES = [
  ["nose", "neck"],
  ["neck", "lShoulder"],
  ["neck", "rShoulder"],
  ["lShoulder", "lElbow"],
  ["rShoulder", "rElbow"],
  ["lElbow", "lWrist"],
  ["rElbow", "rWrist"],
  ["lShoulder", "lHip"],
  ["rShoulder", "rHip"],
  ["lHip", "rHip"],
  ["lHip", "lKnee"],
  ["rHip", "rKnee"],
  ["lKnee", "lAnkle"],
  ["rKnee", "rAnkle"],
];

/** @param {Record<string, {x:number,y:number}>} joints @param {boolean} noFigure */
export function poseSvgFromJoints(joints, noFigure) {
  if (noFigure || !joints.nose) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#141414"/>
  <text x="52" y="48" text-anchor="middle" fill="#6b7280" font-size="7" font-family="ui-monospace,monospace">no figure</text>
</svg>`;
  }
  const lines = POSE_BONES.map(([a, b]) => {
    const p = joints[a];
    const q = joints[b];
    if (!p || !q) return "";
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>`;
  }).join("\n");
  const dots = Object.values(joints)
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.4" fill="#9ed4f0" stroke="#141414" stroke-width="0.6"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 88" width="104" height="88">
  <rect width="104" height="88" fill="#141414"/>
  <g stroke="#7eb8da" stroke-width="2" stroke-linecap="round" fill="none">${lines}</g>
  <g>${dots}</g>
</svg>`;
}

/**
 * @param {string} inner
 * @param {string} label
 * @param {string} bg
 * @param {boolean} [checker]
 */
function svgWrap(inner, label, bg, checker = false) {
  const checkerBg = checker
    ? `<defs><pattern id="ck" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#c8c8c8"/><rect x="4" y="4" width="4" height="4" fill="#c8c8c8"/></pattern></defs><rect width="104" height="58" fill="url(#ck)"/>`
    : `<rect width="104" height="58" fill="${bg}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 58" width="104" height="58">
  ${checkerBg}
  <g>${inner}</g>
  <text x="52" y="56" text-anchor="middle" fill="#a3a3a3" font-size="5.5" font-family="ui-monospace,monospace">${label}</text>
</svg>`;
}
