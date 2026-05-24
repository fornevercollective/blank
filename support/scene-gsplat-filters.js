/**
 * Scene selection / type filters for gsplat export (browser + Node).
 * Scenes should carry `cinematography` when possible (intel API); text heuristics fill gaps.
 */

const WH_LAWN_KEYWORDS =
  /\b(white house|wh lawn|south lawn|north lawn|rose garden|ellipse|pennsylvania ave|executive mansion|west wing|east wing|briefing room lawn|marine one lawn)\b/i;

const WH_ANGLE_KEYWORDS =
  /\b(lawn|grounds|portico|colonnade|north portico|south portico|fence line|pebble|driveway|press pen|pool spray)\b/i;

const SPACEX_LAUNCH_KEYWORDS =
  /\b(spacex|starbase|starship|falcon|launch\s*(pad|site|complex|area)|liftoff|booster|cape\s*canaveral|kennedy\s*space)\b/i;

/** @type {{ id: string, label: string, title: string }[]} */
export const GSPLAT_SCENE_FILTER_TYPES = [
  { id: "all", label: "All", title: "Include every scene in the list" },
  { id: "wh-lawn", label: "Launch pad", title: "Launch pad · lawn / exterior grounds" },
  { id: "aerial", label: "Aerial", title: "Drone / helicopter / aerial movement" },
  { id: "wide", label: "Wide", title: "Establishing / wide / crowd shots" },
  { id: "close", label: "Close", title: "Close-up / tight coverage" },
  { id: "scatter", label: "Scatter", title: "Multi-cam scatter / gsplat overlay hints" },
  {
    id: "spacex-launch",
    label: "Launch",
    title: "SpaceX / launch pad / Cape / Starbase coverage",
  },
];

/**
 * @param {object} scene
 * @param {object} [cine]
 */
export function sceneTextBlob(scene, cine) {
  return [
    scene.title || "",
    ...(Array.isArray(scene.lines) ? scene.lines.map((l) => l.text || "") : []),
    cine?.locationTag || "",
    cine?.framing || "",
    cine?.movement || "",
    cine?.geoHint || "",
  ].join(" ");
}

/**
 * @param {object} scene
 * @param {object} [meta]
 */
function sceneCine(scene) {
  return scene.cinematography && typeof scene.cinematography === "object"
    ? scene.cinematography
    : {};
}

export function sceneGsplatProfile(scene, meta = {}) {
  void meta;
  const cine = sceneCine(scene);
  const blob = sceneTextBlob(scene, cine);
  const dur =
    Number(scene.end) > Number(scene.start)
      ? Number(scene.end) - Number(scene.start)
      : null;
  return {
    cine,
    blob,
    dur,
    wh: WH_LAWN_KEYWORDS.test(blob) || WH_ANGLE_KEYWORDS.test(blob),
    aerial: /\baerial|drone|helicopter|overhead\b/i.test(blob) || cine.movement === "aerial",
    wide: /\bwide|establish|crowd\b/i.test(blob) || /establishing wide/i.test(cine.framing || ""),
    close: /\bclose[- ]?up|cu\b|tight\b/i.test(blob) || /close-up/i.test(cine.framing || ""),
    scatter: /multi-cam scatter|gsplat overlay|gsplat-ready/i.test(
      `${cine.geoHint || ""} ${cine.scatterNote || ""}`,
    ),
    spacex: SPACEX_LAUNCH_KEYWORDS.test(blob),
  };
}

/**
 * @param {object} scene
 * @param {string} filterId
 * @param {object} [meta]
 */
export function sceneMatchesGsplatFilter(scene, filterId, meta = {}) {
  if (!filterId || filterId === "all") return true;
  const p = sceneGsplatProfile(scene, meta);
  switch (filterId) {
    case "wh-lawn":
      return p.wh;
    case "aerial":
      return p.aerial;
    case "wide":
      return p.wide;
    case "close":
      return p.close;
    case "scatter":
      return p.scatter;
    case "spacex-launch":
      return p.spacex;
    default:
      return true;
  }
}

/**
 * @param {string} label
 */
export function sceneGsplatTagLabels(scene, meta = {}) {
  const p = sceneGsplatProfile(scene, meta);
  /** @type {string[]} */
  const tags = [];
  if (p.wh) tags.push("pad");
  if (p.aerial) tags.push("air");
  if (p.wide) tags.push("wide");
  if (p.close) tags.push("CU");
  if (p.scatter) tags.push("scatter");
  if (p.spacex) tags.push("launch");
  return tags;
}

/**
 * @param {object[]} scenes
 * @param {object} [opts]
 * @param {number[]} [opts.sceneIndices]
 * @param {string[]} [opts.filterTypes]
 * @param {string} [opts.captionQuery]
 * @param {number} [opts.timeStart]
 * @param {number} [opts.timeEnd]
 * @param {number} [opts.maxDurationSec]
 * @param {number} [opts.minDurationSec]
 * @param {object} [meta]
 */
export function filterScenesForGsplat(scenes, opts = {}, meta = {}) {
  const {
    sceneIndices,
    filterTypes = [],
    captionQuery = "",
    timeStart,
    timeEnd,
    maxDurationSec,
    minDurationSec = 0,
  } = opts;

  let list = (Array.isArray(scenes) ? scenes : []).map((sc, index) => ({
    ...sc,
    index,
    start: Number(sc.start) || 0,
    end: Number(sc.end) > Number(sc.start) ? Number(sc.end) : Number(sc.start) + 30,
  }));

  if (Array.isArray(sceneIndices) && sceneIndices.length) {
    const pick = new Set(sceneIndices.map((n) => Number(n)));
    list = list.filter((row) => pick.has(row.index));
  }

  const types = filterTypes.filter((t) => t && t !== "all");
  if (types.length) {
    list = list.filter((row) => types.some((t) => sceneMatchesGsplatFilter(row, t, meta)));
  }

  const q = String(captionQuery || "").trim().toLowerCase();
  if (q) {
    list = list.filter((row) => sceneTextBlob(row, sceneCine(row)).toLowerCase().includes(q));
  }

  if (Number.isFinite(timeStart)) {
    list = list.filter((row) => row.end >= timeStart);
  }
  if (Number.isFinite(timeEnd)) {
    list = list.filter((row) => row.start <= timeEnd);
  }
  if (Number.isFinite(maxDurationSec) && maxDurationSec > 0) {
    list = list.filter((row) => row.end - row.start <= maxDurationSec);
  }
  if (Number.isFinite(minDurationSec) && minDurationSec > 0) {
    list = list.filter((row) => row.end - row.start >= minDurationSec);
  }

  return list;
}
