# 08 - Transactions

Use transactions when multiple writes must succeed or fail together.

```sql
BEGIN;

UPDATE accounts SET balance = balance - 5000 WHERE id = 'ACC-1';
UPDATE accounts SET balance = balance + 5000 WHERE id = 'ACC-2';
INSERT INTO audit_logs (id, note) VALUES ('AUD-77', 'sealed transfer');

COMMIT;
```

If any step fails before `COMMIT`, use:

```sql
ROLLBACK;
```

## Why it matters

- Prevents partial writes.
- Keeps business invariants consistent.
- Essential for money/state changes.
