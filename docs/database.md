# Database design

The database layer is defined in packages/database/prisma/schema.prisma and uses Prisma with PostgreSQL.

## Core models

- User, Session, Account, Verification
- Address
- Store and StoreStaff
- Category and Product
- ProductImage
- StoreInventory and InventoryMovement
- Cart and CartItem
- Order and OrderItem
- Payment
- Coupon and CouponRedemption
- Delivery
- AuditLog

## Planned monetary handling

Monetary values are represented using Prisma Decimal-compatible fields, and the API serializes prices and totals as numbers for app-level usage while keeping database schema semantically precise.

## Time handling

All timestamps are stored with timestamptz semantics. The delivery schedule uses a fixed business timezone of Asia/Kolkata and stores the scheduledDeliveryAt snapshot directly on each order.

## Indexes and constraints

- User email uniqueness and role index
- Store inventory unique pairs per store and product
- Order indexes by user, date, delivery slot, and scheduled delivery time
- Coupon uniqueness by code
- Payment and idempotency uniqueness for order safety

## Local development

- npm run db:generate
- npm run db:push
- npm run db:seed

The seed script populates sample categories, products, inventory, and basic store and admin users for local development.
