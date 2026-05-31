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

/** @param {{ artist: string, track: string, album?: string, durationMs?: number }} q */
export async function fetchSongLyrics(q) {
  const params = new URLSearchParams({
    artist: q.artist,
    track: q.track,
  });
  if (q.album) params.set("album", q.album);
  if (Number.isFinite(q.durationMs) && q.durationMs > 0) {
    params.set("durationMs", String(Math.round(q.durationMs)));
  }
  const res = await fetch(`/api/live/lyrics?${params}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `lyrics (${res.status})`);
  }
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
 * @param {{ albums?: { title?: string, year?: number|null, mbid?: string, coverUrl?: string }[], onAlbumPick?: (album: object) => void }} [opts]
 */
export function paintArtistMeta(root, data, opts = {}) {
  if (!(root instanceof HTMLElement)) return;
  const a = data.accreditation || {};
  const wrap = document.getElementById("live-concerts-meta-wrap");
  if (wrap instanceof HTMLDetailsElement) {
    wrap.hidden = false;
    const sum = wrap.querySelector(".live-concerts-meta-summary");
    if (sum) sum.textContent = `Artist accreditation · ${data.artist || ""}`;
  }
  const bandCol = bandAlbumColumn(data, opts.albums || []);
  root.innerHTML = metaGrid([
    bandCol,
    {
      title: "Credits & production",
      sections: [
        section("Agencies & management", peopleList(a.agencies)),
        section("Technicians & production", peopleList(a.technicians)),
        section("Tour companies", peopleList(a.tourCompanies)),
      ],
    },
    {
      title: "Rights & charts",
      sections: [
        section("Rights holders & labels", peopleList(a.rightsHolders)),
        section("Sponsors & brands", peopleList(a.sponsors)),
        section("Charting", chartList(data.charts)),
      ],
    },
    {
      title: "Promo & media",
      sections: [
        section("Promo & press kit", linkList(a.promoKit)),
        section("Videos", linkList(a.videos)),
        data.tags?.length
          ? section(
              "Tags",
              `<p class="live-concerts-meta-tags">${data.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</p>`,
            )
          : "",
      ],
    },
  ]);
  wireMetaAlbumTiles(root, opts.onAlbumPick);
}

/**
 * @param {object} data
 * @param {{ title?: string, year?: number|null, mbid?: string, coverUrl?: string }[]} albums
 */
function bandAlbumColumn(data, albums) {
  const p = data.profile || {};
  const name = p.name || data.artist || "";
  const metaBits = [p.type, p.country, p.activeYears].filter(Boolean);
  const aliasLine = p.aliases?.length
    ? `<p class="live-concerts-band-aliases">${p.aliases.map((x) => escapeHtml(x)).join(" · ")}</p>`
    : "";
  const disam = p.disambiguation
    ? `<p class="live-concerts-band-disam">${escapeHtml(p.disambiguation)}</p>`
    : "";
  const mbLink = p.mbUrl
    ? `<a class="live-concerts-band-mb" href="${escapeHtml(p.mbUrl)}" target="_blank" rel="noopener noreferrer">MusicBrainz</a>`
    : "";
  const tagHtml = data.tags?.length
    ? `<div class="live-concerts-band-tags">${data.tags
        .slice(0, 10)
        .map((t) => `<span>${escapeHtml(t)}</span>`)
        .join("")}</div>`
    : "";
  const albumGrid =
    albums.length > 0
      ? `<div class="live-concerts-meta-album-grid" role="list">${albums
          .slice(0, 12)
          .map((al) => metaAlbumTile(al))
          .join("")}</div>`
      : `<p class="live-concerts-meta-note">Album covers load in the strip above.</p>`;
  const body = `
    <div class="live-concerts-band-hero">
      <h3 class="live-concerts-band-name">${escapeHtml(name)}</h3>
      ${metaBits.length ? `<p class="live-concerts-band-meta">${escapeHtml(metaBits.join(" · "))}</p>` : ""}
      ${disam}
      ${aliasLine}
      ${tagHtml}
      ${mbLink}
    </div>
    <div class="live-concerts-meta-section">
      <h4 class="live-concerts-meta-h4">Discography</h4>
      ${albumGrid}
    </div>`;
  return {
    title: "Band & albums",
    sections: [body],
    wide: true,
  };
}

/** @param {{ title?: string, year?: number|null, mbid?: string, coverUrl?: string }} al */
function metaAlbumTile(al) {
  const title = al.title || "Album";
  const year = al.year != null ? String(al.year) : "";
  const cover = al.coverUrl || "";
  const mbid = al.mbid || "";
  const ph = `<span class="live-concerts-meta-album-ph" aria-hidden="true">${escapeHtml(title.slice(0, 1))}</span>`;
  const img = cover
    ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" />`
    : ph;
  return `<button type="button" class="live-concerts-meta-album" role="listitem" data-meta-album-mbid="${escapeHtml(mbid)}" data-meta-album-title="${escapeHtml(title)}" data-meta-album-year="${escapeHtml(year)}" title="${escapeHtml(title)}${year ? ` (${year})` : ""}">${img}<span class="live-concerts-meta-album-label">${escapeHtml(title)}</span>${year ? `<span class="live-concerts-meta-album-year">${escapeHtml(year)}</span>` : ""}</button>`;
}

/** @param {HTMLElement} root @param {((album: object) => void) | undefined} onPick */
function wireMetaAlbumTiles(root, onPick) {
  if (typeof onPick !== "function") return;
  root.querySelectorAll("[data-meta-album-mbid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mbid = btn.getAttribute("data-meta-album-mbid") || "";
      if (!mbid) return;
      onPick({
        mbid,
        title: btn.getAttribute("data-meta-album-title") || "",
        year: btn.getAttribute("data-meta-album-year") || "",
        coverUrl: btn.querySelector("img")?.getAttribute("src") || "",
      });
      root.querySelectorAll(".live-concerts-meta-album").forEach((el) => {
        el.classList.toggle("is-selected", el === btn);
      });
    });
  });
}

