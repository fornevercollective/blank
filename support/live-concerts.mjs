/**
 * Live concert discovery across YouTube / Twitch / watch pages (yt-dlp).
 * Groups multi-platform feeds into event clusters for multi-angle viewing.
 */
import { spawn } from "node:child_process";

const CACHE_TTL_MS = 3 * 60 * 1000;
const DISCOVER_TIMEOUT_MS = 90_000;

/** @type {Map<string, { created: number, data: object }>} */
const discoverCache = new Map();

const DEFAULT_QUERIES = [
  "live concert stream",
  "live music festival",
  "live arena concert full",
  "live symphony orchestra",
  "edm festival live stream",
];

const TWITCH_LIVE_DIRS = [
  "https://www.twitch.tv/directory/game/Music",
  "https://www.twitch.tv/directory/category/music",
];

/** @param {string[]} args @param {number} [timeoutMs] */
function runYtDlp(args, timeoutMs = DISCOVER_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("yt-dlp timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new Error("yt-dlp not found on PATH") : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = (err || out).trim().split(/\r?\n/).slice(-3).join(" ");
        reject(new Error(tail || `yt-dlp exit ${code}`));
        return;
      }
      resolve(out.trim());
    });
  });
}

/** @param {string} url */
function platformFromUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (h.includes("youtube") || h === "youtu.be") return "youtube";
    if (h.includes("twitch.tv")) return "twitch";
    if (h.includes("vimeo")) return "vimeo";
    if (h.includes("tiktok")) return "tiktok";
    if (h.includes("facebook") || h === "fb.watch") return "facebook";
    if (h.includes("kick.com")) return "kick";
    return h.split(".")[0] || "web";
  } catch {
    return "web";
  }
}

/** @param {string} title */
function eventClusterKey(title) {
  const t = String(title || "")
    .toLowerCase()
    .replace(/\b(live|stream|official|hd|4k|1080p|720p|full|set|concert|music|radio)\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = t
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 8)
    .sort();
  return words.join("-") || "live-event";
}

/**
 * @param {object} entry
 * @returns {{ id: string, platform: string, url: string, title: string, thumb: string|null, isLive: boolean, status: string, startAt: number|null, viewCount: number|null, uploader: string|null, angleLabel: string }}
 */
function normalizeFeed(entry) {
  const url = String(entry.url || entry.webpage_url || entry.original_url || "").trim();
  const title = String(entry.title || entry.fulltitle || "Live stream").trim();
  const id = String(entry.id || url).slice(0, 64);
  const isLive =
    entry.is_live === true ||
    entry.live_status === "is_live" ||
    entry.live_status === "post_live";
  const status = String(entry.live_status || (isLive ? "is_live" : "unknown"));
  const startAt = entry.release_timestamp
    ? Number(entry.release_timestamp) * 1000
    : entry.timestamp
      ? Number(entry.timestamp) * 1000
      : null;
  let thumb = null;
  if (Array.isArray(entry.thumbnails) && entry.thumbnails.length) {
    const best = entry.thumbnails[entry.thumbnails.length - 1];
    thumb = best?.url || null;
  } else if (entry.thumbnail) {
    thumb = String(entry.thumbnail);
  }
  const platform = platformFromUrl(url);
  const angleLabel =
    /\bstage\b|\bmain\b|\bfloor\b/i.test(title)
      ? "Main stage"
      : /\bcrowd\b|\baudience\b/i.test(title)
        ? "Crowd"
        : /\bbackstage\b|\bbts\b/i.test(title)
          ? "Backstage"
          : platform === "twitch"
            ? "Twitch angle"
            : platform === "youtube"
              ? "YouTube feed"
              : `${platform} feed`;

  return {
    id,
    platform,
    url,
    title,
    thumb,
    isLive,
    status,
    startAt,
    viewCount: entry.view_count ?? entry.concurrent_view_count ?? null,
    uploader: entry.uploader || entry.channel || entry.uploader_id || null,
    angleLabel,
  };
}

/** @param {string} window */
function windowBounds(window) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = startToday.getTime() + day;
  const startTomorrow = endToday;
  const endTomorrow = startTomorrow + day;

  if (window === "hour") {
    return { now, notBefore: now - 5 * 60 * 1000, notAfter: now + hour, liveOnly: false };
  }
  if (window === "today") {
    return { now, notBefore: startToday.getTime(), notAfter: endToday, liveOnly: false };
  }
  if (window === "tomorrow") {
    return {
      now,
      notBefore: startTomorrow,
      notAfter: endTomorrow,
      liveOnly: false,
    };
  }
  return { now, notBefore: now - day, notAfter: now + hour, liveOnly: true };
}

/**
 * @param {ReturnType<typeof normalizeFeed>} feed
 * @param {ReturnType<typeof windowBounds>} bounds
 */
