/**
 * Collaborative thread: prompts in header + drawer; cards below.
 * Video ingest: queue, embeds, yt-dlp/mustream commands (video-ingest-hub pattern).
 */

import {
  normalizeUrl,
  pickWatchUrl,
  classifyUrl,
  isIngestUrl,
  ingestMetaFromUrl,
  pasteClipboardWatchUrl,
  displayTitleForUrl,
  shouldAutoResolve,
  requestIngestResolve,
  requestIngestDownload,
  refreshIngestApiCheck,
  getIngestApiOk,
  renderIngestChecklist,
  renderIngestActions,
  buildIngestChecklist,
  commandsFor,
  cameraPlaybackOptions,
  feedPlaybackOptions,
  adFreePlaybackCommands,
  controlsPlaybackSections,
  MACOS_CAMERA_FFPLAY,
  kindLabel,
  readQueue,
  writeQueue,
  writeActiveId,
  resolveActiveItem,
  readPaths,
  persistPaths,
  fetchPresets,
  copyText,
  escapeHtml,
  mountPreview,
  setPreviewHint,
  onRailPlayback,
  onPreviewStreamRecovery,
  previewThumbUrl,
  readJson,
  PATH_KEY,
} from "./video-ingest.js";
import {
  feedIntelSlotKind,
  refreshFeedIntel,
  deriveShowFromIntel,
  fillIntelSlotsUnavailable,
} from "./feed-intel.js";
import {
  initPhraseSearch,
  updatePhraseSearchIntel,
  refreshPhraseSearch,
} from "./phrase-search.js";
import {
  readQualitySettings,
  persistQualitySettings,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  SNAP_QUALITIES,
  CODE_QUALITIES,
  DOWNLOAD_QUALITIES,
} from "./ingest-settings.js";

function initQualitySettings() {
  const v = document.getElementById("quality-video");
  const a = document.getElementById("quality-audio");
  const s = document.getElementById("quality-snap");
  const c = document.getElementById("quality-code");
  const d = document.getElementById("quality-download");
  if (!(v instanceof HTMLElement) || !(d instanceof HTMLElement)) return;

  /** @type {Record<string, string>} */
  const chosen = { ...readQualitySettings() };

  const markSelected = (list, value) => {
    list.querySelectorAll(".header-quality-option").forEach((btn) => {
      const on = btn instanceof HTMLButtonElement && btn.dataset.value === value;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    list.dataset.value = value;
  };

  /** @param {HTMLElement} list @param {{ id: string, label: string }[]} opts @param {string} val */
  const fillList = (list, opts, val) => {
    const valid = opts.some((o) => o.id === val) ? val : opts[0]?.id;
    if (!valid) return;
    list.replaceChildren();
    for (const o of opts) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "header-quality-option";
      btn.role = "option";
      btn.dataset.value = o.id;
      btn.textContent = o.label;
      btn.addEventListener("click", () => {
        chosen[list.id.replace("quality-", "")] = o.id;
        markSelected(list, o.id);
        persistQualitySettings({
          video: chosen.video,
          audio: chosen.audio,
          snap: chosen.snap,
          code: chosen.code,
          download: chosen.download,
        });
        list.closest("details.header-quality-chip")?.removeAttribute("open");
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
    markSelected(list, valid);
    chosen[list.id.replace("quality-", "")] = valid;
  };

  fillList(v, VIDEO_FORMATS, chosen.video);
  if (a) fillList(a, AUDIO_FORMATS, chosen.audio);
  if (s) fillList(s, SNAP_QUALITIES, chosen.snap);
  if (c) fillList(c, CODE_QUALITIES, chosen.code);
  fillList(d, DOWNLOAD_QUALITIES, chosen.download);
  persistQualitySettings(chosen);

  const bar = document.getElementById("header-quality-bar");
  const chips = bar?.querySelectorAll("details.header-quality-chip") ?? [];
  chips.forEach((det) => {
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      chips.forEach((other) => {
        if (other !== det) other.removeAttribute("open");
      });
    });
  });

  if (!bar?.dataset.qualityDismissBound) {
    bar.dataset.qualityDismissBound = "1";
    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Node) || bar.contains(e.target)) return;
      chips.forEach((det) => det.removeAttribute("open"));
    });
  }
}

const STAGGER_MS = 480;
const CAMERA_CMD = MACOS_CAMERA_FFPLAY;
const STORAGE_KEY = "blank.collab.live.v1";

/** Fallback when thread.json cannot be fetched (offline or file missing) */
const DEFAULT_THREAD = [
  {
    id: "core-0",
    live: false,
    prompt:
      "Map the information architecture: header with message-driven prompts, left drawer, and a feed of deliverables.",
    title: "IA + component outline",
    workLabel: "Finished work",
    bodyHtml: `
      <p><strong>Layout:</strong> sticky header (menu tab + prompt strip), full-height scroll region for cards.</p>
      <p><strong>Drawer:</strong> lists the same prompts as full text; choosing one scrolls the matching deliverable into view.</p>
      <p><strong>Feed:</strong> cards render in order; each card shows a numbered timestamp and a collapsible body for the completed artifact.</p>
    `,
  },
  {
    id: "core-1",
    live: false,
    prompt:
      "Use plain HTML/CSS/JS only: collapsible sections with accessible controls, sequential reveal, reduced-motion fallback.",
    title: "Implementation constraints",
    workLabel: "Deliverable",
    bodyHtml: `
      <p>Each slab is a <code>&lt;details&gt;</code> row; the summary bar toggles the finished work underneath.</p>
      <ul>
        <li>Sequential load uses timeouts; disabled when <code>prefers-reduced-motion: reduce</code>.</li>
        <li>Drawer uses a push layout (main surface slides); Escape closes.</li>
      </ul>
    `,
  },
  {
    id: "core-2",
    live: false,
    prompt:
      "Visually separate 'conversation intent' (prompts in the menu) from 'shipped output' (cards). Timestamps must read as #n · time.",
    title: "UX split: prompts vs shipped work",
    workLabel: "Outcome",
    bodyHtml: `
      <p>Prompts stay compact in the header strip so intent stays visible while you review work product below.</p>
      <p>Each finished block is a card with a top-right stamp <strong>#01 · …</strong> for scanability.</p>
    `,
  },
  {
    id: "core-3",
    live: false,
    prompt: "Wire sequential loading so later cards appear after earlier ones, simulating async handoffs.",
    title: "Staggered feed",
    workLabel: "Behavior",
    bodyHtml: `
      <p>Cards start hidden, then gain <code>.card--visible</code> on a staggered timer so the feed reads like progressive completion.</p>
    `,
  },
];

/** @typedef {{ id: string, prompt: string, title: string, bodyHtml: string, workLabel?: string, live?: boolean }} ThreadItem */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatStamp(seq, baseDate) {
  const t = new Date(baseDate.getTime() + (seq - 1) * 3700);
  const ts = t.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return { n: pad2(seq), ts };
}

/** @param {unknown} raw @returns {ThreadItem} */
function normalizeItem(raw, idx) {
  const o = raw && typeof raw === "object" ? raw : {};
  const id =
    typeof o.id === "string" && o.id
      ? o.id
      : `core-${idx}`;
  return {
    id,
    prompt: typeof o.prompt === "string" ? o.prompt : "",
    title: typeof o.title === "string" ? o.title : "",
    bodyHtml: typeof o.bodyHtml === "string" ? o.bodyHtml.trim() : "",
    workLabel: typeof o.workLabel === "string" ? o.workLabel : undefined,
    live: Boolean(o.live),
  };
}

