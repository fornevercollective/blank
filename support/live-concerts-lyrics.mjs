/**
 * Synced/plain lyrics via LRCLIB (no API key).
 */
const LYRICS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const LRC_AGENT = "BlankLiveConcerts/1.0 (+https://github.com/blank-local)";

/** @type {Map<string, { created: number, data: object }>} */
const lyricsCache = new Map();

/** @param {Record<string, string>} params */
function cacheKey(params) {
  return [
    params.artist || "",
    params.track || "",
    params.album || "",
    params.duration || "",
  ]
    .join("|")
    .toLowerCase();
}

/**
 * @param {{ artist?: string, track?: string, album?: string, durationMs?: number }} opts
 */
export async function lookupLyrics(opts = {}) {
  const artist = String(opts.artist || "").trim();
  const track = String(opts.track || "").trim();
  const album = String(opts.album || "").trim();
  if (!artist || !track) {
    return { ok: false, error: "need artist and track" };
  }

  const durationSec =
    Number.isFinite(opts.durationMs) && opts.durationMs > 0
      ? Math.round(opts.durationMs / 1000)
      : undefined;

  const key = cacheKey({
    artist,
    track,
    album,
    duration: durationSec != null ? String(durationSec) : "",
  });
  const cached = lyricsCache.get(key);
  if (cached && Date.now() - cached.created < LYRICS_CACHE_TTL_MS) {
    return cached.data;
  }

  let result = await lrcGet(artist, track, album, durationSec);
  if (!result?.plainLyrics && !result?.syncedLyrics) {
    result = await lrcSearch(artist, track, album, durationSec);
  }

  const payload = result?.plainLyrics || result?.syncedLyrics
    ? {
        ok: true,
        artist,
        track,
        album,
        plainLyrics: result.plainLyrics || stripLrc(result.syncedLyrics),
        syncedLyrics: result.syncedLyrics || null,
        source: "lrclib",
      }
    : {
        ok: true,
        artist,
        track,
        album,
        plainLyrics: null,
        syncedLyrics: null,
        source: "lrclib",
        message: "No lyrics in LRCLIB for this track",
      };

  lyricsCache.set(key, { created: Date.now(), data: payload });
  return payload;
}

/**
 * @param {string} artist
 * @param {string} track
 * @param {string} album
 * @param {number|undefined} durationSec
 */
async function lrcGet(artist, track, album, durationSec) {
  const q = new URLSearchParams({
    artist_name: artist,
    track_name: track,
  });
  if (album) q.set("album_name", album);
  if (durationSec != null) q.set("duration", String(durationSec));

  const res = await fetch(`https://lrclib.net/api/get?${q}`, {
    headers: { "User-Agent": LRC_AGENT, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;
  return {
    plainLyrics: String(data.plainLyrics || "").trim() || null,
    syncedLyrics: String(data.syncedLyrics || "").trim() || null,
  };
}

/**
 * @param {string} artist
 * @param {string} track
 * @param {string} album
 * @param {number|undefined} durationSec
 */
async function lrcSearch(artist, track, album, durationSec) {
  const query = [artist, track, album].filter(Boolean).join(" ");
  const res = await fetch(
    `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": LRC_AGENT, Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return null;

  const norm = (s) => String(s || "").toLowerCase().replace(/[^\w\s]/g, "");
  const wantA = norm(artist);
  const wantT = norm(track);

  let best = rows.find(
    (r) => norm(r.artistName) === wantA && norm(r.trackName) === wantT,
  );
  if (!best) {
    best = rows.find(
      (r) => norm(r.artistName).includes(wantA) && norm(r.trackName).includes(wantT),
    );
  }
  if (!best) best = rows[0];

  if (durationSec != null && best?.duration) {
    const drift = Math.abs(Number(best.duration) - durationSec);
    if (drift > 12) {
      const closer = rows.find(
        (r) =>
          norm(r.artistName).includes(wantA) &&
          norm(r.trackName).includes(wantT) &&
          Math.abs(Number(r.duration) - durationSec) <= 8,
      );
      if (closer) best = closer;
    }
  }

  if (!best) return null;
  return {
    plainLyrics: String(best.plainLyrics || "").trim() || null,
    syncedLyrics: String(best.syncedLyrics || "").trim() || null,
  };
}

/** @param {string|null} synced */
function stripLrc(synced) {
  if (!synced) return null;
  return synced
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[\d+:\d+(?:\.\d+)?\]\s*/, "").trim())
    .filter((line) => line && !line.startsWith("["))
    .join("\n");
}

/**
 * @param {import("node:http").IncomingMessage} _req
 * @param {import("node:http").ServerResponse} res
 * @param {string} urlPath
 */
export async function handleLiveLyricsApi(_req, res, urlPath) {
  if (urlPath !== "/api/live/lyrics" || _req.method !== "GET") return false;

  const u = new URL(_req.url || "/", "http://127.0.0.1");
  const artist = (u.searchParams.get("artist") || "").trim();
  const track = (u.searchParams.get("track") || "").trim();
  const album = (u.searchParams.get("album") || "").trim();
  const durationMs = Number(u.searchParams.get("durationMs"));

  try {
    const data = await lookupLyrics({
      artist,
      track,
      album,
      durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    });
    json(res, 200, data);
  } catch (e) {
    json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}

/** @param {import("node:http").ServerResponse} res @param {number} code @param {object} obj */
function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}
