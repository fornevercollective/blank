/**
 * World region / country grouping for artist catalog color-coding.
 */

/** @type {Record<string, string[]>} */
export const FEED_REGION_QUERIES = {
  us: ["usa live concert stream", "american music live radio 24/7", "us festival live stream"],
  uk: ["uk live concert stream", "british music live radio", "bbc music live stream"],
  eu: ["europe live festival stream", "eurovision live music", "european edm live stream"],
  latam: ["latin music live stream 24/7", "reggaeton live radio", "salsa live stream"],
  apac: ["k-pop live stream 24/7", "japan music live radio", "asia pop live stream"],
  "ca-oc": ["canada live music stream", "australia live radio music", "oceania live concert"],
  "africa-me": ["afrobeats live stream", "african music live radio", "middle east music live"],
};

/** @type {Record<string, RegExp>} */
export const FEED_REGION_MATCH = {
  us: /\b(usa|u\.s\.|american|nashville|country radio us)\b/i,
  uk: /\b(uk|british|london|manchester|bbc|itv)\b/i,
  eu: /\b(europe|european|berlin|paris|amsterdam|spain|italy|germany|france)\b/i,
  latam: /\b(latin|latino|reggaeton|salsa|bachata|méxico|brasil|spanish)\b/i,
  apac: /\b(k-pop|kpop|j-pop|jpop|anime|japan|korea|china|india|asia)\b/i,
  "ca-oc": /\b(canada|canadian|australia|australian|zealand|toronto|sydney)\b/i,
  "africa-me": /\b(afrobeats|africa|african|nigeria|ghana|arabic|middle east)\b/i,
};

export const ARTIST_REGIONS = [
  {
    id: "all",
    label: "All",
    tab: { bg: "#f1f5f9", ink: "#475569", border: "#cbd5e1" },
    pick: { bg: "#ffffff", border: "#e0e0e0", ink: "#171717" },
  },
  {
    id: "us",
    label: "US",
    tab: { bg: "#2563eb", ink: "#ffffff", border: "#1d4ed8" },
    pick: { bg: "#dbeafe", border: "#93c5fd", ink: "#1e3a8a" },
  },
  {
    id: "uk",
    label: "UK",
    tab: { bg: "#7c3aed", ink: "#ffffff", border: "#6d28d9" },
    pick: { bg: "#ede9fe", border: "#c4b5fd", ink: "#4c1d95" },
  },
  {
    id: "eu",
    label: "Europe",
    tab: { bg: "#059669", ink: "#ffffff", border: "#047857" },
    pick: { bg: "#d1fae5", border: "#6ee7b7", ink: "#065f46" },
  },
  {
    id: "latam",
    label: "Latin",
    tab: { bg: "#ea580c", ink: "#ffffff", border: "#c2410c" },
    pick: { bg: "#ffedd5", border: "#fdba74", ink: "#9a3412" },
  },
  {
    id: "apac",
    label: "Asia-Pac",
    tab: { bg: "#dc2626", ink: "#ffffff", border: "#b91c1c" },
    pick: { bg: "#fee2e2", border: "#fca5a5", ink: "#991b1b" },
  },
  {
    id: "ca-oc",
    label: "CA / AU",
    tab: { bg: "#0891b2", ink: "#ffffff", border: "#0e7490" },
    pick: { bg: "#cffafe", border: "#67e8f9", ink: "#155e75" },
  },
  {
    id: "africa-me",
    label: "Africa / ME",
    tab: { bg: "#ca8a04", ink: "#ffffff", border: "#a16207" },
    pick: { bg: "#fef9c3", border: "#fde047", ink: "#854d0e" },
  },
];

/** @param {string} id */
export function regionById(id) {
  return ARTIST_REGIONS.find((r) => r.id === id) || ARTIST_REGIONS[0];
}

