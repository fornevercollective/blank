const $ = (s) => document.querySelector(s);

async function load() {
  const res = await fetch("/api/staging/board", { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function statusClass(st) {
  if (st === "ready") return "vh-pill";
  if (st === "probe-failed") return "vh-warn";
  return "vh-dim";
}

async function render() {
  try {
    const b = await load();
    $("#stg-stats").innerHTML = `
      <div class="vh-stat"><span class="vh-stat-label">project</span><span class="vh-stat-value">${esc(b.project)}</span></div>
      <div class="vh-stat"><span class="vh-stat-label">jobs</span><span class="vh-stat-value">${b.nodes.length}</span></div>
      <div class="vh-stat"><span class="vh-stat-label">integrations</span><span class="vh-stat-value">${b.integrations.length}</span></div>
      <div class="vh-stat"><span class="vh-stat-label">mode</span><span class="vh-stat-value">agnostic</span></div>
    `;
    $("#stg-graph").textContent = b.graph || "";
    $("#stg-jobs").innerHTML = b.nodes
      .map(
        (n) =>
          `<li class="vh-staged-item"><span class="vh-staged-glyph">○</span><span class="vh-staged-handler">[${esc(n.kind)}]</span> ${esc(n.label)} <span class="vh-dim">· ${esc(n.provider)}</span></li>`,
      )
      .join("");
    $("#stg-integrations").innerHTML = b.integrations
      .map(
        (ig) =>
          `<li><strong>${esc(ig.label)}</strong> <span class="${statusClass(ig.status)}">${esc(ig.status)}</span> ${ig.base_url ? `<span class="vh-mono">${esc(ig.base_url)}</span>` : `<span class="vh-dim">${esc(ig.note || "")}</span>`}</li>`,
      )
      .join("");
    $("#stg-errors").hidden = true;
  } catch (e) {
    const el = $("#stg-errors");
    el.hidden = false;
    el.textContent = e instanceof Error ? e.message : String(e);
  }
}

$("#stg-refresh")?.addEventListener("click", render);
render();
