# Sources Onboarding Guide

## Honey-Bee Source Policy

Only institutions explicitly registered in `apps/pipeline/sources.yaml` may be harvested. Google News is never a valid source.

### Internal Priority Tiers (Never Displayed in UI)

- **1**: Government and legal portals, central banks, UN / WHO / World Bank / multilateral bodies.
- **2**: Accredited universities and national research councils.
- **3**: Official corporate Careers and CSR portals.
- **4**: Recognised peer-reviewed science and culture journals.

## Checklist Before Marking `status: active`

1. Verify `robots.txt` permits `TheOpenSourceNewsBot/1.0` on the feed and article paths (`robots_ok: true`).
2. Review publisher terms and licence (`license` field); record verification timestamp in `terms_checked_at`.
3. Set `logo_permitted: false` unless explicit written logo permission is held (`TODO[legal]` if seeking permission).
4. Run `npm test` to validate `sources.yaml` schema before committing.
