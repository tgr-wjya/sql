# DEAD SIGNAL Workflow Simulator Contract

This project is no longer query-only. It is a full SQL workflow simulator.

## Responsibility split

- Engine responsibility: narrative, progression, validation harness, hints, XP/rank.
- Learner responsibility: write SQL artifacts (DDL, seed DML, query DQL, mutation DML, performance SQL).

You are not building the game engine as the learning exercise.
You are building the SQL artifacts inside the simulator.

## Objective phases

Each operation can contain one or more of these phases:

1. `ARCHITECT` - build schema from requirements and constraints.
2. `POPULATE` - insert realistic seed data in correct FK order.
3. `INVESTIGATE` - retrieve evidence with precise SQL queries.
4. `MUTATE` - apply UPDATE/DELETE safely with integrity intact.
5. `HARDEN` - improve plans with index/transaction/EXPLAIN behavior.

## Validation model

Validation is strict on outcomes but flexible on implementation:

- Passes if behavior and constraints are correct.
- Fails if integrity or result requirements are not met.
- Does not require one exact query text, unless phase explicitly requires token usage.

Checks include:

- table existence from `sqlite_master`
- schema metadata from `PRAGMA table_info`, `PRAGMA foreign_key_list`
- uniqueness/index checks from `PRAGMA index_list`, `PRAGMA index_info`
- result-set comparison for evidence queries
- transactional or performance assertions using `EXPLAIN QUERY PLAN`

## Difficulty philosophy

- Keep friction meaningful, not punishing.
- Minimize ambiguity by exposing acceptance checks per objective.
- Allow multiple valid SQL solutions where possible.
- Penalize hints lightly to preserve flow.
