/**
 * Live concert genre sections — discovery queries per tab.
 */
import { FEED_REGION_MATCH, FEED_REGION_QUERIES } from "./live-concerts-regions.mjs";
import { ARTIST_REGIONS } from "./live-concerts-regions.mjs";
import { feedSubregionById, filterEventsBySubregion } from "./live-concerts-subregions.mjs";

/** @type {typeof ARTIST_REGIONS} */
export const LIVE_FEED_REGION_TABS = ARTIST_REGIONS.map((r) =>
  r.id === "all" ? { ...r, label: "World" } : r,
);

/** @type {{ id: string, label: string, queries: string[] | null, match?: RegExp }[]} */
export const LIVE_GENRE_TABS = [
  { id: "all", label: "All", queries: null },
  {
    id: "metal",
    label: "Metal",
    queries: ["metal live stream 24/7", "heavy metal live radio", "metalcore live stream"],
    match: /\bmetal|metalcore|deathcore|thrash|nu metal|blast\b/i,
  },
  {
    id: "rock",
    label: "Rock",
    queries: ["rock live stream 24/7", "classic rock live radio", "indie rock live stream"],
    match: /\brock|grunge|punk\b/i,
  },
  {
    id: "pop",
    label: "Pop",
    queries: ["pop music live stream", "top 40 live radio", "pop hits live stream"],
    match: /\bpop|top 40|hits\b/i,
  },
  {
    id: "dance",
    label: "Dance / EDM",
    queries: ["edm festival live stream", "house music live stream 24/7", "dance music live radio"],
    match: /\bedm|house|techno|trance|dance|spinnin|deep house|chill house\b/i,
  },
  {
    id: "hiphop",
    label: "Hip-hop",
    queries: ["hip hop live stream 24/7", "rap live radio stream", "lofi hip hop live"],
    match: /\bhip hop|hip-hop|rap|trap|drill|lofi|lo-fi\b/i,
  },
  {
    id: "country",
    label: "Country",
    queries: ["country music live stream", "country radio live 24/7", "americana live stream"],
    match: /\bcountry|americana|bluegrass|honky\b/i,
  },
  {
    id: "jazz",
    label: "Jazz",
    queries: ["jazz live stream 24/7", "smooth jazz live radio", "bebop live stream"],
    match: /\bjazz|bebop|swing\b/i,
  },
  {
    id: "classical",
    label: "Classical",
    queries: ["classical music live stream", "symphony orchestra live", "opera live stream"],
    match: /\bclassical|symphony|orchestra|opera|baroque\b/i,
  },
  {
    id: "latin",
    label: "Latin",
    queries: ["latin music live stream", "reggaeton live radio", "salsa live stream"],
    match: /\blatin|reggaeton|salsa|bachata|cumbia|banda\b/i,
  },
  {
    id: "chill",
    label: "Chill",
    queries: ["chill music live stream", "lofi beats live 24/7", "ambient live radio"],
    match: /\bchill|lofi|lo-fi|ambient|relax|sleep\b/i,
  },
  {
    id: "folk",
    label: "Folk",
    queries: ["folk music live stream", "acoustic live session stream", "singer songwriter live"],
    match: /\bfolk|acoustic|americana|songwriter\b/i,
  },
];

/** @param {string} id */
export function genreTabById(id) {
  return LIVE_GENRE_TABS.find((g) => g.id === id) || LIVE_GENRE_TABS[0];
}

/**
 * @param {string} genreId
 * @param {string} userQ
 * @param {string[]} defaultQueries
 */
export function queriesForGenre(genreId, userQ, defaultQueries) {
  const tab = genreTabById(genreId);
  const base = tab.queries || defaultQueries;
  if (!userQ.trim()) return base;
  const u = userQ.trim();
  if (genreId === "all") {
    return [u, `${u} live stream`, `${u} live concert`];
  }
  return [u, `${u} live stream`, `${u} ${tab.label} live`];
}

/**
 * Client-side filter when reusing cached mixed feeds.
 * @param {object[]} events
 * @param {string} genreId
 */
export function filterEventsByGenre(events, genreId) {
  const tab = genreTabById(genreId);
  if (!tab.match || genreId === "all") return events;
  return events
    .map((ev) => {
      const feeds = (ev.feeds || []).filter((f) => tab.match.test(String(f.title || "")));
      if (!feeds.length) return null;
      return { ...ev, feeds, name: ev.name };
    })
    .filter(Boolean);
}

/** @param {string} id */
export function feedRegionById(id) {
  return LIVE_FEED_REGION_TABS.find((r) => r.id === id) || LIVE_FEED_REGION_TABS[0];
}

/**
 * @param {{ genreId: string, regionId: string, subregionId?: string, userQ: string, defaultQueries: string[] }} opts
 */
export function queriesForDiscover(opts) {
  const { genreId, regionId, subregionId = "all", userQ, defaultQueries } = opts;
  const g = genreTabById(genreId);
  const r = feedRegionById(regionId);
  const sub = feedSubregionById(regionId, subregionId);
  const u = userQ.trim();
  if (u) {
    const parts = [u, `${u} live stream`, `${u} live concert`];
    if (g.id !== "all") parts.push(`${u} ${g.label} live`);
    if (r.id !== "all") parts.push(`${u} ${r.label} live stream`);
    if (sub.id !== "all" && sub.label) parts.push(`${u} ${sub.label} live stream`);
    return [...new Set(parts)];
  }
  const parts = [];
  if (sub.id !== "all" && sub.queries?.length) {
    parts.push(...sub.queries);
  } else if (r.id !== "all" && FEED_REGION_QUERIES[r.id]) {
    parts.push(...FEED_REGION_QUERIES[r.id]);
  }
  if (g.id !== "all" && g.queries) {
    parts.push(...g.queries);
  }
  if (!parts.length) return defaultQueries;
  return [...new Set(parts)].slice(0, 10);
}

/** @param {object[]} events @param {string} regionId */
export function filterEventsByRegion(events, regionId) {
  const match = FEED_REGION_MATCH[regionId];
  if (!match || regionId === "all") return events;
  return events
    .map((ev) => {
      const feeds = (ev.feeds || []).filter((f) => match.test(String(f.title || "")));
      if (!feeds.length) return null;
      return { ...ev, feeds, name: ev.name };
    })
    .filter(Boolean);
}

/** @param {object[]} events @param {string} genreId @param {string} regionId @param {string} [subregionId] */
export function filterDiscoverEvents(events, genreId, regionId, subregionId = "all") {
  return filterEventsByGenre(
    filterEventsBySubregion(filterEventsByRegion(events, regionId), regionId, subregionId),
    genreId,
  );
}
