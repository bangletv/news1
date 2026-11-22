# Operations Runbook — Kill Switches, Takedowns & Restore Drill

## 1. Kill Switches (Immediate Suppression)

- **Global emergency halt**:
  `npx tsx scripts/kill-switch.ts set global`
- **Per-source suppression** (e.g. publisher opt-out or compromised feed):
  `npx tsx scripts/kill-switch.ts set source:<source_id>`
- **Per-category suppression**:
  `npx tsx scripts/kill-switch.ts set category:<category_slug>`
- **GitHub Actions**: Trigger `.github/workflows/kill-switch.yml` via `workflow_dispatch`.

## 2. Publisher Takedown & Opt-Out Procedure (72-Hour Target)

1. Acknowledge the publisher request and record the timestamp.
2. Immediately activate the per-source kill switch (`source:<source_id>`).
3. Update `apps/pipeline/sources.yaml` to `status: disabled` and run `POST /api/v1/internal/unpublish` for affected items.
4. Confirm `/api/v1/out/:id` returns HTTP 403 and items no longer appear in `/api/v1/feed` or sitemaps.

## 3. D1 Scheduled Export to R2 & Restore Drill

```bash
# Scheduled nightly export (wrangler / CI cron)
npx wrangler d1 export osn-production --output=osn-backup-$(date +%F).sql
npx wrangler r2 object put osn-backups/osn-backup-$(date +%F).sql --file=osn-backup-$(date +%F).sql

# Quarterly restore drill into staging
npx wrangler r2 object get osn-backups/latest.sql --file=restore-check.sql
npx wrangler d1 execute osn-staging --file=restore-check.sql
```
