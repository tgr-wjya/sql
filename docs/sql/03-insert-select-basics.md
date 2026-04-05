# 03 - INSERT And SELECT Basics

## INSERT

```sql
INSERT INTO departments (id, name) VALUES (1, 'Cybernetics');

INSERT INTO employees (id, codename, department_id, clearance_level) VALUES
  (101, 'Nyra Sol', 1, 5),
  (102, 'Bram Kade', 1, 4);
```

## SELECT building order

Think in this sequence:

`FROM` -> `WHERE` -> `GROUP BY` -> `HAVING` -> `ORDER BY` -> `LIMIT`.

```sql
SELECT codename, clearance_level
FROM employees
WHERE clearance_level >= 4
ORDER BY clearance_level DESC, codename ASC
LIMIT 10;
```

## Common filters

- Pattern: `LIKE 'Neo%'`
- List: `IN ('active', 'inactive')`
- Range: `BETWEEN 1 AND 5`
- Null checks: `IS NULL` / `IS NOT NULL`
