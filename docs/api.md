# API overview

The service layer is mounted under /api/v1 and organized by route modules in apps/api/src/routes/v1.

## Route groups

- /products — catalog and product lookup
- /categories — category listing
- /delivery — fixed-slot preview and reporting
- /addresses — customer address CRUD
- /cart — cart management
- /orders — order history and cancellation
- /payments — server-side payment order flow
- /admin — protected admin actions

## Validation model

The API uses Hono with Zod validation for request bodies and query parameters. This helps ensure invalid values are rejected before entering the core business layer.

## Security expectations

- Auth required for customer order and address actions
- Admin endpoints should validate appropriate roles and store ownership
- Never trust browser prices, stock, or payment values
- Verify signatures on payment webhooks and server-side verification flows

## Example use

- GET /api/v1/products
- GET /api/v1/products/:slug
- POST /api/v1/orders
- GET /api/v1/orders/:id
- POST /api/v1/webhooks/razorpay

The current implementation contains the base route scaffolding and the delivery service logic needed for the schedule engine and core order flow.