/** @param {unknown[]} arr @returns {ThreadItem[]} */
function normalizeItems(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item, i) => normalizeItem(item, i));
}

async function loadRemoteThread() {
  try {
    const url = `thread.json?${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const raw = data.items ?? data;
    const items = normalizeItems(Array.isArray(raw) ? raw : []);
    if (items.length === 0) throw new Error("empty");
    return items;
  } catch {
    return normalizeItems(DEFAULT_THREAD);
  }
}

function readStoredState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return { liveItems: [], activeIndex: 0 };
    const p = JSON.parse(s);
    const liveItems = normalizeItems(Array.isArray(p.liveItems) ? p.liveItems : []).filter((x) => x.live);
    const activeIndex =
      typeof p.activeIndex === "number" && Number.isFinite(p.activeIndex) ? p.activeIndex : 0;
    return { liveItems, activeIndex };
  } catch {
    return { liveItems: [], activeIndex: 0 };
  }
}

/** @param {ThreadItem[]} merged @param {number} activeIndex */
function persistMenuState(merged, activeIndex) {
  try {
    const liveItems = merged.filter((x) => x.live);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        liveItems,
        activeIndex: Math.min(activeIndex, Math.max(0, merged.length - 1)),
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* quota */
  }
}

/** Merge file-backed thread with persisted live-only rows (same id = file wins on refresh). */
function mergeThreads(remote, liveItems) {
  const remoteIds = new Set(remote.map((x) => x.id));
  const extras = liveItems.filter((x) => x.id && !remoteIds.has(x.id));
  return [...remote, ...extras];
}

async function loadThread() {
  const remote = await loadRemoteThread();
  const { liveItems, activeIndex } = readStoredState();
  const merged = mergeThreads(remote, liveItems);
  const idx = merged.length ? Math.min(Math.max(activeIndex, 0), merged.length - 1) : 0;
  return { merged, activeIndex: idx };
}

function scrollToCard(index) {
  const el = document.querySelector(`[data-card-index="${index}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.classList.add("card--highlight");
  setTimeout(() => el.classList.remove("card--highlight"), 1200);
}

function setActiveNav(index) {
  document.querySelectorAll(".header-prompt-chip").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === index);
  });
}

/**
 * Append a live-only message (survives refresh). Reloads the page.
 * @type {(entry: Partial<ThreadItem> & { prompt: string, title: string, bodyHtml: string }) => void}
 */
function addLiveMessage(entry) {
  const item = normalizeItem(
    {
      ...entry,
      id: entry.id && String(entry.id).length ? String(entry.id) : `live-${Date.now()}`,
      live: true,
    },
    0,
  );
  const prev = readStoredState();
  const nextLive = [...prev.liveItems.filter((x) => x.id !== item.id), item];
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        liveItems: nextLive,
        activeIndex: Number.MAX_SAFE_INTEGER,
        savedAt: Date.now(),
      }),
    );
  } catch {
    return;
  }
  globalThis.location?.reload();
}

globalThis.blankAddLiveMessage = addLiveMessage;

let closeDrawerFn = () => {};
let drawerControlsBound = false;
/** @type {ThreadItem[]} */
let currentThread = [];
let headerPromptBound = false;
let headerPromptScrollBound = false;
let intelPullTimer = 0;
let intelSyncTimer = 0;
let lastIntelSyncUrl = "";
/** Cooldown after preview failure so we do not resolve→play→fail in a loop. */
let previewRecoveryUntil = 0;

function getWatchUrlForIntel() {
  const active = resolveActiveItem(readQueue());
  if (active?.url) return normalizeUrl(active.url);
  const input = document.getElementById("header-prompt-input");
  if (input instanceof HTMLInputElement) {
    const v = input.value.trim();
    if (v && isIngestUrl(v)) return ingestMetaFromUrl(v).url;
  }
  return null;
}

/** @param {string} pageUrl @param {Partial<import('./video-ingest.js').QueueItem>} patch */
function patchQueueByUrl(pageUrl, patch) {
  const norm = normalizeUrl(pageUrl);
  const next = readQueue().map((x) => (normalizeUrl(x.url) === norm ? { ...x, ...patch } : x));
  writeQueue(next);
  return next;
}

/**
 * Automation hook: ?url= or ?video= or ?prompt= (http URL) queues + pulls intel on load.
 * @param {ReturnType<typeof initVideoIngest>|null} ingest
 */
function applyAutomationFromLocation(ingest) {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const raw = (params.get("url") || params.get("video") || params.get("prompt") || "").trim();
    if (!raw || !isIngestUrl(raw)) return false;
    const meta = ingestMetaFromUrl(raw);
    const input = document.getElementById("header-prompt-input");
    if (input instanceof HTMLInputElement) input.value = meta.url;
    if (ingest) {
      ingest.queueUrl(meta.url, {
        title: meta.title,
        notesHtml: meta.notesHtml,
        autoResolve: true,
      });
    } else {
      syncFeedIntelFromQueue();
    }
    const u = new URL(globalThis.location.href);
    for (const k of ["url", "video", "prompt"]) u.searchParams.delete(k);
    globalThis.history.replaceState({}, "", u.pathname + u.search + u.hash);
    return true;
  } catch {
    return false;
  }
}

function headerPromptsScrollEl() {
  return document.getElementById("header-prompts-scroll");
}

function scrollHeaderPrompts(direction) {
  const scroll = headerPromptsScrollEl();
  if (!scroll) return;
  const step = Math.max(140, Math.floor(scroll.clientWidth * 0.72));
  scroll.scrollBy({ left: direction * step, behavior: "smooth" });
}

function updateHeaderPromptScrollButtons() {
  const scroll = headerPromptsScrollEl();
  const leftBtn = document.getElementById("header-prompts-scroll-left");
  const rightBtn = document.getElementById("header-prompts-scroll-right");
  if (!scroll || !leftBtn || !rightBtn) return;
  const maxScroll = scroll.scrollWidth - scroll.clientWidth;
  const atStart = scroll.scrollLeft <= 1;
  const atEnd = maxScroll <= 1 || scroll.scrollLeft >= maxScroll - 1;
  leftBtn.disabled = atStart;
  rightBtn.disabled = atEnd;
}

/** @param {{ subject?: string, detail?: string, timeLabel?: string, scrubbing?: boolean, thumbSrc?: string | null, thumbDataUrl?: string | null }} patch */
function updateHeaderPromptsMeta(patch = {}) {
  const snapImg = document.getElementById("header-prompts-snap-img");
  const timeEl = document.getElementById("header-prompts-time");
  const subjectEl = document.getElementById("header-prompts-subject");
  if (!(snapImg instanceof HTMLImageElement) || !timeEl || !subjectEl) return;

  if ("thumbDataUrl" in patch && patch.thumbDataUrl) {
    snapImg.onerror = () => {
      snapImg.hidden = true;
      snapImg.removeAttribute("src");
    };
    snapImg.src = patch.thumbDataUrl;
    snapImg.hidden = false;
  } else if ("thumbSrc" in patch) {
    if (patch.thumbSrc) {
      snapImg.onerror = () => {
        snapImg.hidden = true;
        snapImg.removeAttribute("src");
      };
      snapImg.src = patch.thumbSrc;
      snapImg.hidden = false;
    } else {
      snapImg.hidden = true;
      snapImg.removeAttribute("src");
    }
  }

  if ("timeLabel" in patch && patch.timeLabel != null) {
    timeEl.textContent = patch.timeLabel;
    timeEl.classList.toggle("is-scrubbing", Boolean(patch.scrubbing));
  }

  if ("subject" in patch || "detail" in patch) {
    const show = patch.subject ?? "";
    const headline = patch.detail ?? "";
    subjectEl.textContent = headline ? `${show} — ${headline}` : show || "Queue a video to preview";
  }
}

