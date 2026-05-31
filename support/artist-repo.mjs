/**
 * Persistent artist repository — lyrics, album art, search index for overview / VWall / mueee / ugrad.
 * Catalog source: support/artists-major.json (2122 artists).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchArtistAlbums } from "./live-concerts.mjs";
import { lookupLyrics } from "./live-concerts-lyrics.mjs";
import { LIVE_GENRE_TABS } from "./live-concerts-genres.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "artists-major.json");
const MB_AGENT = "BlankArtistRepo/1.0 (+https://github.com/blank-local)";
const MB_MIN_GAP_MS = 1100;
const LRC_GAP_MS = 220;
const REPO_VERSION = 1;

let mbLastFetch = 0;

/** @returns {string} */
export function getRepoRoot() {
  const env = process.env.BLANK_ARTIST_REPO?.trim();
  if (env) return path.resolve(env);
  return path.join(__dirname, "cache", "artist-repo");
}

/** @param {string} name */
export function artistSlug(name) {
  const s = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "unknown";
}

/** @param {string} album @param {string} track */
export function trackSlug(album, track) {
  return artistSlug(`${album}--${track}`);
}

/** @param {string} p */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/** @param {string} file @param {unknown} data */
function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** @param {string} file */
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** @param {object} entry */
export function inferGenre(entry) {
  const name = String(entry?.name || "");
  for (const tab of LIVE_GENRE_TABS) {
    if (tab.id === "all" || !tab.match) continue;
    if (tab.match.test(name)) return tab.id;
  }
  if (entry?.warped?.totalYears) return "rock";
  /** @type {Record<string, string>} */
  const byRegion = {
    apac: "pop",
    latam: "latin",
    "africa-me": "hiphop",
    eu: "dance",
    uk: "rock",
    us: "rock",
    "ca-oc": "rock",
  };
  return byRegion[String(entry?.region || "")] || "rock";
}

let catalogCache = /** @type {{ version: number, count: number, artists: object[] } | null} */ (null);

export function loadCatalog() {
  if (catalogCache) return catalogCache;
  if (!fs.existsSync(CATALOG_PATH)) {
    catalogCache = { version: 0, count: 0, artists: [] };
    return catalogCache;
  }
  catalogCache = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  return catalogCache;
}

/** @param {string} slug */
function artistDir(slug) {
  return path.join(getRepoRoot(), "artists", slug);
}

export function indexPath() {
  return path.join(getRepoRoot(), "index.json");
}

export function loadIndex() {
  const existing = readJson(indexPath());
  if (existing?.version === REPO_VERSION && Array.isArray(existing.artists)) {
    return existing;
  }
  const catalog = loadCatalog();
  const artists = (catalog.artists || []).map((a) => {
    const slug = artistSlug(a.name);
    return {
      slug,
      name: a.name,
      letter: a.letter,
      script: a.script,
      region: a.region,
      genre: inferGenre(a),
      warped: a.warped || null,
      mbid: null,
      albumCount: 0,
      trackCount: 0,
      lyricsCount: 0,
      syncedAt: null,
    };
  });
  return {
    version: REPO_VERSION,
    catalogVersion: catalog.version,
    catalogCount: catalog.count,
    updatedAt: new Date().toISOString(),
    artists,
  };
}

/** @param {object} index */
export function saveIndex(index) {
  index.updatedAt = new Date().toISOString();
  writeJson(indexPath(), index);
}

/** @param {string} slug @param {Partial<object>} patch */
function patchIndexArtist(slug, patch) {
  const index = loadIndex();
  const row = index.artists.find((a) => a.slug === slug);
  if (row) Object.assign(row, patch);
  saveIndex(index);
  return index;
}

/** @param {string} path */
async function mbFetch(path) {
  const gap = Date.now() - mbLastFetch;
  if (gap < MB_MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MB_MIN_GAP_MS - gap));
  }
  mbLastFetch = Date.now();
  const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
    headers: { "User-Agent": MB_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  return res.json();
}

/**
 * Light tracklist for lyrics sync (2–3 MB calls per release group).
 * @param {string} rgMbid
 * @param {number} maxTracks
 */
