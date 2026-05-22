/**
 * Cross-feed phrase search: transcript, scene captions, queue, thread prompts.
 */

import { escapeHtml } from "./video-ingest.js";
import { formatIntelClock, seekPreview, deriveShowFromIntel } from "./feed-intel.js";
import {
  mountPhraseKeyboardViz,
  KEYBOARD_LAYOUTS,
  LAYOUT_RING_ORDER,
} from "./phrase-keyboard-viz.js";
import {
  findCrossLayoutOverlaps,
  searchIndexWithCrossLayout,
  crossLayoutShadowMeanings,
  layoutWordOverlapPercents,
} from "./phrase-keyboard-cross.js";

const WATCH_KEY = "blank.phrase.watch.v1";

/** @param {string} t */
function parseVttStart(t) {
  const m = String(t).trim().match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return NaN;
  const h = Number(m[1] || 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] || "0").padEnd(3, "0").slice(0, 3));
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/** @param {string} q */
function parseQueryTerms(q) {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const quoted = [...trimmed.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
  if (quoted.length) return quoted;
  return trimmed.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * @param {object | null} intel
 * @param {string} pageUrl
 * @param {{ queue?: object[], thread?: object[] }} ctx
 */
export function buildPhraseIndex(intel, pageUrl, ctx = {}) {
  /** @type {Array<{ id: string, source: string, label: string, text: string, startSec?: number, url?: string, sceneIdx?: number }>} */
  const entries = [];

  const push = (id, source, label, text, extra = {}) => {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length < 2) return;
    entries.push({ id, source, label, text: t, ...extra });
  };

  if (intel) {
    const cap = intel.captions;
    const capLines = Array.isArray(cap?.lines) ? cap.lines : [];
    for (const row of capLines) {
      const startSec =
        typeof row.startSec === "number" && Number.isFinite(row.startSec)
          ? row.startSec
          : parseVttStart(row.time);
      push(`cap-${row.time}`, "transcript", row.time || "Transcript", row.text, {
        startSec: Number.isFinite(startSec) ? startSec : undefined,
        url: pageUrl,
      });
    }
    const rawDesc = String(intel.description || "").trim();
    if (rawDesc) {
      for (const line of rawDesc.split(/\r?\n/).filter(Boolean).slice(0, 40)) {
        push(`desc-${line.slice(0, 24)}`, "program", "Program", line, { url: pageUrl });
      }
    }
    const { show, headline } = deriveShowFromIntel(intel);
    if (show) push("show", "program", "Show", show, { url: pageUrl });
    if (headline) push("headline", "program", "Headline", headline, { url: pageUrl });

    const scenes = Array.isArray(intel.scenes) ? intel.scenes : [];
    const duration = Number(intel.duration) || null;
    scenes.forEach((sc, i) => {
      const start = Number(sc.start) || 0;
      const nextStart = scenes[i + 1] ? Number(scenes[i + 1].start) : null;
      const end =
        Number(sc.end) > start
          ? Number(sc.end)
          : nextStart != null && nextStart > start
            ? nextStart
            : duration != null
              ? duration
              : start + 90;
      const sceneLabel = `Scene #${String(i + 1).padStart(2, "0")} · ${formatIntelClock(start)}`;
      push(`scene-t-${i}`, "scene", sceneLabel, String(sc.title || ""), {
        startSec: start,
        url: pageUrl,
        sceneIdx: i,
      });
      for (const row of capLines) {
        const t =
          typeof row.startSec === "number" && Number.isFinite(row.startSec)
            ? row.startSec
            : parseVttStart(row.time);
        if (Number.isFinite(t) && t >= start && t < end) {
          push(`scene-${i}-${row.time}`, "scene-caption", `${sceneLabel} · ${row.time}`, row.text, {
            startSec: t,
            url: pageUrl,
            sceneIdx: i,
          });
        }
      }
    });
  }

  for (const item of ctx.queue || []) {
    const title = String(item.title || "").trim();
    const url = String(item.url || "").trim();
    push(`q-${item.id}`, "queue", "Playlist / queue", `${title} ${url}`.trim(), {
      url,
    });
  }

  for (const [i, item] of (ctx.thread || []).entries()) {
    push(`thread-${i}`, "prompt", `Thread #${String(i + 1).padStart(2, "0")}`, String(item.prompt || item.title || ""));
  }

  for (const layoutId of LAYOUT_RING_ORDER) {
    const layout = KEYBOARD_LAYOUTS[layoutId];
    for (const key of layout.rows.flat()) {
      push(`kb-${layoutId}-${key}`, "keyboard", `${layout.name} · ${key}`, key);
    }
  }

  return entries;
}

/** @param {string} text @param {string[]} terms */
function matchesPhrase(text, terms) {
  const lower = text.toLowerCase();
  return terms.every((t) => lower.includes(t.toLowerCase()));
}

/** @param {string} text @param {string} term */
function highlightMatch(text, term) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return escapeHtml(text);
  const before = text.slice(0, idx);
  const hit = text.slice(idx, idx + term.length);
  const after = text.slice(idx + term.length);
  return `${escapeHtml(before)}<mark>${escapeHtml(hit)}</mark>${escapeHtml(after)}`;
}

