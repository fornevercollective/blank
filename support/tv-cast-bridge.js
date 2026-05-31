/**
 * Main window ↔ TV cast window sync (BroadcastChannel).
 */
import { TV_CAST_CHANNEL, REFRAME_PRESETS } from "./tv-reframe.js";
import { applyPreviewPlayback, getPreviewPlaybackState } from "./video-ingest.js";

/** @type {Window | null} */
let castWin = null;

/** Force TV window to remount video (e.g. right after pop-out opens). */
let forceNextCastRemount = false;

const ch =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(TV_CAST_CHANNEL)
    : null;

/** @type {{ reframeId: string, layoutId: string, sideMode: string, customNote: string }} */
let castPrefs = {
  reframeId: "grok",
  layoutId: "sidecar",
  sideMode: "intel",
  customNote: "",
};

/** @returns {HTMLSelectElement | null} */
function reframeSelectEl() {
  const el = document.getElementById("tv-cast-reframe");
  return el instanceof HTMLSelectElement ? el : null;
}

/** @param {HTMLSelectElement} sel */
function fillReframeSelect(sel) {
  const prev = sel.value || castPrefs.reframeId;
  sel.replaceChildren();
  for (const preset of Object.values(REFRAME_PRESETS)) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    sel.appendChild(opt);
  }
  sel.value = REFRAME_PRESETS[prev] ? prev : castPrefs.reframeId;
  castPrefs.reframeId = sel.value;
}

/**
 * @param {{
 *   getPageUrl: () => string | null,
 *   getQueueItem: () => import('./video-ingest.js').QueueItem | null | undefined,
 *   getIntel: (url: string) => object | undefined,
 *   deriveShow: (intel: object) => { show: string, headline: string },
 *   enrichScenes: (scenes: object[], intel: object, pageUrl: string) => object[],
 *   sceneIndexAtTime: (scenes: object[], t: number) => number,
 *   formatClock: (t: number) => string,
 *   getPreviewTimeSec: () => number,
 *   getRuntimeLine?: () => string,
 * }} deps
 */
export function initTvCast(deps) {
  const reframeSel = reframeSelectEl();
  const openBtn = document.getElementById("ffplay-tv-cast");

  if (reframeSel) {
    fillReframeSelect(reframeSel);
    reframeSel.addEventListener("change", () => {
      castPrefs.reframeId = reframeSel.value;
      pushCastState(deps);
    });
  }

  function openCastWindow() {
    const url = new URL("tv-cast.html", globalThis.location.href).href;
    if (castWin && !castWin.closed) {
      castWin.focus();
      forceNextCastRemount = true;
      pushCastState(deps);
      return;
    }
    castWin = window.open(
      url,
      "blank-tv-cast",
      "popup=yes,width=1280,height=720,menubar=no,toolbar=no",
    );
    if (!castWin) {
      window.alert(
        "Allow pop-ups for this site to open the TV cast window, then use Mac Screen Mirroring / AirPlay.",
      );
      return;
    }
    forceNextCastRemount = true;
    castWin.addEventListener("load", () => pushCastState(deps), { once: true });
    pushCastState(deps);
  }

  openBtn?.addEventListener("click", openCastWindow);

  if (ch) {
    ch.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "cast-ready" || msg.type === "pong") {
        pushCastState(deps);
      }
      if (msg.type === "playback-sync") {
        const embed = document.getElementById("ffplay-embed");
        if (embed instanceof HTMLElement) {
          applyPreviewPlayback(embed, {
            currentTime: msg.currentTime,
            paused: msg.paused,
          });
        }
      }
      if (msg.type === "prefs") {
        if (msg.reframeId) {
          castPrefs.reframeId = msg.reframeId;
          const sel = reframeSelectEl();
          if (sel) sel.value = msg.reframeId;
        }
        if (msg.layoutId) castPrefs.layoutId = msg.layoutId;
        if (msg.sideMode) castPrefs.sideMode = msg.sideMode;
        if (typeof msg.customNote === "string") castPrefs.customNote = msg.customNote;
      }
    };
  }

  window.setInterval(() => pushCastState(deps), 2500);

  return { openCastWindow, pushCastState: () => pushCastState(deps) };
}

/** @param {Parameters<typeof initTvCast>[0]} deps */
function pushCastState(deps) {
  if (!ch) return;
  const reframeSel = reframeSelectEl();
  if (reframeSel) {
    castPrefs.reframeId = reframeSel.value || castPrefs.reframeId;
  }

  const pageUrl = deps.getPageUrl();
  const item = deps.getQueueItem();
  const intel = pageUrl ? deps.getIntel(pageUrl) : undefined;
  const { show, headline } = intel
    ? deps.deriveShow(intel)
    : { show: "", headline: "" };

  const meta = [];
  if (intel?.uploader) meta.push(["Channel", String(intel.uploader)]);
  if (intel?.durationLabel) meta.push(["Duration", String(intel.durationLabel)]);
  if (intel?.uploadDate) meta.push(["Date", String(intel.uploadDate)]);
  if (intel?.viewCount != null) meta.push(["Views", String(intel.viewCount)]);
  const cam = intel?.camera;
  if (cam?.width && cam?.height) {
    meta.push([
      "Camera",
      `${cam.width}×${cam.height}${cam.fps ? ` · ${Math.round(cam.fps)} fps` : ""}`,
    ]);
  }

  const capLines = Array.isArray(intel?.captions?.lines)
    ? intel.captions.lines.slice(-32).map((row) => ({
        time: row.time || deps.formatClock(Number(row.startSec) || 0),
        text: row.text || "",
      }))
    : [];

  let sceneTitle = "";
  let sceneEstimate = "";
  let ikHint = "";
  let framing = "";
  if (pageUrl && intel?.scenes?.length) {
    const scenes = deps.enrichScenes(intel.scenes, intel, pageUrl);
    const t = deps.getPreviewTimeSec();
    const idx = Math.max(0, deps.sceneIndexAtTime(scenes, t));
    const sc = scenes[idx] || scenes[0];
    sceneTitle = String(sc.title || "");
    sceneEstimate = [
      sc.cameraEstimate,
      sc.sceneEstimate,
      sc.ikPoseEstimate,
      sc.cinematography?.framing,
    ]
      .filter(Boolean)
      .join(" · ");
    ikHint = String(sc.ikPoseEstimate || "");
    framing = String(sc.cinematography?.framing || "");
  }

  const embed = document.getElementById("ffplay-embed");
  const playback = getPreviewPlaybackState(embed);

  ch.postMessage({
    type: "cast-state",
    state: {
      url: item?.url || pageUrl || "",
      title: item?.title || intel?.title || headline,
      show,
      isLive: Boolean(intel?.isLive),
      viewers: intel?.liveConcurrentViewers ?? null,
      playId: item?.playId,
      filePlayId: item?.filePlayId,
      resolveError: item?.resolveError,
      durationLabel: intel?.durationLabel,
      uploader: intel?.uploader,
      reframeId: castPrefs.reframeId,
      layoutId: castPrefs.layoutId,
      sideMode: castPrefs.sideMode,
      customNote: castPrefs.customNote,
      sceneTitle,
      sceneEstimate,
      ikHint,
      framing,
      captions: capLines,
      meta,
      metrics: deps.getRuntimeLine?.() || "",
      currentTime: playback?.currentTime ?? 0,
      paused: playback?.paused ?? true,
      playbackKind: playback?.kind ?? "none",
      forceRemount: forceNextCastRemount,
    },
  });
  forceNextCastRemount = false;
}