/** @param {import('./video-ingest.js').QueueItem | null | undefined} item */
function syncHeaderPromptsMetaFromQueue(item) {
  if (!item?.url) {
    updateHeaderPromptsMeta({
      subject: "",
      detail: "",
      timeLabel: "—",
      scrubbing: false,
      thumbSrc: null,
    });
    return;
  }
  const norm = normalizeUrl(item.url);
  const kind = classifyUrl(norm);
  const title = String(item.title || displayTitleForUrl(norm, kind)).trim();
  const parts = title.split(/\s*\|\s*/);
  const show = parts.length >= 2 ? parts[parts.length - 1].trim() : title;
  const headline = parts.length >= 2 ? parts.slice(0, -1).join(" | ").trim() : "";
  updateHeaderPromptsMeta({
    subject: show,
    detail: headline,
    timeLabel: "0:00",
    scrubbing: false,
    thumbSrc: previewThumbUrl(norm, kind),
  });
}

/** @param {object | null | undefined} intel */
function syncHeaderPromptsMetaFromIntel(intel) {
  if (!intel) return;
  const { show, headline } = deriveShowFromIntel(intel);
  const pageUrl = String(intel.webpageUrl || "").trim();
  let thumbSrc = intel.thumb ? String(intel.thumb) : null;
  if (!thumbSrc && pageUrl) {
    const norm = normalizeUrl(pageUrl);
    thumbSrc = previewThumbUrl(norm, classifyUrl(norm));
  }
  const timeLabel = intel.durationLabel ? `0:00 · ${intel.durationLabel}` : "0:00";
  updateHeaderPromptsMeta({
    subject: show,
    detail: headline,
    thumbSrc,
    timeLabel,
    scrubbing: false,
  });
  requestAnimationFrame(updateHeaderPromptScrollButtons);
}

function initHeaderPromptsMeta() {
  onRailPlayback((ev) => {
    if (ev.type === "scrub") {
      updateHeaderPromptsMeta({
        timeLabel: ev.active ? ev.label : "0:00",
        scrubbing: ev.active,
      });
      return;
    }
    if (ev.type === "snapshot") {
      updateHeaderPromptsMeta({ thumbDataUrl: ev.dataUrl });
      return;
    }
    if (ev.type === "reset") {
      const active = resolveActiveItem(readQueue());
      syncHeaderPromptsMetaFromQueue(active);
    }
  });
}

function initHeaderPromptScroll() {
  if (headerPromptScrollBound) return;
  headerPromptScrollBound = true;
  const scroll = headerPromptsScrollEl();
  const leftBtn = document.getElementById("header-prompts-scroll-left");
  const rightBtn = document.getElementById("header-prompts-scroll-right");
  if (!scroll || !leftBtn || !rightBtn) return;

  leftBtn.addEventListener("click", () => scrollHeaderPrompts(-1));
  rightBtn.addEventListener("click", () => scrollHeaderPrompts(1));
  scroll.addEventListener("scroll", updateHeaderPromptScrollButtons, { passive: true });
  window.addEventListener("resize", updateHeaderPromptScrollButtons);
  updateHeaderPromptScrollButtons();
}

