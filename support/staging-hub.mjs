/**
 * Job staging board — reads stageforge.yaml, probes provider integrations.
 * Agnostic: grok-0.1, cursor, ollama, any env:BASE_URL slot.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const JOB_KINDS = ["agent", "mcp", "llm", "research"];

/**
 * @param {string} repoRoot blank project root
 */
export async function loadManifest(repoRoot) {
  const p = path.join(repoRoot, "stageforge.yaml");
  if (!fs.existsSync(p)) {
    return { project: path.basename(repoRoot), jobs: defaultJobs(), integrations: defaultIntegrations() };
  }
  const doc = parseStageforgeYaml(fs.readFileSync(p, "utf8"));
  return {
    project: doc.project || "blank",
    jobs: doc.jobs?.length ? doc.jobs : defaultJobs(),
    integrations: doc.integrations?.length ? doc.integrations : defaultIntegrations(),
    loop: doc.loop || {},
  };
}

function defaultJobs() {
  return [
    { id: "plan", kind: "agent", label: "Plan & route ticket", provider: "env:STAGEFORGE_PROVIDER", stage: "plan" },
    { id: "mcp-wire", kind: "mcp", label: "Wire MCP servers", provider: "env:MCP_CONFIG", stage: "boot" },
    { id: "llm-probe", kind: "llm", label: "Probe LLM endpoint", provider: "env:OPENAI_COMPATIBLE_BASE_URL", stage: "boot" },
    { id: "research", kind: "research", label: "Index RAG corpus", provider: "env:RAILWAY_RAG_PATHS", stage: "relay" },
    { id: "ship", kind: "agent", label: "Stage for deploy / HITL", provider: "stageforge", stage: "ready" },
  ];
}

function defaultIntegrations() {
  return [
    { id: "grok-0.1", label: "Grok Railway v0.1", version: "0.1", base_url: "env:GROK_RAILWAY_URL", probe: "/api/meta" },
    { id: "llm-mesh", label: "OpenAI-compatible LLM", base_url: "env:OPENAI_COMPATIBLE_BASE_URL", probe: "/v1/models" },
    { id: "mcp", label: "MCP hub", base_url: "env:MCP_HUB_URL", probe: "/" },
  ];
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} urlPath
 * @param {string} supportRoot
 */
export async function handleStagingApi(req, res, urlPath, supportRoot) {
  const repoRoot = path.resolve(supportRoot, "..");
  const u = new URL(req.url || "/", "http://localhost");

  if (urlPath === "/api/staging/kinds" && req.method === "GET") {
    return json(res, 200, { kinds: JOB_KINDS });
  }

  if (urlPath === "/api/staging/board" && req.method === "GET") {
    const manifest = await loadManifest(repoRoot);
    const integrations = await Promise.all(
      (manifest.integrations || []).map((ig) => probeIntegration(ig)),
    );
    const nodes = (manifest.jobs || []).map((j) => ({
      id: j.id,
      kind: j.kind,
      label: j.label,
      provider: j.provider,
      stage: j.stage,
      state: "pending",
      command: j.command || null,
    }));
    return json(res, 200, {
      project: manifest.project,
      nodes,
      graph: renderGraph(nodes),
      integrations,
      at: new Date().toISOString(),
      agnostic: true,
      hint: "Set env vars (GROK_RAILWAY_URL, OPENAI_COMPATIBLE_BASE_URL, MCP_HUB_URL) — no vendor lock-in",
    });
  }

  if (urlPath === "/api/staging/probe" && req.method === "GET") {
    const id = u.searchParams.get("id");
    const manifest = await loadManifest(repoRoot);
    const ig = manifest.integrations?.find((x) => x.id === id);
    if (!ig) return json(res, 404, { error: "integration not found" });
    return json(res, 200, await probeIntegration(ig));
  }

  return false;
}

/**
 * @param {object} ig
 */
async function probeIntegration(ig) {
  const base = resolveEnv(ig.base_url);
  const out = {
    id: ig.id,
    label: ig.label,
    version: ig.version || "",
    base_url: base || "",
    status: "absent",
    note: "",
  };
  if (!base) {
    out.note = `Set ${String(ig.base_url).replace("env:", "")} in your environment`;
    return out;
  }
  const probe = ig.probe?.startsWith("/") ? ig.probe : `/${ig.probe || ""}`;
  const url = `${base.replace(/\/$/, "")}${probe}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    out.status = res.status < 500 ? "ready" : "probe-failed";
    if (res.status >= 500) out.note = `HTTP ${res.status}`;
  } catch (e) {
    out.status = "probe-failed";
    out.note = e instanceof Error ? e.message : String(e);
  }
  return out;
}

function resolveEnv(s) {
  if (!s) return "";
  if (String(s).startsWith("env:")) {
    return process.env[String(s).slice(4)] || "";
  }
  return String(s);
}

function renderGraph(nodes) {
  return nodes
    .map((n, i) => {
      const conn = i === nodes.length - 1 ? "└─" : "├─";
      return `│${conn} ○ [${n.kind}] ${n.label} · ${n.provider}`;
    })
    .join("\n");
}

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body, null, 2), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    Connection: "close",
  });
  res.end(buf);
  return true;
}

/** Minimal YAML reader for stageforge.yaml (jobs + integrations blocks). */
function parseStageforgeYaml(raw) {
  const project = raw.match(/^project:\s*(.+)$/m)?.[1]?.trim();
  return {
    project,
    jobs: parseListBlock(raw, "jobs"),
    integrations: parseListBlock(raw, "integrations"),
    loop: {},
  };
}

function parseListBlock(raw, key) {
  const start = raw.indexOf(`${key}:`);
  if (start < 0) return [];
  const rest = raw.slice(start + key.length + 1);
  const end = rest.search(/^[a-z_][\w-]*:/m);
  const block = end >= 0 ? rest.slice(0, end) : rest;
  const chunks = block.split(/\n(?=\s*-\s)/).filter((c) => c.trim());
  return chunks
    .map((chunk) => {
      const item = {};
      for (const line of chunk.split("\n")) {
        const m = line.match(/^\s*-?\s*([\w.-]+):\s*(.*)$/);
        if (m) item[m[1]] = strip(m[2]);
      }
      return Object.keys(item).length ? item : null;
    })
    .filter(Boolean);
}

function strip(s) {
  return String(s).replace(/^["']|["']$/g, "").trim();
}
