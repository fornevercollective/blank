/**
 * Artist / album accreditation — MusicBrainz, Cover Art Archive, PRO & chart links.
 */
const META_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MB_AGENT = "BlankLiveConcerts/1.0 (+https://github.com/blank-local)";
const MB_MIN_GAP_MS = 1100;
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Max per-album recording lookups (MusicBrainz rate limit ≈1 req/s). */
const MAX_RECORDING_LOOKUPS = 15;

/** Escape Lucene special chars inside a quoted artist:"…" search. */
function escapeLuceneQuoted(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/** @param {string} artistName */
function artistSearchQuery(artistName) {
  const trimmed = String(artistName || "").trim();
  if (!trimmed) return "";
  return `artist:"${escapeLuceneQuoted(trimmed)}"`;
}

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
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint = detail ? ` — ${detail.slice(0, 120)}` : "";
    throw new Error(`MusicBrainz ${res.status}${hint}`);
  }
  return res.json();
}

/** @param {string[]} recIds */
async function fetchRecordingDetails(recIds) {
  /** @type {Map<string, object>} */
  const recordingById = new Map();
  for (const id of recIds.slice(0, MAX_RECORDING_LOOKUPS)) {
    if (!MBID_RE.test(id)) continue;
    try {
      const rec = await mbFetch(
        `recording/${id}?inc=artist-credits+work-rels+isrcs+artist-rels+tags+annotation&fmt=json`,
      );
      if (rec?.id) recordingById.set(rec.id, rec);
    } catch {
      /* skip track — keep album shell */
    }
  }
  return recordingById;
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

  let mbid = artistMbid && MBID_RE.test(artistMbid) ? artistMbid : undefined;
  if (!mbid) {
    const q = artistSearchQuery(artistName);
    if (!q) {
      const empty = { ok: true, artist: artistName, accreditation: emptyAccred(), charts: [] };
      metaCache.set(key, { created: Date.now(), data: empty });
      return empty;
    }
    const search = await mbFetch(
      `artist/?query=${encodeURIComponent(q)}&limit=1&fmt=json`,
    );
    mbid = search.artists?.[0]?.id;
  }
  if (!mbid) {
    const empty = { ok: true, artist: artistName, accreditation: emptyAccred(), charts: [] };
    metaCache.set(key, { created: Date.now(), data: empty });
    return empty;
  }

  const artist = await mbFetch(
    `artist/${mbid}?inc=artist-rels+url-rels+tags+aliases+series-rels&fmt=json`,
  );
  const name = artist.name || artistName;
  const span = artist["life-span"] || {};
  const begin = String(span.begin || "").slice(0, 10);
  const end = String(span.end || "").slice(0, 10);
  const activeYears =
    begin && span.ended && end
      ? `${begin.slice(0, 4)}–${end.slice(0, 4)}`
      : begin
        ? `${begin.slice(0, 4)}–`
        : "";
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

  const charts = parseCharting(artist["series-rels"] || [], name);

  const data = {
    ok: true,
    artist: name,
    mbid,
    profile: {
      name,
      type: artist.type || "",
      country: artist.country || "",
      disambiguation: artist.disambiguation || "",
      begin,
      end,
      activeYears,
      ended: Boolean(span.ended),
      mbUrl: `https://musicbrainz.org/artist/${mbid}`,
      aliases: (artist.aliases || [])
        .map((a) => a.name)
        .filter(Boolean)
        .slice(0, 8),
    },
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

  if (!MBID_RE.test(rgMbid)) {
    const empty = {
      ok: true,
      rgMbid,
      title: "",
      songs: [],
      accreditation: emptyAccred(),
      musicians: { studio: [], touring: [], lineup: [] },
      releaseTimeline: [],
      awards: [],
      associations: [],
      tags: [],
      annotation: null,
    };
    albumDetailCache.set(key, { created: Date.now(), data: empty });
    return empty;
  }

  const [rg, caa] = await Promise.all([
    mbFetch(
      `release-group/${rgMbid}?inc=releases+artist-credits+url-rels+tags+annotation&fmt=json`,
    ),
    caaFetch(rgMbid),
  ]);

  const releases = Array.isArray(rg.releases) ? rg.releases : [];
  const pick =
    releases.find((r) => r.status === "Official" && !r.disambiguation) || releases[0];
  if (!pick?.id) {
    const empty = {
      ok: true,
      rgMbid,
      title: rg.title,
      songs: [],
      accreditation: emptyAccred(),
      musicians: { studio: [], touring: [], lineup: [] },
      releaseTimeline: [],
      awards: [],
      associations: [],
      tags: [],
      annotation: null,
    };
    albumDetailCache.set(key, { created: Date.now(), data: empty });
    return empty;
  }

  const rel = await mbFetch(
    `release/${pick.id}?inc=artist-credits+labels+recordings+media+series-rels+url-rels+release-rels+release-events&fmt=json`,
  );

  const albumYear =
    yearFromIso(rg["first-release-date"] || rel.date) ?? yearFromIso(pick.date);
  const headlinerAc = (rg["artist-credit"] || rel["artist-credit"] || [])[0];
  const headlinerName =
    String(headlinerAc?.name || headlinerAc?.artist?.name || artistName || "").trim();
  let headliner = headlinerAc?.artist
    ? headlinerFromArtist(headlinerAc.artist, albumYear)
    : null;
  const headlinerMbid = headlinerAc?.artist?.id;
  if (headlinerMbid && MBID_RE.test(headlinerMbid)) {
    try {
      const headArtist = await mbFetch(
        `artist/${headlinerMbid}?inc=artist-rels+tags+annotation&fmt=json`,
      );
      headliner = headlinerFromArtist(headArtist, albumYear);
    } catch {
      /* keep credit-derived headliner */
    }
  }

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

  const recIds = tracklist.map((t) => t.recordingId).filter(Boolean);
  const recordingById = recIds.length ? await fetchRecordingDetails(recIds) : new Map();

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
    const extras = parseRecordingExtras(rec);
    songs.push({
      position: tr.position,
      title: tr.title,
      lengthMs: tr.lengthMs,
      writers: dedupePeople(writers),
      studios: dedupePeople(studios),
      technicians: dedupePeople(technicians),
      isrc,
      proSocieties: proLinks(tr.title, isrc, null),
      trivia: extras.trivia,
      meaning: extras.meaning,
      tags: extras.tags,
    });
  }

  /** @type {object[]} */
  const creditPool = [...(rel["artist-credit"] || [])];
  for (const rec of recordingById.values()) {
    for (const ac of rec["artist-credit"] || []) creditPool.push(ac);
  }
  const musicians = parseMusicianLineup(creditPool, albumYear, headlinerName);
  const releaseTimeline = parseReleaseTimeline(rg, rel);
  const awards = [
    ...parseAwards(rel["series-rels"] || [], rel.relations || []),
    ...parseAwards(rg["series-rels"] || [], rg.relations || []),
  ];
  const associations = parseAssociations(
    [...(rel.relations || []), ...(rg.relations || [])],
    headlinerName || artistName,
  );
  const rgTags = (rg.tags || []).slice(0, 10).map((t) => t.name);
  const annotation = String(rg.annotation || "").trim() || null;
  const tourRoster = parseTourRoster(
    { touring: musicians.touring, tourCompanies: relBuckets.tourCompanies },
    associations,
  );
  const financial = parseFinancialNotes(rel.relations || [], headlinerName || artistName);
  const trivia = parseAlbumTrivia(annotation, headliner, rgTags);

  const data = {
    ok: true,
    rgMbid,
    releaseMbid: pick.id,
    title: rg.title,
    year: albumYear ?? yearFromIso(rg["first-release-date"] || rel.date),
    artist: headlinerName || artistName,
    headliner,
    musicians,
    releaseTimeline,
    awards: dedupeAwards(awards),
    associations,
    tags: rgTags,
    annotation,
    trivia,
    tourRoster,
    financial,
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

/** @param {string | undefined} iso */
function formatIsoDate(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  if (s.length >= 10) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }
  if (s.length >= 4) return s.slice(0, 4);
  return s;
}

/** @param {string | undefined} iso */
function formatIsoDateTime(iso) {
  const s = String(iso || "").trim();
  if (!s) return { label: "", hasTime: false, iso: s };
  const hasTime = s.length > 10 && /T\d/.test(s);
  const d = new Date(hasTime ? s : `${s.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { label: formatIsoDate(s), hasTime: false, iso: s };
  }
  const label = hasTime
    ? d.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : d.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  return { label, hasTime, iso: s };
}

/** @param {object} rec */
function parseRecordingExtras(rec) {
  if (!rec) return { trivia: null, meaning: null, tags: [] };
  const annotation = String(rec.annotation || "").trim();
  const tags = (rec.tags || []).map((t) => t.name).filter(Boolean);
  let meaning = null;
  for (const r of rec.relations || []) {
    if (r.work?.disambiguation) {
      meaning = r.work.disambiguation;
      break;
    }
    if (/lyric|meaning|theme|based on/i.test(String(r.type)) && r.work?.title) {
      meaning = `${r.type}: ${r.work.title}`;
    }
  }
  return {
    trivia: annotation || (tags.length ? tags.join(", ") : null),
    meaning,
    tags: tags.slice(0, 8),
  };
}

/** @param {object[]} relations @param {string} artistName */
function parseFinancialNotes(relations, artistName) {
  const rows = [];
  const seen = new Set();
  for (const r of relations || []) {
    const type = String(r.type || "");
    if (
      !/royalt|finance|purchas|fund|invest|licen|distribut|market|publish|copyright|commission/i.test(
        type,
      )
    ) {
      continue;
    }
    const name = r.artist?.name || r.label?.name || r.company?.name || "";
    if (!name) continue;
    const key = `${type}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name,
      role: type,
      spanLabel:
        r.begin || r.end
          ? `${formatIsoDate(r.begin)}${r.end ? ` – ${formatIsoDate(r.end)}` : ""}`
          : "",
    });
  }
  if (artistName) {
    rows.push({
      name: "PRO / royalty search",
      role: "lookup",
      url: `https://www.ascap.com/repertory#/ace/search/title/${encodeURIComponent(artistName)}`,
    });
  }
  return rows.slice(0, 16);
}

