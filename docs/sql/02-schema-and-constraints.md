# 02 - Schema Design And Constraints

Constraints let the database reject bad data before your application has to deal with it.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE venues (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ticket_price NUMERIC NOT NULL CHECK(ticket_price >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'cancelled'))
);
```

## Constraints to know well

- `PRIMARY KEY`: row identity.
- `NOT NULL`: value must exist.
- `UNIQUE`: no duplicate values in that column or column set.
- `REFERENCES`: child row must point at a valid parent row.
- `CHECK`: value must satisfy a rule.
- `DEFAULT`: value used when one is not supplied.

## Composite rule example

```sql
CREATE TABLE seat_reservations (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_label TEXT NOT NULL,
  reserved_by TEXT NOT NULL,
  PRIMARY KEY (event_id, seat_label)
);
```

This means one seat can only be reserved once per event.

## ON DELETE behaviors

- `RESTRICT` or `NO ACTION`: parent row cannot be deleted while children exist.
- `CASCADE`: deleting the parent also deletes dependent rows.
- `SET NULL`: child remains, but loses the link.

Choose delete behavior based on meaning, not convenience.
