/**
 * Video ingest helpers (from mueee-kbatch/video-ingest-hub).
 * Queue + URL classify + embeds + Terminal command rows.
 */

import {
  getSnapJpegQuality,
  getDownloadProfile,
  getYtdlpVideoFormat,
  qualityPayloadForApi,
} from "./ingest-settings.js";

export const QUEUE_KEY = "blank.videoIngest.queue.v1";
export const PATH_KEY = "blank.videoIngest.paths.v1";
export const ACTIVE_KEY = "blank.videoIngest.active.v1";
export const YTDLP_FORMAT = "bv*+ba/b";

/** @typedef {{ id: string, url: string, title?: string, notesHtml?: string, addedAt?: number, playId?: string, streamKind?: string, resolveError?: string }} QueueItem */
/** @typedef {"youtube"|"vimeo"|"hls"|"direct"|"tiktok"|"page"|"unknown"} VideoKind */
/** @typedef {{mustreamDesktop: string, mueeeRoot: string}} Paths */

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota */
  }
}

const TRAILING_URL_PUNCT = new Set([".", ",", ";", ":", ")", "]", "}", "!", "`", "·", "…"]);

/** Mirrors mustream-desktop `url_input.rs` (clipboard / Firefox paste). */
export function stripMustreamScheme(s) {
  let t = String(s).trim();
  for (const prefix of ["mustream://", "x-mustream://", "mustream:"]) {
    if (t.toLowerCase().startsWith(prefix)) {
      t = t.slice(prefix.length).replace(/^\/+/, "").trim();
      break;
    }
  }
  return t;
}

export function trimUrlTrailingPunct(s) {
  let t = String(s);
  while (t.length > 0 && TRAILING_URL_PUNCT.has(t[t.length - 1])) {
    t = t.slice(0, -1);
  }
  return t;
}

/** First http(s) URL embedded in chat/HTML paste. */
export function extractFirstHttpUrl(haystack) {
  let search = 0;
  const text = String(haystack);
  while (search < text.length) {
    const tail = text.slice(search);
    let rel = -1;
    let protoLen = 0;
    if (tail.includes("https://")) {
      rel = tail.indexOf("https://");
      protoLen = "https://".length;
    } else if (tail.includes("http://")) {
      rel = tail.indexOf("http://");
      protoLen = "http://".length;
    } else {
      return null;
    }
    const start = search + rel;
    const afterProto = text.slice(start + protoLen);
    const endRel = [...afterProto].findIndex((c) => {
      if (/\s/.test(c)) return true;
      return ['"', "'", ")", "]", ">", "<", "{", "}"].includes(c);
    });
    const end = start + protoLen + (endRel === -1 ? afterProto.length : endRel);
    const slice = trimUrlTrailingPunct(text.slice(start, end));
    if (slice.length >= "http://x".length) return slice;
    search = start + 1;
  }
  return null;
}

/** Pick a single watch URL from messy clipboard / multi-line paste. */
export function pickWatchUrl(raw) {
  const stripped = stripMustreamScheme(String(raw).trim());
  const unquoted = stripped.replace(/^["']|["']$/g, "").trim();
  for (const line of unquoted.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const embedded = extractFirstHttpUrl(t);
    if (embedded) return embedded;
    if (t.startsWith("http://") || t.startsWith("https://")) {
      return trimUrlTrailingPunct(t);
    }
  }
  const embedded = extractFirstHttpUrl(unquoted);
  if (embedded) return embedded;
  return trimUrlTrailingPunct(unquoted);
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "si",
  "feature",
  "share_id",
  "is_from_webapp",
  "sender_device",
  "sender_web_id",
  "enter_from",
  "enter_method",
  "sec_uid",
]);

function canonicalizeWatchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "tiktok.com" || host === "vm.tiktok.com") {
      let path = u.pathname.replace(/\/+$/, "") || "";
      if (host === "vm.tiktok.com" && path) {
        return `https://www.tiktok.com${path}`;
      }
      const clean = new URL(`https://www.tiktok.com${path || "/"}`);
      clean.search = "";
      clean.hash = "";
      return clean.toString().replace(/\/$/, "");
    }
    const clean = new URL(url);
    for (const key of [...clean.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        clean.searchParams.delete(key);
      }
    }
    clean.hash = "";
    let out = clean.toString();
    if (clean.searchParams.toString() === "") {
      out = out.replace(/\?$/, "");
    }
    return out;
  } catch {
    return trimUrlTrailingPunct(url);
  }
}

export function normalizeUrl(raw) {
  const picked = pickWatchUrl(raw);
  if (!picked.startsWith("http://") && !picked.startsWith("https://")) {
    return picked;
  }
  return canonicalizeWatchUrl(picked);
}

