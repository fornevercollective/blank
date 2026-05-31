/**
 * Unified version hub — git, npm, automation, artifact, plugin, all.
 * Mirrors stageforge internal/versioning for blank's web UI.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** @typedef {'all'|'git'|'npm'|'automation'|'artifact'|'plugin'} HandlerKind */
/** @typedef {'patch'|'minor'|'major'|'prerelease'} Bump */

const KINDS = /** @type {const} */ (["all", "git", "npm", "automation", "artifact", "plugin"]);

const KIND_LABELS = {
  all: "all handlers",
  git: "git tags & graph",
  npm: "npm / semver",
  automation: "automation & CI",
  artifact: "artifacts & builds",
  plugin: "plugins & extensions",
};

/**
 * @param {string} root
 * @param {HandlerKind} kind
 */
export async function snapshot(root, kind = "all") {
  const abs = path.resolve(root);
  if (kind === "all") {
    return mergeSnapshots(abs, await Promise.all(
      KINDS.filter((k) => k !== "all").map(async (k) => {
        try {
          return await snapshotOne(abs, k);
        } catch (err) {
          return emptySnap(k, path.basename(abs), [err instanceof Error ? err.message : String(err)]);
        }
      }),
    ));
  }
  return snapshotOne(abs, kind);
}

/**
 * @param {string} root
 * @param {HandlerKind} kind
 * @param {Bump} bump
 */
export async function plan(root, kind, bump) {
  const base = await snapshot(root, kind);
  const from = base.current || "0.0.0";
  const to = bumpSemver(from.replace(/^v/, ""), bump);
  /** @type {import('./version-hub.mjs').Action[]} */
  const actions = [
    { id: "plan-bump", handler: kind, label: `Plan ${bump} release`, status: "done" },
    { id: "sync-manifests", handler: "all", label: "Sync package.json + git tag + stageforge.yaml", status: "pending" },
    { id: "run-automation", handler: "automation", label: "Trigger deploy automation", status: "pending" },
    { id: "publish-artifact", handler: "artifact", label: "Publish build artifacts", status: "pending" },
  ];
  if (kind === "all" || kind === "npm") {
    actions.push({
      id: "npm-set",
      handler: "npm",
      label: `Set package.json → ${to}`,
      command: `npm version ${bump} --no-git-tag-version`,
      status: "pending",
    });
  }
  if (kind === "all" || kind === "git") {
    actions.push({
      id: "git-tag",
      handler: "git",
      label: `Tag v${to}`,
      command: `git tag -a v${to} -m 'release v${to}'`,
      status: "pending",
    });
  }
  return { bump, from, to, snapshots: [base], actions };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} urlPath
 * @param {string} projectRoot
 */
export async function handleVersionApi(req, res, urlPath, projectRoot) {
  const repoRoot = path.resolve(projectRoot, "..");
  const u = new URL(req.url || "/", "http://localhost");
  const kind = /** @type {HandlerKind} */ (u.searchParams.get("kind") || "all");
  const bump = u.searchParams.get("bump");

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return true;
  }

  if (urlPath === "/api/version/kinds" && req.method === "GET") {
    return json(res, 200, {
      kinds: KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] })),
    });
  }

  if (urlPath === "/api/version/snapshot" && req.method === "GET") {
    const snap = await snapshot(repoRoot, kind);
    return json(res, 200, snap);
  }

  if (urlPath === "/api/version/plan" && req.method === "GET") {
    if (!bump || !["patch", "minor", "major", "prerelease"].includes(bump)) {
      return json(res, 400, { error: "bump required: patch|minor|major|prerelease" });
    }
    const p = await plan(repoRoot, kind, /** @type {Bump} */ (bump));
    return json(res, 200, p);
  }

  if (urlPath === "/api/version/stageforge" && req.method === "GET") {
    const sf = await stageforgeProbe(repoRoot);
    return json(res, 200, sf);
  }

  return false;
}

export { KINDS, KIND_LABELS };

// —— handlers ——

/**
 * @param {string} root
 * @param {HandlerKind} kind
 */
async function snapshotOne(root, kind) {
  switch (kind) {
    case "git":
      return gitSnapshot(root);
    case "npm":
      return npmSnapshot(root);
    case "automation":
      return automationSnapshot(root);
    case "artifact":
      return artifactSnapshot(root);
    case "plugin":
      return pluginSnapshot(root);
    default:
      return emptySnap(kind, path.basename(root), ["unknown handler"]);
  }
}

/**
 * @param {string} root
 */
