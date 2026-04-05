# 04 - JOINs

## INNER JOIN

Returns only matching rows on both sides.

```sql
SELECT e.codename, d.name AS department
FROM employees e
INNER JOIN departments d ON d.id = e.department_id;
```

## LEFT JOIN

Returns all rows from left table and `NULL` when no match on right.

```sql
SELECT d.name, COUNT(e.id) AS employee_count
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name;
```

## Orphan pattern

```sql
SELECT d.name
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
WHERE e.id IS NULL;
```

## Many-to-many joins

Always join through the junction table.

```sql
SELECT e.codename, p.code
FROM employees e
INNER JOIN employee_projects ep ON ep.employee_id = e.id
INNER JOIN projects p ON p.id = ep.project_id;
```
