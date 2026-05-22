/**
 * Cross-layout keyboard dictionary: same physical key path → layout strings.
 * Used to find phrase overlaps across all geometric-pattern mappings.
 */

import { KEYBOARD_LAYOUTS, LAYOUT_RING_ORDER } from "./phrase-keyboard-viz.js";

const BASE_LAYOUT_ID = "qwerty";

/** @typedef {{ r: number, c: number, ch: string }} KeyPos */

/** @param {string} layoutId */
function buildCharToPos(layoutId) {
  /** @type {Map<string, KeyPos>} */
  const map = new Map();
  const rows = KEYBOARD_LAYOUTS[layoutId]?.rows || [];
  rows.forEach((row, r) => {
    row.forEach((key, c) => {
      for (const ch of key) {
        const low = ch.toLowerCase();
        if (!map.has(low)) map.set(low, { r, c, ch: key });
      }
    });
  });
  return map;
}

const QWERTY_CHAR_POS = buildCharToPos(BASE_LAYOUT_ID);

/** @param {string} text */
function detectBaseLayout(text) {
  const chars = [...String(text).toLowerCase()].filter((c) => /\S/.test(c));
  if (!chars.length) return BASE_LAYOUT_ID;

  let best = BASE_LAYOUT_ID;
  let bestScore = 0;
  for (const id of LAYOUT_RING_ORDER) {
    const m = buildCharToPos(id);
    let matched = 0;
    for (const ch of chars) {
      if (m.has(ch)) matched += 1;
    }
    const score = matched / chars.length;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return bestScore >= 0.35 ? best : BASE_LAYOUT_ID;
}

/**
 * Physical key path for typed text (base layout coordinates).
 * @param {string} text
 * @param {string} [baseLayoutId]
 * @returns {KeyPos[]}
 */
export function keyPathForText(text, baseLayoutId = BASE_LAYOUT_ID) {
  const map = buildCharToPos(baseLayoutId);
  /** @type {KeyPos[]} */
  const path = [];
  for (const ch of String(text).toLowerCase()) {
    if (!/\S/.test(ch)) continue;
    const pos = map.get(ch);
    if (pos) path.push({ ...pos });
  }
  return path;
}

/**
 * @param {string} layoutId
 * @param {KeyPos[]} path
 */
function textFromKeyPath(layoutId, path) {
  const rows = KEYBOARD_LAYOUTS[layoutId]?.rows || [];
  return path
    .map(({ r, c }) => {
      const key = rows[r]?.[c];
      return key ?? "·";
    })
    .join("");
}

/**
 * Same finger positions on every layout (geometric mapping).
 * @param {string} text
 * @param {string} [baseLayoutId]
 */
export function crossLayoutTransliterations(text, baseLayoutId) {
  const base = detectBaseLayout(text) || baseLayoutId;
  const path = keyPathForText(text, base);
  /** @type {Record<string, { name: string, text: string }>} */
  const layouts = {};
  for (const id of LAYOUT_RING_ORDER) {
    layouts[id] = {
      name: KEYBOARD_LAYOUTS[id].name,
      text: textFromKeyPath(id, path),
    };
  }
  return { baseLayout: base, path, layouts };
}

/**
 * Search terms = query + every layout’s shadow string (and shadow tokens).
 * @param {string} query
 */
export function crossLayoutSearchTerms(query) {
  const terms = new Set();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const quoted = [...trimmed.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
  const baseTerms = quoted.length
    ? quoted
    : trimmed.split(/\s+/).filter((w) => w.length > 0);

  for (const t of baseTerms) {
    terms.add(t);
    const { layouts } = crossLayoutTransliterations(t);
    for (const v of Object.values(layouts)) {
      const shadow = v.text.replace(/·/g, "").trim();
      if (shadow.length >= 2) terms.add(shadow);
      for (const piece of shadow.split(/[\s·]+/).filter((x) => x.length >= 2)) {
        terms.add(piece);
      }
    }
  }
  return [...terms];
}

/** @param {KeyPos[]} a @param {KeyPos[]} b */
function pathsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.r === b[i].r && p.c === b[i].c);
}

/**
 * Build vocabulary from phrase index entries.
 * @param {Array<{ text: string, source: string }>} index
 */
