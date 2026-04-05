# 05 - Aggregations And HAVING

Aggregation functions turn many rows into summary values.

- `COUNT`
- `SUM`
- `AVG`
- `MIN`
- `MAX`

```sql
SELECT venue_id, COUNT(*) AS published_events
FROM events
WHERE status = 'published'
GROUP BY venue_id;
```

## WHERE vs HAVING

- `WHERE` filters rows before grouping.
- `HAVING` filters grouped results after aggregation.

```sql
SELECT category, AVG(price) AS average_price
FROM menu_items
GROUP BY category
HAVING AVG(price) >= 180;
```

## Common mistake

If a column appears in `SELECT` and is not wrapped in an aggregate function, it usually needs to appear in `GROUP BY` too.

## Read the question carefully

- "How many rows?" often means `COUNT(*)`
- "Per X" often means `GROUP BY`
- "Only groups above/below a threshold" often means `HAVING`
