/**
 * Artist / album accreditation — MusicBrainz, Cover Art Archive, PRO & chart links.
 */
const META_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MB_AGENT = "BlankLiveConcerts/1.0 (+https://github.com/blank-local)";
const MB_MIN_GAP_MS = 1100;

/** @type {Map<string, { created: number, data: object }>} */
const metaCache = new Map();

/** @type {Map<string, { created: number, data: object }>} */
const albumDetailCache = new Map();

let mbLastFetch = 0;

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

async function caaFetch(rgMbid) {
  try {
    const res = await fetch(`https://coverartarchive.org/release-group/${rgMbid}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { images: [], videos: [] };
    return res.json();
  } catch {
    return { images: [], videos: [] };
  }
}

const AGENCY_RE =
  /booking|management|agency|promot|radio|press|publicist|a&r|represent/i;
const TECH_RE =
  /engineer|mix|produc|master|arrang|program|record|design|photograph|video/i;
const TOUR_RE = /tour/i;
const RIGHTS_RE = /publish|copyright|label|licen|rights|holder|distribut/i;
const SPONSOR_RE = /sponsor|patron|brand|endorse/i;

/** @param {object[]} rels @param {string} artistName */
function categorizeRelations(rels, artistName) {
  const agencies = [];
  const technicians = [];
  const tourCompanies = [];
  const rightsHolders = [];
  const sponsors = [];
  const seen = new Set();

  for (const rel of rels || []) {
    const type = String(rel.type || "").trim();
    const dir = rel.direction === "backward" ? "←" : "→";
    const ent = rel.artist?.name || rel.label?.name || rel.company?.name || rel.place?.name || rel.event?.name || rel.series?.name || rel["target-credit"] || rel.name || "";
    if (!ent || ent === artistName) continue;
    const key = `${type}:${ent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = { name: ent, role: type, direction: dir };
    if (AGENCY_RE.test(type)) agencies.push(row);
    else if (TECH_RE.test(type)) technicians.push(row);
    else if (TOUR_RE.test(type)) tourCompanies.push(row);
    else if (RIGHTS_RE.test(type)) rightsHolders.push(row);
    else if (SPONSOR_RE.test(type)) sponsors.push(row);
    else if (/label|distribut/i.test(type)) rightsHolders.push(row);
  }

  return { agencies, technicians, tourCompanies, rightsHolders, sponsors };
}

/** @param {object[]} urlRels */
function parsePromoKit(urlRels, artistName) {
  const promoKit = [];
  const seen = new Set();
  for (const u of urlRels || []) {
    const resource = String(u["target-type"] || u.type || "link");
    for (const link of u.url?.resource ? [u.url] : u.urls || []) {
      const url = link?.resource || link?.id;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      promoKit.push({
        label: resource.replace(/_/g, " "),
        url,
        type: resource,
      });
    }
  }
  if (artistName) {
    promoKit.push({
      label: "Billboard artist search",
      url: `https://www.billboard.com/search/?query=${encodeURIComponent(artistName)}`,
      type: "chart-search",
    });
  }
  return promoKit;
}

/** @param {object} caa */
function parseCaaMedia(caa) {
  const images = [];
  const videos = [];
  for (const img of caa?.images || []) {
    const url = img?.thumbnails?.small || img?.thumbnails?.large || img?.image;
    if (!url) continue;
    images.push({
      url,
      type: img.types?.join(", ") || img.type || "cover",
      source: "cover-art-archive",
    });
  }
  for (const vid of caa?.videos || []) {
    if (vid?.url) {
      videos.push({ url: vid.url, title: vid.title || "Video", source: "cover-art-archive" });
    }
  }
  return { images, videos };
}

/** @param {object[]} seriesRels */
function parseCharting(seriesRels, artistName) {
  const charts = [];
  for (const s of seriesRels || []) {
    const name = s.series?.name || s.name || "";
    if (!/billboard|chart|hot 100|top \d|uk singles|aria/i.test(name)) continue;
    charts.push({
      chart: name,
      position: s["attribute-values"]?.position || s.position || null,
      date: s["target-credit"] || s.begin || s.end || null,
      title: s["target-credit"] || "",
      source: "musicbrainz-series",
    });
  }
  charts.push({
    chart: "Billboard",
    position: null,
    date: null,
    title: "Search charts",
    source: "billboard-link",
    url: `https://www.billboard.com/search/?query=${encodeURIComponent(artistName)}`,
  });
  return charts;
}

/** @param {string} isrc @param {string} iswc @param {string} title */
function proLinks(title, isrc, iswc) {
  const q = encodeURIComponent(title);
  const links = [
    { society: "ASCAP", url: `https://www.ascap.com/repertory#/ace/search/title/${q}` },
    { society: "BMI", url: `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${q}` },
    { society: "SESAC", url: `https://www.sesac.com/repertory/` },
    { society: "PRS", url: `https://www.prsformusic.com/works/search?q=${q}` },
  ];
  if (isrc) links.push({ society: "ISRC", url: `https://isrcsearch.ifpi.org/?isrc=${encodeURIComponent(isrc)}` });
  if (iswc) links.push({ society: "ISWC", url: `https://iswcnet.cisac.org/` });
  return links;
}

/**
 * @param {string} artistName
 * @param {string} [artistMbid]
 */
export async function fetchArtistAccreditation(artistName, artistMbid) {
  const key = `artist:${(artistMbid || artistName).toLowerCase()}`;
  const cached = metaCache.get(key);
  if (cached && Date.now() - cached.created < META_CACHE_TTL_MS) {
    return cached.data;
  }

  let mbid = artistMbid;
  if (!mbid) {
    const search = await mbFetch(
      `artist/?query=${encodeURIComponent(`artist:"${artistName}"`)}&limit=1&fmt=json`,
    );
    mbid = search.artists?.[0]?.id;
  }
  if (!mbid) {
    const empty = { ok: true, artist: artistName, accreditation: emptyAccred(), charts: [] };
    metaCache.set(key, { created: Date.now(), data: empty });
    return empty;
  }

  const artist = await mbFetch(
    `artist/${mbid}?inc=artist-rels+url-rels+tags&fmt=json`,
  );
  const name = artist.name || artistName;
  const relBuckets = categorizeRelations(artist.relations, name);
  /** @type {object[]} */
  const urlRels = [];
  if (Array.isArray(artist.relations)) {
    for (const r of artist.relations) {
      if (r.url?.resource) urlRels.push({ type: r.type, url: r.url });
    }
  }
  const promoKit = [...parsePromoKitFromUrls(urlRels), ...parsePromoKit([], name)];

  const videos = urlRels
    .filter((u) => /youtube|vimeo|video|streaming/i.test(String(u.type) + u.url?.resource))
    .map((u) => ({ url: u.url.resource, title: u.type, source: "artist-link" }));

  let charts = parseCharting([], name);
  try {
    const series = await mbFetch(`series?artist=${mbid}&fmt=json&limit=25`);
    charts = parseCharting(series.series || [], name);
  } catch {
    /* optional */
  }

  const data = {
    ok: true,
    artist: name,
    mbid,
    accreditation: {
      ...relBuckets,
      images: [],
      videos: videos.slice(0, 20),
      promoKit: dedupePromo(promoKit).slice(0, 36),
    },
    charts,
    tags: (artist.tags || []).slice(0, 12).map((t) => t.name),
  };
  metaCache.set(key, { created: Date.now(), data });
  return data;
}

/** @param {object[]} urlRels */
function parsePromoKitFromUrls(urlRels) {
  const promo = [];
  const seen = new Set();
  for (const u of urlRels) {
    const url = u.url?.resource;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    promo.push({ label: String(u.type || "link"), url, type: "official" });
  }
  return promo;
}

/** @param {{ label?: string, url?: string, type?: string }[]} rows */
function dedupePromo(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

function emptyAccred() {
  return {
    images: [],
    videos: [],
    agencies: [],
    technicians: [],
    tourCompanies: [],
    rightsHolders: [],
    sponsors: [],
    promoKit: [],
  };
}

/**
 * @param {string} rgMbid
 * @param {string} [artistName]
 */
export async function fetchAlbumDetail(rgMbid, artistName = "") {
  const key = `rg:${rgMbid}`;
  const cached = albumDetailCache.get(key);
  if (cached && Date.now() - cached.created < META_CACHE_TTL_MS) {
    return cached.data;
  }

  const [rg, caa] = await Promise.all([
    mbFetch(`release-group/${rgMbid}?inc=releases+artist-credits+url-rels&fmt=json`),
    caaFetch(rgMbid),
  ]);

  const releases = Array.isArray(rg.releases) ? rg.releases : [];
  const pick =
    releases.find((r) => r.status === "Official" && !r.disambiguation) || releases[0];
  if (!pick?.id) {
    const empty = { ok: true, rgMbid, title: rg.title, songs: [], accreditation: emptyAccred() };
    albumDetailCache.set(key, { created: Date.now(), data: empty });
    return empty;
  }

  const rel = await mbFetch(
    `release/${pick.id}?inc=artist-credits+labels+recordings+media+series-rels+url-rels+release-rels&fmt=json`,
  );

  const { images, videos: caaVideos } = parseCaaMedia(caa);
  const relBuckets = categorizeRelations(rel.relations, artistName);
  const labels = (rel["label-info"] || []).map((li) => ({
    name: li.label?.name || "Label",
    catalog: li["catalog-number"] || "",
    country: li.label?.country || "",
  }));

  const rightsHolders = [
    ...relBuckets.rightsHolders,
    ...labels.map((l) => ({ name: l.name, role: "label", catalog: l.catalog })),
  ];

  const promoKit = parsePromoKitFromUrls(
    (rel.relations || []).filter((r) => r.url?.resource).map((r) => ({ type: r.type, url: r.url })),
  );

  const videos = [
    ...caaVideos,
    ...(rel.relations || [])
      .filter((r) => r.url?.resource && /youtube|vimeo|video/i.test(r.type))
      .map((r) => ({ url: r.url.resource, title: r.type, source: "release-link" })),
  ];

  const charts = parseCharting(rel["series-rels"] || [], artistName || rg.title);

  /** @type {{ position: number, recordingId: string, title: string, lengthMs?: number }[]} */
  const tracklist = [];
  for (const medium of rel.media || []) {
    for (const t of medium.tracks || []) {
      tracklist.push({
        position: t.position ?? tracklist.length + 1,
        recordingId: t.recording?.id || t.id,
        title: t.title || t.recording?.title || "Track",
        lengthMs: t.length || t.recording?.length,
      });
    }
  }

  const recIds = tracklist.map((t) => t.recordingId).filter(Boolean).slice(0, 25);
  /** @type {Map<string, object>} */
  const recordingById = new Map();

  if (recIds.length) {
    const batch = await mbFetch(
      `recording?recording=${recIds.join("&recording=")}&inc=artist-credits+work-rels+isrcs+artist-rels&limit=100&fmt=json`,
    );
    for (const rec of batch.recordings || []) {
      recordingById.set(rec.id, rec);
    }
  }

  const songs = [];
  for (const tr of tracklist) {
    const rec = recordingById.get(tr.recordingId);
    const writers = [];
    const studios = [];
    const technicians = [];

    if (rec) {
      for (const ac of rec["artist-credit"] || []) {
        const n = ac.name || ac.artist?.name;
        const role = ac.joinphrase || "performer";
        if (n && !/writer|lyric|compos/i.test(role)) {
          technicians.push({ name: n, role });
        }
      }
      for (const r of rec.relations || []) {
        const n = r.artist?.name || r.place?.name;
        if (!n) continue;
        if (/studio|recorded|place/i.test(r.type)) studios.push({ name: n, role: r.type });
        else if (/mix|engineer|produc/i.test(r.type)) technicians.push({ name: n, role: r.type });
        else if (/writer|lyric|compos|author|words/i.test(r.type)) writers.push({ name: n, role: r.type });
      }
    }

    const isrc = rec?.isrcs?.[0] || null;
    songs.push({
      position: tr.position,
      title: tr.title,
      lengthMs: tr.lengthMs,
      writers: dedupePeople(writers),
      studios: dedupePeople(studios),
      technicians: dedupePeople(technicians),
      isrc,
      proSocieties: proLinks(tr.title, isrc, null),
    });
  }

  const data = {
    ok: true,
    rgMbid,
    releaseMbid: pick.id,
    title: rg.title,
    year: yearFromIso(rg["first-release-date"] || rel.date),
    accreditation: {
      ...relBuckets,
      images,
      videos,
      agencies: relBuckets.agencies,
      technicians: [...relBuckets.technicians, ...dedupePeople(songs.flatMap((s) => s.technicians))].slice(0, 40),
      tourCompanies: relBuckets.tourCompanies,
      rightsHolders: dedupePeople(rightsHolders),
      sponsors: relBuckets.sponsors,
      promoKit: dedupePromo(promoKit).slice(0, 24),
    },
    charts,
    songs,
    labels,
  };
  albumDetailCache.set(key, { created: Date.now(), data });
  return data;
}

/** @param {{ name: string, role?: string }[]} rows */
function dedupePeople(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = `${r.name}:${r.role || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** @param {string | undefined} iso */
function yearFromIso(iso) {
  if (!iso || iso.length < 4) return null;
  const y = Number.parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}
