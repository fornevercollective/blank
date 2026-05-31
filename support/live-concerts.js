/**
 * Live concert discovery UI — search, time windows, multi-angle queue / multiview.
 */

const MULTIVIEW_KEY = "blank.live.multiview.v1";

/** @type {{ window: string, query: string, events: object[], loading: boolean }} */
let state = {
  window: "now",
  query: "",
  events: [],
  loading: false,
};

/** @type {Set<string>} */
const selectedFeedUrls = new Set();

/**
 * @param {() => void} [onQueue]
 */
export function initLiveConcerts(onQueue) {
  const panel = document.getElementById("live-concerts-panel");
  if (!panel) return;

  const searchInput = document.getElementById("live-concerts-search");
  const searchBtn = document.getElementById("live-concerts-search-btn");
  const statusEl = document.getElementById("live-concerts-status");
  const listEl = document.getElementById("live-concerts-list");
  const multiviewBtn = document.getElementById("live-concerts-multiview");
  const queueBtn = document.getElementById("live-concerts-queue");
  const refreshBtn = document.getElementById("live-concerts-refresh");

  panel.querySelectorAll("[data-live-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = btn.getAttribute("data-live-window");
      if (!w) return;
      state.window = w;
      panel.querySelectorAll("[data-live-window]").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      void discover(statusEl, listEl);
    });
  });

  searchBtn?.addEventListener("click", () => {
    if (searchInput instanceof HTMLInputElement) {
      state.query = searchInput.value.trim();
    }
    void discover(statusEl, listEl);
  });
  searchInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      state.query = searchInput.value.trim();
      void discover(statusEl, listEl);
    }
  });
  refreshBtn?.addEventListener("click", () => void discover(statusEl, listEl));

  queueBtn?.addEventListener("click", () => {
    const urls = [...selectedFeedUrls];
    if (!urls.length) {
      window.alert("Select one or more feeds (checkboxes) to queue.");
      return;
    }
    for (const url of urls) onQueue?.(url);
    selectedFeedUrls.clear();
    paintList(listEl);
  });

  multiviewBtn?.addEventListener("click", () => openMultiview());

  void discover(statusEl, listEl);
}

async function discover(statusEl, listEl) {
  state.loading = true;
  if (statusEl) {
    statusEl.textContent = "Searching YouTube + Twitch for live concerts…";
  }
  if (listEl) listEl.innerHTML = "";
  try {
    const res = await fetch("/api/live/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ window: state.window, query: state.query }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `discover failed (${res.status})`);
    }
    state.events = Array.isArray(data.events) ? data.events : [];
    const errNote = data.errors?.length ? ` · ${data.errors.length} source(s) skipped` : "";
    if (statusEl) {
      statusEl.textContent = `${data.feedCount || 0} feeds · ${state.events.length} events · ${windowLabel(state.window)}${errNote}`;
    }
    paintList(listEl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (statusEl) statusEl.textContent = msg;
    if (listEl) {
      listEl.innerHTML = `<p class="live-concerts-empty">${escapeHtml(msg)}</p>`;
    }
  } finally {
    state.loading = false;
  }
}

function windowLabel(w) {
  if (w === "hour") return "next hour";
  if (w === "today") return "today";
  if (w === "tomorrow") return "tomorrow";
  return "live now";
}

/** @param {HTMLElement | null} listEl */
function paintList(listEl) {
  if (!listEl) return;
  if (!state.events.length) {
    listEl.innerHTML =
      '<p class="live-concerts-empty">No matching live concerts — try another window or search term.</p>';
    return;
  }
  listEl.innerHTML = state.events
    .map((ev) => eventCardHtml(ev))
    .join("");
  listEl.querySelectorAll("[data-feed-url]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener("change", () => {
      const url = input.getAttribute("data-feed-url") || "";
      if (!url) return;
      if (input.checked) selectedFeedUrls.add(url);
      else selectedFeedUrls.delete(url);
    });
  });
  listEl.querySelectorAll("[data-queue-one]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-queue-one");
      if (url && globalThis.blankQueueVideoUrl) {
        globalThis.blankQueueVideoUrl(url);
      }
    });
  });
  listEl.querySelectorAll("[data-multiview-event]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-multiview-event");
      const ev = state.events.find((e) => e.id === id);
      if (ev) openMultiview(ev);
    });
  });
}

