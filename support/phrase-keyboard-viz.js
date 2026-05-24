/**
 * Multi-layout geometric keyboard heatmap (kbatch-style cv-geometric overlay).
 */

import { escapeHtml } from "./video-ingest.js";

/** @typedef {{ name: string, region: string, script: string, dir: string, rows: string[][], homeRow: string, note?: string }} KeyboardLayout */

/** @type {Record<string, KeyboardLayout>} */
export const KEYBOARD_LAYOUTS = {
  qwerty: {
    name: "QWERTY",
    region: "US/International",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
      ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
    ],
    homeRow: "asdfghjkl;",
  },
  dvorak: {
    name: "Dvorak",
    region: "US",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["`", ",", ".", "p", "y", "f", "g", "c", "r", "l"],
      ["a", "o", "e", "u", "i", "d", "h", "t", "n", "s"],
      [";", "q", "j", "k", "x", "b", "m", "w", "v", "z"],
    ],
    homeRow: "aoeuidhtns",
  },
  colemak: {
    name: "Colemak",
    region: "US",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["q", "w", "f", "p", "g", "j", "l", "u", "y", ";"],
      ["a", "r", "s", "t", "d", "h", "n", "e", "i", "o"],
      ["z", "x", "c", "v", "b", "k", "m", ",", ".", "/"],
    ],
    homeRow: "arstdhneio",
  },
  azerty: {
    name: "AZERTY",
    region: "France",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
      ["w", "x", "c", "v", "b", "n", ",", ";", ":", "!"],
    ],
    homeRow: "qsdfghjklm",
  },
  qwertz: {
    name: "QWERTZ",
    region: "Germany",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö"],
      ["y", "x", "c", "v", "b", "n", "m", ",", ".", "-"],
    ],
    homeRow: "asdfghjklö",
  },
  jcuken: {
    name: "ЙЦУКЕН",
    region: "Russia",
    script: "Cyrillic",
    dir: "ltr",
    rows: [
      ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з"],
      ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж"],
      ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "."],
    ],
    homeRow: "фывапролдж",
  },
  korean: {
    name: "Hangul 2-set",
    region: "Korea",
    script: "Hangul",
    dir: "ltr",
    rows: [
      ["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅅ", "ㅛ", "ㅕ", "ㅑ", "ㅐ", "ㅔ"],
      ["ㅁ", "ㄴ", "ㅇ", "ㄹ", "ㅎ", "ㅗ", "ㅓ", "ㅏ", "ㅣ", "ㅡ"],
      ["ㅋ", "ㅌ", "ㅊ", "ㅍ", "ㅠ", "ㅜ", "ㅡ", "ㅣ", "ㅐ", "ㅔ"],
    ],
    homeRow: "ㅁㄴㅇㄹㅎㅗㅓㅏㅣㅡ",
  },
  japanese: {
    name: "JIS Romaji",
    region: "Japan",
    script: "Latin/Kana",
    dir: "ltr",
    rows: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
      ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
    ],
    homeRow: "asdfghjkl;",
  },
  arabic: {
    name: "Arabic",
    region: "MENA",
    script: "Arabic",
    dir: "rtl",
    rows: [
      ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح"],
      ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك"],
      ["ئ", "ء", "ؤ", "ر", "ل", "ا", "ة", "و", "ز", "ظ"],
    ],
    homeRow: "شسيبلاتنمك",
  },
  hindi: {
    name: "Devanagari",
    region: "India",
    script: "Devanagari",
    dir: "ltr",
    rows: [
      ["ौ", "ै", "ा", "ी", "ू", "ब", "ह", "ग", "द", "ज"],
      ["ो", "े", "्", "ि", "ु", "प", "र", "क", "त", "च"],
      ["ॉ", "ॅ", "ृ", "न", "व", "ल", "स", ",", ".", "?"],
    ],
    homeRow: "ोे्िुप्रकतच",
  },
  hebrew: {
    name: "Hebrew",
    region: "Israel",
    script: "Hebrew",
    dir: "rtl",
    rows: [
      ["/", "'", "ק", "ר", "א", "ט", "ו", "ן", "ם", "פ"],
      ["ש", "ד", "ג", "כ", "ע", "י", "ח", "ל", "ך", "ף"],
      ["ז", "ס", "ב", "ה", "נ", "מ", "צ", "ת", "ץ", "."],
    ],
    homeRow: "שדגכעיחלךף",
  },
  greek: {
    name: "Greek",
    region: "Greece",
    script: "Greek",
    dir: "ltr",
    rows: [
      [";", "ς", "ε", "ρ", "τ", "υ", "θ", "ι", "ο", "π"],
      ["α", "σ", "δ", "φ", "γ", "η", "ξ", "κ", "λ", "΄"],
      ["ζ", "χ", "ψ", "ω", "β", "ν", "μ", ",", ".", "/"],
    ],
    homeRow: "ασδφγηξκλ΄",
  },
  thai: {
    name: "Kedmanee",
    region: "Thailand",
    script: "Thai",
    dir: "ltr",
    rows: [
      ["ๆ", "ไ", "ำ", "พ", "ะ", "ั", "ี", "ร", "น", "ย"],
      ["ฟ", "ห", "ก", "ด", "เ", "้", "่", "า", "ส", "ว"],
      ["ผ", "ป", "แ", "อ", "ิ", "ื", "ท", "ม", "ใ", "ฝ"],
    ],
    homeRow: "ฟหกดเ้่าสว",
  },
  turkish_f: {
    name: "Turkish F",
    region: "Turkey",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["f", "g", "ğ", "ı", "o", "d", "r", "n", "h", "p"],
      ["u", "i", "e", "a", "ü", "t", "k", "m", "l", "y"],
      ["j", "ö", "v", "c", "ç", "z", "s", "b", ".", ","],
    ],
    homeRow: "uieaütkmly",
  },
  vietnamese: {
    name: "Vietnamese",
    region: "Vietnam",
    script: "Latin",
    dir: "ltr",
    rows: [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
      ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
    ],
    homeRow: "asdfghjkl;",
  },
};

