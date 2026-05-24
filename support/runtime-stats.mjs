/**
 * Server runtime metrics for header HUD (tokens, CPU, GPU estimate).
 */
import os from "node:os";
import process from "node:process";

/** @type {{ tokens: number, ingestCalls: number }} */
export const runtimeMetrics = {
  tokens: 0,
  ingestCalls: 0,
};

let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

/** @param {number} n */
export function addRuntimeTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return;
  runtimeMetrics.tokens += Math.floor(n);
}

/**
 * Rough token estimate from ingest route (for HUD when models are not wired).
 * @param {string} urlPath
 * @param {string} method
 */
export function addRuntimeTokensForIngest(urlPath, method) {
  runtimeMetrics.ingestCalls += 1;
  if (urlPath.includes("/intel") && method === "POST") {
    addRuntimeTokens(2400);
    return;
  }
  if (urlPath.includes("/gsplat/build")) {
    addRuntimeTokens(12_000);
    return;
  }
  if (urlPath.includes("scene-audio")) {
    addRuntimeTokens(180);
    return;
  }
  if (urlPath.includes("scene-thumb") || urlPath.includes("scene-analysis") || urlPath.includes("pose-thumb")) {
    addRuntimeTokens(45);
    return;
  }
  if (urlPath.includes("/resolve")) {
    addRuntimeTokens(320);
    return;
  }
  addRuntimeTokens(12);
}

/**
 * @param {{ inFlight?: number, requests?: number }} [serverStats]
 */
export function getRuntimeSnapshot(serverStats = {}) {
  const now = Date.now();
  const delta = process.cpuUsage(lastCpu);
  const dtSec = Math.max(0.05, (now - lastCpuAt) / 1000);
  lastCpu = process.cpuUsage();
  lastCpuAt = now;

  const cores = os.cpus().length || 1;
  const cpuPct = Math.min(100, ((delta.user + delta.system) / 1000 / dtSec / cores) * 100);
  const load1 = os.loadavg()[0] ?? 0;
  const memUsed = os.totalmem() - os.freemem();
  const memTotal = os.totalmem();
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  const inFlight = Number(serverStats.inFlight) || 0;
  const gpuPct = Math.min(100, inFlight * 14 + cpuPct * 0.22 + (runtimeMetrics.ingestCalls % 7) * 2);

  return {
    ok: true,
    tokens: runtimeMetrics.tokens,
    cpuPct: Math.round(cpuPct * 10) / 10,
    gpuPct: Math.round(gpuPct * 10) / 10,
    gpuLabel: gpuLabel(),
    memPct: Math.round(memPct * 10) / 10,
    load1: Math.round(load1 * 100) / 100,
    inFlight,
    requests: Number(serverStats.requests) || 0,
  };
}

function gpuLabel() {
  if (process.env.BLANK_GPU_LABEL) return String(process.env.BLANK_GPU_LABEL);
  if (process.platform === "darwin") return "Metal";
  if (process.platform === "win32") return "DirectX";
  return "GPU";
}
