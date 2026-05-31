/**
 * Accreditation, per-song PRO credits, and charting UI for live concerts.
 */

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
  root.hidden = false;
  root.innerHTML = `
    <details class="live-concerts-meta-block" open>
      <summary>Artist accreditation · ${escapeHtml(data.artist || "")}</summary>
      ${section("Promo & press kit", linkList(a.promoKit))}
      ${section("Agencies & management", peopleList(a.agencies))}
      ${section("Technicians & production", peopleList(a.technicians))}
      ${section("Tour companies", peopleList(a.tourCompanies))}
      ${section("Rights holders & labels", peopleList(a.rightsHolders))}
      ${section("Sponsors & brands", peopleList(a.sponsors))}
      ${section("Videos", linkList(a.videos))}
      ${section("Charting", chartList(data.charts))}
      ${data.tags?.length ? section("Tags", `<p class="live-concerts-meta-tags">${data.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>`) : ""}
    </details>
    <p class="live-concerts-meta-note">PRO societies (ASCAP, BMI, SESAC, PRS) and Billboard peaks load per album/track below. Click an album cover.</p>
    <div id="live-concerts-album-meta" class="live-concerts-album-meta" hidden></div>
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
  slot.innerHTML = `
    <details class="live-concerts-meta-block" open>
      <summary>${escapeHtml(data.title || "Album")}${data.year ? ` · ${data.year}` : ""}</summary>
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
    <details class="live-concerts-meta-block" open>
      <summary>Songs · lyrics & studio credits (${songs.length})</summary>
      <ol class="live-concerts-song-list">
        ${songs.map((s) => songRow(s)).join("")}
      </ol>
    </details>
  `;
  slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** @param {object} s */
function songRow(s) {
  const writers = peopleList(s.writers);
  const studios = peopleList(s.studios);
  const tech = peopleList(s.technicians);
  const pro = (s.proSocieties || [])
    .map(
      (p) =>
        `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="live-concerts-pro-link">${escapeHtml(p.society)}</a>`,
    )
    .join(" ");
  return `<li class="live-concerts-song">
    <span class="live-concerts-song-pos">${s.position}.</span>
    <strong class="live-concerts-song-title">${escapeHtml(s.title)}</strong>
    ${s.isrc ? `<code class="live-concerts-isrc">${escapeHtml(s.isrc)}</code>` : ""}
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
