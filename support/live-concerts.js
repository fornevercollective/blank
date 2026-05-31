/**
 * Live concert discovery UI — search, time windows, multi-angle queue / multiview.
 */
import {
  loadArtistCatalog,
  alphaRailHtml,
  alphaScriptTabsHtml,
  artistsForLetter,
  artistCatalogCount,
  ARTIST_REGIONS,
  autocompleteArtists,
  countArtistsMatchingQuery,
  countArtistsFor,
  formatLetterLabel,
  regionById,
  setActiveLetter,
  getActiveLetter,
  setActiveScript,
  getActiveScript,
  setActiveRegion,
  getActiveRegion,
} from "./live-concerts-artists.js";
import { addWatchPhrases, focusPhraseSearch } from "./phrase-search.js";
import { paintArtistAlbums } from "./live-concerts-albums.js";
import { LIVE_GENRE_TABS, LIVE_FEED_REGION_TABS } from "./live-concerts-genres.mjs";

const MULTIVIEW_KEY = "blank.live.multiview.v1";

/** @type {{ window: string, genre: string, region: string, query: string, events: object[], loading: boolean }} */
let state = {
  window: "now",
  genre: "all",
  region: "all",
  query: "",
  events: [],
  loading: false,
};

/** @type {Set<string>} */
const selectedFeedUrls = new Set();

/** @type {AbortController | null} */
let discoverAbort = null;

let discoverDebounce = 0;

/** @type {string | null} */
let lastDiscoverKey = null;

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
  const regionsEl = document.getElementById("live-concerts-feed-regions");
  const genresEl = document.getElementById("live-concerts-genres");
  const albumsPanel = document.getElementById("live-concerts-albums");
  const albumsScroll = document.getElementById("live-concerts-albums-scroll");
  const albumsHint = document.getElementById("live-concerts-albums-hint");
  const albumsProgress = document.getElementById("live-concerts-albums-progress");
  /** @param {string} name */
  const loadAlbums = (name) => {
    void paintArtistAlbums(name, albumsPanel, albumsScroll, albumsHint, albumsProgress);
  };

  /** @param {boolean} [force] */
  const scheduleDiscover = (force = false) => {
    window.clearTimeout(discoverDebounce);
    discoverDebounce = window.setTimeout(() => void discover(statusEl, listEl, force), 380);
  };

  if (regionsEl) {
    regionsEl.innerHTML = LIVE_FEED_REGION_TABS.map(
      (r) =>
        `<button type="button" class="live-concerts-feed-region${state.region === r.id ? " is-active" : ""}" data-live-region="${r.id}" role="tab" aria-selected="${state.region === r.id ? "true" : "false"}" style="--region-tab-bg:${r.tab.bg};--region-tab-ink:${r.tab.ink};--region-tab-border:${r.tab.border}">${escapeHtml(r.label)}</button>`,
    ).join("");
    regionsEl.querySelectorAll("[data-live-region]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-live-region");
        if (!r) return;
        state.region = r;
        regionsEl.querySelectorAll("[data-live-region]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        scheduleDiscover(true);
      });
    });
  }

  if (genresEl) {
    genresEl.innerHTML = LIVE_GENRE_TABS.map(
      (g) =>
        `<button type="button" class="live-concerts-genre${state.genre === g.id ? " is-active" : ""}" data-live-genre="${g.id}" role="tab" aria-selected="${state.genre === g.id ? "true" : "false"}">${escapeHtml(g.label)}</button>`,
    ).join("");
    genresEl.querySelectorAll("[data-live-genre]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.getAttribute("data-live-genre");
        if (!g) return;
        state.genre = g;
        genresEl.querySelectorAll("[data-live-genre]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        scheduleDiscover(true);
      });
    });
  }

  panel.querySelectorAll("[data-live-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = btn.getAttribute("data-live-window");
      if (!w) return;
      state.window = w;
      panel.querySelectorAll("[data-live-window]").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      scheduleDiscover(true);
    });
  });

  searchBtn?.addEventListener("click", () => {
    if (searchInput instanceof HTMLInputElement) {
      state.query = searchInput.value.trim();
      if (state.query) loadAlbums(state.query);
    }
    scheduleDiscover(true);
  });
  searchInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      state.query = searchInput.value.trim();
      if (state.query) loadAlbums(state.query);
      scheduleDiscover(true);
    }
  });
  refreshBtn?.addEventListener("click", () => scheduleDiscover(true));

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

  initArtistAlpha(panel, searchInput, statusEl, loadAlbums, scheduleDiscover);
  initLyricBridge(panel);

  if (panel instanceof HTMLDetailsElement) {
    panel.addEventListener("toggle", () => {
      if (panel.open) scheduleDiscover(false);
    });
    if (panel.open) scheduleDiscover(false);
  } else {
    scheduleDiscover(false);
  }
}

