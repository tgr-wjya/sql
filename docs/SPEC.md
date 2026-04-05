# Game Backlog Tracker — SQL Project Spec

> This is the vehicle for learning SQL with `bun:sqlite`. Every milestone maps to a real SQL concept.
> Don't use an ORM. Don't use a query builder. Raw SQL only — that's the whole point.
>
> The SQL reference doc is your companion. Use it when you're stuck on syntax, not before you try.

---

## What you're building

A CLI-queryable game backlog tracker. You should be able to:

- Add games with metadata (platform, genre(s), status, hours played)
- Query your backlog in various ways (by platform, by status, sorted by hours, etc.)
- Track individual play sessions (date + hours)
- Update game status (e.g., playing → completed)
- See stats (average hours per genre, completion rate per platform, etc.)

No frontend. No API yet. Just a `.ts` script that runs queries and prints results. The goal is fluency with SQL — the Hono migration comes after.

---

## Milestone 0 — The Bad Schema

**What you're doing:** Design the schema wrong on purpose. One table. Everything in it.

```
games
  id, title, platform, genre, status, hours_played, last_played
```

Seed it with ~10 rows. Write a few queries:
- All games on a specific platform
- Average hours by genre
- All games with status = 'completed'

**What you'll feel:** It works fine. Everything seems okay.

**Then ask yourself:**
- What if a game has multiple genres?
- What if I want to rename a platform and have it reflect everywhere?
- What if I want to log each play session separately, not just a cumulative total?

You can't do any of that cleanly with one table. That friction is the lesson — you're not reading about why normalization exists, you're hitting the wall yourself.

**When to move on:** When you've written the queries and felt at least one of those limitations concretely.

---

## Milestone 1 — Proper Schema

**What you're doing:** Break the flat table into a real relational schema.

Entities to identify:
- `games` — the core entity
- `platforms` — one-to-many with games (a game belongs to one platform)
- `genres` — many-to-many with games (a game can have multiple genres)
- `play_sessions` — one-to-many with games (a game can have many sessions)
- `statuses` — either a lookup table or a `CHECK` constraint on games

Deliverable: all `CREATE TABLE` statements written from scratch, no copy-paste from the reference. Include:
- Correct FK references with `ON DELETE` behavior chosen deliberately (not randomly)
- `CHECK` constraints where values are bounded (e.g., status)
- `PRAGMA foreign_keys = ON` at the top of every script

**The junction table is the big unlock here.** `game_genres` with a composite PK is the moment many-to-many clicks.

**When to move on:** Schema created, `PRAGMA` enabled, and you can explain *why* you chose `CASCADE` vs `RESTRICT` on at least one FK.

---

## Milestone 2 — Seed It

**What you're doing:** Write INSERT statements to populate every table with realistic data.

Rules:
- 3–4 platforms
- 6–8 genres
- 15–20 games with varied statuses and platforms
- Each game has 1–3 genres (this forces you to use the junction table)
- 30–40 play sessions spread across games (some games have many sessions, some have none)

**The critical thing:** Seed in dependency order — tables with no FKs first.

```
platforms → genres → games → game_genres → play_sessions
```

If you get an FK violation on insert, you seeded out of order. Fix the order, don't disable the pragma.

**When to move on:** All tables populated, no FK violations, `SELECT * FROM games` returns what you expect.

---

## Milestone 3 — JOINs That Lie to You

**What you're doing:** Write JOIN queries. Some of them will return wrong results silently — that's the point.

Write these in order:

1. All games with their platform name (INNER JOIN)
2. All platforms with a count of games on them — **including platforms with zero games** (LEFT JOIN + GROUP BY)
3. Platforms that have no games at all (LEFT JOIN + IS NULL)
4. All genres for a specific game — going through the junction table (double JOIN)
5. All games with their total hours played (sum across play_sessions) — including games with no sessions yet

**What to watch for:** Query 5 is the trap. If you use `SUM(ps.hours)` with an INNER JOIN, games with no sessions disappear from results entirely. You won't get an error — you'll just get fewer rows than you expected. Spot it, fix it.

`COUNT(a.id)` vs `COUNT(*)` matters here too — the reference doc explains why.