/** @param {string} url */
export function tiktokHandleFromUrl(url) {
  const m = String(url).match(/tiktok\.com\/@([^/?#]+)/i);
  return m ? m[1] : null;
}

/** @param {string} url @param {VideoKind} kind */
export function displayTitleForUrl(url, kind) {
  if (kind === "tiktok") {
    const handle = tiktokHandleFromUrl(url);
    const isLive = /\/live\/?$/i.test(url.split(/[?#]/)[0]);
    if (handle && isLive) return `@${handle} · live`;
    if (handle) return `@${handle}`;
    return isLive ? "TikTok · live" : "TikTok";
  }
  if (kind === "youtube") {
    const id = youtubeId(url);
    return id ? `YT · ${id}` : "YouTube";
  }
  if (kind === "vimeo") {
    const id = vimeoId(url);
    return id ? `Vimeo · ${id}` : "Vimeo";
  }
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/youtube\.com|youtu\.be/i.test(host)) {
      const id = youtubeId(url);
      return id ? `YT · ${id}` : "YouTube";
    }
    if (/twitch\.tv/i.test(host)) {
      const ch = u.pathname.split("/").filter(Boolean)[0];
      if (ch && u.pathname.includes("/live")) return `@${ch} · live`;
      return ch ? `@${ch}` : "Twitch";
    }
    return host;
  } catch {
    return url.slice(0, 48);
  }
}

/** @param {VideoKind} kind */
function ingestNotesHtml(kind) {
  if (kind === "tiktok") {
    return (
      "<p><strong>TikTok</strong> (live/VOD): paste queues and <strong>auto-resolves</strong> into the header preview via local <strong>yt-dlp</strong>.</p>" +
      "<p>MKV archive runs in the background to <code>~/Downloads</code>. Use <strong>controls</strong> for <code>mustream</code> if preview fails.</p>"
    );
  }
  if (kind === "page") {
    return "<p>Watch page — resolve with <code>mustream</code> or yt-dlp (see controls menu).</p>";
  }
  return "";
}

/** @param {string} raw */
export function ingestMetaFromUrl(raw) {
  const url = normalizeUrl(raw);
  const kind = classifyUrl(url);
  return {
    url,
    kind,
    title: displayTitleForUrl(url, kind),
    notesHtml: ingestNotesHtml(kind),
  };
}

/** @param {string} normalized */
/** @returns {VideoKind} */
export function classifyUrl(normalized) {
  const u = normalized.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return "unknown";
  const low = u.toLowerCase().split(/[?#]/)[0] || u.toLowerCase();
  if (low.endsWith(".m3u8") || /\.m3u8$/i.test(low)) return "hls";
  if (/\.(mp4|webm|mkv)$/i.test(low)) return "direct";
  if (/youtube\.com|youtu\.be/i.test(u)) return "youtube";
  if (/vimeo\.com/.test(u)) return "vimeo";
  if (/tiktok\.com|vm\.tiktok\.com/i.test(u)) return "tiktok";
  return "page";
}

export function isIngestUrl(text) {
  const t = pickWatchUrl(text);
  return t.startsWith("http://") || t.startsWith("https://");
}

function youtubeId(raw) {
  const u = raw.trim();
  try {
    const host = new URL(u).hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = new URL(u).pathname.replace(/^\//, "").replace(/\/$/, "");
      return id.length >= 8 ? id : null;
    }
    const qp = new URL(u).searchParams.get("v");
    if (qp && qp.length >= 8) return qp;
    const m = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{8,})/);
    if (m) return m[1];
    const s = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{8,})/);
    if (s) return s[1];
    return null;
  } catch {
    return null;
  }
}

function vimeoId(raw) {
  try {
    const p = new URL(raw.trim()).pathname;
    const m = p.match(/\/(\d{6,})\/?$/);
    return m ? m[1] : null;
  } catch {
    const m = raw.trim().match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
    return m ? m[1] : null;
  }
}

function needsPageResolve(kind) {
  return (
    kind === "page" ||
    kind === "youtube" ||
    kind === "vimeo" ||
    kind === "tiktok" ||
    kind === "unknown"
  );
}

/** @typedef {{ type: 'frame', count: number, playing?: boolean, timeLabel?: string, unavailable?: boolean } | { type: 'scrub', label: string, active: boolean } | { type: 'snapshot', dataUrl: string } | { type: 'reset' }} RailPlaybackEvent */

/** @type {Set<(ev: RailPlaybackEvent) => void>} */
const railPlaybackListeners = new Set();

/** @type {(() => void)|null} */
let previewTelemetryCleanup = null;

/** @type {((reason: string) => void)|null} */
let previewStreamRecovery = null;

/** Avoid tearing down a healthy player on redundant redraw() calls. */
let mountedPreviewKey = "";

/** @param {(reason: string) => void} fn */
export function onPreviewStreamRecovery(fn) {
  previewStreamRecovery = fn;
}

/** @param {(ev: RailPlaybackEvent) => void} cb */
export function onRailPlayback(cb) {
  railPlaybackListeners.add(cb);
  return () => railPlaybackListeners.delete(cb);
}

/** @param {RailPlaybackEvent} ev */
function emitRailPlayback(ev) {
  for (const cb of railPlaybackListeners) cb(ev);
}

/** @type {(() => void)|null} */
let embedPulseCleanup = null;

export function resetRailPlayback() {
  if (previewTelemetryCleanup) {
    previewTelemetryCleanup();
    previewTelemetryCleanup = null;
  }
  if (embedPulseCleanup) {
    embedPulseCleanup();
    embedPulseCleanup = null;
  }
  emitRailPlayback({ type: "reset" });
}

function formatPlayClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** @param {HTMLVideoElement} video */
function captureVideoSnapshot(video) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h || video.readyState < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", getSnapJpegQuality());
  } catch {
    return null;
  }
}