/**
 * @param {HTMLElement} panel
 * @param {HTMLInputElement | null} searchInput
 * @param {HTMLElement | null} statusEl
 * @param {(name: string) => void} [onArtistChosen]
 * @param {(force?: boolean) => void} [scheduleDiscover]
 */
function initArtistAlpha(panel, searchInput, statusEl, onArtistChosen, scheduleDiscover) {
  const alphaNav = document.getElementById("live-concerts-alpha-inline");
  const picksEl = document.getElementById("live-concerts-artist-picks");
  const datalist = document.getElementById("live-concerts-artist-datalist");
  const acList = document.getElementById("live-concerts-ac-list");

  paintAlphaRail(alphaNav);

  void loadArtistCatalog()
    .then(() => {
      paintAlphaRail(alphaNav);
      updateAlphaCount(alphaNav, getActiveLetter());
      fillDatalist(datalist);
      if (searchInput) bindAutocomplete(searchInput, acList, statusEl, onArtistChosen);
    })
    .catch((e) => {
      if (statusEl) {
        statusEl.textContent = `Artist catalog: ${e instanceof Error ? e.message : String(e)}`;
      }
    });

  /**
   * @param {HTMLElement} el
   * @param {string} primary
   * @param {string} suffix
   * @param {string} title
   */
  function paintArtistCountBadge(el, primary, suffix, title) {
    el.title = title;
    el.innerHTML = `<span class="live-concerts-alpha-count-num">${escapeHtml(primary)}</span><span class="live-concerts-alpha-count-suffix">${escapeHtml(suffix)}</span>`;
  }

  /** @param {HTMLElement | null} nav @param {string | null} letter */
  function updateAlphaCount(nav, letter) {
    if (!nav) return;
    let countEl = nav.querySelector("#live-concerts-alpha-count, .live-concerts-alpha-count");
    if (!(countEl instanceof HTMLElement)) {
      countEl = document.createElement("span");
      countEl.className = "live-concerts-alpha-count";
      countEl.id = "live-concerts-alpha-count";
      countEl.setAttribute("aria-live", "polite");
      nav.appendChild(countEl);
    }
    const total = artistCatalogCount();
    if (!total) {
      countEl.textContent = "…";
      countEl.title = "Loading artist catalog";
      return;
    }

    const searchQ = searchInput instanceof HTMLInputElement ? searchInput.value.trim() : "";
    if (searchQ) {
      const matches = countArtistsMatchingQuery(searchQ);
      const scope = letter
        ? formatLetterLabel(letter, getActiveScript())
        : getActiveRegion() !== "all"
          ? regionById(getActiveRegion()).label
          : "catalog";
      paintArtistCountBadge(
        countEl,
        String(matches),
        "artists",
        `${matches} artist${matches === 1 ? "" : "s"} match “${searchQ}” in ${scope} (${total} in catalog)`,
      );
      return;
    }

    if (letter) {
      const n = countArtistsFor(letter, getActiveRegion());
      const letterTotal = countArtistsFor(letter, "all");
      const label = formatLetterLabel(letter, getActiveScript());
      const reg = getActiveRegion();
      const regLabel = reg === "all" ? "" : ` · ${regionById(reg).label}`;
      const primary = reg === "all" ? String(letterTotal) : String(n);
      const suffix = reg === "all" ? `/ ${total} artists` : `/ ${letterTotal} artists`;
      paintArtistCountBadge(
        countEl,
        primary,
        suffix,
        `${n} artists · ${label}${regLabel} (${letterTotal} in letter, ${total} total)`,
      );
    } else {
      paintArtistCountBadge(countEl, String(total), "artists", `${total} artists in catalog`);
    }
  }

  /** @param {HTMLElement | null} nav */
  function paintAlphaRail(nav) {
    if (!nav) return;
    nav.innerHTML = `<div class="live-concerts-alpha-scripts" role="tablist" aria-label="Alphabet language">${alphaScriptTabsHtml()}</div><div class="live-concerts-alpha-letters" role="toolbar" aria-label="Filter artists by letter">${alphaRailHtml()}<span class="live-concerts-alpha-count" id="live-concerts-alpha-count" aria-live="polite">…</span></div>`;
    updateAlphaCount(nav, getActiveLetter());
    nav.querySelectorAll("[data-alpha-script]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const scriptId = btn.getAttribute("data-alpha-script");
        if (!scriptId) return;
        setActiveScript(scriptId);
        paintAlphaRail(nav);
        paintArtistPicks(picksEl, null);
      });
    });
    nav.querySelectorAll("[data-alpha]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-alpha");
        const letter = key === "__all__" ? null : key;
        setActiveLetter(letter);
        nav.querySelectorAll("[data-alpha]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
        updateAlphaCount(nav, letter);
        paintArtistPicks(picksEl, letter);
      });
    });
  }

  /** @param {HTMLElement | null} el @param {string | null} letter */
  function paintArtistPicks(el, letter) {
    if (!el) return;
    if (!letter) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const rows = artistsForLetter(letter);
    const label = formatLetterLabel(letter, getActiveScript());
    const region = getActiveRegion();
    const regionRow = regionTabsHtml(region);
    const letterTotal = countArtistsFor(letter, "all");
    const regLabel = regionById(region).label;
    const countNote =
      region === "all"
        ? `${rows.length} artists`
        : `${rows.length} · ${regLabel} (${letterTotal} in ${label})`;

    el.hidden = false;
    el.innerHTML = `${regionRow}
      <p class="live-concerts-picks-label">${label} · ${countNote} — click to search live</p>
      <div class="live-concerts-picks-scroll">${rows.length ? rows.map((a) => artistPickHtml(a)).join("") : `<span class="live-concerts-picks-empty">No artists in ${regLabel} for ${label}</span>`}</div>`;

    el.querySelectorAll("[data-live-region]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-live-region");
        if (!r) return;
        setActiveRegion(r);
        el.querySelectorAll("[data-live-region]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        updateAlphaCount(alphaNav, letter);
        paintArtistPicks(el, letter);
      });
    });

    el.querySelectorAll("[data-artist]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-artist") || "";
        if (searchInput) searchInput.value = name;
        updateAlphaCount(alphaNav, letter);
        state.query = name;
        onArtistChosen?.(name);
        scheduleDiscover?.(true);
      });
    });
  }

  /** @param {string} active */
  function regionTabsHtml(active) {
    return `<div class="live-concerts-regions" role="tablist" aria-label="Artist region">${ARTIST_REGIONS.map((r) => {
      const on = active === r.id;
      return `<button type="button" class="live-concerts-region${on ? " is-active" : ""}" data-live-region="${r.id}" role="tab" aria-selected="${on ? "true" : "false"}" style="--region-tab-bg:${r.tab.bg};--region-tab-ink:${r.tab.ink};--region-tab-border:${r.tab.border}">${escapeHtml(r.label)}</button>`;
    }).join("")}</div>`;
  }

  /** @param {{ name: string, region?: string }} a */
  function artistPickHtml(a) {
    const r = regionById(a.region || "us");
    return `<button type="button" class="live-concerts-pick" data-artist="${escapeHtml(a.name)}" data-region="${escapeHtml(a.region || "us")}" style="--pick-bg:${r.pick.bg};--pick-border:${r.pick.border};--pick-ink:${r.pick.ink}" title="${escapeHtml(r.label)}">${escapeHtml(a.name)}</button>`;
  }

  /** @param {HTMLDataListElement | null} list */
  function fillDatalist(list) {
    if (!(list instanceof HTMLDataListElement)) return;
    list.innerHTML = artistsForLetter(null)
      .map((a) => `<option value="${escapeHtml(a.name)}"></option>`)
      .join("");
  }

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement | null} acList
   * @param {HTMLElement | null} statusEl
   * @param {(name: string) => void} [onArtistChosen]
   */
  function bindAutocomplete(input, acList, statusEl, onArtistChosen) {
    let debounce = 0;
    const updateAc = () => {
      if (!(acList instanceof HTMLElement)) return;
      const q = input.value.trim();
      const hits = autocompleteArtists(q, 14);
      if (!q || !hits.length) {
        acList.hidden = true;
        acList.innerHTML = "";
        input.setAttribute("aria-expanded", "false");
        return;
      }
      acList.hidden = false;
      input.setAttribute("aria-expanded", "true");
      acList.innerHTML = hits
        .map(
          (a, i) =>
            `<li role="option" id="live-ac-${i}" data-artist="${escapeHtml(a.name)}">${escapeHtml(a.name)}</li>`,
        )
        .join("");
      acList.querySelectorAll("[data-artist]").forEach((row) => {
        row.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const name = row.getAttribute("data-artist") || "";
          input.value = name;
          updateAlphaCount(alphaNav, getActiveLetter());
          state.query = name;
          acList.hidden = true;
          onArtistChosen?.(name);
          scheduleDiscover(true);
        });
      });
    };
    input.addEventListener("input", () => {
      updateAlphaCount(alphaNav, getActiveLetter());
      window.clearTimeout(debounce);
      debounce = window.setTimeout(updateAc, 120);
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (acList) acList.hidden = true;
      }, 150);
    });
  }
}

