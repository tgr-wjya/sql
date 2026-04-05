# SQL Reference — From Schema to Advanced Queries

> Examples use a clinic management system throughout. Your job is to map the concepts to your own domain.
>
> **Recommended companion resource:** [SQLiteTutorial.net](https://www.sqlitetutorial.net/) for SQLite-specific syntax, and [pgexercises.com](https://pgexercises.com/) when you're ready to move to PostgreSQL — it's interactive and exercise-based, not just reading.

---

## 1. Thinking in Tables

SQL forces you to model the world as **entities** (tables) and **relationships** (foreign keys, junction tables). Before writing a single line of SQL, ask:

1. What are my core nouns? → Those are your tables.
2. What's the cardinality? → One-to-one, one-to-many, or many-to-many?
3. What's nullable vs required? → That's your `NOT NULL` vs optional columns.

### Cardinality cheat sheet

| Relationship | Example | How to model |
|---|---|---|
| One-to-one | Patient ↔ Medical record | FK on either side |
| One-to-many | Doctor → Appointments | FK on the "many" side |
| Many-to-many | Patients ↔ Conditions | Junction table |

---

## 2. Schema Design + Constraints

```sql
CREATE TABLE departments (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE doctors (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  specialty     TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  hired_at      TEXT NOT NULL,   -- ISO 8601: '2021-03-15'
  notes         TEXT             -- nullable: no NOT NULL
);

CREATE TABLE patients (
  id         TEXT PRIMARY KEY,
  full_name  TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  email      TEXT UNIQUE,        -- unique but nullable
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Constraints worth knowing

| Constraint | What it does |
|---|---|
| `PRIMARY KEY` | Unique + not null. Only one per table. |
| `NOT NULL` | Column must have a value. |
| `UNIQUE` | No duplicates, but nulls are allowed (multiple NULLs OK in SQLite). |
| `REFERENCES` | Foreign key — links to another table's PK. |
| `DEFAULT` | Value used when you don't supply one. |
| `CHECK` | Arbitrary condition that must be true. |

```sql
-- CHECK example: status must be one of these values
CREATE TABLE appointments (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id  TEXT NOT NULL REFERENCES doctors(id)  ON DELETE RESTRICT,
  scheduled_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'scheduled'
             CHECK(status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes      TEXT
);
```

### ON DELETE behavior

| Option | What happens when the referenced row is deleted |
|---|---|
| `RESTRICT` | Blocks the delete if children exist |
| `CASCADE` | Deletes children automatically |
| `SET NULL` | Sets FK column to NULL |
| `SET DEFAULT` | Sets FK column to its default |

> SQLite requires `PRAGMA foreign_keys = ON` per connection for FK enforcement to actually run. Without it, FKs are declared but not enforced.

---

## 3. Many-to-Many — Junction Tables

A patient can have many conditions. A condition can affect many patients. You cannot model this with a single FK.

```sql
CREATE TABLE conditions (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,   -- 'hypertension', 'diabetes', etc.
  icd  TEXT                    -- optional ICD-10 code
);

-- Junction table: owns FKs to both sides
CREATE TABLE patient_conditions (
  patient_id   TEXT NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  condition_id TEXT NOT NULL REFERENCES conditions(id) ON DELETE CASCADE,
  diagnosed_at TEXT NOT NULL,
  PRIMARY KEY (patient_id, condition_id)  -- composite PK: no duplicates
);
```

The junction table **is the relationship**. It can carry its own data (when it was diagnosed, severity, etc.). This pattern appears everywhere — you'll recognize it the moment you see a table with two FK columns and a composite PK.

---

## 4. INSERT

```sql
-- Single row
INSERT INTO departments (id, name) VALUES ('dept-1', 'Cardiology');

-- Multiple rows
INSERT INTO patients (id, full_name, birth_date, email) VALUES
  ('p-1', 'Amara Nwosu',    '1985-04-22', 'amara@example.com'),
  ('p-2', 'Leon Hartmann',  '1991-11-03', NULL),
  ('p-3', 'Sofia Reyes',    '1978-07-14', 'sofia@example.com');

-- Insert from a SELECT result
INSERT INTO archived_appointments (id, patient_id, doctor_id, scheduled_at)
SELECT id, patient_id, doctor_id, scheduled_at
FROM appointments
WHERE status = 'cancelled' AND scheduled_at < '2024-01-01';
```

---

## 5. SELECT — Building Queries Up

Always think: **what rows do I want, from what table, filtered by what, grouped how, ordered by what.**

```sql
-- All columns
SELECT * FROM doctors;

-- Specific columns + alias
SELECT full_name AS name, specialty FROM doctors;

-- Filter
SELECT * FROM patients WHERE email IS NOT NULL;

-- NULL checks: always use IS NULL / IS NOT NULL, never = NULL
SELECT * FROM patients WHERE email IS NULL;

-- Pattern match
SELECT * FROM doctors WHERE specialty LIKE 'Cardio%';

-- Multiple conditions
SELECT * FROM appointments
WHERE status = 'scheduled'
  AND scheduled_at > '2025-01-01';

-- IN shorthand
SELECT * FROM appointments
WHERE status IN ('scheduled', 'no_show');

-- Sorting
SELECT * FROM patients ORDER BY birth_date ASC;

-- Limit + offset (pagination)
SELECT * FROM appointments
ORDER BY scheduled_at DESC
LIMIT 10 OFFSET 20;   -- page 3 of 10-per-page
```

---

## 6. JOINs

This is the most important concept in relational SQL. Read this section twice.

### INNER JOIN — only matching rows on both sides

```sql
-- Appointments with their patient and doctor names
SELECT
  a.id,
  a.scheduled_at,
  a.status,
  p.full_name AS patient_name,
  d.full_name AS doctor_name
FROM appointments a
INNER JOIN patients p ON a.patient_id = p.id
INNER JOIN doctors  d ON a.doctor_id  = d.id;
```

If an appointment references a patient that doesn't exist (data integrity bug), that row **disappears** from results. INNER JOIN only returns rows where the join condition is true on both sides.

### LEFT JOIN — all rows from left, nulls where right has no match

```sql
-- All doctors, with appointment count (including doctors with zero appointments)
SELECT
  d.full_name,
  d.specialty,
  COUNT(a.id) AS appointment_count
FROM doctors d
LEFT JOIN appointments a ON d.id = a.doctor_id
GROUP BY d.id, d.full_name, d.specialty;
```

If a doctor has no appointments, `a.id` is NULL and `COUNT(a.id)` returns 0. This is why you `COUNT(a.id)` not `COUNT(*)` — `COUNT(*)` counts the NULL row too.

### Finding "orphans" with LEFT JOIN + IS NULL

```sql
-- Doctors who have never had an appointment
SELECT d.full_name
FROM doctors d
LEFT JOIN appointments a ON d.id = a.doctor_id
WHERE a.id IS NULL;
```

This pattern is extremely common. You're using the NULL to identify rows with no match on the right side.

### JOIN summary

| Type | Returns |
|---|---|
| `INNER JOIN` | Only rows with matches on both sides |
| `LEFT JOIN` | All rows from left, NULLs where right has no match |
| `RIGHT JOIN` | All rows from right, NULLs where left has no match (rarely used — just flip the tables and use LEFT) |
| `FULL OUTER JOIN` | All rows from both sides, NULLs where either has no match (not supported in SQLite natively) |
| `CROSS JOIN` | Every row × every row — cartesian product, almost never what you want |

### Many-to-many JOIN — going through the junction table

```sql
-- All conditions for a specific patient
SELECT
  p.full_name AS patient,
  c.name      AS condition,
  pc.diagnosed_at
FROM patients p
INNER JOIN patient_conditions pc ON p.id = pc.patient_id
INNER JOIN conditions         c  ON c.id = pc.condition_id
WHERE p.id = 'p-1';
```

You always go **through** the junction table. There is no direct join from `patients` to `conditions`.

---

## 7. Aggregations

`COUNT`, `SUM`, `AVG`, `MIN`, `MAX` collapse many rows into one value.

```sql
-- Total appointments
SELECT COUNT(*) AS total FROM appointments;

-- Appointments per status
SELECT status, COUNT(*) AS count
FROM appointments
GROUP BY status;

-- Average appointments per doctor (subquery approach)
SELECT AVG(appointment_count) FROM (
  SELECT COUNT(*) AS appointment_count
  FROM appointments
  GROUP BY doctor_id
);
```

### GROUP BY rules

Every column in `SELECT` must either be:
1. Inside an aggregate function (`COUNT`, `SUM`, etc.), or
2. Listed in `GROUP BY`

Violating this is a logic error (SQLite lets it slide, PostgreSQL will reject it).

```sql
-- Correct
SELECT doctor_id, status, COUNT(*) AS total
FROM appointments
GROUP BY doctor_id, status;

-- Wrong in PostgreSQL, technically ambiguous
SELECT doctor_id, status, COUNT(*) AS total
FROM appointments
GROUP BY doctor_id;  -- status is neither aggregated nor in GROUP BY
```

---

## 8. HAVING — filtering on aggregated values

`WHERE` filters rows **before** grouping. `HAVING` filters **after**.

```sql
-- Doctors with more than 5 completed appointments
SELECT
  d.full_name,
  COUNT(a.id) AS completed_count
FROM doctors d
INNER JOIN appointments a ON d.id = a.doctor_id
WHERE a.status = 'completed'         -- filter rows before grouping
GROUP BY d.id, d.full_name
HAVING COUNT(a.id) > 5;             -- filter groups after aggregating
```

Rule of thumb: if the condition involves an aggregate function → `HAVING`. Otherwise → `WHERE`.

---

## 9. Subqueries

A subquery is a `SELECT` inside another statement. Use them when you need to reference an aggregated value in a filter, or build an intermediate result.

```sql
-- Patients who have more than 2 appointments
SELECT full_name FROM patients
WHERE id IN (
  SELECT patient_id
  FROM appointments
  GROUP BY patient_id
  HAVING COUNT(*) > 2
);

-- Appointments scheduled on the same day as the most recent one
SELECT * FROM appointments
WHERE DATE(scheduled_at) = (
  SELECT DATE(MAX(scheduled_at)) FROM appointments
);

-- Scalar subquery in SELECT column
SELECT
  full_name,
  (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) AS total_appointments
FROM patients p;
```

### CTE (Common Table Expression) — named subquery, cleaner

```sql
WITH active_patients AS (
  SELECT DISTINCT patient_id
  FROM appointments
  WHERE scheduled_at > date('now', '-90 days')
),
patient_condition_count AS (
  SELECT patient_id, COUNT(*) AS condition_count
  FROM patient_conditions
  GROUP BY patient_id
)
SELECT
  p.full_name,
  pcc.condition_count
FROM patients p
INNER JOIN active_patients      ap  ON p.id = ap.patient_id
INNER JOIN patient_condition_count pcc ON p.id = pcc.patient_id
ORDER BY pcc.condition_count DESC;
```

CTEs make complex queries readable by naming intermediate steps. Prefer them over deeply nested subqueries.

---

## 10. UPDATE

```sql
-- Full update
UPDATE appointments
SET status = 'completed', notes = 'Follow-up in 3 months'
WHERE id = 'appt-42';

-- Partial update with COALESCE — only overwrites if new value is not null
UPDATE doctors
SET
  specialty = COALESCE($specialty, specialty),
  notes     = COALESCE($notes, notes)
WHERE id = $id;
```

`COALESCE(x, y)` returns the first non-null value. If you pass `NULL` for `$specialty`, the existing value is kept. This is the PATCH pattern.

```sql
-- Update based on a join condition (via subquery in SQLite)
UPDATE appointments
SET status = 'no_show'
WHERE patient_id IN (
  SELECT id FROM patients WHERE email IS NULL
)
AND status = 'scheduled'
AND scheduled_at < datetime('now');
```

> SQLite doesn't support `UPDATE ... FROM` (JOIN in UPDATE) directly. Use a subquery. PostgreSQL supports `UPDATE ... FROM` natively.

---

## 11. DELETE

```sql
-- Single row
DELETE FROM appointments WHERE id = 'appt-7';

-- Conditional bulk delete
DELETE FROM appointments
WHERE status = 'cancelled'
  AND scheduled_at < date('now', '-1 year');

-- Delete via subquery
DELETE FROM patient_conditions
WHERE patient_id IN (
  SELECT id FROM patients WHERE created_at < '2020-01-01'
);
```

With `ON DELETE CASCADE`, deleting a patient automatically deletes their appointments and patient_conditions rows. Without it, the FK constraint blocks the delete.

---

## 12. Transactions

Multiple writes that must all succeed or all fail together.

```sql
BEGIN;

UPDATE doctors SET department_id = 'dept-2' WHERE id = 'doc-3';

INSERT INTO appointments (id, patient_id, doctor_id, scheduled_at, status)
VALUES ('appt-new', 'p-1', 'doc-3', '2025-06-01 09:00', 'scheduled');

COMMIT;

-- If anything goes wrong before COMMIT:
ROLLBACK;
```

In application code, you wrap this in a try/catch and call ROLLBACK in the catch block. In bun:sqlite, `db.transaction()` handles this automatically.

---

## 13. Indexes

An index is a separate data structure that lets SQLite find rows without scanning the entire table.

```sql
-- Index FK columns — always do this
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_id  ON appointments(doctor_id);

-- Index columns you frequently filter on
CREATE INDEX idx_appointments_status      ON appointments(status);
CREATE INDEX idx_appointments_scheduled   ON appointments(scheduled_at);

-- Composite index: useful when you filter on both columns together
CREATE INDEX idx_appointments_doctor_status ON appointments(doctor_id, status);

-- Unique index (same as UNIQUE constraint, explicit form)
CREATE UNIQUE INDEX idx_departments_name ON departments(name);
```

### When to index

- FK columns: always.
- Columns in `WHERE`, `ORDER BY`, or `JOIN ON`: if the table is large.
- Columns with high cardinality (many distinct values) benefit most.

### When indexes hurt

- Write-heavy tables: every INSERT/UPDATE/DELETE has to update all indexes on that table.
- Small tables: full scan is faster than index lookup below ~1000 rows.
- Don't pre-index everything. Add them when you have a query that's slow.

---

## 14. NULL — the tricky third state

NULL means "unknown" or "absent", not zero or empty string. This causes unintuitive behavior.

```sql
-- This returns nothing — NULL comparisons are always NULL (falsy)
SELECT * FROM patients WHERE email = NULL;

-- Correct
SELECT * FROM patients WHERE email IS NULL;
SELECT * FROM patients WHERE email IS NOT NULL;

-- NULL in arithmetic: any operation with NULL returns NULL
SELECT 5 + NULL;   -- NULL

-- NULL in aggregates: ignored by COUNT(col), SUM, AVG, etc.
SELECT AVG(rating) FROM reviews;   -- NULLs are excluded from the average

-- COALESCE: return first non-null
SELECT COALESCE(email, 'no email') FROM patients;

-- NULLIF: return NULL if two values are equal (useful to avoid division by zero)
SELECT total_revenue / NULLIF(total_appointments, 0) AS revenue_per_appt
FROM doctor_stats;
```

---

## 15. Window Functions

Available in SQLite 3.25+ and PostgreSQL. These apply a function **across a set of rows related to the current row**, without collapsing them into a single result like GROUP BY does.

```sql
-- Rank doctors by appointment count within each department
SELECT
  d.full_name,
  d.department_id,
  COUNT(a.id) AS appt_count,
  RANK() OVER (
    PARTITION BY d.department_id
    ORDER BY COUNT(a.id) DESC
  ) AS rank_in_dept
FROM doctors d
LEFT JOIN appointments a ON d.id = a.doctor_id
GROUP BY d.id, d.full_name, d.department_id;

-- Running total of appointments by date
SELECT
  DATE(scheduled_at) AS day,
  COUNT(*) AS daily_count,
  SUM(COUNT(*)) OVER (ORDER BY DATE(scheduled_at)) AS running_total
FROM appointments
GROUP BY DATE(scheduled_at);

-- Lag: compare current row to previous row
SELECT
  DATE(scheduled_at) AS day,
  COUNT(*) AS daily_count,
  LAG(COUNT(*)) OVER (ORDER BY DATE(scheduled_at)) AS prev_day_count
FROM appointments
GROUP BY DATE(scheduled_at);
```

### Common window functions

| Function | What it does |
|---|---|
| `ROW_NUMBER()` | Unique sequential number per row |
| `RANK()` | Rank with gaps for ties |
| `DENSE_RANK()` | Rank without gaps |
| `LAG(col, n)` | Value from n rows before current |
| `LEAD(col, n)` | Value from n rows after current |
| `SUM() OVER` | Running total |
| `AVG() OVER` | Rolling average |

The `PARTITION BY` clause is like GROUP BY but inside the window — it resets the calculation per group.

---

## 16. SQLite vs PostgreSQL — what changes

Most of what's above works in both. Know the differences before you migrate:

| Feature | SQLite | PostgreSQL |
|---|---|---|
| FK enforcement | Off by default, needs `PRAGMA foreign_keys = ON` | Always on |
| Data types | Flexible, stores anything anywhere | Strict, types enforced |
| `RETURNING` clause | Supported (3.35+) | Supported |
| `UPDATE ... FROM` | Not supported, use subquery | Supported |
| `FULL OUTER JOIN` | Not supported natively | Supported |
| `UPSERT` | `INSERT OR REPLACE` or `INSERT ... ON CONFLICT` | `INSERT ... ON CONFLICT` |
| JSON support | Basic (`json_extract`) | Rich (`jsonb`, operators, indexes) |
| Array columns | Not supported | Native `text[]`, `int[]`, etc. |
| Concurrent writes | Single writer (WAL helps, but limited) | Full concurrent writes |
| `NOW()` / `datetime` | `datetime('now')` | `NOW()` or `CURRENT_TIMESTAMP` |

When you move to PostgreSQL, the SQL you write is ~90% identical. The differences are mostly in the type system and a handful of syntax quirks.

---

## 17. Seeding data — the right way to think about it

Seed in dependency order: tables with no FKs first, then tables that reference them.

```
departments → doctors → patients → appointments → patient_conditions
```

Violating this order will fail on FK constraints (when enabled). In your seed script: always insert in this order, delete in reverse order.

```sql
-- Teardown order (reverse of creation)
DELETE FROM patient_conditions;
DELETE FROM appointments;
DELETE FROM patients;
DELETE FROM doctors;
DELETE FROM departments;
```

---

## External resources

| Resource | What for |
|---|---|
| [SQLiteTutorial.net](https://www.sqlitetutorial.net/) | SQLite-specific syntax and gotchas |
| [pgexercises.com](https://pgexercises.com/) | Interactive PostgreSQL exercises, great for JOINs and aggregations |
| [use-the-index-luke.com](https://use-the-index-luke.com/) | Deep dive into indexes — read this before you touch a production DB |
| [sql-practice.com](https://www.sql-practice.com/) | Practice with a hospital schema (relevant to this doc's examples) |
| [Drizzle docs — SQL dialects](https://orm.drizzle.team/docs/select) | When you're ready to see how raw SQL maps to an ORM query builder |
