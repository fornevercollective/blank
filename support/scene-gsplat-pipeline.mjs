/**
 * Sparse point cloud + camera poses for gsplat / nerfstudio from scattered scene cuts.
 * Uses lawn ground-plane + facade priors (WH coverage) and optional per-frame RGB edges.
 */
import { estimateCinematography } from "./scene-cinematography.mjs";
import { filterScenesForGsplat, sceneGsplatTagLabels } from "./scene-gsplat-filters.js";

/** @typedef {{ x: number, y: number, z: number, r: number, g: number, b: number }} Point3 */
/** @typedef {{ id: string, t: number, position: [number, number, number], rotation: [number, number, number, number], fovDeg: number, width: number, height: number, imageName: string, source: string }} CameraPose */

/** White House south lawn — local ENU meters (approx.) */
export const WH_SCENE_ORIGIN = {
  label: "White House · South Lawn anchor",
  lat: 38.8977,
  lon: -77.0365,
};

const DEG = Math.PI / 180;

/**
 * @param {object} scene
 * @param {object} [cine]
 */
function sceneTextBlob(scene, cine) {
  return [
    scene.title || "",
    ...(scene.lines || []).map((l) => l.text || ""),
    cine?.locationTag || "",
    cine?.framing || "",
  ].join(" ");
}

/**
 * @param {object} scene
 * @param {object} [cine]
 * @param {number} index
 * @param {number} total
 */
export function estimateSceneCameraPose(scene, index, total, cine, meta = {}) {
  const blob = sceneTextBlob(scene, cine).toLowerCase();
  const w = meta.width || 1920;
  const h = meta.height || 1080;
  const ar = w / h;
  const fovDeg = (2 * Math.atan((17.5 * ar) / 24)) * (180 / Math.PI);

  let azimuthDeg = (index / Math.max(1, total)) * 300 - 150;
  if (/\bnorth lawn|north portico|north side\b/.test(blob)) azimuthDeg = 0;
  if (/\bsouth lawn|rose garden|ellipse|south portico\b/.test(blob)) azimuthDeg = 180;
  if (/\beast wing|east\b/.test(blob)) azimuthDeg = 90;
  if (/\bwest wing|west\b/.test(blob)) azimuthDeg = -90;
  if (/\baerial|drone|helicopter|overhead\b/.test(blob)) {
    return aerialCameraPose(index, total, fovDeg, w, h, azimuthDeg);
  }

  let radius = /\bwide|establish|crowd\b/.test(blob) ? 72 : /\bclose|tight|cu\b/.test(blob) ? 28 : 48;
  let height = /\blow angle|looking up\b/.test(blob) ? 1.4 : 1.75;
  if (/\bhigh angle|overhead\b/.test(blob)) {
    height = 6;
    radius *= 0.85;
  }

  const az = azimuthDeg * DEG;
  const cx = Math.sin(az) * radius;
  const cy = -Math.cos(az) * radius;
  const cz = height;
  const tx = 0;
  const ty = 0;
  const tz = /\bportico|facade|north portico\b/.test(blob) ? 6 : 1.2;

  const forward = normalize([tx - cx, ty - cy, tz - cz]);
  const worldUp = [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));
  const rot = quatFromBasis(right, up, forward);

  return {
    id: `cam-${String(index + 1).padStart(3, "0")}`,
    t: Number(scene.start) || 0,
    position: [cx, cy, cz],
    rotation: rot,
    fovDeg,
    width: w,
    height: h,
    imageName: `frames/${String(index + 1).padStart(5, "0")}.jpg`,
    source: "scatter-triangulation",
  };
}

/**
 * @param {number} index
 * @param {number} total
 * @param {number} fovDeg
 * @param {number} w
 * @param {number} h
 * @param {number} azimuthDeg
 */
function aerialCameraPose(index, total, fovDeg, w, h, azimuthDeg) {
  const az = (azimuthDeg + index * 17) * DEG;
  const r = 55 + (index % 5) * 8;
  const cx = Math.sin(az) * r;
  const cy = -Math.cos(az) * r;
  const cz = 42 + (index % 3) * 6;
  const forward = normalize([0 - cx, 0 - cy, 0 - cz]);
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = normalize(cross(right, forward));
  return {
    id: `cam-${String(index + 1).padStart(3, "0")}`,
    t: 0,
    position: [cx, cy, cz],
    rotation: quatFromBasis(right, up, forward),
    fovDeg: Math.min(95, fovDeg + 12),
    width: w,
    height: h,
    imageName: `frames/${String(index + 1).padStart(5, "0")}.jpg`,
    source: "aerial-scatter",
  };
}