function bindDrawerControls() {
  if (drawerControlsBound) return;
  drawerControlsBound = true;
  const openBtn = document.getElementById("open-drawer");
  const closeBtn = document.getElementById("close-drawer");
  if (!openBtn || !closeBtn) return;

  function openDrawer() {
    document.body.classList.add("drawer-open");
    syncDrawerAria(true);
    closeBtn.focus();
  }

  closeDrawerFn = () => {
    document.body.classList.remove("drawer-open");
    syncDrawerAria(false);
  };

  function syncDrawerAria(open) {
    openBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  openBtn.addEventListener("click", () => {
    if (document.body.classList.contains("drawer-open")) {
      closeDrawerFn();
    } else {
      openDrawer();
    }
  });
  closeBtn.addEventListener("click", closeDrawerFn);

  document.addEventListener("keydown", (e) => {
    const ff = document.getElementById("ffplay-popout");
    if (e.key === "Escape" && ff && !ff.hidden) return;
    if (e.key === "Escape" && document.activeElement?.id === "header-prompt-input") return;
    if (e.key === "Escape" && document.body.classList.contains("drawer-open")) {
      e.preventDefault();
      closeDrawerFn();
    }
  });
}

/** @param {ThreadItem[]} thread @param {number} initialActiveIndex */
function buildUi(thread, initialActiveIndex) {
  const headerPrompts = document.getElementById("header-prompts");
  const drawerPrompts = document.getElementById("drawer-prompts");
  const feed = document.getElementById("feed");
  if (!headerPrompts || !drawerPrompts || !feed) return;

  headerPrompts.querySelectorAll(".header-prompt-chip").forEach((c) => c.remove());
  drawerPrompts.replaceChildren();
  feed.querySelectorAll(".card").forEach((c) => c.remove());

  bindDrawerControls();
  currentThread = thread;

  const baseTime = new Date();

  function saveActive(i) {
    persistMenuState(thread, i);
  }

  thread.forEach((item, i) => {
    const stamp = formatStamp(i + 1, baseTime);

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "header-prompt-chip";
    chip.dataset.index = String(i);
    chip.innerHTML = `<span class="chip-idx">#${pad2(i + 1)}</span>${escapeHtml(truncate(item.prompt, 96))}`;
    chip.addEventListener("click", () => {
      setActiveNav(i);
      saveActive(i);
      scrollToCard(i);
    });
    headerPrompts.appendChild(chip);

    const dp = document.createElement("button");
    dp.type = "button";
    dp.className = "drawer-prompt";
    dp.dataset.index = String(i);
    dp.innerHTML = `
      <div class="dp-idx">Message #${pad2(i + 1)}</div>
      <div class="dp-text">${escapeHtml(item.prompt)}</div>
    `;
    dp.addEventListener("click", () => {
      setActiveNav(i);
      saveActive(i);
      closeDrawerFn();
      scrollToCard(i);
    });
    drawerPrompts.appendChild(dp);

    const section = document.createElement("details");
    section.className = "card";
    section.dataset.cardIndex = String(i);
    section.style.transitionDelay = "var(--reveal-delay, 0ms)";
    section.style.setProperty("--reveal-delay", "0ms");

    const slotKind = feedIntelSlotKind(item);
    const intelSlot = slotKind
      ? `<div class="card-intel-slot" data-intel-slot="${slotKind}" aria-live="polite"></div>`
      : "";

    section.innerHTML = `
      <summary class="card-summary">
        <span class="sr-only">Toggle output: ${escapeHtml(item.title)}</span>
        <span class="card-thumb" aria-hidden="true"></span>
        <span class="card-chevron" aria-hidden="true"></span>
        <div class="card-head">
          <h2 class="card-title">${escapeHtml(item.title)}</h2>
          <span class="card-stamp"><span class="num">#${stamp.n}</span><span class="card-stamp-sep">·</span>${escapeHtml(stamp.ts)}</span>
        </div>
        <span class="card-cta">${escapeHtml(item.workLabel || "View output")}</span>
      </summary>
      <div class="card-panel">
        ${intelSlot}
        <div class="card-body">${item.bodyHtml.trim()}</div>
      </div>
    `;

    feed.appendChild(section);
  });

  const cards = Array.from(document.querySelectorAll(".card"));
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function revealSequential() {
    if (reduced) {
      cards.forEach((c) => c.classList.add("card--visible"));
      return;
    }
    cards.forEach((card, idx) => {
      window.setTimeout(() => {
        card.classList.add("card--visible");
      }, idx * STAGGER_MS);
    });
  }

  if (thread.length) {
    setActiveNav(initialActiveIndex);
    persistMenuState(thread, initialActiveIndex);
  }
  revealSequential();
  syncFeedIntelFromQueue();
  refreshPhraseSearch();
  requestAnimationFrame(updateHeaderPromptScrollButtons);
}

function getFeedIntelSlots() {
  return {
    iaSlot: document.querySelector('[data-intel-slot="ia"]'),
    implSlot: document.querySelector('[data-intel-slot="impl"]'),
    uxSlot: document.querySelector('[data-intel-slot="ux"]'),
    staggerSlot: document.querySelector('[data-intel-slot="stagger"]'),
  };
}

/** Pull yt-dlp metadata into feed cards (debounced; skips duplicate URL while loading). */
function syncFeedIntelFromQueue() {
  window.clearTimeout(intelSyncTimer);
  intelSyncTimer = window.setTimeout(() => void syncFeedIntelNow(), 500);
}

async function syncFeedIntelNow() {
  const slots = getFeedIntelSlots();
  if (!slots.iaSlot && !slots.implSlot && !slots.uxSlot && !slots.staggerSlot) return;
  const pageUrl = getWatchUrlForIntel();
  const emptyMsg =
    '<p class="card-intel-muted">Queue a video in the header bar to pull scenes, captions, and thumbnails into this section.</p>';
  if (!pageUrl) {
    lastIntelSyncUrl = "";
    syncHeaderPromptsMetaFromQueue(null);
    updatePhraseSearchIntel(null, "");
    for (const slot of [slots.iaSlot, slots.implSlot, slots.uxSlot, slots.staggerSlot]) {
      if (slot) slot.innerHTML = emptyMsg;
    }
    return;
  }
  if (
    pageUrl === lastIntelSyncUrl &&
    slots.iaSlot?.dataset.state === "ready"
  ) {
    return;
  }
  const apiOk = await refreshIngestApiCheck();
  if (!apiOk) {
    lastIntelSyncUrl = pageUrl;
    fillIntelSlotsUnavailable(slots);
    return;
  }

  lastIntelSyncUrl = pageUrl;
  void refreshFeedIntel(pageUrl, slots, {
    onIntel(intel) {
      syncHeaderPromptsMetaFromIntel(intel);
      updatePhraseSearchIntel(intel, pageUrl);
      if (intel?.title) patchQueueByUrl(pageUrl, { title: intel.title });
    },
  }).catch(() => {
    lastIntelSyncUrl = "";
  });
}

/** Filter chips/drawer/cards; submit adds a live prompt or video URL. */
function initHeaderPromptInput(ingest) {
  if (headerPromptBound) return;
  headerPromptBound = true;
  const form = document.getElementById("header-prompt-form");
  const input = document.getElementById("header-prompt-input");
  if (!form || !input) return;

  function applyFilter(raw) {
    const needle = raw.trim().toLowerCase();
    currentThread.forEach((item, i) => {
      const hay = `${item.prompt} ${item.title}`.toLowerCase();
      const match = !needle || hay.includes(needle);
      const chip = document.querySelector(`.header-prompt-chip[data-index="${i}"]`);
      const dp = document.querySelector(`.drawer-prompt[data-index="${i}"]`);
      const card = document.querySelector(`.card[data-card-index="${i}"]`);
      if (chip) chip.hidden = !match;
      if (dp) dp.hidden = !match;
      if (card) card.hidden = !match;
    });
  }

  input.addEventListener("input", () => {
    const v = input.value;
    if (isIngestUrl(v)) {
      const meta = ingestMetaFromUrl(v);
      if (meta.url !== v) input.value = meta.url;
      window.clearTimeout(intelPullTimer);
      intelPullTimer = window.setTimeout(() => syncFeedIntelFromQueue(), 450);
      return;
    }
    applyFilter(input.value);
  });

  input.addEventListener("paste", () => {
    window.setTimeout(() => {
      const v = input.value.trim();
      if (!isIngestUrl(v)) return;
      const meta = ingestMetaFromUrl(v);
      if (ingest) {
        ingest.queueUrl(meta.url, {
          title: meta.title,
          notesHtml: meta.notesHtml,
          autoResolve: true,
        });
        input.value = "";
        applyFilter("");
        return;
      }
      input.value = meta.url;
    }, 0);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    input.value = "";
    applyFilter("");
    input.blur();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (ingest && isIngestUrl(text)) {
      const meta = ingestMetaFromUrl(text);
      ingest.queueUrl(meta.url, {
        title: meta.title,
        notesHtml: meta.notesHtml,
        autoResolve: true,
      });
      input.value = "";
      applyFilter("");
      return;
    }
    const existing = currentThread.find(
      (item) => item.prompt.trim().toLowerCase() === text.toLowerCase(),
    );
    if (existing) {
      const i = currentThread.indexOf(existing);
      setActiveNav(i);
      scrollToCard(i);
      return;
    }
    addLiveMessage({
      prompt: text,
      title: truncate(text, 48),
      bodyHtml: `<p>${escapeHtml(text)}</p>`,
      workLabel: "New prompt",
    });
  });
}

function truncate(s, max) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Chapters + captions that advance in the header program row. */
const LIVE_PROGRAM = [
  {
    chapter: "00 — Signal",
    caption: "Prompts live here; shipped work is below.",
  },
  {
    chapter: "01 — Thread",
    caption: "Message intents stay in the header strip; full text lives in the drawer.",
  },
  {
    chapter: "02 — Cards",
    caption: "Each slab is a deliverable; expand to read the finished artifact.",
  },
  {
    chapter: "03 — Ingest",
    caption: "Queue URLs below; header preview + controls copy yt-dlp / mustream / ffplay.",
  },
  {
    chapter: "04 — State",
    caption: "thread.json refreshes on reload; live rows persist in this browser.",
  },
];

/** Rail footer: green dot + "live" only for an active live watch URL with preview. */
function setRailSync(live) {
  const refreshBtn = document.getElementById("rail-refresh");
  const label = document.getElementById("rail-sync");
  if (!refreshBtn || !label) return;
  refreshBtn.classList.toggle("is-live", live);
  label.textContent = live ? "live" : "offline";
  label.classList.toggle("is-live", live);
}

function isLiveWatchUrl(url) {
  const norm = normalizeUrl(url);
  const path = norm.split(/[?#]/)[0];
  if (/\/live\/?$/i.test(path)) return true;
  if (/twitch\.tv/i.test(norm) && path.includes("/live")) return true;
  return false;
}

function updateRailLiveFromQueue() {
  const active = resolveActiveItem(readQueue());
  if (!active) {
    setRailSync(false);
    return;
  }
  const host = document.getElementById("ffplay-embed");
  const previewing =
    !active.resolveError &&
    (Boolean(active.playId) ||
      Boolean(host && !host.hidden && host.querySelector("video, iframe")));
  setRailSync(previewing);
}

/** Up-next queue thumbs in the left rail (below current snapshot). */
function syncRailUpcoming() {
  const el = document.getElementById("rail-upcoming");
  if (!el) return;
  const queue = readQueue();
  const active = resolveActiveItem(queue);
  const next = queue.filter((x) => x.id !== active?.id).slice(0, 4);
  el.replaceChildren();
  if (!next.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  for (const item of next) {
    const norm = normalizeUrl(item.url);
    const kind = classifyUrl(norm);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-rail-upcoming-item";
    btn.title = item.title || item.url;
    const src = previewThumbUrl(norm, kind);
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.width = 42;
      img.height = 24;
      img.loading = "lazy";
      img.decoding = "async";
      btn.appendChild(img);
    } else {
      btn.classList.add("is-ph");
    }
    btn.addEventListener("click", () => {
      writeActiveId(item.id);
      if (globalThis.blankIngest?.redraw) {
        globalThis.blankIngest.redraw(readQueue());
      } else {
        window.dispatchEvent(new CustomEvent("blank-queue-activate"));
      }
    });
    el.appendChild(btn);
  }
}

/** Degrees / fractional / hemisphere — mirrors header clock h / :mm / :ss. */
function splitRailCoord(value, pos, neg) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const frac = Math.round((abs - deg) * 100);
  return {
    h: String(deg),
    m: `:${String(frac).padStart(2, "0")}`,
    s: value >= 0 ? pos : neg,
  };
}

function setRailCoord(el, value, pos, neg) {
  if (!el) return;
  const hEl = el.querySelector(".header-rail-coord-h");
  const mEl = el.querySelector(".header-rail-coord-m");
  const sEl = el.querySelector(".header-rail-coord-s");
  const parts = splitRailCoord(value, pos, neg);
  if (hEl) hEl.textContent = parts.h;
  if (mEl) mEl.textContent = parts.m;
  if (sEl) sEl.textContent = parts.s;
}

function initRailGeo() {
  const latEl = document.getElementById("rail-lat");
  const lonEl = document.getElementById("rail-lon");
  if (!latEl || !lonEl) return;

  function apply(lat, lon) {
    setRailCoord(latEl, lat, "N", "S");
    setRailCoord(lonEl, lon, "E", "W");
  }

  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => apply(pos.coords.latitude, pos.coords.longitude),
    () => {
      /* keep — until coords arrive */
    },
    { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 },
  );
}

function clearRailThumb() {
  const img = document.getElementById("rail-thumb-img");
  if (!(img instanceof HTMLImageElement)) return;
  img.hidden = true;
  img.removeAttribute("src");
}

function initHeaderRail(ingest) {
  const railTime = document.getElementById("rail-time");
  const railFrames = document.getElementById("rail-frames");
  const railPlayTime = document.getElementById("rail-play-time");
  const railThumbImg = document.getElementById("rail-thumb-img");
  const refreshBtn = document.getElementById("rail-refresh");
  if (!railTime || !railFrames) return;

  clearRailThumb();
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) clearRailThumb();
  });

  initRailGeo();

  onRailPlayback((ev) => {
    if (ev.type === "frame") {
      railFrames.textContent = ev.unavailable ? "—" : String(ev.count);
      if (ev.unavailable) {
        railFrames.title = "Frame count unavailable (embedded player)";
      } else {
        const hint = ev.timeLabel ? ` · ${ev.timeLabel}` : "";
        railFrames.title = `Frame at playback position (30 fps)${hint}`;
      }
      if (railPlayTime && ev.timeLabel && !ev.unavailable) {
        railPlayTime.textContent = ev.timeLabel;
        railPlayTime.hidden = false;
      } else if (railPlayTime && ev.unavailable) {
        railPlayTime.hidden = true;
      }
      if (!ev.unavailable && (ev.count > 0 || ev.playing)) {
        updateRailLiveFromQueue();
      }
      return;
    }
    if (ev.type === "scrub" && railPlayTime) {
      railPlayTime.textContent = ev.label;
      railPlayTime.hidden = !ev.active;
      return;
    }
    if (ev.type === "snapshot" && railThumbImg instanceof HTMLImageElement) {
      railThumbImg.onerror = () => {
        railThumbImg.hidden = true;
        railThumbImg.removeAttribute("src");
      };
      railThumbImg.src = ev.dataUrl;
      railThumbImg.hidden = false;
      updateRailLiveFromQueue();
      return;
    }
    if (ev.type === "reset") {
      railFrames.textContent = "0";
      if (railPlayTime) {
        railPlayTime.textContent = "0:00";
        railPlayTime.hidden = true;
      }
      clearRailThumb();
    }
  });

  function tickClock() {
    const d = new Date();
    const hEl = railTime.querySelector(".header-rail-time-h");
    const mEl = railTime.querySelector(".header-rail-time-m");
    const sEl = railTime.querySelector(".header-rail-time-s");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    if (hEl) hEl.textContent = hh;
    if (mEl) mEl.textContent = `:${mm}`;
    if (sEl) sEl.textContent = `:${ss}`;
    railTime.dateTime = d.toISOString();
  }

  tickClock();
  window.setInterval(tickClock, 1000);
  setRailSync(false);

  syncRailUpcoming();

  refreshBtn?.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    setRailSync(false);
    try {
      const { merged, activeIndex } = await loadThread();
      buildUi(merged, activeIndex);
      if (ingest) await ingest.reload();
      updateRailLiveFromQueue();
    } catch {
      setRailSync(false);
    } finally {
      refreshBtn.disabled = false;
    }
  });
}

