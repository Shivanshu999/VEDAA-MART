# Development guide

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL database running locally or in a reachable environment

## Install dependencies

npm install

## Environment setup

Copy .env.example to .env and fill in your values.

## Database setup

npm run db:generate
npm run db:push
npm run db:seed

## Run the stack

npm run dev

This starts the web app and API in parallel.

## Useful checks

- npm run typecheck
- npm test -w @vedaa/api
- cd packages/database && DATABASE_URL='postgresql://postgres:postgres@localhost:5432/vedaa?schema=public' npx prisma validate

## Notes

- The delivery schedule is fixed and server-side; browser clocks are never used for the actual assignment.
- Payment mode must remain in development unless Razorpay credentials are configured and the environment explicitly allows production usage.
- Production deployments should use environment variables and kept-secrets rather than committed credentials.

## Checkout and order creation

- Apply new database migrations to the intended environment with `npm exec -w @vedaa/database -- prisma migrate deploy`. Do not point this command at production during local testing.
- Checkout resolves the active store from the customer's cart and validates the saved address using `Address.isServiceable`. The current schema has no postal-code coverage or geographic service-area model, so this flag is the only serviceability rule; address creation currently marks addresses serviceable by default.
- Order creation recalculates prices, reserves stock, writes the order/payment-pending record and delivery snapshot, and removes the purchased cart rows in one serializable PostgreSQL transaction.
- Database integration tests run only when `TEST_DATABASE_URL` is explicitly set. Apply migrations to that isolated test database, then run `TEST_DATABASE_URL='<isolated test URL>' npm test -w @vedaa/api`. The tests create uniquely named records and clean them up; they do not reset the database.
- Order creation does not initialize or capture a payment. Orders remain `PENDING` with payment status `PENDING` until a later payment integration is implemented.
- Customer cancellation is allowed only before preparation (`PENDING` or `CONFIRMED`) and only while order/payment states are `PENDING` or `FAILED`. It does not refund or void a payment.
- Cancellation releases only reservation movements linked to that order. Older orders with unlinked reservation movements are deliberately not cancellable online because their reserved quantity cannot be attributed safely.
