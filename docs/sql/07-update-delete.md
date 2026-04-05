# 07 - UPDATE And DELETE

## UPDATE

Update only the rows you actually intend to change.

```sql
UPDATE events
SET status = 'published'
WHERE id = 102;
```

Patch-style update with `COALESCE`:

```sql
UPDATE customer_profiles
SET
  display_name = COALESCE($display_name, display_name),
  favorite_genre = COALESCE($favorite_genre, favorite_genre)
WHERE id = $id;
```

## DELETE

```sql
DELETE FROM cart_items
WHERE cart_id = 88
  AND product_id = 14;
```

## Safety habit

Write the matching `SELECT` first:

```sql
SELECT *
FROM cart_items
WHERE cart_id = 88
  AND product_id = 14;
```

If the `SELECT` returns the right rows, then convert it into `UPDATE` or `DELETE`.
