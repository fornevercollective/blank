/**
 * Fetch & parse Wikipedia "List of Warped Tour lineups by year".
 * Run: node support/scripts/fetch-warped-tour-lineups.mjs
 *
 * Source: https://en.wikipedia.org/wiki/List_of_Warped_Tour_lineups_by_year
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "warped-tour-lineups.json");

const WIKI_PAGE = "List_of_Warped_Tour_lineups_by_year";
const WIKI_URL = `https://en.wikipedia.org/wiki/${WIKI_PAGE}`;
const API_URL = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(WIKI_PAGE)}&prop=text&formatversion=2&format=json`;

const TOUR_YEARS = [
  1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007,
  2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2025,
  2026,
];

/** @param {string} html */
function decodeHtmlEntities(s) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** @param {string} cellHtml */
function cellText(cellHtml) {
  let t = cellHtml
    .replaceAll(/<br\s*\/?>/gi, " ")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/\[[^\]]*\]/g, "")
    .trim();
  t = decodeHtmlEntities(t);
  return t.replaceAll(/\s+/g, " ").trim();
}

/** @param {string} cellHtml */
function cellPlayed(cellHtml) {
  if (/display:\s*none[^>]*>\s*Y\s*</i.test(cellHtml)) return true;
  if (/Green_check|Yes_check|check\.svg|✓|✔|tick\.svg/i.test(cellHtml)) return true;
  const t = cellText(cellHtml).toUpperCase();
  return t === "Y" || t === "YES";
}

/** @param {string} html */
function firstWikitable(html) {
  const m = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>[\s\S]*?<\/table>/i);
  return m ? m[0] : "";
}

/** @param {string} tableHtml */
function parseLineupTable(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (rows.length < 2) throw new Error("Warped Tour table not found");

  /** @type {string[]} */
  const headerCells = [];
  const headerRow = rows[0];
  for (const m of headerRow.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
    headerCells.push(cellText(m[1]));
  }
  if (headerCells[0]?.toLowerCase() !== "band") {
    throw new Error(`Unexpected header: ${headerCells[0]}`);
  }

  const yearCols = headerCells
    .map((h, i) => ({ year: parseInt(h, 10), i }))
    .filter((x) => Number.isFinite(x.year) && TOUR_YEARS.includes(x.year));

  /** @type {Map<string, { name: string, totalYears: number, years: number[] }>} */
  const byName = new Map();

  for (const rowHtml of rows.slice(2)) {
    if (/^\s*<td[^>]*colspan/i.test(rowHtml)) continue;
    const cells = [...rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
      cellText(m[1]),
    );
    if (cells.length < 2) continue;
    const name = cells[0];
    if (!name || name === "Band") continue;

    const totalYears = parseInt(cells[1], 10) || 0;
    /** @type {number[]} */
    const years = [];
    const rowCells = [...rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => m[1]);
    for (const { year, i } of yearCols) {
      if (cellPlayed(rowCells[i] || "")) years.push(year);
    }

    const key = name.toLocaleLowerCase("en");
    const prev = byName.get(key);
    if (prev) {
      const mergedYears = [...new Set([...prev.years, ...years])].sort((a, b) => a - b);
      prev.years = mergedYears;
      prev.totalYears = mergedYears.length;
    } else {
      byName.set(key, {
        name,
        totalYears: years.length,
        years,
      });
    }
  }

  const bands = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );

  return { bands, yearCols: yearCols.map((x) => x.year) };
}

async function main() {
  const res = await fetch(API_URL, {
    headers: { "User-Agent": "blank-dev/1.0 (Warped Tour lineup import; local dev)" },
  });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
  const data = await res.json();
  const html = data?.parse?.text;
  if (typeof html !== "string") throw new Error("No parse HTML in API response");

  const tableHtml = firstWikitable(html);
  if (!tableHtml) throw new Error("No wikitable on page");

  const { bands, yearCols } = parseLineupTable(tableHtml);

  const payload = {
    version: 1,
    source: WIKI_URL,
    fetchedAt: new Date().toISOString(),
    description:
      "Vans Warped Tour bands with years performed (from Wikipedia comprehensive lineup table).",
    tourYears: yearCols.length ? yearCols : TOUR_YEARS,
    count: bands.length,
    bands,
  };

  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${bands.length} Warped Tour bands → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
