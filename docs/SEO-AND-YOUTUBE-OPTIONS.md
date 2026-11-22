# SEO, Search Guidelines & YouTube Digest Options

## Verified Search Engine Guidelines (Checked 21 November 2026)

1. **Google Search Central Indexing API**: Google explicitly restricts the Indexing API to pages containing `JobPosting` or livestream `BroadcastEvent` (`VideoObject`) structured data. Because TheOpenSource.news is a link-first aggregator that never hosts job postings, we **do not** emit `JobPosting` schema and **do not** call the Google Indexing API.
2. **Google Discovery**: Relies strictly on dynamic continent/category XML sitemaps (`/api/v1/sitemap-index.xml`), accurate `<lastmod>` timestamps, `robots.txt`, `hreflang` alternates (`en-GB`, `bn`, `x-default`), and internal linking across continent, country, pillar, and deadline hub pages.
3. **IndexNow (Bing, Yandex, Naver, Seznam)**: Google does not support IndexNow. `@osn/growth` submits throttled batches of newly verified URLs to `api.indexnow.org` strictly for participating engines.

## Measurable Growth KPIs

| KPI | Target | Measurement Method |
| --- | --- | --- |
| Verified link rate | >= 99.5% of published items | Weekly 50-item live destination sample (`tests/weekly-sample-audit.ts`) |
| Mobile LCP | <= 2.5 s | Lighthouse CI run against staging build |
| Initial page weight | ~150 KB | Built asset bundle audit (`dist/`) |
| Indexed verified pages | Measured per Search Console / Bing Webmaster | Sitemap index coverage vs. verified D1 count |

## Three YouTube Options (No Implementation Built Yet)

1. **Option A — Weekly Typographic Digest Video**: Automated headless SVG-to-video slide compilation displaying verified opportunity deadlines and institutional sources with verbatim headlines and voice-free ambient pacing.
2. **Option B — Human-Presented Weekly Briefing**: Short 3-minute British English and Bengali studio summary referencing the week's top verified institutional grants and scholarships with on-screen source credits.
3. **Option C — Topic-Specific Deadline Shorts**: Vertical 60-second typographic deadline alerts grouped by pillar (`Scholarships`, `Research Grants`) linking back to the verified hub pages.
