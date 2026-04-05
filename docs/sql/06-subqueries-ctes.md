# 06 - Subqueries And CTEs

Use subqueries when a query needs intermediate values.

## Scalar subquery

```sql
SELECT codename, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);
```

## IN subquery

```sql
SELECT codename
FROM employees
WHERE id IN (
  SELECT employee_id
  FROM employee_projects
);
```

## CTE

Use `WITH` to name intermediate results and improve readability.

```sql
WITH high_clearance AS (
  SELECT id, codename
  FROM employees
  WHERE clearance_level >= 4
)
SELECT hc.codename, p.code
FROM high_clearance hc
INNER JOIN employee_projects ep ON ep.employee_id = hc.id
INNER JOIN projects p ON p.id = ep.project_id;
```