function initLiveProgram() {
  const chapterEl = document.getElementById("header-chapter");
  const captionEl = document.getElementById("header-live-caption");
  const epochEl = document.getElementById("ffplay-epoch");
  const mbpsEl = document.getElementById("ffplay-mbps");
  if (!chapterEl || !captionEl || !epochEl || !mbpsEl) return;

  let guideIndex = 0;
  const n = LIVE_PROGRAM.length;

  function mbpsTicker() {
    const v = 3.2 + Math.random() * 2.4;
    mbpsEl.textContent = `${v.toFixed(1)} Mbps`;
  }

  function epochTicker() {
    epochEl.textContent = String(Math.floor(Date.now() / 1000));
  }

  function renderGuide() {
    const cur = LIVE_PROGRAM[guideIndex];
    chapterEl.textContent = cur.chapter;
    captionEl.textContent = cur.caption;
  }

  function advanceGuide() {
    guideIndex = (guideIndex + 1) % n;
    renderGuide();
  }

  epochTicker();
  mbpsTicker();
  renderGuide();

  window.setInterval(epochTicker, 1000);
  window.setInterval(mbpsTicker, 1400);
  window.setInterval(advanceGuide, 5200);
}

/** @typedef {'camera' | 'feed' | 'controls'} FfplayToolbarMode */

