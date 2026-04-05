import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { SqlRow } from "./types";

const PLAYGROUND_DB_PATH = resolve(process.cwd(), "data", "playground.db");

const PLAYGROUND_BOOTSTRAP_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE studios (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY,
  studio_id INTEGER NOT NULL REFERENCES studios(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  instructor TEXT NOT NULL,
  start_time TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK(price >= 0),
  difficulty TEXT NOT NULL CHECK(difficulty IN ('intro', 'regular', 'advanced'))
);

CREATE TABLE attendees (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  membership_tier TEXT NOT NULL DEFAULT 'drop-in'
    CHECK(membership_tier IN ('drop-in', 'monthly', 'annual'))
);

CREATE TABLE class_registrations (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  booked_at TEXT NOT NULL,
  PRIMARY KEY (class_id, attendee_id)
);

INSERT INTO studios (id, name, city) VALUES
  (1, 'North Window Studio', 'Bangkok'),
  (2, 'Harbor Clay Lab', 'Chiang Mai'),
  (3, 'Sunline Workshop', 'Phuket');

INSERT INTO classes (id, studio_id, title, instructor, start_time, price, difficulty) VALUES
  (101, 1, 'Wheel Basics', 'Mina Hale', '2026-05-08 09:00:00', 600, 'intro'),
  (102, 1, 'Glaze Mixing', 'Pree Tan', '2026-05-08 14:00:00', 450, 'regular'),
  (103, 2, 'Handbuilding Studio', 'Risa Cole', '2026-05-09 10:30:00', 550, 'intro'),
  (104, 3, 'Large Form Throwing', 'Niran Voss', '2026-05-10 13:30:00', 900, 'advanced');

INSERT INTO attendees (id, full_name, email, membership_tier) VALUES
  (201, 'Ari Mercer', 'ari@example.com', 'monthly'),
  (202, 'June Hollow', 'june@example.com', 'drop-in'),
  (203, 'Theo Marden', NULL, 'annual'),
  (204, 'Sana Quill', 'sana@example.com', 'monthly');

INSERT INTO class_registrations (class_id, attendee_id, booked_at) VALUES
  (101, 201, '2026-05-01 08:10:00'),
  (101, 202, '2026-05-02 11:45:00'),
  (102, 204, '2026-05-03 15:20:00'),
  (103, 201, '2026-05-04 09:30:00'),
  (104, 203, '2026-05-05 18:05:00');
`;

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
    const needsBootstrap = !existsSync(PLAYGROUND_DB_PATH);
    const db = new Database(PLAYGROUND_DB_PATH);
    if (needsBootstrap) {
      db.exec(PLAYGROUND_BOOTSTRAP_SQL);
    }
    return db;
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

  schema(): { ok: boolean; schema: string; message: string } {
    try {
      const rows = this.db
        .query(
          `
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%'
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

  reset(): { ok: boolean; message: string; starterSql: string } {
    this.db.close(false);
    if (existsSync(PLAYGROUND_DB_PATH)) {
      rmSync(PLAYGROUND_DB_PATH);
    }
    this.db = this.createDatabase();

    return {
      ok: true,
      message: "Playground reset to the starter dataset.",
      starterSql: PLAYGROUND_BOOTSTRAP_SQL.trim(),
    };
  }

  state(): { ok: boolean; starterSql: string; message: string } {
    return {
      ok: true,
      starterSql: PLAYGROUND_BOOTSTRAP_SQL.trim(),
      message: "Playground ready.",
    };
  }
}