/** Frame index at current playback time (freezes when paused). */
function playbackFrameAtTime(video, fps = 30) {
  const t = video.currentTime;
  if (!Number.isFinite(t) || t < 0) return 0;
  return Math.floor(t * fps);
}

/** @param {HTMLVideoElement} video */
function playbackTimeLabel(video) {
  const t = formatPlayClock(video.currentTime);
  const dur = video.duration;
  return Number.isFinite(dur) && dur > 0 ? `${t} / ${formatPlayClock(dur)}` : t;
}

/** @param {HTMLVideoElement} video */
function attachPreviewTelemetry(video) {
  if (previewTelemetryCleanup) previewTelemetryCleanup();

  const fps = 30;
  let lastSnapMs = 0;
  let pumpId = 0;
  let rvfcActive = false;

  const syncRail = () => {
    const playing = !video.paused && !video.ended;
    emitRailPlayback({
      type: "frame",
      count: playbackFrameAtTime(video, fps),
      playing,
      timeLabel: playbackTimeLabel(video),
    });
  };

  const setScrub = (active) => {
    emitRailPlayback({
      type: "scrub",
      label: playbackTimeLabel(video),
      active,
    });
  };

  const pullSnapshot = () => {
    const now = performance.now();
    if (now - lastSnapMs < 1200) return;
    lastSnapMs = now;
    const dataUrl = captureVideoSnapshot(video);
    if (dataUrl) {
      syncRail();
      emitRailPlayback({ type: "snapshot", dataUrl });
    }
  };

  const stopPump = () => {
    if (pumpId) cancelAnimationFrame(pumpId);
    pumpId = 0;
  };

  const pump = () => {
    pumpId = 0;
    if (video.paused || video.ended) return;
    syncRail();
    if (!video.seeking) pullSnapshot();
    pumpId = requestAnimationFrame(pump);
  };

  const stopRvfc = () => {
    rvfcActive = false;
  };

  const startRvfc = () => {
    if (rvfcActive || !("requestVideoFrameCallback" in HTMLVideoElement.prototype)) {
      return;
    }
    rvfcActive = true;
    /** @param {number} _now @param {VideoFrameCallbackMetadata} [meta] */
    const onVideoFrame = (_now, meta) => {
      if (!rvfcActive || video.paused || video.ended) {
        rvfcActive = false;
        syncRail();
        return;
      }
      const t =
        meta && Number.isFinite(meta.mediaTime)
          ? meta.mediaTime
          : video.currentTime;
      emitRailPlayback({
        type: "frame",
        count: Math.max(0, Math.floor(t * fps)),
        playing: true,
        timeLabel: playbackTimeLabel(video),
      });
      video.requestVideoFrameCallback(onVideoFrame);
    };
    video.requestVideoFrameCallback(onVideoFrame);
  };

  const onLoadedMeta = () => {
    syncRail();
    if (!video.paused) {
      pump();
      startRvfc();
    }
  };

  const onTimeupdate = () => {
    syncRail();
    if (video.seeking) setScrub(true);
  };

  const onSeeking = () => setScrub(true);
  const onSeeked = () => {
    setScrub(false);
    syncRail();
    pullSnapshot();
  };

  const onPlaying = () => {
    pullSnapshot();
    pump();
    startRvfc();
  };

  const onPause = () => {
    stopPump();
    stopRvfc();
    syncRail();
  };

  video.addEventListener("loadedmetadata", onLoadedMeta);
  video.addEventListener("timeupdate", onTimeupdate);
  video.addEventListener("seeking", onSeeking);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("pause", onPause);

  syncRail();
  if (!video.paused) {
    pump();
    startRvfc();
  }

  previewTelemetryCleanup = () => {
    stopPump();
    stopRvfc();
    video.removeEventListener("loadedmetadata", onLoadedMeta);
    video.removeEventListener("timeupdate", onTimeupdate);
    video.removeEventListener("seeking", onSeeking);
    video.removeEventListener("seeked", onSeeked);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("pause", onPause);
    emitRailPlayback({ type: "scrub", label: "0:00", active: false });
  };
}

