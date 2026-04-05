# 10 - NULL Semantics

`NULL` means unknown/absent, not zero and not empty string.

## Correct checks

```sql
SELECT * FROM employees WHERE badge_id IS NULL;
SELECT * FROM employees WHERE badge_id IS NOT NULL;
```

Never use `= NULL`.

## Helpers

```sql
SELECT COALESCE(email, 'no-email') AS contact
FROM employees;
```

```sql
SELECT total / NULLIF(count, 0)
FROM metrics;
```

`NULLIF` helps avoid divide-by-zero runtime errors.
