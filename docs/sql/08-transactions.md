# 08 - Transactions

Use a transaction when several writes must either all succeed or all fail.

```sql
BEGIN;

UPDATE gift_cards
SET balance = balance - 250
WHERE id = 'GC-1001';

UPDATE gift_cards
SET balance = balance + 250
WHERE id = 'GC-2044';

INSERT INTO transfer_log (id, note)
VALUES ('TR-77', 'moved balance between gift cards');

COMMIT;
```

If something goes wrong before `COMMIT`, roll back the whole set:

```sql
ROLLBACK;
```

## Why transactions matter

- They prevent half-finished writes.
- They protect invariants across multiple statements.
- They matter for balances, inventory, reservations, and state transitions.
