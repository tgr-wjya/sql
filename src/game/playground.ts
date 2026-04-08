import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type {
  PlaygroundColumn,
  PlaygroundForeignKeyEdge,
  PlaygroundGraph,
  PlaygroundTableGraphNode,
  SqlRow,
} from "./types";

const PLAYGROUND_DB_PATH = resolve(process.cwd(), "data", "playground.db");

const PLAYGROUND_META_TABLE = "__playground_meta";

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
  return keyword === "SELECT" || keyword === "WITH" || keyword === "PRAGMA" || keyword === "EXPLAIN";
}

function extractColumns(rows: SqlRow[], fallback: string[]): string[] {
  if (fallback.length > 0) return [...fallback];
  const firstRow = rows[0];
  if (!firstRow) return [];
  return Object.keys(firstRow);
}

function executeSql(db: Database, sql: string): { rows: SqlRow[]; columns: string[] } {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new Error("No SQL statement provided.");
  }

  let rows: SqlRow[] = [];
  let columns: string[] = [];

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index] ?? "";
    const isLast = index === statements.length - 1;
    const queryLike = isRowQuery(statement);

    if (!queryLike) {
      db.exec(statement);
      if (isLast) {
        rows = [];
        columns = [];
      }
      continue;
    }

    const prepared = db.query(statement) as unknown as {
      all: () => SqlRow[];
      columnNames?: string[];
    };
    const queryRows = prepared.all();
    const queryColumns = Array.isArray(prepared.columnNames) ? prepared.columnNames : [];

    if (isLast) {
      rows = queryRows;
      columns = extractColumns(queryRows, queryColumns);
    }
  }

  return { rows, columns };
}

export class PlaygroundStore {
  private db: Database;

  constructor() {
    mkdirSync(dirname(PLAYGROUND_DB_PATH), { recursive: true });
    this.db = this.createDatabase();
  }

  private createDatabase(): Database {
    return new Database(PLAYGROUND_DB_PATH);
  }

  run(sql: string): { ok: boolean; message: string; rows: SqlRow[]; columns: string[] } {
    const cleaned = sql.trim();
    if (cleaned.length === 0) {
      return {
        ok: false,
        message: "Write SQL before running the playground.",
        rows: [],
        columns: [],
      };
    }

    try {
      const execution = executeSql(this.db, cleaned);
      return {
        ok: true,
        message: "Playground query executed.",
        rows: execution.rows,
        columns: execution.columns,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SQL error.";
      return {
        ok: false,
        message: `SQL error: ${message}`,
        rows: [],
        columns: [],
      };
    }
  }

  graph(): { ok: boolean; graph: PlaygroundGraph; message: string } {
    try {
      const graph = this.buildGraph();
      return {
        ok: true,
        graph,
        message:
          graph.foreignKeys.length > 0
            ? "Playground relationship graph loaded."
            : graph.tables.length > 0
              ? "Playground schema loaded, but no foreign keys were found."
              : "Playground has no user tables right now.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown graph error.";
      return {
        ok: false,
        graph: {
          tables: [],
          foreignKeys: [],
          generatedAt: new Date().toISOString(),
        },
        message: `SQL error: ${message}`,
      };
    }
  }

  schema(): { ok: boolean; schema: string; message: string } {
    try {
      const rows = this.db
        .query(
          `
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%'
              AND name != '${PLAYGROUND_META_TABLE}'
            ORDER BY name;
          `,
        )
        .all() as Array<{ name: string; sql: string | null }>;

      const schemaText = rows
        .filter((row) => typeof row.sql === "string" && row.sql.length > 0)
        .map((row) => `${row.sql};`)
        .join("\n\n");

      return {
        ok: true,
        schema: schemaText,
        message: rows.length > 0 ? "Playground schema loaded." : "Playground has no user tables right now.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown schema error.";
      return {
        ok: false,
        schema: "",
        message: `SQL error: ${message}`,
      };
    }
  }

  reset(seedKey: string, setupSql: string, starterSql: string): {
    ok: boolean;
    message: string;
    starterSql: string;
  } {
    this.rebuild(seedKey, setupSql);
    return {
      ok: true,
      message: "Playground reset to the current objective schema.",
      starterSql: starterSql.trim(),
    };
  }

  state(seedKey: string, setupSql: string, starterSql: string): {
    ok: boolean;
    starterSql: string;
    message: string;
  } {
    const changed = this.ensureSeed(seedKey, setupSql);
    return {
      ok: true,
      starterSql: starterSql.trim(),
      message: changed
        ? "Playground synced to the current objective schema."
        : "Playground ready for the current objective schema.",
    };
  }

  private buildGraph(): PlaygroundGraph {
    const tableRows = this.db
      .query(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name != '${PLAYGROUND_META_TABLE}'
          ORDER BY name;
        `,
      )
      .all() as Array<{ name: string }>;

    const tables: PlaygroundTableGraphNode[] = tableRows.map((row) => ({
      name: row.name,
      columns: this.tableColumns(row.name),
    }));

    const foreignKeys: PlaygroundForeignKeyEdge[] = [];

    for (const table of tables) {
      const rows = this.db.query(`PRAGMA foreign_key_list(${table.name});`).all() as Array<{
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

  private tableColumns(tableName: string): PlaygroundColumn[] {
    const rows = this.db.query(`PRAGMA table_info(${tableName});`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    return rows.map((row) => ({
      name: row.name,
      type: row.type || "TEXT",
      notNull: row.notnull === 1,
      primaryKeyOrder: row.pk,
    }));
  }

  private ensureSeed(seedKey: string, setupSql: string): boolean {
    const currentSeedKey = this.readSeedKey();
    if (currentSeedKey === seedKey) {
      return false;
    }
    this.rebuild(seedKey, setupSql);
    return true;
  }

  private rebuild(seedKey: string, setupSql: string): void {
    this.db.close(false);
    if (existsSync(PLAYGROUND_DB_PATH)) {
      rmSync(PLAYGROUND_DB_PATH);
    }
    this.db = this.createDatabase();
    this.db.exec("PRAGMA foreign_keys = ON;");
    if (setupSql.trim().length > 0) {
      this.db.exec(setupSql);
    }
    this.writeSeedKey(seedKey);
  }

  private readSeedKey(): string | null {
    const metaTableExists = this.db
      .query(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = '${PLAYGROUND_META_TABLE}';`,
      )
      .get() as { ok: number } | null;

    if (!metaTableExists) {
      return null;
    }

    const row = this.db
      .query(`SELECT seed_key FROM ${PLAYGROUND_META_TABLE} WHERE id = 1;`)
      .get() as { seed_key: string } | null;

    return row?.seed_key ?? null;
  }

  private writeSeedKey(seedKey: string): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${PLAYGROUND_META_TABLE} (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        seed_key TEXT NOT NULL
      );
    `);

    this.db
      .query(
        `
          INSERT INTO ${PLAYGROUND_META_TABLE} (id, seed_key)
          VALUES (1, ?1)
          ON CONFLICT(id) DO UPDATE SET
            seed_key = excluded.seed_key;
        `,
      )
      .run(seedKey);
  }
}
