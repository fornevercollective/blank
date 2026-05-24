/**
 * GitHub Pages static intel bundle (pre-cached yt-dlp + scene thumbs).
 */

export const PAGES_DEMO_VIDEO_ID = "SKia5QUiGkE";
export const PAGES_DEMO_URL = `https://www.youtube.com/watch?v=${PAGES_DEMO_VIDEO_ID}`;

/** @param {string} url */
export function youtubeVideoId(url) {
  const s = String(url || "").trim();
  const m =
    s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/) ||
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

/** @param {string} url */
export function pagesIntelJsonPath(url) {
  const id = youtubeVideoId(url);
  return id ? `pages-cache/${id}/intel.json` : null;
}

/**
 * @param {object} intel
 * @param {string} cacheId
 */
export function normalizePagesIntel(intel, cacheId) {
  if (!intel || typeof intel !== "object") return null;
  const base = `pages-cache/${cacheId}`;
  const scenes = (Array.isArray(intel.scenes) ? intel.scenes : []).map((sc) => {
    const row = { ...sc };
    if (row.thumbFile) {
      row.thumb = `${base}/scenes/${row.thumbFile}`;
      delete row.thumbFile;
    }
    if (row.poseFile) {
      row.poseThumb = `${base}/poses/${row.poseFile}`;
      delete row.poseFile;
    }
    if (row.analysisFiles && typeof row.analysisFiles === "object") {
      row.analysis = {};
      for (const [kind, file] of Object.entries(row.analysisFiles)) {
        row.analysis[kind] = `${base}/analysis/${file}`;
      }
      delete row.analysisFiles;
    }
    delete row.waveUrl;
    return row;
  });
  return {
    ...intel,
    ok: true,
    scenes,
    _pagesCache: true,
    _pagesCacheId: cacheId,
  };
}

/**
 * @param {string} pageUrl
 */
export async function fetchPagesIntel(pageUrl) {
  const path = pagesIntelJsonPath(pageUrl);
  const id = youtubeVideoId(pageUrl);
  if (!path || !id) return null;
  try {
    const res = await fetch(path, { cache: "default" });
    if (!res.ok) return null;
    const raw = await res.json();
    return normalizePagesIntel(raw, id);
  } catch {
    return null;
  }
}

/** @param {string} url */
export function isStuckDemoPlaylistUrl(url) {
  const s = String(url || "").toLowerCase();
  return (
    /\.m3u8(\?|$)/.test(s) ||
    /devstreaming-cdn\.apple\.com/.test(s) ||
    /playlist_166672507184749/.test(s) ||
    /video\.pscp\.tv/.test(s)
  );
}