/**
 * @param {{ touring: object[], tourCompanies: object[] }} mus
 * @param {object[]} associations
 */
function parseTourRoster(mus, associations) {
  const rows = [];
  const seen = new Set();
  const push = (name, role, extra = "") => {
    const k = `${name}:${role}`;
    if (!name || seen.has(k)) return;
    seen.add(k);
    rows.push({ name, role, extra });
  };
  for (const m of mus.touring || []) {
    push(
      m.name,
      (m.roles || []).join(", ") || "touring",
      [m.ageAtRelease != null ? `age ${m.ageAtRelease}` : "", m.ageBracket, m.birthLabel]
        .filter(Boolean)
        .join(" · "),
    );
  }
  for (const t of mus.tourCompanies || []) {
    push(t.name, t.role || "tour");
  }
  for (const a of associations || []) {
    if (/tour|concert|live|performance|road/i.test(a.type)) {
      push(a.name, a.type, a.spanLabel || "");
    }
  }
  return rows;
}

/**
 * @param {string|null} rgAnnotation
 * @param {object|null} headliner
 * @param {string[]} tags
 */
function parseAlbumTrivia(rgAnnotation, headliner, tags) {
  const bits = [];
  if (rgAnnotation) bits.push(rgAnnotation);
  if (headliner?.annotation) bits.push(headliner.annotation);
  const tagLine = (tags || []).length ? `Tags: ${tags.join(", ")}` : "";
  if (tagLine) bits.push(tagLine);
  const text = bits.join("\n\n").trim();
  return text || null;
}

