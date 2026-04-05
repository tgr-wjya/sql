# 06 - Subqueries And CTEs

Use subqueries and CTEs when a query becomes easier to understand in stages.

## Scalar subquery

Compare each row to one computed value.

```sql
SELECT name, nightly_rate
FROM cabins
WHERE nightly_rate > (
  SELECT AVG(nightly_rate)
  FROM cabins
);
```

## `IN` subquery

Filter one table based on results from another.

```sql
SELECT name
FROM customers
WHERE id IN (
  SELECT customer_id
  FROM bookings
  WHERE status = 'confirmed'
);
```

## CTE

Use `WITH` to name an intermediate result and make the final query easier to read.

```sql
WITH summer_bookings AS (
  SELECT cabin_id, guest_count
  FROM bookings
  WHERE check_in_date BETWEEN '2026-06-01' AND '2026-08-31'
)
SELECT c.name, COUNT(*) AS booking_count
FROM cabins c
INNER JOIN summer_bookings sb ON sb.cabin_id = c.id
GROUP BY c.id, c.name;
```

Reach for a CTE when the logic is valid but hard to scan in one long statement.
