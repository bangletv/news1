# Legal & Compliance Checklist (Not Legal Advice)

Operated by **UK School of Artificial Intelligence Ltd** (Company No. 17041560, London).

- [x] **Robots.txt & Rate Limiting**: Harvester sends `TheOpenSourceNewsBot/1.0 (+https://theopensource.news/our-approach)`, obeys `Disallow` rules, caches `ETag`/`If-Modified-Since`, and enforces per-domain rate limits.
- [ ] **TODO[legal] — Per-Source Terms Review**: Confirm written or published RSS/sitemap redistribution terms for every Priority 1–4 domain in `apps/pipeline/sources.yaml` before enabling production ingestion.
- [ ] **TODO[legal] — Logo & Trademark Permissions**: `logo_permitted` defaults to `false`. Obtain written trademark permission before enabling `source_logo` for any organisation. Never display UK Crown or GOV.UK logos.
- [x] **Opt-Out & Removal Process**: 72-hour SLA documented in `docs/RUNBOOK.md` backed by immediate per-source KV kill switches.
- [x] **UK GDPR & PECR Compliance**: Zero non-essential cookies, zero analytics trackers, zero user profiling. Reader preferences (`continent`, `country`, `pillar`, `category`, `lang`) remain strictly in browser `localStorage`.
- [ ] **TODO[legal] — Press-Publisher Ancillary Copyright (EU/UK)**: Review headline snippet length limits under EU Directive 2019/790 Article 15 ("very short extracts" / factual headlines) with UK/EU media counsel.
- [ ] **TODO[legal] — Our Approach Page Wording**: Review final wording on the `Our approach` page confirming non-endorsement by listed governments, multilateral agencies, or universities.
