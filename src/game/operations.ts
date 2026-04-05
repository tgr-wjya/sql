import type { Database } from "bun:sqlite";

import type { Operation, ValidationOutcome } from "./types";

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

function tableSql(db: Database, tableName: string): string {
  const row = db
    .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?;")
    .get(tableName) as { sql: string } | null;
  return row?.sql ?? "";
}

function hasTable(db: Database, tableName: string): boolean {
  const row = db
    .query("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?;")
    .get(tableName) as { ok: number } | null;
  return row?.ok === 1;
}

function tableInfo(db: Database, tableName: string): TableInfoRow[] {
  return db.query(`PRAGMA table_info(${tableName});`).all() as TableInfoRow[];
}

function hasRequiredColumns(
  db: Database,
  tableName: string,
  required: Array<{ name: string; notNull?: boolean }>,
): ValidationOutcome {
  if (!hasTable(db, tableName)) {
    return { pass: false, detail: `Table '${tableName}' is missing.` };
  }

  const info = tableInfo(db, tableName);
  for (const column of required) {
    const found = info.find((item) => item.name === column.name);
    if (!found) {
      return {
        pass: false,
        detail: `Column '${column.name}' is missing in table '${tableName}'.`,
      };
    }

    if (column.notNull && found.notnull !== 1) {
      return {
        pass: false,
        detail: `Column '${tableName}.${column.name}' must be NOT NULL.`,
      };
    }
  }

  return { pass: true };
}