/** @param {string | undefined} birthIso @param {number|null} albumYear */
function ageAtYear(birthIso, albumYear) {
  const y = yearFromIso(birthIso);
  if (!Number.isFinite(y) || !Number.isFinite(albumYear)) return null;
  return albumYear - y;
}

/** @param {string | undefined} birthIso @param {string | undefined} onIso */
function ageOnDate(birthIso, onIso) {
  const by = yearFromIso(birthIso);
  const oy = yearFromIso(onIso);
  if (!Number.isFinite(by) || !Number.isFinite(oy)) return null;
  return oy - by;
}

const TOURING_ROLE_RE =
  /tour(ing)?|live\b|on stage|concert|performance|road band|opening act/i;
const STUDIO_ROLE_RE =
  /studio|session|additional|guest|overdub|programming|arrang|producer|engineer|mix|master|record/i;
const INSTRUMENT_RE =
  /guitar|drums|bass|keyboard|piano|vocal|harmonica|synth|organ|percussion|cello|violin|trumpet|sax/i;

/**
 * @param {string} joinphrase
 * @param {string} [relType]
 * @returns {"studio"|"touring"|"lineup"}
 */
function musicianBucket(joinphrase, relType = "") {
  const s = `${joinphrase} ${relType}`.trim();
  if (TOURING_ROLE_RE.test(s)) return "touring";
  if (STUDIO_ROLE_RE.test(s) || INSTRUMENT_RE.test(s)) return "studio";
  return "lineup";
}

