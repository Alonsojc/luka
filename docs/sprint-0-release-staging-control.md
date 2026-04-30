# Sprint 0: Release and Staging Control

## Objective

Prevent a code-complete sprint from getting stuck because staging access, database migration, preview access, or smoke-test ownership is unclear.

This is a release-control sprint, not a product feature sprint.

## Root Cause

Sprint 7 was code-complete and CI-green, but final staging validation could not be completed from the working session because:

- There was no `DATABASE_URL` or `STAGING_DATABASE_URL` available locally.
- No GitHub repo secret or variable exposed a staging database URL.
- The Vercel preview was deployed, but protected by Vercel Authentication and returned `401` without an authenticated Vercel session.

The broken process was not Prisma, CI, or the alert code. The broken process was the missing release path between "PR is green" and "staging is migrated and smoke-tested."

## Minimal Fix

Add one manual GitHub Actions workflow:

- Workflow: `Staging Database Migration`
- Trigger: manual `workflow_dispatch`
- Required input: `MIGRATE_STAGING`
- Required GitHub Environment: `staging`
- Required environment secret: `STAGING_DATABASE_URL`

The workflow only runs `prisma migrate deploy` against staging. It does not deploy production, seed data, or run destructive database commands.

## Required Setup

In GitHub:

1. Open repository settings.
2. Create or confirm an Environment named `staging`.
3. Add environment secret `STAGING_DATABASE_URL`.
4. Recommended: require manual approval for the `staging` environment.

Do not store staging database credentials in `.env`, PR comments, issue comments, or workflow logs.

## Staging Migration Procedure

Use this when a PR includes a Prisma migration.

1. Confirm PR checks are green.
2. Open Actions.
3. Run `Staging Database Migration`.
4. Select the PR branch or merge candidate branch.
5. Enter `MIGRATE_STAGING`.
6. Wait for migration status before and after deploy.
7. If migration fails, do not merge. Fix forward in a new commit.

Local equivalent, only when a staging URL is intentionally available:

```bash
DATABASE_URL=<staging-db-url> pnpm --filter @luka/database exec prisma migrate deploy --schema=./prisma/schema.prisma
```

## Release Checklist

Before merge:

- CI `test` passes.
- CI `build` passes.
- CI `e2e` passes or has an explicit accepted reason if marked non-blocking.
- Vercel preview is ready.
- Prisma migrations have been applied to staging when schema changed.
- Smoke test is done against staging or preview with the staging API.
- PR has the smoke-test result in a comment.

After merge:

- Confirm the main-branch build/deploy starts.
- Confirm production migration path has run if production does not auto-run migrations.
- Run the smallest production smoke test for the touched area.

## Sprint 7 Smoke Test

Use this for the operational reconciliation alert dedupe change.

Expected behavior:

- First alert check for the same rule, branch scope, and date range may send WhatsApp.
- Second alert check for the same rule, branch scope, and date range must not send a duplicate WhatsApp.
- WhatsApp alert history must not show internal `__system_dedupe__` rows.

Steps:

1. Log in to staging.
2. Open `Alertas`.
3. Confirm there is an active `Reconciliacion Operativa` rule.
4. Run manual alert check once.
5. Run manual alert check a second time without changing rule, branch scope, or lookback days.
6. Confirm only one operator-facing WhatsApp/log is created for that rule/scope/range.
7. Confirm the second run is skipped/deduped.

Optional database verification:

```sql
SELECT alert_rule_id, dedupe_key, COUNT(*)
FROM alert_logs
WHERE dedupe_key LIKE 'operational-reconciliation:%'
GROUP BY alert_rule_id, dedupe_key
HAVING COUNT(*) > 1;
```

Expected result: zero rows.

## Rollback Rule

Prefer forward fixes.

For additive nullable migrations, like Sprint 7's `alert_logs.dedupe_key`, reverting application code is usually enough to stop using the new column. Do not drop columns or indexes in production unless there is a confirmed operational problem caused by the migration itself.

If rollback is needed:

1. Revert the application commit or merge commit.
2. Deploy the revert.
3. Confirm the affected workflow is stable.
4. Only then decide whether a database rollback migration is necessary.

## Done Criteria

Sprint 0 is done when:

- The staging migration workflow exists.
- `STAGING_DATABASE_URL` is configured in GitHub Environment `staging`.
- The release checklist is followed for schema-changing PRs.
- Each schema-changing PR records whether staging migration and smoke test passed.
