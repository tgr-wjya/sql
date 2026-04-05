# 12 - SQLite vs PostgreSQL

Most relational ideas transfer directly between SQLite and PostgreSQL, but some behavior differs.

- Foreign keys: SQLite requires `PRAGMA foreign_keys = ON`; PostgreSQL enforces them by default.
- Typing: SQLite is flexible with column types; PostgreSQL is stricter.
- Feature set: PostgreSQL supports features such as `FULL OUTER JOIN` and `UPDATE ... FROM`.
- Concurrency: PostgreSQL handles many concurrent writers much better.
- Deployment style: SQLite is file-based; PostgreSQL runs as a database server.

Practical rule: learn modeling, joins, aggregation, and constraints first. Then adjust syntax and operational details for the database you deploy.