/**
 * @param {object[]} artistCredit
 * @param {number|null} albumYear
 * @param {string} headlinerName
 */
function parseMusicianLineup(artistCredit, albumYear, headlinerName) {
  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const ac of artistCredit || []) {
    const name = String(ac.name || ac.artist?.name || "").trim();
    if (!name || name === headlinerName) continue;
    const join = String(ac.joinphrase || "").trim();
    const role = join || "performer";
    const bucket = musicianBucket(join, role);
    const birth = ac.artist?.["life-span"]?.begin || "";
    const key = `${name}:${bucket}`;
    const age =
      ageAtYear(birth, albumYear) ??
      (albumYear && birth ? ageAtYear(birth, albumYear) : null);
    const existing = byKey.get(key);
    if (existing) {
      if (role && !existing.roles.includes(role)) existing.roles.push(role);
      continue;
    }
    byKey.set(key, {
      name,
      bucket,
      roles: role ? [role] : [],
      birth,
      birthLabel: formatIsoDate(birth),
      ageAtRelease: age,
      ageBracket:
        age != null && age >= 0
          ? age < 18
            ? "under 18"
            : age < 30
              ? "18–29"
              : age < 50
                ? "30–49"
                : "50+"
          : null,
      mbid: ac.artist?.id || null,
    });
  }
  const studio = [];
  const touring = [];
  const lineup = [];
  for (const row of byKey.values()) {
    if (row.bucket === "touring") touring.push(row);
    else if (row.bucket === "studio") studio.push(row);
    else lineup.push(row);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  studio.sort(byName);
  touring.sort(byName);
  lineup.sort(byName);
  return { studio, touring, lineup };
}

/**
 * @param {object} rg
 * @param {object} primary
 */
function parseReleaseTimeline(rg, primary) {
  /** @type {Map<string, object>} */
  const seen = new Map();
  const add = (row) => {
    const k = `${row.date || ""}|${row.country || ""}|${row.kind}`;
    if (seen.has(k)) return;
    seen.set(k, row);
  };

  for (const r of rg.releases || []) {
    add({
      kind: r.id === primary.id ? "primary" : "edition",
      date: r.date || null,
      dateLabel: formatIsoDate(r.date),
      country: r.country || "",
      status: r.status || "",
      title: r.title || rg.title,
      note: r.disambiguation || "",
    });
  }

  for (const ev of primary["release-events"] || []) {
    const dt = formatIsoDateTime(ev.date);
    add({
      kind: "release-event",
      date: ev.date || null,
      dateLabel: dt.label,
      hasTime: dt.hasTime,
      country: ev.area?.name || ev.area?.["iso-3166-1-codes"]?.[0] || "",
      status: primary.status || "",
      title: rg.title,
      note: dt.hasTime ? "Release event (date+time)" : "Release event (date only)",
    });
  }

  for (const r of rg.releases || []) {
    if (!r.date || r.id === primary.id) continue;
    const dt = formatIsoDateTime(r.date);
    add({
      kind: "re-release",
      date: r.date,
      dateLabel: dt.label,
      hasTime: dt.hasTime,
      country: r.country || "",
      status: r.status || "",
      title: r.title || rg.title,
      note: r.disambiguation || "Edition / re-release",
    });
  }

  return [...seen.values()].sort((a, b) =>
    String(a.date || "9999").localeCompare(String(b.date || "9999")),
  );
}

