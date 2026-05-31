/**
 * Multi-script artist alphabet — Latin, Cyrillic, Greek, Arabic, Hebrew, Hangul, kana, Devanagari, Thai, CJK.
 */

/** @typedef {{ id: string, label: string, short: string, digits?: boolean, letters: () => string[] }} AlphaScript */

/** @type {AlphaScript[]} */
export const ALPHA_SCRIPTS = [
  {
    id: "latin",
    label: "Latin",
    short: "Aa",
    digits: true,
    letters: () => {
      const out = ["#"];
      for (let c = 65; c <= 90; c++) out.push(String.fromCharCode(c));
      return out;
    },
  },
  {
    id: "cyrillic",
    label: "Cyrillic",
    short: "Ки",
    digits: true,
    letters: () => ["#", ..."АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"],
  },
  {
    id: "greek",
    label: "Greek",
    short: "Ελ",
    digits: true,
    letters: () => ["#", ..."ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"],
  },
  {
    id: "arabic",
    label: "Arabic",
    short: "ع",
    letters: () => ["#", ..."ابتثجحخدذرزسشصضطظعغفقكلمنهوي"],
  },
  {
    id: "hebrew",
    label: "Hebrew",
    short: "ע",
    letters: () => ["#", ..."אבגדהוזחטיכלמנסעפצקרשת"],
  },
  {
    id: "hangul",
    label: "Hangul",
    short: "한",
    letters: () => ["#", ..."ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"],
  },
  {
    id: "hiragana",
    label: "Hiragana",
    short: "あ",
    letters: () => [
      "#",
      ..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
    ],
  },
  {
    id: "katakana",
    label: "Katakana",
    short: "ア",
    letters: () => [
      "#",
      ..."アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",
    ],
  },
  {
    id: "devanagari",
    label: "Devanagari",
    short: "अ",
    letters: () => ["#", ..."अआइईउऊएऐओऔकखगघचछजझटठडढतथदधनपफबभमयरलवशषसह"],
  },
  {
    id: "thai",
    label: "Thai",
    short: "ก",
    letters: () => ["#", ..."กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ"],
  },
  {
    id: "cjk",
    label: "CJK",
    short: "文",
    letters: () => [],
  },
];

const SCRIPT_BY_ID = Object.fromEntries(ALPHA_SCRIPTS.map((s) => [s.id, s]));

/** Hangul choseong (initial) → jamo bucket */
const HANGUL_CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** Hiragana / katakana → row head for A–Z-style rails */
const KANA_ROW = {
  あ: "あ",
  い: "あ",
  う: "あ",
  え: "あ",
  お: "あ",
  か: "か",
  き: "か",
  く: "か",
  け: "か",
  こ: "か",
  が: "か",
  ぎ: "か",
  ぐ: "か",
  げ: "か",
  ご: "か",
  さ: "さ",
  し: "さ",
  す: "さ",
  せ: "さ",
  そ: "さ",
  ざ: "さ",
  じ: "さ",
  ず: "さ",
  ぜ: "さ",
  ぞ: "さ",
  た: "た",
  ち: "た",
  つ: "た",
  て: "た",
  と: "た",
  だ: "た",
  ぢ: "た",
  づ: "た",
  で: "た",
  ど: "た",
  な: "な",
  に: "な",
  ぬ: "な",
  ね: "な",
  の: "な",
  は: "は",
  ひ: "は",
  ふ: "は",
  へ: "は",
  ほ: "は",
  ば: "は",
  び: "は",
  ぶ: "は",
  べ: "は",
  ぼ: "は",
  ぱ: "は",
  ぴ: "は",
  ぷ: "は",
  ぺ: "は",
  ぽ: "は",
  ま: "ま",
  み: "ま",
  む: "ま",
  め: "ま",
  も: "ま",
  や: "や",
  ゆ: "や",
  よ: "や",
  ら: "ら",
  り: "ら",
  る: "ら",
  れ: "ら",
  ろ: "ら",
  わ: "わ",
  ゐ: "わ",
  ゑ: "わ",
  を: "わ",
  ん: "ん",
  ゔ: "わ",
};

/** @param {string} rowHira hiragana row head or ん */
function kanaRowToKatakana(rowHira) {
  if (rowHira === "#") return "#";
  if (rowHira === "ん") return "ン";
  const code = rowHira.codePointAt(0) ?? 0;
  return String.fromCodePoint(code - 0x3041 + 0x30a1);
}