/** @type {Record<string, string>} */
const OVERRIDES = {
  ABBA: "eu",
  "AC/DC": "ca-oc",
  Adele: "uk",
  "Arcade Fire": "ca-oc",
  "Arctic Monkeys": "uk",
  "Bad Bunny": "latam",
  Beyoncé: "us",
  Björk: "eu",
  "Bob Marley": "africa-me",
  BTS: "apac",
  "Burna Boy": "africa-me",
  "Calvin Harris": "uk",
  "Celine Dion": "ca-oc",
  Coldplay: "uk",
  "Daft Punk": "eu",
  Drake: "ca-oc",
  "David Bowie": "uk",
  "Depeche Mode": "eu",
  "Doja Cat": "us",
  "Ed Sheeran": "uk",
  Eminem: "us",
  "Elton John": "uk",
  "Fleetwood Mac": "uk",
  "Frank Sinatra": "us",
  Gorillaz: "uk",
  "Harry Styles": "uk",
  "Iron Maiden": "uk",
  "Jay-Z": "us",
  "Justin Bieber": "ca-oc",
  "Kanye West": "us",
  "Katy Perry": "us",
  "Kendrick Lamar": "us",
  "Lady Gaga": "us",
  "Lana Del Rey": "us",
  "Led Zeppelin": "uk",
  Madonna: "us",
  Metallica: "us",
  "Michael Jackson": "us",
  Muse: "uk",
  Nirvana: "us",
  Oasis: "uk",
  "Olivia Rodrigo": "us",
  OutKast: "us",
  "Pink Floyd": "uk",
  Prince: "us",
  Queen: "uk",
  Radiohead: "uk",
  Rihanna: "us",
  Rosalía: "latam",
  Shakira: "latam",
  "Taylor Swift": "us",
  "The Beatles": "uk",
  "The Rolling Stones": "uk",
  "The Weeknd": "ca-oc",
  Tiësto: "eu",
  U2: "eu",
  "Wu-Tang Clan": "us",
  "Zach Bryan": "us",
};

/** @type {Set<string>} */
const UK_HINTS = new Set([
  "blur",
  "pulp",
  "suede",
  "oasis",
  "verve",
  "smiths",
  "clash",
  "who",
  "kinks",
  "prodigy",
  "massive attack",
  "portishead",
  "amy winehouse",
  "george michael",
  "sting",
  "police",
  "cure",
  "joy division",
  "new order",
  "pet shop boys",
  "dire straits",
  "eurythmics",
  "florence",
  "foals",
  "bastille",
  "dua lipa",
  "sam smith",
  "ed sheeran",
  "adele",
  "coldplay",
  "radiohead",
]);

/**
 * @param {string} name
 * @returns {string} region id
 */
export function inferRegion(name) {
  const key = name.trim();
  if (OVERRIDES[key]) return OVERRIDES[key];

  const lower = key.toLowerCase();

  if (/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(key)) return "apac";
  if (/^(bts|blackpink|twice|babymetal|perfume|yoasobi|pshy|itzy)/i.test(lower)) return "apac";

  if (/[áéíóúñ¿¡]/.test(key)) return "latam";
  if (/\b(bad bunny|shakira|rosalía|j balvin|maluma|becky g|anitta|selena|enrique|marc anthony)\b/i.test(lower)) {
    return "latam";
  }

  if (/\b(burna|wizkid|davido|fela|angelique|youssou|amr diab|fairuz)\b/i.test(lower)) return "africa-me";

  if (/\b(nickelback|drake|the weeknd|justin bieber|shania|celine dion|alanis|neil young|joni|leonard cohen|rush|arcade fire)\b/i.test(lower)) {
    return "ca-oc";
  }
  if (/\b(ac\/dc|kylie|sia|tame impala|flume|keith urban|kacey|zach bryan)\b/i.test(lower)) return "ca-oc";

  if (/\b(abba|roxy|europe|schiller|kraftwerk|rammstein|münchen|mötor|björk|a-ha|roxette)\b/i.test(lower)) {
    return "eu";
  }

  for (const hint of UK_HINTS) {
    if (lower.includes(hint)) return "uk";
  }
  if (/\b(beatles|stones|floyd|zeppelin|oasis|blur|suede|clash|who|queen|bowie|elton|floyd)\b/i.test(lower)) {
    return "uk";
  }

  return "us";
}