function initFfplayMenu(ingest) {
  const wrap = document.getElementById("ffplay-wrap");
  const controlsBtn = document.getElementById("ffplay-controls");
  const cameraBtn = document.getElementById("ffplay-camera");
  const feedBtn = document.getElementById("ffplay-feed");
  const pop = document.getElementById("ffplay-popout");
  const menu = document.getElementById("ffplay-menu");
  const hint = document.getElementById("ffplay-popout-hint");
  if (!wrap || !controlsBtn || !pop || !menu) return;

  /** @type {FfplayToolbarMode} */
  let toolbarMode = "controls";

  const toolbarBtns = /** @type {Record<FfplayToolbarMode, HTMLButtonElement | null>} */ ({
    camera: cameraBtn instanceof HTMLButtonElement ? cameraBtn : null,
    feed: feedBtn instanceof HTMLButtonElement ? feedBtn : null,
    controls: controlsBtn,
  });

  function setToolbarActive(mode) {
    for (const [key, btn] of Object.entries(toolbarBtns)) {
      if (!btn) continue;
      const on = key === mode && !pop.hidden;
      btn.classList.toggle("is-active", on);
      btn.classList.toggle("is-open", on);
      if (key === "controls") {
        btn.setAttribute("aria-expanded", on ? "true" : "false");
      }
    }
  }

  function closeFfplay() {
    pop.hidden = true;
    setToolbarActive(toolbarMode);
    controlsBtn.classList.remove("is-open");
    controlsBtn.setAttribute("aria-expanded", "false");
    for (const btn of Object.values(toolbarBtns)) {
      btn?.classList.remove("is-open", "is-active");
    }
  }

  /** @param {{ label: string, cmd: string, note?: string }} row */
  function makeFfplayItem(row) {
    const { label, cmd, note } = row;
    const li = document.createElement("li");
    li.setAttribute("role", "none");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.className = "ffplay-item";
    const noteHtml = note
      ? `<span class="ffplay-item-note">${escapeHtml(note)}</span>`
      : "";
    btn.innerHTML = `<span class="ffplay-item-title">${escapeHtml(label)}</span>${noteHtml}<code class="ffplay-item-cmd">${escapeHtml(cmd)}</code>`;
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await copyText(btn, cmd);
    });
    li.appendChild(btn);
    return li;
  }

  /** @param {string} title */
  function appendSection(title) {
    const li = document.createElement("li");
    li.className = "ffplay-menu-section";
    li.setAttribute("role", "presentation");
    li.textContent = title;
    menu.appendChild(li);
  }

  /** @param {FfplayToolbarMode} mode */
  function fillPopout(mode) {
    menu.innerHTML = "";
    const active = ingest.getActive();
    const paths = ingest.getPaths();
    const presets = ingest.getPresets?.() || [];

    if (mode === "camera") {
      if (hint) {
        hint.textContent =
          "Local ffplay capture — no watch-page embed or commercials. Click a line to copy, then run in Terminal.";
      }
      appendSection("Camera");
      cameraPlaybackOptions().forEach((row) => menu.appendChild(makeFfplayItem(row)));
      return;
    }

    if (mode === "feed") {
      if (hint) {
        hint.textContent =
          "Ad-free sample streams (ffplay) plus queued URL. Queue a row to refresh active-stream commands.";
      }
      const feedRows = feedPlaybackOptions(presets);
      if (feedRows.length) {
        appendSection("Sample feeds (no embed)");
        feedRows.forEach((row) => menu.appendChild(makeFfplayItem(row)));
      }
      if (active?.url) {
        const norm = normalizeUrl(active.url);
        const kind = classifyUrl(norm);
        appendSection(`Active queue · ${kindLabel(kind)}`);
        adFreePlaybackCommands(kind, norm, paths).forEach((row) =>
          menu.appendChild(makeFfplayItem(row)),
        );
      } else if (!feedRows.length) {
        const li = document.createElement("li");
        li.className = "ffplay-menu-empty";
        li.textContent = "Queue a URL in Video ingest for active-stream ffplay commands.";
        menu.appendChild(li);
      }
      return;
    }

    if (!active?.url) {
      if (hint) {
        hint.textContent =
          "Queue a URL for ad-free ffplay/mustream commands — or use camera / feed.";
      }
      appendSection("No queue — samples");
      feedPlaybackOptions(presets).forEach((row) => menu.appendChild(makeFfplayItem(row)));
      cameraPlaybackOptions().forEach((row) => menu.appendChild(makeFfplayItem(row)));
      return;
    }

    const norm = normalizeUrl(active.url);
    const kind = classifyUrl(norm);
    if (hint) {
      hint.textContent = `${kindLabel(kind)} · ffplay/mustream/ffmpeg — play without site embed ads. Click to copy.`;
    }
    for (const { section, items } of controlsPlaybackSections(kind, norm, paths)) {
      appendSection(section);
      items.forEach((row) => menu.appendChild(makeFfplayItem(row)));
    }
  }

  /** @param {FfplayToolbarMode} mode */
  function openFfplay(mode) {
    toolbarMode = mode;
    fillPopout(mode);
    pop.hidden = false;
    setToolbarActive(mode);
    if (mode === "controls") {
      controlsBtn.setAttribute("aria-expanded", "true");
    }
  }

  function toggleFfplay(mode, btn) {
    if (!pop.hidden && toolbarMode === mode) {
      closeFfplay();
      btn?.focus();
      return;
    }
    openFfplay(mode);
  }

  controlsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFfplay("controls", controlsBtn);
  });

  cameraBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFfplay("camera", cameraBtn);
  });

  feedBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFfplay("feed", feedBtn);
  });

  feedBtn?.addEventListener("dblclick", async (e) => {
    e.stopPropagation();
    closeFfplay();
    const mainInput = document.getElementById("header-prompt-input");
    if (mainInput instanceof HTMLInputElement) mainInput.focus();
    const preset = ingest.getDefaultFeedUrl();
    if (preset) {
      ingest.queueUrl(preset.url, { title: preset.title, notesHtml: preset.notesHtml });
      return;
    }
    const r = await pasteClipboardWatchUrl(
      mainInput instanceof HTMLInputElement ? mainInput : null,
      { queue: true, autoResolve: true, ingestApi: ingest },
    );
    if (!r.ok && mainInput instanceof HTMLInputElement) {
      try {
        const txt = await navigator.clipboard.readText();
        const norm = pickWatchUrl(txt);
        if (isIngestUrl(norm)) mainInput.value = norm;
      } catch {
        /* paste manually */
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!pop.hidden && !wrap.contains(e.target)) closeFfplay();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || pop.hidden) return;
    e.preventDefault();
    const btn = toolbarBtns[toolbarMode] || controlsBtn;
    closeFfplay();
    btn?.focus();
  });
}

