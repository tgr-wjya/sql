import { createVisualSqlBuilder } from "/builder.js";

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
  playgroundInput: document.getElementById("playground-input"),
  playgroundRunBtn: document.getElementById("playground-run-btn"),
  playgroundSchemaBtn: document.getElementById("playground-schema-btn"),
  playgroundResetBtn: document.getElementById("playground-reset-btn"),
  playgroundStatus: document.getElementById("playground-status"),
  playgroundResultWrap: document.getElementById("playground-result-wrap"),
  playgroundSchemaView: document.getElementById("playground-schema-view"),
  builderBaseTable: document.getElementById("builder-base-table"),
  builderRelations: document.getElementById("builder-relations"),
  builderSelectedJoins: document.getElementById("builder-selected-joins"),
  builderColumns: document.getElementById("builder-columns"),
  builderFilters: document.getElementById("builder-filters"),
  builderSorts: document.getElementById("builder-sorts"),
  builderGenerateBtn: document.getElementById("builder-generate-btn"),
  builderSendBtn: document.getElementById("builder-send-btn"),
  builderCopyBtn: document.getElementById("builder-copy-btn"),
  builderClearBtn: document.getElementById("builder-clear-btn"),
  builderAddFilterBtn: document.getElementById("builder-add-filter-btn"),
  builderAddSortBtn: document.getElementById("builder-add-sort-btn"),
  builderSqlPreview: document.getElementById("builder-sql-preview"),
  builderEmptyState: document.getElementById("builder-empty-state"),
  builderSyncStatus: document.getElementById("builder-sync-status"),
};

let snapshot = null;
let lastObjectiveKey = null;
let suppressPlaygroundInputEvent = false;
let suppressSqlInputEvent = false;

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
}

function setPlaygroundStatus(message, type = "info") {
  elements.playgroundStatus.textContent = message;
  elements.playgroundStatus.className = `status ${type}`;
}

function setPlaygroundInputValue(value) {
  suppressPlaygroundInputEvent = true;
  elements.playgroundInput.value = value;
  suppressPlaygroundInputEvent = false;
}

function setSqlInputValue(value) {
  suppressSqlInputEvent = true;
  elements.sqlInput.value = value;
  suppressSqlInputEvent = false;
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

function renderPlaygroundResults(columns, rows) {
  if (!rows || rows.length === 0) {
    elements.playgroundResultWrap.innerHTML = `<p class="muted">Query returned no rows.</p>`;
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

  elements.playgroundResultWrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
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
    setSqlInputValue("");
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
      setSqlInputValue(current.starterSql);
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

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  document.body.append(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

function hasDdlKeyword(sql) {
  return /\b(CREATE|ALTER|DROP)\b/i.test(sql);
}

function pushHint(text) {
  if (!text) return;

  const item = document.createElement("div");
  item.className = "feed-item";
  item.textContent = text;
  elements.hintLog.prepend(item);
}

const builder = createVisualSqlBuilder({
  elements,
  apiGet,
  setTargetInputValue: setSqlInputValue,
  copyText,
  graphPath: "/api/graph",
  targetLabel: "objective editor",
});

async function boot() {
  const [state, playgroundState] = await Promise.all([
    apiGet("/api/state"),
    apiGet("/api/playground/state"),
  ]);
  renderSnapshot(state);
  if (playgroundState && playgroundState.ok) {
    const starter = playgroundState.starterSql?.trim();
    setPlaygroundInputValue(
      starter.length > 0
        ? starter
        : `-- The current objective did not provide starter SQL.
-- Use the playground to inspect and experiment with the mirrored schema.`,
    );
    setPlaygroundStatus(playgroundState.message, "info");
  } else {
    setPlaygroundInputValue(`-- Playground unavailable.
-- The current objective schema could not be loaded.`);
  }
  await builder.loadGraph({
    reset: true,
    message: "Builder ready for the current objective schema. Choose a base table and connect related tables to generate SQL.",
  });
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
  const playgroundState = await apiGet("/api/playground/state");
  if (playgroundState.ok) {
    const starter = playgroundState.starterSql?.trim();
    setPlaygroundInputValue(
      starter.length > 0
        ? starter
        : `-- The current objective did not provide starter SQL.
-- Use the playground to inspect and experiment with the mirrored schema.`,
    );
    setPlaygroundStatus(playgroundState.message, "info");
  }
  await builder.loadGraph({
    reset: true,
    message: "Builder refreshed for the current objective schema.",
  });
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
  const playgroundState = await apiGet("/api/playground/state");
  if (playgroundState.ok) {
    const starter = playgroundState.starterSql?.trim();
    setPlaygroundInputValue(
      starter.length > 0
        ? starter
        : `-- The current objective did not provide starter SQL.
-- Use the playground to inspect and experiment with the mirrored schema.`,
    );
    setPlaygroundStatus(playgroundState.message, "info");
  }
  await builder.loadGraph({
    reset: true,
    message: "Builder refreshed for the reset objective schema.",
  });
  setStatus("Progress reset.", "info");
});

elements.playgroundRunBtn.addEventListener("click", async () => {
  const sql = elements.playgroundInput.value;
  const result = await apiPost("/api/playground/run", { sql });

  renderPlaygroundResults(result.columns, result.rows);
  setPlaygroundStatus(result.message, result.ok ? "ok" : "fail");
});

elements.playgroundSchemaBtn.addEventListener("click", async () => {
  const result = await apiGet("/api/playground/schema");
  if (result.ok) {
    elements.playgroundSchemaView.textContent = result.schema || "Playground has no user tables right now.";
    setPlaygroundStatus(result.message, "info");
  } else {
    elements.playgroundSchemaView.textContent = result.message;
    setPlaygroundStatus(result.message, "fail");
  }
});

elements.playgroundResetBtn.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Reset the playground database back to the starter dataset? This also restores dropped tables.",
  );
  if (!confirmed) return;

  const result = await apiPost("/api/playground/reset");
  elements.playgroundResultWrap.innerHTML = `<p class="muted">Run playground SQL to inspect results.</p>`;
  elements.playgroundSchemaView.textContent =
    'Playground schema hidden. Use "View Playground Schema".';
  const starter = result.starterSql?.trim();
  setPlaygroundInputValue(
    starter.length > 0
      ? starter
      : `-- The current objective did not provide starter SQL.
-- Use the playground to inspect and experiment with the mirrored schema.`,
  );
  setPlaygroundStatus(result.message, result.ok ? "ok" : "fail");
});

elements.playgroundInput.addEventListener("input", () => {
  if (suppressPlaygroundInputEvent) return;
});

elements.sqlInput.addEventListener("input", () => {
  if (suppressSqlInputEvent) return;
  builder.handleManualInput(elements.sqlInput.value);
});

boot();