export async function fetchAlbumTracklist(rgMbid, maxTracks = 16) {
  if (!rgMbid) return [];
  const rg = await mbFetch(
    `release-group/${rgMbid}?inc=releases&fmt=json`,
  );
  const releases = Array.isArray(rg.releases) ? rg.releases : [];
  const pick =
    releases.find((r) => r.status === "Official") ||
    releases[0];
  if (!pick?.id) return [];

  const rel = await mbFetch(
    `release/${pick.id}?inc=recordings&fmt=json`,
  );
  /** @type {{ position: number, title: string, lengthMs?: number }[]} */
  const tracks = [];
  for (const medium of rel.media || []) {
    for (const t of medium.tracks || []) {
      tracks.push({
        position: t.position ?? tracks.length + 1,
        title: String(t.title || t.recording?.title || "").trim(),
        lengthMs: t.length || t.recording?.length,
      });
      if (tracks.length >= maxTracks) break;
    }
    if (tracks.length >= maxTracks) break;
  }
  return tracks.filter((t) => t.title);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} name
 * @param {{
 *   maxAlbums?: number,
 *   maxTracksPerAlbum?: number,
 *   fetchLyrics?: boolean,
 *   skipIfSynced?: boolean,
 * }} [opts]
 */
export async function syncArtist(name, opts = {}) {
  const maxAlbums = opts.maxAlbums ?? 8;
  const maxTracksPerAlbum = opts.maxTracksPerAlbum ?? 12;
  const fetchLyrics = opts.fetchLyrics !== false;
  const catalog = loadCatalog();
  const entry =
    catalog.artists.find(
      (a) => String(a.name).toLowerCase() === String(name).toLowerCase(),
    ) || { name, letter: "#", script: "latin", region: "us" };

  const slug = artistSlug(entry.name);
  const dir = artistDir(slug);
  const profileFile = path.join(dir, "profile.json");

  if (opts.skipIfSynced && fs.existsSync(profileFile)) {
    const prev = readJson(profileFile);
    if (prev?.syncedAt) {
      return { ok: true, slug, skipped: true, ...prev };
    }
  }

  const albumData = await fetchArtistAlbums(entry.name);
  const albums = (albumData.albums || []).slice(0, maxAlbums);
  const genre = inferGenre(entry);

  const profile = {
    slug,
    name: albumData.artist || entry.name,
    catalogName: entry.name,
    letter: entry.letter,
    script: entry.script,
    region: entry.region,
    genre,
    warped: entry.warped || null,
    mbid: albumData.mbid || null,
    albumCount: 0,
    trackCount: 0,
    lyricsCount: 0,
    syncedAt: new Date().toISOString(),
  };

  /** @type {{ mbid: string, title: string, year?: number|null, coverUrl: string, tracks: object[] }[]} */
  const albumsOut = [];
  let trackCount = 0;
  let lyricsCount = 0;
  const lyricsDir = path.join(dir, "lyrics");
  ensureDir(lyricsDir);

  for (const alb of albums) {
    /** @type {{ position: number, title: string, slug: string, lengthMs?: number, hasLyrics?: boolean }[]} */
    let tracks = [];
    if (alb.mbid) {
      try {
        const raw = await fetchAlbumTracklist(alb.mbid, maxTracksPerAlbum);
        tracks = raw.map((t) => ({
          position: t.position,
          title: t.title,
          slug: trackSlug(alb.title, t.title),
          lengthMs: t.lengthMs,
        }));
      } catch {
        /* skip tracks for this album */
      }
    }
    trackCount += tracks.length;

    if (fetchLyrics) {
      for (const tr of tracks) {
        await sleep(LRC_GAP_MS);
        try {
          const ly = await lookupLyrics({
            artist: profile.name,
            track: tr.title,
            album: alb.title,
            durationMs: tr.lengthMs,
          });
          const hasText = Boolean(ly.plainLyrics || ly.syncedLyrics);
          tr.hasLyrics = hasText;
          if (hasText) {
            lyricsCount += 1;
            writeJson(path.join(lyricsDir, `${tr.slug}.json`), {
              ...ly,
              album: alb.title,
              track: tr.title,
              slug: tr.slug,
            });
          }
        } catch {
          /* continue */
        }
      }
    }

    albumsOut.push({
      mbid: alb.mbid,
      title: alb.title,
      year: alb.year ?? null,
      coverUrl: alb.coverUrl || "",
      variantUrls: alb.variantUrls || [],
      tracks,
    });
  }

  profile.albumCount = albumsOut.length;
  profile.trackCount = trackCount;
  profile.lyricsCount = lyricsCount;

  writeJson(profileFile, profile);
  writeJson(path.join(dir, "albums.json"), {
    ok: true,
    artist: profile.name,
    mbid: profile.mbid,
    albums: albumsOut,
    syncedAt: profile.syncedAt,
  });

  patchIndexArtist(slug, {
    name: profile.name,
    mbid: profile.mbid,
    genre,
    albumCount: albumsOut.length,
    trackCount,
    lyricsCount,
    syncedAt: profile.syncedAt,
  });

  return {
    ok: true,
    slug,
    profile,
    albumCount: albumsOut.length,
    trackCount,
    lyricsCount,
  };
}

