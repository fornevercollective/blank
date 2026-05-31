/**
 * Major published artists catalog — A–Z rail + autocomplete for live concert search.
 */

/** @type {{ name: string, letter: string }[] | null} */
let catalog = null;

/** @type {string | null} */
let activeLetter = null;

export async function loadArtistCatalog() {
  if (catalog) return catalog;
  const res = await fetch("/artists-major.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`artists catalog (${res.status})`);
  const data = await res.json();
  catalog = Array.isArray(data.artists) ? data.artists : [];
  return catalog;
}

/** @returns {string[]} */
export function alphaLetters() {
  const letters = ["#"];
  for (let c = 65; c <= 90; c++) letters.push(String.fromCharCode(c));
  return letters;
}

/** @returns {string} */
export function alphaRailHtml() {
  const active = activeLetter;
  const parts = [
    `<button type="button" class="live-concerts-alpha-btn${active === null ? " is-active" : ""}" data-alpha="__all__" title="All artists">All</button>`,
  ];
  for (const L of alphaLetters()) {
    const label = L === "#" ? "#" : L.toLowerCase();
    parts.push(
      `<button type="button" class="live-concerts-alpha-btn${active === L ? " is-active" : ""}" data-alpha="${L}" title="${L === "#" ? "0–9" : `Artists: ${L}`}">${label}</button>`,
    );
  }
  return parts.join("");
}

/**
 * @param {string | null} letter
 * @returns {{ name: string, letter: string }[]}
 */
export function artistsForLetter(letter) {
  if (!catalog) return [];
  if (!letter) return catalog;
  return catalog.filter((a) => a.letter === letter);
}

/**
 * @param {string} q
 * @param {number} [limit]
 */
export function autocompleteArtists(q, limit = 12) {
  if (!catalog) return [];
  const pool = activeLetter ? artistsForLetter(activeLetter) : catalog;
  const needle = q.trim().toLowerCase();
  if (!needle) return pool.slice(0, limit);
  const hits = [];
  for (const row of pool) {
    if (row.name.toLowerCase().includes(needle)) {
      hits.push(row);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export function getActiveLetter() {
  return activeLetter;
}

export function setActiveLetter(letter) {
  activeLetter = letter;
}