function feedMatchesWindow(feed, bounds) {
  if (bounds.liveOnly && feed.isLive) return true;
  if (feed.isLive) return true;
  if (feed.status === "is_upcoming" && feed.startAt) {
    return feed.startAt >= bounds.notBefore && feed.startAt <= bounds.notAfter;
  }
  if (feed.startAt) {
    return feed.startAt >= bounds.notBefore && feed.startAt <= bounds.notAfter;
  }
  if (!bounds.liveOnly) return true;
  return false;
}

/** @param {string} raw */
async function ytSearchEntries(query, limit = 12) {
  const q = query.trim();
  if (!q) return [];
  const url = `ytsearch${limit}:${q}`;
  const out = await runYtDlp(
    ["--flat-playlist", "-j", "--no-warnings", url],
    45_000,
  );
  /** @type {object[]} */
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

/** @param {string} pageUrl @param {number} limit */
async function flatPlaylistEntries(pageUrl, limit = 20) {
  const out = await runYtDlp(
    ["--flat-playlist", "-j", "--no-warnings", "--playlist-end", String(limit), pageUrl],
    45_000,
  );
  /** @type {object[]} */
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

/**
 * @param {{ window?: string, query?: string }} opts
 */
export async function discoverLiveConcerts(opts = {}) {
  const window = ["now", "hour", "today", "tomorrow"].includes(opts.window)
    ? opts.window
    : "now";
  const userQ = String(opts.query || "").trim();
  const cacheKey = `${window}\0${userQ.toLowerCase()}`;
  const cached = discoverCache.get(cacheKey);
  if (cached && Date.now() - cached.created < CACHE_TTL_MS) {
    return cached.data;
  }

  const bounds = windowBounds(window);
  const queries = userQ ? [userQ, `${userQ} live stream`, `${userQ} live concert`] : DEFAULT_QUERIES;

  /** @type {Map<string, ReturnType<typeof normalizeFeed>>} */
  const feedByUrl = new Map();

  const tasks = [
    ...queries.map((q) => ytSearchEntries(q, 10)),
    ...TWITCH_LIVE_DIRS.map((u) => flatPlaylistEntries(u, 16)),
  ];

  const batches = await Promise.allSettled(tasks);
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const entry of batch.value) {
      const feed = normalizeFeed(entry);
      if (!feed.url.startsWith("http")) continue;
      if (!feedMatchesWindow(feed, bounds)) continue;
      if (!feedByUrl.has(feed.url)) feedByUrl.set(feed.url, feed);
    }
  }

  /** @type {Map<string, { id: string, name: string, feeds: ReturnType<typeof normalizeFeed>[] }>} */
  const eventMap = new Map();
  for (const feed of feedByUrl.values()) {
    const key = eventClusterKey(feed.title);
    const id = key.slice(0, 48) || `ev-${feed.id}`;
    let ev = eventMap.get(key);
    if (!ev) {
      ev = { id, name: feed.title.slice(0, 120), feeds: [] };
      eventMap.set(key, ev);
    }
    ev.feeds.push(feed);
    if (feed.title.length > ev.name.length && ev.feeds.length <= 3) {
      ev.name = feed.title.slice(0, 120);
    }
  }

  let events = [...eventMap.values()]
    .filter((e) => e.feeds.length > 0)
    .sort((a, b) => {
      const liveA = a.feeds.some((f) => f.isLive) ? 1 : 0;
      const liveB = b.feeds.some((f) => f.isLive) ? 1 : 0;
      if (liveB !== liveA) return liveB - liveA;
      return b.feeds.length - a.feeds.length;
    });

  events = events.map((ev) => ({
    ...ev,
    feeds: ev.feeds.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return (b.viewCount || 0) - (a.viewCount || 0);
    }),
    multiAngle: ev.feeds.length > 1,
    platformCount: new Set(ev.feeds.map((f) => f.platform)).size,
  }));

  const result = {
    ok: true,
    window,
    query: userQ || null,
    fetchedAt: Date.now(),
    bounds: {
      notBefore: bounds.notBefore,
      notAfter: bounds.notAfter,
      liveOnly: bounds.liveOnly,
    },
    feedCount: feedByUrl.size,
    events,
    errors: batches
      .filter((b) => b.status === "rejected")
      .map((b) => (b.status === "rejected" ? b.reason?.message || "search failed" : ""))
      .filter(Boolean)
      .slice(0, 4),
  };

  discoverCache.set(cacheKey, { created: Date.now(), data: result });
  return result;
}

/** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res @param {string} urlPath */
export async function handleLiveConcertsApi(req, res, urlPath) {
  if (urlPath === "/api/live/discover" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return true;
    }
    try {
      const data = await discoverLiveConcerts({
        window: typeof parsed.window === "string" ? parsed.window : "now",
        query: typeof parsed.query === "string" ? parsed.query : "",
      });
      json(res, 200, data);
    } catch (e) {
      json(res, 502, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return true;
  }

  if (urlPath === "/api/live/discover" && req.method === "GET") {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    try {
      const data = await discoverLiveConcerts({
        window: u.searchParams.get("window") || "now",
        query: u.searchParams.get("q") || "",
      });
      json(res, 200, data);
    } catch (e) {
      json(res, 502, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return true;
  }

  return false;
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