/** @param {object[]} seriesRels @param {object[]} relations */
function parseAwards(seriesRels, relations) {
  const awards = [];
  const seen = new Set();
  const push = (row) => {
    const k = `${row.title}:${row.detail}:${row.date}`;
    if (seen.has(k)) return;
    seen.add(k);
    awards.push(row);
  };

  for (const s of seriesRels || []) {
    const name = s.series?.name || s.name || "";
    if (!/award|grammy|brit|mtv|gold|platinum|certif|chart|hot 100|top \d/i.test(name)) {
      continue;
    }
    push({
      title: name,
      detail: s.type || "chart / series",
      date: s.begin || s.end || null,
      dateLabel: formatIsoDate(s.begin || s.end),
      source: "musicbrainz-series",
    });
  }

  for (const r of relations || []) {
    if (!/award|nominated|won|grammy|prize|honou?r/i.test(String(r.type))) continue;
    push({
      title: r.type,
      detail: r.artist?.name || r.label?.name || r.series?.name || "",
      date: r.begin || r.end || null,
      dateLabel: formatIsoDate(r.begin || r.end),
      source: "relation",
    });
  }

  return awards;
}

/** @param {object[]} rows */
function dedupeAwards(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = `${r.title}:${r.detail}:${r.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(0, 20);
}

/** @param {object[]} relations @param {string} artistName */
function parseAssociations(relations, artistName) {
  const out = [];
  const seen = new Set();
  for (const r of relations || []) {
    const type = String(r.type || "").trim();
    if (
      !/member of|collaborat|support|associated|involv|part of|founded|sibling|married|influenc|student|teacher|protégé|tribute/i.test(
        type,
      )
    ) {
      continue;
    }
    const name =
      r.artist?.name ||
      r.label?.name ||
      r.series?.name ||
      r.place?.name ||
      r.event?.name ||
      "";
    if (!name || name === artistName) continue;
    const key = `${type}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      type,
      direction: r.direction === "backward" ? "←" : "→",
      begin: r.begin || null,
      end: r.end || null,
      spanLabel:
        r.begin || r.end
          ? `${formatIsoDate(r.begin)}${r.end ? ` – ${formatIsoDate(r.end)}` : ""}`
          : "",
    });
  }
  return out.slice(0, 24);
}

/** @param {object} artist @param {number|null} albumYear */
function headlinerFromArtist(artist, albumYear) {
  const span = artist["life-span"] || {};
  const begin = String(span.begin || "").slice(0, 10);
  const end = String(span.end || "").slice(0, 10);
  const age = ageAtYear(begin, albumYear);
  return {
    name: artist.name || "",
    type: artist.type || "",
    country: artist.country || "",
    birth: begin,
    birthLabel: formatIsoDate(begin),
    birthDay:
      begin.length >= 10
        ? formatIsoDateTime(begin).label
        : formatIsoDate(begin),
    deathOrEnd: span.ended && end ? formatIsoDate(end) : "",
    ageAtRelease: age,
    ageBracket:
      age != null && age >= 0
        ? age < 18
          ? "under 18"
          : age < 30
            ? "18–29"
            : age < 50
              ? "30–49"
              : "50+"
        : null,
    mbUrl: artist.id ? `https://musicbrainz.org/artist/${artist.id}` : "",
    tags: (artist.tags || []).slice(0, 8).map((t) => t.name),
    annotation: String(artist.annotation || "").trim() || null,
  };
}
