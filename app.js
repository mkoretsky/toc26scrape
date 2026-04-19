/* Static PF Corpus Browser.
   Loads ./data.json once and does all filtering/sorting in memory. */

const state = {
  data: null,
  activeTag: null,
  side: "all",
  role: "all",
  division: "all",
  sort: "team",   // 'team' | 'record'
  search: "",
};

const $ = (id) => document.getElementById(id);
const $tree = $("tree-body");
const $showAll = $("show-all");
const $toggleAll = $("toggle-all");
const $docHeader = $("doc-header");
const $docList = $("doc-list");
const $total = $("total-docs");
const $side = $("side-filter");
const $role = $("role-filter");
const $division = $("division-filter");
const $sortBtn = $("sort-btn");
const $search = $("search");

/* ----------------------------- data load ----------------------------- */

async function init() {
  try {
    const r = await fetch("./data.json");
    state.data = await r.json();
  } catch (e) {
    $docHeader.innerHTML = `<span style="color:#c62828">failed to load data.json: ${e.message}</span>`;
    return;
  }
  $total.textContent = `${state.data.total_docs} docs`;
  renderTree();
  render();
}

/* ----------------------------- tree ----------------------------- */

function renderTree() {
  $tree.innerHTML = "";
  for (const cat of state.data.tree) {
    const catEl = document.createElement("div");
    catEl.className = "category";
    catEl.innerHTML = `<span class="chev">▾</span> ${cat.category}`;
    catEl.addEventListener("click", () => catEl.classList.toggle("collapsed"));
    $tree.appendChild(catEl);

    const ul = document.createElement("ul");
    ul.className = "tags";
    for (const t of cat.tags) {
      const li = document.createElement("li");
      li.className = "tag";
      li.dataset.tag = t.tag;
      li.innerHTML = `<span>${t.tag}</span><span class="count">${t.count}</span>`;
      li.addEventListener("click", () => selectTag(t.tag));
      ul.appendChild(li);
    }
    $tree.appendChild(ul);
  }
}

function selectTag(tag) {
  state.activeTag = tag;
  for (const el of $tree.querySelectorAll(".tag")) {
    el.classList.toggle("active", el.dataset.tag === tag);
  }
  render();
}

function clearTag() {
  state.activeTag = null;
  for (const el of $tree.querySelectorAll(".tag")) el.classList.remove("active");
  render();
}

function toggleAllCategories() {
  const cats = $tree.querySelectorAll(".category");
  const anyExpanded = Array.from(cats).some(c => !c.classList.contains("collapsed"));
  for (const c of cats) c.classList.toggle("collapsed", anyExpanded);
}

/* ----------------------------- filter + sort ----------------------------- */

function filteredDocs() {
  const { data, activeTag, side, role, division, sort, search } = state;
  let out = data.docs;

  if (activeTag) {
    if (role === "response") {
      out = out.filter(d => d.response_tags.includes(activeTag));
    } else if (role === "main") {
      out = out.filter(d => d.main_tags.includes(activeTag));
    } else {
      out = out.filter(d => d.main_tags.includes(activeTag) || d.response_tags.includes(activeTag));
    }
  } else {
    if (role === "main")     out = out.filter(d => d.main_tags.length > 0);
    if (role === "response") out = out.filter(d => d.response_tags.length > 0);
  }

  if (side === "pro" || side === "con") out = out.filter(d => d.side === side);

  if (division === "gold" || division === "silver") {
    out = out.filter(d => d.record && d.record.division === division);
  }

  if (search) {
    const s = search.toLowerCase();
    out = out.filter(d =>
      (d.team && d.team.toLowerCase().includes(s)) ||
      (d.school && d.school.toLowerCase().includes(s)) ||
      (d.tournament && d.tournament.toLowerCase().includes(s)) ||
      d.file.toLowerCase().includes(s)
    );
  }

  out = out.slice();
  if (sort === "record") {
    out.sort((a, b) => {
      const ar = a.record ? 0 : 1, br = b.record ? 0 : 1;
      if (ar !== br) return ar - br;
      const aw = a.record ? a.record.wins : 0, bw = b.record ? b.record.wins : 0;
      if (bw !== aw) return bw - aw;
      return (a.team || "").localeCompare(b.team || "");
    });
  } else {
    out.sort((a, b) => {
      return (a.team || "").localeCompare(b.team || "")
          || (a.tournament || "").localeCompare(b.tournament || "")
          || (a.round_id || 0) - (b.round_id || 0);
    });
  }
  return out;
}

