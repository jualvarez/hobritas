const state = {
  people: [],
  sites: [],
  records: [],
};

const elements = {
  form: document.querySelector("#entry-form"),
  person: document.querySelector("#person"),
  site: document.querySelector("#site"),
  date: document.querySelector("#date"),
  time: document.querySelector("#time"),
  currentDate: document.querySelector("#current-date"),
  alertSummary: document.querySelector("#alert-summary"),
  recordsBody: document.querySelector("#records-body"),
  emptyState: document.querySelector("#empty-state"),
  lastRecord: document.querySelector("#last-record"),
  formMessage: document.querySelector("#form-message"),
};

const formatLongDate = (dateValue) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateValue}T12:00:00Z`));

const getToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

const toMinutes = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const getRecordStatus = (record, recordsForDate) => {
  if (!record.exit) {
    return { key: "missing", label: "Falta salida" };
  }

  const entry = toMinutes(record.entry);
  const exit = toMinutes(record.exit);
  const overlaps = recordsForDate.some((candidate) => {
    if (candidate.id === record.id || candidate.personId !== record.personId || !candidate.exit) return false;
    const candidateEntry = toMinutes(candidate.entry);
    const candidateExit = toMinutes(candidate.exit);
    return entry < candidateExit && candidateEntry < exit;
  });

  if (overlaps) {
    return { key: "overlap", label: "Horarios solapados" };
  }

  return { key: "complete", label: "Completo" };
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

const renderSummary = () => {
  const selectedDate = elements.date.value;
  const recordsForDate = state.records
    .filter((record) => record.date === selectedDate)
    .sort((a, b) => a.entry.localeCompare(b.entry));

  elements.recordsBody.replaceChildren();
  elements.emptyState.hidden = recordsForDate.length > 0;

  const evaluatedRecords = recordsForDate.map((record) => ({
    record,
    status: getRecordStatus(record, recordsForDate),
  }));

  const missingCount = evaluatedRecords.filter(({ status }) => status.key === "missing").length;
  const overlappingPeople = new Set(
    evaluatedRecords
      .filter(({ status }) => status.key === "overlap")
      .map(({ record }) => record.personId),
  );
  const alertCount = missingCount + overlappingPeople.size;
  elements.alertSummary.textContent = alertCount
    ? `${alertCount} ${alertCount === 1 ? "alerta" : "alertas"} para revisar`
    : "Sin alertas";
  elements.alertSummary.classList.toggle("no-alerts", alertCount === 0);

  evaluatedRecords.forEach(({ record, status }) => {
    const person = state.people.find((item) => item.id === record.personId)?.name ?? "—";
    const site = state.sites.find((item) => item.id === record.siteId)?.name ?? "—";
    const row = document.createElement("tr");
    if (status.key === "missing") row.className = "has-warning";
    if (status.key === "overlap") row.className = "has-danger";

    const values = [
      ["Persona", person, "person-name"],
      ["Obra", site, ""],
      ["Entrada", record.entry || "—", ""],
      ["Salida", record.exit || "—", ""],
    ];

    values.forEach(([label, value, className]) => {
      const cell = document.createElement("td");
      cell.dataset.label = label;
      cell.textContent = value;
      if (className) cell.className = className;
      row.append(cell);
    });

    const statusCell = document.createElement("td");
    statusCell.dataset.label = "Estado";
    const statusText = document.createElement("span");
    statusText.className = `status status-${status.key}`;
    statusText.textContent = status.label;
    statusCell.append(statusText);
    row.append(statusCell);
    elements.recordsBody.append(row);
  });
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

  showFormMessage("Registro guardado en esta prueba.", "success");
  renderLastRecord();
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
    elements.currentDate.textContent = formatLongDate(today);
    elements.date.value = state.initialDate || today;
    elements.time.value = "08:00";

    elements.person.addEventListener("change", renderLastRecord);
    elements.date.addEventListener("change", renderSummary);
    elements.form.addEventListener("submit", handleSubmit);

    renderSummary();
  } catch (error) {
    showFormMessage(error.message, "error");
  }
};

init();
