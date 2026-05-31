/**
 * Accreditation, per-song PRO credits, and charting UI for live concerts.
 */
import { addWatchPhrases, focusPhraseSearch } from "./phrase-search.js";

/** @param {string} artist @param {string} [mbid] */
export async function fetchArtistMeta(artist, mbid) {
  const q = new URLSearchParams({ artist });
  if (mbid) q.set("mbid", mbid);
  const res = await fetch(`/api/live/artist-meta?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `artist-meta (${res.status})`);
  return data;
}

/** @param {string} rgMbid @param {string} [artist] */
export async function fetchAlbumMeta(rgMbid, artist) {
  const q = new URLSearchParams({ rgMbid });
  if (artist) q.set("artist", artist);
  const res = await fetch(`/api/live/album-detail?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `album-detail (${res.status})`);
  return data;
}

/**
 * @param {HTMLElement | null} root
 * @param {object} data artist-meta response
 */
export function paintArtistMeta(root, data) {
  if (!(root instanceof HTMLElement)) return;
  const a = data.accreditation || {};
  const wrap = document.getElementById("live-concerts-meta-wrap");
  if (wrap instanceof HTMLDetailsElement) {
    wrap.hidden = false;
    const sum = wrap.querySelector(".live-concerts-meta-summary");
    if (sum) sum.textContent = `Artist accreditation · ${data.artist || ""}`;
  }
  root.innerHTML = `
    ${section("Promo & press kit", linkList(a.promoKit))}
    ${section("Agencies & management", peopleList(a.agencies))}
    ${section("Technicians & production", peopleList(a.technicians))}
    ${section("Tour companies", peopleList(a.tourCompanies))}
    ${section("Rights holders & labels", peopleList(a.rightsHolders))}
    ${section("Sponsors & brands", peopleList(a.sponsors))}
    ${section("Videos", linkList(a.videos))}
    ${section("Charting", chartList(data.charts))}
    ${data.tags?.length ? section("Tags", `<p class="live-concerts-meta-tags">${data.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>`) : ""}
  `;
}

/**
 * @param {HTMLElement | null} slot
 * @param {object} data album-detail response
 */
export function paintAlbumMeta(slot, data) {
  if (!(slot instanceof HTMLElement)) return;
  slot.hidden = false;
  const a = data.accreditation || {};
  const songs = Array.isArray(data.songs) ? data.songs : [];
  const title = data.title || "Album";
  const year = data.year ? String(data.year) : "";

  slot.innerHTML = `
    <header class="live-concerts-album-focus-head">
      <h3 class="live-concerts-album-focus-title">${escapeHtml(title)}${year ? ` <span class="live-concerts-album-focus-year">${escapeHtml(year)}</span>` : ""}</h3>
      ${data.labels?.length ? `<p class="live-concerts-album-focus-labels">${data.labels.map((l) => escapeHtml(l.name + (l.catalog ? ` · ${l.catalog}` : ""))).join(" · ")}</p>` : ""}
    </header>
    <details class="live-concerts-meta-block live-concerts-album-lyrics" open>
      <summary>Songs · lyrics & PRO (${songs.length})</summary>
      <ol class="live-concerts-song-list">
        ${songs.length ? songs.map((s) => songRow(s, title, year)).join("") : "<li class=\"live-concerts-picks-empty\">No track listing in MusicBrainz for this release.</li>"}
      </ol>
    </details>
    <details class="live-concerts-meta-block">
      <summary>Album accreditation</summary>
      ${section("Images / artwork", imageList(a.images))}
      ${section("Videos", linkList(a.videos))}
      ${section("Agencies", peopleList(a.agencies))}
      ${section("Technicians", peopleList(a.technicians))}
      ${section("Tour", peopleList(a.tourCompanies))}
      ${section("Rights / labels", peopleList(a.rightsHolders))}
      ${section("Sponsors", peopleList(a.sponsors))}
      ${section("Promo kit", linkList(a.promoKit))}
      ${section("Charting", chartList(data.charts))}
    </details>
  `;

  slot.querySelectorAll("[data-lyric-phrase]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phrase = btn.getAttribute("data-lyric-phrase") || "";
      const lyric = document.getElementById("live-concerts-lyric");
      if (lyric instanceof HTMLInputElement && phrase) {
        lyric.value = phrase;
        lyric.focus();
        lyric.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });
  slot.querySelectorAll("[data-lyric-search]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phrase = btn.getAttribute("data-lyric-search") || "";
      if (!phrase) return;
      focusPhraseSearch(phrase);
      addWatchPhrases([phrase]);
    });
  });
}

