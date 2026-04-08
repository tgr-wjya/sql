import { Database } from "bun:sqlite";

import { OPERATIONS } from "./operations";
import { ProgressStore } from "./progress";
import type {
	CampaignNode,
	GameState,
	Objective,
	ObjectivePhase,
	PlaygroundColumn,
	PlaygroundForeignKeyEdge,
	PlaygroundGraph,
	PlaygroundTableGraphNode,
	RunResponse,
	Snapshot,
	SqlRow,
} from "./types";

const HINT_PENALTY_XP = 15;

function objectiveKey(operationId: number, objectiveId: string): string {
	return `${operationId}:${objectiveId}`;
}

function resolveObjectivePhase(objective: Objective): ObjectivePhase {
	return objective.phase ?? "INVESTIGATE";
}

function splitSqlStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;

	for (let index = 0; index < sql.length; index += 1) {
		const char = sql[index] ?? "";
		const prev = sql[index - 1] ?? "";

		if (char === "'" && !inDouble && prev !== "\\") {
			inSingle = !inSingle;
			current += char;
			continue;
		}

		if (char === '"' && !inSingle && prev !== "\\") {
			inDouble = !inDouble;
			current += char;
			continue;
		}

		if (char === ";" && !inSingle && !inDouble) {
			const statement = current.trim();
			if (statement.length > 0) {
				statements.push(statement);
			}
			current = "";
			continue;
		}

		current += char;
	}

	const finalStatement = current.trim();
	if (finalStatement.length > 0) {
		statements.push(finalStatement);
	}

	return statements;
}

function firstKeyword(statement: string): string {
	const [token = ""] = statement.trim().split(/\s+/);
	return token.toUpperCase();
}

function isRowQuery(statement: string): boolean {
	const keyword = firstKeyword(statement);
	return (
		keyword === "SELECT" ||
		keyword === "WITH" ||
		keyword === "PRAGMA" ||
		keyword === "EXPLAIN"
	);
}

function extractColumns(rows: SqlRow[], fallback: string[]): string[] {
	if (fallback.length > 0) return [...fallback];
	const firstRow = rows[0];
	if (!firstRow) return [];
	return Object.keys(firstRow);
}

function normalizeValue(value: unknown): unknown {
	if (value === undefined) return null;
	if (value instanceof Uint8Array) return Array.from(value);
	if (typeof value === "number" && Number.isFinite(value)) {
		return Number(value.toFixed(6));
	}
	return value;
}

function valuesForColumns(row: SqlRow, columns: string[]): unknown[] {
	return columns.map((column) => normalizeValue(row[column]));
}

function compareResultSets(
	actualRows: SqlRow[],
	actualColumns: string[],
	expectedRows: SqlRow[],
	expectedColumns: string[],
	orderSensitive: boolean,
): { pass: boolean; detail: string } {
	const expectedCols =
		expectedColumns.length > 0
			? expectedColumns
			: extractColumns(expectedRows, []);
	const actualCols =
		actualColumns.length > 0 ? actualColumns : extractColumns(actualRows, []);

	if (expectedCols.length > 0 || actualCols.length > 0) {
		if (expectedCols.length !== actualCols.length) {
			return {
				pass: false,
				detail: `Expected ${expectedCols.length} columns, got ${actualCols.length}.`,
			};
		}

		for (let index = 0; index < expectedCols.length; index += 1) {
			const expected = expectedCols[index];
			const actual = actualCols[index];
			if (expected !== actual) {
				return {
					pass: false,
					detail: `Column mismatch at position ${index + 1}: expected '${expected}', got '${actual}'.`,
				};
			}
		}
	}

	if (actualRows.length !== expectedRows.length) {
		return {
			pass: false,
			detail: `Expected ${expectedRows.length} rows, got ${actualRows.length}.`,
		};
	}

	const columns = expectedCols.length > 0 ? expectedCols : actualCols;
	const actualValues = actualRows.map((row) => valuesForColumns(row, columns));
	const expectedValues = expectedRows.map((row) =>
		valuesForColumns(row, columns),
	);

	if (orderSensitive) {
		for (let index = 0; index < expectedValues.length; index += 1) {
			const expected = JSON.stringify(expectedValues[index]);
			const actual = JSON.stringify(actualValues[index]);
			if (expected !== actual) {
				return {
					pass: false,
					detail: `Row mismatch at row ${index + 1}.`,
				};
			}
		}
		return { pass: true, detail: "Exact match." };
	}

	const countMap = new Map<string, number>();

	for (const row of expectedValues) {
		const key = JSON.stringify(row);
		countMap.set(key, (countMap.get(key) ?? 0) + 1);
	}

	for (const row of actualValues) {
		const key = JSON.stringify(row);
		const count = countMap.get(key) ?? 0;
		if (count <= 0) {
			return {
				pass: false,
				detail: "Result set contains unexpected row values.",
			};
		}
		countMap.set(key, count - 1);
	}

	for (const count of countMap.values()) {
		if (count !== 0) {
			return {
				pass: false,
				detail: "Result set is missing one or more expected rows.",
			};
		}
	}

	return { pass: true, detail: "Result set matches." };
}