/** iframe embeds — no frame/time API; do not fake a running counter. */
function attachEmbedPlaybackStub() {
  if (embedPulseCleanup) embedPulseCleanup();
  emitRailPlayback({
    type: "frame",
    count: 0,
    playing: false,
    unavailable: true,
  });
  embedPulseCleanup = () => {};
}

/** @param {HTMLElement} host */
function syncPreviewTelemetry(host) {
  const video = host.querySelector("video");
  if (video instanceof HTMLVideoElement) {
    attachPreviewTelemetry(video);
    return;
  }
  const iframe = host.querySelector("iframe");
  if (iframe instanceof HTMLIFrameElement) {
    attachEmbedPlaybackStub();
    return;
  }
  resetRailPlayback();
}

/** @param {HTMLElement|null} hintHost */
export function setPreviewHint(hintHost, text) {
  if (!hintHost) return;
  hintHost.innerHTML = "";
  const p = document.createElement("p");
  p.className = "ingest-hint";
  p.textContent = text;
  hintHost.appendChild(p);
  hintHost.hidden = false;
}

/** @param {string} normalized @param {VideoKind} kind */
export function previewThumbUrl(normalized, kind) {
  if (kind === "youtube") {
    const id = youtubeId(normalized);
    if (id) return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  }
  return null;
}

function clearPreviewHint(hintHost) {
  if (!hintHost) return;
  hintHost.innerHTML = "";
  hintHost.hidden = true;
}

/** @returns {HTMLElement|null} */
export function renderEmbed(kind, normalized, hintHost = null) {
  if (kind === "youtube") {
    const id = youtubeId(normalized);
    if (!id) return null;
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    const frame = document.createElement("iframe");
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    frame.title = `YouTube ${id}`;
    frame.src = `${src}?rel=0`;
    frame.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen",
    );
    return wrapEmbed(frame);
  }
  if (kind === "vimeo") {
    const id = vimeoId(normalized);
    if (!id) return null;
    const frame = document.createElement("iframe");
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    frame.title = `Vimeo ${id}`;
    frame.src = `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    frame.setAttribute(
      "allow",
      "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media",
    );
    return wrapEmbed(frame);
  }
  const video = document.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = normalized;
  video.className = "direct-video";
  const shell = wrapEmbed(video, "embed-shell--direct");
  video.addEventListener("error", () => {
    setPreviewHint(
      hintHost,
      "Browser blocked inline playback (CORS). Use yt-dlp, mustream, or ffplay.",
    );
  });
  video.addEventListener("loadeddata", () => clearPreviewHint(hintHost));
  return shell;
}

/** @param {HTMLElement} node @param {string} [extraClass] */
function wrapEmbed(node, extraClass = "") {
  const shell = document.createElement("div");
  shell.className = `embed-shell${extraClass ? ` ${extraClass}` : ""}`;
  shell.appendChild(node);
  return shell;
}

function shellSingleQuote(inner) {
  return `'${String(inner).replace(/'/g, "'\\''")}'`;
}

/** @typedef {{ label: string, cmd: string, note?: string }} PlaybackCommand */

export const MACOS_CAMERA_FFPLAY = 'ffplay -f avfoundation -i "0:none"';

/** Local capture — no embed ads. @returns {PlaybackCommand[]} */
export function cameraPlaybackOptions() {
  return [
    {
      label: "macOS camera (ffplay)",
      cmd: MACOS_CAMERA_FFPLAY,
      note: "Terminal playback — not a watch-page embed",
    },
    {
      label: "Camera · titled window",
      cmd: `${MACOS_CAMERA_FFPLAY} -window_title blank-camera`,
      note: "Same capture with a named ffplay window",
    },
  ];
}

/**
 * Sample feeds from videos.json as direct ffplay (no browser player).
 * @param {Array<{ title?: string, url: string }>} presets
 * @returns {PlaybackCommand[]}
 */
export function feedPlaybackOptions(presets) {
  const rows = [];
  for (const preset of presets) {
    const norm = normalizeUrl(preset.url);
    if (!norm) continue;
    const kind = classifyUrl(norm);
    const tag = kind === "hls" ? "HLS · no ads" : "Direct · no embed";
    rows.push({
      label: `${preset.title || "Feed"} — ffplay`,
      cmd: `ffplay -autoexit -window_title blank ${shellSingleQuote(norm)}`,
      note: tag,
    });
  }
  return rows;
}

/**
 * ffplay / mustream / pipe paths that avoid YouTube/Vimeo embed commercial breaks.
 * @param {VideoKind} kind
 * @param {string} raw
 * @param {Paths} paths
 * @returns {PlaybackCommand[]}
 */
