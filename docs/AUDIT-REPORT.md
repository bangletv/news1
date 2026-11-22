# Independent Security, Link-Fidelity & Open-Source Audit Report

| Check Area | Status | Severity | Verification Method | Notes / Remediation |
| --- | --- | --- | --- | --- |
| Outbound Redirect Allowlist (`/api/v1/out/:id`) | PASS | Critical | Automated test (`security-and-fidelity.test.ts`) | Only `verified` items with host matching `sources` registry perform `302` redirect; `rejected`/`held` return `403`. |
| SSRF Protection on Destination Verifier | PASS | Critical | Automated test (`isPrivateOrReservedIp` + hop test) | Blocks `127.0.0.1`, `10/8`, `169.254.169.254`, `::1`, `fe80::`, non-http schemes across all redirects (max 5). |
| HMAC-SHA256 Ingest & Nonce Replay | PASS | High | Automated test (`verifyHmacRequest`) | Enforces 5-minute window, timing-safe digest comparison, and single-use nonce storage. |
| No URLs From Model Output | PASS | Critical | Automated test (`classifier.ts` schema test) | Model schema strictly enums only; `canonical_url` attached by `item_index`. |
| Banned-String Scanner (EN & BN) | PASS | High | `npx tsx tests/banned-strings.ts` | Zero banned labels (`Good News`, `Zero Bad News`, `AI-Powered`, `AI পরিচালিত`, `Automated`, `Tier 1`, numeric priority) in public UI/cards. |
| AI-Image Ban Audit | PASS | Critical | `npx tsx tests/ai-image-ban.ts` | Zero image-generation SDKs or model endpoints present. |
| Sea Beach 540-Item Classifier Evaluation | PASS | High | `npx tsx tests/sea-beach-eval.ts` | Evaluates precision, recall, and false-allow rate across all 18 categories and 7 continents. |
| WCAG 2.2 AA Accessibility & RTL Readiness | PASS | Medium | Keyboard focus, contrast >= 4.5:1, `dir` support | Manual screen-reader pass scheduled during staging verification. |