/** @type {Record<string, string[]>} */
const COMMON_BY_SCRIPT = {
  Latin: [
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "you", "he",
    "she", "it", "we", "they", "this", "are", "was", "for", "not", "but", "with",
    "from", "at", "by", "on", "up", "out", "hey", "how", "who", "why", "what",
    "when", "where", "our", "your", "can", "will", "just", "like", "know", "take",
    "come", "see", "get", "go", "me", "my", "or", "an", "as", "is", "am", "do",
    "did", "has", "had", "were", "been", "being", "would", "could", "should",
    "about", "into", "over", "after", "all", "one", "two", "day", "way", "may",
    "say", "each", "which", "their", "time", "very", "good", "new", "old", "man",
    "men", "her", "him", "his", "its", "us", "yes", "no", "ok", "hi", "oh",
    "hey", "how", "are", "you", "who", "her", "him", "the", "and", "for",
  ],
  Cyrillic: [
    "и", "в", "не", "на", "я", "что", "он", "с", "как", "а", "то", "все", "она",
    "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "от", "со",
    "для", "по", "это", "как", "при", "нет", "да", "ну", "год", "день", "руб",
  ],
  Arabic: ["في", "من", "على", "أن", "إلى", "هذا", "هذه", "كان", "لا", "ما", "مع"],
  Hebrew: ["של", "את", "על", "לא", "זה", "הוא", "היא", "אני", "אתה", "כן", "לא"],
  Greek: ["και", "να", "είναι", "το", "της", "για", "με", "στο", "από", "δεν"],
  Hangul: ["그", "이", "저", "것", "수", "등", "및", "때", "년", "월", "일"],
  Thai: ["ที่", "และ", "ใน", "เป็น", "ไม่", "ได้", "มี", "จะ", "ก็", "ว่า"],
  Devanagari: ["का", "की", "के", "में", "है", "और", "से", "को", "पर", "यह"],
  "Latin/Kana": [
    "the", "be", "to", "of", "and", "a", "in", "you", "hey", "how", "are", "is",
  ],
};

/** @param {string} layoutId */
function scriptForLayout(layoutId) {
  return KEYBOARD_LAYOUTS[layoutId]?.script || "Latin";
}

/** @param {string} script @param {string} word */
function wordMatchesScript(script, word) {
  const w = word.normalize("NFC");
  if (script === "Cyrillic") return /^[\u0400-\u04FF]+$/u.test(w);
  if (script === "Arabic") return /^[\u0600-\u06FF]+$/u.test(w);
  if (script === "Hebrew") return /^[\u0590-\u05FF]+$/u.test(w);
  if (script === "Greek") return /^[\u0370-\u03FF]+$/u.test(w);
  if (script === "Hangul") return /^[\uAC00-\uD7AF\u3131-\u318E]+$/u.test(w);
  if (script === "Thai") return /^[\u0E00-\u0E7F]+$/u.test(w);
  if (script === "Devanagari") return /^[\u0900-\u097F]+$/u.test(w);
  return /^[a-zA-Z\u00C0-\u024F\u00df]+$/u.test(w);
}

/**
 * @param {Map<string, { count: number }>} vocabMap
 * @returns {Record<string, Set<string>>}
 */
function buildLayoutDictionaries(vocabMap) {
  /** @type {Record<string, Set<string>>} */
  const dicts = {};
  for (const id of LAYOUT_RING_ORDER) {
    const script = scriptForLayout(id);
    const set = new Set();
    for (const w of COMMON_BY_SCRIPT[script] || COMMON_BY_SCRIPT.Latin) {
      set.add(w.toLowerCase());
    }
    for (const [word] of vocabMap) {
      if (wordMatchesScript(script, word)) set.add(word.toLowerCase());
    }
    dicts[id] = set;
  }
  return dicts;
}

/**
 * Dictionary words found inside a layout shadow string (corpus + script lexicon).
 * @param {string} shadow
 * @param {Set<string>} dict
 * @returns {Array<{ word: string, source: string }>}
 */
