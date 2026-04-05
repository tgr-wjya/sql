# 01 - Thinking In Tables

Before writing queries, decide what the data actually is.

## Core questions

1. What are the things you store?
   These usually become tables.
2. How do those things relate?
   These usually become foreign keys or junction tables.
3. Which values are required, optional, unique, or limited?
   These become constraints.

## Example translation

Suppose you are tracking a neighborhood workshop program:

- workshops
- instructors
- attendees
- registrations

That does not mean "put everything in one table." It means:

- `workshops` stores workshop-level facts.
- `instructors` stores instructor-level facts.
- `registrations` links attendees to workshops.

## Cardinality quick map

- One-to-one: uncommon, but possible for split detail tables.
- One-to-many: foreign key lives on the "many" side.
- Many-to-many: use a junction table with two foreign keys.

## Modeling habit

- Store one fact in one place.
- Prefer explicit structure over application-only assumptions.
- If you find yourself storing comma-separated lists in one column, you probably need another table.
