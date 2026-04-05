# 12 - SQLite vs PostgreSQL

Most SQL concepts transfer directly. Key differences:

- FK enforcement: SQLite needs `PRAGMA foreign_keys = ON`; PostgreSQL always enforces.
- Type strictness: SQLite is flexible; PostgreSQL is strict.
- `UPDATE ... FROM`: PostgreSQL supports it; SQLite usually needs subquery approach.
- `FULL OUTER JOIN`: PostgreSQL supports; SQLite does not natively.
- Concurrent writes: PostgreSQL handles high concurrency better.

Practical rule: learn relational logic in SQLite, then adjust syntax/types when moving to PostgreSQL.