function executeSql(
	db: Database,
	sql: string,
): { rows: SqlRow[]; columns: string[]; lastIsQuery: boolean } {
	const statements = splitSqlStatements(sql);
	if (statements.length === 0) {
		throw new Error("No SQL statement provided.");
	}

	let rows: SqlRow[] = [];
	let columns: string[] = [];
	let lastIsQuery = false;

	for (let index = 0; index < statements.length; index += 1) {
		const statement = statements[index] ?? "";
		const isLast = index === statements.length - 1;
		const queryLike = isRowQuery(statement);

		if (!queryLike) {
			db.exec(statement);
			if (isLast) {
				rows = [];
				columns = [];
				lastIsQuery = false;
			}
			continue;
		}

		const prepared = db.query(statement) as unknown as {
			all: () => SqlRow[];
			columnNames?: string[];
		};
		const queryRows = prepared.all();
		const queryColumns = Array.isArray(prepared.columnNames)
			? prepared.columnNames
			: [];

		if (isLast) {
			rows = queryRows;
			columns = extractColumns(queryRows, queryColumns);
			lastIsQuery = true;
		}
	}

	return { rows, columns, lastIsQuery };
}

function createObjectiveDb(setupSql: string): Database {
	const db = new Database(":memory:");
	db.exec("PRAGMA foreign_keys = ON;");
	db.exec(setupSql);
	return db;
}

function buildSchemaGraph(db: Database): PlaygroundGraph {
	const tableRows = db
		.query(
			`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name;
      `,
		)
		.all() as Array<{ name: string }>;

	const tables: PlaygroundTableGraphNode[] = tableRows.map((row) => ({
		name: row.name,
		columns: (
			db.query(`PRAGMA table_info(${row.name});`).all() as Array<{
				name: string;
				type: string;
				notnull: number;
				pk: number;
			}>
		).map(
			(column): PlaygroundColumn => ({
				name: column.name,
				type: column.type || "TEXT",
				notNull: column.notnull === 1,
				primaryKeyOrder: column.pk,
			}),
		),
	}));

	const foreignKeys: PlaygroundForeignKeyEdge[] = [];

	for (const table of tables) {
		const rows = db
			.query(`PRAGMA foreign_key_list(${table.name});`)
			.all() as Array<{
			id: number;
			seq: number;
			table: string;
			from: string;
			to: string;
		}>;

		for (const row of rows) {
			foreignKeys.push({
				id: `${table.name}:${row.id}:${row.seq}`,
				fromTable: table.name,
				fromColumn: row.from,
				toTable: row.table,
				toColumn: row.to,
			});
		}
	}

	foreignKeys.sort((left, right) =>
		`${left.fromTable}.${left.fromColumn}->${left.toTable}.${left.toColumn}`.localeCompare(
			`${right.fromTable}.${right.fromColumn}->${right.toTable}.${right.toColumn}`,
		),
	);

	return {
		tables,
		foreignKeys,
		generatedAt: new Date().toISOString(),
	};
}

