# 13 - Seeding And Dependency Order

Insert parent tables before child tables.

Example order:

1. `departments`
2. `employees`
3. `projects`
4. `employee_projects`

Delete in reverse order during reset.

```sql
DELETE FROM employee_projects;
DELETE FROM projects;
DELETE FROM employees;
DELETE FROM departments;
```

If you hit FK violations, fix seed order first. Do not disable FK enforcement.