/** @param {HTMLElement} panel */
function initLyricBridge(panel) {
  const lyricInput = document.getElementById("live-concerts-lyric");
  const searchBtn = document.getElementById("live-concerts-lyric-search");
  const watchBtn = document.getElementById("live-concerts-lyric-watch");
  const syncBtn = document.getElementById("live-concerts-lyric-sync");

  const getLyric = () =>
    lyricInput instanceof HTMLInputElement ? lyricInput.value.trim() : "";

  searchBtn?.addEventListener("click", () => {
    const q = getLyric();
    if (!q) return;
    focusPhraseSearch(q);
  });

  watchBtn?.addEventListener("click", () => {
    const q = getLyric();
    if (!q) return;
    addWatchPhrases([q]);
    const watchSection = panel.closest(".app")?.querySelector(".feed-phrase-watch");
    if (watchSection instanceof HTMLDetailsElement) {
      watchSection.open = true;
      watchSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    focusPhraseSearch(q);
  });

  syncBtn?.addEventListener("click", () => {
    const q = getLyric();
    if (!q) return;
    focusPhraseSearch(q);
    addWatchPhrases([q]);
  });

  lyricInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      const q = getLyric();
      if (q) focusPhraseSearch(q);
    }
  });
}

/**
 * @param {HTMLElement | null} statusEl
 * @param {HTMLElement | null} listEl
 * @param {boolean} [force]
 */
