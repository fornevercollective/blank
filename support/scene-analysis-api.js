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
