const state = {
  people: [],
  sites: [],
  records: [],
  selectedDate: "",
  period: "day",
  grouping: "records",
  expandedGroups: new Set(),
};

const elements = {
  form: document.querySelector("#entry-form"),
  person: document.querySelector("#person"),
  site: document.querySelector("#site"),
  date: document.querySelector("#date"),
  time: document.querySelector("#time"),
  currentDate: document.querySelector("#current-date"),
  periodLabel: document.querySelector("#period-label"),
  previousPeriod: document.querySelector("#previous-period"),
  nextPeriod: document.querySelector("#next-period"),
  summaryTitle: document.querySelector("#summary-title"),
  alertSummary: document.querySelector("#alert-summary"),
  recordsHead: document.querySelector("#records-head"),
  recordsBody: document.querySelector("#records-body"),
  emptyState: document.querySelector("#empty-state"),
  lastRecord: document.querySelector("#last-record"),
  formMessage: document.querySelector("#form-message"),
};

const pad = (value) => String(value).padStart(2, "0");

const parseDate = (value) => new Date(`${value}T12:00:00`);

const toDateValue = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const shiftDate = (value, days) => {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return toDateValue(date);
};

const getToday = () => toDateValue(new Date());

const startOfWeek = (value) => {
  const date = parseDate(value);
  date.setDate(date.getDate() - date.getDay());
  return toDateValue(date);
};

const formatFullDate = (value) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDate(value));

const formatDayLabel = (value) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseDate(value));

const formatShortDate = (value) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parseDate(value));

const formatWeekLabel = (startValue, endValue) => {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  const month = new Intl.DateTimeFormat("es-AR", { month: "long" });

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} de ${month.format(end)}`;
  }

  return `${start.getDate()} de ${month.format(start)} – ${end.getDate()} de ${month.format(end)}`;
};

const toMinutes = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const getWorkedMinutes = (record) => {
  if (!record.entry || !record.exit) return null;
  const total = toMinutes(record.exit) - toMinutes(record.entry);
  return total >= 0 ? total : null;
};

const formatHours = (minutes) => {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours} h`;
  if (!hours) return `${remainder} min`;
  return `${hours} h ${remainder} min`;
};