function hasRequiredTokens(
	sql: string,
	requiredTokens: string[],
): { pass: boolean; missing: string[] } {
	const upperSql = sql.toUpperCase();
	const missing: string[] = [];

	for (const token of requiredTokens) {
		if (!upperSql.includes(token.toUpperCase())) {
			missing.push(token);
		}
	}

	return {
		pass: missing.length === 0,
		missing,
	};
}

export class GameEngine {
	private readonly progressStore = new ProgressStore();

	private getCurrent(
		state: GameState,
	): { operation: (typeof OPERATIONS)[number]; objective: Objective } | null {
		const operation = OPERATIONS[state.operationIndex];
		if (!operation) return null;
		const objective = operation.objectives[state.objectiveIndex];
		if (!objective) return null;
		return { operation, objective };
	}

	private campaignState(state: GameState): CampaignNode[] {
		return OPERATIONS.map((operation, index) => {
			if (index < state.operationIndex) {
				return {
					id: operation.id,
					code: operation.code,
					title: operation.title,
					status: "completed",
				};
			}

			if (index === state.operationIndex) {
				return {
					id: operation.id,
					code: operation.code,
					title: operation.title,
					status: "current",
				};
			}

			if (index === state.operationIndex + 1) {
				return {
					id: operation.id,
					code: operation.code,
					title: operation.title,
					status: "available",
				};
			}

			return {
				id: operation.id,
				code: operation.code,
				title: operation.title,
				status: "locked",
			};
		});
	}

	snapshot(): Snapshot {
		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return {
				state: {
					xp: state.xp,
					rank: state.rank,
					operationIndex: state.operationIndex,
					objectiveIndex: state.objectiveIndex,
				},
				current: null,
				campaign: this.campaignState(state),
				completed: true,
			};
		}

		const key = objectiveKey(current.operation.id, current.objective.id);
		const hintsUsed = state.hintsUsed[key] ?? 0;