/**
 * @param {HTMLElement | null} slot
 * @param {object} data album-detail response
 * @param {{ coverUrl?: string, variantUrls?: { url: string, role?: string }[] }} [opts]
 */
export function paintAlbumMeta(slot, data, opts = {}) {
  if (!(slot instanceof HTMLElement)) return;
  slot.hidden = false;
  const a = data.accreditation || {};
  const songs = Array.isArray(data.songs) ? data.songs : [];
  const title = data.title || "Album";
  const year = data.year ? String(data.year) : "";
  const artistName = opts.artistName || data.artist || "";
  const coverFromOpts = opts.coverUrl || "";
  const coverFromImages = a.images?.[0]?.url || a.images?.[0]?.thumb || "";
  const coverUrl = coverFromOpts || coverFromImages;
  const coverAlt = `${title}${year ? ` (${year})` : ""} cover`;
  const coverHtml = coverUrl
    ? `<img class="live-concerts-album-focus-cover" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(coverAlt)}" loading="lazy" decoding="async" />`
    : `<div class="live-concerts-album-focus-cover live-concerts-album-focus-cover--ph" aria-hidden="true"></div>`;

  slot.innerHTML = `
    <div class="live-concerts-album-detail-layout">
      <div class="live-concerts-album-detail-art" aria-hidden="${coverUrl ? "false" : "true"}">
        ${coverHtml}
      </div>
      <div class="live-concerts-album-detail-main">
        <header class="live-concerts-album-focus-head">
          ${albumFocusHeadHtml(data, title, year)}
        </header>
        <details class="live-concerts-meta-block live-concerts-album-lyrics" open>
          <summary>Songs · lyrics & PRO (${songs.length})</summary>
      <div class="live-concerts-song-list-cols" aria-hidden="true">
        <span class="live-concerts-song-list-col live-concerts-song-list-col--track">Track · credits</span>
        <span class="live-concerts-song-list-col live-concerts-song-list-col--lyrics">Lyrics</span>
      </div>
      <ol class="live-concerts-song-list">
        ${songs.length ? songs.map((s) => songRow(s, title, year, artistName)).join("") : "<li class=\"live-concerts-picks-empty\">No track listing in MusicBrainz for this release.</li>"}
      </ol>
        </details>
      </div>
    </div>
  `;

  paintAlbumAccreditation(a, data);

  slot.querySelectorAll("[data-lyric-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void loadSongLyrics(btn, "lyric");
    });
  });
  slot.querySelectorAll("[data-lyric-search]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void loadSongLyrics(btn, "search");
    });
  });
}