function initVideoIngest() {
  const embedHost = document.getElementById("ffplay-embed");
  const placeholder = document.getElementById("ffplay-placeholder");
  const queueRoot = document.getElementById("ingest-queue");
  const mainInput = document.getElementById("header-prompt-input");
  const mustreamIn = document.getElementById("path-mustream");
  const mueeeIn = document.getElementById("path-mueee");
  const presetWrap = document.getElementById("ingest-presets-wrap");
  const presetStrip = document.getElementById("ingest-preset-strip");
  if (!embedHost || !queueRoot || !(mainInput instanceof HTMLInputElement)) {
    return null;
  }

  const defaults = {
    mustream: document.body.dataset.defaultMustreamDesktop || "/Users/qbit/dev/mustream-desktop",
    mueee: document.body.dataset.defaultMueeeRoot || "/Users/qbit/dev/mueee-kbatch",
  };

  if (mustreamIn instanceof HTMLInputElement && mueeeIn instanceof HTMLInputElement) {
    const paths = readPaths(readJson(PATH_KEY, null), defaults);
    mustreamIn.value = paths.mustreamDesktop;
    mueeeIn.value = paths.mueeeRoot;
    const syncPaths = () => {
      persistPaths({
        mustreamDesktop: mustreamIn.value.trim(),
        mueeeRoot: mueeeIn.value.trim(),
      });
    };
    mustreamIn.addEventListener("input", syncPaths);
    mueeeIn.addEventListener("input", syncPaths);
  }

  /** @type {{ id: string, title?: string, url: string, notes?: string, ingestHints?: string }[]} */
  let presets = [];

  function getPaths() {
    if (mustreamIn instanceof HTMLInputElement && mueeeIn instanceof HTMLInputElement) {
      return {
        mustreamDesktop: mustreamIn.value.trim() || defaults.mustream,
        mueeeRoot: mueeeIn.value.trim() || defaults.mueee,
      };
    }
    return readPaths(readJson(PATH_KEY, null), defaults);
  }

  const hintHost = document.getElementById("ffplay-hint");
  const railThumbImg = document.getElementById("rail-thumb-img");
  const resolvingIds = new Set();
  let resolveGeneration = 0;

  function patchQueueItem(id, patch) {
    const next = readQueue().map((x) => (x.id === id ? { ...x, ...patch } : x));
    writeQueue(next);
    return next;
  }

  function watchTargetFromBar() {
    const v = mainInput.value.trim();
    if (v && isIngestUrl(v)) {
      const meta = ingestMetaFromUrl(v);
      return { url: meta.url, title: meta.title, notesHtml: meta.notesHtml };
    }
    const active = resolveActiveItem(readQueue());
    if (active) {
      return {
        url: normalizeUrl(active.url),
        title: active.title,
        notesHtml: active.notesHtml,
      };
    }
    return null;
  }

  function ensureQueued(target) {
    let item = readQueue().find((x) => normalizeUrl(x.url) === target.url);
    if (!item) {
      queueUrl(target.url, {
        title: target.title,
        notesHtml: target.notesHtml,
        autoResolve: false,
      });
      item = readQueue().find((x) => normalizeUrl(x.url) === target.url);
    }
    if (item) writeActiveId(item.id);
    return item;
  }

  async function autoResolveItem(itemId, opts = {}) {
    const { force = false, download = true } = opts;
    if (resolvingIds.has(itemId)) return;
    const item = readQueue().find((x) => x.id === itemId);
    if (!item?.url) return;
    const norm = normalizeUrl(item.url);
    const kind = classifyUrl(norm);
    if (!shouldAutoResolve(kind)) return;
    if (!force && item.playId) return;

    resolvingIds.add(itemId);
    const gen = ++resolveGeneration;
    setPreviewHint(
      hintHost,
      download
        ? "Resolving with yt-dlp… preview loads when ready; MKV archives to ~/Downloads."
        : "Resolving with yt-dlp… preview loads when ready.",
    );
    try {
      const data = await requestIngestResolve(norm, { download });
      if (gen !== resolveGeneration) return;
      const next = patchQueueItem(itemId, {
        playId: data.playId,
        streamKind: data.streamKind,
        title: data.title || item.title,
        resolveError: undefined,
      });
      redraw(next);
    } catch (e) {
      if (gen !== resolveGeneration) return;
      const msg = e instanceof Error ? e.message : String(e);
      const next = patchQueueItem(itemId, {
        playId: undefined,
        resolveError: msg,
      });
      redraw(next);
    } finally {
      resolvingIds.delete(itemId);
    }
  }

  function setRailThumb(item) {
    if (!(railThumbImg instanceof HTMLImageElement)) return;
    if (!item) {
      clearRailThumb();
      return;
    }
    const norm = normalizeUrl(item.url);
    const kind = classifyUrl(norm);
    if (item.playId || shouldAutoResolve(kind)) {
      clearRailThumb();
      return;
    }
    const thumb = previewThumbUrl(norm, kind);
    if (thumb) {
      railThumbImg.onerror = () => clearRailThumb();
      railThumbImg.src = thumb;
      railThumbImg.hidden = false;
    } else {
      clearRailThumb();
    }
  }

  onPreviewStreamRecovery(() => {
    const active = resolveActiveItem(readQueue());
    if (!active) return;
    const now = Date.now();
    if (now < previewRecoveryUntil) return;
    previewRecoveryUntil = now + 12_000;

    const msg =
      "Preview stream failed (TikTok often blocks browser HLS). Click resolve to retry once, or controls → MuStream.";
    patchQueueItem(active.id, {
      playId: undefined,
      resolveError: msg,
    });
    clearRailThumb();
    redraw(readQueue());
  });

  function setPreview(item) {
    mountPreview(embedHost, item, hintHost);
    setRailThumb(item);
    syncHeaderPromptsMetaFromQueue(item);
    syncRailUpcoming();
    updateRailLiveFromQueue();
    if (placeholder instanceof HTMLElement) {
      placeholder.hidden = Boolean(item);
    }
    const titleEl = document.querySelector(".ffplay-stream-title");
    if (titleEl && item) {
      const norm = normalizeUrl(item.url);
      const kind = classifyUrl(norm);
      titleEl.textContent = (item.title || displayTitleForUrl(norm, kind))
        .toUpperCase()
        .slice(0, 24);
    } else if (titleEl) {
      titleEl.textContent = "COLLABORATIVE AI";
    }
  }

  function updateIngestPanelMeta(queue) {
    const countEl = document.getElementById("ingest-panel-count");
    if (countEl) {
      countEl.textContent = queue.length
        ? `${queue.length} item${queue.length === 1 ? "" : "s"}`
        : "empty";
    }
  }

  function redraw(queue) {
    const active = resolveActiveItem(queue);
    if (active) writeActiveId(active.id);
    updateIngestPanelMeta(queue);
    setPreview(active);
    if (
      active &&
      shouldAutoResolve(classifyUrl(normalizeUrl(active.url))) &&
      !active.playId &&
      !active.resolveError &&
      Date.now() >= previewRecoveryUntil
    ) {
      void autoResolveItem(active.id, { download: false });
    }

    queueRoot.innerHTML = "";
    if (!queue.length) {
      const empty = document.createElement("p");
      empty.className = "ingest-empty";
      empty.textContent = "Queue empty — paste in the header bar (Add / Paste) or use a preset.";
      queueRoot.appendChild(empty);
      syncFeedIntelFromQueue();
      return;
    }

    queue.forEach((item) => {
      const norm = normalizeUrl(item.url);
      const kind = classifyUrl(norm);
      const row = document.createElement("article");
      row.className = "ingest-row";
      if (active?.id === item.id) row.classList.add("is-active");

      const ingestHandlers = {
        onPlay: () => {
          writeActiveId(item.id);
          redraw(readQueue());
          if (shouldAutoResolve(kind) && !item.playId && !item.resolveError) {
            void autoResolveItem(item.id, { download: false });
          }
        },
        onDownload: async () => {
          writeActiveId(item.id);
          setPreviewHint(hintHost, "Starting MKV download → ~/Downloads…");
          try {
            await requestIngestDownload(norm);
            setPreviewHint(hintHost, "Download started — yt-dlp → ~/Downloads");
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setPreviewHint(hintHost, `Download failed: ${msg}`);
          }
        },
        onMustream: () => {
          const { mustreamCmd, mustreamGuiCmd } = buildIngestChecklist(item, getPaths(), getIngestApiOk());
          const btn = document.createElement("button");
          void copyText(btn, mustreamCmd).then(() => {
            window.alert(
              "Copied mustream play command.\n\nGUI opener:\n" + mustreamGuiCmd,
            );
          });
        },
      };

      const { actions } = buildIngestChecklist(item, getPaths(), getIngestApiOk());
      const top = document.createElement("div");
      top.className = "ingest-row-top";
      const meta = document.createElement("div");
      meta.className = "ingest-row-meta";
      meta.innerHTML = `<span class="ingest-kind">${escapeHtml(kindLabel(kind))}</span><h3 class="ingest-row-title">${escapeHtml(item.title || item.url)}</h3>`;
      const actionsEl = renderIngestActions(actions, ingestHandlers);
      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "ingest-row-play";
      playBtn.textContent = active?.id === item.id ? "Previewing" : "Preview";
      playBtn.addEventListener("click", () => {
        writeActiveId(item.id);
        redraw(readQueue());
      });
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "ingest-row-remove";
      rm.setAttribute("aria-label", "Remove");
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        const next = readQueue().filter((x) => x.id !== item.id);
        writeQueue(next);
        redraw(next);
      });
      top.append(meta, actionsEl, playBtn, rm);

      const cmds = document.createElement("details");
      cmds.className = "ingest-row-cmds";
      cmds.innerHTML = "<summary>Terminal commands</summary>";
      const ul = document.createElement("ul");
      ul.className = "ingest-cmd-list";
      commandsFor(kind, norm, getPaths()).forEach(({ label, cmd }) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ingest-cmd-btn";
        btn.innerHTML = `<span>${escapeHtml(label)}</span><code>${escapeHtml(cmd)}</code>`;
        btn.addEventListener("click", () => copyText(btn, cmd));
        li.appendChild(btn);
        ul.appendChild(li);
      });
      cmds.appendChild(ul);

      const checklist = renderIngestChecklist(item, getPaths(), ingestHandlers, getIngestApiOk());

      row.append(top, checklist, cmds);
      if (item.notesHtml?.trim()) {
        const notes = document.createElement("div");
        notes.className = "ingest-row-notes";
        notes.innerHTML = item.notesHtml.trim();
        row.appendChild(notes);
      }
      queueRoot.appendChild(row);
    });
    syncFeedIntelFromQueue();
    refreshPhraseSearch();
    syncRailUpcoming();
    updateRailLiveFromQueue();
  }

  function queueUrl(raw, meta = {}) {
    const derived = ingestMetaFromUrl(raw);
    const url = derived.url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      window.alert("Need http(s) URL (mustream:https://… or messy paste is OK).");
      return;
    }
    const item = {
      id: `u-${Date.now()}`,
      url,
      title: meta.title || derived.title,
      notesHtml: meta.notesHtml ?? derived.notesHtml,
      addedAt: Date.now(),
    };
    const next = [item, ...readQueue()].slice(0, 24);
    writeQueue(next);
    writeActiveId(item.id);
    redraw(next);
    if (meta.autoResolve !== false && shouldAutoResolve(classifyUrl(url))) {
      void autoResolveItem(item.id, { download: false });
    }
    document.getElementById("ingest-queue")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  document.getElementById("ingest-clear")?.addEventListener("click", () => {
    writeQueue([]);
    writeActiveId(null);
    clearRailThumb();
    redraw([]);
    setRailSync(false);
  });

  document.getElementById("ingest-resolve")?.addEventListener("click", () => {
    const target = watchTargetFromBar();
    if (!target) {
      window.alert("Paste a video URL in the bar, or select a queued item.");
      return;
    }
    const item = ensureQueued(target);
    if (!item) return;
    previewRecoveryUntil = 0;
    patchQueueItem(item.id, { playId: undefined, resolveError: undefined });
    redraw(readQueue());
    void autoResolveItem(item.id, { force: true, download: false });
  });

  document.getElementById("ingest-download")?.addEventListener("click", async () => {
    const target = watchTargetFromBar();
    if (!target) {
      window.alert("Paste a video URL in the bar, or select a queued item.");
      return;
    }
    ensureQueued(target);
    setPreviewHint(hintHost, "Starting MKV download → ~/Downloads…");
    try {
      await requestIngestDownload(target.url);
      setPreviewHint(
        hintHost,
        "Download started (yt-dlp) → ~/Downloads/%(title)s.mkv — check Terminal if needed.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPreviewHint(hintHost, `Download failed: ${msg}`);
      window.alert(msg);
    }
  });

  async function mountPresets() {
    presets = await fetchPresets();
    if (!presetStrip || !presetWrap) return;
    presetStrip.innerHTML = "";
    if (!presets.length) {
      presetWrap.hidden = true;
      return;
    }
    presetWrap.hidden = false;
    presets.forEach((preset) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ingest-preset-chip";
      chip.textContent = preset.title || preset.url;
      chip.addEventListener("click", () => {
        const parts = [];
        if (preset.notes) parts.push(`<div>${preset.notes}</div>`);
        if (preset.ingestHints) parts.push(`<div>${preset.ingestHints}</div>`);
        queueUrl(preset.url, {
          title: preset.title,
          notesHtml: parts.length ? parts.join("") : undefined,
        });
      });
      presetStrip.appendChild(chip);
    });
  }

  const api = {
    queueUrl,
    getActive: () => resolveActiveItem(readQueue()),
    getPaths,
    getPresets: () => presets,
    async reload() {
      await mountPresets();
      redraw(readQueue());
    },
    getDefaultFeedUrl: () => {
      const hls = presets.find((p) => classifyUrl(normalizeUrl(p.url)) === "hls");
      const pick = hls || presets[0];
      if (!pick) return null;
      const parts = [];
      if (pick.notes) parts.push(`<div>${pick.notes}</div>`);
      if (pick.ingestHints) parts.push(`<div>${pick.ingestHints}</div>`);
      return {
        url: pick.url,
        title: pick.title,
        notesHtml: parts.length ? parts.join("") : undefined,
      };
    },
  };

  document.getElementById("ingest-paste")?.addEventListener("click", async () => {
    const r = await pasteClipboardWatchUrl(mainInput, {
      queue: true,
      autoResolve: true,
      ingestApi: api,
    });
    if (!r.ok) {
      window.alert(
        r.reason === "clipboard"
          ? "Clipboard blocked — paste into the field manually."
          : "Clipboard has no extractable http(s) URL.",
      );
      return;
    }
    mainInput.focus();
  });

  void mountPresets().then(() => {
    const q = readQueue();
    writeQueue(q);
    redraw(q);
    void refreshIngestApiCheck().then(() => redraw(readQueue()));
  });
  return api;
}

async function main() {
  initQualitySettings();
  initHeaderPromptScroll();
  initHeaderPromptsMeta();
  await refreshIngestApiCheck();
  const ingest = initVideoIngest();
  initHeaderRail(ingest);
  const { merged, activeIndex } = await loadThread();
  buildUi(merged, activeIndex);
  const feedEl = document.getElementById("feed");
  if (feedEl) {
    initPhraseSearch(feedEl, {
      getQueue: readQueue,
      getThread: () => currentThread,
      getPageUrl: getWatchUrlForIntel,
    });
  }
  if (ingest) initHeaderPromptInput(ingest);
  initLiveProgram();
  if (ingest) initFfplayMenu(ingest);
  syncRailUpcoming();
  updateRailLiveFromQueue();
  applyAutomationFromLocation(ingest);
  globalThis.blankIngest = ingest;
  globalThis.blankSyncFeedIntel = syncFeedIntelFromQueue;
  globalThis.blankQueueVideoUrl = (raw, meta = {}) => {
    if (!ingest) return false;
    ingest.queueUrl(raw, { autoResolve: true, ...meta });
    return true;
  };
}

main();
