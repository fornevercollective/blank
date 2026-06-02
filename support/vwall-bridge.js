/**
 * Open VWall with blank artist-repo album covers (/api/repo/vwall).
 * Local: blank server + vwall (see vwall app.js blankRepo source).
 */

const VWALL_PUBLIC = "https://fornevercollective.github.io/vwall/";
const VWALL_LOCAL = "http://127.0.0.1:8080/";
const BLANK_REPO_KEY = "blank.vwall.repoBase";
const VWALL_BASE_KEY = "blank.vwall.base";

/** @returns {string} */
function vwallBaseUrl() {
  try {
    const stored = localStorage.getItem(VWALL_BASE_KEY);
    if (stored) return stored.replace(/\/?$/, "/");
  } catch {
    /* ignore */
  }
  if (typeof location !== "undefined") {
    const h = location.hostname;
    if (h === "127.0.0.1" || h === "localhost") return VWALL_LOCAL;
  }
  return VWALL_PUBLIC;
}

/** @returns {string} */
export function blankRepoBase() {
  try {
    const stored = localStorage.getItem(BLANK_REPO_KEY);
    if (stored) return stored.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    return location.origin.replace(/\/$/, "");
  }
  return "http://127.0.0.1:5173";
}

/**
 * @param {string} query
 * @param {{ vwallBase?: string, repoBase?: string, auto?: boolean }} [opts]
 */
export function vwallSearchUrl(query, opts = {}) {
  const vwallBase = (opts.vwallBase || vwallBaseUrl()).replace(/\/?$/, "/");
  const u = new URL(vwallBase);
  const q = String(query || "").trim();
  if (q) u.searchParams.set("q", q);
  u.searchParams.set("blankRepo", (opts.repoBase || blankRepoBase()).replace(/\/$/, ""));
  if (opts.auto) u.searchParams.set("auto", "1");
  return u.href;
}

/**
 * @param {string} query
 * @param {{ vwallBase?: string, repoBase?: string }} [opts]
 */
export function openVWallForQuery(query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) return;
  window.open(vwallSearchUrl(q, { ...opts, auto: true }), "_blank", "noopener,noreferrer");
}

/** Wire album-art → VWall buttons in the Artist & album panel. */
export function initVWallBridge() {
  try {
    localStorage.setItem(BLANK_REPO_KEY, blankRepoBase());
  } catch {
    /* ignore */
  }

  const artistInput = document.getElementById("live-concerts-search");
  const headerInput = document.getElementById("header-prompt-input");

  document.getElementById("live-concerts-vwall")?.addEventListener("click", () => {
    const q =
      artistInput instanceof HTMLInputElement ? artistInput.value.trim() : "";
    if (q) openVWallForQuery(q);
  });

  document.getElementById("live-concerts-albums-vwall")?.addEventListener("click", () => {
    const q =
      artistInput instanceof HTMLInputElement ? artistInput.value.trim() : "";
    if (q) openVWallForQuery(q);
  });

  document.getElementById("header-vwall")?.addEventListener("click", () => {
    const q =
      (headerInput instanceof HTMLInputElement ? headerInput.value.trim() : "") ||
      (artistInput instanceof HTMLInputElement ? artistInput.value.trim() : "");
    if (q) openVWallForQuery(q);
  });
}