		return {
			state: {
				xp: state.xp,
				rank: state.rank,
				operationIndex: state.operationIndex,
				objectiveIndex: state.objectiveIndex,
			},
			current: {
				operationId: current.operation.id,
				operationCode: current.operation.code,
				operationTitle: current.operation.title,
				briefing: current.operation.briefing,
				objectiveId: current.objective.id,
				objectivePhase: resolveObjectivePhase(current.objective),
				objectiveNumber: state.objectiveIndex + 1,
				objectiveTotal: current.operation.objectives.length,
				objectiveTitle: current.objective.title,
				narrative: current.objective.narrative,
				acceptance: current.objective.acceptance ?? [],
				starterSql: current.objective.starterSql ?? null,
				hintsUsed,
				hintsRemaining: Math.max(0, current.objective.hints.length - hintsUsed),
				solved: state.solvedKeys.includes(key),
			},
			campaign: this.campaignState(state),
			completed: false,
		};
	}

	run(sql: string): RunResponse {
		const cleaned = sql.trim();
		if (cleaned.length === 0) {
			return {
				ok: false,
				passed: false,
				message: "Write a SQL statement before running.",
				rows: [],
				columns: [],
				xpAwarded: 0,
				snapshot: this.snapshot(),
			};
		}

		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return {
				ok: false,
				passed: false,
				message: "Campaign already completed. Reset progress to replay.",
				rows: [],
				columns: [],
				xpAwarded: 0,
				snapshot: this.snapshot(),
			};
		}

		const key = objectiveKey(current.operation.id, current.objective.id);

		if (
			current.objective.requiredTokens &&
			current.objective.requiredTokens.length > 0
		) {
			const requiredCheck = hasRequiredTokens(
				cleaned,
				current.objective.requiredTokens,
			);
			if (!requiredCheck.pass) {
				return {
					ok: true,
					passed: false,
					message: `Missing required SQL constructs: ${requiredCheck.missing.join(", ")}.`,
					rows: [],
					columns: [],
					xpAwarded: 0,
					snapshot: this.snapshot(),
				};
			}
		}

		const alreadySolved = state.solvedKeys.includes(key);

		let rows: SqlRow[] = [];
		let columns: string[] = [];

		try {
			if (current.objective.mode === "result") {
				const expectedDb = createObjectiveDb(current.objective.setupSql);
				const expectedExecution = executeSql(
					expectedDb,
					current.objective.solutionSql ?? "",
				);
				expectedDb.close();

				const actualDb = createObjectiveDb(current.objective.setupSql);
				const actualExecution = executeSql(actualDb, cleaned);
				rows = actualExecution.rows;
				columns = actualExecution.columns;

				if (!actualExecution.lastIsQuery) {
					actualDb.close();
					return {
						ok: true,
						passed: false,
						message: "Final statement must return rows for this objective.",
						rows,
						columns,
						xpAwarded: 0,
						snapshot: this.snapshot(),
					};
				}

				const comparison = compareResultSets(
					actualExecution.rows,
					actualExecution.columns,
					expectedExecution.rows,
					expectedExecution.columns,
					current.objective.orderSensitive ?? false,
				);

				actualDb.close();

				if (!comparison.pass) {
					return {
						ok: true,
						passed: false,
						message: `Not solved yet: ${comparison.detail}`,
						rows,
						columns,
						xpAwarded: 0,
						snapshot: this.snapshot(),
					};
				}
			} else {
				const db = createObjectiveDb(current.objective.setupSql);
				const execution = executeSql(db, cleaned);
				rows = execution.rows;
				columns = execution.columns;

				let pass = true;
				let detail = "Objective conditions not met.";

				if (current.objective.assertSql) {
					const assertion = executeSql(db, current.objective.assertSql);
					const first = assertion.rows[0] as SqlRow | undefined;
					const passValue = first?.pass;
					pass = Number(passValue) === 1;
					detail = pass ? "Objective conditions met." : detail;
				}

				if (pass && current.objective.validate) {
					const outcome = current.objective.validate(db, cleaned);
					pass = outcome.pass;
					if (outcome.detail) {
						detail = outcome.detail;
					}
				}

				db.close();

				if (!pass) {
					return {
						ok: true,
						passed: false,
						message: `Not solved yet: ${detail}`,
						rows,
						columns,
						xpAwarded: 0,
						snapshot: this.snapshot(),
					};
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown SQL error.";
			return {
				ok: true,
				passed: false,
				message: `SQL error: ${errorMessage}`,
				rows,
				columns,
				xpAwarded: 0,
				snapshot: this.snapshot(),
			};
		}

		let xpAwarded = 0;
		if (!alreadySolved) {
			const hintsUsed = state.hintsUsed[key] ?? 0;
			xpAwarded = Math.max(
				5,
				current.objective.xp - hintsUsed * HINT_PENALTY_XP,
			);
			state.xp += xpAwarded;
			state.solvedKeys = [...state.solvedKeys, key];
			this.progressStore.save(state);
		}

		return {
			ok: true,
			passed: true,
			message: alreadySolved
				? "Already solved earlier. Replay accepted."
				: `Objective solved. +${xpAwarded} XP earned.`,
			rows,
			columns,
			xpAwarded,
			snapshot: this.snapshot(),
		};
	}

	hint(): {
		ok: boolean;
		message: string;
		hint: string | null;
		snapshot: Snapshot;
	} {
		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return {
				ok: false,
				message: "Campaign already completed.",
				hint: null,
				snapshot: this.snapshot(),
			};
		}

		const key = objectiveKey(current.operation.id, current.objective.id);
		const used = state.hintsUsed[key] ?? 0;

		if (used >= current.objective.hints.length) {
			return {
				ok: true,
				message: "No hints remaining for this objective.",
				hint: null,
				snapshot: this.snapshot(),
			};
		}

		const hintText = current.objective.hints[used] ?? null;
		state.hintsUsed[key] = used + 1;
		state.xp = Math.max(0, state.xp - HINT_PENALTY_XP);
		this.progressStore.save(state);

		return {
			ok: true,
			message: `Hint unlocked (-${HINT_PENALTY_XP} XP).`,
			hint: hintText,
			snapshot: this.snapshot(),
		};
	}

	advance(): { ok: boolean; message: string; snapshot: Snapshot } {
		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return {
				ok: true,
				message: "Campaign already completed.",
				snapshot: this.snapshot(),
			};
		}

		const key = objectiveKey(current.operation.id, current.objective.id);
		const solved = state.solvedKeys.includes(key);

		if (!solved) {
			return {
				ok: false,
				message: "Solve the current objective before advancing.",
				snapshot: this.snapshot(),
			};
		}

		const operation = OPERATIONS[state.operationIndex];
		if (!operation) {
			return {
				ok: false,
				message: "Operation not found.",
				snapshot: this.snapshot(),
			};
		}

		const isLastObjectiveInOperation =
			state.objectiveIndex >= operation.objectives.length - 1;
		if (!isLastObjectiveInOperation) {
			state.objectiveIndex += 1;
			this.progressStore.save(state);
			return {
				ok: true,
				message: "Advanced to next objective.",
				snapshot: this.snapshot(),
			};
		}

		const isFinalOperation = state.operationIndex >= OPERATIONS.length - 1;
		if (isFinalOperation) {
			state.operationIndex = OPERATIONS.length;
			state.objectiveIndex = 0;
			this.progressStore.save(state);
			return {
				ok: true,
				message: "Case closed. DEAD SIGNAL completed.",
				snapshot: this.snapshot(),
			};
		}

		state.operationIndex += 1;
		state.objectiveIndex = 0;
		this.progressStore.save(state);

		return {
			ok: true,
			message: "Advanced to next operation.",
			snapshot: this.snapshot(),
		};
	}

	schema(): { ok: boolean; schema: string; message: string } {
		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return { ok: false, schema: "", message: "Campaign completed." };
		}

		const db = createObjectiveDb(current.objective.setupSql);
		const rows = db
			.query(
				`
          SELECT name, sql
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name;
        `,
			)
			.all() as Array<{ name: string; sql: string }>;
		db.close();

		const schemaText = rows.map((row) => `${row.sql};`).join("\n\n");

		return {
			ok: true,
			schema: schemaText,
			message: "Schema loaded.",
		};
	}

	graph(): { ok: boolean; graph: PlaygroundGraph; message: string } {
		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return {
				ok: false,
				graph: {
					tables: [],
					foreignKeys: [],
					generatedAt: new Date().toISOString(),
				},
				message: "Campaign completed.",
			};
		}

		const db = createObjectiveDb(current.objective.setupSql);
		const graph = buildSchemaGraph(db);
		db.close();

		return {
			ok: true,
			graph,
			message:
				graph.foreignKeys.length > 0
					? "Objective relationship graph loaded."
					: graph.tables.length > 0
						? "Objective schema loaded, but no foreign keys were found."
						: "This objective does not start with any tables yet.",
		};
	}

	playgroundSeed(): {
		ok: boolean;
		seedKey: string;
		setupSql: string;
		starterSql: string;
		message: string;
	} {
		const state = this.progressStore.load();
		const current = this.getCurrent(state);

		if (!current) {
			return {
				ok: false,
				seedKey: "completed",
				setupSql: "",
				starterSql: "",
				message: "Campaign completed.",
			};
		}

		return {
			ok: true,
			seedKey: `${current.operation.id}:${current.objective.id}`,
			setupSql: current.objective.setupSql,
			starterSql: current.objective.starterSql ?? "",
			message: "Objective playground seed loaded.",
		};
	}

	reset(): Snapshot {
		this.progressStore.reset();
		return this.snapshot();
	}
}