/** @param {ReturnType<typeof buildPhraseIndex>} index @param {string} query */
function searchPhraseIndex(index, query) {
  const terms = parseQueryTerms(query);
  if (!terms.length) return [];
  return searchIndexWithCrossLayout(index, query, terms[0]);
}

function readWatchPhrases() {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeWatchPhrases(list) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 32)));
}

function sourceLabel(source) {
  const map = {
    transcript: "Transcript",
    "scene-caption": "Scene caption",
    scene: "Scene",
    program: "Program",
    queue: "Queue",
    prompt: "Prompt",
    keyboard: "Keyboard",
    "cross-layout": "Cross-layout",
  };
  return map[source] || source;
}

/** @param {HTMLElement} crossEl @param {ReturnType<typeof findCrossLayoutOverlaps>} cross @param {string} query @param {ReturnType<typeof buildPhraseIndex>} index */
function renderCrossLayoutPanel(crossEl, cross, query, index) {
  if (!(crossEl instanceof HTMLElement)) return;
  if (!query.trim() || !cross.shadows) {
    crossEl.hidden = true;
    crossEl.innerHTML = "";
    return;
  }

  const prevMapping = crossEl.querySelector(".feed-phrase-cross-mapping-details");
  const prevOverlaps = crossEl.querySelector(".feed-phrase-overlap-details");
  const mappingWasOpen =
    prevMapping instanceof HTMLDetailsElement ? prevMapping.open : false;
  const overlapsWasOpen =
    prevOverlaps instanceof HTMLDetailsElement ? prevOverlaps.open : false;

  const { baseLayout, layouts } = cross.shadows;
  const meanings = crossLayoutShadowMeanings(query, index);
  const mappingSummary = `Cross-keyboard mapping (${escapeHtml(KEYBOARD_LAYOUTS[baseLayout]?.name || baseLayout)} path)`;

  const shadowRows = LAYOUT_RING_ORDER.map((id) => {
    const v = layouts[id];
    const m = meanings[id];
    const meaningCell = m?.hits?.length
      ? `<span class="feed-phrase-shadow-words">${m.hits
          .map(
            (h) =>
              `<span class="feed-phrase-shadow-word" title="${escapeHtml(h.source === "segment" ? "Segmented from shadow" : "Token in shadow")}">${escapeHtml(h.word)}</span>`,
          )
          .join("")}</span>`
      : `<span class="feed-phrase-shadow-none">—</span>`;
    return `<tr>
      <th scope="row">${escapeHtml(v.name)}</th>
      <td class="feed-phrase-shadow-glyph">${escapeHtml(v.text)}</td>
      <td class="feed-phrase-shadow-meaning" title="${escapeHtml(m?.title || "")}">${meaningCell}</td>
    </tr>`;
  }).join("");

  const overlapCount = cross.overlaps.length;
  const overlapSummary = overlapCount
    ? `Dictionary overlaps in loaded transcript (${overlapCount})`
    : "Dictionary overlaps in loaded transcript";

  const overlapBody = overlapCount
    ? `<ul class="feed-phrase-overlap-list">${cross.overlaps
        .map(
          (o) =>
            `<li><span class="feed-phrase-overlap-word">${escapeHtml(o.word)}</span>
              <span class="feed-phrase-overlap-kind">${escapeHtml(o.kind)}</span>
              <span class="feed-phrase-overlap-detail">${escapeHtml(o.detail)}</span></li>`,
        )
        .join("")}</ul>`
    : `<p class="feed-phrase-overlap-empty">No corpus tokens share this key path or shadow overlap yet.</p>`;

  crossEl.hidden = false;
  crossEl.innerHTML = `
    <details class="feed-phrase-cross-mapping-details">
      <summary class="feed-phrase-cross-mapping-summary">${mappingSummary}</summary>
      <div class="feed-phrase-cross-mapping-body">
        <table class="feed-phrase-shadow-table" aria-label="Query typed on every layout at same key positions">
          <thead><tr>
            <th scope="col">Layout</th>
            <th scope="col">Same keys produce</th>
            <th scope="col">Words in layout script</th>
          </tr></thead>
          <tbody>${shadowRows}</tbody>
        </table>
      </div>
    </details>
    <details class="feed-phrase-overlap-details">
      <summary class="feed-phrase-overlap-summary">${escapeHtml(overlapSummary)}</summary>
      <div class="feed-phrase-overlap-body">${overlapBody}</div>
    </details>`;

  const mappingDetails = crossEl.querySelector(".feed-phrase-cross-mapping-details");
  const overlapDetails = crossEl.querySelector(".feed-phrase-overlap-details");
  if (mappingDetails instanceof HTMLDetailsElement) {
    mappingDetails.open = mappingWasOpen;
  }
  if (overlapDetails instanceof HTMLDetailsElement) {
    overlapDetails.open = overlapsWasOpen;
  }
}

