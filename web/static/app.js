const root = document.querySelector("#app");
const toastNode = document.querySelector("#toast");

const state = {
  user: null,
  settings: { timezone: "America/Argentina/Buenos_Aires", workday_hours: 8 },
  sites: [],
  workers: [],
  records: [],
  people: [],
  adminSites: [],
  view: "day",
  groupBy: "worker",
  adminSection: "summary",
  selectedSiteId: null,
  date: null,
  openGroup: null,
  peopleSort: { key: "category", direction: "asc" },
};

const pad = (value) => String(value).padStart(2, "0");
const textCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const html = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[char]));

async function api(path, options = {}) {
  const url = new URL(path.replace(/^\//, ""), document.baseURI);
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401) {
    state.user = null;
    renderLogin();
    throw new Error("Tu sesión venció");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "No se pudo completar la acción");
  }
  return response.status === 204 ? null : response.json();
}

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  window.setTimeout(() => toastNode.classList.remove("show"), 2600);
}

function dateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: state.settings.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

function sundayOf(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return addDays(dateString, -value.getUTCDay());
}

function zonedDateTime(dateString, time = "00:00") {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: state.settings.timezone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const represented = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute);
  return new Date(guess - (represented - guess)).toISOString();
}

function localInput(iso) {
  if (!iso) return "";
  const values = Object.fromEntries(new Intl.DateTimeFormat("es-AR", {
    timeZone: state.settings.timezone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function inputToIso(value) {
  if (!value) return null;
  const [date, time] = value.split("T");
  return zonedDateTime(date, time);
}

function displayDate(dateString, long = true) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC", weekday: long ? "long" : undefined, day: "numeric", month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function displayTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: state.settings.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

function displayDateTime(iso) {
  if (!iso) return "Sin datos";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: state.settings.timezone,
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

function minutesOf(record) {
  const end = record.exit_at ? new Date(record.exit_at) : new Date();
  return Math.max(0, Math.round((end - new Date(record.entry_at)) / 60000));
}

function totalMinutes(records) { return records.reduce((sum, record) => sum + minutesOf(record), 0); }
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
function formatWorkdays(minutes) {
  const dayMinutes = state.settings.workday_hours * 60;
  const days = Math.floor(minutes / dayMinutes);
  const remainder = minutes % dayMinutes;
  const hours = Math.floor(remainder / 60);
  const mins = remainder % 60;
  return `${days} ${days === 1 ? "día" : "días"}, ${hours} ${hours === 1 ? "hora" : "horas"} y ${mins} ${mins === 1 ? "minuto" : "minutos"}`;
}

function siteName(id) { return state.sites.find((site) => site.id === id)?.name || "Obra"; }
function workerName(id) { return state.workers.find((worker) => worker.id === id)?.name || "Trabajador"; }
function workerCategory(worker) { return worker.category || "Sin categoría"; }

function currentRange() {
  const start = state.view === "day" ? state.date : sundayOf(state.date);
  const end = addDays(start, state.view === "day" ? 1 : 7);
  return { start, end };
}

async function loadData() {
  const { start, end } = currentRange();
  state.sites = await api("/api/v1/sites");
  if (state.user.role === "foreman") {
    if (!state.sites.some((site) => site.id === state.selectedSiteId)) state.selectedSiteId = state.sites[0]?.id || null;
  }
  const query = new URLSearchParams({ from_at: zonedDateTime(start), to_at: zonedDateTime(end) });
  const workerQuery = new URLSearchParams();
  if (state.selectedSiteId) {
    query.set("site_id", state.selectedSiteId);
    workerQuery.set("site_id", state.selectedSiteId);
  }
  const requests = [
    api(`/api/v1/workers${workerQuery.size ? `?${workerQuery}` : ""}`),
    api(`/api/v1/records?${query}`),
  ];
  if (state.user.role === "admin") {
    requests.push(api("/api/v1/admin/people"));
    requests.push(api("/api/v1/admin/sites"));
  }
  const [workers, records, people = [], adminSites = []] = await Promise.all(requests);
  state.workers = workers;
  state.records = records;
  state.people = people;
  state.adminSites = adminSites;
}

async function refresh() {
  await loadData();
  renderApp();
}

function renderLogin(message = "") {
  root.innerHTML = `
    <main class="login-shell">
      <form class="login-card" id="login-form">
        <p class="eyebrow">Registro de horas</p>
        <h1>Iniciar sesión</h1>
        <div class="field"><label for="username">Usuario</label><input id="username" name="username" autocomplete="username" required></div>
        <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <button class="primary" type="submit">Ingresar</button>
        <p class="form-error" id="login-error">${html(message)}</p>
      </form>
    </main>`;
  document.querySelector("#login-form").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const error = document.querySelector("#login-error");
  button.disabled = true;
  error.textContent = "";
  try {
    const data = new FormData(event.currentTarget);
    state.user = await api("/api/v1/auth/login", {
      method: "POST", body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
    });
    state.settings = await api("/api/v1/settings");
    state.date = dateParts();
    state.view = state.user.role === "admin" ? "week" : "day";
    state.adminSection = "summary";
    state.selectedSiteId = state.user.site_ids?.[0] || state.user.site_id;
    await refresh();
  } catch (errorValue) {
    error.textContent = errorValue.message;
  } finally { button.disabled = false; }
}

async function logout() {
  await api("/api/v1/auth/logout", { method: "POST" });
  state.user = null;
  state.selectedSiteId = null;
  renderLogin();
}

function header() {
  return `<header class="topbar">
    <div class="brand"><span class="brand-mark">✓</span><span>Registro de horas</span></div>
    <div class="account"><span class="role-badge">${state.user.role === "admin" ? "Administrador" : "Encargado"}</span><button class="secondary" id="logout">Cerrar sesión</button></div>
  </header>`;
}

function navigator() {
  const { start, end } = currentRange();
  const label = state.view === "day" ? displayDate(start) : `${displayDate(start, false)} — ${displayDate(addDays(end, -1), false)}`;
  return `<div class="navigator"><button class="icon-button" data-nav="-1" aria-label="Anterior">‹</button><strong>${html(label)}</strong><button class="icon-button" data-nav="1" aria-label="Siguiente">›</button></div>`;
}

function collectAlerts(records, { includeOpen = true } = {}) {
  const alerts = includeOpen
    ? records.filter((record) => !record.exit_at).map((record) => ({
      type: "open",
      title: "Jornada abierta",
      description: `La entrada de las ${displayTime(record.entry_at)} no tiene hora de salida`,
      workerId: record.worker_id,
      siteId: record.site_id,
      records: [record],
    }))
    : [];
  const byWorker = Map.groupBy(records, (record) => record.worker_id);
  byWorker.forEach((items) => {
    const sorted = [...items].sort((a, b) => new Date(a.entry_at) - new Date(b.entry_at));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const previousEnd = previous.exit_at && new Date(previous.exit_at);
      if (!previousEnd || new Date(current.entry_at) < previousEnd) {
        alerts.push({
          type: "overlap",
          title: "Horarios superpuestos",
          description: `${displayTime(previous.entry_at)} — ${displayTime(previous.exit_at)} se superpone con ${displayTime(current.entry_at)} — ${displayTime(current.exit_at)}`,
          workerId: current.worker_id,
          siteId: current.site_id,
          records: [previous, current],
        });
      }
    }
  });
  return alerts;
}

function visibleAlerts() {
  return collectAlerts(state.records, { includeOpen: state.user.role === "admin" });
}

function foremanDay() {
  const active = state.records.filter((record) => !record.exit_at).length;
  const total = totalMinutes(state.records);
  const alerts = visibleAlerts();
  const groupedWorkers = Map.groupBy(state.workers, workerCategory);
  const cards = [...groupedWorkers].map(([category, workers]) => {
    const items = workers.map((worker) => {
      const records = state.records.filter((record) => record.worker_id === worker.id);
      const current = records.find((record) => !record.exit_at);
      const segments = records.length
        ? records.map((record) => `<li>${displayTime(record.entry_at)} — ${displayTime(record.exit_at)}</li>`).join("")
        : "<li>Sin registros</li>";
      const action = current ? "Tocar para registrar la salida" : records.length ? "Tocar para una nueva entrada" : "Tocar para registrar la entrada";
      return `<article class="person-card ${current ? "working" : ""}">
        <button class="secondary edit-person" data-edit-worker="${worker.id}" aria-label="Editar registros">Editar</button>
        <button class="person-main" data-tap-worker="${worker.id}">
          <span><span class="person-name">${html(worker.name)} ${current ? '<span class="status">Trabajando</span>' : ""}</span><ul class="records-inline">${segments}</ul><span class="card-action">${action}</span></span>
          <span class="card-total">Total: ${formatTime(totalMinutes(records))}</span>
        </button>
      </article>`;
    }).join("");
    return `<section class="worker-category"><h2>${html(category)}</h2>${items}</section>`;
  }).join("");
  return `<div class="metrics"><div class="metric"><strong>${active}</strong><span>trabajando</span></div><div class="metric"><strong>${formatTime(total)}</strong><span>tiempo registrado</span></div>${alertMetric(alerts)}</div>
    <section class="person-list">${cards || '<div class="empty">No hay trabajadores asignados a esta obra.</div>'}</section>
    ${alerts.length ? `<button class="alert-strip" data-show-alerts><span>${alerts.length} ${alerts.length === 1 ? "registro requiere" : "registros requieren"} revisión</span><span>Ver detalles</span></button>` : ""}
    <div class="close-shift"><button class="primary" id="close-shift" ${active ? "" : "disabled"}>Cerrar jornada${active ? ` (${active})` : ""}</button><p>Cierra todas las jornadas abiertas de esta obra con la hora actual.</p></div>`;
}

function alertMetric(alerts) {
  if (!alerts.length) return '<div class="metric"><strong>0</strong><span>alertas</span></div>';
  return `<button class="metric warning metric-button" data-show-alerts><strong>${alerts.length}</strong><span>alertas · Ver detalles</span></button>`;
}

function groupData(groupBy) {
  const source = groupBy === "worker" ? state.workers : state.sites;
  return source.map((item) => {
    const records = state.records.filter((record) => record[groupBy === "worker" ? "worker_id" : "site_id"] === item.id);
    const counterpartKey = groupBy === "worker" ? "site_id" : "worker_id";
    const details = [...new Set(records.map((record) => record[counterpartKey]))].map((id) => {
      const detailRecords = records.filter((record) => record[counterpartKey] === id);
      return { id, name: groupBy === "worker" ? siteName(id) : workerName(id), records: detailRecords };
    });
    return { ...item, records, details, alerts: collectAlerts(records, { includeOpen: state.user.role === "admin" }).length, minutes: totalMinutes(records) };
  }).filter((group) => group.records.length);
}

function groupedTable(groupBy) {
  const groups = groupData(groupBy);
  const other = groupBy === "worker" ? "Obras" : "Trabajadores";
  let previousCategory = null;
  const rows = groups.map((group) => {
    const key = `${groupBy}-${group.id}`;
    const open = state.openGroup === key;
    const category = workerCategory(group);
    const categoryHeader = groupBy === "worker" && category !== previousCategory ? `<div class="table-category">${html(category)}</div>` : "";
    previousCategory = category;
    const names = group.details.map((detail) => detail.name).join(", ");
    const details = group.details.map((detail) => `<div class="detail-line"><span class="detail-indent" aria-hidden="true"></span><strong class="detail-name">${html(detail.name)}</strong><span class="detail-time">${formatTime(totalMinutes(detail.records))}</span><span class="detail-days">${formatWorkdays(totalMinutes(detail.records))}</span><span class="record-buttons">${detail.records.map((record) => `<button data-edit-record="${record.id}">${displayTime(record.entry_at)} — ${displayTime(record.exit_at)}</button>`).join("")}</span></div>`).join("");
    return `${categoryHeader}<button class="group-row ${open ? "open" : ""}" data-group="${key}"><span class="group-name"><span class="chevron">›</span>${html(group.name)}</span><span>${html(names)}</span><span>${formatTime(group.minutes)}</span><span>${formatWorkdays(group.minutes)}</span><span>${group.alerts ? `<span class="warning-pill">${group.alerts} ${group.alerts === 1 ? "alerta" : "alertas"}</span>` : "—"}</span></button>${open ? `<div class="group-details">${details}</div>` : ""}`;
  }).join("");
  return `<div class="data-table"><div class="table-head"><span>${groupBy === "worker" ? "Trabajador" : "Obra"}</span><span>${other}</span><span>Tiempo</span><span>Jornales</span><span>Alertas</span></div>${rows || '<div class="empty">No hay registros en este período.</div>'}</div>`;
}

function foremanWeek() {
  const alerts = visibleAlerts();
  return `<div class="metrics"><div class="metric"><strong>${state.workers.length}</strong><span>trabajadores asignados</span></div><div class="metric"><strong>${formatTime(totalMinutes(state.records))}</strong><span>tiempo semanal</span></div>${alertMetric(alerts)}</div>${groupedTable("worker")}`;
}

function renderForeman() {
  const site = state.sites.find((item) => item.id === state.selectedSiteId)?.name || "Obra";
  const siteSelector = state.sites.length > 1 ? `<label class="site-selector">Obra<select id="site-select">${state.sites.map((item) => `<option value="${item.id}" ${item.id === state.selectedSiteId ? "selected" : ""}>${html(item.name)}</option>`).join("")}</select></label>` : "";
  root.innerHTML = `${header()}<main class="page"><div class="page-title-row"><div><p class="eyebrow">Encargado</p><h1>${html(site)}</h1>${siteSelector}</div><div class="segmented"><button data-view="day" class="${state.view === "day" ? "active" : ""}">Hoy</button><button data-view="week" class="${state.view === "week" ? "active" : ""}">Semana</button></div></div>${navigator()}${state.view === "day" ? foremanDay() : foremanWeek()}</main>`;
  bindCommon();
}

function adminNavigation() {
  return `<nav class="admin-navigation" aria-label="Administración"><button data-admin-section="summary" class="${state.adminSection === "summary" ? "active" : ""}">Resumen</button><button data-admin-section="people" class="${state.adminSection === "people" ? "active" : ""}">Trabajadores</button><button data-admin-section="sites" class="${state.adminSection === "sites" ? "active" : ""}">Obras</button></nav>`;
}

function personSites(person) {
  return person.site_ids.map(siteName).sort(textCollator.compare).join(", ") || "Sin obra";
}

function peopleSortValue(person, key) {
  if (key === "category") return person.category || "\uffff";
  if (key === "sites") return personSites(person);
  if (key === "access") return person.access_enabled ? `${person.role === "admin" ? "Administrador" : "Encargado"} ${person.username}` : "Sin acceso";
  if (key === "active") return person.active ? "Activo" : "Inactivo";
  return person.name;
}

function peopleSortHeader(key, label) {
  const active = state.peopleSort.key === key;
  const direction = active ? state.peopleSort.direction : null;
  const arrow = direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕";
  return `<button class="people-sort ${active ? "active" : ""}" data-sort-people="${key}" aria-label="Ordenar por ${html(label)}">${html(label)} <span aria-hidden="true">${arrow}</span></button>`;
}

function renderPeople() {
  const direction = state.peopleSort.direction === "asc" ? 1 : -1;
  const people = [...state.people].sort((left, right) => {
    const compared = textCollator.compare(
      peopleSortValue(left, state.peopleSort.key),
      peopleSortValue(right, state.peopleSort.key),
    );
    return (compared * direction) || textCollator.compare(left.name, right.name) || left.id - right.id;
  });
  const rows = people.map((person) => {
    const sites = personSites(person);
    const access = person.access_enabled ? `${person.role === "admin" ? "Administrador" : "Encargado"}<br><span>${html(person.username)}</span>` : "Sin acceso";
    return `<div class="people-row"><strong>${html(person.name)}</strong><span class="person-category-cell">${html(workerCategory(person))}</span><span class="person-sites">${html(sites)}</span><span class="person-access">${access}</span><span class="person-status ${person.active ? "active" : "inactive"}">${person.active ? "Activo" : "Inactivo"}</span><button class="secondary" data-edit-person="${person.id}">Editar</button></div>`;
  }).join("");
  root.innerHTML = `${header()}<main class="page">${adminNavigation()}<div class="page-title-row"><div><h1>Trabajadores</h1><p class="muted">Asignaciones y acceso al sistema</p></div><button class="primary" id="add-person">Agregar trabajador</button></div><section class="people-table"><div class="people-head">${peopleSortHeader("name", "Trabajador")}${peopleSortHeader("category", "Categoría")}${peopleSortHeader("sites", "Obras")}${peopleSortHeader("access", "Acceso")}${peopleSortHeader("active", "Estado")}<span></span></div>${rows || '<div class="empty">No se agregaron trabajadores.</div>'}</section></main>`;
  bindCommon();
}

function renderSites() {
  const rows = state.adminSites.map((site) => `<div class="sites-row"><strong>${html(site.name)}</strong><span>${site.people.length} ${site.people.length === 1 ? "trabajador activo" : "trabajadores activos"}</span><button class="secondary" data-edit-site="${site.id}">Administrar</button></div>`).join("");
  root.innerHTML = `${header()}<main class="page">${adminNavigation()}<div class="page-title-row"><div><h1>Obras</h1><p class="muted">Nombres y trabajadores asignados</p></div><button class="primary" id="add-site">Agregar obra</button></div><section class="sites-table"><div class="sites-head"><span>Obra</span><span>Trabajadores</span><span></span></div>${rows || '<div class="empty">No se agregaron obras.</div>'}</section></main>`;
  bindCommon();
}

function renderAdmin() {
  if (state.adminSection === "people") {
    renderPeople();
    return;
  }
  if (state.adminSection === "sites") {
    renderSites();
    return;
  }
  const alerts = visibleAlerts();
  root.innerHTML = `${header()}<main class="page">${adminNavigation()}<div class="page-title-row"><div><h1>Resumen ${state.view === "day" ? "diario" : "semanal"}</h1><p class="muted">Revisión y corrección de registros</p></div><div class="segmented"><button data-view="day" class="${state.view === "day" ? "active" : ""}">Día</button><button data-view="week" class="${state.view === "week" ? "active" : ""}">Semana</button></div></div>${navigator()}<div class="tabs"><button data-group-by="worker" class="${state.groupBy === "worker" ? "active" : ""}">Por trabajador</button><button data-group-by="site" class="${state.groupBy === "site" ? "active" : ""}">Por obra</button></div><div class="metrics"><div class="metric"><strong>${new Set(state.records.map((record) => record.worker_id)).size}</strong><span>trabajadores</span></div><div class="metric"><strong>${formatTime(totalMinutes(state.records))}</strong><span>tiempo registrado</span></div>${alertMetric(alerts)}</div>${groupedTable(state.groupBy)}</main>`;
  bindCommon();
}

function renderApp() { state.user.role === "admin" ? renderAdmin() : renderForeman(); }

function bindCommon() {
  document.querySelector("#logout").addEventListener("click", logout);
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", async () => {
    state.date = addDays(state.date, Number(button.dataset.nav) * (state.view === "day" ? 1 : 7));
    await refresh();
  }));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", async () => {
    state.view = button.dataset.view;
    state.openGroup = null;
    await refresh();
  }));
  document.querySelectorAll("[data-group-by]").forEach((button) => button.addEventListener("click", () => {
    state.groupBy = button.dataset.groupBy;
    state.openGroup = null;
    renderAdmin();
  }));
  document.querySelectorAll("[data-group]").forEach((button) => button.addEventListener("click", () => {
    state.openGroup = state.openGroup === button.dataset.group ? null : button.dataset.group;
    renderApp();
  }));
  document.querySelectorAll("[data-tap-worker]").forEach((button) => button.addEventListener("click", () => tapWorker(Number(button.dataset.tapWorker))));
  document.querySelectorAll("[data-edit-worker]").forEach((button) => button.addEventListener("click", () => showWorkerRecords(Number(button.dataset.editWorker))));
  document.querySelectorAll("[data-edit-record]").forEach((button) => button.addEventListener("click", () => showRecordEditor(Number(button.dataset.editRecord))));
  document.querySelectorAll("[data-show-alerts]").forEach((button) => button.addEventListener("click", showAlertDetails));
  document.querySelector("#close-shift")?.addEventListener("click", closeShift);
  document.querySelector("#site-select")?.addEventListener("change", async (event) => {
    state.selectedSiteId = Number(event.target.value);
    await refresh();
  });
  document.querySelectorAll("[data-admin-section]").forEach((button) => button.addEventListener("click", () => {
    state.adminSection = button.dataset.adminSection;
    renderAdmin();
  }));
  document.querySelectorAll("[data-sort-people]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sortPeople;
    state.peopleSort = {
      key,
      direction: state.peopleSort.key === key && state.peopleSort.direction === "asc" ? "desc" : "asc",
    };
    renderPeople();
  }));
  document.querySelector("#add-person")?.addEventListener("click", () => showPersonEditor());
  document.querySelectorAll("[data-edit-person]").forEach((button) => button.addEventListener("click", () => showPersonEditor(Number(button.dataset.editPerson))));
  document.querySelector("#add-site")?.addEventListener("click", () => showSiteEditor());
  document.querySelectorAll("[data-edit-site]").forEach((button) => button.addEventListener("click", () => showSiteEditor(Number(button.dataset.editSite))));
}

