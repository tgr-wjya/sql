# 02 - Schema Design And Constraints

Use constraints to enforce business rules at the database layer.

```sql
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
```

## Constraints to master

- `PRIMARY KEY`: unique identity.
- `NOT NULL`: required value.
- `UNIQUE`: no duplicates.
- `REFERENCES`: relational link.
- `CHECK`: bounded/validated values.
- `DEFAULT`: fallback value.

## ON DELETE behaviors

- `RESTRICT` / `NO ACTION`: block parent delete.
- `CASCADE`: delete dependent rows.
- `SET NULL`: null child FK.

Use `RESTRICT` for core ownership and `CASCADE` for dependent data you never want orphaned.
