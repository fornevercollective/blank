/**
 * Ingest quality settings (video / audio / snap / code / download).
 */

export const QUALITY_KEY = "blank.ingest.quality.v1";

/** @typedef {{ video: string, audio: string, snap: string, code: string, download: string }} QualitySettings */

const DEFAULTS = {
  video: "bv*+ba/b",
  audio: "ba/b",
  snap: "high",
  code: "en-auto",
  download: "mkv-best",
};

export const VIDEO_FORMATS = [
  { id: "bv*+ba/b", label: "Best video+audio (merge)" },
  { id: "bv*+ba/best", label: "Best available" },
  { id: "bv[height<=1080]+ba/b", label: "1080p cap" },
  { id: "bv[height<=720]+ba/b", label: "720p cap" },
  { id: "b", label: "Best single file" },
];

export const AUDIO_FORMATS = [
  { id: "ba/b", label: "Best audio (with video merge)" },
  { id: "bestaudio/best", label: "Audio-first" },
  { id: "140/b", label: "AAC m4a (YouTube)" },
];

export const SNAP_QUALITIES = [
  { id: "high", label: "High (0.92)", q: 0.92 },
  { id: "medium", label: "Medium (0.72)", q: 0.72 },
  { id: "low", label: "Low (0.55)", q: 0.55 },
];

export const CODE_QUALITIES = [
  { id: "en-auto", label: "English + auto" },
  { id: "en", label: "English only" },
  { id: "all", label: "All available tracks" },
  { id: "none", label: "Skip captions" },
];

export const DOWNLOAD_QUALITIES = [
  { id: "mkv-best", label: "MKV best merge", ext: "mkv" },
  { id: "mp4-best", label: "MP4 best merge", ext: "mp4" },
  { id: "webm-best", label: "WebM best merge", ext: "webm" },
  { id: "audio-m4a", label: "Audio only (m4a)", ext: "m4a", audioOnly: true },
];

/** @returns {QualitySettings} */
export function readQualitySettings() {
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw);
    return {
      video: typeof o.video === "string" ? o.video : DEFAULTS.video,
      audio: typeof o.audio === "string" ? o.audio : DEFAULTS.audio,
      snap: typeof o.snap === "string" ? o.snap : DEFAULTS.snap,
      code: typeof o.code === "string" ? o.code : DEFAULTS.code,
      download: typeof o.download === "string" ? o.download : DEFAULTS.download,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {QualitySettings} s */
export function persistQualitySettings(s) {
  try {
    localStorage.setItem(QUALITY_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function getYtdlpVideoFormat() {
  return readQualitySettings().video || DEFAULTS.video;
}

export function getSnapJpegQuality() {
  const id = readQualitySettings().snap;
  const hit = SNAP_QUALITIES.find((x) => x.id === id);
  return hit?.q ?? 0.72;
}

/** @returns {{ ext: string, audioOnly: boolean, format: string }} */
export function getDownloadProfile() {
  const id = readQualitySettings().download;
  const hit = DOWNLOAD_QUALITIES.find((x) => x.id === id) || DOWNLOAD_QUALITIES[0];
  const settings = readQualitySettings();
  const format = hit.audioOnly ? settings.audio || "bestaudio/best" : settings.video || DEFAULTS.video;
  return {
    ext: hit.ext,
    audioOnly: Boolean(hit.audioOnly),
    format,
  };
}

/** Caption/lang preference for intel pull */
export function getCaptionPreference() {
  return readQualitySettings().code;
}

/** Body fields for POST /api/ingest/* */
export function qualityPayloadForApi() {
  const d = getDownloadProfile();
  return {
    format: d.format,
    mergeExt: d.ext,
    audioOnly: d.audioOnly,
    captionPref: getCaptionPreference(),
  };
}
