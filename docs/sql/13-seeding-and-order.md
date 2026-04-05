# 13 - Seeding And Dependency Order

When seeding relational data, insert parent rows before child rows.

Example order for a shop dataset:

1. `categories`
2. `products`
3. `customers`
4. `orders`
5. `order_items`

Reset in reverse order:

```sql
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM products;
DELETE FROM customers;
DELETE FROM categories;
```

If foreign key errors appear during seeding, check row order before changing anything else.
