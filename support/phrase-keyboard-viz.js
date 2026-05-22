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

const BASE_LAYOUT_ID = "qwerty";

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

/**
 * @param {number} W @param {number} H
 * @returns {{ keyW: number, keyH: number, padL: number, rows: string[][] }}
 */
function qwertyGridMetrics(W, H) {
  const base = KEYBOARD_LAYOUTS[BASE_LAYOUT_ID];
  const rows = base.rows;
  const maxCols = Math.max(...rows.map((row) => row.length));
  const rowCount = rows.length;
  const keyW = W / (maxCols + 1.1);
  const keyH = (H - 18) / rowCount;
  const padL = (W - maxCols * keyW - 0.38 * keyW * (rowCount - 1)) / 2;
  return { keyW, keyH, padL, rows, maxCols, rowCount };
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

  for (const p of nodes) {
    const count = keyHeat(p.key, heatmap);
    const nodeR = large ? 3.5 + p.intensity * 7 : 1.8 + p.intensity * 3;
    if (count > 0) {
      ctx.fillStyle = KB_THEME.spiral(0.12 + p.intensity * 0.22);
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeR + (large ? 9 : 4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = count > 0 ? thermalColor(p.intensity) : KB_THEME.nodeInactive;
    ctx.beginPath();
    ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
    ctx.fill();

    const label = p.key.length > 1 ? p.key : p.key;
    ctx.fillStyle = count > 0 ? "#ffffff" : KB_THEME.inkMute;
    ctx.font = `${large ? Math.max(13, 11 + p.intensity * 10) : Math.max(6, 5 + p.intensity * 4)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, p.x, p.y);

    if (large) {
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
 * @param {HTMLCanvasElement} canvas
 * @param {number} r @param {number} c @param {string} baseKey
 * @param {Record<string, number>} heatmap
 */
function renderKeyDetailExpanded(canvas, r, c, baseKey, heatmap) {
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
  const spiralR = Math.min(W, H) * 0.34;

  drawLayoutSpiral(ctx, cx, cy, spiralR, glyphs, heatmap, maxCount, { large: true });

  ctx.fillStyle = KB_THEME.footnote;
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(
    `${glyphs.length} layouts at QWERTY row ${r + 1} · col ${c + 1}`,
    cx,
    H - 10,
  );
  ctx.textAlign = "start";
}

/**
 * QWERTY keyboard grid; each key shows a spiral of same-position glyphs on all layouts.
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, number>} heatmap
 * @param {KeyRect[]} [keyRectsOut]
 */
export function renderGeometricOverlay(canvas, heatmap, keyRectsOut) {
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

  const { keyW, keyH, padL, rows } = qwertyGridMetrics(W, H);
  const maxCount = Math.max(1, ...Object.values(heatmap));
  /** @type {KeyRect[]} */
  const rects = [];

  rows.forEach((row, ri) => {
    const stagger = ri * 0.38 * keyW;
    row.forEach((baseKey, ci) => {
      const x = padL + stagger + ci * keyW;
      const y = 8 + ri * keyH;
      const glyphs = glyphsAtKeyPosition(ri, ci);
      const cellHeat = Math.max(
        keyHeat(baseKey, heatmap),
        ...glyphs.map((g) => keyHeat(g.key, heatmap)),
      );
      const intensity = cellHeat / maxCount;
      const iw = keyW - 4;
      const ih = keyH - 5;
      const kx = x + 2;
      const ky = y + 2;
      const spiralCy = ky + ih * 0.4;
      const labelCy = ky + ih * 0.84;
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

      const spiralR = Math.min(iw, ih * 0.72) * 0.44;
      drawLayoutSpiral(ctx, centerX, spiralCy, spiralR, glyphs, heatmap, maxCount);

      const baseLabel =
        baseKey.length > 1 ? baseKey.slice(0, 2) : baseKey.toUpperCase();
      ctx.fillStyle = KB_THEME.keyLabelStrip;
      ctx.fillRect(kx + 1, ky + ih - ih * 0.28, iw - 2, ih * 0.26);
      ctx.fillStyle = KB_THEME.ink;
      ctx.font = `bold ${Math.max(10, ih * 0.22)}px ui-monospace, monospace`;
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

  ctx.fillStyle = KB_THEME.footnote;
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `${LAYOUT_RING_ORDER.length} layouts · click a key for large spiral`,
    W / 2,
    H - 5,
  );
  ctx.textAlign = "start";

  return rects;
}

/**
 * @param {HTMLElement} host
 * @param {{ getQuery: () => string, getIndexHits: () => object[] }} hooks
 */
export function mountPhraseKeyboardViz(host, hooks) {
  if (!host || host.dataset.kbViz) return null;
  host.dataset.kbViz = "1";

  const wrap = document.createElement("div");
  wrap.className = "feed-phrase-kb";
  wrap.innerHTML = `
    <div class="feed-phrase-kb-head">
      <span class="feed-phrase-kb-title">Geometric pattern</span>
      <span class="feed-phrase-kb-meta" id="feed-phrase-kb-meta">QWERTY · spiral per key</span>
    </div>
    <div class="feed-phrase-kb-canvas-wrap feed-phrase-kb-canvas-wrap--main">
      <canvas id="feed-phrase-geometric" class="feed-phrase-kb-canvas" aria-label="QWERTY keyboard with per-key multi-layout letter spirals. Click a key to enlarge."></canvas>
    </div>
    <div id="feed-phrase-key-detail" class="feed-phrase-key-detail" hidden>
      <div class="feed-phrase-key-detail-head">
        <span id="feed-phrase-key-detail-title" class="feed-phrase-key-detail-title">Key detail</span>
        <button type="button" id="feed-phrase-key-detail-close" class="feed-phrase-key-detail-close" aria-label="Close enlarged spiral">×</button>
      </div>
      <div class="feed-phrase-key-detail-canvas-wrap">
        <canvas id="feed-phrase-key-detail-cv" class="feed-phrase-kb-canvas" aria-label="Enlarged multi-layout spiral for selected key"></canvas>
      </div>
    </div>
    <details id="feed-phrase-crossref" class="feed-phrase-crossref" hidden>
      <summary class="feed-phrase-crossref-summary">Cross-layout letter refs</summary>
      <div id="feed-phrase-crossref-body" class="feed-phrase-crossref-body"></div>
    </details>
  `;
  host.appendChild(wrap);

  const canvas = wrap.querySelector("#feed-phrase-geometric");
  const meta = wrap.querySelector("#feed-phrase-kb-meta");
  const crossEl = wrap.querySelector("#feed-phrase-crossref");
  const crossBody = wrap.querySelector("#feed-phrase-crossref-body");
  const detailPanel = wrap.querySelector("#feed-phrase-key-detail");
  const detailCanvas = wrap.querySelector("#feed-phrase-key-detail-cv");
  const detailTitle = wrap.querySelector("#feed-phrase-key-detail-title");
  const detailClose = wrap.querySelector("#feed-phrase-key-detail-close");
  if (!(canvas instanceof HTMLCanvasElement)) return null;

  /** @type {KeyRect[]} */
  const keyRects = [];
  let lastHeatmap = {};
  let selectedKey = null;

  const showKeyDetail = (hit) => {
    if (!(detailPanel instanceof HTMLElement) || !(detailCanvas instanceof HTMLCanvasElement)) {
      return;
    }
    selectedKey = hit;
    detailPanel.hidden = false;
    if (detailTitle) {
      detailTitle.textContent = `QWERTY · ${hit.baseKey.toUpperCase()} — ${KEYBOARD_LAYOUTS[BASE_LAYOUT_ID].rows[hit.r]?.[hit.c] ?? hit.baseKey} position`;
    }
    renderKeyDetailExpanded(detailCanvas, hit.r, hit.c, hit.baseKey, lastHeatmap);
  };

  const hideKeyDetail = () => {
    selectedKey = null;
    if (detailPanel instanceof HTMLElement) detailPanel.hidden = true;
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
    const hm = buildPhraseLetterHeatmap(q, hits);
    lastHeatmap = hm;
    renderGeometricOverlay(canvas, hm, keyRects);
    if (selectedKey) {
      const still = keyRects.find(
        (k) => k.r === selectedKey.r && k.c === selectedKey.c,
      );
      if (still) showKeyDetail(still);
      else hideKeyDetail();
    }

    const { byChar, hot } = buildLayoutCrossRef(hm);
    if (meta) {
      const active = hot.filter(([ch]) => hm[ch] > 0).length;
      meta.textContent = q
        ? `QWERTY · ${active} heated glyphs · ${LAYOUT_RING_ORDER.length} layouts/key`
        : `QWERTY base · ${LAYOUT_RING_ORDER.length} layouts per key`;
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

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => paint())
      : null;
  ro?.observe(wrap.querySelector(".feed-phrase-kb-canvas-wrap--main") || wrap);
  ro?.observe(wrap.querySelector(".feed-phrase-key-detail-canvas-wrap") || wrap);

  return { repaint: paint };
}