async function gitSnapshot(root) {
  const s = emptySnap("git", path.basename(root));
  const branch = await git(root, "rev-parse", "--abbrev-ref", "HEAD");
  const sha = await git(root, "rev-parse", "--short", "HEAD");
  const describe = await git(root, "describe", "--tags", "--always", "--dirty");
  const dirtyOut = await git(root, "status", "--porcelain");

  s.ref = sha || "";
  s.current = describe || sha || "";
  s.dirty = Boolean(dirtyOut?.trim());

  const tagOut = await git(root, "tag", "--sort=-v:refname");
  if (tagOut) {
    s.tags = tagOut.split("\n").map((t) => t.trim()).filter(Boolean);
  }

  const logOut = await git(root, "log", "--oneline", "-n", "10", "--decorate");
  if (logOut) {
    let parent = "";
    logOut.split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      const id = `c${i}`;
      let state = "commit";
      if (line.includes("tag:")) state = "tagged";
      if (i === 0) state = "head";
      s.graph.push({ id, parent, label: line, ref: s.ref, state });
      parent = id;
    });
  }

  if (branch) {
    s.manifests.push({ path: ".git/HEAD", tool: "git", version: branch });
  }

  s.actions = [
    { id: "git-tag", handler: "git", label: "Create annotated tag", command: "git tag -a vNEXT -m 'release'", status: "pending" },
    { id: "git-push-tags", handler: "git", label: "Push tags to origin", command: "git push --tags", status: "pending" },
  ];
  return s;
}

/**
 * @param {string} root
 */
async function npmSnapshot(root) {
  const s = emptySnap("npm", path.basename(root));
  const supportPkg = path.join(root, "support", "package.json");
  const paths = [path.join(root, "package.json"), supportPkg];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const rel = path.relative(root, p) || "package.json";
    if (raw.version) {
      s.current = raw.version;
      s.project = raw.name || s.project;
      s.manifests.push({ path: rel, tool: "npm", version: raw.version });
    }
  }
  const habitatPkg = path.join(root, "support", "cursor-habitat", "package.json");
  if (fs.existsSync(habitatPkg)) {
    const raw = JSON.parse(fs.readFileSync(habitatPkg, "utf8"));
    s.manifests.push({
      path: "support/cursor-habitat/package.json",
      tool: "npm",
      version: raw.version || "0.0.0",
    });
  }
  if (!s.current) {
    s.errors.push("no package.json version found");
  }
  s.actions = [
    { id: "npm-version", handler: "npm", label: "npm version (no git tag)", command: "npm version patch", status: "pending" },
    { id: "npm-publish", handler: "npm", label: "npm publish (if public)", command: "npm publish", status: "pending" },
  ];
  return s;
}

/**
 * @param {string} root
 */
async function automationSnapshot(root) {
  const s = emptySnap("automation", path.basename(root));
  const checks = [
    { path: "stageforge.yaml", name: "stageforge", trigger: "loop / stageforge up" },
    { path: ".github/workflows/pages.yml", name: "github-pages", trigger: "push main" },
    { path: "start.sh", name: "start.sh", trigger: "Launch.command / manual" },
    { path: "Launch.command", name: "Launch.command", trigger: "Finder double-click" },
    { path: "Launch-Habitat.command", name: "Launch-Habitat", trigger: "cursor-habitat agent" },
  ];
  for (const c of checks) {
    const p = path.join(root, c.path);
    if (fs.existsSync(p)) {
      s.automations.push({
        name: c.name,
        trigger: c.trigger,
        version: s.current || "detected",
        status: "active",
      });
    }
  }
  const sfPath = path.join(root, "stageforge.yaml");
  if (fs.existsSync(sfPath)) {
    const text = fs.readFileSync(sfPath, "utf8");
    const verMatch = text.match(/^version:\s*(\d+)/m);
    if (verMatch) {
      s.current = `schema-v${verMatch[1]}`;
      const auto = s.automations.find((a) => a.name === "stageforge");
      if (auto) auto.version = s.current;
    }
  }
  if (s.automations.length === 0) {
    s.automations.push({
      name: "stageforge-loop",
      trigger: "interval",
      version: "—",
      status: "add stageforge.yaml",
    });
  }
  s.actions = [
    { id: "auto-run", handler: "automation", label: "Run stageforge run (headless)", command: "stageforge run", status: "pending" },
    { id: "auto-loop", handler: "automation", label: "Enable loop deploy", command: "stageforge up", status: "pending" },
    { id: "blank-start", handler: "automation", label: "Start blank server", command: "./start.sh", status: "pending" },
  ];
  return s;
}

/**
 * @param {string} root
 */
async function artifactSnapshot(root) {
  const s = emptySnap("artifact", path.basename(root));
  const candidates = [
    { path: "Launch Blank.app", name: "Launch Blank.app" },
    { path: "support/pages-cache", name: "pages-cache" },
    { path: "support/favicon.ico", name: "favicon" },
    { path: "../stageforge/bin/stageforge", name: "stageforge-binary" },
  ];
  for (const c of candidates) {
    const p = path.resolve(root, c.path);
    if (fs.existsSync(p)) {
      const st = fs.statSync(p);
      const ver = st.isDirectory() ? "bundle" : "local-build";
      s.artifacts.push({
        name: c.name,
        version: ver,
        uri: c.path,
        stale: false,
      });
    }
  }
  if (s.artifacts.length === 0) {
    s.errors.push("no artifacts detected");
  } else {
    s.current = s.artifacts[0].version;
  }
  s.actions = [
    { id: "art-pages", handler: "artifact", label: "Build Pages cache", command: "node support/scripts/build-pages-cache.mjs", status: "pending" },
    { id: "art-smoke", handler: "artifact", label: "Smoke ingest", command: "node support/scripts/smoke-ingest.mjs", status: "pending" },
  ];
  return s;
}

