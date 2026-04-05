const elements = {
  rank: document.getElementById("rank"),
  xp: document.getElementById("xp"),
  operationList: document.getElementById("operation-list"),
  operationLabel: document.getElementById("operation-label"),
  phaseLabel: document.getElementById("phase-label"),
  objectiveTitle: document.getElementById("objective-title"),
  objectiveNarrative: document.getElementById("objective-narrative"),
  acceptanceList: document.getElementById("acceptance-list"),
  sqlInput: document.getElementById("sql-input"),
  runBtn: document.getElementById("run-btn"),
  hintBtn: document.getElementById("hint-btn"),
  schemaBtn: document.getElementById("schema-btn"),
  advanceBtn: document.getElementById("advance-btn"),
  status: document.getElementById("status"),
  hintLog: document.getElementById("hint-log"),
  resultWrap: document.getElementById("result-wrap"),
  schemaView: document.getElementById("schema-view"),
  resetBtn: document.getElementById("reset-btn"),
};

let snapshot = null;
let lastObjectiveKey = null;

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderOperationList(campaign) {
  elements.operationList.innerHTML = campaign
    .map((node) => {
      const label = `${String(node.id).padStart(2, "0")} ${node.code} :: ${node.title}`;
      return `<li class="${node.status}">${escapeHtml(label)}</li>`;
    })
    .join("");
}

function renderResults(columns, rows) {
  if (!rows || rows.length === 0) {
    elements.resultWrap.innerHTML = `<p class="muted">Query returned no rows.</p>`;
    return;
  }

  const resolvedColumns =
    columns && columns.length > 0 ? columns : Object.keys(rows[0] ?? {});

  const head = resolvedColumns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");

  const body = rows
    .map((row) => {
      const cells = resolvedColumns
        .map((column) => {
          const value = row[column] ?? "NULL";
          return `<td>${escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  elements.resultWrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderSnapshot(nextSnapshot) {
  snapshot = nextSnapshot;

  elements.rank.textContent = snapshot.state.rank;
  elements.xp.textContent = String(snapshot.state.xp);
  renderOperationList(snapshot.campaign);

  if (snapshot.completed || !snapshot.current) {
    elements.operationLabel.textContent = "Campaign Complete";
    elements.phaseLabel.textContent = "Phase :: Complete";
    elements.objectiveTitle.textContent = "Case closed: DEAD SIGNAL";
    elements.objectiveNarrative.textContent =
      "You have completed every available operation. Reset to replay from OP-01.";
    elements.acceptanceList.innerHTML = "";
    elements.sqlInput.value = "";
    elements.sqlInput.disabled = true;
    elements.runBtn.disabled = true;
    elements.hintBtn.disabled = true;
    elements.schemaBtn.disabled = true;
    elements.advanceBtn.disabled = true;
    return;
  }

  elements.sqlInput.disabled = false;
  elements.runBtn.disabled = false;
  elements.hintBtn.disabled = false;
  elements.schemaBtn.disabled = false;
  elements.advanceBtn.disabled = false;

  const current = snapshot.current;
  const objectiveKey = `${current.operationId}:${current.objectiveId}`;

  elements.operationLabel.textContent = `Operation ${String(current.operationId).padStart(2, "0")} :: ${current.operationCode}`;
  elements.phaseLabel.textContent = `Phase :: ${current.objectivePhase} (${current.objectiveNumber}/${current.objectiveTotal})`;
  elements.objectiveTitle.textContent = current.objectiveTitle;
  elements.objectiveNarrative.textContent = `${current.narrative} Hints remaining: ${current.hintsRemaining}.`;
  elements.acceptanceList.innerHTML = (current.acceptance || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  if (objectiveKey !== lastObjectiveKey) {
    if (!elements.sqlInput.value.trim() && current.starterSql) {
      elements.sqlInput.value = current.starterSql;
    }
    lastObjectiveKey = objectiveKey;
  }

  if (current.solved) {
    setStatus("Objective solved. Advance when ready.", "ok");
  }
}

async function apiGet(path) {
  const response = await fetch(path);
  return response.json();
}

async function apiPost(path, body = undefined) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
  return response.json();
}

function pushHint(text) {
  if (!text) return;

  const item = document.createElement("div");
  item.className = "feed-item";
  item.textContent = text;
  elements.hintLog.prepend(item);
}

async function boot() {
  const state = await apiGet("/api/state");
  renderSnapshot(state);
  setStatus("Console synced. Submit SQL when ready.", "info");
}

elements.runBtn.addEventListener("click", async () => {
  const sql = elements.sqlInput.value;
  const result = await apiPost("/api/run", { sql });

  renderSnapshot(result.snapshot);
  renderResults(result.columns, result.rows);
  setStatus(result.message, result.passed ? "ok" : "fail");
});

elements.hintBtn.addEventListener("click", async () => {
  const result = await apiPost("/api/hint");
  renderSnapshot(result.snapshot);
  setStatus(result.message, result.hint ? "info" : "fail");
  pushHint(result.hint);
});

elements.schemaBtn.addEventListener("click", async () => {
  const result = await apiGet("/api/schema");
  if (result.ok) {
    elements.schemaView.textContent = result.schema || "No schema available.";
    setStatus("Schema loaded.", "info");
  } else {
    elements.schemaView.textContent = result.message;
    setStatus(result.message, "fail");
  }
});

elements.advanceBtn.addEventListener("click", async () => {
  const result = await apiPost("/api/advance");
  renderSnapshot(result.snapshot);
  setStatus(result.message, result.ok ? "ok" : "fail");
  elements.resultWrap.innerHTML = `<p class="muted">Run a query to inspect results.</p>`;
  elements.schemaView.textContent = 'Schema hidden. Use "View Schema".';
});

elements.resetBtn.addEventListener("click", async () => {
  const confirmed = window.confirm("Reset all XP and progression?");
  if (!confirmed) return;

  const next = await apiPost("/api/reset");
  lastObjectiveKey = null;
  elements.hintLog.innerHTML = "";
  elements.resultWrap.innerHTML = `<p class="muted">Run a query to inspect results.</p>`;
  elements.schemaView.textContent = 'Schema hidden. Use "View Schema".';
  renderSnapshot(next);
  setStatus("Progress reset.", "info");
});

boot();
