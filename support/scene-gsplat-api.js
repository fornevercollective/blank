/**
 * Browser-safe gsplat bundle API URLs + scene filter presets.
 */
export { GSPLAT_SCENE_FILTER_TYPES, sceneGsplatTagLabels } from "./scene-gsplat-filters.js";

/** @param {string} pageUrl */
export function gsplatBundleMetaApiUrl(pageUrl) {
  const q = new URLSearchParams({ url: pageUrl });
  return `/api/ingest/gsplat/meta?${q}`;
}

/** @param {string} pageUrl */
export function gsplatPlyApiUrl(pageUrl) {
  const q = new URLSearchParams({ url: pageUrl });
  return `/api/ingest/gsplat/pointcloud.ply?${q}`;
}

/** @param {string} pageUrl */
export function gsplatTransformsApiUrl(pageUrl) {
  const q = new URLSearchParams({ url: pageUrl });
  return `/api/ingest/gsplat/transforms.json?${q}`;
}

/** @param {string} pageUrl */
export function gsplatCamerasApiUrl(pageUrl) {
  const q = new URLSearchParams({ url: pageUrl });
  return `/api/ingest/gsplat/cameras.json?${q}`;
}