/** @param {string} slug */
export function getArtistBundle(slug) {
  const dir = artistDir(slug);
  const profile = readJson(path.join(dir, "profile.json"));
  const albums = readJson(path.join(dir, "albums.json"));
  if (!profile) return null;
  return { profile, albums };
}

/** @param {string} slug @param {string} trackKey */
export function getLyrics(slug, trackKey) {
  const file = path.join(artistDir(slug), "lyrics", `${trackKey}.json`);
  return readJson(file);
}

/**
 * @param {{
 *   q?: string,
 *   genre?: string,
 *   letter?: string,
 *   region?: string,
 *   warpedOnly?: boolean,
 *   syncedOnly?: boolean,
 *   limit?: number,
 *   offset?: number,
 * }} opts
 */
export function searchArtists(opts = {}) {
  const index = loadIndex();
  let rows = index.artists.slice();
  const q = (opts.q || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.slug.includes(q.replace(/\s+/g, "-")),
    );
  }
  if (opts.genre && opts.genre !== "all") {
    rows = rows.filter((a) => a.genre === opts.genre);
  }
  if (opts.letter && opts.letter !== "all") {
    const L = opts.letter.toUpperCase();
    rows = rows.filter((a) => (a.letter || "#").toUpperCase() === L);
  }
  if (opts.region && opts.region !== "all") {
    rows = rows.filter((a) => a.region === opts.region);
  }
  if (opts.warpedOnly) {
    rows = rows.filter((a) => a.warped?.totalYears > 0);
  }
  if (opts.syncedOnly) {
    rows = rows.filter((a) => a.syncedAt);
  }
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(500, Math.max(1, opts.limit ?? 50));
  const total = rows.length;
  rows = rows.slice(offset, offset + limit);
  return { ok: true, total, offset, limit, artists: rows };
}

/**
 * VWall-compatible image tiles from stored album covers.
 * @param {{ genre?: string, q?: string, limit?: number, offset?: number }} opts
 */
export function vwallTiles(opts = {}) {
  const index = loadIndex();
  let slugs = index.artists.filter((a) => a.syncedAt && a.albumCount > 0);
  if (opts.genre && opts.genre !== "all") {
    slugs = slugs.filter((a) => a.genre === opts.genre);
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    slugs = slugs.filter((a) => a.name.toLowerCase().includes(q));
  }

  /** @type {{ url: string, title: string, snippet: string, artist: string, slug: string, genre: string, album?: string }[]} */
  const items = [];
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 120));
  const offset = Math.max(0, opts.offset ?? 0);
  let skipped = 0;

  for (const row of slugs) {
    const bundle = getArtistBundle(row.slug);
    const albums = bundle?.albums?.albums || [];
    for (const alb of albums) {
      if (!alb.coverUrl) continue;
      if (skipped < offset) {
        skipped += 1;
        continue;
      }
      items.push({
        url: alb.coverUrl,
        title: `${row.name} — ${alb.title}`,
        snippet: [alb.year, row.genre, row.region].filter(Boolean).join(" · "),
        artist: row.name,
        slug: row.slug,
        genre: row.genre,
        album: alb.title,
      });
      if (items.length >= limit) {
        return { ok: true, count: items.length, items };
      }
    }
  }
  return { ok: true, count: items.length, items };
}