**When to move on:** All 5 queries return correct results, and you can explain the INNER vs LEFT difference in your own words.

---

## Milestone 4 — Aggregations and HAVING

**What you're doing:** Aggregate queries — the kind that give you stats about your data.

Write these:

1. Total hours played per platform
2. Average hours per genre (join through junction table)
3. Genres where the average hours played is above a threshold you pick
4. Games with more than 3 play sessions
5. The platform with the most completed games

Query 3 requires `HAVING` — you can't use `WHERE` with an aggregate value. If you try, SQLite will either error or silently give you wrong results. Experience that.

Query 5 will probably make you reach for a subquery or a CTE. Let it.

**When to move on:** All 5 correct. You know when to use `WHERE` vs `HAVING` without looking it up.

---

## Milestone 5 — Subqueries and CTEs

**What you're doing:** Queries that need intermediate results.

Write these:

1. Games where hours played is above the overall average (scalar subquery in WHERE)
2. The single most-played genre — without just eyeballing it (subquery in WHERE using MAX)
3. Rewrite query 1 or 2 as a CTE — compare readability
4. Games that have never been played (no play_sessions rows at all)

Query 4 is the orphan pattern — LEFT JOIN + IS NULL. You've seen it in Milestone 3 but the framing is different here. It should click faster this time.

**When to move on:** All 4 correct. You prefer CTEs over nested subqueries for anything more than one level deep (you'll know why by the end of this milestone).

---

## Milestone 6 — UPDATE and DELETE

**What you're doing:** Mutations with FK constraints in play.

Write these:

1. Mark a game as completed — partial update, only changing status (COALESCE pattern from the reference)
2. Update the hours on a specific play session
3. Delete a play session by ID
4. **Attempt** to delete a platform that has games on it — observe the FK block
5. Add `ON DELETE CASCADE` to the games → platforms FK and try again — watch the cascade

The COALESCE update (query 1) is the PATCH pattern you'll use in the Hono migration. The value is in writing it now so it's not new when you see it in application code.

**When to move on:** All 5 done. You've seen the difference between `RESTRICT` and `CASCADE` firsthand.

---

## Milestone 7 — Transactions

**What you're doing:** Two writes that must both succeed or both fail.

Scenario: When you mark a game as completed, you also want to log a final play session at the same time. These two writes are one logical operation — if the session insert fails, the status update should also roll back.

Steps:
1. Write both INSERTs/UPDATEs without a transaction. Simulate a failure between them (bad data, wrong ID, whatever). See the partial write — one succeeded, one didn't, your data is now inconsistent.
2. Wrap in `BEGIN / COMMIT`. Put the same failure in. Observe the rollback.
3. Rewrite using `db.transaction()` from `bun:sqlite` — same behavior, cleaner API.

**The moment:** When you see the partial write from step 1, that's when transactions stop being an abstract concept.

**When to move on:** You've seen a partial write failure without a transaction, and you've fixed it with one.

---

## Milestone 8 — EXPLAIN QUERY PLAN + Indexes

**What you're doing:** Look at what SQLite is actually doing under your queries.

```sql
EXPLAIN QUERY PLAN
SELECT * FROM games WHERE platform_id = 1;
```

Run that. Then:

1. Read what it says — if it says `SCAN games`, it's reading every row in the table.
2. Add an index: `CREATE INDEX idx_games_platform ON games(platform_id);`
3. Run EXPLAIN again. It should now say `SEARCH games USING INDEX`.

Do this for at least 3 queries:
- One filtering by FK column (platform_id)
- One filtering by a non-FK column (status)
- One with ORDER BY on a column that isn't indexed

**This is the "layer beneath" milestone.** You're not adding indexes because a tutorial told you to — you're watching the query plan change and understanding why it's faster.

**When to move on:** You've run EXPLAIN before and after on at least 3 queries and can read the output well enough to know when a table scan is happening.

---

## Done — what's next

After Milestone 8, open the `bun:sqlite` docs and start migrating the task API. Everything from the schema design to the `db.transaction()` wrapper will feel familiar because you've already done it by hand.

The jump to PostgreSQL later is mostly syntax differences — the SQL you write here is ~90% portable. The reference doc has the diff table when you need it.
