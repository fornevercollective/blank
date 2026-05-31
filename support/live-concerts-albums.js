/**
 * Album cover strip for selected artist (MusicBrainz + Cover Art Archive via /api/live/albums).
 */

/** @param {string} artist */
export async function fetchArtistAlbums(artist) {
  const q = encodeURIComponent(artist.trim());
  if (!q) return { ok: true, albums: [] };
  const res = await fetch(`/api/live/albums?artist=${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `albums (${res.status})`);
  }
  return data;
}

/**
 * @param {string} artist
 * @param {HTMLElement | null} panel
 * @param {HTMLElement | null} scrollEl
 * @param {HTMLElement | null} hintEl
 */
export async function paintArtistAlbums(artist, panel, scrollEl, hintEl) {
  if (!(panel instanceof HTMLElement) || !(scrollEl instanceof HTMLElement)) return;
  const name = artist.trim();
  if (!name) {
    panel.hidden = true;
    scrollEl.innerHTML = "";
    return;
  }

  panel.hidden = false;
  if (hintEl) hintEl.textContent = `Album art · loading ${name}…`;
  scrollEl.innerHTML = '<span class="live-concerts-albums-loading">Loading covers…</span>';

  try {
    const data = await fetchArtistAlbums(name);
    const albums = Array.isArray(data.albums) ? data.albums : [];
    const who = data.artist || name;
    if (hintEl) {
      hintEl.textContent = albums.length
        ? `${who} · ${albums.length} albums (year order)`
        : `${who} · no album covers found`;
    }
    if (!albums.length) {
      scrollEl.innerHTML = '<span class="live-concerts-albums-empty">No album art for this artist.</span>';
      return;
    }
    scrollEl.innerHTML = albums
      .map((a) => albumCardHtml(a))
      .join("");
    scrollEl.querySelectorAll("[data-album-title]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-album-title") || "";
        const year = btn.getAttribute("data-album-year") || "";
        const lyric = document.getElementById("live-concerts-lyric");
        if (lyric instanceof HTMLInputElement && title) {
          lyric.value = year ? `${title} ${year}` : title;
          lyric.focus();
        }
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (hintEl) hintEl.textContent = `Album art · ${msg}`;
    scrollEl.innerHTML = `<span class="live-concerts-albums-empty">${escapeHtml(msg)}</span>`;
  }
}

/** @param {{ title: string, year?: number | null, coverUrl?: string, mbid?: string }} a */
function albumCardHtml(a) {
  const year = a.year != null ? String(a.year) : "—";
  const cover = a.coverUrl
    ? `<img src="${escapeHtml(a.coverUrl)}" alt="" width="72" height="72" loading="lazy" decoding="async" class="live-concerts-album-cover" onerror="this.classList.add('is-missing')" />`
    : '<span class="live-concerts-album-cover live-concerts-album-cover--ph" aria-hidden="true"></span>';
  return `<button type="button" class="live-concerts-album" role="listitem" data-album-title="${escapeHtml(a.title)}" data-album-year="${escapeHtml(year)}" title="${escapeHtml(a.title)} (${year})">
    ${cover}
    <span class="live-concerts-album-year">${escapeHtml(year)}</span>
    <span class="live-concerts-album-title">${escapeHtml(a.title)}</span>
  </button>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