export const LAYOUT_RING_ORDER = Object.keys(KEYBOARD_LAYOUTS);

/** Light theme — matches :root bone / line / ink in styles.css */
const KB_THEME = {
  canvasBg: "#ffffff",
  keyFill: "#fafafa",
  keyStroke: "#e0e0e0",
  footnote: "#737373",
  ink: "#171717",
  inkMute: "#737373",
  spiral: (a) => `rgba(109, 40, 217, ${a})`,
  spiralSoft: (a) => `rgba(109, 40, 217, ${a})`,
  nodeInactive: "#a3a3a3",
  keyLabelStrip: "rgba(245, 245, 245, 0.95)",
};

/** @param {number} intensity 0…1 */
function thermalColor(intensity) {
  const i = Math.min(1, Math.max(0, intensity));
  if (i < 0.2) return `rgb(${Math.floor(i * 5 * 80)},${Math.floor(i * 5 * 120)},${Math.floor(180 + i * 5 * 75)})`;
  if (i < 0.4) {
    return `rgb(${Math.floor(40 + (i - 0.2) * 5 * 100)},${Math.floor(180 - (i - 0.2) * 5 * 40)},${Math.floor(100 - (i - 0.2) * 5 * 100)})`;
  }
  if (i < 0.6) return `rgb(${Math.floor(200 + (i - 0.4) * 5 * 55)},${Math.floor(200 - (i - 0.4) * 5 * 80)},0)`;
  if (i < 0.8) return `rgb(255,${Math.floor(120 - (i - 0.6) * 5 * 80)},0)`;
  return `rgb(255,${Math.floor(40 + (i - 0.8) * 5 * 200)},${Math.floor((i - 0.8) * 5 * 200)})`;
}

/**
 * Letter heatmap from query + transcript index hits.
 * @param {string} query
 * @param {Array<{ text: string }>} [indexHits]
 */
export function buildPhraseLetterHeatmap(query, indexHits = []) {
  /** @type {Record<string, number>} */
  const hm = {};
  const bump = (ch, n = 1) => {
    if (!ch || ch.length !== 1) return;
    hm[ch] = (hm[ch] || 0) + n;
    const low = ch.toLowerCase();
    if (low !== ch) hm[low] = (hm[low] || 0) + n;
  };
  for (const ch of query) bump(ch, 4);
  for (const row of indexHits) {
    const t = String(row.text || "");
    for (const ch of t) bump(ch, 1);
  }
  return hm;
}

/**
 * Cross-layout letter map: which layouts expose each heated character.
 * @param {Record<string, number>} heatmap
 */
export function buildLayoutCrossRef(heatmap) {
  /** @type {Record<string, { layouts: string[], keys: string[] }>} */
  const byChar = {};
  const hot = Object.entries(heatmap)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);

  for (const [ch] of hot) {
    byChar[ch] = { layouts: [], keys: [] };
  }

  for (const id of LAYOUT_RING_ORDER) {
    const layout = KEYBOARD_LAYOUTS[id];
    for (const key of layout.rows.flat()) {
      const variants = [key, key.toLowerCase(), key.toUpperCase()];
      for (const v of variants) {
        if (heatmap[v] > 0 && byChar[v]) {
          if (!byChar[v].layouts.includes(layout.name)) byChar[v].layouts.push(layout.name);
          const label = `${layout.name}:${key}`;
          if (!byChar[v].keys.includes(label)) byChar[v].keys.push(label);
        }
      }
    }
  }
  return { byChar, hot };
}

export const BASE_LAYOUT_ID = "qwerty";

/** @typedef {{ from: string, to: string, dx: number, dy: number, dist: number }} TypingTransition */

/** @typedef {{ heatmap: Record<string, number>, transitions: TypingTransition[], metrics: Record<string, string | number>, lastKey: string | null }} PhraseTypingAnalysis */

/** @param {string} layoutId */
function keyPosForLayout(layoutId) {
  const rows = KEYBOARD_LAYOUTS[layoutId]?.rows || KEYBOARD_LAYOUTS[BASE_LAYOUT_ID].rows;
  /** @type {Record<string, { x: number, y: number }>} */
  const map = {};
  rows.forEach((row, r) => {
    row.forEach((key, c) => {
      for (const ch of key) {
        map[ch] = { x: c, y: r };
        map[ch.toLowerCase()] = { x: c, y: r };
      }
    });
  });
  map[" "] = { x: 5, y: 1 };
  return map;
}

/**
 * kbatch-style typing path + metrics for phrase search query on a layout.
 * @param {string} text
 * @param {string} layoutId
 * @param {Record<string, number>} phraseHeatmap
 */
