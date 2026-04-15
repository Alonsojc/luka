# Luka System — ERP for Luka Poke House

## Overview

Luka is a multi-tenant ERP system for a Mexican poke restaurant chain. It covers inventory, purchasing, invoicing (CFDI/SAT), accounting, payroll, CRM, delivery, and analytics.

## Tech Stack

| Layer       | Technology                                  |
| ----------- | ------------------------------------------- |
| Frontend    | Next.js 15, React 19, Tailwind CSS, Radix UI |
| Backend     | NestJS 11, Passport JWT, BullMQ queues      |
| Database    | PostgreSQL 16, Prisma 6 ORM                 |
| Cache       | Redis 7, ioredis                            |
| Monorepo    | pnpm workspaces, Turborepo                  |
| CI/CD       | GitHub Actions → GHCR Docker images         |
| Testing     | Vitest (API), Playwright (E2E)              |

## Project Structure

```
apps/
  api/          NestJS backend (port 3001)
  web/          Next.js frontend (port 3002)
packages/
  database/     Prisma schema, migrations, seeds
  shared/       Shared types, Zod schemas, utilities
scripts/        Backup, load testing
nginx/          Reverse proxy config
```

## Quick Start

```bash
# Start Postgres + Redis
docker compose up -d

# Install deps
pnpm install

# Generate Prisma client & run migrations
pnpm db:generate
pnpm db:migrate

# Seed the database
pnpm db:seed

# Start dev servers
pnpm dev
```

## Commands

| Command               | Description                         |
| --------------------- | ----------------------------------- |
| `pnpm dev`            | Start all apps in dev mode          |
| `pnpm build`          | Build all packages and apps         |
| `pnpm lint`           | Run ESLint across the monorepo      |
| `pnpm format`         | Format code with Prettier           |
| `pnpm format:check`   | Check formatting without writing    |
| `pnpm test`           | Run all tests (Vitest)              |
| `pnpm db:generate`    | Generate Prisma client              |
| `pnpm db:migrate`     | Run database migrations (dev)       |
| `pnpm db:seed`        | Seed the database                   |
| `pnpm db:studio`      | Open Prisma Studio                  |

## Architecture Decisions

### Multi-tenancy
Every request is scoped to an `organizationId` via the `TenantInterceptor`. Prisma middleware automatically filters queries on org-scoped models. Never pass raw `organizationId` from user input — always extract it from the JWT.

### Authentication
- JWT access + refresh tokens stored in **httpOnly cookies** (not localStorage)
- CSRF protection via double-submit cookie pattern
- User profile stored in `localStorage` for UI only (not auth)

### RBAC
Roles: `owner`, `investor`, `zone_manager`, `branch_manager`, `accountant`, `cashier`
Permissions follow `module:action` pattern (e.g., `inventarios:create`).
- Backend: `@Roles("inventarios:create")` decorator + `RolesGuard`
- Frontend: `canAccessRoute()` utility + `useRouteGuard()` hook

### API Versioning
URI-based: `/api/v1/resource`. Default is `VERSION_NEUTRAL` for existing endpoints.

### Background Jobs
BullMQ + Redis for: CFDI timbrado, bank reconciliation, Corntech POS sync, audit logging.

## Conventions

### TypeScript
- Shared types live in `packages/shared/src/types/` — do NOT redefine interfaces per page
- Use `safeNum()` from `@luka/shared` for Prisma Decimal → number conversion
- Use `formatMXN()` from `@luka/shared` for currency formatting
- Zod schemas live in `packages/shared/src/schemas/`

### Frontend (Next.js)
- App Router with route groups: `(auth)` and `(dashboard)`
- Pages use `_components/` subdirectory for extracted components
- Data fetching: use React Query (`@tanstack/react-query`) with the `api` client
- Error handling: use `useToast()` hook from `@/components/ui/toast` — never swallow errors silently
- All dashboard pages are wrapped with `ToastProvider` via the dashboard layout
- Use `@luka/shared` types instead of local interfaces

### Backend (NestJS)
- One module per feature under `src/modules/`
- DTOs use `class-validator` decorators
- All mutations are audited via `AuditInterceptor` (use `@SkipAudit()` to opt out)
- `GlobalExceptionFilter` standardizes error responses
- Services should never expose `passwordHash` or `refreshToken` in responses

### Testing
- **API tests**: Vitest, located next to source files as `*.spec.ts`
- **E2E tests**: Playwright in `apps/web/e2e/`
- Run API tests: `pnpm --filter @luka/api test`
- Run E2E: `pnpm --filter @luka/web test:e2e`

### Database
- Prisma schema: `packages/database/prisma/schema.prisma`
- Always create a migration for schema changes: `pnpm db:migrate`
- Seed files: `seed.ts` (base), `seed-demo.ts` (demo data)

### Git & CI
- Feature branches off `main`
- CI runs: tests → build → Docker push (on main)
- ESLint + Prettier enforced in CI
- Security audit runs on every PR

## Environment Variables

See `.env.example` for all variables. Required in production:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — min 32 characters, no dev placeholders
- `JWT_REFRESH_SECRET` — min 32 characters, no dev placeholders

## Mexican-specific Features

- CFDI 4.0 invoicing (SAT compliance)
- RFC validation
- SAT product/service catalogs
- ISR/IMSS/SUA payroll calculations
- DIOT declarations
- Mexican states catalog