function hasCompositePk(db: Database, tableName: string, columns: string[]): ValidationOutcome {
  const info = tableInfo(db, tableName);
  const pkColumns = info
    .filter((row) => row.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((row) => row.name);

  if (pkColumns.length !== columns.length) {
    return {
      pass: false,
      detail: `Table '${tableName}' must have a ${columns.length}-column composite primary key (${columns.join(", ")}).`,
    };
  }

  for (let index = 0; index < columns.length; index += 1) {
    if (pkColumns[index] !== columns[index]) {
      return {
        pass: false,
        detail: `Composite PK for '${tableName}' must be ordered as (${columns.join(", ")}).`,
      };
    }
  }

  return { pass: true };
}

function hasForeignKey(
  db: Database,
  tableName: string,
  options: {
    from: string;
    refTable: string;
    refColumn: string;
    onDelete: string[];
  },
): ValidationOutcome {
  const rows = db.query(`PRAGMA foreign_key_list(${tableName});`).all() as ForeignKeyRow[];
  const match = rows.find(
    (row) =>
      row.from === options.from &&
      row.table === options.refTable &&
      row.to === options.refColumn &&
      options.onDelete.includes(row.on_delete.toUpperCase()),
  );

  if (!match) {
    return {
      pass: false,
      detail:
        `Missing FK ${tableName}.${options.from} -> ${options.refTable}.${options.refColumn} ` +
        `with ON DELETE ${options.onDelete.join("/")}.`,
    };
  }

  return { pass: true };
}

function hasUniqueConstraint(db: Database, tableName: string, columnName: string): ValidationOutcome {
  const indexes = db.query(`PRAGMA index_list(${tableName});`).all() as Array<{
    seq: number;
    name: string;
    unique: number;
  }>;

  for (const index of indexes) {
    if (index.unique !== 1) continue;
    const columns = db.query(`PRAGMA index_info(${index.name});`).all() as Array<{ name: string }>;
    if (columns.length === 1 && columns[0]?.name === columnName) {
      return { pass: true };
    }
  }

  return {
    pass: false,
    detail: `Table '${tableName}' must enforce UNIQUE on column '${columnName}'.`,
  };
}

function includesCheckConstraint(sql: string, fragment: string): boolean {
  return sql.toUpperCase().includes(fragment.toUpperCase());
}

function normalizedSql(sql: string): string {
  return sql.toUpperCase().replace(/\s+/g, " ");
}

export const OPERATIONS: Operation[] = [
  {
    id: 1,
    code: "BLUEPRINT",
    title: "Five-Phase Intake",
    briefing:
      "This operation is the full SQL workflow in one sequence. You will first create the schema that later steps depend on, then seed rows into it, query across the relationships, apply a controlled mutation, and finally add an index and inspect the query plan.",
    objectives: [
      {
        id: "architect-1",
        phase: "ARCHITECT",
        title: "Design The Core Schema",
        narrative:
          "Build the base schema from scratch for four related tables: departments, employees, projects, and employee_projects. The important part is not guessing extra columns, but modeling the core relationships correctly so later inserts, joins, and deletes behave the way the next phases expect.",
        acceptance: [
          "Create exactly these four tables: departments, employees, projects, employee_projects.",
          "departments needs an id column and a required unique name column.",
          "employees needs id, codename, department_id, and clearance_level, with clearance limited to the range 1 through 5.",
          "projects needs id, code, and department_id, with code treated as a required project identifier.",
          "employee_projects should act as the junction table between employees and projects, using a composite primary key of (employee_id, project_id).",
          "Use foreign keys so employees belong to departments, projects belong to departments, and junction rows point to employees and projects.",
          "Delete behavior should protect core parent rows where appropriate and cascade only on the junction links.",
        ],
        starterSql: `CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Continue with employees, projects, and employee_projects`,
        mode: "assert",
        setupSql: `
PRAGMA foreign_keys = ON;
`,
        validate: (db) => {
          const requiredTables = ["departments", "employees", "projects", "employee_projects"];
          for (const table of requiredTables) {
            if (!hasTable(db, table)) {
              return { pass: false, detail: `Missing table '${table}'.` };
            }
          }

          const departmentsCheck = hasRequiredColumns(db, "departments", [
            { name: "id" },
            { name: "name", notNull: true },
          ]);
          if (!departmentsCheck.pass) return departmentsCheck;

          const uniqueCheck = hasUniqueConstraint(db, "departments", "name");
          if (!uniqueCheck.pass) return uniqueCheck;

          const employeesCheck = hasRequiredColumns(db, "employees", [
            { name: "id" },
            { name: "codename", notNull: true },
            { name: "department_id", notNull: true },
            { name: "clearance_level", notNull: true },
          ]);
          if (!employeesCheck.pass) return employeesCheck;

          const employeesSql = tableSql(db, "employees");
          const employeeSchema = normalizedSql(employeesSql);
          const hasRangeCheck =
            employeeSchema.includes("CHECK") &&
            (employeeSchema.includes("CLEARANCE_LEVEL BETWEEN 1 AND 5") ||
              (employeeSchema.includes("CLEARANCE_LEVEL >= 1") &&
                employeeSchema.includes("CLEARANCE_LEVEL <= 5")));

          if (!hasRangeCheck) {
            return {
              pass: false,
              detail: "Table 'employees' must include CHECK(clearance_level BETWEEN 1 AND 5).",
            };
          }

          const projectsCheck = hasRequiredColumns(db, "projects", [
            { name: "id" },
            { name: "code", notNull: true },
            { name: "department_id", notNull: true },
          ]);
          if (!projectsCheck.pass) return projectsCheck;

          const junctionCheck = hasRequiredColumns(db, "employee_projects", [
            { name: "employee_id", notNull: true },
            { name: "project_id", notNull: true },
          ]);
          if (!junctionCheck.pass) return junctionCheck;

          const pkCheck = hasCompositePk(db, "employee_projects", ["employee_id", "project_id"]);
          if (!pkCheck.pass) return pkCheck;

          const employeeFk = hasForeignKey(db, "employees", {
            from: "department_id",
            refTable: "departments",
            refColumn: "id",
            onDelete: ["RESTRICT", "NO ACTION"],
          });
          if (!employeeFk.pass) return employeeFk;

          const projectFk = hasForeignKey(db, "projects", {
            from: "department_id",
            refTable: "departments",
            refColumn: "id",
            onDelete: ["RESTRICT", "NO ACTION"],
          });
          if (!projectFk.pass) return projectFk;

          const junctionEmployeeFk = hasForeignKey(db, "employee_projects", {
            from: "employee_id",
            refTable: "employees",
            refColumn: "id",
            onDelete: ["CASCADE"],
          });
          if (!junctionEmployeeFk.pass) return junctionEmployeeFk;

          const junctionProjectFk = hasForeignKey(db, "employee_projects", {
            from: "project_id",
            refTable: "projects",
            refColumn: "id",
            onDelete: ["CASCADE"],
          });
          if (!junctionProjectFk.pass) return junctionProjectFk;

          return { pass: true };
        },
        hints: [
          "Think in dependency order: departments first, then employees and projects, then the employee_projects junction table.",
          "The schema only needs the columns named in the acceptance list. Focus on constraints and relationships more than extra attributes.",
          "Use REFERENCES clauses with explicit ON DELETE rules. Parent business tables should be protected; the junction rows should disappear when either side is deleted.",
          "The junction table is many-to-many glue, so its primary key should be PRIMARY KEY (employee_id, project_id).",
        ],
        xp: 140,
      },
      {
        id: "populate-1",
        phase: "POPULATE",
        title: "Seed The Leak Extract",
        narrative:
          "The schema already exists for this phase, and the departments table is already seeded with three rows: (1, Cybernetics), (2, Legal), and (3, Logistics). Do not insert or delete departments here. Your task is only to add the missing employees, projects, and employee-project links in an order that respects the foreign keys.",
        acceptance: [
          "Do not modify departments in this objective. Those rows already exist.",
          "Insert these employee rows: 101 Nyra Sol dept 1 clearance 5, 102 Bram Kade dept 3 clearance 4, 103 Mara Quill dept 1 clearance 4, 104 Ivo Chen dept 2 clearance 2.",
          "Insert these project rows: 201 BLACKOUT dept 1 and 202 GLASS-PORT dept 3.",
          "Insert exactly these employee-project links: (101, 201), (102, 202), (103, 201).",
          "Seed employees and projects before employee_projects so the script runs without FK failures.",
        ],
        starterSql: `INSERT INTO employees (id, codename, department_id, clearance_level) VALUES
  (101, 'Nyra Sol', 1, 5),
  (102, 'Bram Kade', 3, 4),
  (103, 'Mara Quill', 1, 4),
  (104, 'Ivo Chen', 2, 2);

-- departments already exist:
--   (1, 'Cybernetics')
--   (2, 'Legal')
--   (3, 'Logistics')
-- do not insert into departments in this objective

INSERT INTO projects (id, code, department_id) VALUES
  (201, 'BLACKOUT', 1),
  (202, 'GLASS-PORT', 3);

INSERT INTO employee_projects (employee_id, project_id) VALUES
  (101, 201),
  (102, 202),
  (103, 201);`,
        mode: "assert",
        setupSql: `
PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  codename TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  clearance_level INTEGER NOT NULL CHECK(clearance_level BETWEEN 1 AND 5)
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT
);

CREATE TABLE employee_projects (
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, project_id)
);

INSERT INTO departments (id, name) VALUES
  (1, 'Cybernetics'),
  (2, 'Legal'),
  (3, 'Logistics');
`,
        assertSql: `
SELECT CASE
  WHEN (SELECT COUNT(*) FROM employees) = 4
   AND (SELECT COUNT(*) FROM projects) = 2
   AND (SELECT COUNT(*) FROM employee_projects) = 3
   AND EXISTS (
     SELECT 1 FROM employees
     WHERE id = 101 AND codename = 'Nyra Sol' AND department_id = 1 AND clearance_level = 5
   )
   AND EXISTS (
     SELECT 1 FROM projects
     WHERE id = 201 AND code = 'BLACKOUT' AND department_id = 1
   )
   AND EXISTS (
     SELECT 1 FROM employee_projects
     WHERE employee_id = 103 AND project_id = 201
   )
  THEN 1 ELSE 0 END AS pass;
`,
        requiredTokens: ["INSERT"],
        hints: [
          "The departments table is already populated before your SQL runs. If you insert department IDs 1, 2, or 3 again, you will get a UNIQUE constraint error.",
          "This objective only expects INSERTs into employees, projects, and employee_projects.",
          "Run employees first, then projects, then employee_projects.",
          "If you get a duplicate-key error on departments, that means you are seeding one table too many.",
        ],
        xp: 110,
      },
      {
        id: "investigate-1",
        phase: "INVESTIGATE",
        title: "Trace Unauthorized Access",
        narrative:
          "Write a read query that starts from employees, joins through the assignment table, and filters down to people assigned to the BLACKOUT project who also have clearance level 4 or higher. The result should show only the employee codename and clearance_level columns, in a predictable sorted order.",
        acceptance: [
          "Use the many-to-many path employees -> employee_projects -> projects.",
          "Filter to project code BLACKOUT and employees with clearance_level >= 4.",
          "Return only codename and clearance_level.",
          "Sort by clearance_level descending, then codename ascending.",
        ],
        starterSql: `SELECT e.codename, e.clearance_level
FROM employees e
-- join through employee_projects and projects
`,
        mode: "result",
        setupSql: `
PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  codename TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  clearance_level INTEGER NOT NULL CHECK(clearance_level BETWEEN 1 AND 5)
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT
);

CREATE TABLE employee_projects (
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, project_id)
);

INSERT INTO departments (id, name) VALUES
  (1, 'Cybernetics'),
  (2, 'Legal'),
  (3, 'Logistics');

INSERT INTO employees (id, codename, department_id, clearance_level) VALUES
  (101, 'Nyra Sol', 1, 5),
  (102, 'Bram Kade', 3, 4),
  (103, 'Mara Quill', 1, 4),
  (104, 'Ivo Chen', 2, 2),
  (105, 'Rin Vale', 1, 5);

INSERT INTO projects (id, code, department_id) VALUES
  (201, 'BLACKOUT', 1),
  (202, 'GLASS-PORT', 3);

INSERT INTO employee_projects (employee_id, project_id) VALUES
  (101, 201),
  (102, 202),
  (103, 201),
  (105, 201);
`,
        solutionSql: `
SELECT e.codename, e.clearance_level
FROM employees e
INNER JOIN employee_projects ep ON ep.employee_id = e.id
INNER JOIN projects p ON p.id = ep.project_id
WHERE p.code = 'BLACKOUT'
  AND e.clearance_level >= 4
ORDER BY e.clearance_level DESC, e.codename ASC;
`,
        hints: [
          "This is a classic many-to-many query. If you skip employee_projects, you are missing the relationship bridge.",
          "Get the joins working first, then add the WHERE filters, then finish with ORDER BY.",
          "The final shape is two columns only: codename and clearance_level.",
        ],
        xp: 100,
        orderSensitive: true,
      },
      {
        id: "mutate-1",
        phase: "MUTATE",
        title: "Patch And Purge",
        narrative:
          "This phase combines two write operations. First, update employee 104 so their department becomes 3, using the COALESCE patch pattern rather than a plain overwrite example. Then delete project 202 and rely on the foreign key setup to remove any dependent assignment rows automatically.",
        acceptance: [
          "Run an UPDATE against employees that changes employee 104 into department 3.",
          "Use COALESCE in the UPDATE so it matches the intended patch-style pattern.",
          "Delete project 202 from projects.",
          "After the delete, no employee_projects rows should still reference project 202.",
        ],
        starterSql: `UPDATE employees
SET department_id = COALESCE(3, department_id)
WHERE id = 104;

DELETE FROM projects
WHERE id = 202;`,
        mode: "assert",
        setupSql: `
PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  codename TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  clearance_level INTEGER NOT NULL CHECK(clearance_level BETWEEN 1 AND 5)
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT
);

CREATE TABLE employee_projects (
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, project_id)
);

INSERT INTO departments (id, name) VALUES
  (1, 'Cybernetics'),
  (2, 'Legal'),
  (3, 'Logistics');

INSERT INTO employees (id, codename, department_id, clearance_level) VALUES
  (101, 'Nyra Sol', 1, 5),
  (102, 'Bram Kade', 3, 4),
  (103, 'Mara Quill', 1, 4),
  (104, 'Ivo Chen', 2, 2);

INSERT INTO projects (id, code, department_id) VALUES
  (201, 'BLACKOUT', 1),
  (202, 'GLASS-PORT', 3);

INSERT INTO employee_projects (employee_id, project_id) VALUES
  (101, 201),
  (102, 202),
  (103, 201);
`,
        assertSql: `
SELECT CASE
  WHEN (SELECT department_id FROM employees WHERE id = 104) = 3
   AND NOT EXISTS (SELECT 1 FROM projects WHERE id = 202)
   AND NOT EXISTS (SELECT 1 FROM employee_projects WHERE project_id = 202)
  THEN 1 ELSE 0 END AS pass;
`,
        requiredTokens: ["UPDATE", "DELETE", "COALESCE"],
        hints: [
          "Solve this as two separate statements: one UPDATE and one DELETE.",
          "For the patch pattern, think 'new value if supplied, otherwise keep the old value' and express that with COALESCE.",
          "Delete the project from the parent table, not from the junction table. The junction cleanup should happen because of the FK rule.",
        ],
        xp: 100,
      },
      {
        id: "harden-1",
        phase: "HARDEN",
        title: "Index And Verify Plan",
        narrative:
          "This phase is about optimization, not changing results. Create an index that helps lookups by project_id in employee_projects, then run EXPLAIN QUERY PLAN on a matching filter to confirm SQLite is using that index instead of scanning the whole table.",
        acceptance: [
          "Create an index named idx_employee_projects_project_id on employee_projects(project_id).",
          "Run EXPLAIN QUERY PLAN on a query that filters employee_projects by project_id = 201.",
          "The resulting plan should indicate indexed lookup rather than a plain scan.",
        ],
        starterSql: `CREATE INDEX idx_employee_projects_project_id
ON employee_projects(project_id);

EXPLAIN QUERY PLAN
SELECT * FROM employee_projects WHERE project_id = 201;`,
        mode: "assert",
        setupSql: `
CREATE TABLE employee_projects (
  employee_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  PRIMARY KEY (employee_id, project_id)
);

INSERT INTO employee_projects (employee_id, project_id) VALUES
  (101, 201),
  (102, 202),
  (103, 201),
  (104, 201),
  (105, 203),
  (106, 201),
  (107, 204),
  (108, 201),
  (109, 202),
  (110, 201);
`,
        validate: (db) => {
          const indexExists = db
            .query(
              "SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name = 'idx_employee_projects_project_id';",
            )
            .get() as { ok: number } | null;

          if (!indexExists) {
            return {
              pass: false,
              detail: "Required index idx_employee_projects_project_id was not created.",
            };
          }

          const plans = db
            .query("EXPLAIN QUERY PLAN SELECT * FROM employee_projects WHERE project_id = 201;")
            .all() as Array<{ detail: string }>;

          const usesIndex = plans.some((plan) =>
            plan.detail.includes("USING INDEX idx_employee_projects_project_id"),
          );

          if (!usesIndex) {
            return {
              pass: false,
              detail:
                "Plan does not use idx_employee_projects_project_id yet. Re-check your EXPLAIN QUERY PLAN query.",
            };
          }

          return { pass: true };
        },
        requiredTokens: ["CREATE INDEX", "EXPLAIN QUERY PLAN"],
        hints: [
          "The index name matters in this objective, so match it exactly.",
          "Create the index first, then run EXPLAIN QUERY PLAN on the lookup query.",
          "Your verification query should filter by the same column the index was built on.",
        ],
        xp: 120,
      },
    ],
  },
  {
    id: 2,
    code: "INTAKE",
    title: "Chain Of Custody",
    briefing:
      "This is a focused seeding exercise. You need to insert a new evidence row and then create the linking row that connects it to an existing incident, in the correct parent-before-child order.",
    objectives: [
      {
        id: "obj-1",
        title: "Secure Audio Evidence",
        narrative:
          "Create one new evidence record, then connect it to the existing incident through the junction table. The task is small, but it checks whether you understand that the link row cannot exist before the referenced evidence row exists.",
        acceptance: [
          "Insert one row into evidence for EV-009.",
          "Use the provided label text and source text for that row.",
          "Insert one row into incident_evidence linking INC-01 to EV-009.",
        ],
        mode: "assert",
        setupSql: `
PRAGMA foreign_keys = ON;

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE incident_evidence (
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, evidence_id)
);

INSERT INTO incidents (id, title) VALUES
  ('INC-01', 'Aria Voss Death');

INSERT INTO evidence (id, label, source) VALUES
  ('EV-001', 'Lobby Camera Clip', 'Building CCTV');
`,
        assertSql: `
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM evidence
    WHERE id = 'EV-009' AND label = 'Dead Signal Audio'
  )
  AND EXISTS (
    SELECT 1 FROM incident_evidence
    WHERE incident_id = 'INC-01' AND evidence_id = 'EV-009'
  )
  THEN 1 ELSE 0 END AS pass;
`,
        hints: [
          "There are two tables to touch here, so expect two INSERT statements.",
          "Start with the standalone record in evidence, then create the relationship row in incident_evidence.",
          "Use the IDs and text values named in the objective exactly as written.",
        ],
        xp: 70,
      },
    ],
  },
  {
    id: 3,
    code: "RECON",
    title: "Filtered Sweep",
    briefing:
      "This objective is about basic filtering and sorting. Read a single table, apply two WHERE conditions together, and return only the requested columns in the requested order.",
    objectives: [
      {
        id: "obj-1",
        title: "High-Clearance List",
        narrative:
          "Query the employees table directly. Keep only rows where the employee is in district 'Sector-9' and has clearance_level 4 or higher, then return name, district, and clearance_level sorted from highest clearance to lowest and alphabetically within ties.",
        acceptance: [
          "Read from employees only; no join is needed.",
          "Apply both filters together: district = 'Sector-9' and clearance_level >= 4.",
          "Return exactly name, district, clearance_level.",
          "Sort by clearance_level DESC, then name ASC.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  clearance_level INTEGER NOT NULL
);

INSERT INTO employees (id, name, district, clearance_level) VALUES
  (1, 'Nyra Sol', 'Sector-9', 5),
  (2, 'Bram Kade', 'Sector-9', 4),
  (3, 'Eli Noor', 'Sector-3', 5),
  (4, 'Ivo Chen', 'Sector-9', 2),
  (5, 'Mara Quill', 'Sector-9', 4),
  (6, 'Tao Rinn', 'Sector-2', 4),
  (7, 'Rin Vale', 'Sector-9', 5);
`,
        solutionSql: `
SELECT name, district, clearance_level
FROM employees
WHERE clearance_level >= 4
  AND district = 'Sector-9'
ORDER BY clearance_level DESC, name ASC;
`,
        hints: [
          "This objective can be solved with SELECT, WHERE, and ORDER BY only.",
          "Both conditions must be true at the same time, so combine them with AND.",
          "Leave out extra columns so your result shape matches the expected output.",
        ],
        xp: 70,
        orderSensitive: true,
      },
    ],
  },
  {
    id: 4,
    code: "CROSSFIRE",
    title: "Join The Blind Spots",
    briefing:
      "This is a left join exercise. Start from the parent table, join the child table, and identify which parent rows have no matching children.",
    objectives: [
      {
        id: "obj-1",
        title: "Invisible Departments",
        narrative:
          "Find departments that do not currently have any employees assigned. The result should contain a single output column named department, so this is not a count query; it is a 'missing relationship' query.",
        acceptance: [
          "Start from departments and join employees.",
          "Use a LEFT JOIN so departments without employees still appear.",
          "Filter for the rows where no employee match exists.",
          "Return one column aliased as department and sort alphabetically.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL
);

INSERT INTO departments (id, name) VALUES
  (1, 'Cybernetics'),
  (2, 'Legal'),
  (3, 'Logistics'),
  (4, 'Pharma'),
  (5, 'Black Ops');

INSERT INTO employees (id, name, department_id) VALUES
  (1, 'Nyra Sol', 1),
  (2, 'Bram Kade', 3),
  (3, 'Mara Quill', 4),
  (4, 'Rin Vale', 1);
`,
        solutionSql: `
SELECT d.name AS department
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
WHERE e.id IS NULL
ORDER BY d.name;
`,
        hints: [
          "If you use INNER JOIN, the departments with no employees disappear before you can inspect them.",
          "The clue is the NULL produced on the employee side when a department has no match.",
          "You only need the department name in the final output.",
        ],
        xp: 80,
        orderSensitive: true,
      },
    ],
  },
  {
    id: 5,
    code: "HEADCOUNT",
    title: "Money Trail",
    briefing:
      "This objective introduces grouping. Join payouts to departments, collapse multiple payout rows into one row per department, and report the summed amount.",
    objectives: [
      {
        id: "obj-1",
        title: "Department Totals",
        narrative:
          "Summarize payouts by department. The output should show each department once, alongside the total amount paid to it, with the largest total listed first.",
        acceptance: [
          "Join departments to payouts through department_id.",
          "Aggregate the payout amounts with SUM.",
          "Return department name and a total_amount column.",
          "Group by the department fields needed for the select list.",
          "Order by total_amount descending.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE payouts (
  id INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  amount REAL NOT NULL
);

INSERT INTO departments (id, name) VALUES
  (1, 'Cybernetics'),
  (2, 'Legal'),
  (3, 'Logistics');

INSERT INTO payouts (id, department_id, amount) VALUES
  (1, 1, 42000.00),
  (2, 1, 9800.00),
  (3, 2, 76000.00),
  (4, 2, 18000.00),
  (5, 3, 11000.00),
  (6, 3, 9000.00);
`,
        solutionSql: `
SELECT d.name AS department, ROUND(SUM(p.amount), 2) AS total_amount
FROM departments d
INNER JOIN payouts p ON p.department_id = d.id
GROUP BY d.id, d.name
ORDER BY total_amount DESC;
`,
        hints: [
          "Think 'many payout rows become one row per department' and that should point you to GROUP BY.",
          "Do the join before the aggregation so you can output the department name.",
          "Name the aggregate output total_amount to match the expected column name.",
        ],
        xp: 90,
        orderSensitive: true,
      },
    ],
  },
  {
    id: 6,
    code: "THRESHOLD",
    title: "Filter The Aggregates",
    briefing:
      "This objective extends aggregation with post-group filtering. First compute totals per vendor, then keep only the vendors whose total crosses the threshold.",
    objectives: [
      {
        id: "obj-1",
        title: "Suspicious Vendors",
        narrative:
          "Group payments by vendor, calculate the total paid to each vendor, and then remove any groups whose total is 100000 or less. The result should list only the suspicious vendors, with the biggest total first.",
        acceptance: [
          "Group by vendor.",
          "Calculate SUM(amount) for each vendor.",
          "Filter after grouping so only totals above 100000 remain.",
          "Return vendor and total_paid, ordered by total_paid descending.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE vendor_payments (
  id INTEGER PRIMARY KEY,
  vendor TEXT NOT NULL,
  amount REAL NOT NULL
);

INSERT INTO vendor_payments (id, vendor, amount) VALUES
  (1, 'Orion Freight', 35000.00),
  (2, 'Orion Freight', 42000.00),
  (3, 'Orion Freight', 28000.00),
  (4, 'Silica Labs', 44000.00),
  (5, 'Silica Labs', 47000.00),
  (6, 'Mirage Legal', 60000.00),
  (7, 'Mirage Legal', 53000.00),
  (8, 'Nebula Med', 12000.00);
`,
        solutionSql: `
SELECT vendor, ROUND(SUM(amount), 2) AS total_paid
FROM vendor_payments
GROUP BY vendor
HAVING SUM(amount) > 100000
ORDER BY total_paid DESC;
`,
        requiredTokens: ["HAVING"],
        hints: [
          "Ask yourself whether the threshold applies to individual rows or to grouped totals. Here it applies after aggregation.",
          "That means the filter belongs in HAVING, not WHERE.",
          "Keep the final result to two columns: vendor and the summed total.",
        ],
        xp: 95,
        orderSensitive: true,
      },
    ],
  },
  {
    id: 7,
    code: "GHOST_PROTOCOL",
    title: "Hidden Correlations",
    briefing:
      "This objective is about computing one value and comparing rows against it. You need the overall average salary first, then you need to filter BLACKOUT assignees against that benchmark.",
    objectives: [
      {
        id: "obj-1",
        title: "Above Average In BLACKOUT",
        narrative:
          "Find employees assigned to BLACKOUT, but do not stop there: only keep the ones whose salary is above the overall average across the whole employees table. This is the point where a scalar subquery or CTE becomes useful.",
        acceptance: [
          "Join employees to assignments and projects so you can isolate BLACKOUT assignees.",
          "Compute the average salary across all employees, not just BLACKOUT assignees.",
          "Return only employees whose salary is above that overall average.",
          "Output name and salary, ordered by salary descending.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  salary REAL NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE assignments (
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  PRIMARY KEY (employee_id, project_id)
);

INSERT INTO employees (id, name, salary) VALUES
  (1, 'Nyra Sol', 122000.00),
  (2, 'Bram Kade', 88000.00),
  (3, 'Mara Quill', 99000.00),
  (4, 'Rin Vale', 131000.00),
  (5, 'Ivo Chen', 76000.00);

INSERT INTO projects (id, code) VALUES
  (1, 'BLACKOUT'),
  (2, 'NEON-RAIL');

INSERT INTO assignments (employee_id, project_id) VALUES
  (1, 1),
  (2, 1),
  (4, 1),
  (3, 2);
`,
        solutionSql: `
WITH avg_salary AS (
  SELECT AVG(salary) AS salary_avg FROM employees
)
SELECT e.name, e.salary
FROM employees e
INNER JOIN assignments a ON a.employee_id = e.id
INNER JOIN projects p ON p.id = a.project_id
CROSS JOIN avg_salary s
WHERE p.code = 'BLACKOUT'
  AND e.salary > s.salary_avg
ORDER BY e.salary DESC;
`,
        hints: [
          "There are really two subproblems: identify BLACKOUT assignees, and compute the company-wide average salary.",
          "The average is a single comparison value, so a scalar subquery or one-row CTE both fit.",
          "Be careful not to compute the average from only the filtered project members unless the prompt explicitly says to.",
        ],
        xp: 110,
        orderSensitive: true,
      },
    ],
  },
  {
    id: 8,
    code: "REDACTION",
    title: "Controlled Mutation",
    briefing:
      "This is another write-focused objective, but on a smaller schema. Update one row using a patch-style expression, then delete another row and rely on cascade behavior to clean up its dependent data.",
    objectives: [
      {
        id: "obj-1",
        title: "Patch And Purge",
        narrative:
          "Make two changes to the whistleblower data. First, patch WB-2 so the codename becomes NULLBIRD using a COALESCE-style update pattern. Second, delete WB-3 and let the foreign key cascade remove any linked leaks.",
        acceptance: [
          "Run an UPDATE that changes WB-2's codename to NULLBIRD.",
          "Use COALESCE in that UPDATE.",
          "Delete WB-3 from whistleblowers.",
          "After deletion, no leaks row should still reference WB-3.",
        ],
        mode: "assert",
        setupSql: `
PRAGMA foreign_keys = ON;

CREATE TABLE whistleblowers (
  id TEXT PRIMARY KEY,
  codename TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE leaks (
  id TEXT PRIMARY KEY,
  whistleblower_id TEXT NOT NULL REFERENCES whistleblowers(id) ON DELETE CASCADE,
  payload TEXT NOT NULL
);

INSERT INTO whistleblowers (id, codename, status) VALUES
  ('WB-1', 'GLASS', 'active'),
  ('WB-2', 'SPARROW', 'active'),
  ('WB-3', 'EMBER', 'inactive');

INSERT INTO leaks (id, whistleblower_id, payload) VALUES
  ('LK-1', 'WB-2', 'salary-snapshot'),
  ('LK-2', 'WB-3', 'board-call-transcript');
`,
        assertSql: `
SELECT CASE
  WHEN (SELECT codename FROM whistleblowers WHERE id = 'WB-2') = 'NULLBIRD'
   AND NOT EXISTS (SELECT 1 FROM whistleblowers WHERE id = 'WB-3')
   AND NOT EXISTS (SELECT 1 FROM leaks WHERE whistleblower_id = 'WB-3')
  THEN 1 ELSE 0 END AS pass;
`,
        requiredTokens: ["COALESCE", "DELETE"],
        hints: [
          "Treat this as two statements, and make sure the UPDATE targets only WB-2.",
          "The COALESCE pattern is there to reinforce partial-update thinking, even though this example has a fixed new value.",
          "Delete from whistleblowers and let the FK rule remove dependent leaks automatically.",
        ],
        xp: 120,
      },
    ],
  },
  {
    id: 9,
    code: "LOCKDOWN",
    title: "Atomic Writes",
    briefing:
      "This objective is about transactions. Several writes belong to one business action, so they must be wrapped in BEGIN and COMMIT rather than run as unrelated statements.",
    objectives: [
      {
        id: "obj-1",
        title: "Sealed Transfer",
        narrative:
          "Write one transaction that performs all three required changes together: decrease ACC-1 by 5000, increase ACC-2 by 5000, and insert the matching audit log row. The point is not just the updates, but grouping them into one atomic unit.",
        acceptance: [
          "Wrap the statements in a transaction using BEGIN and COMMIT.",
          "Subtract 5000 from ACC-1.",
          "Add 5000 to ACC-2.",
          "Insert audit log AUD-77 with note 'sealed transfer'.",
        ],
        mode: "assert",
        setupSql: `
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  balance REAL NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO accounts (id, balance) VALUES
  ('ACC-1', 50000.00),
  ('ACC-2', 20000.00);
`,
        assertSql: `
SELECT CASE
  WHEN (SELECT balance FROM accounts WHERE id = 'ACC-1') = 45000.00
   AND (SELECT balance FROM accounts WHERE id = 'ACC-2') = 25000.00
   AND EXISTS (
     SELECT 1 FROM audit_logs
     WHERE id = 'AUD-77' AND note = 'sealed transfer'
   )
  THEN 1 ELSE 0 END AS pass;
`,
        requiredTokens: ["BEGIN", "COMMIT"],
        hints: [
          "Count the work items first: there are two account updates and one audit insert.",
          "Put all three writes between BEGIN and COMMIT.",
          "Match the requested IDs and note text exactly so the validator can confirm the result.",
        ],
        xp: 130,
      },
    ],
  },
  {
    id: 10,
    code: "PROFILER",
    title: "Query Plan Hunt",
    briefing:
      "This is another optimization check. Create the right single-column index, then run a lookup that should benefit from it and inspect the plan output.",
    objectives: [
      {
        id: "obj-1",
        title: "Index Verification",
        narrative:
          "Improve lookups by employee_id in the transfers table. Build the named index on that column, then run EXPLAIN QUERY PLAN on a filter by employee_id = 7 so the planner can show whether the index is actually being used.",
        acceptance: [
          "Create an index named idx_transfers_employee on transfers(employee_id).",
          "Run EXPLAIN QUERY PLAN on a query filtering transfers by employee_id = 7.",
          "The planner output should show that the index is used.",
        ],
        mode: "assert",
        setupSql: `
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO transfers (id, employee_id, amount, created_at) VALUES
  (1, 2, 1000.00, '2087-01-11'),
  (2, 7, 900.00, '2087-01-13'),
  (3, 7, 1200.00, '2087-01-15'),
  (4, 5, 200.00, '2087-01-16'),
  (5, 9, 400.00, '2087-01-17'),
  (6, 7, 300.00, '2087-01-19'),
  (7, 4, 1100.00, '2087-01-20'),
  (8, 7, 450.00, '2087-01-21'),
  (9, 3, 700.00, '2087-01-22');
`,
        validate: (db) => {
          const indexExists = db
            .query(
              "SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name = 'idx_transfers_employee';",
            )
            .get() as { ok: number } | null;

          const planRows = db
            .query("EXPLAIN QUERY PLAN SELECT * FROM transfers WHERE employee_id = 7;")
            .all() as Array<{ detail: string }>;

          const usesIndex = planRows.some((row) =>
            row.detail.includes("USING INDEX idx_transfers_employee"),
          );

          if (!indexExists) {
            return { pass: false, detail: "Missing required index idx_transfers_employee." };
          }

          if (!usesIndex) {
            return {
              pass: false,
              detail:
                "Query plan is not using idx_transfers_employee yet. Re-run EXPLAIN QUERY PLAN after creating the index.",
            };
          }

          return { pass: true };
        },
        hints: [
          "Build the index on the same column used in the WHERE clause.",
          "After creating the index, rerun the lookup under EXPLAIN QUERY PLAN rather than guessing whether it helped.",
          "The objective checks both that the index exists and that the plan reflects it.",
        ],
        xp: 130,
      },
    ],
  },
  {
    id: 11,
    code: "PHANTOM",
    title: "NULL Forensics",
    briefing:
      "This objective is about NULL semantics. You need to filter missing badge values correctly and present a fallback display value for missing email addresses.",
    objectives: [
      {
        id: "obj-1",
        title: "Missing Badge Audit",
        narrative:
          "Return only the employees whose badge_id is missing. For each matching row, output the name plus a contact value that uses email when present and the literal 'no-email' when email is NULL.",
        acceptance: [
          "Filter rows where badge_id is NULL.",
          "Return name and a derived contact column.",
          "Build contact with COALESCE(email, 'no-email').",
          "Sort the result by name.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  badge_id TEXT,
  email TEXT
);

INSERT INTO employees (id, name, badge_id, email) VALUES
  (1, 'Nyra Sol', 'B-777', 'nyra@nexus.io'),
  (2, 'Bram Kade', NULL, 'bram@nexus.io'),
  (3, 'Mara Quill', NULL, NULL),
  (4, 'Rin Vale', 'B-121', 'rin@nexus.io');
`,
        solutionSql: `
SELECT name, COALESCE(email, 'no-email') AS contact
FROM employees
WHERE badge_id IS NULL
ORDER BY name;
`,
        requiredTokens: ["IS NULL", "COALESCE"],
        hints: [
          "Remember that NULL is not matched with equals comparison syntax.",
          "You are doing two NULL-related tasks here: filtering NULL badge_id values and substituting a fallback for NULL email values.",
          "Alias the fallback expression as contact so the output shape matches the prompt.",
        ],
        xp: 120,
        orderSensitive: true,
      },
    ],
  },
  {
    id: 12,
    code: "ASCENDANT",
    title: "Windowed Verdict",
    briefing:
      "This final objective is about window functions. You need to keep row-level output while adding rank and previous-row context, which is exactly what window functions are for.",
    objectives: [
      {
        id: "obj-1",
        title: "Final Ranking",
        narrative:
          "Produce the November 2087 report with four columns: executive, score, rank_in_month, and prev_score. To do that, compute each executive's previous score across months and rank executives within each month by score, then filter the final output down to month 2087-11.",
        acceptance: [
          "Use window functions to compute rank_in_month and prev_score.",
          "Rank rows within each month by score descending.",
          "Use the previous month score for each executive as prev_score.",
          "Return only the rows for month 2087-11.",
          "Sort by rank_in_month, then executive.",
        ],
        mode: "result",
        setupSql: `
CREATE TABLE suspicion_scores (
  executive TEXT NOT NULL,
  month TEXT NOT NULL,
  score INTEGER NOT NULL
);

INSERT INTO suspicion_scores (executive, month, score) VALUES
  ('Helix Ward', '2087-10', 61),
  ('Helix Ward', '2087-11', 82),
  ('Selene Pryce', '2087-10', 75),
  ('Selene Pryce', '2087-11', 79),
  ('Taro Venn', '2087-10', 52),
  ('Taro Venn', '2087-11', 88),
  ('Iris Dane', '2087-10', 81),
  ('Iris Dane', '2087-11', 88);
`,
        solutionSql: `
WITH scored AS (
  SELECT
    executive,
    month,
    score,
    DENSE_RANK() OVER (PARTITION BY month ORDER BY score DESC) AS rank_in_month,
    LAG(score) OVER (PARTITION BY executive ORDER BY month) AS prev_score
  FROM suspicion_scores
)
SELECT executive, score, rank_in_month, prev_score
FROM scored
WHERE month = '2087-11'
ORDER BY rank_in_month, executive;
`,
        requiredTokens: ["OVER", "LAG", "RANK"],
        hints: [
          "This is easier if you compute the window columns in a subquery or CTE first, then filter the outer query to the target month.",
          "There are two separate window definitions: one partitions by month for ranking, and one partitions by executive for the previous score.",
          "Keep the final projection to the four requested columns so the result shape stays clean.",
        ],
        xp: 160,
        orderSensitive: true,
      },
    ],
  },
];
