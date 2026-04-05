# 10 - NULL Semantics

`NULL` means "missing" or "unknown." It does not mean zero, false, or empty text.

## Correct checks

```sql
SELECT *
FROM library_members
WHERE phone_number IS NULL;

SELECT *
FROM library_members
WHERE phone_number IS NOT NULL;
```

Never write `= NULL`.

## Useful helpers

```sql
SELECT COALESCE(nickname, full_name) AS display_name
FROM library_members;
```

```sql
SELECT total_pages / NULLIF(chapter_count, 0)
FROM manuscripts;
```

`COALESCE` gives you the first non-null value.

`NULLIF(a, b)` returns `NULL` when `a = b`, which is handy for avoiding divide-by-zero errors.
