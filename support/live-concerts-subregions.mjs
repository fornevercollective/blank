/**
 * Sub-region / state / timezone drill-down under world feed regions.
 */

/** @typedef {{ id: string, label: string, tz?: string, queries?: string[], match?: RegExp }} FeedSubregion */

/** @type {Record<string, FeedSubregion[]>} */
export const FEED_SUBREGIONS = {
  us: [
    { id: "all", label: "All US" },
    {
      id: "ca",
      label: "CA",
      tz: "PT",
      queries: ["california live music stream", "los angeles live radio"],
      match: /\b(california|los angeles|san francisco|oakland|san diego|sacramento|bay area)\b/i,
    },
    {
      id: "tx",
      label: "TX",
      tz: "CT",
      queries: ["texas live music stream", "austin live radio"],
      match: /\b(texas|austin|houston|dallas|san antonio)\b/i,
    },
    {
      id: "ny",
      label: "NY",
      tz: "ET",
      queries: ["new york live music stream", "nyc live radio"],
      match: /\b(new york|nyc|brooklyn|manhattan|buffalo)\b/i,
    },
    {
      id: "fl",
      label: "FL",
      tz: "ET",
      queries: ["florida live music stream", "miami live radio"],
      match: /\b(florida|miami|orlando|tampa|jacksonville)\b/i,
    },
    {
      id: "il",
      label: "IL",
      tz: "CT",
      queries: ["chicago live music stream", "illinois live radio"],
      match: /\b(chicago|illinois)\b/i,
    },
    {
      id: "tn",
      label: "TN",
      tz: "CT",
      queries: ["nashville live music stream", "tennessee live radio"],
      match: /\b(nashville|tennessee|memphis)\b/i,
    },
    {
      id: "wa",
      label: "WA",
      tz: "PT",
      queries: ["seattle live music stream", "washington state live radio"],
      match: /\b(seattle|washington state|tacoma)\b/i,
    },
    {
      id: "ga",
      label: "GA",
      tz: "ET",
      queries: ["atlanta live music stream", "georgia live radio"],
      match: /\b(atlanta|georgia)\b/i,
    },
    {
      id: "az",
      label: "AZ",
      tz: "MT",
      queries: ["phoenix live music stream", "arizona live radio"],
      match: /\b(phoenix|arizona|tucson)\b/i,
    },
    {
      id: "nv",
      label: "NV",
      tz: "PT",
      queries: ["las vegas live music stream", "nevada live radio"],
      match: /\b(las vegas|nevada|reno)\b/i,
    },
    {
      id: "co",
      label: "CO",
      tz: "MT",
      queries: ["denver live music stream", "colorado live radio"],
      match: /\b(denver|colorado)\b/i,
    },
    {
      id: "pa",
      label: "PA",
      tz: "ET",
      queries: ["philadelphia live music stream", "pennsylvania live radio"],
      match: /\b(philadelphia|pittsburgh|pennsylvania)\b/i,
    },
  ],
  uk: [
    { id: "all", label: "All UK" },
    {
      id: "eng",
      label: "England",
      tz: "GMT",
      queries: ["england live music stream", "london live radio"],
      match: /\b(england|london|manchester|birmingham|liverpool)\b/i,
    },
    {
      id: "sco",
      label: "Scotland",
      tz: "GMT",
      queries: ["scotland live music stream", "edinburgh live radio"],
      match: /\b(scotland|scottish|edinburgh|glasgow)\b/i,
    },
    {
      id: "wal",
      label: "Wales",
      tz: "GMT",
      queries: ["wales live music stream", "cardiff live radio"],
      match: /\b(wales|welsh|cardiff)\b/i,
    },
    {
      id: "nire",
      label: "N. Ireland",
      tz: "GMT",
      queries: ["northern ireland live music stream", "belfast live radio"],
      match: /\b(northern ireland|belfast|ulster)\b/i,
    },
  ],
  eu: [
    { id: "all", label: "All Europe" },
    {
      id: "de",
      label: "Germany",
      tz: "CET",
      queries: ["germany live music stream", "berlin live radio"],
      match: /\b(germany|german|berlin|munich|hamburg)\b/i,
    },
    {
      id: "fr",
      label: "France",
      tz: "CET",
      queries: ["france live music stream", "paris live radio"],
      match: /\b(france|french|paris|lyon|marseille)\b/i,
    },
    {
      id: "es",
      label: "Spain",
      tz: "CET",
      queries: ["spain live music stream", "madrid live radio"],
      match: /\b(spain|spanish|madrid|barcelona)\b/i,
    },
    {
      id: "it",
      label: "Italy",
      tz: "CET",
      queries: ["italy live music stream", "rome live radio"],
      match: /\b(italy|italian|rome|milan)\b/i,
    },
    {
      id: "nl",
      label: "Netherlands",
      tz: "CET",
      queries: ["netherlands live music stream", "amsterdam live radio"],
      match: /\b(netherlands|dutch|amsterdam|rotterdam)\b/i,
    },
  ],
  latam: [
    { id: "all", label: "All Latin" },
    {
      id: "mx",
      label: "Mexico",
      tz: "CST",
      queries: ["mexico live music stream", "mexico city live radio"],
      match: /\b(mexico|mexican|cdmx|guadalajara)\b/i,
    },
    {
      id: "br",
      label: "Brazil",
      tz: "BRT",
      queries: ["brazil live music stream", "são paulo live radio"],
      match: /\b(brazil|brazilian|são paulo|rio de janeiro)\b/i,
    },
    {
      id: "ar",
      label: "Argentina",
      tz: "ART",
      queries: ["argentina live music stream", "buenos aires live radio"],
      match: /\b(argentina|argentinian|buenos aires)\b/i,
    },
    {
      id: "co",
      label: "Colombia",
      tz: "COT",
      queries: ["colombia live music stream", "bogotá live radio"],
      match: /\b(colombia|colombian|bogotá|medellín)\b/i,
    },
  ],
  apac: [
    { id: "all", label: "All Asia-Pac" },
    {
      id: "jp",
      label: "Japan",
      tz: "JST",
      queries: ["japan live music stream", "tokyo live radio"],
      match: /\b(japan|japanese|tokyo|osaka)\b/i,
    },
    {
      id: "kr",
      label: "Korea",
      tz: "KST",
      queries: ["korea live music stream", "seoul live radio"],
      match: /\b(korea|korean|seoul|k-pop)\b/i,
    },
    {
      id: "in",
      label: "India",
      tz: "IST",
      queries: ["india live music stream", "mumbai live radio"],
      match: /\b(india|indian|mumbai|delhi|bollywood)\b/i,
    },
    {
      id: "au",
      label: "Australia",
      tz: "AEST",
      queries: ["australia live music stream", "sydney live radio"],
      match: /\b(australia|australian|sydney|melbourne)\b/i,
    },
  ],
  "ca-oc": [
    { id: "all", label: "All CA / AU" },
    {
      id: "on",
      label: "Ontario",
      tz: "ET",
      queries: ["toronto live music stream", "ontario live radio"],
      match: /\b(toronto|ontario|ottawa)\b/i,
    },
    {
      id: "bc",
      label: "BC",
      tz: "PT",
      queries: ["vancouver live music stream", "british columbia live radio"],
      match: /\b(vancouver|british columbia|victoria bc)\b/i,
    },
    {
      id: "qc",
      label: "Quebec",
      tz: "ET",
      queries: ["montreal live music stream", "quebec live radio"],
      match: /\b(montreal|quebec|québec)\b/i,
    },
    {
      id: "nsw",
      label: "NSW",
      tz: "AEST",
      queries: ["sydney live music stream", "new south wales live radio"],
      match: /\b(sydney|new south wales|nsw)\b/i,
    },
    {
      id: "vic",
      label: "Victoria",
      tz: "AEST",
      queries: ["melbourne live music stream", "victoria australia live radio"],
      match: /\b(melbourne|victoria australia)\b/i,
    },
  ],
  "africa-me": [
    { id: "all", label: "All Africa / ME" },
    {
      id: "ng",
      label: "Nigeria",
      tz: "WAT",
      queries: ["nigeria live music stream", "lagos live radio"],
      match: /\b(nigeria|nigerian|lagos|afrobeats)\b/i,
    },
    {
      id: "za",
      label: "S. Africa",
      tz: "SAST",
      queries: ["south africa live music stream", "johannesburg live radio"],
      match: /\b(south africa|johannesburg|cape town)\b/i,
    },
    {
      id: "eg",
      label: "Egypt",
      tz: "EET",
      queries: ["egypt live music stream", "cairo live radio"],
      match: /\b(egypt|egyptian|cairo)\b/i,
    },
    {
      id: "ae",
      label: "UAE",
      tz: "GST",
      queries: ["dubai live music stream", "uae live radio"],
      match: /\b(dubai|abu dhabi|uae|emirates)\b/i,
    },
  ],
};

/** @param {string} regionId */
export function subregionsForRegion(regionId) {
  if (!regionId || regionId === "all") return [];
  return FEED_SUBREGIONS[regionId] || [];
}

/**
 * @param {string} regionId
 * @param {string} subId
 */
export function feedSubregionById(regionId, subId) {
  const list = subregionsForRegion(regionId);
  return list.find((s) => s.id === subId) || list[0] || { id: "all", label: "All" };
}

/**
 * @param {object[]} events
 * @param {string} regionId
 * @param {string} subregionId
 */
export function filterEventsBySubregion(events, regionId, subregionId) {
  const sub = feedSubregionById(regionId, subregionId);
  if (!sub.match || subregionId === "all" || !subregionId) return events;
  return events
    .map((ev) => {
      const feeds = (ev.feeds || []).filter((f) => sub.match.test(String(f.title || "")));
      if (!feeds.length) return null;
      return { ...ev, feeds, name: ev.name };
    })
    .filter(Boolean);
}