/** Structured text for ugrad / transformer prompt building. */
export function buildPromptContext(slug) {
  const bundle = getArtistBundle(slug);
  if (!bundle?.profile) return { ok: false, error: "artist not synced" };

  const { profile, albums } = bundle;
  const albumRows = albums?.albums || [];
  const lines = [
    `# ${profile.name}`,
    `Genre: ${profile.genre}`,
    `Region: ${profile.region}`,
    profile.warped?.years?.length
      ? `Warped Tour: ${profile.warped.years.join(", ")} (${profile.warped.totalYears} years)`
      : null,
    profile.mbid ? `MusicBrainz artist: ${profile.mbid}` : null,
    "",
    "## Discography (cached)",
  ].filter(Boolean);

  for (const alb of albumRows.slice(0, 12)) {
    lines.push(`- ${alb.title}${alb.year ? ` (${alb.year})` : ""}`);
    const withLyrics = (alb.tracks || []).filter((t) => t.hasLyrics).slice(0, 6);
    for (const tr of withLyrics) {
      const ly = getLyrics(slug, tr.slug);
      const excerpt = ly?.plainLyrics
        ? String(ly.plainLyrics).split(/\n/).slice(0, 4).join(" / ")
        : "";
      lines.push(`  · ${tr.title}${excerpt ? `: ${excerpt}` : ""}`);
    }
  }

  return {
    ok: true,
    slug,
    name: profile.name,
    genre: profile.genre,
    region: profile.region,
    text: lines.join("\n"),
    profile,
    albumCount: albumRows.length,
    lyricsCount: profile.lyricsCount ?? albumRows.reduce(
      (n, a) => n + (a.tracks || []).filter((t) => t.hasLyrics).length,
      0,
    ),
  };
}

export function repoStatus() {
  const index = loadIndex();
  const synced = index.artists.filter((a) => a.syncedAt).length;
  const withLyrics = index.artists.filter((a) => a.lyricsCount > 0).length;
  return {
    ok: true,
    version: REPO_VERSION,
    root: getRepoRoot(),
    catalogCount: index.catalogCount,
    indexCount: index.artists.length,
    syncedCount: synced,
    withLyricsCount: withLyrics,
    updatedAt: index.updatedAt,
  };
}

/**
 * Batch sync from catalog.
 * @param {{
 *   letter?: string,
 *   limit?: number,
 *   offset?: number,
 *   names?: string[],
 *   skipSynced?: boolean,
 *   maxAlbums?: number,
 *   fetchLyrics?: boolean,
 *   onProgress?: (info: object) => void,
 * }} opts
 */
export async function syncBatch(opts = {}) {
  const catalog = loadCatalog();
  let list = catalog.artists.map((a) => a.name);
  if (opts.names?.length) {
    const want = new Set(opts.names.map((n) => n.toLowerCase()));
    list = list.filter((n) => want.has(n.toLowerCase()));
  }
  if (opts.letter && opts.letter !== "all") {
    const L = opts.letter.toUpperCase();
    list = list.filter((n) => {
      const row = catalog.artists.find((a) => a.name === n);
      return (row?.letter || "#").toUpperCase() === L;
    });
  }
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? list.length;
  list = list.slice(offset, offset + limit);

  /** @type {object[]} */
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    opts.onProgress?.({ i: i + 1, total: list.length, name });
    try {
      const r = await syncArtist(name, {
        maxAlbums: opts.maxAlbums,
        fetchLyrics: opts.fetchLyrics,
        skipIfSynced: opts.skipSynced,
      });
      results.push(r);
    } catch (e) {
      results.push({
        ok: false,
        name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { ok: true, processed: results.length, results };
}
