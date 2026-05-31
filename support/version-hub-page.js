/**
 * Version hub page — fetches /api/version/* and renders git-graph staging.
 */

const $ = (sel) => document.querySelector(sel);

let kind = "all";

const GLYPH = {
  pending: "○",
  running: "◉",
  done: "●",
  failed: "✗",
  head: "◉",
  tagged: "●",
  commit: "○",
};

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

function renderTabs(kinds) {
  const nav = $("#vh-tabs");
  if (!nav) return;
  nav.innerHTML = kinds
    .map(
      (k) =>
        `<button type="button" class="vh-tab${k.id === kind ? " is-active" : ""}" data-kind="${k.id}">${k.label}</button>`,
    )
    .join("");
  nav.querySelectorAll(".vh-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      kind = btn.dataset.kind || "all";
      renderTabs(kinds);
      loadSnapshot();
    });
  });
}

function renderStats(s) {
  const el = $("#vh-stats");
  if (!el) return;
  el.innerHTML = `
    <div class="vh-stat"><span class="vh-stat-label">current</span><span class="vh-stat-value">${esc(s.current || "—")}</span></div>
    <div class="vh-stat"><span class="vh-stat-label">ref</span><span class="vh-stat-value vh-mono">${esc(s.ref || "—")}</span></div>
    <div class="vh-stat"><span class="vh-stat-label">dirty</span><span class="vh-stat-value ${s.dirty ? "vh-warn" : ""}">${s.dirty ? "yes" : "no"}</span></div>
    <div class="vh-stat"><span class="vh-stat-label">project</span><span class="vh-stat-value">${esc(s.project || "blank")}</span></div>
  `;
}

function renderGraph(s) {
  const el = $("#vh-graph");
  if (!el) return;
  if (!s.graph?.length) {
    el.textContent = "│└─ ○ (no git history in scope)";
    return;
  }
  const lines = s.graph.map((n, i) => {
    const conn = i === s.graph.length - 1 ? "└─" : "├─";
    const sym = GLYPH[n.state] || GLYPH.commit;
    return `│${conn} ${sym} ${n.label}`;
  });
  el.textContent = lines.join("\n");
}

function renderList(el, items, fmt) {
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = `<li class="vh-empty">—</li>`;
    return;
  }
  el.innerHTML = items.map(fmt).join("");
}

function renderStaged(actions) {
  renderList(
    $("#vh-staged"),
    actions,
    (a) =>
      `<li class="vh-staged-item vh-staged-item--${a.status}"><span class="vh-staged-glyph">${GLYPH[a.status] || GLYPH.pending}</span><span class="vh-staged-handler">[${esc(a.handler)}]</span> ${esc(a.label)}${a.command ? `<code class="vh-cmd">${esc(a.command)}</code>` : ""}</li>`,
  );
}

async function loadSnapshot() {
  try {
    const s = await fetchJson(`/api/version/snapshot?kind=${encodeURIComponent(kind)}`);
    renderStats(s);
    renderGraph(s);
    renderStaged(s.actions);
    renderList(
      $("#vh-manifests"),
      s.manifests,
      (m) => `<li><span class="vh-tag">${esc(m.tool)}</span> <span class="vh-mono">${esc(m.path)}</span> <strong>${esc(m.version)}</strong></li>`,
    );
    renderList(
      $("#vh-automations"),
      s.automations,
      (a) =>
        `<li><strong>${esc(a.name)}</strong> <span class="vh-dim">${esc(a.trigger)}</span> <span class="vh-pill">${esc(a.status)}</span></li>`,
    );
    renderList(
      $("#vh-artifacts"),
      s.artifacts,
      (a) =>
        `<li><strong>${esc(a.name)}</strong> ${esc(a.version)}${a.uri ? ` <span class="vh-dim">${esc(a.uri)}</span>` : ""}</li>`,
    );
    renderList(
      $("#vh-plugins"),
      s.plugins,
      (p) =>
        `<li><strong>${esc(p.name)}</strong> ${esc(p.version)} <span class="vh-pill">${p.enabled ? "on" : "off"}</span></li>`,
    );
    const errEl = $("#vh-errors");
    if (errEl) {
      if (s.errors?.length) {
        errEl.hidden = false;
        errEl.textContent = s.errors.join(" · ");
      } else {
        errEl.hidden = true;
      }
    }
  } catch (err) {
    const errEl = $("#vh-errors");
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err instanceof Error ? err.message : String(err);
    }
  }
}

async function loadPlan(bump) {
  const plan = await fetchJson(
    `/api/version/plan?kind=${encodeURIComponent(kind)}&bump=${encodeURIComponent(bump)}`,
  );
  const box = $("#vh-plan");
  const text = $("#vh-plan-text");
  const actions = $("#vh-plan-actions");
  if (!box || !text || !actions) return;
  box.hidden = false;
  text.textContent = `Planned ${plan.bump}: ${plan.from} → ${plan.to}`;
  actions.innerHTML = plan.actions
    .map(
      (a) =>
        `<li class="vh-staged-item vh-staged-item--${a.status}"><span class="vh-staged-glyph">${GLYPH[a.status] || GLYPH.pending}</span> [${esc(a.handler)}] ${esc(a.label)}${a.command ? `<code class="vh-cmd">${esc(a.command)}</code>` : ""}</li>`,
    )
    .join("");
}

async function loadStageforgeStatus() {
  const el = $("#vh-stageforge-status");
  if (!el) return;
  try {
    const sf = await fetchJson("/api/version/stageforge");
    if (sf.binary) {
      el.textContent = `stageforge ${sf.binary}`;
    } else if (sf.configExists) {
      el.textContent = "stageforge.yaml present · install CLI: make -C ../stageforge build";
    } else {
      el.textContent = "stageforge not configured";
    }
  } catch {
    el.textContent = "stageforge probe failed";
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function init() {
  const { kinds } = await fetchJson("/api/version/kinds");
  renderTabs(kinds);
  await Promise.all([loadSnapshot(), loadStageforgeStatus()]);

  $("#vh-refresh")?.addEventListener("click", () => {
    $("#vh-plan")?.setAttribute("hidden", "");
    loadSnapshot();
    loadStageforgeStatus();
  });

  document.querySelectorAll("[data-bump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bump = btn.dataset.bump;
      if (bump) loadPlan(bump).catch((e) => alert(e.message));
    });
  });
}

init().catch((e) => {
  const errEl = $("#vh-errors");
  if (errEl) {
    errEl.hidden = false;
    errEl.textContent = e.message;
  }
});
