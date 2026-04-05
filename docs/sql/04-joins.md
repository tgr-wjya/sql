# 04 - JOINs

JOINs combine rows across related tables.

## INNER JOIN

Returns only rows with a match on both sides.

```sql
SELECT e.title, v.name AS venue_name
FROM events e
INNER JOIN venues v ON v.id = e.venue_id;
```

## LEFT JOIN

Returns every row from the left table, even when no match exists on the right.

```sql
SELECT v.name, COUNT(e.id) AS event_count
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
GROUP BY v.id, v.name;
```

## Find missing relationships

This pattern is useful for spotting rows with no related records.

```sql
SELECT v.name
FROM venues v
LEFT JOIN events e ON e.venue_id = v.id
WHERE e.id IS NULL;
```

## Many-to-many example

Suppose recipes can use many ingredients, and each ingredient can appear in many recipes.

```sql
SELECT r.name, i.name AS ingredient
FROM recipes r
INNER JOIN recipe_ingredients ri ON ri.recipe_id = r.id
INNER JOIN ingredients i ON i.id = ri.ingredient_id;
```

The junction table is what turns two one-to-many links into a many-to-many model.
