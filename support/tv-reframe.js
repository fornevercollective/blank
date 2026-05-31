/**
 * Social / feed reframing presets (Shorts, Reels, Grok-style crop).
 * Values drive CSS vars on the TV cast viewport.
 */

export const TV_CAST_CHANNEL = "blank-tv-cast-v1";

/** @typedef {{ id: string, label: string, aspect: number|null, scale: number, fx: number, fy: number, letterboxBlur?: boolean, showSafe?: boolean, ikBias?: boolean }} ReframePreset */

/** @type {Record<string, ReframePreset>} */
export const REFRAME_PRESETS = {
  tv: {
    id: "tv",
    label: "TV · 16:9 full",
    aspect: 16 / 9,
    scale: 1,
    fx: 0.5,
    fy: 0.5,
  },
  shorts: {
    id: "shorts",
    label: "Shorts · 9:16",
    aspect: 9 / 16,
    scale: 1.42,
    fx: 0.5,
    fy: 0.36,
    showSafe: true,
  },
  reels: {
    id: "reels",
    label: "Reels · 9:16 tight",
    aspect: 9 / 16,
    scale: 1.55,
    fx: 0.5,
    fy: 0.32,
    showSafe: true,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok · 9:16",
    aspect: 9 / 16,
    scale: 1.58,
    fx: 0.5,
    fy: 0.34,
    showSafe: true,
  },
  square: {
    id: "square",
    label: "Square · 1:1",
    aspect: 1,
    scale: 1.22,
    fx: 0.5,
    fy: 0.44,
    showSafe: true,
  },
  portrait: {
    id: "portrait",
    label: "Portrait · 4:5",
    aspect: 4 / 5,
    scale: 1.32,
    fx: 0.5,
    fy: 0.4,
    showSafe: true,
  },
  subject: {
    id: "subject",
    label: "Subject zoom · IK bias",
    aspect: 4 / 5,
    scale: 1.68,
    fx: 0.5,
    fy: 0.4,
    ikBias: true,
    showSafe: true,
  },
  grok: {
    id: "grok",
    label: "Grok / AI feed crop",
    aspect: 4 / 5,
    scale: 1.72,
    fx: 0.5,
    fy: 0.38,
    letterboxBlur: true,
    showSafe: true,
  },
  ots: {
    id: "ots",
    label: "OTS · rule of thirds",
    aspect: 16 / 9,
    scale: 1.18,
    fx: 0.38,
    fy: 0.42,
    showSafe: true,
  },
};

/** @type {Record<string, { id: string, label: string }>} */
export const TV_LAYOUTS = {
  sidecar: { id: "sidecar", label: "Video + data side" },
  focus: { id: "focus", label: "Video focus (minimal)" },
  ticker: { id: "ticker", label: "Full bleed + ticker" },
  pip: { id: "pip", label: "Data overlay (PiP)" },
};

/**
 * @param {string} presetId
 * @param {{ ikHint?: string, framing?: string }} [hints]
 * @returns {ReframePreset}
 */
export function resolveReframePreset(presetId, hints = {}) {
  const base = REFRAME_PRESETS[presetId] || REFRAME_PRESETS.tv;
  if (!base.ikBias || !hints.ikHint) return base;
  const ik = String(hints.ikHint).toLowerCase();
  let fx = base.fx;
  let fy = base.fy;
  let scale = base.scale;
  if (/\bwalk|stride|locomot/i.test(ik)) {
    fy = 0.48;
    scale *= 1.04;
  } else if (/\bseated|sit|desk/i.test(ik)) {
    fy = 0.36;
    scale *= 1.08;
  } else if (/\bgesture|reach|point/i.test(ik)) {
    fx = 0.44;
    fy = 0.38;
  }
  const framing = String(hints.framing || "").toLowerCase();
  if (/close-up|tight|cu\b/.test(framing)) scale *= 1.12;
  if (/wide|establish|aerial/.test(framing)) {
    scale *= 0.92;
    fy = 0.52;
  }
  if (/\bots|over-the-shoulder/.test(framing)) fx = 0.36;
  return { ...base, fx, fy, scale };
}

/**
 * @param {HTMLElement} el
 * @param {ReframePreset} preset
 */
export function applyReframeToElement(el, preset) {
  el.dataset.reframe = preset.id;
  el.style.setProperty("--tv-scale", String(preset.scale));
  el.style.setProperty("--tv-focus-x", String(preset.fx));
  el.style.setProperty("--tv-focus-y", String(preset.fy));
  if (preset.aspect) {
    el.style.setProperty("--tv-aspect", String(preset.aspect));
  } else {
    el.style.removeProperty("--tv-aspect");
  }
  el.classList.toggle("tv-has-letterbox-blur", Boolean(preset.letterboxBlur));
  el.classList.toggle("tv-show-safe", Boolean(preset.showSafe));
}
