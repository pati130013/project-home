const C = window.CONFIG;
const STATUSES = [
  ["todo", "To do"], ["doing", "In progress"],
  ["wait", "Waiting / to decide"], ["done", "Done"],
];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ico = (room) => (C.ICONS[room] ? `<span class="ico" style="--i:url(icons/${C.ICONS[room]})"></span>` : "");
const money = (n) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: C.CURRENCY || "PLN", maximumFractionDigits: 2 }).format(n || 0);
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

let tasks = [], links = [], budget = [], funds = 0, tab = "kanban", curRoom = C.ROOMS[0], sb = null;

// ---------- warstwa danych: Supabase albo localStorage ----------
const cloud = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
const store = {
  async load(t) {
    if (cloud) {
      const { data, error } = await sb.from(t).select("*").order("created_at");
      if (error) throw error;
      return data;
    }
    return JSON.parse(localStorage.getItem("dom_" + t) || "[]");
  },
  async save(t, row) {
    if (cloud) {
      const { id, ...rest } = row;
      const q = id ? sb.from(t).update(rest).eq("id", id) : sb.from(t).insert(rest);
      const { error } = await q;
      if (error) throw error;
      return;
    }
    const all = JSON.parse(localStorage.getItem("dom_" + t) || "[]");
    if (row.id) Object.assign(all.find((r) => r.id === row.id), row);
    else all.push({ ...row, id: crypto.randomUUID() });
    localStorage.setItem("dom_" + t, JSON.stringify(all));
  },
  async del(t, id) {
    if (cloud) {
      const { error } = await sb.from(t).delete().eq("id", id);
      if (error) throw error;
      return;
    }
    const all = JSON.parse(localStorage.getItem("dom_" + t) || "[]").filter((r) => r.id !== id);
    localStorage.setItem("dom_" + t, JSON.stringify(all));
  },
};

const fundsStore = {
  async load() {
    if (!cloud) return +localStorage.getItem("dom_funds") || 0;
    const { data, error } = await sb.from("settings").select("value").eq("key", "funds").maybeSingle();
    if (error) throw error;
    return +data?.value || 0;
  },
  async save(v) {
    if (!cloud) return localStorage.setItem("dom_funds", v);
    const { error } = await sb.from("settings").upsert({ key: "funds", value: v });
    if (error) throw error;
  },
};

async function reload() {
  try {
    [tasks, links, budget, funds] = await Promise.all([store.load("tasks"), store.load("links"), store.load("budget"), fundsStore.load()]);
    render();
  } catch (e) { alert("Data error: " + e.message); }
}

// ---------- filtry ----------
function fillSelect(el, opts, first) {
  el.innerHTML = (first ? `<option value="">${first}</option>` : "") +
    opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}">${esc(l)}</option>`; }).join("");
}
fillSelect($("#fRoom"), C.ROOMS, "All rooms");
fillSelect($("#fPerson"), C.PEOPLE, "Everyone");
fillSelect($("#taskForm [name=room]"), C.ROOMS);
fillSelect($("#taskForm [name=assignee]"), C.PEOPLE, "— nobody —");
fillSelect($("#taskForm [name=status]"), STATUSES);
fillSelect($("#linkForm [name=room]"), C.ROOMS);
fillSelect($("#budgetForm [name=room]"), C.ROOMS, "— no room —");
$("#fRoom").onchange = $("#fPerson").onchange = render;

const filtered = () => tasks.filter((t) =>
  (!$("#fRoom").value || t.room === $("#fRoom").value) &&
  (!$("#fPerson").value || t.assignee === $("#fPerson").value));

// ---------- widoki ----------
const depsOf = (t) => (t.depends_on || []).map((id) => tasks.find((x) => x.id === id)).filter(Boolean);
const blockersOf = (t) => depsOf(t).filter((d) => d.status !== "done");
const unlocksOf = (t) => tasks.filter((x) => x.status !== "done" && (x.depends_on || []).includes(t.id));
// task that (directly or indirectly) depends on `id` – cannot be chosen as its prerequisite
function dependsOnChain(task, id, seen = new Set()) {
  if (seen.has(task.id)) return false; seen.add(task.id);
  return (task.depends_on || []).some((d) => d === id || (tasks.find((x) => x.id === d) && dependsOnChain(tasks.find((x) => x.id === d), id, seen)));
}
// własne okno potwierdzenia (confirm() bywa blokowany w przeglądarkach mobilnych)
function ask(msg) {
  return new Promise((res) => {
    const d = $("#askDlg"); $("#askMsg").textContent = msg; d.returnValue = "";
    d.onclose = () => res(d.returnValue === "yes"); d.showModal();
  });
}
async function moveTask(id, status) {
  const t = tasks.find((x) => x.id === id), b = blockersOf(t);
  if (t.status !== "done" && (status === "doing" || status === "done") && b.length &&
      !(await ask(`"${t.title}" is waiting for: ${b.map((x) => x.title).join(", ")}. Move anyway?`))) return reload();
  await store.save("tasks", { id, status }); reload();
}