async function tapWorker(workerId) {
  const records = state.records.filter((record) => record.worker_id === workerId);
  const active = records.find((record) => !record.exit_at);
  try {
    if (active) {
      await api(`/api/v1/records/${active.id}`, { method: "PATCH", body: JSON.stringify({ exit_at: new Date().toISOString() }) });
      toast("Salida registrada");
    } else {
      await api("/api/v1/records", { method: "POST", body: JSON.stringify({ worker_id: workerId, site_id: state.selectedSiteId, entry_at: new Date().toISOString() }) });
      toast("Entrada registrada");
    }
    await refresh();
  } catch (error) { toast(error.message); }
}

async function closeShift() {
  const button = document.querySelector("#close-shift");
  button.disabled = true;
  try {
    const records = await api(`/api/v1/sites/${state.selectedSiteId}/close-open-records`, { method: "POST" });
    toast(records.length === 1 ? "1 jornada cerrada" : `${records.length} jornadas cerradas`);
    await refresh();
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function showAlertDetails() {
  const alerts = visibleAlerts();
  const items = alerts.map((alert) => `<article class="alert-detail">
    <div class="alert-detail-head"><div><strong>${html(alert.title)}</strong><p>${html(workerName(alert.workerId))} · ${html(siteName(alert.siteId))}</p></div><span>${alert.type === "open" ? "Abierta" : "Superposición"}</span></div>
    <p>${html(alert.description)}</p>
    <div class="record-buttons alert-records">${alert.records.map((record) => `<button data-alert-record="${record.id}">${displayTime(record.entry_at)} — ${displayTime(record.exit_at)}</button>`).join("")}</div>
  </article>`).join("");
  modal(`<div class="modal-header"><h2>Registros para revisar</h2><button class="close" data-close-modal aria-label="Cerrar">×</button></div><div class="modal-body"><div class="alert-list">${items || '<div class="empty">No hay alertas en este período.</div>'}</div></div>`);
  document.querySelectorAll("[data-alert-record]").forEach((button) => button.addEventListener("click", () => {
    const recordId = Number(button.dataset.alertRecord);
    closeModal();
    showRecordEditor(recordId);
  }));
}

function showPersonEditor(personId = null) {
  const person = state.people.find((item) => item.id === personId) || null;
  const siteOptions = state.sites.map((site) => `<label class="site-option"><input type="checkbox" name="site_ids" value="${site.id}" ${person?.site_ids.includes(site.id) ? "checked" : ""}> ${html(site.name)}</label>`).join("");
  modal(`<div class="modal-header"><h2>${person ? "Editar trabajador" : "Agregar trabajador"}</h2><button class="close" data-close-modal aria-label="Cerrar">×</button></div><form class="modal-body" id="person-form">
    <div class="field"><label for="person-name">Nombre</label><input id="person-name" name="name" value="${html(person?.name || "")}" required></div>
    <div class="field"><label for="person-category">Categoría</label><input id="person-category" name="category" value="${html(person?.category || "")}" maxlength="160" placeholder="Ej.: 01-Jefe"></div>
    <fieldset class="option-group"><legend>Obras asignadas</legend><div class="site-options">${siteOptions || '<span class="muted">No hay obras disponibles.</span>'}</div></fieldset>
    <label class="switch-row"><span><strong>Acceso al sistema</strong><small>El usuario, el rol y la contraseña son opcionales.</small></span><input id="access-enabled" name="access_enabled" type="checkbox" ${person?.access_enabled ? "checked" : ""}></label>
    <div id="account-fields">
      <div class="field"><label for="person-username">Usuario</label><input id="person-username" name="username" value="${html(person?.username || "")}" autocomplete="off"></div>
      <div class="field"><label for="person-role">Rol</label><select id="person-role" name="role"><option value="foreman" ${person?.role === "foreman" ? "selected" : ""}>Encargado</option><option value="admin" ${person?.role === "admin" ? "selected" : ""}>Administrador</option></select></div>
      <div class="field"><label for="person-password">${person?.username ? "Nueva contraseña (opcional)" : "Contraseña"}</label><input id="person-password" name="password" type="password" autocomplete="new-password"><small>${person?.username ? "Dejar en blanco para mantener la contraseña actual." : "Obligatoria al crear el acceso."}</small></div>
    </div>
    <label class="switch-row"><span><strong>Trabajador activo</strong><small>Desactivar al trabajador revoca su acceso.</small></span><input name="active" type="checkbox" ${person?.active !== false ? "checked" : ""}></label>
    <div class="modal-actions"><button class="secondary" type="button" data-close-modal>Cancelar</button><button class="primary" type="submit">Guardar cambios</button></div>
  </form>`);

  const accessToggle = document.querySelector("#access-enabled");
  const syncAccessFields = () => {
    const enabled = accessToggle.checked;
    document.querySelectorAll("#account-fields input, #account-fields select").forEach((field) => { field.disabled = !enabled; });
    document.querySelector("#person-username").required = enabled;
    document.querySelector("#person-password").required = enabled && !person?.username;
    document.querySelector("#account-fields").classList.toggle("disabled", !enabled);
  };
  accessToggle.addEventListener("change", syncAccessFields);
  syncAccessFields();

  document.querySelector("#person-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const accessEnabled = accessToggle.checked;
    const payload = {
      name: data.get("name"),
      category: data.get("category") || null,
      active: data.has("active"),
      site_ids: data.getAll("site_ids").map(Number),
      access_enabled: accessEnabled,
    };
    if (accessEnabled) {
      payload.username = data.get("username");
      payload.role = data.get("role");
      if (data.get("password")) payload.password = data.get("password");
    }
    try {
      await api(person ? `/api/v1/admin/people/${person.id}` : "/api/v1/admin/people", {
        method: person ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      toast(person ? "Trabajador actualizado" : "Trabajador agregado");
      await refresh();
    } catch (error) { toast(error.message); }
  });
}

function showSiteEditor(siteId = null) {
  const site = state.adminSites.find((item) => item.id === siteId) || null;
  const assignedIds = new Set(site?.people.map((person) => person.id) || []);
  const available = state.people.filter((person) => person.active && !assignedIds.has(person.id));
  const people = site?.people.map((person) => `<li><span>${html(person.name)}</span><button class="danger compact" data-remove-site-person="${person.id}">Quitar</button></li>`).join("") || '<li class="muted">No hay trabajadores activos asignados.</li>';
  const addPerson = site ? `<div class="site-person-add"><div class="field"><label for="site-person">Agregar trabajador a la obra</label><select id="site-person" ${available.length ? "" : "disabled"}>${available.length ? available.map((person) => `<option value="${person.id}">${html(person.name)}</option>`).join("") : '<option>No hay trabajadores disponibles</option>'}</select></div><button class="secondary" id="add-site-person" ${available.length ? "" : "disabled"}>Agregar</button></div>` : "";
  modal(`<div class="modal-header"><h2>${site ? "Administrar obra" : "Agregar obra"}</h2><button class="close" data-close-modal aria-label="Cerrar">×</button></div><form class="modal-body" id="site-form"><div class="field"><label for="site-name">Nombre de la obra</label><input id="site-name" name="name" value="${html(site?.name || "")}" required></div><div class="modal-actions"><button class="secondary" type="button" data-close-modal>Cancelar</button><button class="primary" type="submit">${site ? "Guardar nombre" : "Crear obra"}</button></div></form>${site ? `<section class="site-people"><h3>Trabajadores activos en esta obra</h3><ul>${people}</ul>${addPerson}</section>` : ""}`);

  document.querySelector("#site-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(site ? `/api/v1/admin/sites/${site.id}` : "/api/v1/admin/sites", {
        method: site ? "PATCH" : "POST",
        body: JSON.stringify({ name: data.get("name") }),
      });
      closeModal();
      toast(site ? "Obra actualizada" : "Obra agregada");
      await refresh();
    } catch (error) { toast(error.message); }
  });
  document.querySelector("#add-site-person")?.addEventListener("click", async () => {
    const personId = Number(document.querySelector("#site-person").value);
    try {
      await api(`/api/v1/admin/sites/${site.id}/people/${personId}`, { method: "POST" });
      closeModal(); await refresh(); showSiteEditor(site.id); toast("Trabajador agregado a la obra");
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll("[data-remove-site-person]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await api(`/api/v1/admin/sites/${site.id}/people/${button.dataset.removeSitePerson}`, { method: "DELETE" });
      closeModal(); await refresh(); showSiteEditor(site.id); toast("Trabajador quitado de la obra");
    } catch (error) { toast(error.message); }
  }));
}

