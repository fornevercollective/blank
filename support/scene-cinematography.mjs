/**
 * ASC-inspired cinematography + coverage heuristics from frame stats and captions.
 * Reference framing: 180° rule, two-shot, OTS; lens bands; support classes.
 */
export { COVERAGE_PACKS, filterIndexByCoveragePack } from "./scene-cinematography-api.js";

/** @typedef {{ lensMm: string, lensType: string, support: string, framing: string, movement: string, aspect: string, locationTag: string|null, geoHint: string|null, scatterNote: string|null }} CinematographyEstimate */

const LENS_BANDS = [24, 35, 40, 50, 60, 80, 120];

const WH_LAWN_KEYWORDS =
  /\b(white house|wh lawn|south lawn|north lawn|rose garden|ellipse|pennsylvania ave|executive mansion|west wing|east wing|briefing room lawn|marine one lawn)\b/i;

const WH_ANGLE_KEYWORDS =
  /\b(lawn|grounds|portico|colonnade|north portico|south portico|fence line|pebble|driveway|press pen|pool spray)\b/i;

const SPACEX_LAUNCH_KEYWORDS =
  /\b(spacex|starbase|starship|super heavy|falcon\s*9|falcon\s*heavy|dragon\s*spacecraft)\b/i;

const LAUNCH_SITE_KEYWORDS =
  /\b(launch\s*(pad|site|complex|area|tower)|liftoff|booster|lc-39|pad\s*39|kennedy\s*space|ksc\b|cape\s*canaveral|merlin\s*engine)\b/i;

/**
 * @param {number} horizFovDeg approximate horizontal FOV
 */
function lensFromFov(horizFovDeg) {
  if (horizFovDeg >= 72) return { lensMm: "24mm", lensType: "wide · pinhole-ultrawide" };
  if (horizFovDeg >= 58) return { lensMm: "35–40mm", lensType: "wide-normal" };
  if (horizFovDeg >= 48) return { lensMm: "50mm", lensType: "normal" };
  if (horizFovDeg >= 38) return { lensMm: "60–80mm", lensType: "portrait tele" };
  if (horizFovDeg >= 28) return { lensMm: "85–120mm", lensType: "telephoto" };
  return { lensMm: "120mm+", lensType: "long tele" };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} squeezeRatio >1.2 suggests anamorphic
 */
function lensTypeFromAspect(width, height, squeezeRatio = 1) {
  if (!width || !height) return "unknown";
  const ar = width / height;
  if (squeezeRatio > 1.25 || (ar > 2.35 && ar < 2.45)) {
    return "anamorphic (2.39:1 est.)";
  }
  if (ar > 1.7) return "spherical · widescreen";
  if (ar > 1.2) return "spherical · 16:9";
  return "spherical · 4:3 / vertical";
}

/**
 * @param {Float32Array} edge
 * @param {number} w
 * @param {number} h
 */
function motionSupportFromEdge(edge, w, h) {
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < edge.length; i++) {
    sum += edge[i];
    if (edge[i] > 0.35) hi++;
  }
  const mean = sum / edge.length;
  const jitter = hi / edge.length;
  if (jitter > 0.08 && mean > 0.18) return "handheld / cell phone";
  if (jitter > 0.04) return "gimbal / steadicam";
  if (mean < 0.1) return "tripod / locked-off";
  return "dolly / jib (smooth motion)";
}

/**
 * @param {string} blob caption + title text
 */
function framingFromText(blob) {
  const tags = [];
  if (/\bover[- ]the[- ]shoulder|ots\b/i.test(blob)) tags.push("OTS");
  if (/\btwo[- ]shot|2[- ]shot|both\b/i.test(blob)) tags.push("two-shot");
  if (/\b(two|2|dual)\s*(host|anchor)s?\b|co-?host|personnel\s+behind\b/i.test(blob)) {
    tags.push("two-shot");
  }
  if (/\bsingle|solo|reporter\b/i.test(blob)) tags.push("single");
  if (/\bwide|establish|aerial|drone|helicopter\b/i.test(blob)) tags.push("establishing wide");
  if (/\bclose[- ]?up|cu\b|tight\b/i.test(blob)) tags.push("close-up");
  if (/\bcrossing the line|180|eyeline\b/i.test(blob)) tags.push("180° check");
  if (!tags.length) tags.push("coverage · axis TBD");
  return tags.join(" · ");
}

