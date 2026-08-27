const state = {
  site: "",
  people: [],
  editingId: null,
  toastTimer: null,
};

const elements = {
  siteName: document.querySelector("#site-name"),
  currentDate: document.querySelector("#current-date"),
  crewSummary: document.querySelector("#crew-summary"),
  crewList: document.querySelector("#crew-list"),
  toast: document.querySelector("#toast"),
  dialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  dialogTitle: document.querySelector("#dialog-title"),
  editRecords: document.querySelector("#edit-records"),
  closeDialog: document.querySelector("#close-dialog"),
};

const formatDate = (date) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);

const currentTime = () =>
  new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

const timeToMinutes = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
};

const recordMinutes = (record) => {
  const entry = timeToMinutes(record.entry);
  const exit = timeToMinutes(record.exit || currentTime());
  if (entry === null || exit === null) return 0;
  return Math.max(0, exit - entry);
};

const personMinutes = (person) =>
  person.records.reduce((total, record) => total + recordMinutes(record), 0);

const formatDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} h`;
  return `${hours} h ${remainder} min`;
};

const activeRecord = (person) =>
  person.records.findLast((record) => record.entry && !record.exit);

const getStatus = (person) => {
  if (!person.records.length) return "pending";
  if (activeRecord(person)) return "working";
  return "finished";
};

const showToast = (message) => {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
};

const pencilIcon = () => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
    <path d="m14.5 7.5 3 3M4 20l4.5-1-3.5-3.5L4 20Z" />
  </svg>`;

const renderSummary = () => {
  const working = state.people.filter((person) => getStatus(person) === "working").length;
  elements.crewSummary.textContent = `${working} trabajando · ${state.people.length - working} sin turno activo`;
};

const renderRecordLines = (person) => {
  if (!person.records.length) return "";
  return `
    <span class="worker-records">
      ${person.records.map((record) => `
        <span class="worker-record">
          <span>${record.entry} → ${record.exit || "En curso"}</span>
          <span>${formatDuration(recordMinutes(record))}</span>
        </span>`).join("")}
    </span>
    <span class="worker-total">Total: ${formatDuration(personMinutes(person))}</span>`;
};

const renderCrew = () => {
  elements.crewList.replaceChildren();

  state.people.forEach((person) => {
    const status = getStatus(person);
    const row = document.createElement("li");
    row.className = `worker-row is-${status}`;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "worker-main";
    main.dataset.personId = person.id;

    const statusLabel = status === "pending"
      ? "Sin ingreso"
      : status === "working"
        ? "Ingreso confirmado"
        : "Sin turno activo";
    const hint = status === "working"
      ? "Tocar para marcar salida"
      : person.records.length
        ? "Tocar para marcar nuevo ingreso"
        : "Tocar para marcar ingreso";

    main.innerHTML = `
      <span class="worker-name">${person.name}</span>
      <span class="worker-state"><i class="state-dot"></i>${statusLabel}</span>
      ${renderRecordLines(person)}
      <span class="worker-hint">${hint}</span>`;
    main.addEventListener("click", () => handlePrimaryAction(person.id));
    row.append(main);

    if (person.records.length) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-button";
      edit.dataset.personId = person.id;
      edit.setAttribute("aria-label", `Editar registros de ${person.name}`);
      edit.innerHTML = pencilIcon();
      edit.addEventListener("click", () => openEditor(person.id));
      row.append(edit);
    }

    elements.crewList.append(row);
  });

  renderSummary();
};

const handlePrimaryAction = (personId) => {
  const person = state.people.find((item) => item.id === personId);
  const openRecord = activeRecord(person);

  if (openRecord) {
    openRecord.exit = currentTime();
    renderCrew();
    showToast(`Salida de ${person.name} registrada a las ${openRecord.exit}`);
    return;
  }

  const entry = currentTime();
  person.records.push({
    id: `${person.id}-${Date.now()}`,
    entry,
    exit: null,
    reason: "",
  });
  renderCrew();
  showToast(`Ingreso de ${person.name} registrado a las ${entry}`);
};

const renderEditor = () => {
  const person = state.people.find((item) => item.id === state.editingId);
  elements.dialogTitle.textContent = `Registros de ${person.name}`;
  elements.editRecords.replaceChildren();

  if (!person.records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-records";
    empty.textContent = "No hay registros cargados.";
    elements.editRecords.append(empty);
    return;
  }

  person.records.forEach((record, index) => {
    const item = document.createElement("article");
    item.className = "edit-record";
    item.dataset.recordId = record.id;
    item.innerHTML = `
      <div class="edit-record-header">
        <h3>Registro ${index + 1}</h3>
        <button type="button" class="delete-record" data-delete-record="${record.id}">Borrar registro</button>
      </div>
      <div class="time-fields">
        <label>
          <span>Ingreso</span>
          <input data-field="entry" type="time" value="${record.entry}" required aria-label="Editar ingreso del registro ${index + 1}" />
        </label>
        <label>
          <span>Salida</span>
          <input data-field="exit" type="time" value="${record.exit || ""}" aria-label="Editar salida del registro ${index + 1}" />
        </label>
      </div>
      <label class="reason-field" ${record.exit ? "" : "hidden"}>
        <span>Motivo de salida prematura (opcional)</span>
        <textarea data-field="reason" rows="2" placeholder="Ej. turno médico">${record.reason || ""}</textarea>
      </label>`;
    elements.editRecords.append(item);
  });

  elements.editRecords.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord));
  });
};

const openEditor = (personId) => {
  state.editingId = personId;
  renderEditor();
  elements.dialog.showModal();
};

const deleteRecord = (recordId) => {
  const person = state.people.find((item) => item.id === state.editingId);
  person.records = person.records.filter((record) => record.id !== recordId);
  renderEditor();
  renderCrew();
  showToast(`Registro de ${person.name} borrado`);
};

const saveChanges = (event) => {
  event.preventDefault();
  const person = state.people.find((item) => item.id === state.editingId);

  elements.editRecords.querySelectorAll(".edit-record").forEach((item) => {
    const record = person.records.find((candidate) => candidate.id === item.dataset.recordId);
    record.entry = item.querySelector('[data-field="entry"]').value;
    record.exit = item.querySelector('[data-field="exit"]').value || null;
    record.reason = item.querySelector('[data-field="reason"]').value.trim();
  });

  renderCrew();
  elements.dialog.close();
  showToast(`Cambios de ${person.name} guardados`);
};

const init = async () => {
  try {
    const response = await fetch("data/mock-data.json");
    if (!response.ok) throw new Error("No se pudieron cargar los datos mock.");
    const data = await response.json();
    Object.assign(state, data);

    elements.siteName.textContent = state.site;
    elements.currentDate.textContent = formatDate(new Date());
    elements.editForm.addEventListener("submit", saveChanges);
    elements.closeDialog.addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) elements.dialog.close();
    });
    renderCrew();
  } catch (error) {
    elements.crewSummary.textContent = error.message;
  }
};

init();