async function discover(statusEl, listEl, force = false) {
  const key = `${state.window}|${state.genre}|${state.region}|${state.query}`;
  if (!force && state.loading && key === lastDiscoverKey) return;
  lastDiscoverKey = key;

  const main = document.getElementById("main-scroll");
  const scrollTop = main instanceof HTMLElement ? main.scrollTop : 0;

  discoverAbort?.abort();
  discoverAbort = new AbortController();
  const { signal } = discoverAbort;

  state.loading = true;
  if (statusEl) {
    statusEl.textContent = "Searching YouTube + Twitch for live concerts…";
  }
  if (listEl && !listEl.querySelector(".live-concerts-event")) {
    listEl.innerHTML =
      '<p class="live-concerts-empty live-concerts-loading">Discovering live feeds…</p>';
  } else if (listEl) {
    listEl.setAttribute("aria-busy", "true");
  }

  try {
    const res = await fetch("/api/live/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        window: state.window,
        genre: state.genre,
        region: state.region,
        query: state.query,
      }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `discover failed (${res.status})`);
    }
    state.events = Array.isArray(data.events) ? data.events : [];
    const errNote = data.errors?.length ? ` · ${data.errors.length} source(s) skipped` : "";
    if (statusEl) {
      const genreLabel =
        LIVE_GENRE_TABS.find((g) => g.id === state.genre)?.label || state.genre;
      const regionLabel =
        LIVE_FEED_REGION_TABS.find((r) => r.id === state.region)?.label || state.region;
      statusEl.textContent = `${data.feedCount || 0} feeds · ${state.events.length} events · ${regionLabel} · ${genreLabel} · ${windowLabel(state.window)}${errNote}`;
    }
    paintList(listEl);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return;
    const msg = e instanceof Error ? e.message : String(e);
    if (statusEl) statusEl.textContent = msg;
    if (listEl) {
      listEl.innerHTML = `<p class="live-concerts-empty">${escapeHtml(msg)}</p>`;
    }
  } finally {
    state.loading = false;
    listEl?.removeAttribute("aria-busy");
    if (main instanceof HTMLElement) main.scrollTop = scrollTop;
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
      '<p class="live-concerts-empty">No matching live concerts — try another genre, window, or search term.</p>';
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
