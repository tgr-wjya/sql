# 03 - INSERT And SELECT Basics

## INSERT

```sql
INSERT INTO venues (id, name, city)
VALUES (1, 'Riverside Hall', 'Chiang Mai');

INSERT INTO events (id, title, venue_id, starts_at, ticket_price, status) VALUES
  (101, 'Ceramics for Beginners', 1, '2026-06-10 10:00:00', 450, 'published'),
  (102, 'Night Market Sketch Walk', 1, '2026-06-11 18:30:00', 300, 'draft');
```

Use explicit column lists so inserts stay safe when the schema changes.

## SELECT building order

Think about a query in this order:

`FROM` -> `WHERE` -> `GROUP BY` -> `HAVING` -> `ORDER BY` -> `LIMIT`

```sql
SELECT title, ticket_price
FROM events
WHERE status = 'published'
  AND ticket_price <= 500
ORDER BY starts_at ASC
LIMIT 10;
```

## Common filters

- Pattern match: `title LIKE 'Night%'`
- Membership: `status IN ('draft', 'published')`
- Range: `ticket_price BETWEEN 200 AND 500`
- Null checks: `ended_at IS NULL`

## Small habit that helps

Start with `SELECT *` while exploring, then replace it with just the columns you actually need.
