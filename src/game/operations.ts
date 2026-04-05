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
      "This operation runs the full workflow simulator. You will design schema, seed data, investigate via joins, mutate safely, then harden performance.",
    objectives: [
      {
        id: "architect-1",
        phase: "ARCHITECT",
        title: "Design The Core Schema",
        narrative:
          "From scratch, build tables for departments, employees, projects, and employee_projects. This is design-first: your constraints decide whether later phases work.",
        acceptance: [
          "Create tables departments, employees, projects, employee_projects.",
          "departments.name is UNIQUE and NOT NULL.",
          "employees.clearance_level uses a CHECK bounded between 1 and 5.",
          "employee_projects has composite primary key (employee_id, project_id).",
          "Foreign keys link departments/projects/employees with sensible ON DELETE rules.",
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
          "Start with departments, then employees/projects, then employee_projects junction.",
          "Use PRAGMA foreign_keys = ON and explicit REFERENCES ... ON DELETE behavior.",
          "Your junction table should use PRIMARY KEY (employee_id, project_id).",
        ],
        xp: 140,
      },
      {
        id: "populate-1",
        phase: "POPULATE",
        title: "Seed The Leak Extract",
        narrative:
          "Insert leaked org records: 3 departments already exist. Add employees, projects, and employee-project links in safe dependency order.",
        acceptance: [
          "Insert four employees with IDs 101-104.",
          "Insert two projects with IDs 201 and 202.",
          "Insert three links into employee_projects.",
          "No FK violations while seeding.",
        ],
        starterSql: `INSERT INTO employees (id, codename, department_id, clearance_level) VALUES
  (101, 'Nyra Sol', 1, 5);

-- Continue remaining employees, then projects, then employee_projects`,
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
          "Seed order matters: employees/projects before employee_projects.",
          "Required employees: 101 Nyra Sol, 102 Bram Kade, 103 Mara Quill, 104 Ivo Chen.",
          "Required projects: 201 BLACKOUT dept 1, 202 GLASS-PORT dept 3.",
        ],
        xp: 110,
      },
      {
        id: "investigate-1",
        phase: "INVESTIGATE",
        title: "Trace Unauthorized Access",
        narrative:
          "Find every codename on BLACKOUT with clearance >= 4. Return codename and clearance_level sorted by clearance desc then codename asc.",
        acceptance: [
          "Join across employees, employee_projects, and projects.",
          "Filter code = BLACKOUT and clearance >= 4.",
          "Output columns: codename, clearance_level.",
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
          "This requires a many-to-many join through employee_projects.",
          "Project filter is p.code = 'BLACKOUT'.",
          "Sort by clearance desc then codename asc.",
        ],
        xp: 100,
        orderSensitive: true,
      },
      {
        id: "mutate-1",
        phase: "MUTATE",
        title: "Patch And Purge",
        narrative:
          "Patch employee 104 into department 3 via COALESCE pattern, then delete project 202 and let cascade remove its assignments.",
        acceptance: [
          "Use UPDATE with COALESCE for partial patch behavior.",
          "Delete project 202 from projects.",
          "After delete, employee_projects must have no rows pointing to project 202.",
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
          "Run UPDATE and DELETE as separate statements.",
          "The patch pattern uses COALESCE(new_value, existing_value).",
          "Delete from parent table projects and let CASCADE handle child rows.",
        ],
        xp: 100,
      },
      {
        id: "harden-1",
        phase: "HARDEN",
        title: "Index And Verify Plan",
        narrative:
          "The project assignment lookup is slow. Create an index for employee_projects(project_id), then prove EXPLAIN QUERY PLAN uses it.",
        acceptance: [
          "Create index idx_employee_projects_project_id on employee_projects(project_id).",
          "Run EXPLAIN QUERY PLAN for project_id = 201.",
          "Plan detail must show index usage, not full scan.",
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
          "Create index exactly on employee_projects(project_id).",
          "Use EXPLAIN QUERY PLAN with WHERE project_id = 201.",
          "Pass condition expects plan detail to include USING INDEX idx_employee_projects_project_id.",
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
      "An evidence packet arrived with broken references. Insert records in dependency order or foreign key checks will reject your write.",
    objectives: [
      {
        id: "obj-1",
        title: "Secure Audio Evidence",
        narrative:
          "Insert evidence EV-009 labeled 'Dead Signal Audio', then link it to incident INC-01 in incident_evidence.",
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
          "You need two INSERT statements, not one.",
          "Insert into evidence first. Then insert into incident_evidence.",
          "Values needed: EV-009, Dead Signal Audio, Wiretap Relay, INC-01.",
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
      "Security badges reveal an odd pattern: high-clearance staff in one district are overrepresented. Pull only what matters.",
    objectives: [
      {
        id: "obj-1",
        title: "High-Clearance List",
        narrative:
          "Return employee name, district, and clearance_level for staff with clearance >= 4 in district 'Sector-9'. Sort by clearance desc then name asc.",
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
          "Use WHERE with both conditions.",
          "Use AND, not OR.",
          "ORDER BY clearance_level DESC, name ASC.",
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
      "NEXUS org charts show departments with budget but no staff. Those ghosts are your lead.",
    objectives: [
      {
        id: "obj-1",
        title: "Invisible Departments",
        narrative:
          "List department names that currently have zero employees. Return one column named department and sort alphabetically.",
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
          "Start from departments and LEFT JOIN employees.",
          "Departments without matches produce NULL employee columns.",
          "Filter with WHERE e.id IS NULL.",
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
      "The payout ledger is noisy. Aggregate by department to expose which unit receives the largest total flow.",
    objectives: [
      {
        id: "obj-1",
        title: "Department Totals",
        narrative:
          "Return department name and total_amount from payouts. Group by department and order by total_amount DESC.",
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
          "Use SUM(amount) and GROUP BY department.",
          "Join departments to payouts first.",
          "Alias SUM(...) as total_amount so output matches objective.",
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
      "A shell vendor network hides in plain sight. The suspicious entities cross a payment threshold only visible after grouping.",
    objectives: [
      {
        id: "obj-1",
        title: "Suspicious Vendors",
        narrative:
          "Return vendor and total_paid for vendors whose summed payments are above 100000. Sort by total_paid DESC.",
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
          "Aggregate first with GROUP BY vendor.",
          "Filter aggregate with HAVING, not WHERE.",
          "Condition is SUM(amount) > 100000.",
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
      "The mole sits on BLACKOUT while drawing above-average compensation. This takes a subquery or CTE, not a flat filter.",
    objectives: [
      {
        id: "obj-1",
        title: "Above Average In BLACKOUT",
        narrative:
          "Return employee name and salary for BLACKOUT assignees whose salary is above overall company average. Sort by salary DESC.",
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
          "You need a comparison against AVG(salary) of all employees.",
          "Filter project code to BLACKOUT after joining assignments/projects.",
          "Use CTE or scalar subquery for the average value.",
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
      "Records are being altered. Apply a safe partial update, then remove a compromised source and verify cascade behavior.",
    objectives: [
      {
        id: "obj-1",
        title: "Patch And Purge",
        narrative:
          "Update whistleblower WB-2 codename to NULLBIRD using COALESCE pattern, then delete whistleblower WB-3.",
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
          "Run UPDATE and DELETE, likely as two statements.",
          "Use codename = COALESCE('NULLBIRD', codename) in UPDATE.",
          "Delete from whistleblowers where id = 'WB-3'. Cascade handles leaks.",
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
      "A transfer and an audit log must commit together. One without the other destroys evidence integrity.",
    objectives: [
      {
        id: "obj-1",
        title: "Sealed Transfer",
        narrative:
          "In one transaction, subtract 5000 from ACC-1, add 5000 to ACC-2, and insert audit row AUD-77 with note 'sealed transfer'.",
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
          "Use BEGIN, then all writes, then COMMIT.",
          "Two UPDATE statements on accounts + one INSERT into audit_logs.",
          "Match exact ID and note text for the audit row.",
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
      "The transfer log has grown large. Build the right index and prove SQLite switched from scan to indexed search.",
    objectives: [
      {
        id: "obj-1",
        title: "Index Verification",
        narrative:
          "Create index idx_transfers_employee on transfers(employee_id). Then run EXPLAIN QUERY PLAN for employee_id = 7.",
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
          "CREATE INDEX idx_transfers_employee ON transfers(employee_id);",
          "Then run EXPLAIN QUERY PLAN SELECT * FROM transfers WHERE employee_id = 7;",
          "Pass condition expects plan detail to include USING INDEX idx_transfers_employee.",
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
      "Missing values are deliberate. Treat NULL as unknown state, not zero, and surface records with absent badge data.",
    objectives: [
      {
        id: "obj-1",
        title: "Missing Badge Audit",
        narrative:
          "Return name and contact columns for employees with NULL badge_id. Use COALESCE(email, 'no-email') AS contact and sort by name.",
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
          "NULL filters require IS NULL, not = NULL.",
          "Use COALESCE(email, 'no-email') for display fallback.",
          "Sort output by name so ordering matches.",
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
      "Final board analysis. Rank executives by suspicion score and keep prior-month context in the same result set.",
    objectives: [
      {
        id: "obj-1",
        title: "Final Ranking",
        narrative:
          "For month 2087-11, return executive, score, rank_in_month, prev_score using window functions. Sort by rank_in_month then executive.",
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
          "Compute window columns first, then filter to month 2087-11.",
          "Use DENSE_RANK() OVER (PARTITION BY month ORDER BY score DESC).",
          "Use LAG(score) OVER (PARTITION BY executive ORDER BY month).",
        ],
        xp: 160,
        orderSensitive: true,
      },
    ],
  },
];