export function adFreePlaybackCommands(kind, raw, paths) {
  const u = normalizeUrl(raw);
  const q = shellSingleQuote(u);
  const vf = getYtdlpVideoFormat();
  /** @type {PlaybackCommand[]} */
  const rows = [];

  if (kind === "hls" || kind === "direct") {
    rows.push({
      label: "ffplay stream (recommended)",
      cmd: `ffplay -autoexit -window_title blank ${q}`,
      note: "Plays URL in ffplay — no iframe or site player",
    });
  }

  if (
    kind === "youtube" ||
    kind === "vimeo" ||
    kind === "tiktok" ||
    kind === "page" ||
    kind === "unknown"
  ) {
    rows.push({
      label: "mustream → ffplay",
      cmd: `mustream ${q}`,
      note: "Resolves watch page; Terminal player — skips embed ads",
    });
    const openSh = `${paths.mustreamDesktop}/extras/open-in-mustream.sh`;
    rows.push({
      label: "open-in-mustream.sh (GUI)",
      cmd: `bash ${shellSingleQuote(openSh)} ${u}`,
      note: "MuStream app player — not the site embed",
    });
    rows.push({
      label: "yt-dlp pipe → ffplay",
      cmd: `yt-dlp -f "${vf}" -o - --no-playlist --quiet ${q} 2>/dev/null | ffplay -autoexit -window_title blank -`,
      note: "Decoded stream to ffplay; no browser watch UI",
    });
  }

  rows.push({
    label: "mueee launch-mustream play",
    cmd: `bash ${shellSingleQuote(`${paths.mueeeRoot}/launch-mustream.sh`)} play ${u}`,
    note: "CLI resolve + ffplay via launch script",
  });
  rows.push({
    label: "open-in-mustream CLI",
    cmd: `MUSTREAM_USE_CLI=1 bash ${shellSingleQuote(`${paths.mustreamDesktop}/extras/open-in-mustream.sh`)} ${u}`,
    note: "Terminal ffplay path from MuStream extras",
  });

  return rows;
}

/**
 * @param {VideoKind} kind
 * @param {string} raw
 * @param {Paths} paths
 * @returns {Array<{ section: string, items: PlaybackCommand[] }>}
 */
export function controlsPlaybackSections(kind, raw, paths) {
  const adFree = adFreePlaybackCommands(kind, raw, paths);
  const adCmds = new Set(adFree.map((r) => r.cmd));
  const archive = commandsFor(kind, raw, paths).filter((r) => !adCmds.has(r.cmd));
  return [
    { section: "Play without embed ads", items: adFree },
    { section: "Archive, probe, extras", items: archive },
  ];
}

/** @param {VideoKind} kind @param {string} raw @param {Paths} paths */
export function commandsFor(kind, raw, paths) {
  const u = normalizeUrl(raw);
  const q = shellSingleQuote(u);
  const rows = [];

  const dl = getDownloadProfile();
  const vf = getYtdlpVideoFormat();
  const mergePart = dl.audioOnly
    ? ""
    : ` --merge-output-format ${dl.ext}`;
  rows.push({
    label: "yt-dlp archive",
    cmd: `yt-dlp -f "${dl.format}"${mergePart} -o ${shellSingleQuote(
      "~/Downloads/%(title)s.%(ext)s",
    )} ${q}`,
  });
  if (kind === "tiktok") {
    rows.unshift({
      label: "mustream play page (TikTok / live)",
      cmd: `mustream ${q}`,
    });
  }

  rows.push({ label: "mustream (resolve + ffplay)", cmd: `mustream ${q}` });
  rows.push({ label: "mustream dry-run (−n)", cmd: `mustream -n ${q}` });
  if (needsPageResolve(kind)) {
    rows.push({ label: "mustream snapshot (still frame)", cmd: `mustream snapshot ${q}` });
  }
  rows.push({
    label: "ffprobe JSON (single object)",
    cmd: `ffprobe -hide_banner -loglevel quiet -show_format -show_streams -print_format json ${q}`,
  });
  rows.push({ label: "ffprobe terse", cmd: `ffprobe -hide_banner ${q}` });
  if (kind === "hls" || kind === "direct") {
    rows.push({ label: "ffplay direct", cmd: `ffplay -autoexit ${q}` });
  }

  const openSh = `${paths.mustreamDesktop}/extras/open-in-mustream.sh`;
  rows.push({
    label: "open-in-mustream.sh (GUI)",
    cmd: `bash ${shellSingleQuote(openSh)} ${u}`,
  });
  rows.push({
    label: "open-in … CLI (terminal ffplay)",
    cmd: `MUSTREAM_USE_CLI=1 bash ${shellSingleQuote(openSh)} ${u}`,
  });
  rows.push({
    label: "mueee launch-mustream.sh",
    cmd: `bash ${shellSingleQuote(`${paths.mueeeRoot}/launch-mustream.sh`)} play ${u}`,
  });
  rows.push({
    label: "mueee launch · resolve envelope",
    cmd: `bash ${shellSingleQuote(`${paths.mueeeRoot}/launch-mustream.sh`)} resolve ${u}`,
  });

  return rows;
}

export function kindLabel(kind) {
  switch (kind) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "tiktok":
      return "TikTok";
    case "hls":
      return "HLS (.m3u8)";
    case "direct":
      return "Direct file";
    case "page":
      return "Watch page";
    default:
      return "Unknown · treat like page URL";
  }
}

