/**
 * TV cast window — AirPlay-friendly fullscreen stage with social reframe presets.
 */
import {
  REFRAME_PRESETS,
  TV_LAYOUTS,
  TV_CAST_CHANNEL,
  resolveReframePreset,
  applyReframeToElement,
} from "./tv-reframe.js";
import {
  mountPreview,
  classifyUrl,
  normalizeUrl,
} from "./video-ingest.js";

/** @typedef {{
 *   url?: string,
 *   title?: string,
 *   show?: string,
 *   isLive?: boolean,
 *   viewers?: number|null,
 *   playId?: string,
 *   resolveError?: string,
 *   durationLabel?: string,
 *   uploader?: string,
 *   reframeId?: string,
 *   layoutId?: string,
 *   sideMode?: string,
 *   customNote?: string,
 *   sceneTitle?: string,
 *   sceneEstimate?: string,
 *   ikHint?: string,
 *   framing?: string,
 *   captions?: { time?: string, text?: string }[],
 *   meta?: [string, string][],
 *   metrics?: string,
 * }} CastState */

/** @type {CastState} */
let state = {};
/** @type {import('./video-ingest.js').QueueItem | null} */
let queueItem = null;
let previewKey = "";

const ch =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(TV_CAST_CHANNEL)
    : null;

const els = {
  wrap: document.getElementById("tv-viewport-wrap"),
  media: document.getElementById("tv-media"),
  empty: document.getElementById("tv-empty"),
  stage: document.getElementById("tv-stage"),
  reframe: document.getElementById("tv-reframe-preset"),
  layout: document.getElementById("tv-layout"),
  sideMode: document.getElementById("tv-side-mode"),
  live: document.getElementById("tv-live-badge"),
  show: document.getElementById("tv-show"),
  headline: document.getElementById("tv-headline"),
  meta: document.getElementById("tv-meta"),
  captions: document.getElementById("tv-captions"),
  sceneEst: document.getElementById("tv-scene-est"),
  custom: document.getElementById("tv-custom-note"),
  ticker: document.getElementById("tv-ticker"),
};

function fillSelect(sel, entries) {
  if (!(sel instanceof HTMLSelectElement)) return;
  sel.replaceChildren();
  for (const row of Object.values(entries)) {
    const opt = document.createElement("option");
    opt.value = row.id;
    opt.textContent = row.label;
    sel.appendChild(opt);
  }
}

