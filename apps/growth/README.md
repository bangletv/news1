# @osn/growth

Discoverability, dynamic XML sitemaps, IndexNow submission, structured data, and pure-typography share cards.

## Search Engine Policy

- **Google**: Sitemaps and clean internal linking across continent, country, pillar, and deadline hub pages. Never uses the Google Indexing API (restricted to hosted `JobPosting` and `BroadcastEvent` content) and never emits `JobPosting` schema.
- **Bing / Yandex / Naver / Seznam**: Throttled IndexNow batch submission for newly verified items.
- **Share Cards**: Code-rendered typography PNGs (`src/og-card.ts`) via SVG + `@resvg/resvg-js`. No AI-generated imagery.
