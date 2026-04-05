# DEAD SIGNAL Playbook

This playbook tells you exactly how to use the simulator as a project-based SQL lab.

## How to run

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Session routine (PJBL)

Use this 30-45 minute loop:

1. Read phase + acceptance checks.
2. Write SQL from scratch (or start from starter SQL and replace it).
3. Run and inspect validation message.
4. Fix until pass.
5. Write one sentence: what failed and why.
6. Advance to next phase.

## Current implementation status

- `Operation 01 (BLUEPRINT)` is implemented as a full five-phase workflow:
  - `ARCHITECT`
  - `POPULATE`
  - `INVESTIGATE`
  - `MUTATE`
  - `HARDEN`
- Operations 02-12 remain available in the campaign and can be upgraded to the same phase model.

## What each phase trains

- `ARCHITECT`: DDL quality (constraints, relations, delete behavior).
- `POPULATE`: FK-safe insert order and realistic seed shaping.
- `INVESTIGATE`: retrieval correctness and join logic.
- `MUTATE`: safe state change and relational side effects.
- `HARDEN`: index strategy and query plan verification.

## Pass criteria style

The simulator checks behavior, not copy-paste text:

- Schema objectives: `sqlite_master` + `PRAGMA` metadata checks.
- Query objectives: expected rows/columns and ordering when required.
- Mutation objectives: post-write state assertions.
- Performance objectives: index existence + `EXPLAIN QUERY PLAN` usage.

## Study map to SQL reference

Use `docs/sql/00-map.md` while playing:

- ARCHITECT -> `docs/sql/01-thinking-and-modeling.md`, `docs/sql/02-schema-and-constraints.md`
- POPULATE -> `docs/sql/03-insert-select-basics.md`, `docs/sql/13-seeding-and-order.md`
- INVESTIGATE -> `docs/sql/03-insert-select-basics.md`, `docs/sql/04-joins.md`, `docs/sql/05-aggregations-having.md`, `docs/sql/06-subqueries-ctes.md`, `docs/sql/10-null-semantics.md`, `docs/sql/11-window-functions.md`
- MUTATE -> `docs/sql/07-update-delete.md`, `docs/sql/08-transactions.md`
- HARDEN -> `docs/sql/09-indexes-explain.md`, `docs/sql/12-sqlite-vs-postgres.md`

## Notes for low-friction learning

- Hints are for momentum, not failure.
- Keep snippets you are proud of in your own scratch file.
- If validation fails, treat it like failing tests in backend development.
