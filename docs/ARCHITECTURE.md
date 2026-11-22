# System Architecture — TheOpenSource.news

Operated by **UK School of Artificial Intelligence Ltd** (Company No. 17041560, London). Licensed under MIT.

## Core Data Flow

```text
  sources.yaml (validated)
         │
         ▼
  @osn/pipeline (Cron + Queues)
    ├─ Harvest: robots.txt, ETag/If-Modified-Since, item_index -> canonical_url
    ├─ Classify: Gemini 4 Hydrogen (JSON enums only) + Deterministic Fallback
    └─ Verify: DNS/IP SSRF guard -> redirects (<=5) -> HTTP 200 -> match >= 0.8
         │
         │ HMAC-SHA256 + 5-min window + nonce
         ▼
  @osn/api (Cloudflare Worker / Express Bridge + D1 + KV)
    ├─ Public: /api/v1/feed, /items/:id, /out/:id (302 allowlist), /stats, /sources
    ├─ Discovery: /api/v1/sitemap-index.xml, /sitemaps/*.xml, /og/:id.png
    └─ Safety: global, per-source, and per-category KV kill switches
         │
         ▼
  @osn/web (British English & Bengali UI, RTL-ready, localStorage preferences)
```

## Non-Negotiable Invariants

- **Verbatim Headlines**: Publisher headlines are never rewritten, translated, or summarised.
- **No AI Images**: OpenGraph and Facebook share cards (`GET /api/v1/og/:id.png`) are code-rendered typography PNGs via SVG and `@resvg/resvg-js`.
- **Internal Priority Isolation**: `source_priority` (1–4) guides ranking and duplicate clustering inside D1/API logic and is stripped by `toPublicItem` before any response leaves `/api/v1`.
