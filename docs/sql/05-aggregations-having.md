# 05 - Aggregations And HAVING

Aggregation functions collapse rows into metrics.

- `COUNT`
- `SUM`
- `AVG`
- `MIN`
- `MAX`

```sql
SELECT department_id, COUNT(*) AS total
FROM employees
GROUP BY department_id;
```

## WHERE vs HAVING

- `WHERE`: filters rows before grouping.
- `HAVING`: filters groups after aggregation.

```sql
SELECT vendor, SUM(amount) AS total_paid
FROM vendor_payments
GROUP BY vendor
HAVING SUM(amount) > 100000;
```

## Important rule

Any non-aggregated column in `SELECT` must appear in `GROUP BY`.
