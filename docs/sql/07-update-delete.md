# 07 - UPDATE And DELETE

## UPDATE

```sql
UPDATE employees
SET clearance_level = 5
WHERE id = 101;
```

Patch pattern with `COALESCE`:

```sql
UPDATE employees
SET
  codename = COALESCE($codename, codename),
  department_id = COALESCE($department_id, department_id)
WHERE id = $id;
```

## DELETE

```sql
DELETE FROM employee_projects
WHERE employee_id = 101
  AND project_id = 201;
```

Deleting parent rows depends on FK delete behavior (`RESTRICT`, `CASCADE`, `SET NULL`).