/** @param {number[]} a */
function normalize(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** @param {number[]} a @param {number[]} b */
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * @param {number[]} right
 * @param {number[]} up
 * @param {number[]} forward
 * @returns {[number, number, number, number]}
 */
function quatFromBasis(right, up, forward) {
  const m00 = right[0];
  const m01 = up[0];
  const m02 = forward[0];
  const m10 = right[1];
  const m11 = up[1];
  const m12 = forward[1];
  const m20 = right[2];
  const m21 = up[2];
  const m22 = forward[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/** @param {[number, number, number, number]} q */
function quatToMatrix3(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

/** WH lawn ellipse + north portico facade samples */
export function buildScenePriorPointCloud() {
  /** @type {Point3[]} */
  const points = [];
  for (let a = 0; a < 360; a += 8) {
    const rad = a * DEG;
    const rx = 38 * Math.cos(rad);
    const ry = 22 * Math.sin(rad);
    points.push({ x: rx, y: ry, z: 0, r: 72, g: 110, b: 72 });
  }
  for (let y = -8; y <= 18; y += 2) {
    for (let z = 0; z <= 14; z += 2) {
      points.push({ x: 0, y, z, r: 210, g: 205, b: 195 });
    }
  }
  return points;
}

/**
 * @param {Uint8Array} rgb
 * @param {CameraPose} cam
 * @param {number} sw
 * @param {number} sh
 * @param {number} maxPts
 */
export function pointsFromFrameRgb(rgb, cam, sw = 104, sh = 58, maxPts = 1200) {
  /** @type {Point3[]} */
  const out = [];
  const fov = cam.fovDeg * DEG;
  const aspect = sw / sh;
  const fx = 0.5 / Math.tan(fov / 2);
  const fy = fx / aspect;
  const R = quatToMatrix3(cam.rotation);
  const pos = cam.position;

  const lum = new Float32Array(sw * sh);
  const edge = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const o = i * 3;
    lum[i] = (0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]) / 255;
  }
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      edge[i] = Math.hypot(lum[i + 1] - lum[i - 1], lum[i + sw] - lum[i - sw]);
    }
  }

  const step = Math.max(1, Math.floor((sw * sh) / maxPts));
  let idx = 0;
  for (let y = 2; y < sh - 2; y += 2) {
    for (let x = 2; x < sw - 2; x += 2) {
      idx++;
      if (idx % step !== 0) continue;
      const i = y * sw + x;
      if (edge[i] < 0.12) continue;
      const u = (x / sw - 0.5) * 2;
      const v = (0.5 - y / sh) * 2;
      const depth = groundDepthForPixel(y / sh, cam);
      const dirCam = normalize([u / fx, v / fy, 1]);
      const wx =
        R[0] * dirCam[0] + R[1] * dirCam[1] + R[2] * dirCam[2];
      const wy =
        R[3] * dirCam[0] + R[4] * dirCam[1] + R[5] * dirCam[2];
      const wz =
        R[6] * dirCam[0] + R[7] * dirCam[1] + R[8] * dirCam[2];
      const scale = depth / (wz || 0.001);
      const px = pos[0] + wx * scale;
      const py = pos[1] + wy * scale;
      const pz = pos[2] + wz * scale;
      const o = i * 3;
      out.push({
        x: px,
        y: py,
        z: Math.max(0, pz),
        r: rgb[o],
        g: rgb[o + 1],
        b: rgb[o + 2],
      });
      if (out.length >= maxPts) return out;
    }
  }
  return out;
}

/**
 * @param {number} v
 * @param {CameraPose} cam
 */
function groundDepthForPixel(v, cam) {
  const h = cam.position[2];
  if (/\baerial|drone\b/i.test(cam.source)) {
    return Math.max(8, h * (1.1 - v * 0.35));
  }
  const rayElev = 0.55 + (1 - v) * 0.45;
  return Math.max(3, h / Math.max(0.15, rayElev));
}

/**
 * @param {Point3[]} points
 */
export function encodePlyAscii(points) {
  const header = `ply
format ascii 1.0
element vertex ${points.length}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
`;
  const body = points
    .map((p) => `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} ${p.r} ${p.g} ${p.b}`)
    .join("\n");
  return `${header}${body}\n`;
}

/**
 * @param {CameraPose[]} cameras
 */
export function cameraToC2W(cam) {
  const R = quatToMatrix3(cam.rotation);
  const t = cam.position;
  return [
    [R[0], R[1], R[2], t[0]],
    [R[3], R[4], R[5], t[1]],
    [R[6], R[7], R[8], t[2]],
    [0, 0, 0, 1],
  ];
}

/**
 * @param {CameraPose[]} cameras
 * @param {{ sceneOrigin?: typeof WH_SCENE_ORIGIN }} [opts]
 */
export function nerfstudioTransformsJson(cameras, opts = {}) {
  const frames = cameras.map((cam) => ({
    file_path: cam.imageName,
    transform_matrix: cameraToC2W(cam),
    time: cam.t,
    camera_id: cam.id,
    fov_deg: cam.fovDeg,
    source: cam.source,
  }));
  return {
    share_global_metric: true,
    scene_origin: opts.sceneOrigin || WH_SCENE_ORIGIN,
    coordinate_system: "local-enu-meters",
    note: "Sparse scatter reconstruction — export scene JPEGs to frames/ then train gsplat",
    frames,
  };
}

/**
 * @param {string} outDir
 * @param {number} pointCount
 * @param {number} cameraCount
 */
