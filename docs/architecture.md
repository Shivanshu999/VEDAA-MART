# Architecture

Vedaa Mart uses a monorepo structure with separate application boundaries for the storefront, API, and shared data concerns.

## Runtime layers

### Frontend

The web app is built with Next.js App Router and TypeScript. It renders the customer storefront and the admin dashboard, using server components and small client-side state when needed.

### API

The API runs under Hono and exposes versioned endpoints under /api/v1. It performs request validation, business rules, authentication, inventory checks, payment orchestration, and server-side delivery assignment.

### Authentication and authorization

The API uses the existing Better Auth session layer alongside the custom session middleware for request-scoped user binding and role checks. The middleware enforces auth and role guard rails centrally before route logic is executed.

### Data layer

PostgreSQL is managed with Prisma. Models include users, stores, products, categories, inventory, carts, orders, payments, and audit data. The Phase 2 schema additions cover account status, delivery-related address metadata, and admin/authorization support.

## Key principles

- Server-authoritative pricing and delivery scheduling
- Inventory reservation during checkout and cancellation release
- Role-based access checks for staff and admin tasks
- Timestamptz for all timestamp storage
- Business timezone fixed to Asia/Kolkata for scheduling

## Data flow

1. User browses catalog or admin tools.
2. Web app calls the API for product data and order operations.
3. API validates requests and checks auth and permissions.
4. Pricing, delivery, inventory, and payment logic run on the server.
5. Database writes occur within transactions where order safety matters.

## Observability and reliability

- Structured logs and consistent error handling are preference-level features in the API middleware.
- Database indexes are defined for time and order lookup paths.
- Order snapshots maintain delivery timing even if config changes later.