function taskCard(t) {
  const deps = depsOf(t), unlocks = unlocksOf(t), blocked = t.status !== "done" && blockersOf(t).length > 0;
  const late = t.due && t.status !== "done" && t.due < new Date().toISOString().slice(0, 10);
  const pi = C.PEOPLE.indexOf(t.assignee);
  return `<div class="task ${pi >= 0 ? "u" + pi : ""} ${blocked ? "blocked" : ""}" draggable="true" data-id="${t.id}">
    <b>${esc(t.title)}</b>
    ${t.room ? (ico(t.room) ? `<span class="rico ${pi >= 0 ? "u" + pi : ""}" title="${esc(t.room)}${t.assignee ? " · " + esc(t.assignee) : ""}">${ico(t.room)}</span>` : `<span class="tag">${esc(t.room)}</span>`) : ""}
    ${t.cost ? `<span class="tag">${money(t.cost)}</span>` : ""}
    ${t.due ? `<span class="tag ${late ? "late" : ""}">${esc(t.due)}</span>` : ""}
    ${deps.length ? `<div class="dep">Needs first: ${deps.map((d) => `<span class="${d.status === "done" ? "ok" : "wait"}">${esc(d.title)}</span>`).join(", ")}</div>` : ""}
    ${unlocks.length ? `<div class="dep">Unlocks: ${unlocks.map((u) => esc(u.title)).join(", ")}</div>` : ""}
  </div>`;
}

function viewKanban() {
  const list = filtered();
  return `<div class="board">${STATUSES.map(([v, l]) => {
    const items = list.filter((t) => t.status === v);
    return `<div class="col" data-status="${v}"><h3>${l} (${items.length})</h3>${items.map((t) => taskCard(t)).join("")}</div>`;
  }).join("")}</div>`;
}

