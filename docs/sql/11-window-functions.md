# 11 - Window Functions

Window functions compute across related rows without collapsing output like `GROUP BY`.

## Ranking

```sql
SELECT
  executive,
  month,
  score,
  DENSE_RANK() OVER (PARTITION BY month ORDER BY score DESC) AS rank_in_month
FROM suspicion_scores;
```

## Previous row value

```sql
SELECT
  executive,
  month,
  score,
  LAG(score) OVER (PARTITION BY executive ORDER BY month) AS prev_score
FROM suspicion_scores;
```

Common functions: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `LEAD`.
