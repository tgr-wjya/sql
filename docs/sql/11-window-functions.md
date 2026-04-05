# 11 - Window Functions

Window functions calculate across related rows without collapsing the result like `GROUP BY` does.

## Ranking example

```sql
SELECT
  artist_name,
  festival_day,
  audience_score,
  DENSE_RANK() OVER (
    PARTITION BY festival_day
    ORDER BY audience_score DESC
  ) AS rank_for_day
FROM performance_reviews;
```

## Previous row value

```sql
SELECT
  route_name,
  recorded_on,
  riders,
  LAG(riders) OVER (
    PARTITION BY route_name
    ORDER BY recorded_on
  ) AS previous_day_riders
FROM ridership_snapshots;
```

Common window functions:

- `ROW_NUMBER`
- `RANK`
- `DENSE_RANK`
- `LAG`
- `LEAD`
- `SUM(...) OVER (...)`