/** @param {HTMLElement} feedEl @param {{ getQueue: () => object[], getThread: () => object[], getPageUrl: () => string | null }} hooks */
export function initPhraseSearch(feedEl, hooks) {
  if (!feedEl || feedEl.dataset.phraseSearch) return;
  feedEl.dataset.phraseSearch = "1";

  let cachedIntel = null;
  let cachedUrl = "";
  /** @type {ReturnType<searchPhraseIndex>} */
  let lastSearchHits = [];
  /** @type {{ repaint: () => void } | null} */
  let kbViz = null;

  const section = document.createElement("details");
  section.id = "feed-phrase-search";
  section.className = "feed-phrase-search";
  section.setAttribute("open", "");
  section.setAttribute("aria-label", "Phrase search across transcript, scenes, and queue");
  section.innerHTML = `
    <summary class="feed-phrase-search-summary">
      <span class="feed-phrase-search-chevron" aria-hidden="true"></span>
      <span class="feed-phrase-label">Phrase search</span>
      <span class="feed-phrase-hint">Transcript · scenes · queue · prompts</span>
    </summary>
    <div class="feed-phrase-search-inner">
      <form class="feed-phrase-form" id="feed-phrase-form">
        <div class="feed-phrase-row">
          <label class="sr-only" for="feed-phrase-input">Phrase search</label>
          <input
            type="search"
            id="feed-phrase-input"
            class="feed-phrase-input"
            name="phrase"
            placeholder='e.g. "Nvidia" or balance of power'
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
          />
          <button type="submit" class="feed-phrase-submit">Search</button>
        </div>
      </form>
      <div id="feed-phrase-kb-host" class="feed-phrase-kb-host"></div>
      <details class="feed-phrase-watch">
        <summary>Listen for phrases</summary>
        <p class="feed-phrase-watch-hint">One phrase per line — alerts when a match appears in loaded captions or new intel.</p>
        <textarea id="feed-phrase-watch" class="feed-phrase-watch-input" rows="3" spellcheck="true"></textarea>
      </details>
      <div id="feed-phrase-alerts" class="feed-phrase-alerts" hidden></div>
      <details id="feed-phrase-results" class="feed-phrase-results" hidden>
        <summary id="feed-phrase-results-summary" class="feed-phrase-results-summary">Search results</summary>
        <div id="feed-phrase-results-body" class="feed-phrase-results-body" role="list"></div>
      </details>
      <div id="feed-phrase-cross-overlaps" class="feed-phrase-cross-overlaps" hidden></div>
    </div>
  `;

  const intro = feedEl.querySelector(".feed-intro");
  if (intro) intro.after(section);
  else feedEl.prepend(section);

  const form = section.querySelector("#feed-phrase-form");
  const input = section.querySelector("#feed-phrase-input");
  const resultsEl = section.querySelector("#feed-phrase-results");
  const resultsBody = section.querySelector("#feed-phrase-results-body");
  const resultsSummary = section.querySelector("#feed-phrase-results-summary");
  const crossOverlapEl = section.querySelector("#feed-phrase-cross-overlaps");
  const alertsEl = section.querySelector("#feed-phrase-alerts");
  const watchTa = section.querySelector("#feed-phrase-watch");

  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return;
  if (
    !(resultsEl instanceof HTMLDetailsElement) ||
    !(resultsBody instanceof HTMLElement) ||
    !(alertsEl instanceof HTMLElement)
  ) {
    return;
  }

  watchTa.value = readWatchPhrases().join("\n");

  const kbHost = section.querySelector("#feed-phrase-kb-host");
  if (kbHost instanceof HTMLElement) {
    kbViz = mountPhraseKeyboardViz(kbHost, {
      getQuery: () => input.value,
      getIndexHits: () => lastSearchHits,
      getLayoutOverlapPercents: () =>
        layoutWordOverlapPercents(input.value.trim(), getIndex()),
    });
  }

  const getIndex = () =>
    buildPhraseIndex(cachedIntel, cachedUrl, {
      queue: hooks.getQueue?.() || [],
      thread: hooks.getThread?.() || [],
    });

  /** @param {ReturnType<searchPhraseIndex>} hits */
  function renderResults(hits, query) {
    if (!hits.length) {
      resultsEl.hidden = false;
      resultsEl.innerHTML = `<p class="feed-phrase-empty">No matches for <strong>${escapeHtml(query)}</strong>.</p>`;
      return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = hits
      .map((hit) => {
        const snip =
          hit.text.length > 140 ? `${hit.text.slice(0, 137)}…` : hit.text;
        const seek =
          Number.isFinite(hit.startSec) && hit.startSec >= 0
            ? ` data-seek="${hit.startSec}"`
            : "";
        const scene =
          typeof hit.sceneIdx === "number" ? ` data-scene="${hit.sceneIdx}"` : "";
        const kind =
          hit.matchKind === "cross-layout" ? " · cross-layout" : "";
        return `<button type="button" class="feed-phrase-hit" role="listitem"${seek}${scene}>
          <span class="feed-phrase-hit-src">${escapeHtml(sourceLabel(hit.source))}${escapeHtml(kind)}</span>
          <span class="feed-phrase-hit-label">${escapeHtml(hit.label)}</span>
          <span class="feed-phrase-hit-text">${highlightMatch(snip, hit.primary)}</span>
        </button>`;
      })
      .join("");

    resultsEl.querySelectorAll(".feed-phrase-hit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sec = Number(btn.getAttribute("data-seek"));
        const sceneIdx = btn.getAttribute("data-scene");
        if (Number.isFinite(sec)) seekPreview(sec);
        if (sceneIdx != null && sceneIdx !== "") {
          const card = document.querySelectorAll(".card-scene-card")[Number(sceneIdx)];
          if (card instanceof HTMLDetailsElement) {
            card.open = true;
            card.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
        const iaCard = document.querySelector('[data-intel-slot="ia"]')?.closest("details.card");
        if (iaCard instanceof HTMLDetailsElement) iaCard.open = true;
      });
    });
  }

  function runSearch() {
    const q = input.value.trim();
    kbViz?.repaint();
    if (!q) {
      lastSearchHits = [];
      resultsEl.hidden = true;
      resultsBody.innerHTML = "";
      if (resultsSummary instanceof HTMLElement) {
        resultsSummary.textContent = "Search results";
      }
      if (crossOverlapEl instanceof HTMLElement) {
        crossOverlapEl.hidden = true;
        crossOverlapEl.innerHTML = "";
      }
      return;
    }
    const index = getIndex();
    lastSearchHits = searchPhraseIndex(index, q);
    renderResults(lastSearchHits, q);
    renderCrossLayoutPanel(crossOverlapEl, findCrossLayoutOverlaps(q, index), q, index);
    kbViz?.repaint();
  }

  function runWatchScan() {
    const phrases = readWatchPhrases();
    if (!phrases.length || !cachedIntel) {
      alertsEl.hidden = true;
      alertsEl.innerHTML = "";
      return;
    }
    const index = getIndex();
    /** @type {Array<{ phrase: string, hit: object }>} */
    const alerts = [];
    for (const phrase of phrases) {
      const hits = searchPhraseIndex(index, phrase);
      if (hits.length) alerts.push({ phrase, hit: hits[0] });
    }
    if (!alerts.length) {
      alertsEl.hidden = true;
      alertsEl.innerHTML = "";
      return;
    }
    alertsEl.hidden = false;
    alertsEl.innerHTML = `<p class="feed-phrase-alerts-title">Listening — ${alerts.length} phrase${alerts.length === 1 ? "" : "s"} matched</p>
      <ul class="feed-phrase-alerts-list">${alerts
        .map(
          ({ phrase, hit }) =>
            `<li><button type="button" class="feed-phrase-alert-btn" data-phrase="${escapeHtml(phrase)}">${escapeHtml(phrase)}</button>
              <span class="feed-phrase-alert-ctx">${escapeHtml(sourceLabel(hit.source))} · ${escapeHtml(hit.label)}</span></li>`,
        )
        .join("")}</ul>`;
    alertsEl.querySelectorAll(".feed-phrase-alert-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const phrase = btn.getAttribute("data-phrase");
        if (phrase) {
          input.value = phrase;
          runSearch();
          input.focus();
        }
      });
    });
  }

  let debounce = 0;
  input.addEventListener("input", () => {
    kbViz?.repaint();
    window.clearTimeout(debounce);
    debounce = window.setTimeout(runSearch, 220);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch();
  });

  if (watchTa instanceof HTMLTextAreaElement) {
    watchTa.addEventListener("change", () => {
      writeWatchPhrases(
        watchTa.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      );
      runWatchScan();
    });
  }

  globalThis.blankPhraseSearch = {
    updateIntel(intel, pageUrl) {
      cachedIntel = intel;
      cachedUrl = pageUrl || "";
      runWatchScan();
      if (input.value.trim()) runSearch();
      else kbViz?.repaint();
    },
    refresh() {
      runWatchScan();
      if (input.value.trim()) runSearch();
      else kbViz?.repaint();
    },
  };

  requestAnimationFrame(() => kbViz?.repaint());
}

/** @param {object | null} intel @param {string} [pageUrl] */
export function updatePhraseSearchIntel(intel, pageUrl = "") {
  globalThis.blankPhraseSearch?.updateIntel(intel, pageUrl);
}

export function refreshPhraseSearch() {
  globalThis.blankPhraseSearch?.refresh();
}
