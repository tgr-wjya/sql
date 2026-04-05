# sql

### 30 March 2026

> my onboarding to sql territory

its time that i finally learn how to write the database myself, before touching orm of course.

sqlite focused, though i could also use postgresql for this.

## DEAD SIGNAL (web SQL game)

A playable SQL detective campaign built on Bun + Elysia + SQLite.

### Run locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

### Gameplay loop

- Read operation briefing and objective phase
- Write SQL artifacts directly (DDL, INSERT, SELECT, UPDATE/DELETE, INDEX)
- Run SQL and inspect validation feedback
- Use hints when blocked (costs XP)
- Advance after solving each objective

### Workflow simulator phases

The game now supports project-based SQL phases inside operations:

- `ARCHITECT`: design schema and constraints from scratch
- `POPULATE`: seed realistic data in dependency order
- `INVESTIGATE`: solve query/evidence objectives
- `MUTATE`: apply updates/deletes with FK consequences
- `HARDEN`: optimize with indexes and query plan checks

Validation is behavior-first: you can write your own SQL approach, but hidden checks enforce
the required database outcomes and integrity rules.

See `docs/WORKFLOW.md` for the learning contract and validation philosophy.
Use `docs/PLAYBOOK.md` for day-to-day execution and phase-to-reference mapping.
SQL reference is split by topic under `docs/sql/` (entrypoint: `docs/sql/00-map.md`).

The campaign currently ships 12 operations mapped to core backend SQL topics:
schema, inserts, filtering, joins, aggregates, HAVING, CTE/subquery, updates/deletes,
transactions, indexes/query plans, NULL semantics, and window functions.

## find me

[portfolio](https://tgr-wjya.github.io) · [linkedin](https://linkedin.com/in/tegar-wijaya-kusuma-591a881b9) · [email](mailto:tgr.wjya.queue.top126@pm.me)

---

made with ◉‿◉
