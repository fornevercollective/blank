/**
 * Multi-angle live concert viewer — synced playheads + per-feed offset calibration.
 */
import {
  mountPreview,
  classifyUrl,
  normalizeUrl,
  requestIngestResolve,
} from "./video-ingest.js";

const SESSION_KEY = "blank.live.multiview.v1";

/** @typedef {{ url: string, title?: string, platform?: string, angleLabel?: string, offsetMs?: number, playId?: string, resolveError?: string }} MvFeed */

/** @type {{ eventName: string, feeds: MvFeed[], sync: boolean }} */
let session = { eventName: "Live", feeds: [], sync: true };

/** @type {Map<string, { video: HTMLVideoElement|null, offsetMs: number, hls: import('hls.js').default|null }>} */
const players = new Map();

let masterUrl = "";
let syncing = false;

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.feeds)) {
      session = {
        eventName: String(parsed.eventName || "Live concert"),
        feeds: parsed.feeds,
        sync: parsed.sync !== false,
      };
    }
  } catch {
    /* noop */
  }
}

function saveSession() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      eventName: session.eventName,
      feeds: session.feeds.map((f) => ({
        url: f.url,
        title: f.title,
        platform: f.platform,
        angleLabel: f.angleLabel,
        offsetMs: f.offsetMs ?? 0,
      })),
      sync: session.sync,
    }),
  );
}

