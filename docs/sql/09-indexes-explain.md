# 09 - Indexes And EXPLAIN QUERY PLAN

Indexes help the database find rows faster, especially as tables grow.

```sql
CREATE INDEX idx_bookings_cabin_id
ON bookings(cabin_id);
```

Inspect the plan:

```sql
EXPLAIN QUERY PLAN
SELECT *
FROM bookings
WHERE cabin_id = 12;
```

## What to look for

- `SCAN`: full-table scan
- `SEARCH ... USING INDEX`: index-assisted lookup

## Good candidates for indexes

- Columns used often in `WHERE`
- Foreign keys used in joins
- Columns used often in `ORDER BY`

## Tradeoff

Every extra index also adds write cost for `INSERT`, `UPDATE`, and `DELETE`.
