/**
 * Album cover strip for selected artist (MusicBrainz + Cover Art Archive via /api/live/albums).
 */
import { mountAlbumWall, disposeAlbumWallLoader } from "./album-wall-loader.js";
import {
  fetchArtistMeta,
  fetchAlbumMeta,
  paintArtistMeta,
  paintAlbumMeta,
} from "./live-concerts-credits.js";

/** @type {(() => void) | null} */
let cancelMount = null;

/** @type {string | null} */
let currentArtistMbid = null;

/** @type {string} */
let currentArtistName = "";

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
 * @param {HTMLElement | null} [progressEl]
 */
export async function paintArtistAlbums(artist, panel, scrollEl, hintEl, progressEl) {
  if (!(panel instanceof HTMLElement) || !(scrollEl instanceof HTMLElement)) return;
  const name = artist.trim();
  cancelMount?.();
  cancelMount = null;

  if (!name) {
    panel.hidden = true;
    scrollEl.innerHTML = "";
    if (progressEl) progressEl.hidden = true;
    const metaRoot = document.getElementById("live-concerts-meta");
    const metaWrap = document.getElementById("live-concerts-meta-wrap");
    const detailEl = document.getElementById("live-concerts-album-detail");
    if (metaRoot) metaRoot.innerHTML = "";
    if (metaWrap instanceof HTMLElement) metaWrap.hidden = true;
    if (detailEl instanceof HTMLElement) {
      detailEl.hidden = true;
      detailEl.innerHTML = "";
    }
    return;
  }

  panel.hidden = false;
  if (progressEl) {
    progressEl.hidden = false;
    progressEl.value = 0;
    progressEl.max = 100;
  }
  if (hintEl) hintEl.textContent = `Album art · loading ${name}…`;
  scrollEl.innerHTML = '<span class="live-concerts-albums-loading">Fetching catalog…</span>';

  try {
    const data = await fetchArtistAlbums(name);
    const albums = Array.isArray(data.albums) ? data.albums : [];
    const who = data.artist || name;
    if (!albums.length) {
      if (hintEl) hintEl.textContent = `${who} · no album covers found`;
      scrollEl.innerHTML = '<span class="live-concerts-albums-empty">No album art for this artist.</span>';
      if (progressEl) progressEl.hidden = true;
      return;
    }

    if (hintEl) hintEl.textContent = `${who} · ${albums.length} albums (year order)`;
    scrollEl.innerHTML = "";
    currentArtistMbid = data.mbid || null;
    currentArtistName = who;

    const detailEl = document.getElementById("live-concerts-album-detail");
    if (detailEl) {
      detailEl.hidden = true;
      detailEl.innerHTML = "";
    }

    const metaRoot = document.getElementById("live-concerts-meta");
    const metaWrap = document.getElementById("live-concerts-meta-wrap");
    if (metaRoot) {
      metaRoot.innerHTML = '<p class="live-concerts-albums-loading">Loading artist accreditation…</p>';
      if (metaWrap instanceof HTMLDetailsElement) metaWrap.hidden = false;
      void fetchArtistMeta(who, currentArtistMbid || undefined)
        .then((meta) => paintArtistMeta(metaRoot, meta))
        .catch((err) => {
          metaRoot.innerHTML = `<p class="live-concerts-albums-empty">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
        });
    }

    cancelMount = mountAlbumWall(scrollEl, albums, {
      onProgress(loaded, total) {
        if (progressEl instanceof HTMLElement) {
          progressEl.value = total ? Math.round((loaded / total) * 100) : 0;
          if (loaded >= total) {
            window.setTimeout(() => {
              progressEl.hidden = true;
            }, 400);
          }
        }
        if (hintEl && total) {
          hintEl.textContent = `${who} · covers ${loaded}/${total}`;
        }
      },
      onTileClick(a, btn) {
        const title = a.title || "";
        const year = a.year != null ? String(a.year) : "";
        scrollEl.querySelectorAll(".live-concerts-album").forEach((el) => {
          el.classList.toggle("is-selected", el === btn);
        });
        const detailSlot = document.getElementById("live-concerts-album-detail");
        if (!(detailSlot instanceof HTMLElement) || !a.mbid) return;
        detailSlot.hidden = false;
        detailSlot.innerHTML =
          '<p class="live-concerts-albums-loading">Loading album info & lyrics…</p>';
        const phrase = year && year !== "—" ? `${title} ${year}` : title;
        const lyric = document.getElementById("live-concerts-lyric");
        if (lyric instanceof HTMLInputElement && phrase) {
          lyric.value = phrase;
        }
        void fetchAlbumMeta(a.mbid, currentArtistName)
          .then((detail) => paintAlbumMeta(detailSlot, detail))
          .catch((err) => {
            detailSlot.innerHTML = `<p class="live-concerts-albums-empty">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
          });
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (hintEl) hintEl.textContent = `Album art · ${msg}`;
    scrollEl.innerHTML = `<span class="live-concerts-albums-empty">${escapeHtml(msg)}</span>`;
    if (progressEl) progressEl.hidden = true;
  }
}

export { disposeAlbumWallLoader };

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
