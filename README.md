# TheOpenSource.news

A free, open-source (MIT) global aggregator of constructive, institution-sourced opportunities and positive-impact news, operated by UK School of Artificial Intelligence Ltd (Company No. 17041560, London).

## Core Principles

- **Link-first**: Displays source name, optional permitted logo, unaltered original headline, and a direct link (`GET /api/v1/out/:id`) to the original publisher. No summaries, no translations of headlines, and no AI-written display copy.
- **No AI images**: Pure typography share cards are rendered in code. No image-generation SDKs or assets are permitted.
- **Sea Beach policy**: Excludes accidents, bloodshed, violence, crime reports, war fear, partisan politics, rumours, and adult content.
- **Honey-Bee policy**: Only sources vetted in `apps/pipeline/sources.yaml` are collected; internal priority ranks never appear in the public UI.
- **Link fidelity**: Every destination URL is verified across redirects with SSRF protection and headline matching before publication, then re-verified at 24 hours, 7 days, and weekly.

## Monorepo Layout

- `apps/web` — Public reader frontend and Cloudflare Pages configuration
- `apps/api` — Cloudflare Workers API (`/api/v1/*`), D1 SQLite migrations, KV kill switches
- `apps/pipeline` — 24/7 harvester, Gemini + deterministic fallback classifier, SSRF-safe verifier
- `apps/growth` — Dynamic XML sitemaps, IndexNow submission, pure-typography PNG share cards
- `tests` — Link-fidelity, banned-string, AI-image-ban, security, and 540-item Sea Beach evaluation suite
- `docs` — Architecture, source onboarding, incident runbook, data retention, SEO, legal checklist, and audit reports

## Quick Start

```bash
npm install
npm run dev       # Starts Express + Vite preview on port 3000
npm run lint      # TypeScript typecheck
npm test          # Runs engine, security, link-fidelity, and Sea Beach evaluation tests
npm run build     # Builds production frontend bundle
```

## Kill Switch CLI

```bash
npx tsx scripts/kill-switch.ts status
npx tsx scripts/kill-switch.ts set global true
npx tsx scripts/kill-switch.ts set source:nasa-news true
npx tsx scripts/kill-switch.ts clear global
```
