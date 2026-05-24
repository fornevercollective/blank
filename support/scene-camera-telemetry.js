/**
 * Off-axis camera / subject telemetry + projection diagram (browser).
 * Covers ASC-style setups: shot scale, height, dutch, OTS, two-shot, aerial, movement.
 */

const DEG = Math.PI / 180;

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** @param {number} deg */
function normAz(deg) {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

/** @param {number[]} v */
function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** @param {number[]} a @param {number[]} b */
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** @param {number[]} a @param {number[]} b */
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** @param {object} sc */
function sceneTextBlob(sc) {
  const cine = sc?.cinematography || {};
  return [
    sc?.title || "",
    sc?.sceneEstimate || "",
    sc?.cameraEstimate || "",
    sc?.ikPoseEstimate || "",
    cine.framing || "",
    cine.movement || "",
    cine.locationTag || "",
    ...(Array.isArray(sc?.lines) ? sc.lines.map((l) => l.text || "") : []),
  ].join(" ");
}

/**
 * @param {object} sc
 * @returns {{ shot: string, angle: string, movement: string, framing: string, ik: string, sceneType: string, blob: string }}
 */
export function parseSceneCameraHints(sc) {
  const blob = sceneTextBlob(sc).toLowerCase();
  const est = String(sc?.cameraEstimate || "");
  const parts = est.split("·").map((s) => s.trim()).filter(Boolean);
  const cine = sc?.cinematography || {};
  let shot = parts[0] || "Medium";
  let angle = parts[1] || "Eye-level";
  let movement = parts[2] || "Static";
  if (parts.length < 2) {
    if (/\bwide|establish/.test(blob)) shot = "Wide";
    if (/\bclose|tight|cu\b/.test(blob)) shot = "Close-up";
    if (/\bmedium\b/.test(blob)) shot = "Medium";
    if (/\blow angle|looking up\b/.test(blob)) angle = "Low";
    if (/\bhigh angle|overhead|top down\b/.test(blob)) angle = "High";
    if (/\bdutch|canted|tilted horizon\b/.test(blob)) angle = "Dutch";
    if (/\baerial|drone|helicopter\b/.test(blob)) movement = "Aerial / track";
    if (/\bhandheld|shaky\b/.test(blob)) movement = "Handheld";
    if (/\bdolly|push in|pull out|crane|jib\b/.test(blob)) movement = "Dolly / crane";
    if (/\bpan|track|walk/.test(blob)) movement = "Pan / track";
  }
  return {
    shot,
    angle,
    movement,
    framing: String(cine.framing || ""),
    ik: String(sc?.ikPoseEstimate || ""),
    sceneType: String(sc?.sceneEstimate || ""),
    blob,
  };
}

/**
 * @param {object} sc
 * @param {object} telem
 */
export function classifyFilmSetup(sc, telem = {}) {
  const h = parseSceneCameraHints(sc);
  const blob = h.blob;
  const tags = [];
  let id = "coverage";
  let label = "Coverage · axis TBD";

  if (/graphic|b-roll|broll|screen content|no figure/i.test(blob) || /no figure/i.test(h.ik)) {
    id = "graphics";
    label = "Graphics / B-roll · no talent";
    tags.push("screen");
    return { id, label, tags, dutchRollDeg: 0, ...h };
  }

  if (/\baerial|drone|helicopter|overhead shot\b/i.test(blob) || /aerial/i.test(h.movement)) {
    id = "aerial";
    label = "Aerial · bird's-eye / orbit";
    tags.push("aerial");
  } else if (/\bover[- ]the[- ]shoulder|\bots\b/i.test(blob) || /\bOTS\b/.test(h.framing)) {
    id = "ots";
    label = "OTS · 180° axis";
    tags.push("OTS");
  } else if (/two-shot|two shot|2-shot/i.test(blob) || /two-shot/i.test(h.framing)) {
    id = "two-shot";
    label = "Two-shot · dialogue axis";
    tags.push("two-shot");
  } else if (/\bpoint of view|\bpov\b/i.test(blob)) {
    id = "pov";
    label = "POV · subjective";
    tags.push("POV");
  } else if (/interview|dialogue|conversational/i.test(blob) || /interview/i.test(h.sceneType)) {
    id = "interview";
    label = "Interview · reverse / singles";
    tags.push("interview");
  } else if (/two hosts|personnel behind/i.test(h.ik)) {
    id = "two-shot";
    label = "Two-shot · desk / personnel";
    tags.push("two-shot", "studio");
  } else if (/presenter|seated|solo/i.test(h.ik)) {
    id = "single";
    label = "Single · presenter";
    tags.push("single");
  } else if (/standing|podium|pad \/ vehicle|gesturing/i.test(h.ik)) {
    id = "single";
    label = "Single · standing / exterior";
    tags.push("single");
  }

  const shot = h.shot.toLowerCase();
  if (shot.includes("wide") || shot.includes("establish")) {
    tags.push("wide");
    if (id === "coverage") {
      id = "establishing";
      label = "Establishing · wide master";
    }
  } else if (shot.includes("close")) {
    tags.push("close-up");
    if (id === "coverage") {
      id = "close-up";
      label = "Close-up · tight frame";
    }
  } else if (shot.includes("medium")) {
    tags.push("medium");
  }

  const ang = h.angle.toLowerCase();
  let dutchRollDeg = 0;
  if (ang.includes("dutch") || ang.includes("canted")) {
    id = id === "coverage" ? "dutch" : id;
    dutchRollDeg = 12;
    tags.push("dutch");
    label = `${label.split(" · ")[0]} · dutch angle`;
  } else if (ang.includes("low")) {
    tags.push("low-angle");
    label = `${label.split(" · ")[0]} · low angle`;
  } else if (ang.includes("high")) {
    tags.push("high-angle");
    label = `${label.split(" · ")[0]} · high angle`;
  } else {
    tags.push("eye-level");
  }

  const mov = h.movement.toLowerCase();
  if (/handheld|shaky/.test(mov)) tags.push("handheld");
  else if (/dolly|crane|jib|push|pull/.test(mov)) tags.push("dolly-crane");
  else if (/aerial|drone/.test(mov)) tags.push("aerial");
  else if (/pan|track|walk/.test(mov)) tags.push("pan-track");
  else tags.push("locked-off");

  if (/spacex|launch pad|liftoff|booster|launch area/i.test(blob)) {
    tags.push("launch-exterior");
    if (id === "coverage" || id === "establishing") {
      id = "launch";
      label = "Launch area · exterior scatter";
    }
  }

  if (telem.elevationDeg > 25 && id !== "aerial") tags.push("elevated");
  if (telem.rangeM < 22) tags.push("tight");
  if (telem.rangeM > 60) tags.push("long-lens distance");

  return { id, label, tags: [...new Set(tags)], dutchRollDeg, ...h };
}

/**
 * @param {object} sc
 * @param {number} index
 * @param {object} [intel]
 */
export function resolveSceneCamera(sc, index, intel) {
  if (sc?.sceneCamera?.position) return sc.sceneCamera;
  const cams = intel?.gsplat?.cameras;
  if (Array.isArray(cams) && cams.length) {
    const start = Number(sc.start) || 0;
    const cam =
      cams.find((c) => Math.abs((Number(c.t) || 0) - start) < 3) ||
      cams[Math.min(index, cams.length - 1)];
    if (cam?.position) return cam;
  }
  return heuristicCamera(sc, index, intel);
}

/**
 * @param {object} sc
 * @param {number} index
 * @param {object} [intel]
 */
function heuristicCamera(sc, index, intel) {
  const h = parseSceneCameraHints(sc);
  const blob = h.blob;
  const total = Array.isArray(intel?.scenes) ? intel.scenes.length : 12;
  let azimuthDeg = (index / Math.max(1, total)) * 300 - 150;
  if (/\bnorth lawn|north portico|north side\b/.test(blob)) azimuthDeg = 0;
  if (/\bsouth lawn|rose garden|ellipse|south portico\b/.test(blob)) azimuthDeg = 180;
  if (/\beast wing|east wing\b/.test(blob)) azimuthDeg = 90;
  if (/\bwest wing\b/.test(blob)) azimuthDeg = -90;

  let radius = /\bwide|establish|crowd\b/.test(blob) ? 72 : /\bclose|tight|cu\b/.test(blob) ? 28 : 48;
  let height = 1.75;
  let fovDeg = 52;
  let dutchRollDeg = h.angle.toLowerCase().includes("dutch") ? 14 : 0;

  if (/\bover[- ]the[- ]shoulder|\bots\b/.test(blob) || /\bOTS\b/.test(h.framing)) {
    azimuthDeg = normAz(azimuthDeg + 38);
    radius *= 0.82;
    fovDeg = 48;
  }
  if (/two-shot|two hosts|personnel behind|conversational/.test(blob)) {
    radius = Math.max(radius, 44);
    fovDeg = 56;
  }
  if (/\bpoint of view|\bpov\b/.test(blob)) {
    radius = 12;
    height = 1.62;
    fovDeg = 62;
  }
  if (/\blow angle|looking up\b/.test(blob) || h.angle.toLowerCase().includes("low")) {
    height = 1.35;
    radius *= 0.92;
  }
  if (/\bhigh angle|overhead|top down\b/.test(blob) || h.angle.toLowerCase().includes("high")) {
    height = 5.5;
    radius *= 0.88;
  }
  if (/\bwide|establish/.test(h.shot.toLowerCase())) {
    radius = Math.max(radius, 68);
    fovDeg = 64;
  }
  if (/\bclose/.test(h.shot.toLowerCase())) {
    radius = Math.min(radius, 26);
    fovDeg = 42;
  }

  if (/\baerial|drone|helicopter|overhead\b/.test(blob) || /aerial/i.test(h.movement)) {
    const az = (azimuthDeg + index * 17) * DEG;
    const r = 55 + (index % 5) * 8;
    const pos = [Math.sin(az) * r, -Math.cos(az) * r, 42 + (index % 3) * 6];
    const forward = norm3(sub([0, 0, 0], pos));
    const right = norm3([forward[1], -forward[0], 0]);
    const up = norm3([
      forward[1] * right[2] - forward[2] * right[1],
      forward[2] * right[0] - forward[0] * right[2],
      forward[0] * right[1] - forward[1] * right[0],
    ]);
    return {
      id: `cam-${index + 1}`,
      t: Number(sc.start) || 0,
      position: pos,
      rotation: quatFromBasis(right, up, forward),
      fovDeg: Math.min(95, fovDeg + 16),
      source: "heuristic-aerial",
      dutchRollDeg: 0,
    };
  }

  const az = azimuthDeg * DEG;
  const pos = [Math.sin(az) * radius, -Math.cos(az) * radius, height];
  const targetZ = /\bportico|facade|north portico|launch pad|pad\b/.test(blob) ? 5.5 : 1.15;
  const forward = norm3(sub([0, 0, targetZ], pos));
  const right = norm3([forward[1], -forward[0], 0]);
  const up = norm3([
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ]);
  let rotation = quatFromBasis(right, up, forward);
  if (dutchRollDeg) rotation = quatMul(rotation, quatFromAxisAngle(forward, dutchRollDeg * DEG));

  return {
    id: `cam-${index + 1}`,
    t: Number(sc.start) || 0,
    position: pos,
    rotation,
    fovDeg,
    source: "heuristic-film",
    dutchRollDeg,
  };
}

/**
 * @param {object} sc
 * @param {{ joints?: Record<string, {x:number,y:number}> } | null} [pose]
 */
export function subjectAnchorForScene(sc, pose = null) {
  const h = parseSceneCameraHints(sc);
  const hint = `${h.ik} ${h.framing}`.toLowerCase();
  let x = 0;
  let y = 0;
  let z = 1.15;
  if (/two hosts|two-shot|personnel behind|conversational/.test(hint)) {
    x = 0;
    y = 0;
    z = 1.05;
  }
  if (/over[- ]the[- ]shoulder|\bots\b/.test(hint)) {
    x = 0.65;
    y = -0.35;
    z = 1.12;
  }
  if (/standing|podium|pad \/ vehicle|gesturing/.test(hint)) z = 1.55;
  if (/no figure|screen|graphic|b-roll/.test(hint)) {
    x = 0;
    y = 0;
    z = 2.4;
  }
  if (pose?.joints?.midHip) {
    const j = pose.joints.midHip;
    x = (j.x - 0.5) * 4;
    y = (j.y - 0.55) * 3;
  }
  return [x, y, z];
}

/**
 * @param {{ position: number[], rotation?: number[], fovDeg?: number, source?: string, dutchRollDeg?: number }} cam
 * @param {number[]} subject
 */
export function computeCameraSubjectTelemetry(cam, subject) {
  const C = cam.position;
  const S = subject;
  const view = norm3(sub(C, S));
  const dx = S[0] - C[0];
  const dy = S[1] - C[1];
  const dz = S[2] - C[2];
  const horiz = Math.hypot(dx, dy);
  const azimuthDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const elevationDeg = (Math.atan2(dz, horiz) * 180) / Math.PI;
  const rangeM = Math.hypot(horiz, dz);

  const right = norm3([view[1], -view[0], 0]);
  let optical = view;
  if (Array.isArray(cam.rotation) && cam.rotation.length === 4) {
    optical = quatRotateVec(cam.rotation, [0, 0, -1]);
  } else {
    optical = norm3([view[0] + right[0] * 0.14, view[1] + right[1] * 0.14, view[2] + 0.04]);
  }
  const offAxisDeg = (Math.acos(Math.max(-1, Math.min(1, dot(optical, view)))) * 180) / Math.PI;

  const groundNormal = [0, 0, 1];
  const horizTiltDeg = (Math.acos(Math.max(-1, Math.min(1, dot(groundNormal, view)))) * 180) / Math.PI - 90;

  const fov = Number(cam.fovDeg) || 52;
  const vfov = (2 * Math.atan(Math.tan((fov * DEG) / 2) * 0.56) * 180) / Math.PI;

  const projH = (Math.atan2(horiz, dz) * 180) / Math.PI;
  const projV = elevationDeg;
  const dutchRollDeg =
    Number(cam.dutchRollDeg) ||
    (Array.isArray(cam.rotation) && cam.rotation.length === 4 ? rollDegFromQuat(cam.rotation) : 0);

  return {
    azimuthDeg,
    elevationDeg,
    rangeM,
    offAxisDeg,
    horizTiltDeg,
    projH,
    projV,
    dutchRollDeg,
    fovH: fov,
    fovV: vfov,
    source: cam.source || "estimate",
    camId: cam.id || "cam",
  };
}

/**
 * @param {object} prev
 * @param {object} next
 * @param {number} dtSec
 */
export function movementTelemetry(prev, next, dtSec) {
  if (!prev || dtSec < 0.02) {
    return { panRate: 0, tiltRate: 0, dollyRate: 0, label: "static" };
  }
  const panRate = (next.azimuthDeg - prev.azimuthDeg) / dtSec;
  let dAz = panRate;
  if (dAz > 180) dAz -= 360;
  if (dAz < -180) dAz += 360;
  const pan = Math.abs(dAz);
  const tilt = Math.abs((next.elevationDeg - prev.elevationDeg) / dtSec);
  const dolly = Math.abs((next.rangeM - prev.rangeM) / dtSec);
  let label = "locked-off";
  if (pan > 2.5 || tilt > 1.2) label = pan > tilt ? "pan / track" : "tilt";
  if (dolly > 0.35) label = "dolly";
  if (pan > 8) label = "fast pan";
  return { panRate: pan, tiltRate: tilt, dollyRate: dolly, label };
}

/**
 * @param {object} telem
 * @param {ReturnType<classifyFilmSetup>} [setup]
 */
export function offAxisProjectionSvg(telem, setup = null) {
  const W = 220;
  const H = 136;
  const setupLabel = setup?.label || "Coverage";
  const setupId = setup?.id || "coverage";
  const α = telem.offAxisDeg ?? 0;
  const θh = telem.projH ?? 0;
  const θv = telem.projV ?? 0;
  const az = telem.azimuthDeg ?? 0;
  const el = telem.elevationDeg ?? 0;
  const dutch = setup?.dutchRollDeg ?? telem.dutchRollDeg ?? 0;
  const range = telem.rangeM ?? 48;

  const sx = 82;
  const sy = 68;
  const orbitR = clamp(22 + range * 0.42, 20, 46);
  const azRad = az * DEG;
  const camX = sx + Math.sin(azRad) * orbitR;
  const camY = sy - Math.cos(azRad) * orbitR * 0.62 - clamp(el, -30, 55) * 0.38;

  const imgBaseX = 138;
  const imgBaseY = 24;
  const imgW = 68;
  const imgH = 46;
  const skewH = clamp(θh, -55, 55) * 0.22;
  const skewV = clamp(θv, -50, 50) * 0.2;
  const imgCx = imgBaseX + imgW / 2 + skewH;
  const imgCy = imgBaseY + imgH / 2 + skewV;
  const planeTransform =
    dutch !== 0
      ? `transform="rotate(${dutch.toFixed(1)} ${imgCx} ${imgCy})"`
      : "";

  const opticalX = imgBaseX + 10 + skewH * 0.3;
  const opticalY = imgBaseY + imgH / 2 + skewV * 0.3;

  const isAerial = setupId === "aerial" || el > 28;
  const isGraphics = setupId === "graphics";
  const isOts = setupId === "ots";

  let extra = "";
  if (isGraphics) {
    extra = `
  <rect x="118" y="38" width="88" height="52" rx="2" fill="#1e293b" stroke="#64748b"/>
  <text x="162" y="66" text-anchor="middle" fill="#94a3b8" font-size="6" font-family="ui-monospace,monospace">screen / GFX</text>`;
  } else if (isAerial) {
    extra = `
  <ellipse cx="${sx}" cy="${sy}" rx="38" ry="22" fill="none" stroke="#334155" stroke-width="0.8" stroke-dasharray="2 2"/>
  <text x="${sx}" y="${sy + 30}" text-anchor="middle" fill="#64748b" font-size="5" font-family="ui-monospace,monospace">orbit · plan</text>`;
  }
  if (isOts) {
    extra += `
  <circle cx="${sx - 10}" cy="${sy + 4}" r="4" fill="#475569" opacity="0.85"/>
  <text x="${sx - 10}" y="${sy + 16}" text-anchor="middle" fill="#64748b" font-size="4.5" font-family="ui-monospace,monospace">shoulder</text>`;
  }

  const groundPts = `${imgBaseX},${imgBaseY + imgH + skewV} ${imgBaseX + imgW + skewH},${imgBaseY + imgH} ${imgBaseX + imgW - 6 + skewH},${imgBaseY + 50 + skewV} ${imgBaseX + 8},${imgBaseY + 52 + skewV}`;
  const vertPts = `${imgBaseX + skewH},${imgBaseY + skewV} ${imgBaseX + skewH},${imgBaseY + imgH + skewV} ${imgBaseX + 16 + skewH},${imgBaseY + imgH - 4 + skewV} ${imgBaseX + 16 + skewH},${imgBaseY + 6 + skewV}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Camera setup and off-axis projection">
  <rect width="${W}" height="${H}" fill="#0f1419"/>
  <text x="${W / 2}" y="10" text-anchor="middle" fill="#e2e8f0" font-size="6" font-weight="600" font-family="ui-monospace,monospace">${escapeSvg(setupLabel)}</text>
  <text x="${W / 2}" y="18" text-anchor="middle" fill="#64748b" font-size="5" font-family="ui-monospace,monospace">H / V planes → image (off-axis)</text>
  <g ${planeTransform}>
    <rect x="${imgBaseX + skewH}" y="${imgBaseY + skewV}" width="${imgW}" height="${imgH}" fill="#1e293b" stroke="#64748b" stroke-width="1"/>
    <polygon points="${groundPts}" fill="rgba(34,197,94,0.14)" stroke="#22c55e" stroke-width="0.75" stroke-dasharray="3 2"/>
    <polygon points="${vertPts}" fill="rgba(59,130,246,0.14)" stroke="#3b82f6" stroke-width="0.75" stroke-dasharray="3 2"/>
  </g>
  <text x="${imgBaseX + imgW / 2 + skewH}" y="${imgBaseY + imgH + 11 + skewV}" text-anchor="middle" fill="#94a3b8" font-size="5" font-family="ui-monospace,monospace">image plane</text>
  <text x="${imgBaseX - 2 + skewH}" y="${imgBaseY + imgH - 2 + skewV}" text-anchor="end" fill="#4ade80" font-size="4.5" font-family="ui-monospace,monospace">ground H</text>
  <text x="${imgBaseX + 4 + skewH}" y="${imgBaseY - 2 + skewV}" fill="#60a5fa" font-size="4.5" font-family="ui-monospace,monospace">vertical V</text>
  ${isGraphics ? "" : `<circle cx="${camX}" cy="${camY}" r="4" fill="#f97316"/>
  <text x="${camX}" y="${camY + 13}" text-anchor="middle" fill="#fdba74" font-size="5" font-family="ui-monospace,monospace">camera</text>
  <circle cx="${sx}" cy="${sy}" r="3.5" fill="#a78bfa"/>
  <text x="${sx}" y="${sy - 8}" text-anchor="middle" fill="#c4b5fd" font-size="5" font-family="ui-monospace,monospace">subject</text>
  <line x1="${camX}" y1="${camY}" x2="${sx}" y2="${sy}" stroke="#e2e8f0" stroke-width="1"/>
  <line x1="${camX}" y1="${camY}" x2="${opticalX}" y2="${opticalY}" stroke="#fbbf24" stroke-width="0.9" stroke-dasharray="2 2"/>`}
  ${extra}
  <text x="58" y="${H - 10}" fill="#fbbf24" font-size="5.5" font-family="ui-monospace,monospace">α ${α.toFixed(1)}° off-axis</text>
  <text x="${imgBaseX + imgW + 6 + skewH}" y="${imgBaseY + 14 + skewV}" fill="#60a5fa" font-size="5" font-family="ui-monospace,monospace">θv ${θv.toFixed(1)}°</text>
  <text x="${imgBaseX + imgW + 6 + skewH}" y="${imgBaseY + imgH - 4 + skewV}" fill="#4ade80" font-size="5" font-family="ui-monospace,monospace">θh ${θh.toFixed(1)}°</text>
  <text x="12" y="${H - 10}" fill="#94a3b8" font-size="5" font-family="ui-monospace,monospace">${normAz(az).toFixed(0)}° az · ${el.toFixed(1)}° el</text>
  ${dutch ? `<text x="${imgBaseX + imgW / 2 + skewH}" y="${imgBaseY - 8 + skewV}" text-anchor="middle" fill="#f472b6" font-size="5" font-family="ui-monospace,monospace">roll ${dutch.toFixed(0)}°</text>` : ""}
</svg>`;
}

/** @param {string} s */
function escapeSvg(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement} host
 * @param {object} telem
 * @param {object} move
 * @param {number} tLocal
 * @param {boolean} live
 * @param {ReturnType<classifyFilmSetup>} [setup]
 */
export function paintTelemetryReadout(host, telem, move, tLocal, live, setup = null) {
  const set = (sel, text) => {
    const el = host.querySelector(sel);
    if (el) el.textContent = text;
  };
  set("[data-telem-setup]", setup?.label || "—");
  set("[data-telem-cam-angle]", `${telem.azimuthDeg.toFixed(1)}° az · ${telem.elevationDeg.toFixed(1)}° el`);
  set("[data-telem-subj-bearing]", `bearing ${telem.azimuthDeg.toFixed(0)}° · range ${telem.rangeM.toFixed(1)} m`);
  set(
    "[data-telem-off-axis]",
    `α ${telem.offAxisDeg.toFixed(1)}° · H ${telem.projH.toFixed(1)}° · V ${telem.projV.toFixed(1)}°${telem.dutchRollDeg ? ` · roll ${telem.dutchRollDeg.toFixed(0)}°` : ""}`,
  );
  set("[data-telem-fov]", `${telem.fovH.toFixed(0)}° × ${telem.fovV.toFixed(0)}° · ${telem.source}`);
  set(
    "[data-telem-move]",
    `${move.label} · pan ${move.panRate.toFixed(1)}°/s · tilt ${move.tiltRate.toFixed(1)}°/s · dolly ${move.dollyRate.toFixed(2)} m/s`,
  );
  set("[data-telem-seg]", `t+${tLocal.toFixed(1)}s · ${live ? "live" : "segment"}`);
  const svgHost = host.querySelector("[data-projection-svg]");
  if (svgHost instanceof HTMLElement) {
    svgHost.innerHTML = offAxisProjectionSvg(telem, setup);
  }
}

/**
 * @param {HTMLElement} seg
 * @param {object} sc
 * @param {string} pageUrl
 * @param {object} [intel]
 * @param {number} [sceneIndex]
 */
export function mountSceneDisruptor(seg, sc, pageUrl, intel, sceneIndex = 0) {
  const panel = seg.querySelector("[data-scene-disruptor]");
  if (!(panel instanceof HTMLElement)) return;

  const start = Number(sc.start) || 0;
  const end = Number(sc.end) > start ? Number(sc.end) : start + 30;
  let lastTelem = null;
  let lastAt = 0;
  let raf = 0;
  let open = seg.open;

  const cam = () => resolveSceneCamera(sc, sceneIndex, intel);
  const subject = () => subjectAnchorForScene(sc, null);

  const tick = (previewT) => {
    if (!open) return;
    const inSeg = previewT >= start - 0.05 && previewT <= end + 0.05;
    const tLocal = previewT - start;
    const telem = computeCameraSubjectTelemetry(cam(), subject());
    const setup = classifyFilmSetup(sc, telem);
    const now = performance.now() / 1000;
    const dt = lastAt ? now - lastAt : 0;
    const move = movementTelemetry(lastTelem, telem, dt);
    lastTelem = telem;
    lastAt = now;
    paintTelemetryReadout(panel, telem, move, Math.max(0, tLocal), inSeg, setup);
    panel.classList.toggle("is-live", inSeg);
    panel.dataset.setupId = setup.id;
  };

  const onPreviewTime = (ev) => {
    const t = ev?.detail?.t;
    if (!Number.isFinite(t)) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => tick(t));
  };

  const onToggle = () => {
    open = seg.open;
    if (open) tick(lastTelem ? start : getPreviewTime());
    else panel.classList.remove("is-live");
  };

  seg.addEventListener("toggle", onToggle);
  document.addEventListener("blank:preview-time", onPreviewTime);

  tick(getPreviewTime());

  return () => {
    document.removeEventListener("blank:preview-time", onPreviewTime);
    seg.removeEventListener("toggle", onToggle);
    if (raf) cancelAnimationFrame(raf);
  };
}

