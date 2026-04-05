import type { Operation } from "./types";

export const OPERATIONS: Operation[] = [
  {
    id: 1,
    code: "BLUEPRINT",
    title: "Trace The Schema",
    briefing:
      "Aria's dump opens with organizational metadata. Before touching evidence, map the database surface and find which tables exist.",
    objectives: [
      {
        id: "obj-1",
        title: "Table Sweep",
        narrative:
          "Return every user-defined table name from this database in alphabetical order.",
        mode: "result",
        setupSql: `
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  clearance_level INTEGER NOT NULL CHECK(clearance_level BETWEEN 1 AND 5)
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT
);
`,
        solutionSql: `
SELECT name
FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`,
        hints: [
          "Use sqlite_master. It stores schema metadata.",
          "Filter rows to type = 'table' and exclude sqlite internal tables.",
          "Select only the name column and sort with ORDER BY name.",
        ],
        xp: 60,
        orderSensitive: true,
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