function modal(content) {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="modal-backdrop"><section class="modal">${content}</section></div>`);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
  document.querySelector("#modal-backdrop").addEventListener("click", (event) => { if (event.target.id === "modal-backdrop") closeModal(); });
}
function closeModal() { document.querySelector("#modal-backdrop")?.remove(); }

function canEdit(record) {
  if (state.user.role === "admin") return true;
  const recordDate = dateParts(new Date(record.entry_at));
  return sundayOf(recordDate) >= addDays(sundayOf(dateParts()), -7);
}

function showWorkerRecords(workerId) {
  const worker = state.workers.find((item) => item.id === workerId);
  const records = state.records.filter((record) => record.worker_id === workerId);
  modal(`<div class="modal-header"><h2>${html(worker.name)}</h2><button class="close" data-close-modal aria-label="Cerrar">×</button></div><div class="modal-body"><div class="record-list">${records.map((record) => `<div class="record-item"><button data-person-record="${record.id}">${displayTime(record.entry_at)}</button><button data-person-record="${record.id}">${displayTime(record.exit_at)}</button><button class="remove" data-delete-record="${record.id}" aria-label="Eliminar">×</button></div>`).join("") || '<div class="empty">No hay registros para este día.</div>'}</div><p class="muted">Total: ${formatTime(totalMinutes(records))}</p></div>`);
  document.querySelectorAll("[data-person-record]").forEach((button) => button.addEventListener("click", () => { closeModal(); showRecordEditor(Number(button.dataset.personRecord)); }));
  document.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => deleteRecord(Number(button.dataset.deleteRecord))));
}

function auditValue(field, value) {
  if (value === null || value === undefined || value === "") return "Sin datos";
  if (field === "entry_at" || field === "exit_at" || field === "deleted_at") return displayDateTime(value);
  if (field === "worker_id") return workerName(value);
  if (field === "site_id") return siteName(value);
  return String(value);
}

function auditChanges(entry) {
  if (entry.action === "create") return "Se creó el registro.";
  const labels = { worker_id: "Trabajador", site_id: "Obra", entry_at: "Entrada", exit_at: "Salida", early_exit_reason: "Motivo", deleted_at: "Eliminación" };
  const changes = Object.keys(labels).filter((field) => entry.before?.[field] !== entry.after?.[field]);
  if (!changes.length) return "Se guardó el registro sin cambios visibles.";
  return `<ul>${changes.map((field) => `<li><strong>${labels[field]}:</strong> ${html(auditValue(field, entry.before?.[field]))} → ${html(auditValue(field, entry.after?.[field]))}</li>`).join("")}</ul>`;
}

function recordTimeline(history) {
  const labels = { create: "Registro creado", update: "Registro actualizado", delete: "Registro eliminado", close_shift: "Jornada cerrada" };
  return `<section class="audit-timeline"><h3>Historial del registro</h3>${history.map((entry) => `<article class="audit-event"><span class="audit-dot" aria-hidden="true"></span><div><strong>${labels[entry.action] || "Cambio registrado"}</strong><p>${html(entry.actor_username)} · ${html(displayDateTime(entry.created_at))}</p><div class="audit-changes">${auditChanges(entry)}</div></div></article>`).join("") || '<p class="muted">No hay eventos registrados.</p>'}</section>`;
}

async function showRecordEditor(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) return;
  const editable = canEdit(record);
  let history = [];
  if (state.user.role === "admin") {
    try { history = await api(`/api/v1/admin/records/${record.id}/history`); }
    catch (error) { toast(error.message); }
  }
  modal(`<div class="modal-header"><h2>Editar registro</h2><button class="close" data-close-modal aria-label="Cerrar">×</button></div><form class="modal-body" id="record-form"><p><strong>${html(workerName(record.worker_id))}</strong><br><span class="muted">${html(siteName(record.site_id))}</span></p>${editable ? `<div class="form-grid"><div class="field"><label for="entry">Entrada</label><input id="entry" name="entry" type="datetime-local" value="${localInput(record.entry_at)}" required></div><div class="field"><label for="exit">Salida</label><input id="exit" name="exit" type="datetime-local" value="${localInput(record.exit_at)}"></div></div><div class="field"><label for="reason">Motivo de salida anticipada (opcional)</label><textarea id="reason" name="reason" maxlength="500">${html(record.early_exit_reason || "")}</textarea></div><div class="modal-actions"><button class="secondary" type="button" data-close-modal>Cancelar</button><button class="primary" type="submit">Guardar cambios</button></div><div class="delete-row"><button class="danger" type="button" id="delete-record">Eliminar registro</button></div>` : '<div class="locked-note">Este registro está fuera del período de corrección permitido.</div>'}${state.user.role === "admin" ? recordTimeline(history) : ""}</form>`);
  if (!editable) return;
  document.querySelector("#record-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/api/v1/records/${record.id}`, { method: "PATCH", body: JSON.stringify({ entry_at: inputToIso(data.get("entry")), exit_at: inputToIso(data.get("exit")), early_exit_reason: data.get("reason") || null }) });
      closeModal(); toast("Registro actualizado"); await refresh();
    } catch (error) { toast(error.message); }
  });
  document.querySelector("#delete-record").addEventListener("click", () => deleteRecord(record.id));
}

async function deleteRecord(recordId) {
  if (!window.confirm("¿Eliminar este registro?")) return;
  try { await api(`/api/v1/records/${recordId}`, { method: "DELETE" }); closeModal(); toast("Registro eliminado"); await refresh(); }
  catch (error) { toast(error.message); }
}

async function boot() {
  try {
    state.user = await api("/api/v1/auth/me");
    state.settings = await api("/api/v1/settings");
    state.date = dateParts();
    state.view = state.user.role === "admin" ? "week" : "day";
    state.adminSection = "summary";
    state.selectedSiteId = state.user.site_ids?.[0] || state.user.site_id;
    await refresh();
  } catch { if (!state.user) renderLogin(); }
}

boot();
