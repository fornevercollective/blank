/**
 * Browser-safe scene analysis thumb API URLs (shared with Node ingest).
 * @param {string} pageUrl
 * @param {number} startSec
 * @param {string} kind
 */
export function sceneAnalysisThumbApiUrl(pageUrl, startSec, kind) {
  const q = new URLSearchParams({
    url: pageUrl,
    t: String(Math.max(0, Math.floor(startSec))),
    kind,
  });
  return `/api/ingest/scene-analysis-thumb?${q}`;
}

/** @type {Record<string, string>} */
export const SCENE_ANALYSIS_KINDS = {
  sam: "SegmentAnything",
  alpha: "Alpha Channels",
  watermark: "Watermark",
  vectorscope: "RGB Parade · Vectorscope",
};

/** Header preview view modes (maps UI id → API kind). */
export const PREVIEW_VIEW_MODES = {
  video: { label: "Video", analysis: false },
  sam: { label: "SAM", kind: "sam" },
  alpha: { label: "Alpha", kind: "alpha" },
  wm: { label: "WM", kind: "watermark" },
  scopes: { label: "Scopes", kind: "vectorscope" },
  pose: { label: "IK Pose", pose: true },
};

/** @param {string} pageUrl @param {number} startSec */
export function scenePoseThumbApiUrl(pageUrl, startSec) {
  const q = new URLSearchParams({
    url: pageUrl,
    t: String(Math.max(0, Math.floor(startSec))),
  });
  return `/api/ingest/pose-thumb?${q}`;
}
