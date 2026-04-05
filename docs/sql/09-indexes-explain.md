# 09 - Indexes And EXPLAIN QUERY PLAN

Indexes speed read paths by avoiding full table scans.

```sql
CREATE INDEX idx_employee_projects_project_id
ON employee_projects(project_id);
```

Inspect plan:

```sql
EXPLAIN QUERY PLAN
SELECT *
FROM employee_projects
WHERE project_id = 201;
```

Look for:

- `SCAN` -> full scan (usually slower at scale).
- `SEARCH ... USING INDEX` -> index-assisted lookup.

## When to index

- Frequent `WHERE` columns.
- Join keys.
- Sort-heavy columns.

## Cost

More indexes = slower writes (`INSERT`, `UPDATE`, `DELETE`).
