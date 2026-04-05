# 01 - Thinking In Tables

Before writing SQL, model your domain.

## Core questions

1. What are the entities? -> tables.
2. What are the relationships? -> foreign keys or junction table.
3. What is required vs optional? -> `NOT NULL` vs nullable columns.

## Cardinality quick map

- One-to-one: FK on one side.
- One-to-many: FK on the many side.
- Many-to-many: junction table with two FKs.

## Backend mindset

- A table is an API contract for data integrity.
- Bad modeling creates app bugs you cannot patch cleanly later.
- Good modeling reduces application branching and defensive code.