/** @param {number[]} q xyzw @param {number[]} v */
function quatRotateVec(q, v) {
  const [qx, qy, qz, qw] = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return norm3([
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]);
}

/** @param {[number,number,number,number]} q */
function rollDegFromQuat(q) {
  const [qx, qy, qz, qw] = q;
  const sinr = 2 * (qw * qx + qy * qz);
  const cosr = 1 - 2 * (qx * qx + qy * qy);
  return (Math.atan2(sinr, cosr) * 180) / Math.PI;
}

/** @param {number[]} right @param {number[]} up @param {number[]} forward */
function quatFromBasis(right, up, forward) {
  const m00 = right[0];
  const m01 = up[0];
  const m02 = forward[0];
  const m10 = right[1];
  const m11 = up[1];
  const m12 = forward[1];
  const m20 = right[2];
  const m21 = up[2];
  const m22 = forward[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/** @param {number[]} axis @param {number} rad */
function quatFromAxisAngle(axis, rad) {
  const a = norm3(axis);
  const h = rad / 2;
  const s = Math.sin(h);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(h)];
}

/** @param {[number,number,number,number]} a @param {[number,number,number,number]} b */
function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function getPreviewTime() {
  const host = document.getElementById("ffplay-embed");
  const video = host?.querySelector("video");
  if (video instanceof HTMLVideoElement && Number.isFinite(video.currentTime)) {
    return video.currentTime;
  }
  return 0;
}
