/**
 * HTTP API for artist repository (overview, VWall, mueee search, ugrad prompts).
 */
import {
  repoStatus,
  searchArtists,
  getArtistBundle,
  getLyrics,
  vwallTiles,
  buildPromptContext,
  syncArtist,
  syncBatch,
  loadIndex,
  saveIndex,
  artistSlug,
} from "./artist-repo.mjs";

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

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} urlPath
 */
export async function handleArtistRepoApi(req, res, urlPath) {
  if (urlPath === "/api/repo/status" && req.method === "GET") {
    json(res, 200, repoStatus());
    return true;
  }

  if (urlPath === "/api/repo/artists" && req.method === "GET") {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    json(
      res,
      200,
      searchArtists({
        q: u.searchParams.get("q") || "",
        genre: u.searchParams.get("genre") || "all",
        letter: u.searchParams.get("letter") || "all",
        region: u.searchParams.get("region") || "all",
        warpedOnly: u.searchParams.get("warped") === "1",
        syncedOnly: u.searchParams.get("synced") === "1",
        limit: Number(u.searchParams.get("limit")) || 50,
        offset: Number(u.searchParams.get("offset")) || 0,
      }),
    );
    return true;
  }

  if (urlPath === "/api/repo/vwall" && req.method === "GET") {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    json(
      res,
      200,
      vwallTiles({
        genre: u.searchParams.get("genre") || "all",
        q: u.searchParams.get("q") || "",
        limit: Number(u.searchParams.get("limit")) || 120,
        offset: Number(u.searchParams.get("offset")) || 0,
      }),
    );
    return true;
  }

  const promptMatch = urlPath.match(/^\/api\/repo\/prompt-context\/([^/]+)$/);
  if (promptMatch && req.method === "GET") {
    const slug = decodeURIComponent(promptMatch[1]);
    const data = buildPromptContext(slug);
    json(res, data.ok ? 200 : 404, data);
    return true;
  }

  const artistMatch = urlPath.match(/^\/api\/repo\/artist\/([^/]+)$/);
  if (artistMatch && req.method === "GET") {
    const slug = decodeURIComponent(artistMatch[1]);
    const bundle = getArtistBundle(slug);
    if (!bundle) {
      json(res, 404, { ok: false, error: "not synced", slug });
      return true;
    }
    json(res, 200, { ok: true, slug, ...bundle });
    return true;
  }

  const lyricsMatch = urlPath.match(/^\/api\/repo\/artist\/([^/]+)\/lyrics\/([^/]+)$/);
  if (lyricsMatch && req.method === "GET") {
    const slug = decodeURIComponent(lyricsMatch[1]);
    const trackKey = decodeURIComponent(lyricsMatch[2]);
    const data = getLyrics(slug, trackKey);
    if (!data) {
      json(res, 404, { ok: false, error: "no lyrics file", slug, trackKey });
      return true;
    }
    json(res, 200, data);
    return true;
  }

  if (urlPath === "/api/repo/reindex" && req.method === "POST") {
    const index = loadIndex();
    saveIndex(index);
    json(res, 200, { ok: true, ...repoStatus() });
    return true;
  }

  if (urlPath === "/api/repo/sync" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }

    const maxAlbums = Number(parsed.maxAlbums) || 8;
    const fetchLyrics = parsed.fetchLyrics !== false;
    const skipSynced = parsed.skipSynced === true;

    if (Array.isArray(parsed.names) && parsed.names.length) {
      try {
        const data = await syncBatch({
          names: parsed.names.map(String),
          maxAlbums,
          fetchLyrics,
          skipSynced,
        });
        json(res, 200, data);
      } catch (e) {
        json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return true;
    }

    const name = String(parsed.name || parsed.artist || "").trim();
    if (!name) {
      json(res, 400, { ok: false, error: "need name or names[]" });
      return true;
    }
    try {
      const data = await syncArtist(name, {
        maxAlbums,
        fetchLyrics,
        skipIfSynced: skipSynced,
      });
      json(res, 200, data);
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (urlPath === "/api/repo/sync-batch" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }
    const limit = Math.min(50, Math.max(1, Number(parsed.limit) || 5));
    try {
      const data = await syncBatch({
        letter: typeof parsed.letter === "string" ? parsed.letter : undefined,
        limit,
        offset: Number(parsed.offset) || 0,
        maxAlbums: Number(parsed.maxAlbums) || 6,
        fetchLyrics: parsed.fetchLyrics !== false,
        skipSynced: parsed.skipSynced === true,
      });
      json(res, 200, data);
    } catch (e) {
      json(res, 502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (urlPath === "/api/repo/resolve" && req.method === "GET") {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    const name = (u.searchParams.get("name") || u.searchParams.get("artist") || "").trim();
    json(res, 200, { ok: true, name, slug: artistSlug(name) });
    return true;
  }

  return false;
}