/**
 * @param {string} root
 */
async function pluginSnapshot(root) {
  const s = emptySnap("plugin", path.basename(root));
  const plugins = [
    { name: "cursor-habitat", path: "support/cursor-habitat", enabled: true },
    { name: "video-ingest", path: "support/video-ingest.js", enabled: true },
    { name: "feed-intel", path: "support/feed-intel.js", enabled: true },
    { name: "phrase-search", path: "support/phrase-search.js", enabled: true },
  ];
  for (const p of plugins) {
    const full = path.join(root, p.path);
    if (!fs.existsSync(full)) continue;
    let ver = "local";
    const pkgJson = path.join(full, "package.json");
    if (fs.existsSync(pkgJson)) {
      try {
        ver = JSON.parse(fs.readFileSync(pkgJson, "utf8")).version || ver;
      } catch {
        /* noop */
      }
    }
    s.plugins.push({ name: p.name, version: ver, enabled: p.enabled });
  }
  if (s.plugins.length > 0) s.current = s.plugins[0].version;
  s.actions = [
    { id: "plug-habitat", handler: "plugin", label: "Run cursor-habitat", command: "./Launch-Habitat.command", status: "pending" },
    { id: "plug-reload", handler: "plugin", label: "Reload plugin manifest", status: "pending" },
  ];
  return s;
}

/**
 * @param {string} root
 */
async function stageforgeProbe(root) {
  const sfYaml = path.join(root, "stageforge.yaml");
  const binCandidates = [
    process.env.STAGEFORGE_BIN,
    path.join(root, "../stageforge/bin/stageforge"),
    "stageforge",
  ].filter(Boolean);
  let bin = null;
  for (const c of binCandidates) {
    try {
      await execFileAsync(c, ["version"], { timeout: 3000 });
      bin = c;
      break;
    } catch {
      /* try next */
    }
  }
  return {
    configExists: fs.existsSync(sfYaml),
    binary: bin,
    cli: bin ? `${bin} versions --json --kind all` : null,
  };
}

/**
 * @param {HandlerKind} kind
 * @param {string} project
 * @param {string[]} [errors]
 */
function emptySnap(kind, project, errors = []) {
  return {
    kind,
    project,
    current: "",
    proposed: "",
    ref: "",
    dirty: false,
    tags: [],
    graph: [],
    manifests: [],
    artifacts: [],
    automations: [],
    plugins: [],
    actions: [],
    errors: [...errors],
  };
}

/**
 * @param {import('./version-hub.mjs').Snapshot[]} snaps
 */
function mergeSnapshots(root, snaps) {
  const merged = emptySnap("all", path.basename(root));
  for (const s of snaps) {
    if (s.current && !merged.current) merged.current = s.current;
    if (s.ref && !merged.ref) merged.ref = s.ref;
    merged.dirty = merged.dirty || s.dirty;
    merged.tags.push(...s.tags);
    merged.graph.push(...s.graph);
    merged.manifests.push(...s.manifests);
    merged.artifacts.push(...s.artifacts);
    merged.automations.push(...s.automations);
    merged.plugins.push(...s.plugins);
    merged.actions.push(...s.actions);
    merged.errors.push(...s.errors);
  }
  merged.tags = [...new Set(merged.tags)];
  return merged;
}

/**
 * @param {string} root
 * @param {...string} args
 */
async function git(root, ...args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 512 * 1024 });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} v
 * @param {Bump} bump
 */
function bumpSemver(v, bump) {
  const [core, pre] = v.split("-");
  const seg = core.split(".").map((n) => parseInt(n, 10) || 0);
  while (seg.length < 3) seg.push(0);
  let [maj, min, pat] = seg;
  let prerelease = pre || "";
  switch (bump) {
    case "major":
      maj += 1;
      min = 0;
      pat = 0;
      prerelease = "";
      break;
    case "minor":
      min += 1;
      pat = 0;
      prerelease = "";
      break;
    case "patch":
      pat += 1;
      prerelease = "";
      break;
    case "prerelease":
      prerelease = prerelease ? `${prerelease}.1` : "rc.0";
      break;
    default:
      break;
  }
  let out = `${maj}.${min}.${pat}`;
  if (prerelease) out += `-${prerelease}`;
  return out;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    ...corsHeaders(),
    Connection: "close",
  });
  res.end(buf);
  return true;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
