# Vedaa Mart

Vedaa Mart is a monorepo for a premium grocery commerce platform with a Next.js storefront, a Hono REST API, and a Prisma-backed PostgreSQL data layer.

## Overview

- Customer storefront with catalog, search, cart, account, checkout, and order tracking
- Admin dashboard for products, stores, inventory, customers, coupons, and delivery reporting
- Server-authoritative delivery scheduling in Asia/Kolkata (IST)
- PostgreSQL schema with Prisma migrations and inventory controls
- Razorpay-ready payment flow with development fallback mode

## Stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS
- API: Hono, Zod, TypeScript
- Database: PostgreSQL + Prisma
- Auth: Better Auth style session pattern
- Tests: Vitest

## Monorepo layout

- apps/web — storefront and admin interface
- apps/api — Hono REST API
- packages/database — Prisma schema, migrations, and generated client
- packages/shared — shared validation and utilities

## Quick start

1. Install dependencies:
   npm install
2. Copy environment variables:
   cp .env.example .env
3. Start PostgreSQL and set DATABASE_URL in your env file.
4. Run Prisma generation and seed:
   npm run db:generate
   npm run db:push
   npm run db:seed
5. Start the stack:
   npm run dev

## Scripts

- npm run dev — run web and API together
- npm run typecheck — run TypeScript checks across the monorepo
- npm test — run workspace tests
- npm run db:generate — generate Prisma client
- npm run db:migrate — create and apply migrations in dev
- npm run db:push — push schema changes for local development
- npm run db:seed — seed mock catalog and store data

## Delivery schedule

The business schedule is fixed and server-calculated in Asia/Kolkata. Intervals are half-open: the start timestamp is inclusive and the end timestamp is exclusive. The authoritative slot assignment is generated in the API module at apps/api/src/modules/delivery/delivery-schedule.service.ts.

## Deployment notes

- Use Vercel for the web app and a Node-compatible host for the API.
- Keep secrets in environment variables.
- Do not enable simulated payments in production.

## Current status

The project includes the foundation, the maintained Prisma schema, a working Better Auth session setup, role-based authorization helpers, and the required server-side delivery scheduling service with boundary tests. The current repo is ready for the next customer-facing commerce and admin workflow phases while preserving the server-authoritative delivery system.
