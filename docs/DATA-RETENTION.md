# Data Retention Policy

- **Published & Held Items**: Active verified items remain indexed until `expires_at` or source removal. Expired deadline opportunities move to the closed archive (`archive=closed`) for historical reference while preserving outbound link verification checks.
- **Rejected Items**: Retained in metadata storage for 90 days with content hashes solely to prevent re-ingestion of blocked items; never exposed via public `/api/v1/feed` or `/api/v1/out/:id`.
- **HMAC Replay Nonces**: Purged automatically after the 5-minute replay window (`expires_at < now`).
- **Reader Preferences**: Stored exclusively in the reader's browser (`localStorage`). No server-side reader profiles, tracking cookies, or behavioural telemetry are stored.
- **Source Suggestions (`/api/v1/suggest`)**: Reviewed periodically and purged after source evaluation or 180 days.