export function analyzePhraseTyping(text, layoutId, phraseHeatmap = {}) {
  const keyPos = keyPosForLayout(layoutId);
  /** @type {Record<string, number>} */
  const heatmap = { ...phraseHeatmap };
  /** @type {TypingTransition[]} */
  const transitions = [];
  /** @type {Record<string, number>} */
  const wordFreq = {};
  let totalDist = 0;
  let totalKeys = 0;
  /** @type {string | null} */
  let lastKey = null;
  let lastPos = null;

  const src = String(text || "");
  for (const raw of src) {
    const ch = raw.toLowerCase();
    if (ch === " ") {
      heatmap[" "] = (heatmap[" "] || 0) + 1;
      lastKey = " ";
      lastPos = keyPos[" "];
      totalKeys += 1;
      continue;
    }
    const pos = keyPos[ch];
    if (!pos) continue;
    heatmap[ch] = (heatmap[ch] || 0) + 1;
    totalKeys += 1;
    if (lastPos && lastKey && lastKey !== " ") {
      const dx = pos.x - lastPos.x;
      const dy = pos.y - lastPos.y;
      const dist = Math.hypot(dx, dy);
      totalDist += dist;
      transitions.push({ from: lastKey, to: ch, dx, dy, dist });
    }
    lastKey = ch;
    lastPos = pos;
  }

  for (const w of src.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []) {
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  }
  const words = Object.keys(wordFreq).length;
  const hapax = Object.values(wordFreq).filter((c) => c === 1).length;
  const avgDist = transitions.length ? totalDist / transitions.length : 0;
  const efficiency = Math.max(0, Math.min(100, Math.round(100 - avgDist * 30)));
  const strain = Math.min(100, Math.round(avgDist * 25));
  const rowChanges = transitions.filter((t) => Math.abs(t.dy) > 0.3).length;
  const complexity = transitions.length
    ? Math.min(100, Math.round((rowChanges / transitions.length) * 150))
    : 0;
  const wpm =
    src.length > 2 ? Math.max(1, Math.round((words / Math.max(0.5, src.length / 5)) * 60)) : 0;
  const tone =
    complexity >= 55 ? "complex" : efficiency >= 62 ? "flow" : words ? "neutral" : "—";

  return {
    heatmap,
    transitions,
    lastKey,
    metrics: {
      wpm,
      efficiency,
      complexity,
      strain,
      keys: totalKeys,
      distance: avgDist.toFixed(1),
      words,
      hapax,
      layout: KEYBOARD_LAYOUTS[layoutId]?.name || layoutId,
      tone,
      paths: transitions.length,
      stack: words ? "phrase" : "idle",
      stream: src.length ? "live" : "idle",
    },
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {PhraseTypingAnalysis} analysis
 * @param {string} layoutId
 * @param {number} W
 * @param {number} H
 */
function renderContrailsPanel(ctx, analysis, layoutId, W, H) {
  ctx.fillStyle = KB_THEME.canvasBg;
  ctx.fillRect(0, 0, W, H);

  const keyPos = keyPosForLayout(layoutId);
  const trans = analysis.transitions;
  const lastKey = analysis.lastKey;

  const kx = (key) => {
    const p = keyPos[key];
    return p ? 14 + (p.x / 10) * (W - 28) : W / 2;
  };
  const ky = (key) => {
    const p = keyPos[key];
    return p ? 10 + (p.y / 3.2) * (H - 28) : H / 2;
  };

  if (trans.length < 2) {
    ctx.fillStyle = KB_THEME.footnote;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Type to see contrails…", W / 2, H / 2);
    ctx.textAlign = "start";
    return;
  }

  const len = trans.length;
  for (let i = Math.max(0, len - 120); i < len; i++) {
    const t = trans[i];
    const age = (len - i) / 120;
    const alpha = 0.08 + (1 - age) * 0.55;
    ctx.strokeStyle = `rgba(194, 65, 12, ${alpha})`;
    ctx.lineWidth = 1 + (1 - age) * 1.5;
    ctx.beginPath();
    ctx.moveTo(kx(t.from), ky(t.from));
    ctx.lineTo(kx(t.to), ky(t.to));
    ctx.stroke();
    if (i > len - 16) {
      ctx.fillStyle = `rgba(194, 65, 12, ${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(kx(t.to), ky(t.to), 3 + (1 - age) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (lastKey && keyPos[lastKey]) {
    const cx = kx(lastKey);
    const cy = ky(lastKey);
    ctx.fillStyle = "#ea580c";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(234, 88, 12, 0.2)";
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const key of Object.keys(keyPos)) {
    if (key === " " || key.length > 2) continue;
    ctx.fillStyle = KB_THEME.keyStroke;
    ctx.fillRect(kx(key) - 1, ky(key) - 1, 2, 2);
  }
}

/** @param {number} r @param {number} c */
function glyphsAtKeyPosition(r, c) {
  /** @type {{ id: string, key: string, name: string }[]} */
  const out = [];
  for (const id of LAYOUT_RING_ORDER) {
    const row = KEYBOARD_LAYOUTS[id].rows[r];
    if (!row || c >= row.length) continue;
    const key = row[c];
    if (key) out.push({ id, key, name: KEYBOARD_LAYOUTS[id].name });
  }
  return out;
}

/** @param {string} key @param {Record<string, number>} heatmap */
function keyHeat(key, heatmap) {
  return heatmap[key] ?? heatmap[key.toLowerCase()] ?? heatmap[key.toUpperCase()] ?? 0;
}

/** Minimum main keyboard canvas height (css px); matches --kb-viz-h (6.5rem). */
const MAIN_KB_MIN_H = 88;
/** kbatch.html thermal/contrails key row pitch: keyH = canvasH / 4.5 */
const KBATCH_KEY_ROW_DIV = 4.5;
const KBATCH_KEY_TOP_PAD = 4;
const KBATCH_KEY_ROW_GAP = 3;

/**
 * @param {number} W @param {number} H @param {string} layoutId
 */
function layoutGridMetrics(W, H, layoutId) {
  const grid = KEYBOARD_LAYOUTS[BASE_LAYOUT_ID].rows;
  const displayRows = KEYBOARD_LAYOUTS[layoutId]?.rows || grid;
  const maxCols = Math.max(...grid.map((row) => row.length));
  const rowCount = grid.length;
  const keyW = W / (maxCols + 1.1);
  const keyH = Math.max(12, (H - KBATCH_KEY_TOP_PAD - 2) / KBATCH_KEY_ROW_DIV);
  const padL = (W - maxCols * keyW - 0.4 * keyW * (rowCount - 1)) / 2;
  return { keyW, keyH, padL, displayRows, grid, maxCols, rowCount };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx @param {number} cy @param {number} maxR
 * @param {{ id: string, key: string, name?: string }[]} glyphs
 * @param {Record<string, number>} heatmap
 * @param {number} maxCount
 * @param {{ large?: boolean }} [opts]
 */
function drawLayoutSpiral(
  ctx,
  cx,
  cy,
  maxR,
  glyphs,
  heatmap,
  maxCount,
  opts = {},
) {
  const large = Boolean(opts.large);
  const highlightLayoutId = opts.highlightLayoutId || null;
  const n = Math.max(1, glyphs.length);
  /** @type {{ x: number, y: number, intensity: number, key: string, name: string, angle: number }[]} */
  const nodes = [];

  glyphs.forEach((g, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const ring = large ? 0.32 + (i / n) * 0.62 : 0.4 + (i / n) * 0.54;
    const count = keyHeat(g.key, heatmap);
    const intensity = count / maxCount;
    const r = maxR * ring * (0.9 + intensity * 0.1);
    nodes.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      intensity,
      key: g.key,
      name: g.name || g.id,
      angle,
    });
  });

  for (let i = 0; i < nodes.length; i++) {
    const cur = nodes[i];
    const prev = nodes[(i - 1 + nodes.length) % nodes.length];
    ctx.strokeStyle = KB_THEME.spiral(
      large ? 0.18 + cur.intensity * 0.45 : 0.1 + cur.intensity * 0.28,
    );
    ctx.lineWidth = large ? 0.8 + cur.intensity * 2 : 0.35 + cur.intensity * 0.9;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    ctx.strokeStyle = KB_THEME.spiralSoft(
      large ? 0.08 + cur.intensity * 0.14 : 0.04 + cur.intensity * 0.08,
    );
    ctx.lineWidth = large ? 0.4 : 0.25;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
  }

  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    const g = glyphs[i];
    const isHighlight = highlightLayoutId && g?.id === highlightLayoutId;
    const count = keyHeat(p.key, heatmap);
    const mini = !large && maxR < 11;
    let nodeR = large ? 3.5 + p.intensity * 7 : (mini ? 0.9 : 1.8) + p.intensity * (mini ? 1.5 : 3);
    if (isHighlight) nodeR *= 1.35;
    if (count > 0) {
      ctx.fillStyle = KB_THEME.spiral(0.12 + p.intensity * 0.22);
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeR + (large ? 9 : 4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = count > 0 ? thermalColor(p.intensity) : KB_THEME.nodeInactive;
    if (isHighlight) {
      ctx.strokeStyle = "#6d28d9";
      ctx.lineWidth = large ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeR + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
    ctx.fill();

    const label = p.key.length > 1 ? p.key : p.key;
    ctx.fillStyle = count > 0 ? "#ffffff" : KB_THEME.inkMute;
    ctx.font = `${large ? Math.max(13, 11 + p.intensity * 10) : Math.max(mini ? 4 : 6, (mini ? 4 : 5) + p.intensity * (mini ? 2 : 4))}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, p.x, p.y);

    if (large && !highlightLayoutId) {
      const lx = cx + Math.cos(p.angle) * (maxR * 0.78 + 18);
      const ly = cy + Math.sin(p.angle) * (maxR * 0.78 + 18);
      ctx.fillStyle = count > 0 ? "#6d28d9" : KB_THEME.inkMute;
      ctx.font = "8px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(p.name.length > 14 ? `${p.name.slice(0, 12)}…` : p.name, lx, ly);
    }
  }

  if (large) {
    ctx.fillStyle = KB_THEME.spiral(0.45);
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** @typedef {{ x: number, y: number, w: number, h: number, r: number, c: number, baseKey: string }} KeyRect */

/**
 * @param {number} r @param {number} c
 * @param {Record<string, number>} heatmap
 * @param {string | null} [lastKey]
 */
function keyDetailLayoutRows(r, c, heatmap, lastKey = null) {
  const glyphs = glyphsAtKeyPosition(r, c);
  const maxCount = Math.max(1, ...Object.values(heatmap));
  const lk = lastKey != null ? String(lastKey).toLowerCase() : "";
  return glyphs.map((g, spiralIdx) => {
    const layout = KEYBOARD_LAYOUTS[g.id];
    const heat = keyHeat(g.key, heatmap);
    const glyphNorm = g.key.toLowerCase();
    const isLastStrike =
      lk.length > 0 &&
      (lk === glyphNorm || lk === g.key || lk === g.key.toUpperCase());
    return {
      ...g,
      spiralIdx,
      layout,
      heat,
      intensity: heat / maxCount,
      region: layout?.region || "",
      script: layout?.script || "",
      dir: layout?.dir || "ltr",
      isLastStrike,
    };
  });
}

/**
 * Mini full-layout preview with the spiral key position highlighted.
 * @param {HTMLCanvasElement} canvas
 * @param {string} layoutId
 * @param {number} posR
 * @param {number} posC
 * @param {{ heat?: number, maxCount?: number, active?: boolean }} [opts]
 */
function paintLayoutMiniPreview(canvas, layoutId, posR, posC, opts = {}) {
  const W = 92;
  const H = 48;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = KB_THEME.canvasBg;
  ctx.fillRect(0, 0, W, H);

  const { keyW, keyH, padL, displayRows, grid } = layoutGridMetrics(W, H, layoutId);
  const maxCount = Math.max(1, opts.maxCount || 1);
  const heat = opts.heat ?? 0;
  const intensity = heat / maxCount;
  const active = Boolean(opts.active);

  grid.forEach((gridRow, ri) => {
    const stagger = ri * 0.4 * keyW;
    gridRow.forEach((_slot, ci) => {
      const key = displayRows[ri]?.[ci];
      if (!key) return;
      const x = padL + stagger + ci * keyW;
      const y = KBATCH_KEY_TOP_PAD + ri * (keyH + KBATCH_KEY_ROW_GAP);
      const kx = x + 2;
      const ky = y + 2;
      const iw = Math.max(2, keyW - 4);
      const ih = Math.max(2, keyH - 4);
      const isPos = ri === posR && ci === posC;

      if (isPos) {
        ctx.fillStyle = heat > 0 ? thermalColor(intensity) : active ? "#ddd6fe" : "#ede9fe";
        ctx.strokeStyle = "#6d28d9";
        ctx.lineWidth = 1.25;
      } else {
        ctx.fillStyle = KB_THEME.keyFill;
        ctx.strokeStyle = KB_THEME.keyStroke;
        ctx.lineWidth = 0.45;
      }
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(kx, ky, iw, ih, 1);
      } else {
        ctx.rect(kx, ky, iw, ih);
      }
      ctx.fill();
      ctx.stroke();

      if (isPos) {
        ctx.fillStyle = heat > 0 ? "#ffffff" : "#4c1d95";
        ctx.font = `bold ${Math.max(5, Math.min(9, ih * 0.5))}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = key.length > 2 ? key.slice(0, 2) : key;
        ctx.fillText(label, kx + iw / 2, ky + ih / 2);
      }
    });
  });
}

/**
 * @param {HTMLElement} listEl
 * @param {HTMLElement | null} statsEl
 * @param {number} r @param {number} c
 * @param {Record<string, number>} heatmap
 * @param {string | null} lastKey
 * @param {string | null} highlightLayoutId
 * @param {(id: string) => void} onSelect
 */
function populateKeyDetailLayoutList(
  listEl,
  statsEl,
  r,
  c,
  heatmap,
  lastKey,
  highlightLayoutId,
  onSelect,
) {
  const rows = keyDetailLayoutRows(r, c, heatmap, lastKey);
  const maxCount = Math.max(1, ...Object.values(heatmap));
  listEl.replaceChildren();
  for (const row of rows) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "feed-phrase-key-layout-item";
    if (row.id === highlightLayoutId) btn.classList.add("is-active");
    if (row.heat > 0) btn.classList.add("is-hot");
    if (row.isLastStrike) btn.classList.add("is-strike");
    btn.dataset.layoutId = row.id;
    btn.innerHTML = `
      <span class="feed-phrase-key-layout-spiral" aria-hidden="true" title="Spiral step">${String(row.spiralIdx + 1).padStart(2, "0")}</span>
      <span class="feed-phrase-key-layout-glyph" aria-hidden="true">${escapeHtml(row.key)}</span>
      <span class="feed-phrase-key-layout-meta">
        <span class="feed-phrase-key-layout-name">${escapeHtml(row.name)}</span>
        <span class="feed-phrase-key-layout-sub">${escapeHtml(row.script)} · ${escapeHtml(row.region)}</span>
      </span>
      <span class="feed-phrase-key-layout-strikes" title="Phrase heat at this glyph">${row.heat > 0 ? row.heat : "—"}</span>
      <span class="feed-phrase-key-layout-preview-wrap" aria-hidden="true">
        <canvas class="feed-phrase-key-layout-preview" width="92" height="48"></canvas>
      </span>`;
    btn.title = `${row.name}: ${row.key} · spiral #${row.spiralIdx + 1} (${row.script}, ${row.dir})`;
    btn.addEventListener("click", () => onSelect(row.id));
    const mini = btn.querySelector(".feed-phrase-key-layout-preview");
    if (mini instanceof HTMLCanvasElement) {
      paintLayoutMiniPreview(mini, row.id, r, c, {
        heat: row.heat,
        maxCount,
        active: row.id === highlightLayoutId,
      });
    }
    li.appendChild(btn);
    listEl.appendChild(li);
  }

  if (statsEl) {
    const hot = rows.filter((row) => row.heat > 0);
    const top = [...hot].sort((a, b) => b.heat - a.heat)[0];
    const strikeRow = rows.find((row) => row.isLastStrike);
    statsEl.innerHTML = `
      <div><dt>Layouts</dt><dd>${rows.length} at row ${r + 1} · col ${c + 1}</dd></div>
      <div><dt>Phrase hits</dt><dd>${hot.length} layouts with heat</dd></div>
      <div><dt>Top glyph</dt><dd>${top && top.heat > 0 ? `${escapeHtml(top.key)} · ${escapeHtml(top.name)} (${top.heat})` : "—"}</dd></div>
      <div><dt>Last strike</dt><dd>${strikeRow ? `${escapeHtml(strikeRow.key)} · ${escapeHtml(strikeRow.name)}` : lastKey ? escapeHtml(String(lastKey)) : "—"}</dd></div>`;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} r @param {number} c @param {string} baseKey
 * @param {Record<string, number>} heatmap
 * @param {string | null} [highlightLayoutId]
 */
function renderKeyDetailExpanded(canvas, r, c, baseKey, heatmap, highlightLayoutId = null) {
  const host = canvas.parentElement;
  const W = host?.clientWidth || 400;
  const H = Math.max(220, host?.clientHeight || 220);
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = KB_THEME.canvasBg;
  ctx.fillRect(0, 0, W, H);

  const maxCount = Math.max(1, ...Object.values(heatmap));
  const glyphs = glyphsAtKeyPosition(r, c);
  const cx = W / 2;
  const cy = H / 2 - 8;
  const spiralR = Math.min(W, H) * 0.36;

  drawLayoutSpiral(ctx, cx, cy, spiralR, glyphs, heatmap, maxCount, {
    large: true,
    highlightLayoutId,
  });

  ctx.fillStyle = KB_THEME.footnote;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `${glyphs.length} layouts · QWERTY R${r + 1} C${c + 1} · ${baseKey.toUpperCase()}`,
    cx,
    H - 10,
  );
  ctx.textAlign = "start";
}

/**
 * Keyboard grid; each key shows a spiral of same-position glyphs on all layouts.
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, number>} heatmap
 * @param {KeyRect[]} [keyRectsOut]
 * @param {{ layoutId?: string }} [opts]
 */
export function renderGeometricOverlay(canvas, heatmap, keyRectsOut, opts = {}) {
  const layoutId = opts.layoutId || BASE_LAYOUT_ID;
  const layoutName = KEYBOARD_LAYOUTS[layoutId]?.name || layoutId;
  const host = canvas.parentElement;
  const W = host?.clientWidth || 400;
  const H = Math.max(MAIN_KB_MIN_H, host?.clientHeight || MAIN_KB_MIN_H);
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = KB_THEME.canvasBg;
  ctx.fillRect(0, 0, W, H);

  const { keyW, keyH, padL, displayRows, grid } = layoutGridMetrics(W, H, layoutId);
  const maxCount = Math.max(1, ...Object.values(heatmap));
  /** @type {KeyRect[]} */
  const rects = [];

  const compact = H < 140;

  grid.forEach((gridRow, ri) => {
    const stagger = ri * 0.4 * keyW;
    gridRow.forEach((_slot, ci) => {
      const baseKey = displayRows[ri]?.[ci];
      if (!baseKey) return;
      const x = padL + stagger + ci * keyW;
      const y = KBATCH_KEY_TOP_PAD + ri * (keyH + KBATCH_KEY_ROW_GAP);
      const glyphs = glyphsAtKeyPosition(ri, ci);
      const cellHeat = Math.max(
        keyHeat(baseKey, heatmap),
        ...glyphs.map((g) => keyHeat(g.key, heatmap)),
      );
      const intensity = cellHeat / maxCount;
      const iw = keyW - 4;
      const ih = keyH - 4;
      const kx = x + 2;
      const ky = y + 2;
      const spiralCy = ky + ih * (compact ? 0.34 : 0.4);
      const labelCy = ky + ih * (compact ? 0.8 : 0.84);
      const centerX = kx + iw / 2;

      rects.push({ x: kx, y: ky, w: iw, h: ih, r: ri, c: ci, baseKey });

      if (cellHeat > 0) {
        ctx.fillStyle = thermalColor(intensity);
        ctx.globalAlpha = 0.1 + intensity * 0.32;
        ctx.beginPath();
        ctx.arc(centerX, spiralCy, Math.min(iw, ih) * 0.44, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = cellHeat > 0 ? "#f5f3ff" : KB_THEME.keyFill;
      ctx.fillRect(kx, ky, iw, ih);
      ctx.strokeStyle =
        cellHeat > 0 ? thermalColor(Math.min(1, intensity + 0.15)) : KB_THEME.keyStroke;
      ctx.lineWidth = cellHeat > 0 ? 1.2 : 0.5;
      ctx.strokeRect(kx, ky, iw, ih);

      const spiralR = Math.min(iw, ih * 0.55) * (compact ? 0.34 : 0.44);
      drawLayoutSpiral(ctx, centerX, spiralCy, spiralR, glyphs, heatmap, maxCount);

      const baseLabel =
        baseKey.length > 1 ? baseKey.slice(0, 2) : baseKey.toUpperCase();
      const labelStripH = ih * (compact ? 0.22 : 0.26);
      ctx.fillStyle = KB_THEME.keyLabelStrip;
      ctx.fillRect(kx + 1, ky + ih - labelStripH, iw - 2, labelStripH);
      ctx.fillStyle = KB_THEME.ink;
      ctx.font = `bold ${Math.max(compact ? 7 : 10, ih * (compact ? 0.38 : 0.22))}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(baseLabel, centerX, labelCy);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    });
  });

  if (keyRectsOut) {
    keyRectsOut.length = 0;
    keyRectsOut.push(...rects);
  }

  if (!compact) {
    ctx.fillStyle = KB_THEME.footnote;
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `${layoutName} · ${LAYOUT_RING_ORDER.length} layouts/key · click to enlarge`,
      W / 2,
      H - 5,
    );
    ctx.textAlign = "start";
  }

  return rects;
}

/**
 * @param {HTMLElement} host
 * @param {{ getQuery: () => string, getIndexHits: () => object[], getLayoutOverlapPercents?: () => Record<string, number | null> }} hooks
 */
export function mountPhraseKeyboardViz(host, hooks) {
  if (!host || host.dataset.kbViz) return null;
  host.dataset.kbViz = "1";

  const wrap = document.createElement("div");
  wrap.className = "feed-phrase-kb";
  const layoutOptionLabel = (id, pct) => {
    const name = KEYBOARD_LAYOUTS[id].name;
    return pct == null ? name : `${name} ${pct}%`;
  };
  const layoutOptions = LAYOUT_RING_ORDER.map(
    (id) =>
      `<option value="${escapeHtml(id)}"${id === BASE_LAYOUT_ID ? " selected" : ""}>${escapeHtml(layoutOptionLabel(id, null))}</option>`,
  ).join("");

  wrap.innerHTML = `
    <div class="feed-phrase-kb-head">
      <span class="feed-phrase-kb-title">Geometric pattern</span>
      <div class="feed-phrase-kb-toolbar">
        <label class="feed-phrase-kb-layout-label">
          <span class="sr-only">Keyboard layout</span>
          <select id="feed-phrase-layout-select" class="feed-phrase-layout-select" aria-label="Keyboard layout mapping">${layoutOptions}</select>
        </label>
        <dl class="feed-phrase-kb-stats" aria-label="Typing metrics">
          <div><dt>WPM</dt><dd id="kb-s-wpm">0</dd></div>
          <div><dt>Efficiency</dt><dd id="kb-s-eff">0%</dd></div>
          <div><dt>Complexity</dt><dd id="kb-s-cpx">0%</dd></div>
          <div><dt>Strain</dt><dd id="kb-s-strain">0%</dd></div>
          <div><dt>Keys</dt><dd id="kb-s-keys">0</dd></div>
          <div><dt>Distance</dt><dd id="kb-s-dist">0.0</dd></div>
          <div><dt>Words</dt><dd id="kb-s-words">0</dd></div>
          <div><dt>Hapax</dt><dd id="kb-s-hapax">0</dd></div>
          <div><dt>Paths</dt><dd id="kb-s-paths">0</dd></div>
          <div><dt>Tone</dt><dd id="kb-s-tone">—</dd></div>
          <div><dt>Stack</dt><dd id="kb-s-stack">idle</dd></div>
          <div><dt>Stream</dt><dd id="kb-s-stream">idle</dd></div>
        </dl>
      </div>
      <span class="feed-phrase-kb-meta" id="feed-phrase-kb-meta">QWERTY · spiral per key</span>
    </div>
    <div class="feed-phrase-kb-stage">
      <aside class="feed-phrase-kb-rail" aria-label="Contrails">
        <div class="feed-phrase-kb-rail-title">Contrails</div>
        <div class="feed-phrase-kb-contrail-wrap">
          <canvas id="feed-phrase-contrails" class="feed-phrase-kb-canvas feed-phrase-kb-canvas--contrail" aria-label="Typing path contrails for active layout"></canvas>
        </div>
      </aside>
      <div class="feed-phrase-kb-canvas-wrap feed-phrase-kb-canvas-wrap--main">
        <canvas id="feed-phrase-geometric" class="feed-phrase-kb-canvas" aria-label="Keyboard with per-key multi-layout letter spirals. Click a key to enlarge."></canvas>
      </div>
    </div>
    <div id="feed-phrase-key-detail" class="feed-phrase-key-detail" hidden>
      <div class="feed-phrase-key-detail-head">
        <span id="feed-phrase-key-detail-title" class="feed-phrase-key-detail-title">Key detail</span>
        <button type="button" id="feed-phrase-key-detail-close" class="feed-phrase-key-detail-close" aria-label="Close enlarged spiral">×</button>
      </div>
      <div class="feed-phrase-key-detail-body">
        <div class="feed-phrase-key-detail-canvas-wrap">
          <canvas id="feed-phrase-key-detail-cv" class="feed-phrase-kb-canvas" aria-label="Enlarged multi-layout spiral for selected key"></canvas>
        </div>
        <aside class="feed-phrase-key-detail-side" aria-label="Keyboard layouts at this key position">
          <p class="feed-phrase-key-detail-side-label">Layouts · spiral order · same key position</p>
          <ul id="feed-phrase-key-detail-list" class="feed-phrase-key-detail-list" role="list"></ul>
          <div class="feed-phrase-key-detail-live">
            <p class="feed-phrase-key-detail-live-title">Live phrase strikes</p>
            <p class="feed-phrase-key-detail-live-hint">Heat follows search + transcript; last key highlights matching layout glyph.</p>
            <dl id="feed-phrase-key-detail-stats" class="feed-phrase-key-detail-stats"></dl>
          </div>
        </aside>
      </div>
    </div>
    <details id="feed-phrase-crossref" class="feed-phrase-crossref" hidden>
      <summary class="feed-phrase-crossref-summary">Cross-layout letter refs</summary>
      <div id="feed-phrase-crossref-body" class="feed-phrase-crossref-body"></div>
    </details>
  `;
  host.appendChild(wrap);

  const canvas = wrap.querySelector("#feed-phrase-geometric");
  const contrailCanvas = wrap.querySelector("#feed-phrase-contrails");
  const layoutSelect = wrap.querySelector("#feed-phrase-layout-select");
  const meta = wrap.querySelector("#feed-phrase-kb-meta");
  const crossEl = wrap.querySelector("#feed-phrase-crossref");
  const crossBody = wrap.querySelector("#feed-phrase-crossref-body");
  const detailPanel = wrap.querySelector("#feed-phrase-key-detail");
  const detailCanvas = wrap.querySelector("#feed-phrase-key-detail-cv");
  const detailTitle = wrap.querySelector("#feed-phrase-key-detail-title");
  const detailClose = wrap.querySelector("#feed-phrase-key-detail-close");
  const detailList = wrap.querySelector("#feed-phrase-key-detail-list");
  const detailStats = wrap.querySelector("#feed-phrase-key-detail-stats");
  const detailBody = wrap.querySelector(".feed-phrase-key-detail-body");
  if (!(canvas instanceof HTMLCanvasElement)) return null;

  /** @type {KeyRect[]} */
  const keyRects = [];
  let lastHeatmap = {};
  /** @type {PhraseTypingAnalysis | null} */
  let lastAnalysis = null;
  let activeLayoutId = BASE_LAYOUT_ID;
  let selectedKey = null;
  /** @type {string | null} */
  let detailHighlightLayoutId = null;

  const refreshKeyDetail = () => {
    if (!selectedKey || !(detailCanvas instanceof HTMLCanvasElement)) return;
    const hm = lastAnalysis?.heatmap || lastHeatmap;
    const lastKey = lastAnalysis?.lastKey ?? null;
    renderKeyDetailExpanded(
      detailCanvas,
      selectedKey.r,
      selectedKey.c,
      selectedKey.baseKey,
      hm,
      detailHighlightLayoutId,
    );
    if (detailList instanceof HTMLElement) {
      populateKeyDetailLayoutList(
        detailList,
        detailStats instanceof HTMLElement ? detailStats : null,
        selectedKey.r,
        selectedKey.c,
        hm,
        lastKey,
        detailHighlightLayoutId,
        (id) => {
          detailHighlightLayoutId = id;
          refreshKeyDetail();
        },
      );
    }
  };

  const statEls = {
    wpm: wrap.querySelector("#kb-s-wpm"),
    eff: wrap.querySelector("#kb-s-eff"),
    cpx: wrap.querySelector("#kb-s-cpx"),
    strain: wrap.querySelector("#kb-s-strain"),
    keys: wrap.querySelector("#kb-s-keys"),
    dist: wrap.querySelector("#kb-s-dist"),
    words: wrap.querySelector("#kb-s-words"),
    hapax: wrap.querySelector("#kb-s-hapax"),
    paths: wrap.querySelector("#kb-s-paths"),
    tone: wrap.querySelector("#kb-s-tone"),
    stack: wrap.querySelector("#kb-s-stack"),
    stream: wrap.querySelector("#kb-s-stream"),
  };

  function updateStats(metrics) {
    if (statEls.wpm) statEls.wpm.textContent = String(metrics.wpm ?? 0);
    if (statEls.eff) statEls.eff.textContent = `${metrics.efficiency ?? 0}%`;
    if (statEls.cpx) statEls.cpx.textContent = `${metrics.complexity ?? 0}%`;
    if (statEls.strain) statEls.strain.textContent = `${metrics.strain ?? 0}%`;
    if (statEls.keys) statEls.keys.textContent = String(metrics.keys ?? 0);
    if (statEls.dist) statEls.dist.textContent = String(metrics.distance ?? "0.0");
    if (statEls.words) statEls.words.textContent = String(metrics.words ?? 0);
    if (statEls.hapax) statEls.hapax.textContent = String(metrics.hapax ?? 0);
    if (statEls.paths) statEls.paths.textContent = String(metrics.paths ?? 0);
    if (statEls.tone) statEls.tone.textContent = String(metrics.tone ?? "—");
    if (statEls.stack) statEls.stack.textContent = String(metrics.stack ?? "idle");
    if (statEls.stream) statEls.stream.textContent = String(metrics.stream ?? "idle");
  }

  function paintContrails() {
    if (!(contrailCanvas instanceof HTMLCanvasElement)) return;
    const host = contrailCanvas.parentElement;
    const W = host?.clientWidth || 120;
    const H = host?.clientHeight || 140;
    const dpr = Math.min(2, devicePixelRatio || 1);
    contrailCanvas.width = Math.floor(W * dpr);
    contrailCanvas.height = Math.floor(H * dpr);
    contrailCanvas.style.width = `${W}px`;
    contrailCanvas.style.height = `${H}px`;
    const ctx = contrailCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (lastAnalysis) {
      renderContrailsPanel(ctx, lastAnalysis, activeLayoutId, W, H);
    } else {
      ctx.fillStyle = KB_THEME.canvasBg;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const showKeyDetail = (hit) => {
    if (!(detailPanel instanceof HTMLElement) || !(detailCanvas instanceof HTMLCanvasElement)) {
      return;
    }
    selectedKey = hit;
    detailHighlightLayoutId = activeLayoutId;
    detailPanel.hidden = false;
    if (detailTitle) {
      const layout = KEYBOARD_LAYOUTS[activeLayoutId];
      detailTitle.textContent = `${layout.name} · ${hit.baseKey.toUpperCase()} — ${layout.rows[hit.r]?.[hit.c] ?? hit.baseKey} position`;
    }
    refreshKeyDetail();
  };

  const hideKeyDetail = () => {
    selectedKey = null;
    detailHighlightLayoutId = null;
    if (detailPanel instanceof HTMLElement) detailPanel.hidden = true;
    if (detailList instanceof HTMLElement) detailList.replaceChildren();
  };

  detailClose?.addEventListener("click", hideKeyDetail);

  canvas.addEventListener("click", (ev) => {
    const box = canvas.getBoundingClientRect();
    const x = ev.clientX - box.left;
    const y = ev.clientY - box.top;
    const hit = keyRects.find(
      (k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h,
    );
    if (hit) showKeyDetail(hit);
  });

  canvas.style.cursor = "pointer";

  const paint = () => {
    const q = hooks.getQuery().trim();
    const hits = hooks.getIndexHits();
    refreshLayoutSelect(hooks.getLayoutOverlapPercents?.() ?? {});
    const phraseHm = buildPhraseLetterHeatmap(q, hits);
    lastAnalysis = analyzePhraseTyping(q || " ", activeLayoutId, phraseHm);
    lastHeatmap = lastAnalysis.heatmap;
    updateStats(lastAnalysis.metrics);
    renderGeometricOverlay(canvas, lastHeatmap, keyRects, {
      layoutId: activeLayoutId,
    });
    paintContrails();
    if (selectedKey) {
      const still = keyRects.find(
        (k) => k.r === selectedKey.r && k.c === selectedKey.c,
      );
      if (still) refreshKeyDetail();
      else hideKeyDetail();
    }

    const { byChar, hot } = buildLayoutCrossRef(lastHeatmap);
    const layoutName = KEYBOARD_LAYOUTS[activeLayoutId]?.name || activeLayoutId;
    if (meta) {
      const active = hot.filter(([ch]) => lastHeatmap[ch] > 0).length;
      meta.textContent = q
        ? `${layoutName} · ${active} heated · ${lastAnalysis.metrics.paths} paths`
        : `${layoutName} · ${LAYOUT_RING_ORDER.length} layouts per key`;
    }

    if (!(crossEl instanceof HTMLDetailsElement) || !(crossBody instanceof HTMLElement)) return;
    if (!q || !hot.length) {
      crossEl.hidden = true;
      crossBody.innerHTML = "";
      return;
    }
    crossEl.hidden = false;
    crossBody.innerHTML = `<ul class="feed-phrase-crossref-list">${hot
      .slice(0, 12)
      .map(([ch, n]) => {
        const info = byChar[ch];
        const layouts = info?.layouts?.slice(0, 6).join(", ") || "—";
        return `<li><span class="feed-phrase-xr-char">${escapeHtml(ch)}</span>
          <span class="feed-phrase-xr-n">×${n}</span>
          <span class="feed-phrase-xr-layouts">${escapeHtml(layouts)}</span></li>`;
      })
      .join("")}</ul>`;
  };

  const refreshLayoutSelect = (percents) => {
    if (!(layoutSelect instanceof HTMLSelectElement)) return;
    const selected = layoutSelect.value || activeLayoutId || BASE_LAYOUT_ID;
    layoutSelect.innerHTML = LAYOUT_RING_ORDER.map(
      (id) =>
        `<option value="${escapeHtml(id)}">${escapeHtml(layoutOptionLabel(id, percents?.[id] ?? null))}</option>`,
    ).join("");
    layoutSelect.value = LAYOUT_RING_ORDER.includes(selected) ? selected : BASE_LAYOUT_ID;
    activeLayoutId = layoutSelect.value;
  };

  if (layoutSelect instanceof HTMLSelectElement) {
    layoutSelect.addEventListener("change", () => {
      activeLayoutId = layoutSelect.value || BASE_LAYOUT_ID;
      paint();
    });
  }

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          requestAnimationFrame(() => paint());
        })
      : null;
  ro?.observe(wrap.querySelector(".feed-phrase-kb-stage") || wrap);
  ro?.observe(detailBody instanceof HTMLElement ? detailBody : wrap);

  return { repaint: paint };
}
