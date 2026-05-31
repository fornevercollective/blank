/**
 * Major published artists catalog — multi-script A–Z rail + autocomplete for live concert search.
 */
import {
  ALPHA_SCRIPTS,
  formatLetterLabel,
  lettersPresentInCatalog,
  scriptById,
  scriptsPresentInCatalog,
} from "./live-concerts-alphabets.mjs";
import { inferRegion, regionById, ARTIST_REGIONS } from "./live-concerts-regions.mjs";

export { ARTIST_REGIONS, regionById, formatLetterLabel };

/** @type {{ name: string, letter: string, script?: string, region?: string, warped?: { totalYears: number, years: number[] } }[] | null} */
let catalog = null;

/** @type {string | null} */
let activeLetter = null;

/** @type {string} */
let activeScript = "latin";

/** @type {string} */
let activeRegion = "all";

export async function loadArtistCatalog() {
  if (catalog) return catalog;
  const res = await fetch("/artists-major.json", { cache: "force-cache" });
  if (!res.ok) throw new Error(`artists catalog (${res.status})`);
  const data = await res.json();
  catalog = Array.isArray(data.artists)
    ? data.artists.map((a) => ({
        ...a,
        script: a.script || "latin",
        region: a.region || inferRegion(a.name),
      }))
    : [];
  const scripts = scriptsPresentInCatalog(catalog);
  if (!scripts.includes(activeScript)) activeScript = scripts[0] || "latin";
  return catalog;
}

export function getActiveRegion() {
  return activeRegion;
}

export function setActiveRegion(region) {
  activeRegion = region || "all";
}

export function getActiveScript() {
  return activeScript;
}

/** @param {string} scriptId */
export function setActiveScript(scriptId) {
  activeScript = scriptId || "latin";
  activeLetter = null;
}

/** @param {{ region?: string, script?: string }[]} rows @param {string | null} regionId */
function filterByRegion(rows, regionId) {
  if (!regionId || regionId === "all") return rows;
  return rows.filter((a) => a.region === regionId);
}

/** @param {{ script?: string }[]} rows */
function filterByScript(rows) {
  return rows.filter((a) => (a.script || "latin") === activeScript);
}

/** @param {string} L @param {string} scriptId */
function alphaBtnLabel(L, scriptId) {
  if (L === "#") return "#";
  if (scriptId === "latin") return L.toLowerCase();
  return L;
}

/** @returns {string} */
export function alphaRailHtml() {
  const active = activeLetter;
  const scriptId = activeScript;
  const letters = catalog ? lettersPresentInCatalog(catalog, scriptId) : scriptById(scriptId).letters();
  const parts = [
    `<button type="button" class="live-concerts-alpha-btn${active === null ? " is-active" : ""}" data-alpha="__all__" title="All artists (${scriptById(scriptId).label})">All</button>`,
  ];
  for (const L of letters) {
    const label = alphaBtnLabel(L, scriptId);
    const title =
      L === "#"
        ? `0–9 · ${scriptById(scriptId).label}`
        : `Artists: ${formatLetterLabel(L, scriptId)}`;
    parts.push(
      `<button type="button" class="live-concerts-alpha-btn live-concerts-alpha-btn--${scriptId}${active === L ? " is-active" : ""}" data-alpha="${L}" title="${title}">${label}</button>`,
    );
  }
  return parts.join("");
}

/** @returns {string} */
export function alphaScriptTabsHtml() {
  const scripts = catalog ? scriptsPresentInCatalog(catalog) : ["latin"];
  return scripts
    .map((id) => {
      const def = scriptById(id);
      const on = activeScript === id;
      return `<button type="button" class="live-concerts-alpha-script${on ? " is-active" : ""}" data-alpha-script="${id}" role="tab" aria-selected="${on ? "true" : "false"}" title="${def.label} alphabet">${def.short}</button>`;
    })
    .join("");
}

/**
 * @param {string | null} letter
 * @returns {{ name: string, letter: string, script?: string }[]}
 */
export function artistsForLetter(letter) {
  if (!catalog) return [];
  let pool = catalog;
  if (letter) pool = pool.filter((a) => a.letter === letter && (a.script || "latin") === activeScript);
  else pool = filterByScript(pool);
  return filterByRegion(pool, activeRegion);
}

/** @param {string | null} letter @param {string | null} regionId */
export function countArtistsFor(letter, regionId) {
  if (!catalog) return 0;
  let pool = catalog.filter((a) => (a.script || "latin") === activeScript);
  if (letter) pool = pool.filter((a) => a.letter === letter);
  return filterByRegion(pool, regionId).length;
}

export function artistCatalogCount() {
  return catalog?.length ?? 0;
}

/** @returns {{ name: string, letter: string, script?: string, region?: string }[]} */
function artistSearchPool() {
  if (!catalog) return [];
  let pool = activeLetter
    ? catalog.filter((a) => a.letter === activeLetter && (a.script || "latin") === activeScript)
    : filterByScript(catalog);
  return filterByRegion(pool, activeRegion);
}

/**
 * @param {string} q
 * @returns {number}
 */
export function countArtistsMatchingQuery(q) {
  const pool = artistSearchPool();
  const needle = q.trim().toLowerCase();
  if (!needle) return pool.length;
  let n = 0;
  for (const row of pool) {
    if (row.name.toLowerCase().includes(needle)) n++;
  }
  return n;
}

export function autocompleteArtists(q, limit = 12) {
  const pool = artistSearchPool();
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
