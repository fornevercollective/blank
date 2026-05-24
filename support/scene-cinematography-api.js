/**
 * Browser-safe coverage packs (phrase search). Node cinematography logic stays in .mjs.
 */

/** Coverage search packs for phrase / queue UI */
export const COVERAGE_PACKS = {
  "wh-lawn": {
    id: "wh-lawn",
    label: "WH lawn & grounds (broadcast test)",
    youtubeSearch:
      "https://www.youtube.com/results?search_query=white+house+shooting+lawn+grounds",
    queueQueries: [
      "white house south lawn live",
      "white house north lawn shooting news",
      "white house grounds aerial",
      "white house rose garden press",
    ],
    indexKeywords: [
      "white house",
      "south lawn",
      "north lawn",
      "rose garden",
      "ellipse",
      "portico",
      "grounds",
      "briefing",
      "press pool",
      "pennsylvania avenue",
    ],
    cinematographyFocus:
      "Filter for lawn/grounds angles only; lens 24–120mm, tripod/handheld/gimbal, 180° / two-shot / OTS per ASC coverage.",
  },
};

/**
 * @param {object[]} index
 * @param {string} packId
 */
export function filterIndexByCoveragePack(index, packId) {
  const pack = COVERAGE_PACKS[packId];
  if (!pack) return index;
  const kws = pack.indexKeywords.map((k) => k.toLowerCase());
  return index.filter((entry) => {
    const t = `${entry.text} ${entry.label}`.toLowerCase();
    return kws.some((k) => t.includes(k));
  });
}
