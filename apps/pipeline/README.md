# @osn/pipeline

24/7 link-first harvester, Sea Beach & Honey-Bee classifier, and SSRF-safe destination verifier.

## Stages

1. **Harvest (`src/harvester.ts`)**: Reads validated active sources from `sources.yaml` (requires `terms_checked_at` and `robots_ok: true`), fetches feeds with a descriptive `User-Agent`, `ETag`/`If-Modified-Since`, and per-domain rate limits, attaches `canonical_url` strictly by `item_index`, and extracts `deadline_at` only from structured feed metadata.
2. **Classify (`src/classifier.ts`)**: Uses `GeminiClassifierProvider` (`gemini-4-hydrogen` with strict JSON schema enums) backed by `DeterministicClassifierProvider`. The model never outputs or modifies URLs. `unsure` or schema failure yields `held`.
3. **Verify (`src/verifier.ts`)**: Follows up to 5 redirects with DNS/IP SSRF blocking on every hop, requires HTTP 200 HTML/PDF, non-homepage path, allowlisted host, and `>= 0.8` fuzzy headline similarity against `<title>`, `<h1>`, or `og:title`. Re-checks at 24 hours, 7 days, and weekly.