/**
 * @param {string} blob
 */
function locationFromText(blob) {
  if (WH_LAWN_KEYWORDS.test(blob) || WH_ANGLE_KEYWORDS.test(blob)) {
    return "WH · lawn/grounds (coverage pack)";
  }
  if (SPACEX_LAUNCH_KEYWORDS.test(blob) || LAUNCH_SITE_KEYWORDS.test(blob)) {
    return "SpaceX · launch area";
  }
  if (/\b(capitol|mall|lafayette|blair house|treasury|eisenhower exec)\b/i.test(blob)) {
    return "DC support · adjacent";
  }
  return null;
}

/**
 * @param {string} blob
 * @param {number} horizFovDeg
 */
function geoScatterHint(blob, horizFovDeg) {
  if (SPACEX_LAUNCH_KEYWORDS.test(blob) || LAUNCH_SITE_KEYWORDS.test(blob)) {
    const pad =
      /\bstarbase\b/i.test(blob)
        ? "Starbase TX pad cluster"
        : /\bcape|kennedy|ksc|lc-39|pad\s*39\b/i.test(blob)
          ? "Cape Canaveral / KSC"
          : "launch complex · triangulate pad";
    const scatter =
      horizFovDeg > 55
        ? "multi-cam scatter · pad + flame trench — gsplat overlay candidate"
        : "narrow baseline · tower + pad merge";
    return `${pad} · ${scatter}`;
  }
  if (!WH_LAWN_KEYWORDS.test(blob) && !WH_ANGLE_KEYWORDS.test(blob)) return null;
  const north = /\bnorth lawn|north portico\b/i.test(blob);
  const south = /\bsouth lawn|rose garden|ellipse\b/i.test(blob);
  const bearing = north ? "bearing ~N lawn" : south ? "bearing ~S lawn" : "bearing · triangulate from portico";
  const scatter =
    horizFovDeg > 55
      ? "multi-cam scatter · wide baseline — gsplat overlay candidate"
      : "narrow baseline · lens match for splat merge";
  return `${bearing} · ${scatter}`;
}

/**
 * @param {{ width?: number, height?: number, lum?: Float32Array, edge?: Float32Array, w?: number, h?: number }} frame
 * @param {{ title?: string, lines?: { text?: string }[] }} scene
 * @param {object} [meta] yt-dlp width/height
 * @returns {CinematographyEstimate}
 */
export function estimateCinematography(frame, scene, meta = {}) {
  const w = frame.w || meta.width || 1920;
  const h = frame.h || meta.height || 1080;
  const ar = w / h;
  const horizFovDeg = (2 * Math.atan((17.5 * ar) / 24)) * (180 / Math.PI);
  const squeeze =
    ar > 2.2 && meta.vcodec && /avc|hevc/i.test(String(meta.vcodec))
      ? 1.0
      : ar > 2.35
        ? 1.33
        : 1.0;

  const capText = [
    scene.title || "",
    ...(scene.lines || []).map((l) => l.text || ""),
    meta.programContext || "",
  ].join(" ");

  const lens = lensFromFov(horizFovDeg);
  const lensType = lensTypeFromAspect(w, h, squeeze);
  const support =
    frame.edge && frame.w && frame.h
      ? motionSupportFromEdge(frame.edge, frame.w, frame.h)
      : "support · infer from footage";

  let movement = "static";
  if (/\bpan|tracking|walk and talk\b/i.test(capText)) movement = "pan / track";
  if (/\bzoom|push in\b/i.test(capText)) movement = "zoom";
  if (/\bdrone|aerial\b/i.test(capText)) movement = "aerial";

  const locationTag = locationFromText(capText);
  const geoHint = geoScatterHint(capText, horizFovDeg);

  return {
    lensMm: lens.lensMm,
    lensType: `${lensType} · ${lens.lensType}`,
    support,
    framing: framingFromText(capText),
    movement,
    aspect: `${w}×${h}`,
    locationTag,
    geoHint,
    scatterNote: geoHint,
  };
}