/** @param {object} s @param {string} albumTitle @param {string} albumYear */
function songRow(s, albumTitle, albumYear) {
  const writers = peopleList(s.writers);
  const studios = peopleList(s.studios);
  const tech = peopleList(s.technicians);
  const phrase = [s.title, albumTitle, albumYear].filter(Boolean).join(" ").trim();
  const pro = (s.proSocieties || [])
    .map(
      (p) =>
        `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="live-concerts-pro-link">${escapeHtml(p.society)}</a>`,
    )
    .join(" ");
  return `<li class="live-concerts-song">
    <div class="live-concerts-song-head">
      <span class="live-concerts-song-pos">${s.position}.</span>
      <strong class="live-concerts-song-title">${escapeHtml(s.title)}</strong>
      ${s.isrc ? `<code class="live-concerts-isrc">${escapeHtml(s.isrc)}</code>` : ""}
      <span class="live-concerts-song-actions">
        <button type="button" class="live-concerts-song-btn" data-lyric-phrase="${escapeHtml(phrase)}">Lyric</button>
        <button type="button" class="live-concerts-song-btn" data-lyric-search="${escapeHtml(phrase)}">Search</button>
      </span>
    </div>
    ${writers ? `<div class="live-concerts-song-credit"><span>Writers</span>${writers}</div>` : ""}
    ${studios ? `<div class="live-concerts-song-credit"><span>Studios</span>${studios}</div>` : ""}
    ${tech ? `<div class="live-concerts-song-credit"><span>Credits</span>${tech}</div>` : ""}
    ${pro ? `<div class="live-concerts-song-pro"><span>PRO / ISRC</span>${pro}</div>` : ""}
  </li>`;
}

/** @param {string} title @param {string} body */
function section(title, body) {
  if (!body) return "";
  return `<div class="live-concerts-meta-section"><h4 class="live-concerts-meta-h4">${escapeHtml(title)}</h4>${body}</div>`;
}

/** @param {object[]} rows */
function peopleList(rows) {
  if (!rows?.length) return "";
  return `<ul class="live-concerts-meta-list">${rows
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.name)}</strong>${r.role ? ` <span class="live-concerts-meta-role">${escapeHtml(r.role)}</span>` : ""}${r.catalog ? ` <span class="live-concerts-meta-role">${escapeHtml(r.catalog)}</span>` : ""}</li>`,
    )
    .join("")}</ul>`;
}

/** @param {object[]} rows */
function linkList(rows) {
  if (!rows?.length) return "";
  return `<ul class="live-concerts-meta-list live-concerts-meta-links">${rows
    .map((r) => {
      const url = r.url || "";
      if (!url) return "";
      return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label || r.title || url)}</a></li>`;
    })
    .join("")}</ul>`;
}

/** @param {object[]} rows */
function imageList(rows) {
  if (!rows?.length) return "";
  return `<div class="live-concerts-meta-images">${rows
    .slice(0, 12)
    .map(
      (r) =>
        `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" class="live-concerts-meta-thumb"><img src="${escapeHtml(r.url)}" alt="" loading="lazy" decoding="async" width="48" height="48" /><span>${escapeHtml(r.type || "image")}</span></a>`,
    )
    .join("")}</div>`;
}

/** @param {object[]} charts */
function chartList(charts) {
  if (!charts?.length) return "";
  return `<ul class="live-concerts-meta-list">${charts
    .map((c) => {
      if (c.url) {
        return `<li><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.chart)} — search</a></li>`;
      }
      const pos = c.position != null ? `#${c.position}` : "";
      const when = c.date ? ` · ${escapeHtml(String(c.date))}` : "";
      return `<li><strong>${escapeHtml(c.chart)}</strong>${pos}${when}${c.title ? ` · ${escapeHtml(c.title)}` : ""} <span class="live-concerts-meta-role">${escapeHtml(c.source || "")}</span></li>`;
    })
    .join("")}</ul>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