/** @param {object} ev */
function eventCardHtml(ev) {
  const feeds = Array.isArray(ev.feeds) ? ev.feeds : [];
  const multi = feeds.length > 1;
  const platforms = [...new Set(feeds.map((f) => f.platform))].join(", ");
  const feedRows = feeds
    .map((f) => {
      const live = f.isLive ? '<span class="live-concerts-live">LIVE</span>' : "";
      const checked = selectedFeedUrls.has(f.url) ? " checked" : "";
      const thumb = f.thumb
        ? `<img src="${escapeHtml(f.thumb)}" alt="" width="64" height="36" loading="lazy" decoding="async" />`
        : '<span class="live-concerts-thumb-ph"></span>';
      return `<li class="live-concerts-feed">
        <label class="live-concerts-feed-label">
          <input type="checkbox" data-feed-url="${escapeHtml(f.url)}"${checked} />
          ${thumb}
          <span class="live-concerts-feed-meta">
            <span class="live-concerts-feed-title">${escapeHtml(f.title)}</span>
            <span class="live-concerts-feed-sub">${escapeHtml(f.platform)} · ${escapeHtml(f.angleLabel || "")} ${live}</span>
          </span>
        </label>
        <button type="button" class="live-concerts-feed-queue" data-queue-one="${escapeHtml(f.url)}">Queue</button>
      </li>`;
    })
    .join("");

  return `<article class="live-concerts-event" data-event-id="${escapeHtml(ev.id)}">
    <header class="live-concerts-event-head">
      <h3 class="live-concerts-event-title">${escapeHtml(ev.name)}</h3>
      <span class="live-concerts-event-badges">
        ${multi ? `<span class="live-concerts-badge">${feeds.length} angles</span>` : ""}
        <span class="live-concerts-badge">${escapeHtml(platforms)}</span>
      </span>
      ${multi ? `<button type="button" class="live-concerts-mv-btn" data-multiview-event="${escapeHtml(ev.id)}">Multi-angle sync</button>` : ""}
    </header>
    <ul class="live-concerts-feeds">${feedRows}</ul>
  </article>`;
}

/** @param {object} [event] */
function openMultiview(event) {
  /** @type {{ eventName: string, feeds: object[], sync: boolean, offsets: Record<string, number> }} */
  let payload;
  if (event && Array.isArray(event.feeds)) {
    payload = {
      eventName: event.name || "Live concert",
      feeds: event.feeds.map((f) => ({
        url: f.url,
        title: f.title,
        platform: f.platform,
        angleLabel: f.angleLabel,
        offsetMs: 0,
      })),
      sync: true,
      offsets: {},
    };
  } else {
    const picked = [];
    for (const ev of state.events) {
      for (const f of ev.feeds || []) {
        if (selectedFeedUrls.has(f.url)) {
          picked.push({
            url: f.url,
            title: f.title,
            platform: f.platform,
            angleLabel: f.angleLabel,
            offsetMs: 0,
          });
        }
      }
    }
    if (picked.length < 1) {
      window.alert("Select feeds or open Multi-angle sync on an event with 2+ streams.");
      return;
    }
    payload = {
      eventName: "Selected feeds",
      feeds: picked,
      sync: true,
      offsets: {},
    };
  }
  sessionStorage.setItem(MULTIVIEW_KEY, JSON.stringify(payload));
  const url = new URL("live-multiview.html", globalThis.location.href).href;
  window.open(url, "blank-live-multiview", "popup=yes,width=1400,height=900");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