/** @param {Element} btn @param {"lyric"|"search"} mode */
async function loadSongLyrics(btn, mode) {
  const song = btn.closest(".live-concerts-song");
  const slot = song?.querySelector("[data-lyric-body]");
  if (!(slot instanceof HTMLElement) || !(song instanceof HTMLElement)) return;

  const artist = song.dataset.lyricArtist || "";
  const track = song.dataset.lyricTrack || "";
  const album = song.dataset.lyricAlbum || "";
  const durationMs = Number(song.dataset.lyricDuration);

  song
    .closest("#live-concerts-album-detail")
    ?.querySelectorAll(".live-concerts-song.is-lyric-active")
    .forEach((el) => el.classList.remove("is-lyric-active"));
  song.classList.add("is-lyric-active");

  const phrase = [track, album].filter(Boolean).join(" · ");
  const lyricInput = document.getElementById("live-concerts-lyric");
  if (lyricInput instanceof HTMLInputElement && phrase) {
    lyricInput.value = `${artist} ${track}`.trim();
    lyricInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (mode === "search") {
    focusPhraseSearch(`${artist} ${track}`.trim());
    addWatchPhrases([`${artist} ${track}`.trim()]);
  }

  slot.innerHTML = `<p class="live-concerts-song-lyrics-loading">Loading lyrics…</p>`;

  /** @type {string[]} */
  const parts = [];

  try {
    const data = await fetchSongLyrics({
      artist,
      track,
      album,
      durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    });
    if (data.plainLyrics) {
      parts.push(
        `<p class="live-concerts-song-lyrics-src">LRCLIB</p><pre class="live-concerts-song-lyrics-text">${escapeHtml(data.plainLyrics)}</pre>`,
      );
    } else {
      parts.push(
        `<p class="live-concerts-song-lyrics-empty">${escapeHtml(data.message || "No synced lyrics in LRCLIB.")}</p>`,
      );
    }
  } catch (e) {
    parts.push(
      `<p class="live-concerts-song-lyrics-empty">Lyrics fetch failed: ${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`,
    );
  }

  if (mode === "search") {
    const hit = globalThis.blankPhraseSearch?.firstHit?.(`${artist} ${track}`.trim());
    if (hit?.text) {
      parts.push(
        `<p class="live-concerts-song-lyrics-src">Transcript</p><p class="live-concerts-song-lyrics-hit">${escapeHtml(hit.text)}</p>`,
      );
    }
  }

  slot.innerHTML = parts.join("");
}

/** @param {object} data @param {string} title @param {string} year */
function albumFocusHeadHtml(data, title, year) {
  const head = data.headliner;
  const mus = data.musicians || { studio: [], touring: [], lineup: [] };
  const timeline = Array.isArray(data.releaseTimeline) ? data.releaseTimeline : [];
  const awards = Array.isArray(data.awards) ? data.awards : [];
  const charts = Array.isArray(data.charts) ? data.charts : [];
  const associations = Array.isArray(data.associations) ? data.associations : [];
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const tourRoster = Array.isArray(data.tourRoster) ? data.tourRoster : [];
  const financial = Array.isArray(data.financial) ? data.financial : [];
  const trivia = data.trivia || data.annotation || null;

  const labelLine = data.labels?.length
    ? `<p class="live-concerts-album-focus-labels">${data.labels.map((l) => escapeHtml(l.name + (l.catalog ? ` · ${l.catalog}` : "") + (l.country ? ` (${l.country})` : ""))).join(" · ")}</p>`
    : "";

  let lede = "";
  if (head) {
    const bits = [];
    if (head.birthDay || head.birthLabel) {
      bits.push(`born ${escapeHtml(head.birthDay || head.birthLabel)}`);
    }
    if (head.ageAtRelease != null && year) {
      bits.push(`age ${head.ageAtRelease} at release (${escapeHtml(year)})`);
    }
    if (head.ageBracket) bits.push(escapeHtml(head.ageBracket));
    if (head.country) bits.push(escapeHtml(head.country));
    if (bits.length) lede = `<p class="live-concerts-focus-lede">${bits.join(" · ")}</p>`;
  }

  const musicianBlock = (label, rows) => {
    if (!rows?.length) return "";
    return `<div class="live-concerts-focus-musician-group">
      <p class="live-concerts-focus-musician-kind">${escapeHtml(label)}</p>
      <ul class="live-concerts-focus-musician-list">${rows
        .map((m) => {
          const roles = (m.roles || []).filter(Boolean).join(", ");
          const age =
            m.ageAtRelease != null
              ? `<span class="live-concerts-focus-age">${m.ageAtRelease}${m.ageBracket ? ` · ${escapeHtml(m.ageBracket)}` : ""}</span>`
              : m.birthLabel
                ? `<span class="live-concerts-focus-age">${escapeHtml(m.birthLabel)}</span>`
                : "";
          return `<li><strong>${escapeHtml(m.name)}</strong>${roles ? ` <span class="live-concerts-focus-role">${escapeHtml(roles)}</span>` : ""}${age}</li>`;
        })
        .join("")}</ul>
    </div>`;
  };

  const musiciansPanel =
    mus.studio?.length || mus.touring?.length || mus.lineup?.length
      ? `<section class="live-concerts-focus-panel" aria-label="Musicians">
      <h4 class="live-concerts-focus-h4">Musician throughline</h4>
      ${musicianBlock("Studio / session", mus.studio)}
      ${musicianBlock("Touring / live", mus.touring)}
      ${musicianBlock("Album lineup", mus.lineup)}
    </section>`
      : "";

  const timelinePanel = timeline.length
    ? `<section class="live-concerts-focus-panel" aria-label="Release dates">
      <h4 class="live-concerts-focus-h4">Release &amp; editions</h4>
      <ul class="live-concerts-focus-timeline">${timeline
        .slice(0, 14)
        .map(
          (ev) =>
            `<li><span class="live-concerts-focus-when">${escapeHtml(ev.dateLabel || ev.date || "—")}</span>${ev.country ? ` <span class="live-concerts-focus-where">${escapeHtml(ev.country)}</span>` : ""}${ev.kind === "primary" ? ' <span class="live-concerts-focus-tag">primary</span>' : ""}${ev.kind === "re-release" ? ' <span class="live-concerts-focus-tag">re-release</span>' : ""}${ev.hasTime ? ' <span class="live-concerts-focus-tag">time</span>' : ""}${ev.note ? ` <span class="live-concerts-focus-note">${escapeHtml(ev.note)}</span>` : ""}</li>`,
        )
        .join("")}</ul>
    </section>`
    : "";

  const awardRows = [
    ...awards.map((a) => ({
      title: a.title,
      detail: a.detail,
      when: a.dateLabel || a.date,
    })),
    ...charts
      .filter((c) => c.position != null || /chart|hot|billboard/i.test(c.chart || ""))
      .map((c) => ({
        title: c.chart || "Chart",
        detail: c.position != null ? `#${c.position}` : c.title,
        when: c.date || "",
      })),
  ];
  const awardsPanel = awardRows.length
    ? `<section class="live-concerts-focus-panel" aria-label="Awards and charts">
      <h4 class="live-concerts-focus-h4">Awards &amp; chart peaks</h4>
      <ul class="live-concerts-focus-awards">${awardRows
        .slice(0, 12)
        .map(
          (a) =>
            `<li><strong>${escapeHtml(a.title)}</strong>${a.detail ? ` — ${escapeHtml(String(a.detail))}` : ""}${a.when ? ` <span class="live-concerts-focus-when">${escapeHtml(String(a.when))}</span>` : ""}</li>`,
        )
        .join("")}</ul>
    </section>`
    : "";

  const assocPanel = associations.length
    ? `<section class="live-concerts-focus-panel" aria-label="Associations">
      <h4 class="live-concerts-focus-h4">Associations</h4>
      <ul class="live-concerts-focus-assoc">${associations
        .map(
          (a) =>
            `<li><strong>${escapeHtml(a.name)}</strong> <span class="live-concerts-focus-role">${escapeHtml(a.type)}</span>${a.spanLabel ? ` <span class="live-concerts-focus-when">${escapeHtml(a.spanLabel)}</span>` : ""}</li>`,
        )
        .join("")}</ul>
    </section>`
    : "";

  const metaPanel =
    tags.length || data.annotation
      ? `<section class="live-concerts-focus-panel live-concerts-focus-panel--wide" aria-label="Notes">
      <h4 class="live-concerts-focus-h4">Tags &amp; notes</h4>
      ${tags.length ? `<p class="live-concerts-focus-tags">${tags.map((t) => `<span class="live-concerts-focus-tag">${escapeHtml(t)}</span>`).join(" ")}</p>` : ""}
      ${data.annotation ? `<p class="live-concerts-focus-annotation">${escapeHtml(data.annotation.slice(0, 480))}${data.annotation.length > 480 ? "…" : ""}</p>` : ""}
    </section>`
      : "";

  const panels = [musiciansPanel, timelinePanel, awardsPanel, assocPanel, metaPanel]
    .filter(Boolean)
    .join("");

  return `
    <h3 class="live-concerts-album-focus-title">${escapeHtml(title)}${year ? ` <span class="live-concerts-album-focus-year">${escapeHtml(year)}</span>` : ""}</h3>
    ${labelLine}
    ${lede}
    ${panels ? `<div class="live-concerts-focus-panels">${panels}</div>` : ""}
  `;
}

/** @param {object} accred @param {object} data */
function paintAlbumAccreditation(accred, data) {
  const slot = document.getElementById("live-concerts-album-accred");
  if (!(slot instanceof HTMLElement)) return;
  slot.hidden = false;
  slot.removeAttribute("hidden");
  slot.innerHTML = albumAccreditationHtml(accred, data);
  const block = slot.querySelector(".live-concerts-album-accred-block");
  if (block instanceof HTMLDetailsElement) block.open = true;
}

/** @param {object} accred @param {object} data */
function albumAccreditationHtml(accred, data) {
  return `<details class="live-concerts-meta-block live-concerts-album-accred-block" open>
    <summary>Album accreditation</summary>
    ${section("Images / artwork", imageList(accred.images))}
    ${section("Videos", linkList(accred.videos))}
    ${section("Agencies", peopleList(accred.agencies))}
    ${section("Technicians", peopleList(accred.technicians))}
    ${section("Tour", peopleList(accred.tourCompanies))}
    ${section("Rights / labels", peopleList(accred.rightsHolders))}
    ${section("Sponsors", peopleList(accred.sponsors))}
    ${section("Promo kit", linkList(accred.promoKit))}
    ${section("Charting", chartList(data.charts))}
  </details>`;
}

/** Clear album accreditation under the cover column. */
export function clearAlbumAccreditation() {
  const slot = document.getElementById("live-concerts-album-accred");
  if (!(slot instanceof HTMLElement)) return;
  slot.hidden = true;
  slot.innerHTML = "";
}

/** @param {object} s @param {string} albumTitle @param {string} albumYear @param {string} artistName */
function songRow(s, albumTitle, albumYear, artistName) {
  const writers = peopleList(s.writers);
  const studios = peopleList(s.studios);
  const tech = peopleList(s.technicians);
  const pro = (s.proSocieties || [])
    .map(
      (p) =>
        `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="live-concerts-pro-link">${escapeHtml(p.society)}</a>`,
    )
    .join(" ");
  const extras = [
    s.meaning ? `<div class="live-concerts-song-extra"><span>Meaning</span> ${escapeHtml(s.meaning)}</div>` : "",
    s.trivia ? `<div class="live-concerts-song-extra"><span>Notes</span> ${escapeHtml(String(s.trivia).slice(0, 220))}${String(s.trivia).length > 220 ? "…" : ""}</div>` : "",
    s.tags?.length
      ? `<div class="live-concerts-song-extra"><span>Tags</span> ${s.tags.map((t) => escapeHtml(t)).join(", ")}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<li class="live-concerts-song" data-lyric-artist="${escapeHtml(artistName)}" data-lyric-track="${escapeHtml(s.title)}" data-lyric-album="${escapeHtml(albumTitle)}" data-lyric-duration="${s.lengthMs || ""}">
    <div class="live-concerts-song-row">
      <div class="live-concerts-song-info">
        <div class="live-concerts-song-toolbar">
          <button type="button" class="live-concerts-song-btn" data-lyric-load>Lyric</button>
          <button type="button" class="live-concerts-song-btn" data-lyric-search>Search</button>
        </div>
        <div class="live-concerts-song-head">
          <span class="live-concerts-song-pos">${s.position}.</span>
          <strong class="live-concerts-song-title">${escapeHtml(s.title)}</strong>
          ${s.isrc ? `<code class="live-concerts-isrc">${escapeHtml(s.isrc)}</code>` : ""}
        </div>
        ${writers ? `<div class="live-concerts-song-credit"><span>Writers</span>${writers}</div>` : ""}
        ${studios ? `<div class="live-concerts-song-credit"><span>Studios</span>${studios}</div>` : ""}
        ${tech ? `<div class="live-concerts-song-credit"><span>Credits</span>${tech}</div>` : ""}
        ${pro ? `<div class="live-concerts-song-pro"><span>PRO / ISRC</span>${pro}</div>` : ""}
        ${extras}
      </div>
      <div class="live-concerts-song-lyrics" data-lyric-slot aria-live="polite">
        <p class="live-concerts-song-lyrics-body" data-lyric-body>Click <strong>Lyric</strong> (LRCLIB) or <strong>Search</strong> (lyrics + transcript).</p>
      </div>
    </div>
  </li>`;
}

/** @param {{ title: string, sections: string[], wide?: boolean }[]} cols */
function metaGrid(cols) {
  const html = cols
    .map((col) => {
      const body = col.sections.filter(Boolean).join("");
      if (!body) return "";
      const wide = col.wide ? " live-concerts-meta-col--profile" : "";
      return `<div class="live-concerts-meta-col${wide}" role="region" aria-label="${escapeHtml(col.title)}"><h5 class="live-concerts-meta-col-title">${escapeHtml(col.title)}</h5>${body}</div>`;
    })
    .filter(Boolean)
    .join("");
  return html ? `<div class="live-concerts-meta-grid">${html}</div>` : "";
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