/** @param {string} ch */
function katakanaBucket(ch) {
  const h = ch.normalize("NFC")[0];
  if (!h) return "#";
  let row = KANA_ROW[h];
  if (!row) {
    const code = h.codePointAt(0) ?? 0;
    if (code >= 0x30a1 && code <= 0x30f6) {
      const hira = String.fromCodePoint(code - 0x30a1 + 0x3041);
      row = KANA_ROW[hira] || h;
    } else {
      return h;
    }
  }
  return kanaRowToKatakana(row === "ん" ? "ん" : row);
}

/** @param {string} ch */
function hangulBucket(ch) {
  const code = ch.codePointAt(0) ?? 0;
  if (code < HANGUL_BASE || code > HANGUL_LAST) return "#";
  const choseongIndex = Math.floor((code - HANGUL_BASE) / 588);
  return HANGUL_CHOSEONG[choseongIndex] || "#";
}

/** @param {string} ch */
export function detectScript(ch) {
  if (!ch || ch === "#") return "latin";
  if (/\p{Script=Cyrillic}/u.test(ch)) return "cyrillic";
  if (/\p{Script=Greek}/u.test(ch)) return "greek";
  if (/\p{Script=Arabic}/u.test(ch)) return "arabic";
  if (/\p{Script=Hebrew}/u.test(ch)) return "hebrew";
  if (/\p{Script=Hangul}/u.test(ch)) return "hangul";
  if (/\p{Script=Hiragana}/u.test(ch)) return "hiragana";
  if (/\p{Script=Katakana}/u.test(ch)) return "katakana";
  if (/\p{Script=Devanagari}/u.test(ch)) return "devanagari";
  if (/\p{Script=Thai}/u.test(ch)) return "thai";
  if (/\p{Script=Han}/u.test(ch)) return "cjk";
  if (/\p{Script=Latin}/u.test(ch) || /[A-Za-z]/.test(ch)) return "latin";
  if (/\p{N}/u.test(ch)) return "latin";
  return "latin";
}

/**
 * @param {string} name
 * @returns {{ script: string, letter: string }}
 */
export function letterForName(name) {
  const trimmed = name.trim();
  if (!trimmed) return { script: "latin", letter: "#" };

  let ch = null;
  for (const c of trimmed.normalize("NFC")) {
    if (/\p{L}|\p{N}/u.test(c)) {
      ch = c;
      break;
    }
  }
  if (!ch) return { script: "latin", letter: "#" };
  if (/\p{N}/u.test(ch)) return { script: "latin", letter: "#" };

  const script = detectScript(ch);
  if (script === "latin") {
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
    return { script: "latin", letter: /[A-Z]/.test(base) ? base : "#" };
  }
  if (script === "cyrillic") return { script, letter: ch.toUpperCase() };
  if (script === "greek") return { script, letter: ch.toUpperCase() };
  if (script === "arabic" || script === "hebrew") return { script, letter: ch };
  if (script === "hangul") return { script, letter: hangulBucket(ch) };
  if (script === "hiragana") {
    const row = KANA_ROW[ch] || ch;
    return { script, letter: row === "ん" ? "ん" : row };
  }
  if (script === "katakana") return { script: "katakana", letter: katakanaBucket(ch) };
  if (script === "devanagari" || script === "thai") return { script, letter: ch };
  if (script === "cjk") return { script: "cjk", letter: ch };
  return { script: "latin", letter: "#" };
}

/** @param {string} scriptId */
export function scriptById(scriptId) {
  return SCRIPT_BY_ID[scriptId] || SCRIPT_BY_ID.latin;
}

/**
 * @param {{ script?: string, letter: string }[]} catalog
 * @returns {string[]}
 */
export function scriptsPresentInCatalog(catalog) {
  const seen = new Set();
  for (const a of catalog) {
    if (a.script) seen.add(a.script);
  }
  const ordered = ALPHA_SCRIPTS.map((s) => s.id).filter((id) => seen.has(id));
  return ordered.length ? ordered : ["latin"];
}

/**
 * @param {{ script?: string, letter: string }[]} catalog
 * @param {string} scriptId
 * @returns {string[]}
 */
export function lettersPresentInCatalog(catalog, scriptId) {
  const def = scriptById(scriptId);
  const present = new Set(
    catalog.filter((a) => (a.script || "latin") === scriptId).map((a) => a.letter),
  );
  if (scriptId === "cjk") {
    return ["#", ...[...present].filter((l) => l !== "#").sort((a, b) => a.localeCompare(b, "zh"))];
  }
  const full = def.letters();
  return full.filter((L) => present.has(L));
}

/**
 * @param {string | null} letter
 * @param {string} scriptId
 * @returns {string}
 */
export function formatLetterLabel(letter, scriptId) {
  if (!letter) return "All";
  if (letter === "#") return "0–9";
  const def = scriptById(scriptId);
  if (scriptId === "latin") return letter;
  return `${letter} · ${def.label}`;
}
