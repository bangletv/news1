# @osn/api

Cloudflare Workers API (`/api/v1`) backed by D1 and KV.

## Endpoints

- `GET /api/v1/feed` — Cursor-paginated verified feed with `continent`, `country`, `pillar`, `category`, `lang`, and `archive` filters.
- `GET /api/v1/items/:id` — Single item inspection (excludes internal `source_priority`).
- `GET /api/v1/out/:id` — `302` redirect strictly to stored `canonical_url` within the source allowlist (never user-supplied URLs, never `rejected` or `held` items).
- `GET /api/v1/stats`, `GET /api/v1/sources`, `GET /api/v1/health`
- `POST /api/v1/suggest` — Rate-limited, spam-filtered source suggestion submission.
- `POST /api/v1/internal/ingest` & `POST /api/v1/internal/unpublish` — HMAC-SHA256 signed with 5-minute window and nonce replay protection.
- `GET /api/v1/sitemap-index.xml`, `GET /api/v1/og/:id.png`