/* ----------------------------- render docs ----------------------------- */

function recordBadge(rec) {
  if (!rec) return `<span class="record none" title="not in gold/silver TOC"></span>`;
  const { division, wins } = rec;
  const losses = Math.max(0, 7 - wins);
  return `<span class="record ${division} w${wins}" title="${division} — ${wins}-${losses} prelims">${wins}-${losses}</span>`;
}

function render() {
  if (!state.data) return;
  const tag = state.activeTag;
  const docs = filteredDocs();

  const label = tag
    ? `<strong>${tag}</strong>`
    : (state.role === "response" ? `<strong>docs with responses</strong>`
    :  state.role === "main"     ? `<strong>docs with main tags</strong>`
    :                              `<strong>all docs</strong>`);
  $docHeader.innerHTML = `${label} — ${docs.length} docs`
    + (state.side !== "all" ? ` · side=${state.side}` : "")
    + (tag && state.role !== "all" ? ` · role=${state.role}` : "")
    + (state.division !== "all" ? ` · ${state.division}` : "");

  $docList.innerHTML = "";
  if (docs.length === 0) {
    $docList.innerHTML = '<li style="padding:1rem;color:#888">no docs match current filters</li>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const d of docs) {
    const li = document.createElement("li");
    li.className = "doc";
    const team = d.team || d.school || "(unknown)";
    const tourn = [d.tournament, d.round_id ? `round ${d.round_id}` : ""].filter(Boolean).join(" · ") || "—";

    const openHtml = d.drive_url
      ? `<a class="open" href="${d.drive_url}" target="_blank" rel="noopener">Open</a>`
      : `<span class="open disabled" title="no drive link">—</span>`;

    li.innerHTML = `
      <div class="team" title="${d.file}">${team}</div>
      <div class="side ${d.side}">${d.side}</div>
      ${recordBadge(d.record)}
      <div class="meta">${tourn}</div>
      ${openHtml}
      <div class="tags-line">
        ${d.main_tags.map(t => `<span class="tag-chip" data-tag="${t}">${escapeHtml(t)}</span>`).join("")}
        ${d.response_tags.map(t => `<span class="tag-chip response" data-tag="${t}" title="response tag">↩ ${escapeHtml(t)}</span>`).join("")}
        ${d.detail ? `<span class="detail-toggle" title="show detail">ⓘ</span>` : ""}
      </div>
      ${d.detail ? renderDetail(d.detail) : ""}
    `;
    for (const chip of li.querySelectorAll(".tag-chip")) {
      chip.addEventListener("click", () => selectTag(chip.dataset.tag));
    }
    const toggle = li.querySelector(".detail-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => li.classList.toggle("show-detail"));
    }
    frag.appendChild(li);
  }
  $docList.appendChild(frag);
}

function renderDetail(det) {
  const parts = [];
  if (det.scenario) parts.push(`<div class="detail-scenario"><b>scenario:</b> ${escapeHtml(det.scenario)}</div>`);
  if (det.notes)    parts.push(`<div class="detail-notes"><b>notes:</b> ${escapeHtml(det.notes)}</div>`);
  return `<div class="detail">${parts.join("")}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => (
    {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]
  ));
}

/* ----------------------------- controls ----------------------------- */

$side.addEventListener("change", () => { state.side = $side.value; render(); });
$role.addEventListener("change", () => { state.role = $role.value; render(); });
$division.addEventListener("change", () => { state.division = $division.value; render(); });
$sortBtn.addEventListener("click", () => {
  state.sort = state.sort === "team" ? "record" : "team";
  $sortBtn.textContent = state.sort === "record" ? "⇅ record" : "⇅ team";
  render();
});
$search.addEventListener("input", () => { state.search = $search.value; render(); });
$showAll.addEventListener("click", () => clearTag());
$toggleAll.addEventListener("click", () => toggleAllCategories());

init();