export function gsplatTrainHint(outDir, pointCount, cameraCount) {
  return [
    `# blank export (${pointCount} sparse pts, ${cameraCount} cameras) — train then SuperSplat`,
    `# Kit on disk: node support/scripts/gsplat-export-kit.mjs "<url>" --out ${outDir}`,
    `cd ${outDir}`,
    `# 1) Train — turns frames/ + transforms.json into a real Gaussian splat`,
    `ns-train splatfacto --data .`,
    `#    or: gsplat train --data . --output-dir ./splat-out`,
    `# 2) SuperSplat — open TRAINED point_cloud.ply (not pointcloud.ply from blank)`,
    `#    https://supersplat.at/editor  ·  https://github.com/playcanvas/supersplat`,
    `# 3) Export .sog / .compressed.ply from SuperSplat for web (optional)`,
  ].join("\n");
}

/**
 * @param {object} opts
 * @param {string} opts.pageUrl
 * @param {object} opts.intel
 * @param {(pageUrl: string, t: number) => Promise<Uint8Array|null>} [opts.sampleRgb]
 * @param {number} [opts.maxScenes]
 */
export async function buildGsplatBundle(opts) {
  const { pageUrl, intel, sampleRgb, maxScenes = 14, sceneFilter = {} } = opts;
  const meta = {
    width: intel.camera?.width || 1920,
    height: intel.camera?.height || 1080,
    fps: intel.camera?.fps,
    vcodec: intel.camera?.vcodec,
  };

  const allScenes = (Array.isArray(intel.scenes) ? intel.scenes : []).map((sc) => ({
    ...sc,
    cinematography:
      sc.cinematography && typeof sc.cinematography === "object"
        ? sc.cinematography
        : estimateCinematography({}, sc, meta),
  }));

  const filtered = filterScenesForGsplat(allScenes, sceneFilter, meta);
  const cap = Math.max(1, Math.min(24, Number(maxScenes) || 14));
  const selected = filtered.slice(0, cap);
  const total = selected.length;

  if (!total) {
    throw new Error("no scenes match filter — adjust selection or type filters");
  }

  /** @type {CameraPose[]} */
  const cameras = [];
  /** @type {Point3[]} */
  let points = buildScenePriorPointCloud();
  /** @type {{ index: number, start: number, title: string, tags: string[] }[]} */
  const includedScenes = [];

  for (let i = 0; i < total; i++) {
    const sc = selected[i];
    const cine = sc.cinematography || estimateCinematography({}, sc, meta);
    const cam = estimateSceneCameraPose(sc, i, total, cine, meta);
    cameras.push({
      ...cam,
      t: Number(sc.start) || cam.t,
      imageName: `frames/${String(i + 1).padStart(5, "0")}.jpg`,
    });
    includedScenes.push({
      index: sc.index ?? i,
      start: Number(sc.start) || 0,
      title: String(sc.title || `Scene ${formatClock(sc.start)}`),
      tags: sceneGsplatTagLabels(sc, meta),
    });

    if (sampleRgb) {
      try {
        const rgb = await sampleRgb(pageUrl, Number(sc.start) || 0);
        if (rgb) {
          const framePts = pointsFromFrameRgb(rgb, cam, 104, 58, 900);
          points = points.concat(framePts);
        }
      } catch {
        /* skip frame */
      }
    }
  }

  points = voxelDownsample(points, 0.35, 120_000);
  const transforms = nerfstudioTransformsJson(cameras);
  const ply = encodePlyAscii(points);
  const baselineM = meanCameraBaseline(cameras);

  const typeLabel =
    Array.isArray(sceneFilter.filterTypes) && sceneFilter.filterTypes.length
      ? sceneFilter.filterTypes.join("+")
      : sceneFilter.sceneIndices?.length
        ? "picked"
        : "auto";

  const segmentLabel = `${total}/${allScenes.length} scenes · ${typeLabel}`;

  return {
    ok: true,
    pageUrl,
    pointCount: points.length,
    cameraCount: cameras.length,
    meanBaselineM: baselineM,
    sceneOrigin: WH_SCENE_ORIGIN,
    cameras,
    transforms,
    ply,
    includedScenes,
    segmentLabel,
    gsplatCommand: gsplatTrainHint("./gsplat-export", points.length, cameras.length),
    geoSummary: `${segmentLabel} · ${points.length} pts · ${cameras.length} cams · baseline ~${baselineM.toFixed(1)}m · gsplat-ready`,
  };
}

/** @param {number} sec */
function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * @param {Point3[]} points
 * @param {number} voxel
 * @param {number} max
 */
function voxelDownsample(points, voxel, max) {
  const map = new Map();
  for (const p of points) {
    const key = `${Math.floor(p.x / voxel)},${Math.floor(p.y / voxel)},${Math.floor(p.z / voxel)}`;
    if (!map.has(key)) map.set(key, p);
  }
  const out = [...map.values()];
  return out.length > max ? out.filter((_, i) => i % Math.ceil(out.length / max) === 0) : out;
}

/** @param {CameraPose[]} cameras */
function meanCameraBaseline(cameras) {
  if (cameras.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < cameras.length; i++) {
    for (let j = i + 1; j < cameras.length; j++) {
      const a = cameras[i].position;
      const b = cameras[j].position;
      sum += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}