export function readQueue() {
  const arr = readJson(QUEUE_KEY, []);
  if (!Array.isArray(arr)) return [];
  /** @type {QueueItem[]} */
  const items = [];
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : `row-${Date.now()}-${i}`;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) continue;
    items.push({
      id,
      url,
      title: typeof row.title === "string" ? row.title : undefined,
      notesHtml: typeof row.notesHtml === "string" ? row.notesHtml : undefined,
      addedAt: typeof row.addedAt === "number" ? row.addedAt : Date.now(),
      /* playId / streamKind / resolveError are session-only — never restored from disk */
    });
  }
  return items;
}

/** Ephemeral fields — not persisted (server play cache is in-memory). */
function queueForStorage(q) {
  return q.map(({ playId, streamKind, resolveError, ...rest }) => rest);
}

/** @param {QueueItem[]} q */
export function writeQueue(q) {
  writeJson(QUEUE_KEY, queueForStorage(q));
}

/** @param {string} playId */
export async function playSessionAlive(playId) {
  try {
    const res = await fetch(`/api/ingest/play/${encodeURIComponent(playId)}`, {
      method: "HEAD",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function readActiveId() {
  const id = readJson(ACTIVE_KEY, null);
  return typeof id === "string" ? id : null;
}

export function writeActiveId(id) {
  if (id == null) {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* noop */
    }
    return;
  }
  writeJson(ACTIVE_KEY, id);
}

/** @param {QueueItem[]} queue */
export function resolveActiveItem(queue) {
  const saved = readActiveId();
  if (saved) {
    const hit = queue.find((x) => x.id === saved);
    if (hit) return hit;
  }
  return queue[0] || null;
}

/** @param {Partial<Paths>|null} stored @param {{mustream: string, mueee: string}} defaults */
export function readPaths(stored, defaults) {
  const s = stored && typeof stored === "object" ? stored : {};
  return {
    mustreamDesktop: String(s.mustreamDesktop || defaults.mustream).trim(),
    mueeeRoot: String(s.mueeeRoot || defaults.mueee).trim(),
  };
}

export function persistPaths(paths) {
  writeJson(PATH_KEY, paths);
}

/** @typedef {{ id?: string, title?: string, url: string, notes?: string, ingestHints?: string }} PresetRaw */

export async function fetchPresets() {
  try {
    const res = await fetch(`videos.json?${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const arr = Array.isArray(data.items) ? data.items : [];
    return arr
      .map((entry, idx) => {
        if (!entry || typeof entry !== "object") return null;
        const o = /** @type {Record<string, unknown>} */ (entry);
        const id = typeof o.id === "string" ? o.id : `preset-${idx}`;
        const title = typeof o.title === "string" ? o.title : "";
        const u = typeof o.url === "string" ? o.url.trim() : "";
        if (!u) return null;
        return {
          id,
          title: title || id,
          url: u,
          notes: typeof o.notes === "string" ? o.notes : "",
          ingestHints: typeof o.ingestHints === "string" ? o.ingestHints : "",
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Read clipboard, extract/clean watch URL (MuStream paste rules).
 * @param {HTMLInputElement|null} inputEl
 * @param {{ queue?: boolean, ingestApi?: { queueUrl: (url: string, meta?: object) => void } }} [opts]
 */
export async function pasteClipboardWatchUrl(inputEl, opts = {}) {
  try {
    const raw = await navigator.clipboard.readText();
    const meta = ingestMetaFromUrl(raw);
    if (!meta.url.startsWith("http://") && !meta.url.startsWith("https://")) {
      return { ok: false, reason: "no-url" };
    }
    if (inputEl) inputEl.value = meta.url;
    if (opts.queue && opts.ingestApi) {
      opts.ingestApi.queueUrl(meta.url, {
        title: meta.title,
        notesHtml: meta.notesHtml,
        autoResolve: opts.autoResolve !== false,
      });
      if (inputEl) inputEl.value = "";
    }
    return { ok: true, meta };
  } catch {
    return { ok: false, reason: "clipboard" };
  }
}

export async function copyText(el, text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.readOnly = true;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (el) {
    el.classList.add("is-copied");
    window.setTimeout(() => el.classList.remove("is-copied"), 800);
  }
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** TikTok / generic pages — not YouTube/Vimeo (those use iframe embed first). */
export function shouldAutoResolve(kind) {
  if (kind === "youtube" || kind === "vimeo") return false;
  return needsPageResolve(kind);
}

function canEmbedPreview(kind) {
  return kind === "youtube" || kind === "vimeo" || kind === "hls" || kind === "direct";
}

function mustreamPlayCmd(url) {
  return `mustream ${shellSingleQuote(normalizeUrl(url))}`;
}

function mustreamOpenGuiCmd(url, paths) {
  const openSh = `${paths.mustreamDesktop}/extras/open-in-mustream.sh`;
  return `bash ${shellSingleQuote(openSh)} ${normalizeUrl(url)}`;
}

/** @typedef {{ id: string, label: string, status: 'done'|'warn'|'pending', detail: string }} IngestCheckStep */
/** @typedef {{ id: 'play'|'download'|'mustream', label: string, enabled: boolean, title: string }} IngestCheckAction */

/** @param {QueueItem} item @param {Paths} paths @param {boolean|null} apiOk */
export function buildIngestChecklist(item, paths, apiOk = null) {
  const norm = normalizeUrl(item.url);
  const kind = classifyUrl(norm);
  const title = item.title || displayTitleForUrl(norm, kind);
  const embed = canEmbedPreview(kind);
  const ytdlp = kind !== "unknown";
  const needsApi = shouldAutoResolve(kind) || kind === "youtube";
  const api = apiOk === true;
  const mustream = Boolean(paths.mustreamDesktop?.trim());

  const checkParts = [];
  if (embed) checkParts.push("embed preview");
  if (ytdlp) checkParts.push("yt-dlp download");
  if (needsApi) checkParts.push(api ? "local resolve API" : "resolve API (start ./start.sh)");
  if (mustream) checkParts.push("mustream app");

  /** @type {IngestCheckStep[]} */
  const steps = [
    {
      id: "classify",
      label: "classify",
      status: "done",
      detail: `${kindLabel(kind)} — ${title}`,
    },
    {
      id: "check",
      label: "check",
      status: needsApi && apiOk === false ? "warn" : "done",
      detail: checkParts.length ? checkParts.join(" · ") : "terminal commands only",
    },
  ];

  /** @type {IngestCheckAction[]} */
  const actions = [
    {
      id: "play",
      label: "play",
      enabled: embed || api || ytdlp,
      title: embed
        ? "Preview in header (embed)"
        : "Preview — resolve via header or yt-dlp stream",
    },
    {
      id: "download",
      label: "download",
      enabled: ytdlp && (!needsApi || apiOk !== false),
      title: "yt-dlp MKV → ~/Downloads",
    },
    {
      id: "mustream",
      label: "MuStream",
      enabled: mustream,
      title: mustream
        ? "Copy mustream command (paste in Terminal)"
        : "Set Path defaults → MuStream desktop",
    },
  ];

  return { steps, actions, norm, kind, mustreamCmd: mustreamPlayCmd(norm), mustreamGuiCmd: mustreamOpenGuiCmd(norm, paths) };
}

let ingestApiOk = /** @type {boolean|null} */ (null);
let ingestApiProbe = /** @type {Promise<boolean>|null} */ (null);

export function getIngestApiOk() {
  return ingestApiOk;
}

/** Probe blank Node ingest API (./start.sh). */
export async function refreshIngestApiCheck() {
  if (ingestApiProbe) return ingestApiProbe;
  ingestApiProbe = (async () => {
    try {
      const r = await fetch("/api/ingest/resolve", { method: "OPTIONS", cache: "no-store" });
      ingestApiOk = r.status === 204 || r.ok;
    } catch {
      ingestApiOk = false;
    }
    ingestApiProbe = null;
    return ingestApiOk;
  })();
  return ingestApiProbe;
}

/**
 * @param {QueueItem} item
 * @param {Paths} paths
 * @param {{ onPlay: () => void, onDownload: () => void, onMustream: () => void }} handlers
 * @param {boolean|null} apiOk
 */
/**
 * @param {IngestCheckAction[]} actions
 * @param {{ onPlay: () => void, onDownload: () => void, onMustream: () => void }} handlers
 */
export function renderIngestActions(actions, handlers) {
  const actionsEl = document.createElement("div");
  actionsEl.className = "ingest-check-actions";
  actionsEl.setAttribute("role", "group");
  actionsEl.setAttribute("aria-label", "Playback options");

  for (const act of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ingest-check-action";
    btn.dataset.action = act.id;
    btn.textContent = act.label;
    btn.title = act.title;
    btn.disabled = !act.enabled;
    if (act.id === "play") btn.addEventListener("click", handlers.onPlay);
    if (act.id === "download") btn.addEventListener("click", handlers.onDownload);
    if (act.id === "mustream") btn.addEventListener("click", handlers.onMustream);
    actionsEl.appendChild(btn);
  }

  return actionsEl;
}

export function renderIngestChecklist(item, paths, handlers, apiOk = null) {
  const { steps } = buildIngestChecklist(item, paths, apiOk);
  const wrap = document.createElement("div");
  wrap.className = "ingest-checklist-wrap";

  const list = document.createElement("ul");
  list.className = "ingest-checklist";
  list.setAttribute("aria-label", "Ingest checklist");

  for (const step of steps) {
    const li = document.createElement("li");
    li.className = `ingest-check ingest-check--${step.status}`;
    const mark = step.status === "done" ? "✓" : step.status === "warn" ? "!" : "…";
    li.innerHTML =
      `<span class="ingest-check-mark" aria-hidden="true">${mark}</span>` +
      `<span class="ingest-check-label">${escapeHtml(step.label)}</span>` +
      `<span class="ingest-check-detail">${escapeHtml(step.detail)}</span>`;
    list.appendChild(li);
  }

  wrap.append(list);
  return wrap;
}

/** @param {string} pageUrl @param {{ download?: boolean }} [opts] */
export async function requestIngestResolve(pageUrl, opts = {}) {
  const res = await fetch("/api/ingest/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: pageUrl,
      download: opts.download === true,
      ...qualityPayloadForApi(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `resolve failed (${res.status})`);
  }
  return data;
}

/** @param {string} pageUrl */
export async function requestIngestDownload(pageUrl) {
  const res = await fetch("/api/ingest/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: pageUrl, ...qualityPayloadForApi() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `download failed (${res.status})`);
  }
  return data;
}

/** @param {HTMLElement} host @param {string} playId @param {HTMLElement|null} hintHost */
function mountPlaySession(host, playId, hintHost) {
  const video = document.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.autoplay = true;
  video.muted = true;
  video.className = "direct-video";
  const src = `/api/ingest/play/${playId}`;
  const shell = wrapEmbed(video, "embed-shell--direct");
  clearPreviewHint(hintHost);

  let recoveryFired = false;
  /** @type {import("hls.js").default | null} */
  let hls = null;

  const failPlayback = (msg) => {
    if (recoveryFired) return;
    recoveryFired = true;
    try {
      hls?.destroy();
    } catch {
      /* noop */
    }
    hls = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    setPreviewHint(hintHost, msg);
    previewStreamRecovery?.("playback-failed");
  };

  const Hls = /** @type {typeof import("hls.js").default|undefined} */ (
    globalThis.Hls
  );
  if (Hls?.isSupported?.()) {
    hls = new Hls({
      enableWorker: true,
      maxRecoverAttempts: 2,
      fragLoadingMaxRetry: 2,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data?.fatal) {
        failPlayback(
          "Stream expired or blocked — click resolve once, or use controls → MuStream.",
        );
      }
    });
    video.addEventListener("playing", () => clearPreviewHint(hintHost));
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = src;
    video.addEventListener("loadeddata", () => clearPreviewHint(hintHost));
    video.addEventListener("error", () => {
      failPlayback("Stream failed — click resolve or use controls → mustream.");
    });
  } else {
    video.src = src;
    setPreviewHint(hintHost, "Loading stream…");
    video.addEventListener("error", () => {
      failPlayback("Stream failed — click resolve or use controls → mustream.");
    });
  }

  host.appendChild(shell);
  syncPreviewTelemetry(host);
  void video.play().catch(() => {
    /* autoplay blocked until user taps play */
  });
  return shell;
}

/** @param {HTMLElement} host @param {QueueItem|null} item @param {HTMLElement|null} [hintHost] */
export function mountPreview(host, item, hintHost = null) {
  const previewKey = item
    ? `${item.id}|${item.playId || ""}|${item.resolveError || ""}`
    : "";
  if (previewKey && previewKey === mountedPreviewKey && host.childElementCount > 0) {
    syncPreviewTelemetry(host);
    return;
  }
  mountedPreviewKey = previewKey;

  clearPreviewHint(hintHost);
  resetRailPlayback();
  host.innerHTML = "";
  if (!item) {
    host.hidden = true;
    mountedPreviewKey = "";
    return;
  }
  if (item.playId) {
    host.hidden = false;
    void playSessionAlive(item.playId).then((alive) => {
      if (previewKey !== mountedPreviewKey) return;
      if (!alive) {
        setPreviewHint(hintHost, "Play session expired — click resolve.");
        host.hidden = true;
        previewStreamRecovery?.("session-expired");
        return;
      }
      mountPlaySession(host, item.playId, hintHost);
    });
    return;
  }
  if (item.resolveError) {
    setPreviewHint(hintHost, item.resolveError);
    host.hidden = true;
    resetRailPlayback();
    return;
  }
  const norm = normalizeUrl(item.url);
  const kind = classifyUrl(norm);
  const emb = renderEmbed(kind, norm, hintHost);
  host.hidden = false;
  if (emb) {
    host.appendChild(emb);
    syncPreviewTelemetry(host);
    return;
  }
  if (shouldAutoResolve(kind)) {
    setPreviewHint(hintHost, "Resolving with yt-dlp…");
    host.hidden = true;
    resetRailPlayback();
    return;
  }
  if (kind === "tiktok") {
    setPreviewHint(
      hintHost,
      "TikTok live — paste to auto-resolve, or use mustream in controls.",
    );
  } else if (needsPageResolve(kind)) {
    setPreviewHint(
      hintHost,
      "No inline embed — use yt-dlp or mustream (controls menu).",
    );
  } else {
    setPreviewHint(hintHost, "Malformed URL.");
  }
  host.hidden = true;
}