function linkCard(l) {
  const url = safeUrl(l.url), img = safeUrl(l.image);
  return `<div class="link" data-link="${l.id}">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
    <div><b>${esc(l.title)}</b>
    ${l.note ? `<p class="small">${esc(l.note)}</p>` : ""}
    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" data-ext>${esc(new URL(url).hostname)} ↗</a>` : ""}</div></div>`;
}

function viewRooms() {
  const rt = tasks.filter((t) => t.room === curRoom);
  const rl = links.filter((l) => l.room === curRoom);
  const open = rt.filter((t) => t.status !== "done").length;
  return `<div class="chips">${C.ROOMS.map((r) => `<button data-room="${esc(r)}" class="${r === curRoom ? "active" : ""}" title="${esc(r)}" aria-label="${esc(r)}">${ico(r)}${r === curRoom || !ico(r) ? `${esc(r)} <span class="small">${tasks.filter((t) => t.room === r && t.status !== "done").length || ""}</span>` : ""}</button>`).join("")}</div>
  <h2>Inspo & links (${rl.length})</h2>
  <div class="grid">${rl.map(linkCard).join("") || `<p class="small">No links yet – add the first one with the button above.</p>`}</div>
  <h2>Tasks – ${esc(curRoom)} (open: ${open})</h2>
  <div class="grid">${rt.map((t) => taskCard(t)).join("") || `<p class="small">No tasks.</p>`}</div>`;
}

function viewPeople() {
  const list = filtered();
  const groups = [...C.PEOPLE, ""];
  return `<div class="cols2">${groups.map((p) => {
    const mine = list.filter((t) => (t.assignee || "") === p);
    const open = mine.filter((t) => t.status !== "done");
    return `<div class="card"><h2 class="u${C.PEOPLE.indexOf(p)}" style="margin-top:0">${esc(p || "Unassigned")} <span class="small">(open: ${open.length}, done: ${mine.length - open.length})</span></h2>
      ${open.map((t) => taskCard(t)).join("") || `<p class="small">Nothing to do <span class="ico" style="--i:url(icons/thumbsup.png)"></span></p>`}</div>`;
  }).join("")}</div>`;
}

function viewBudget() {
  // koszt zadania wchodzi do budżetu automatycznie – chyba że zadanie ma już własną pozycję budżetową
  const linked = new Set(budget.map((b) => b.task_id).filter(Boolean));
  const fromTasks = tasks.filter((t) => +t.cost > 0 && !linked.has(t.id))
    .map((t) => ({ id: t.id, title: t.title, amount: t.cost, room: t.room, paid: t.cost_paid, fromTask: t }));
  const all = [...budget, ...fromTasks];
  const items = all.filter((b) => !$("#fRoom").value || b.room === $("#fRoom").value);
  const total = all.reduce((s, b) => s + (+b.amount || 0), 0);
  const paid = all.filter((b) => b.paid).reduce((s, b) => s + (+b.amount || 0), 0);
  const shown = items.reduce((s, b) => s + (+b.amount || 0), 0);
  const rows = items.map((b) => {
    const t = b.fromTask || tasks.find((x) => x.id === b.task_id);
    return `<div class="bitem ${b.paid ? "paid" : ""}" ${b.fromTask ? `data-tcost="${b.id}"` : `data-budget="${b.id}"`}>
      <div><b>${esc(b.title)}</b><br>
      ${b.room ? `<span class="tag">${ico(b.room)}${esc(b.room)}</span>` : ""}
      ${t ? `<span class="tag p${C.PEOPLE.indexOf(t.assignee)}">${b.fromTask ? "From task" : "Task: " + esc(t.title)}</span>` : ""}
      ${b.paid ? `<span class="tag">Paid</span>` : ""}
      ${b.note ? `<div class="small">${esc(b.note)}</div>` : ""}</div>
      <span class="amt">${money(b.amount)}</span></div>`;
  }).join("");
  return `<div class="sum">
    <div class="card funds"><span class="small">Total funds</span>
      <input id="funds" type="number" min="0" step="0.01" value="${funds || ""}" placeholder="0"></div>
    <div class="card"><span class="small">Budgeted</span><b>${money(total)}</b></div>
    <div class="card paid"><span class="small">Paid</span><b>${money(paid)}</b></div>
    <div class="card left"><span class="small">Left after budget</span><b class="${funds - total < 0 ? "neg" : ""}">${money(funds - total)}</b></div>
    <div class="card paid"><span class="small">Cash left now</span><b class="${funds - paid < 0 ? "neg" : ""}">${money(funds - paid)}</b></div></div>
    ${$("#fRoom").value ? `<p class="small">Showing ${esc($("#fRoom").value)}: ${money(shown)}</p>` : ""}
    ${rows || `<p class="small">No budget items yet – add one with the + button, or give a task a cost.</p>`}`;
}

function render() {
  $("#filterBtn").classList.toggle("on", !!($("#fRoom").value || $("#fPerson").value));
  $("#view").innerHTML = { kanban: viewKanban, rooms: viewRooms, people: viewPeople, budget: viewBudget }[tab]();
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
}

// ---------- zdarzenia ----------
$("#tabs").onclick = (e) => { if (e.target.dataset.tab) { tab = e.target.dataset.tab; render(); } };

$("#view").onclick = (e) => {
  if (e.target.closest("[data-ext]") || e.target.matches("select")) return;
  const r = e.target.closest("[data-room]"); if (r) { curRoom = r.dataset.room; return render(); }
  const t = e.target.closest(".task"); if (t) return openTask(tasks.find((x) => x.id === t.dataset.id));
  const tc = e.target.closest("[data-tcost]"); if (tc) return openTask(tasks.find((x) => x.id === tc.dataset.tcost));
  const b = e.target.closest("[data-budget]"); if (b) return openBudget(budget.find((x) => x.id === b.dataset.budget));
  const l = e.target.closest("[data-link]"); if (l) return openLink(links.find((x) => x.id === l.dataset.link));
};

$("#view").onchange = async (e) => {
  if (e.target.id === "funds") { funds = +e.target.value || 0; await fundsStore.save(funds); return render(); }
  if (!e.target.dataset.move) return;
  await moveTask(e.target.dataset.move, e.target.value);
};

// drag & drop (komputer)
let dragId = null;
$("#view").ondragstart = (e) => { const t = e.target.closest(".task"); if (t) dragId = t.dataset.id; };
$("#view").ondragover = (e) => { const c = e.target.closest(".col"); if (c) { e.preventDefault(); c.classList.add("over"); } };
$("#view").ondragleave = (e) => e.target.closest(".col")?.classList.remove("over");
$("#view").ondrop = async (e) => {
  const c = e.target.closest(".col"); if (!c || !dragId) return;
  e.preventDefault();
  const id = dragId; dragId = null; await moveTask(id, c.dataset.status);
};

// dialogi
function fill(form, obj) { for (const el of form.elements) if (el.name) { if (el.type === "checkbox") el.checked = !!obj?.[el.name]; else el.value = obj?.[el.name] ?? el.defaultValue ?? ""; } }
function openTask(t) {
  const f = $("#taskForm"); f.reset(); fill(f, t || { room: $("#fRoom").value || C.ROOMS[0], status: "todo", assignee: $("#fPerson").value });
  const cands = tasks.filter((x) => x.id !== t?.id && !(t && dependsOnChain(x, t.id)));
  $("#deps").innerHTML = cands.map((x) => `<label><input type="checkbox" name="dep" value="${x.id}" ${(t?.depends_on || []).includes(x.id) ? "checked" : ""}>${esc(x.title)}</label>`).join("") || `<span class="small">No other tasks yet.</span>`;
  f.dataset.id = t?.id || ""; $("#taskDel").hidden = !t; $("#taskDlg").showModal();
}
function openLink(l) {
  const f = $("#linkForm"); f.reset(); fill(f, l || { room: tab === "rooms" ? curRoom : $("#fRoom").value || C.ROOMS[0] });
  f.dataset.id = l?.id || ""; $("#linkDel").hidden = !l; $("#linkDlg").showModal();
}
function openBudget(b) {
  const f = $("#budgetForm"); f.reset();
  fillSelect(f.task_id, tasks.map((t) => [t.id, t.title]), "— no task —");
  fill(f, b || { room: $("#fRoom").value });
  f.dataset.id = b?.id || ""; $("#budgetDel").hidden = !b; $("#budgetDlg").showModal();
}
$("#budgetForm [name=task_id]").onchange = (e) => {
  const t = tasks.find((x) => x.id === e.target.value), f = $("#budgetForm");
  if (t && !f.amount.value && t.cost) f.amount.value = t.cost;
  if (t && !f.room.value && t.room) f.room.value = t.room;
};
$("#addBudget").onclick = () => openBudget();
$("#addTask").onclick = () => openTask();
$("#addLink").onclick = () => openLink();
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));

function formData(f) {
  const o = Object.fromEntries(new FormData(f)); if (f.dataset.id) o.id = f.dataset.id;
  for (const k of ["due", "cost", "amount", "task_id", "room"]) if (k in o && !o[k]) o[k] = null;
  for (const k of ["cost", "amount"]) if (o[k] != null) o[k] = Number(o[k]);
  if (f.paid) o.paid = f.paid.checked;
  if (f.cost_paid) o.cost_paid = f.cost_paid.checked;
  if (f.id === "taskForm") { o.depends_on = [...f.querySelectorAll("[name=dep]:checked")].map((c) => c.value); delete o.dep; }
  return o;
}
$("#taskForm").onsubmit = async (e) => { await store.save("tasks", formData(e.target)); reload(); };
$("#linkForm").onsubmit = async (e) => { await store.save("links", formData(e.target)); reload(); };
$("#budgetForm").onsubmit = async (e) => { await store.save("budget", formData(e.target)); reload(); };
$("#budgetDel").onclick = async () => { if (await ask("Delete this budget item?")) { await store.del("budget", $("#budgetForm").dataset.id); $("#budgetDlg").close(); reload(); } };
$("#taskDel").onclick = async () => { if (await ask("Delete this task?")) { await store.del("tasks", $("#taskForm").dataset.id); $("#taskDlg").close(); reload(); } };
$("#linkDel").onclick = async () => { if (await ask("Delete this link?")) { await store.del("links", $("#linkForm").dataset.id); $("#linkDlg").close(); reload(); } };

// ---------- start / logowanie ----------
async function start() {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#mode").textContent = cloud ? "synced ☁" : "local mode";
  $("#logout").hidden = !cloud;
  await reload();
  if (cloud) {
    sb.channel("dom").on("postgres_changes", { event: "*", schema: "public" }, reload).subscribe();
    document.addEventListener("visibilitychange", () => !document.hidden && reload());
  }
}

if (!cloud) start();
else {
  sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  sb.auth.getSession().then(({ data }) => (data.session ? start() : ($("#login").hidden = false)));
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) $("#loginErr").textContent = "Login failed: " + error.message; else start();
  };
  $("#logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
}

// ---------- menu w nawigacji: filtr i dodawanie ----------
document.addEventListener("click", (e) => {
  document.querySelectorAll(".pop").forEach((p) => {
    if (p.querySelector(".iconbtn").contains(e.target)) p.classList.toggle("open");
    else if (!p.querySelector(".menu").contains(e.target) || e.target.closest("[data-closes]")) p.classList.remove("open");
  });
});
$("#clearFilter").onclick = () => { $("#fRoom").value = ""; $("#fPerson").value = ""; render(); };