const formatWorkdays = (minutes) => {
  const workdayMinutes = 8 * 60;
  const days = Math.floor(minutes / workdayMinutes);
  const remainingAfterDays = minutes % workdayMinutes;
  const hours = Math.floor(remainingAfterDays / 60);
  const remainingMinutes = remainingAfterDays % 60;
  const parts = [];

  if (days) parts.push(`${days} ${days === 1 ? "día" : "días"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  if (remainingMinutes || !parts.length) {
    parts.push(`${remainingMinutes} ${remainingMinutes === 1 ? "minuto" : "minutos"}`);
  }

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
};

const getPeriodBounds = () => {
  if (state.period === "day") {
    return { start: state.selectedDate, end: state.selectedDate };
  }

  const start = startOfWeek(state.selectedDate);
  return { start, end: shiftDate(start, 6) };
};

const getRecordsInPeriod = () => {
  const { start, end } = getPeriodBounds();
  return state.records
    .filter((record) => record.date >= start && record.date <= end)
    .sort((a, b) => `${a.date}${a.entry}`.localeCompare(`${b.date}${b.entry}`));
};

const getRecordStatus = (record, records) => {
  if (!record.exit) return { key: "missing", label: "Falta salida" };

  const entry = toMinutes(record.entry);
  const exit = toMinutes(record.exit);
  const overlaps = records.some((candidate) => {
    if (
      candidate.id === record.id ||
      candidate.personId !== record.personId ||
      candidate.date !== record.date ||
      !candidate.exit
    ) return false;

    return entry < toMinutes(candidate.exit) && toMinutes(candidate.entry) < exit;
  });

  return overlaps
    ? { key: "overlap", label: "Horarios solapados" }
    : { key: "complete", label: "Completo" };
};

const getAlertCount = (evaluatedRecords) => {
  const missing = evaluatedRecords.filter(({ status }) => status.key === "missing").length;
  const overlaps = new Set(
    evaluatedRecords
      .filter(({ status }) => status.key === "overlap")
      .map(({ record }) => `${record.date}:${record.personId}`),
  );
  return missing + overlaps.size;
};

const populateSelect = (select, items) => {
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  });
};

const renderLastRecord = () => {
  const personId = elements.person.value;
  if (!personId) {
    elements.lastRecord.textContent = "";
    return;
  }

  const last = [...state.records]
    .filter((record) => record.personId === personId)
    .sort((a, b) => `${b.date}${b.exit || b.entry}`.localeCompare(`${a.date}${a.exit || a.entry}`))[0];

  if (!last) {
    elements.lastRecord.textContent = "Sin registros anteriores.";
    return;
  }

  const site = state.sites.find((item) => item.id === last.siteId)?.name;
  const movement = last.exit ? `salida ${last.exit}` : `entrada ${last.entry}`;
  elements.lastRecord.textContent = `Último registro: ${movement} · ${site} · ${last.date}`;
};

const makeStatus = (status) => {
  const statusText = document.createElement("span");
  statusText.className = `status status-${status.key}`;
  statusText.textContent = status.label;
  return statusText;
};

const appendCell = (row, label, value, className = "") => {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  if (value instanceof Node) cell.append(value);
  else cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
};

const renderHead = (labels) => {
  const row = document.createElement("tr");
  labels.forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    row.append(cell);
  });
  elements.recordsHead.replaceChildren(row);
};

const renderDetailedRecords = (evaluatedRecords) => {
  const isWeek = state.period === "week";
  const labels = isWeek
    ? ["Fecha", "Persona", "Obra", "Entrada", "Salida", "Estado", "Horas"]
    : ["Persona", "Obra", "Entrada", "Salida", "Estado", "Horas"];
  renderHead(labels);

  evaluatedRecords.forEach(({ record, status }) => {
    const person = state.people.find((item) => item.id === record.personId)?.name ?? "—";
    const site = state.sites.find((item) => item.id === record.siteId)?.name ?? "—";
    const row = document.createElement("tr");
    if (status.key === "missing") row.className = "has-warning";
    if (status.key === "overlap") row.className = "has-danger";

    if (isWeek) appendCell(row, "Fecha", formatShortDate(record.date));
    appendCell(row, "Persona", person, "person-name");
    appendCell(row, "Obra", site);
    appendCell(row, "Entrada", record.entry || "—");
    appendCell(row, "Salida", record.exit || "—");
    appendCell(row, "Estado", makeStatus(status));
    appendCell(row, "Horas", formatHours(getWorkedMinutes(record)), "worked-hours");
    elements.recordsBody.append(row);
  });
};

const getAggregateStatus = (items) => {
  const overlapCount = items.filter(({ status }) => status.key === "overlap").length;
  const missingCount = items.filter(({ status }) => status.key === "missing").length;

  if (overlapCount) {
    return {
      key: "overlap",
      label: `${overlapCount} ${overlapCount === 1 ? "conflicto" : "conflictos"}`,
    };
  }
  if (missingCount) {
    return {
      key: "missing",
      label: `${missingCount} ${missingCount === 1 ? "pendiente" : "pendientes"}`,
    };
  }
  return { key: "complete", label: "Completo" };
};

const makeAggregateToggle = (name, groupKey, expanded) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "aggregate-toggle";
  button.setAttribute("aria-expanded", String(expanded));
  button.innerHTML = `
    <span>${name}</span>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>`;
  button.addEventListener("click", () => {
    if (state.expandedGroups.has(groupKey)) state.expandedGroups.delete(groupKey);
    else state.expandedGroups.add(groupKey);
    renderSummary();
  });
  return button;
};

const makeAggregateDetail = (items, byPeople) => {
  const relatedGroups = new Map();
  items.forEach((item) => {
    const key = byPeople ? item.record.siteId : item.record.personId;
    if (!relatedGroups.has(key)) relatedGroups.set(key, []);
    relatedGroups.get(key).push(item);
  });

  const relatedItems = byPeople ? state.sites : state.people;
  const relatedLabel = byPeople ? "Obra" : "Persona";
  const detailRow = document.createElement("tr");
  detailRow.className = "aggregate-detail-row";
  const detailCell = document.createElement("td");
  detailCell.colSpan = 5;
  detailCell.dataset.label = "Detalle";

  const wrapper = document.createElement("div");
  wrapper.className = "aggregate-detail";
  const table = document.createElement("table");
  table.className = "detail-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  [relatedLabel, "Días", "Horas", "Estado"].forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  });
  head.append(headRow);
  const body = document.createElement("tbody");

  [...relatedGroups.entries()]
    .sort(([a], [b]) => relatedItems.findIndex((item) => item.id === a) - relatedItems.findIndex((item) => item.id === b))
    .forEach(([key, relatedRecords]) => {
      const name = relatedItems.find((item) => item.id === key)?.name ?? "—";
      const minutes = relatedRecords.reduce((total, { record }) => total + (getWorkedMinutes(record) ?? 0), 0);
      const status = getAggregateStatus(relatedRecords);
      const row = document.createElement("tr");
      if (status.key === "missing") row.className = "has-warning";
      if (status.key === "overlap") row.className = "has-danger";
      appendCell(row, relatedLabel, name, "detail-name");
      appendCell(row, "Días", formatWorkdays(minutes));
      appendCell(row, "Horas", formatHours(minutes), "worked-hours");
      appendCell(row, "Estado", makeStatus(status));
      body.append(row);
    });

  table.append(head, body);
  wrapper.append(table);
  detailCell.append(wrapper);
  detailRow.append(detailCell);
  return detailRow;
};

const renderAggregates = (evaluatedRecords) => {
  const byPeople = state.grouping === "people";
  const groups = new Map();

  evaluatedRecords.forEach((item) => {
    const key = byPeople ? item.record.personId : item.record.siteId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const labels = byPeople
    ? ["Persona", "Obras", "Días", "Horas", "Estado"]
    : ["Obra", "Personas", "Días", "Horas", "Estado"];
  renderHead(labels);

  const order = (byPeople ? state.people : state.sites).map((item) => item.id);
  [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .forEach(([key, items]) => {
      const name = (byPeople ? state.people : state.sites).find((item) => item.id === key)?.name ?? "—";
      const related = new Set(
        items.map(({ record }) => (byPeople ? record.siteId : record.personId)),
      ).size;
      const minutes = items.reduce((total, { record }) => total + (getWorkedMinutes(record) ?? 0), 0);
      const status = getAggregateStatus(items);
      const row = document.createElement("tr");
      const groupKey = `${state.grouping}:${key}`;
      const expanded = state.expandedGroups.has(groupKey);
      if (status.key === "missing") row.className = "has-warning";
      if (status.key === "overlap") row.className = "has-danger";

      appendCell(row, labels[0], makeAggregateToggle(name, groupKey, expanded), "person-name");
      appendCell(row, labels[1], `${related} ${related === 1 ? labels[1].slice(0, -1).toLowerCase() : labels[1].toLowerCase()}`);
      appendCell(row, "Días", formatWorkdays(minutes));
      appendCell(row, "Horas", formatHours(minutes), "worked-hours");
      appendCell(row, "Estado", makeStatus(status));
      elements.recordsBody.append(row);
      if (expanded) elements.recordsBody.append(makeAggregateDetail(items, byPeople));
    });
};

const renderSummary = () => {
  const records = getRecordsInPeriod();
  const evaluatedRecords = records.map((record) => ({
    record,
    status: getRecordStatus(record, records),
  }));
  const { start, end } = getPeriodBounds();

  elements.periodLabel.textContent = state.period === "day"
    ? formatDayLabel(start)
    : formatWeekLabel(start, end);

  const periodTitle = state.period === "day" ? "Resumen del día" : "Resumen semanal";
  const groupingTitle = state.grouping === "people"
    ? " por persona"
    : state.grouping === "sites"
      ? " por obra"
      : "";
  elements.summaryTitle.textContent = `${periodTitle}${groupingTitle}`;

  const alertCount = getAlertCount(evaluatedRecords);
  elements.alertSummary.textContent = alertCount
    ? `${alertCount} ${alertCount === 1 ? "alerta" : "alertas"} para revisar`
    : "Sin alertas";
  elements.alertSummary.classList.toggle("no-alerts", alertCount === 0);

  elements.recordsBody.replaceChildren();
  elements.emptyState.hidden = evaluatedRecords.length > 0;
  elements.recordsHead.hidden = evaluatedRecords.length === 0;

  if (state.grouping === "records") renderDetailedRecords(evaluatedRecords);
  else renderAggregates(evaluatedRecords);
};

const showFormMessage = (message, type) => {
  elements.formMessage.textContent = message;
  elements.formMessage.className = `form-message is-${type}`;
};

const handleSubmit = (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const personId = formData.get("person");
  const siteId = formData.get("site");
  const type = formData.get("type");
  const date = formData.get("date");
  const time = formData.get("time");

  if (type === "entrada") {
    state.records.push({
      id: crypto.randomUUID(),
      personId,
      siteId,
      date,
      entry: time,
      exit: null,
    });
  } else {
    const openRecord = [...state.records]
      .reverse()
      .find((record) => record.personId === personId && record.siteId === siteId && record.date === date && !record.exit);

    if (!openRecord) {
      showFormMessage("No hay una entrada abierta para esta persona en esta obra.", "error");
      return;
    }

    openRecord.exit = time;
  }

  state.selectedDate = date;
  showFormMessage("Registro guardado en esta prueba.", "success");
  renderLastRecord();
  renderSummary();
};

const navigatePeriod = (direction) => {
  const step = state.period === "day" ? 1 : 7;
  state.selectedDate = shiftDate(state.selectedDate, direction * step);
  elements.date.value = state.selectedDate;
  renderSummary();
};

const init = async () => {
  try {
    const response = await fetch("data/mock-data.json");
    if (!response.ok) throw new Error("No se pudieron cargar los datos mock.");
    const data = await response.json();
    Object.assign(state, data);

    populateSelect(elements.person, state.people);
    populateSelect(elements.site, state.sites);

    const today = getToday();
    state.selectedDate = state.initialDate || today;
    elements.currentDate.textContent = formatFullDate(today);
    elements.date.value = state.selectedDate;
    elements.time.value = "08:00";

    elements.person.addEventListener("change", renderLastRecord);
    elements.date.addEventListener("change", () => {
      state.selectedDate = elements.date.value;
      renderSummary();
    });
    elements.previousPeriod.addEventListener("click", () => navigatePeriod(-1));
    elements.nextPeriod.addEventListener("click", () => navigatePeriod(1));
    elements.form.addEventListener("submit", handleSubmit);

    document.querySelectorAll('input[name="period"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.period = input.value;
        renderSummary();
      });
    });

    document.querySelectorAll('input[name="grouping"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.grouping = input.value;
        renderSummary();
      });
    });

    renderSummary();
  } catch (error) {
    showFormMessage(error.message, "error");
  }
};

init();