/** @param {string} url */
async function resolveFeed(url) {
  const norm = normalizeUrl(url);
  const kind = classifyUrl(norm);
  if (kind === "youtube" || kind === "twitch" || kind === "vimeo") {
    return { url: norm, playId: null, embed: true };
  }
  try {
    const data = await requestIngestResolve(norm, { download: false });
    return { url: norm, playId: data.playId, embed: false };
  } catch (e) {
    return {
      url: norm,
      playId: null,
      embed: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** @param {HTMLElement} host @param {MvFeed} feed @param {{ playId?: string|null, embed?: boolean, error?: string }} resolved */
function mountFeedPlayer(host, feed, resolved) {
  host.innerHTML = "";
  if (resolved.error) {
    host.innerHTML = `<p class="mv-status">${resolved.error}</p>`;
    return;
  }
  const item = {
    id: feed.url,
    url: feed.url,
    title: feed.title,
    playId: resolved.playId || undefined,
    resolveError: undefined,
  };
  const wrap = document.createElement("div");
  wrap.className = "mv-embed-host";
  host.appendChild(wrap);
  mountPreview(wrap, item, null);

  const video = wrap.querySelector("video");
  if (video instanceof HTMLVideoElement) {
    players.set(feed.url, {
      video,
      offsetMs: feed.offsetMs ?? 0,
      hls: null,
    });
    video.addEventListener("timeupdate", () => {
      if (!syncing && feed.url === masterUrl) onMasterTick();
    });
  } else {
    players.set(feed.url, { video: null, offsetMs: feed.offsetMs ?? 0, hls: null });
  }
}

function onMasterTick() {
  if (!document.getElementById("mv-sync")?.checked) return;
  const master = players.get(masterUrl);
  if (!master?.video) return;
  const t = master.video.currentTime;
  syncing = true;
  for (const [url, row] of players.entries()) {
    if (url === masterUrl || !row.video) continue;
    const target = Math.max(0, t + (row.offsetMs - (master.offsetMs || 0)) / 1000);
    if (Math.abs(row.video.currentTime - target) > 0.35) {
      try {
        row.video.currentTime = target;
      } catch {
        /* noop */
      }
    }
  }
  syncing = false;
}

/** @param {HTMLElement} grid */
async function buildGrid(grid) {
  grid.innerHTML = '<p class="mv-empty">Resolving feeds…</p>';
  const resolved = await Promise.all(
    session.feeds.map(async (f) => ({
      feed: f,
      resolved: await resolveFeed(f.url),
    })),
  );

  grid.innerHTML = "";
  const masterSel = document.getElementById("mv-master");
  if (masterSel instanceof HTMLSelectElement) {
    masterSel.replaceChildren();
  }

  for (const { feed, resolved } of resolved) {
    const cell = document.createElement("article");
    cell.className = "mv-cell";
    cell.dataset.url = feed.url;
    const plat = feed.platform || classifyUrl(feed.url);
    cell.innerHTML = `
      <div class="mv-cell-head">
        <span class="mv-cell-platform">${escapeHtml(plat)}</span>
        <h2 class="mv-cell-title">${escapeHtml(feed.angleLabel || feed.title || feed.url)}</h2>
      </div>
      <div class="mv-video-wrap" data-mv-host></div>
      <label class="mv-offset">
        <span>Offset</span>
        <input type="range" min="-8000" max="8000" step="100" value="${feed.offsetMs ?? 0}" data-offset-url="${escapeHtml(feed.url)}" />
        <span class="mv-offset-val" data-offset-label="${escapeHtml(feed.url)}">0 ms</span>
      </label>
      <p class="mv-status">${resolved.embed ? "Embed · sync best-effort" : resolved.playId ? "Proxied HLS" : "—"}</p>
    `;
    grid.appendChild(cell);
    const host = cell.querySelector("[data-mv-host]");
    if (host instanceof HTMLElement) mountFeedPlayer(host, feed, resolved);

    if (masterSel instanceof HTMLSelectElement) {
      const opt = document.createElement("option");
      opt.value = feed.url;
      opt.textContent = `${feed.angleLabel || plat} · ${feed.title?.slice(0, 40) || "feed"}`;
      masterSel.appendChild(opt);
    }
  }

  if (session.feeds[0]?.url) {
    masterUrl = session.feeds[0].url;
    if (masterSel instanceof HTMLSelectElement) masterSel.value = masterUrl;
  }

  grid.querySelectorAll("[data-offset-url]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const url = input.getAttribute("data-offset-url") || "";
    input.addEventListener("input", () => {
      const ms = Number(input.value) || 0;
      const row = players.get(url);
      if (row) row.offsetMs = ms;
      const feed = session.feeds.find((f) => f.url === url);
      if (feed) feed.offsetMs = ms;
      const label = grid.querySelector(`[data-offset-label="${CSS.escape(url)}"]`);
      if (label) label.textContent = `${ms >= 0 ? "+" : ""}${ms} ms`;
      saveSession();
      if (url === masterUrl) onMasterTick();
    });
  });

  updateMasterHighlight();
}

function updateMasterHighlight() {
  document.querySelectorAll(".mv-cell").forEach((cell) => {
    cell.classList.toggle("is-master", cell.dataset.url === masterUrl);
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function init() {
  loadSession();
  const titleEl = document.getElementById("mv-event-title");
  if (titleEl) titleEl.textContent = session.eventName;
  const grid = document.getElementById("mv-grid");
  const syncCb = document.getElementById("mv-sync");
  const masterSel = document.getElementById("mv-master");

  if (!session.feeds.length) {
    if (grid) {
      grid.innerHTML =
        '<p class="mv-empty">No feeds in session — pick Multi-angle sync from Live concerts in blank.</p>';
    }
    return;
  }

  if (syncCb instanceof HTMLInputElement) {
    syncCb.checked = session.sync;
    syncCb.addEventListener("change", () => {
      session.sync = syncCb.checked;
      saveSession();
    });
  }

  masterSel?.addEventListener("change", () => {
    if (masterSel instanceof HTMLSelectElement) {
      masterUrl = masterSel.value;
      updateMasterHighlight();
    }
  });

  document.getElementById("mv-fullscreen")?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        document.body.classList.remove("mv-fullscreen");
      } else {
        await document.documentElement.requestFullscreen();
        document.body.classList.add("mv-fullscreen");
      }
    } catch {
      /* noop */
    }
  });

  document.getElementById("mv-close")?.addEventListener("click", () => window.close());

  if (grid instanceof HTMLElement) void buildGrid(grid);
}

init();