function extractWordsFromShadow(shadow, dict) {
  /** @type {Array<{ word: string, source: string }>} */
  const found = [];
  const seen = new Set();
  const add = (w, source) => {
    const k = w.toLowerCase();
    if (k.length < 2 || seen.has(k) || !dict.has(k)) return;
    seen.add(k);
    found.push({ word: w, source });
  };

  const clean = shadow.replace(/·/g, "");

  for (const tok of clean.split(/[\s.,;:!?·_'"\-+/\\|@#$%^&*()[\]{}<>]+/).filter(Boolean)) {
    if (tok.length >= 2) add(tok, "token");
  }

  const runs = clean.match(/[\p{L}\p{M}]+/gu) || [];
  for (const run of runs) {
    const lower = run.toLowerCase();
    let i = 0;
    while (i < lower.length) {
      let matched = null;
      for (let len = Math.min(24, lower.length - i); len >= 2; len--) {
        const slice = lower.slice(i, i + len);
        if (dict.has(slice)) {
          matched = run.slice(i, i + len);
          i += len;
          break;
        }
      }
      if (matched) add(matched, "segment");
      else i += 1;
    }
  }

  return found.slice(0, 10);
}

/**
 * Words readable in each layout's script from the same-key shadow output.
 * @param {string} query
 * @param {Array<{ text: string }>} index
 */
export function crossLayoutShadowMeanings(query, index) {
  const { layouts } = crossLayoutTransliterations(query);
  const vocab = vocabularyFromIndex(index);
  const dicts = buildLayoutDictionaries(vocab);
  /** @type {Record<string, { label: string, title: string, hits: Array<{ word: string, source: string }> }>} */
  const meanings = {};

  for (const id of LAYOUT_RING_ORDER) {
    const shadow = layouts[id].text.replace(/·/g, "");
    const hits = extractWordsFromShadow(shadow, dicts[id]);
    meanings[id] = {
      hits,
      label: hits.length ? hits.map((h) => h.word).join(" · ") : "—",
      title: hits.length
        ? hits.map((h) => `${h.word} (${h.source === "segment" ? "segmented" : "token"})`).join(", ")
        : "No words in transcript or script lexicon for this shadow",
    };
  }
  return meanings;
}

export function vocabularyFromIndex(index) {
  /** @type {Map<string, { count: number, sources: Set<string> }>} */
  const vocab = new Map();
  for (const row of index) {
    const tokens = String(row.text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
    for (const tok of tokens) {
      const cur = vocab.get(tok) || { count: 0, sources: new Set() };
      cur.count += 1;
      cur.sources.add(row.source);
      vocab.set(tok, cur);
    }
  }
  return vocab;
}

/**
 * Words in corpus that overlap query via shared key paths or cross-shadow substring hits.
 * @param {string} query
 * @param {Array<{ text: string, source: string, label?: string }>} index
 */
export function findCrossLayoutOverlaps(query, index) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) {
    return { shadows: null, overlaps: [], shadowHits: [] };
  }

  const { baseLayout, path, layouts } = crossLayoutTransliterations(q);
  const vocab = vocabularyFromIndex(index);
  const qShadows = LAYOUT_RING_ORDER.map((id) => layouts[id].text.replace(/·/g, ""));

  /** @type {Array<{ word: string, kind: string, detail: string, count: number }>} */
  const overlaps = [];
  /** @type {Array<{ layout: string, shadow: string, word: string }>} */
  const shadowHits = [];

  const qPath = path;

  for (const [word, meta] of vocab) {
    if (word.length < 2) continue;
    const wPath = keyPathForText(word, baseLayout);

    if (pathsEqual(qPath, wPath)) {
      overlaps.push({
        word,
        kind: "same-keys",
        detail: `Identical key path on ${KEYBOARD_LAYOUTS[baseLayout].name}`,
        count: meta.count,
      });
      continue;
    }

    const wCross = crossLayoutTransliterations(word, baseLayout);
    for (const id of LAYOUT_RING_ORDER) {
      const wShadow = wCross.layouts[id].text.replace(/·/g, "");
      const qShadow = layouts[id].text.replace(/·/g, "");
      if (wShadow.length < 2 || qShadow.length < 2) continue;

      if (wShadow.includes(q) || qShadow.includes(word)) {
        overlaps.push({
          word,
          kind: "shadow-substring",
          detail: `${KEYBOARD_LAYOUTS[id].name}: «${wShadow}» ↔ «${qShadow}»`,
          count: meta.count,
        });
        shadowHits.push({
          layout: KEYBOARD_LAYOUTS[id].name,
          shadow: wShadow,
          word,
        });
      }
    }
  }

  overlaps.sort((a, b) => b.count - a.count);
  const deduped = [];
  const seen = new Set();
  for (const o of overlaps) {
    if (seen.has(o.word)) continue;
    seen.add(o.word);
    deduped.push(o);
    if (deduped.length >= 20) break;
  }

  return {
    shadows: { baseLayout, path, layouts, qShadows },
    overlaps: deduped,
    shadowHits: shadowHits.slice(0, 16),
  };
}

/**
 * Per-layout word-overlap % for the layout picker (shadow lexicon + corpus cross-ref).
 * @param {string} query
 * @param {Array<{ text: string, source?: string }>} index
 * @returns {Record<string, number | null>}
 */
export function layoutWordOverlapPercents(query, index) {
  /** @type {Record<string, number | null>} */
  const none = Object.fromEntries(LAYOUT_RING_ORDER.map((id) => [id, null]));
  const q = query.trim();
  if (!q || q.length < 2) return none;

  const hasIndex = Array.isArray(index) && index.length > 0;
  const { layouts } = crossLayoutTransliterations(q);
  const vocab = hasIndex ? vocabularyFromIndex(index) : new Map();
  const dicts = buildLayoutDictionaries(vocab);
  const cross = hasIndex
    ? findCrossLayoutOverlaps(q, index)
    : { overlaps: [], shadowHits: [] };

  /** @type {Record<string, number>} */
  const corpusHits = Object.fromEntries(LAYOUT_RING_ORDER.map((id) => [id, 0]));
  for (const h of cross.shadowHits || []) {
    for (const id of LAYOUT_RING_ORDER) {
      if (KEYBOARD_LAYOUTS[id].name === h.layout) corpusHits[id] += 1;
    }
  }
  for (const o of cross.overlaps || []) {
    for (const id of LAYOUT_RING_ORDER) {
      if (String(o.detail || "").includes(KEYBOARD_LAYOUTS[id].name)) {
        corpusHits[id] += o.count || 1;
      }
    }
  }

  const vocabN = Math.max(1, vocab.size);
  /** @type {Record<string, number | null>} */
  const out = { ...none };

  for (const id of LAYOUT_RING_ORDER) {
    const shadow = layouts[id].text.replace(/·/g, "");
    if (shadow.length < 2) {
      out[id] = 0;
      continue;
    }

    const lexHits = extractWordsFromShadow(shadow, dicts[id]);
    let covered = 0;
    for (const h of lexHits) covered += h.word.length;
    const shadowPct = Math.round((covered / shadow.length) * 100);

    if (!hasIndex) {
      out[id] = Math.min(100, shadowPct);
      continue;
    }

    const corpusPct = Math.min(100, Math.round((corpusHits[id] / vocabN) * 100));
    out[id] = Math.min(100, Math.round(shadowPct * 0.55 + corpusPct * 0.45));
  }

  return out;
}

/** @param {string} q */
function parseQueryTerms(q) {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const quoted = [...trimmed.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
  if (quoted.length) return quoted;
  return trimmed.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * @param {Array<{ id: string, source: string, label: string, text: string }>} index
 * @param {string} query
 * @param {string} primary
 */
export function searchIndexWithCrossLayout(index, query, primary) {
  const terms = parseQueryTerms(query);
  const crossTerms = crossLayoutSearchTerms(query);
  /** @type {Array<object>} */
  const hits = [];

  for (const row of index) {
    const text = row.text.toLowerCase();
    const direct =
      terms.length > 0 && terms.every((t) => text.includes(t.toLowerCase()));
    const cross =
      !direct &&
      crossTerms.some(
        (t) => t.length >= 2 && text.includes(t.toLowerCase()),
      );
    if (!direct && !cross) continue;
    hits.push({
      ...row,
      primary,
      matchKind: direct ? "direct" : "cross-layout",
    });
  }

  hits.sort((a, b) => {
    if (a.matchKind !== b.matchKind) {
      return a.matchKind === "direct" ? -1 : 1;
    }
    const src = {
      transcript: 0,
      "scene-caption": 1,
      scene: 2,
      program: 3,
      keyboard: 4,
      queue: 5,
      prompt: 6,
    };
    const da = src[a.source] ?? 9;
    const db = src[b.source] ?? 9;
    if (da !== db) return da - db;
    return (a.startSec ?? 0) - (b.startSec ?? 0);
  });

  return hits.slice(0, 48);
}
