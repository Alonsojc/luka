# Luka System - Load Test Report

## How to run

### Prerequisites

- The API must be running on `http://localhost:3001/api` (or set `API_URL`)
- A valid admin account must exist (default: `admin@lukapoke.com` / `Admin123!`)
- No external tools required -- only `curl`, `bc`, `awk`, and `sort` (standard on macOS/Linux)

### Basic usage

```bash
# Default: 10 concurrent users, 50 requests each
./scripts/load-test.sh

# Custom: 20 concurrent users, 100 requests each
./scripts/load-test.sh 20 100

# Light smoke test
./scripts/load-test.sh 2 5
```

### Environment overrides

```bash
# Test against staging
API_URL=https://staging.lukapoke.com/api ./scripts/load-test.sh 5 20

# Custom credentials
LOGIN_EMAIL=test@lukapoke.com LOGIN_PASSWORD=Test123! ./scripts/load-test.sh

# Specific branch for store dashboard
BRANCH_ID=abc123 ./scripts/load-test.sh
```

---

## Endpoints tested

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | No | Baseline latency, DB connectivity |
| `/branches` | GET | Yes | Simple CRUD list (all branches) |
| `/reportes/dashboard/investor` | GET | Yes | Heavy aggregation: multi-branch financials |
| `/reportes/dashboard/store/:branchId` | GET | Yes | Per-store dashboard with sales/inventory |
| `/inventarios/products` | GET | Yes | Product catalog list |
| `/notifications?limit=10` | GET | Yes | User notifications (paginated) |
| `/auth/login` | POST | No | Authentication + JWT issuance |
| `/auth/login` (rate-limit) | POST | No | 120 rapid requests to verify throttling |

---

## Expected baselines

These thresholds assume the API is running locally with a local PostgreSQL database.
Adjust upward for remote/staging/production environments with network latency.

| Endpoint | Avg (target) | P95 (target) | Notes |
|---|---|---|---|
| `/health` | < 50ms | < 100ms | Simple JSON response + DB ping |
| `/branches` | < 100ms | < 200ms | Small table, typically 10-15 rows |
| `/reportes/dashboard/investor` | < 500ms | < 1000ms | Multi-table aggregation, heaviest query |
| `/reportes/dashboard/store/:id` | < 300ms | < 600ms | Single-branch aggregation |
| `/inventarios/products` | < 200ms | < 400ms | Full product list (may grow) |
| `/notifications` | < 100ms | < 200ms | Indexed by userId, limited to 10 |
| `/auth/login` | < 200ms | < 400ms | bcrypt comparison is CPU-bound |

### Success rate targets

- All endpoints: >= 99% success rate under 10 concurrent users
- Health endpoint: 100% success rate (no auth, no DB writes)
- Rate limiting: at least some 429 responses when exceeding 5 login requests/minute

---

## What to do if tests fail

### High failure rate (> 5% of requests failing)

1. **Check the API is running**: `curl http://localhost:3001/api/health`
2. **Check database connectivity**: `curl http://localhost:3001/api/health/detailed`
3. **Check API logs**: `docker compose logs api --tail=100` or the terminal running the API
4. **Check for connection pool exhaustion**: if failures spike under concurrency, increase the Prisma connection pool in `DATABASE_URL` (`?connection_limit=20`)

### Slow response times (above baselines)

1. **Investor dashboard > 1s**: Check if database indexes exist on sales/financial tables. Run `EXPLAIN ANALYZE` on the dashboard query.
2. **Products list > 400ms**: If the product catalog has grown large, consider adding pagination.
3. **Auth login > 400ms**: bcrypt rounds may be too high. Default of 10 rounds is standard; check if it was increased.
4. **All endpoints slow**: Check CPU/memory usage on the host. Run `docker stats` if using containers.

### Rate limiting not working

1. Verify `ThrottlerModule` is imported in `app.module.ts` (global: 100 req/min)
2. Verify `@Throttle` decorator on auth controller (login: 5 req/min)
3. Check if `ThrottlerGuard` is registered as a global guard
4. If behind a reverse proxy, ensure `X-Forwarded-For` is being passed so throttling is per-client, not per-proxy

### Connection refused errors

1. API not started: `pnpm --filter api dev`
2. Wrong port: verify `PORT` in `.env` matches `API_URL`
3. Docker networking: if API is in Docker, use `host.docker.internal` or the container network

---

## Interpreting the summary table

```
ENDPOINT             METHOD   TOTAL      OK    FAIL     429   MIN(ms)   AVG(ms)   MAX(ms)   P95(ms)      RPS
────────────────────────────────────────────────────────────────────────────────────────────────────────────────
health               GET        500     500       0       0      2.1      12.3      45.6      28.1    142.5
```

- **TOTAL**: number of HTTP requests sent
- **OK**: responses with 2xx status codes
- **FAIL**: non-2xx responses (includes 429s)
- **429**: rate-limited responses specifically
- **MIN/AVG/MAX/P95(ms)**: response time distribution
- **RPS**: requests per second (wall-clock throughput)

---

## Scaling guidance

| Concurrent users | Expected behavior |
|---|---|
| 1-5 | All endpoints should respond within baseline thresholds |
| 10-20 | Slight increase in avg/p95 latency; zero failures expected |
| 50+ | DB connection pool may saturate; increase `connection_limit` |
| 100+ | Consider adding a connection pooler (PgBouncer) and horizontal scaling |

For production load testing, run from a separate machine to avoid resource contention with the API process.
