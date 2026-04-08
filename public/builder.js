const FILTER_OPERATORS = [
	{ value: "=", label: "=" },
	{ value: "!=", label: "!=" },
	{ value: ">", label: ">" },
	{ value: ">=", label: ">=" },
	{ value: "<", label: "<" },
	{ value: "<=", label: "<=" },
	{ value: "LIKE", label: "LIKE" },
	{ value: "IS NULL", label: "IS NULL" },
	{ value: "IS NOT NULL", label: "IS NOT NULL" },
];

const SORT_DIRECTIONS = ["ASC", "DESC"];

function compareNames(left, right) {
	return left.localeCompare(right);
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function createEmptyState() {
	return {
		baseTable: "",
		selectedTableNames: [],
		selectedEdgeIds: [],
		joinTypes: {},
		selectedColumns: [],
		filters: [],
		sorts: [],
		generatedSql: "",
		manualSyncPaused: false,
	};
}

export function createVisualSqlBuilder({
	elements,
	apiGet,
	setTargetInputValue,
	copyText,
	graphPath,
	targetLabel,
}) {
	let graph = { tables: [], foreignKeys: [], generatedAt: "" };
	let state = createEmptyState();
	let lastInjectedSql = "";

	function setSyncStatus(message, type = "info") {
		elements.builderSyncStatus.textContent = message;
		elements.builderSyncStatus.className = `builder-sync-status ${type}`;
	}

	function getTableByName(name) {
		return graph.tables.find((table) => table.name === name) ?? null;
	}

	function getEdgeById(edgeId) {
		return graph.foreignKeys.find((edge) => edge.id === edgeId) ?? null;
	}

	function qualifiedColumn(tableName, columnName) {
		return `${tableName}.${columnName}`;
	}

	function getAvailableColumns() {
		return state.selectedTableNames
			.slice()
			.sort(compareNames)
			.flatMap((tableName) => {
				const table = getTableByName(tableName);
				if (!table) return [];
				return table.columns.map((column) => ({
					key: qualifiedColumn(tableName, column.name),
					label: `${tableName}.${column.name}`,
				}));
			});
	}

	function buildAdjacency() {
		const adjacency = new Map();
		for (const edge of graph.foreignKeys) {
			if (!adjacency.has(edge.fromTable)) adjacency.set(edge.fromTable, []);
			if (!adjacency.has(edge.toTable)) adjacency.set(edge.toTable, []);
			adjacency
				.get(edge.fromTable)
				.push({ edgeId: edge.id, target: edge.toTable });
			adjacency
				.get(edge.toTable)
				.push({ edgeId: edge.id, target: edge.fromTable });
		}

		for (const [key, value] of adjacency.entries()) {
			value.sort((left, right) => {
				const tableDiff = left.target.localeCompare(right.target);
				return tableDiff !== 0
					? tableDiff
					: left.edgeId.localeCompare(right.edgeId);
			});
			adjacency.set(key, value);
		}

		return adjacency;
	}

	function findPath(targetTable) {
		if (!state.baseTable || targetTable === state.baseTable) return [];
		const adjacency = buildAdjacency();
		const queue = [{ tableName: state.baseTable, path: [] }];
		const visited = new Set([state.baseTable]);

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;
			if (current.tableName === targetTable) return current.path;

			for (const neighbor of adjacency.get(current.tableName) ?? []) {
				if (visited.has(neighbor.target)) continue;
				visited.add(neighbor.target);
				queue.push({
					tableName: neighbor.target,
					path: [...current.path, neighbor.edgeId],
				});
			}
		}

		return null;
	}

	function collectSelectedTables() {
		const selected = new Set(state.baseTable ? [state.baseTable] : []);
		for (const edgeId of state.selectedEdgeIds) {
			const edge = getEdgeById(edgeId);
			if (!edge) continue;
			selected.add(edge.fromTable);
			selected.add(edge.toTable);
		}
		state.selectedTableNames = Array.from(selected).sort(compareNames);
	}

	function reconcileState() {
		const validTableNames = new Set(graph.tables.map((table) => table.name));
		const validEdgeIds = new Set(graph.foreignKeys.map((edge) => edge.id));

		if (!validTableNames.has(state.baseTable)) {
			state = createEmptyState();
			state.baseTable = graph.tables[0]?.name ?? "";
		}

		state.selectedEdgeIds = state.selectedEdgeIds.filter((edgeId) =>
			validEdgeIds.has(edgeId),
		);
		const nextJoinTypes = {};
		for (const edgeId of state.selectedEdgeIds) {
			nextJoinTypes[edgeId] =
				state.joinTypes[edgeId] === "LEFT JOIN" ? "LEFT JOIN" : "INNER JOIN";
		}
		state.joinTypes = nextJoinTypes;
		collectSelectedTables();

		const validColumns = new Set(
			getAvailableColumns().map((column) => column.key),
		);
		state.selectedColumns = state.selectedColumns.filter((key) =>
			validColumns.has(key),
		);
		state.filters = state.filters.filter((item) =>
			validColumns.has(item.columnKey),
		);
		state.sorts = state.sorts.filter((item) =>
			validColumns.has(item.columnKey),
		);
	}

	function resetState(
		message = "Builder reset for the current playground schema.",
	) {
		state = createEmptyState();
		state.baseTable = graph.tables[0]?.name ?? "";
		collectSelectedTables();
		render();
		setSyncStatus(message, "info");
	}

	function renderBaseTable() {
		elements.builderBaseTable.innerHTML = graph.tables
			.map(
				(table) =>
					`<option value="${escapeHtml(table.name)}" ${
						table.name === state.baseTable ? "selected" : ""
					}>${escapeHtml(table.name)}</option>`,
			)
			.join("");
	}

	function describeEdge(edge) {
		return `${edge.fromTable}.${edge.fromColumn} -> ${edge.toTable}.${edge.toColumn}`;
	}

	function renderRelations() {
		if (graph.tables.length === 0) {
			elements.builderRelations.innerHTML = `<p class="builder-empty-copy">No user tables are available in the playground right now.</p>`;
			return;
		}

		const html = graph.tables
			.slice()
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((table) => {
				const links = graph.foreignKeys
					.filter(
						(edge) =>
							edge.fromTable === table.name || edge.toTable === table.name,
					)
					.sort((left, right) =>
						describeEdge(left).localeCompare(describeEdge(right)),
					);

				const linkHtml =
					links.length > 0
						? links
								.map((edge) => {
									const connected = state.selectedTableNames.includes(
										table.name,
									);
									const path =
										state.baseTable && table.name !== state.baseTable
											? findPath(table.name)
											: null;
									const disabled =
										table.name === state.baseTable ||
										connected ||
										path === null;
									return `<div class="builder-link">
                    <div class="builder-link-meta">
                      <div class="builder-link-path">${escapeHtml(describeEdge(edge))}</div>
                      <div class="builder-link-copy">Reachable from base: ${path === null ? "No" : "Yes"}</div>
                    </div>
                    <button class="btn btn--mini builder-connect-btn" type="button" data-table-name="${escapeHtml(
											table.name,
										)}" ${disabled ? "disabled" : ""}>${escapeHtml(
											connected
												? "Selected"
												: path === null
													? "No Path"
													: "Connect",
										)}</button>
                  </div>`;
								})
								.join("")
						: `<p class="builder-empty-copy">No foreign-key relationships from this table.</p>`;

				const columnSummary = table.columns
					.map((column) => column.name)
					.join(", ");

				return `<article class="builder-table ${
					state.selectedTableNames.includes(table.name) ? "is-selected" : ""
				}">
          <div class="builder-table-head">
            <h6 class="builder-table-title">${escapeHtml(table.name)}</h6>
            <span class="builder-chip ${
							table.name === state.baseTable ? "is-active" : ""
						}">${escapeHtml(
							table.name === state.baseTable
								? "Base table"
								: state.selectedTableNames.includes(table.name)
									? "Included"
									: "Available",
						)}</span>
          </div>
          <p class="builder-copy">${escapeHtml(columnSummary || "No columns")}</p>
          <div class="builder-table-links">${linkHtml}</div>
        </article>`;
			})
			.join("");

		elements.builderRelations.innerHTML = html;
	}

	function renderSelectedJoins() {
		if (state.selectedEdgeIds.length === 0) {
			elements.builderSelectedJoins.innerHTML = `<p class="builder-empty-copy">No joins selected yet. Connect a related table from the relationship map.</p>`;
			return;
		}

		elements.builderSelectedJoins.innerHTML = state.selectedEdgeIds
			.map((edgeId) => {
				const edge = getEdgeById(edgeId);
				if (!edge) return "";
				const joinType = state.joinTypes[edgeId] ?? "INNER JOIN";
				return `<div class="builder-row">
          <div class="builder-row-head">
            <h6 class="builder-row-title">${escapeHtml(joinType)}</h6>
            <button class="btn btn--mini builder-remove-edge-btn" type="button" data-edge-id="${escapeHtml(
							edgeId,
						)}">Remove</button>
          </div>
          <div class="builder-join-meta">
            <div class="builder-join-path">${escapeHtml(describeEdge(edge))}</div>
            <div class="builder-join-copy">Default is INNER JOIN, but you can widen it to LEFT JOIN.</div>
          </div>
          <div class="builder-row-fields">
            <label class="builder-label">Join Type
              <select class="builder-select builder-join-type-select" data-edge-id="${escapeHtml(edgeId)}">
                <option value="INNER JOIN" ${joinType === "INNER JOIN" ? "selected" : ""}>INNER JOIN</option>
                <option value="LEFT JOIN" ${joinType === "LEFT JOIN" ? "selected" : ""}>LEFT JOIN</option>
              </select>
            </label>
          </div>
        </div>`;
			})
			.join("");
	}

	function renderColumns() {
		if (state.selectedTableNames.length === 0) {
			elements.builderColumns.innerHTML = `<p class="builder-empty-copy">Choose a base table first.</p>`;
			return;
		}

		elements.builderColumns.innerHTML = state.selectedTableNames
			.map((tableName) => {
				const table = getTableByName(tableName);
				if (!table) return "";
				const items = table.columns
					.map((column) => {
						const key = qualifiedColumn(tableName, column.name);
						return `<label class="builder-checkbox">
              <input class="builder-column-checkbox" type="checkbox" data-column-key="${escapeHtml(key)}" ${
								state.selectedColumns.includes(key) ? "checked" : ""
							} />
              <span>${escapeHtml(column.name)} <span class="muted">(${escapeHtml(column.type || "TEXT")})</span></span>
            </label>`;
					})
					.join("");
				return `<div class="builder-column-group">
          <div class="builder-row-head">
            <h6 class="builder-row-title">${escapeHtml(tableName)}</h6>
            <span class="builder-chip ${tableName === state.baseTable ? "is-active" : ""}">${escapeHtml(
							tableName === state.baseTable ? "Base" : "Joined",
						)}</span>
          </div>
          <div class="builder-column-list">${items}</div>
        </div>`;
			})
			.join("");
	}

	function renderFilters() {
		const columns = getAvailableColumns();
		if (columns.length === 0) {
			elements.builderFilters.innerHTML = `<p class="builder-empty-copy">Select a base table and connected tables before adding filters.</p>`;
			return;
		}
		if (state.filters.length === 0) {
			elements.builderFilters.innerHTML = `<p class="builder-empty-copy">No filters yet. Add one to build a WHERE clause.</p>`;
			return;
		}

		elements.builderFilters.innerHTML = state.filters
			.map((filter) => {
				const hideValue =
					filter.operator === "IS NULL" || filter.operator === "IS NOT NULL";
				return `<div class="builder-row">
          <div class="builder-row-head">
            <h6 class="builder-row-title">Filter</h6>
            <button class="btn btn--mini builder-remove-filter-btn" type="button" data-filter-id="${escapeHtml(
							filter.id,
						)}">Remove</button>
          </div>
          <div class="builder-row-fields builder-row-fields--triple">
            <label class="builder-label">Column
              <select class="builder-select builder-filter-column-select" data-filter-id="${escapeHtml(filter.id)}">
                ${columns
									.map(
										(column) =>
											`<option value="${escapeHtml(column.key)}" ${
												column.key === filter.columnKey ? "selected" : ""
											}>${escapeHtml(column.label)}</option>`,
									)
									.join("")}
              </select>
            </label>
            <label class="builder-label">Operator
              <select class="builder-select builder-filter-operator-select" data-filter-id="${escapeHtml(filter.id)}">
                ${FILTER_OPERATORS.map(
									(operator) =>
										`<option value="${escapeHtml(operator.value)}" ${
											operator.value === filter.operator ? "selected" : ""
										}>${escapeHtml(operator.label)}</option>`,
								).join("")}
              </select>
            </label>
            <label class="builder-label">Value
              <input class="builder-input builder-filter-value-input" data-filter-id="${escapeHtml(
								filter.id,
							)}" value="${escapeHtml(filter.value ?? "")}" ${hideValue ? "disabled" : ""} />
            </label>
          </div>
        </div>`;
			})
			.join("");
	}

	function renderSorts() {
		const columns = getAvailableColumns();
		if (columns.length === 0) {
			elements.builderSorts.innerHTML = `<p class="builder-empty-copy">Select columns from connected tables before adding sort rules.</p>`;
			return;
		}
		if (state.sorts.length === 0) {
			elements.builderSorts.innerHTML = `<p class="builder-empty-copy">No sort rules yet. Add one to build ORDER BY.</p>`;
			return;
		}

		elements.builderSorts.innerHTML = state.sorts
			.map((sort) => {
				return `<div class="builder-row">
          <div class="builder-row-head">
            <h6 class="builder-row-title">Sort Rule</h6>
            <button class="btn btn--mini builder-remove-sort-btn" type="button" data-sort-id="${escapeHtml(
							sort.id,
						)}">Remove</button>
          </div>
          <div class="builder-row-fields">
            <label class="builder-label">Column
              <select class="builder-select builder-sort-column-select" data-sort-id="${escapeHtml(sort.id)}">
                ${columns
									.map(
										(column) =>
											`<option value="${escapeHtml(column.key)}" ${
												column.key === sort.columnKey ? "selected" : ""
											}>${escapeHtml(column.label)}</option>`,
									)
									.join("")}
              </select>
            </label>
            <label class="builder-label">Direction
              <select class="builder-select builder-sort-direction-select" data-sort-id="${escapeHtml(sort.id)}">
                ${SORT_DIRECTIONS.map(
									(direction) =>
										`<option value="${direction}" ${direction === sort.direction ? "selected" : ""}>${direction}</option>`,
								).join("")}
              </select>
            </label>
          </div>
        </div>`;
			})
			.join("");
	}

	function renderPreview() {
		elements.builderSqlPreview.textContent =
			state.generatedSql ||
			"Choose a base table and connect related tables to generate SQL.";

		const messages = [];
		if (graph.tables.length === 0) {
			messages.push(
				"<strong>No tables found.</strong> Run or reset the playground to create a schema first.",
			);
		} else if (graph.foreignKeys.length === 0) {
			messages.push(
				"<strong>No foreign keys detected.</strong> The visual builder needs FK relationships to suggest joins.",
			);
		} else if (!state.baseTable) {
			messages.push(
				"<strong>Pick a base table.</strong> The generated query starts there.",
			);
		} else if (state.selectedColumns.length === 0) {
			messages.push(
				"<strong>Select output columns.</strong> The builder generates SQL once it knows what to project.",
			);
		} else {
			messages.push(
				`Generated SQL stays editable in the ${targetLabel}. Manual edits pause visual sync.`,
			);
		}
		elements.builderEmptyState.innerHTML = messages
			.map((message) => `<div class="builder-empty-copy">${message}</div>`)
			.join("");
	}

	function render() {
		reconcileState();
		renderBaseTable();
		renderRelations();
		renderSelectedJoins();
		renderColumns();
		renderFilters();
		renderSorts();
		renderPreview();
	}

	function connectTable(tableName) {
		if (!state.baseTable || tableName === state.baseTable) return;
		const path = findPath(tableName);
		if (!path) return;
		const nextEdgeIds = new Set(state.selectedEdgeIds);
		for (const edgeId of path) {
			nextEdgeIds.add(edgeId);
			if (!state.joinTypes[edgeId]) {
				state.joinTypes[edgeId] = "INNER JOIN";
			}
		}
		state.selectedEdgeIds = Array.from(nextEdgeIds).sort(compareNames);
		collectSelectedTables();
		render();
	}

	function addFilter() {
		const firstColumn = getAvailableColumns()[0];
		if (!firstColumn) return;
		state.filters.push({
			id: crypto.randomUUID(),
			columnKey: firstColumn.key,
			operator: "=",
			value: "",
		});
		render();
	}

	function addSort() {
		const firstColumn = getAvailableColumns()[0];
		if (!firstColumn) return;
		state.sorts.push({
			id: crypto.randomUUID(),
			columnKey: firstColumn.key,
			direction: "ASC",
		});
		render();
	}

	function quoteSqlValue(value) {
		const trimmed = String(value ?? "").trim();
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
		return `'${trimmed.replaceAll("'", "''")}'`;
	}

	function buildJoinSequence() {
		const sequence = [];
		const visited = new Set(state.baseTable ? [state.baseTable] : []);
		const remaining = new Set(state.selectedEdgeIds);

		while (remaining.size > 0) {
			let matched = null;
			for (const edgeId of Array.from(remaining).sort(compareNames)) {
				const edge = getEdgeById(edgeId);
				if (!edge) continue;
				const fromVisited = visited.has(edge.fromTable);
				const toVisited = visited.has(edge.toTable);
				if (fromVisited === toVisited) continue;
				matched = { edgeId, edge };
				break;
			}

			if (!matched) break;
			remaining.delete(matched.edgeId);
			const { edgeId, edge } = matched;

			if (visited.has(edge.fromTable) && !visited.has(edge.toTable)) {
				sequence.push({
					edgeId,
					joinTable: edge.toTable,
					leftExpression: `${edge.fromTable}.${edge.fromColumn}`,
					rightExpression: `${edge.toTable}.${edge.toColumn}`,
				});
				visited.add(edge.toTable);
			} else {
				sequence.push({
					edgeId,
					joinTable: edge.fromTable,
					leftExpression: `${edge.toTable}.${edge.toColumn}`,
					rightExpression: `${edge.fromTable}.${edge.fromColumn}`,
				});
				visited.add(edge.fromTable);
			}
		}

		return sequence;
	}

	function generateSql() {
		if (!state.baseTable) return "Choose a base table first.";
		if (state.selectedColumns.length === 0)
			return "Select at least one output column to generate SQL.";

		const lines = [
			"SELECT",
			state.selectedColumns
				.slice()
				.sort(compareNames)
				.map((column) => `  ${column}`)
				.join(",\n"),
			`FROM ${state.baseTable}`,
		];

		for (const join of buildJoinSequence()) {
			const joinType = state.joinTypes[join.edgeId] ?? "INNER JOIN";
			lines.push(
				`${joinType} ${join.joinTable} ON ${join.leftExpression} = ${join.rightExpression}`,
			);
		}

		const filters = state.filters.map((filter) => {
			if (filter.operator === "IS NULL" || filter.operator === "IS NOT NULL") {
				return `${filter.columnKey} ${filter.operator}`;
			}
			return `${filter.columnKey} ${filter.operator} ${quoteSqlValue(filter.value)}`;
		});
		if (filters.length > 0) {
			lines.push(`WHERE ${filters[0]}`);
			for (let index = 1; index < filters.length; index += 1) {
				lines.push(`  AND ${filters[index]}`);
			}
		}

		if (state.sorts.length > 0) {
			lines.push(
				`ORDER BY ${state.sorts.map((sort) => `${sort.columnKey} ${sort.direction}`).join(", ")}`,
			);
		}

		return `${lines.join("\n")};`;
	}

	async function loadGraph({ reset = false, message = "" } = {}) {
		const result = await apiGet(graphPath);
		if (!result.ok) {
			graph = {
				tables: [],
				foreignKeys: [],
				generatedAt: new Date().toISOString(),
			};
			render();
			setSyncStatus(result.message, "fail");
			return;
		}

		graph = result.graph;
		if (reset) {
			resetState(message || result.message);
		} else {
			render();
			setSyncStatus(message || result.message, "info");
		}
	}

	function handleManualInput(nextSql) {
		if (!lastInjectedSql || nextSql === lastInjectedSql) return;
		state.manualSyncPaused = true;
		setSyncStatus(
			"Manual edits detected. Visual sync paused until you generate and send SQL again.",
			"info",
		);
	}

	function bindEvents() {
		elements.builderBaseTable.addEventListener("change", (event) => {
			state = createEmptyState();
			state.baseTable = event.target.value;
			collectSelectedTables();
			render();
			setSyncStatus(
				"Base table changed. Reconnect related tables to generate SQL.",
				"info",
			);
		});

		elements.builderRelations.addEventListener("click", (event) => {
			const button = event.target.closest(".builder-connect-btn");
			if (!button) return;
			connectTable(button.dataset.tableName ?? "");
		});

		elements.builderSelectedJoins.addEventListener("change", (event) => {
			const select = event.target.closest(".builder-join-type-select");
			if (!select) return;
			state.joinTypes[select.dataset.edgeId] = select.value;
		});

		elements.builderSelectedJoins.addEventListener("click", (event) => {
			const button = event.target.closest(".builder-remove-edge-btn");
			if (!button) return;
			state.selectedEdgeIds = state.selectedEdgeIds.filter(
				(edgeId) => edgeId !== button.dataset.edgeId,
			);
			delete state.joinTypes[button.dataset.edgeId];
			collectSelectedTables();
			render();
		});

		elements.builderColumns.addEventListener("change", (event) => {
			const checkbox = event.target.closest(".builder-column-checkbox");
			if (!checkbox) return;
			const next = new Set(state.selectedColumns);
			if (checkbox.checked) next.add(checkbox.dataset.columnKey);
			else next.delete(checkbox.dataset.columnKey);
			state.selectedColumns = Array.from(next).sort(compareNames);
		});

		elements.builderAddFilterBtn.addEventListener("click", addFilter);
		elements.builderFilters.addEventListener("change", (event) => {
			const row = event.target.closest("[data-filter-id]");
			if (!row) return;
			const filter = state.filters.find(
				(item) => item.id === row.dataset.filterId,
			);
			if (!filter) return;
			if (event.target.matches(".builder-filter-column-select"))
				filter.columnKey = event.target.value;
			if (event.target.matches(".builder-filter-operator-select")) {
				filter.operator = event.target.value;
				render();
				return;
			}
			if (event.target.matches(".builder-filter-value-input"))
				filter.value = event.target.value;
		});
		elements.builderFilters.addEventListener("input", (event) => {
			const input = event.target.closest(".builder-filter-value-input");
			if (!input) return;
			const filter = state.filters.find(
				(item) => item.id === input.dataset.filterId,
			);
			if (filter) filter.value = input.value;
		});
		elements.builderFilters.addEventListener("click", (event) => {
			const button = event.target.closest(".builder-remove-filter-btn");
			if (!button) return;
			state.filters = state.filters.filter(
				(item) => item.id !== button.dataset.filterId,
			);
			render();
		});

		elements.builderAddSortBtn.addEventListener("click", addSort);
		elements.builderSorts.addEventListener("change", (event) => {
			const row = event.target.closest("[data-sort-id]");
			if (!row) return;
			const sort = state.sorts.find((item) => item.id === row.dataset.sortId);
			if (!sort) return;
			if (event.target.matches(".builder-sort-column-select"))
				sort.columnKey = event.target.value;
			if (event.target.matches(".builder-sort-direction-select"))
				sort.direction = event.target.value;
		});
		elements.builderSorts.addEventListener("click", (event) => {
			const button = event.target.closest(".builder-remove-sort-btn");
			if (!button) return;
			state.sorts = state.sorts.filter(
				(item) => item.id !== button.dataset.sortId,
			);
			render();
		});

		elements.builderGenerateBtn.addEventListener("click", () => {
			state.generatedSql = generateSql();
			renderPreview();
			setSyncStatus(
				"SQL generated from the current visual builder state.",
				"ok",
			);
		});

		elements.builderSendBtn.addEventListener("click", () => {
			if (!state.generatedSql) state.generatedSql = generateSql();
			setTargetInputValue(state.generatedSql);
			lastInjectedSql = state.generatedSql;
			state.manualSyncPaused = false;
			renderPreview();
			setSyncStatus(
				`Generated SQL sent to the ${targetLabel}. Manual edits will pause visual sync.`,
				"ok",
			);
		});

		elements.builderCopyBtn.addEventListener("click", async () => {
			if (!state.generatedSql) state.generatedSql = generateSql();
			await copyText(state.generatedSql);
			renderPreview();
			setSyncStatus("Generated SQL copied to the clipboard.", "ok");
		});

		elements.builderClearBtn.addEventListener("click", () => {
			resetState(
				"Builder cleared. Choose a base table and reconnect tables when ready.",
			);
		});
	}

	bindEvents();

	return {
		loadGraph,
		handleManualInput,
	};
}