function formatViewers(n) {
  if (!Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function applyReframe() {
  if (!(els.wrap instanceof HTMLElement)) return;
  const preset = resolveReframePreset(state.reframeId || "tv", {
    ikHint: state.ikHint,
    framing: state.framing,
  });
  applyReframeToElement(els.wrap, preset);
}

function paintSide() {
  const mode = state.sideMode || "intel";
  if (els.custom instanceof HTMLTextAreaElement) {
    els.custom.hidden = mode !== "custom";
    if (mode === "custom" && state.customNote != null) {
      els.custom.value = state.customNote;
    }
  }
  if (els.show) els.show.textContent = state.show || "—";
  if (els.headline) {
    els.headline.textContent = state.title || "No feed queued";
  }
  if (els.live instanceof HTMLElement) {
    const live = Boolean(state.isLive);
    els.live.hidden = !live;
    if (live) {
      const v = state.viewers ? ` · ${formatViewers(state.viewers)}` : "";
      els.live.textContent = `LIVE${v}`;
    }
  }
  if (els.meta instanceof HTMLElement) {
    if (mode === "metrics" && state.metrics) {
      els.meta.innerHTML = `<div><dt>Runtime</dt><dd>${escapeHtml(state.metrics)}</dd></div>`;
    } else if (Array.isArray(state.meta) && state.meta.length) {
      els.meta.innerHTML = state.meta
        .map(
          ([k, v]) =>
            `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`,
        )
        .join("");
    } else {
      els.meta.innerHTML = "";
    }
  }
  if (els.captions instanceof HTMLElement) {
    if (mode === "custom" && els.custom instanceof HTMLTextAreaElement) {
      els.captions.hidden = true;
    } else {
      els.captions.hidden = false;
      const lines = Array.isArray(state.captions) ? state.captions : [];
      if (mode === "scene" && state.sceneTitle) {
        els.captions.innerHTML = `<p class="tv-cast-caption-line"><strong>${escapeHtml(state.sceneTitle)}</strong></p>${
          state.sceneEstimate
            ? `<p class="tv-cast-caption-line">${escapeHtml(state.sceneEstimate)}</p>`
            : ""
        }`;
      } else if (lines.length) {
        els.captions.innerHTML = lines
          .slice(-24)
          .map(
            (row) =>
              `<p class="tv-cast-caption-line"><time>${escapeHtml(row.time || "")}</time>${escapeHtml(row.text || "")}</p>`,
          )
          .join("");
      } else {
        els.captions.innerHTML =
          '<p class="tv-cast-caption-line tv-cast-muted">No captions in this segment.</p>';
      }
    }
  }
  if (els.sceneEst instanceof HTMLElement) {
    const showScene = mode === "scene" && state.sceneEstimate;
    els.sceneEst.hidden = !showScene;
    if (showScene) els.sceneEst.textContent = state.sceneEstimate || "";
  }
  const tickerParts = [
    state.show,
    state.title,
    state.isLive ? "LIVE" : state.durationLabel,
    state.uploader,
  ].filter(Boolean);
  if (els.ticker) {
    els.ticker.textContent =
      tickerParts.join(" · ") || "blank TV cast · social reframe presets";
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function syncPreview() {
  if (!(els.media instanceof HTMLElement)) return;
  const url = state.url?.trim();
  if (!url?.startsWith("http")) {
    queueItem = null;
    previewKey = "";
    els.media.innerHTML = "";
    if (els.empty) {
      els.empty.hidden = false;
      els.empty.textContent = "Queue a live URL in the main blank window.";
    }
    return;
  }
  const norm = normalizeUrl(url);
  const kind = classifyUrl(norm);
  const item = {
    id: "tv-cast",
    url: norm,
    title: state.title,
    playId: state.playId,
    resolveError: state.resolveError,
  };
  const key = `${norm}|${item.playId || ""}|${item.resolveError || ""}`;
  if (key === previewKey && els.media.querySelector("video, iframe")) {
    return;
  }
  previewKey = key;
  queueItem = item;
  if (els.empty) els.empty.hidden = true;
  els.media.innerHTML = "";
  const host = document.createElement("div");
  host.id = "tv-embed-host";
  host.className = "tv-embed-host";
  els.media.appendChild(host);
  mountPreview(host, item, null);
}

function applyState(patch) {
  state = { ...state, ...patch };
  if (els.stage instanceof HTMLElement && state.layoutId) {
    els.stage.dataset.layout = state.layoutId;
  }
  if (els.reframe instanceof HTMLSelectElement && state.reframeId) {
    els.reframe.value = state.reframeId;
  }
  if (els.layout instanceof HTMLSelectElement && state.layoutId) {
    els.layout.value = state.layoutId;
  }
  if (els.sideMode instanceof HTMLSelectElement && state.sideMode) {
    els.sideMode.value = state.sideMode;
  }
  applyReframe();
  paintSide();
  syncPreview();
}

function publishLocalPrefs() {
  ch?.postMessage({
    type: "prefs",
    reframeId: state.reframeId,
    layoutId: state.layoutId,
    sideMode: state.sideMode,
    customNote: state.customNote,
  });
}

function initControls() {
  fillSelect(els.reframe, REFRAME_PRESETS);
  fillSelect(els.layout, TV_LAYOUTS);
  if (els.reframe instanceof HTMLSelectElement) {
    els.reframe.value = state.reframeId || "grok";
    els.reframe.addEventListener("change", () => {
      state.reframeId = els.reframe.value;
      applyReframe();
      publishLocalPrefs();
    });
  }
  if (els.layout instanceof HTMLSelectElement) {
    els.layout.value = state.layoutId || "sidecar";
    els.layout.addEventListener("change", () => {
      state.layoutId = els.layout.value;
      if (els.stage) els.stage.dataset.layout = state.layoutId;
      publishLocalPrefs();
    });
  }
  if (els.sideMode instanceof HTMLSelectElement) {
    els.sideMode.addEventListener("change", () => {
      state.sideMode = els.sideMode.value;
      paintSide();
      publishLocalPrefs();
    });
  }
  if (els.custom instanceof HTMLTextAreaElement) {
    els.custom.addEventListener("input", () => {
      state.customNote = els.custom.value;
      paintSide();
      publishLocalPrefs();
    });
  }
  document.getElementById("tv-fullscreen")?.addEventListener("click", async () => {
    const root = document.documentElement;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        document.body.classList.remove("tv-cast-fullscreen");
      } else {
        await root.requestFullscreen();
        document.body.classList.add("tv-cast-fullscreen");
      }
    } catch {
      window.alert(
        "Fullscreen blocked — use the green window fullscreen button, then AirPlay from Control Center.",
      );
    }
  });
}

if (ch) {
  ch.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "cast-state") {
      applyState(msg.state || {});
    }
    if (msg.type === "ping") {
      ch.postMessage({ type: "pong" });
    }
  };
  ch.postMessage({ type: "cast-ready" });
}

applyState({
  reframeId: "grok",
  layoutId: "sidecar",
  sideMode: "intel",
});
initControls();
