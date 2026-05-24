/**
 * Header HUD: token count + CPU/GPU usage (server poll + client WebGPU label).
 */

let clientTokens = 0;
let pollTimer = 0;
/** @type {{ label: string, pct: number | null } | null} */
let clientGpu = null;

/** @param {number} n */
export function trackClientTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return;
  clientTokens += Math.floor(n);
  paintFallback();
}

function fmtTokens(n) {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

/** @param {HTMLElement | null} root */
function paint(root, data) {
  if (!root) return;
  const tokens = (data?.tokens ?? 0) + clientTokens;
  const tokEl = root.querySelector("[data-stat-tokens]");
  const cpuEl = root.querySelector("[data-stat-cpu]");
  const gpuEl = root.querySelector("[data-stat-gpu]");
  if (tokEl) tokEl.textContent = `tokens ${fmtTokens(tokens)}`;
  if (cpuEl) {
    const cpu = data?.cpuPct;
    const load = data?.load1;
    cpuEl.textContent =
      cpu != null
        ? `cpu ${fmtPct(cpu)}${load != null ? ` · load ${load}` : ""}`
        : `cpu ${navigator.hardwareConcurrency || "?"} cores`;
  }
  if (gpuEl) {
    const label = clientGpu?.label || data?.gpuLabel || "gpu";
    const pct = clientGpu?.pct ?? data?.gpuPct;
    gpuEl.textContent = pct != null ? `${label} ${fmtPct(pct)}` : label;
  }
  root.classList.toggle("is-offline", !data?.ok);
}

function paintFallback() {
  paint(document.getElementById("header-runtime-stats"), null);
}

async function probeClientGpu() {
  try {
    const gpu = navigator.gpu;
    if (!gpu?.requestAdapter) return;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return;
    const info = adapter.info;
    const label =
      info?.device ||
      info?.description ||
      info?.architecture ||
      adapter.name ||
      "WebGPU";
    clientGpu = { label: String(label).slice(0, 28), pct: null };
  } catch {
    /* ignore */
  }
}

async function pollServer() {
  const root = document.getElementById("header-runtime-stats");
  try {
    const res = await fetch("/api/runtime", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    paint(root, { ...data, ok: true });
  } catch {
    paint(root, null);
  }
}

export function initHeaderRuntimeStats() {
  const root = document.getElementById("header-runtime-stats");
  if (!root) return;
  void probeClientGpu().then(() => paint(document.getElementById("header-runtime-stats"), null));
  void pollServer();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = window.setInterval(() => void pollServer(), 2000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pollServer();
  });
}

if (typeof globalThis !== "undefined") {
  globalThis.blankRuntime = { trackClientTokens };
}
