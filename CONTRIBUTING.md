# Contributing to TheOpenSource.news

Thank you for contributing to TheOpenSource.news. All contributions must remain MIT-compatible and honour our non-negotiable editorial, security, and accessibility standards.

## Rules for Contributors

1. **No AI-generated text or images in output**: Never add LLM headline rewriting, summarisation, or image-generation SDKs.
2. **British formal English**: UI copy and documentation use British spelling (`programme`, `centre`, `colour`, `organisation`, `-ise`).
3. **Zero promotional labels**: Never introduce phrases such as `Good News`, `Zero Bad News`, `AI-Powered`, `Automated`, `Tier 1`, or numeric priority rankings in user-facing surfaces.
4. **Source onboarding**: New sources go into `apps/pipeline/sources.yaml` with `terms_checked_at` and `robots_ok` verified per `docs/SOURCES.md`.
5. **Pre-PR verification**: Run `npm run lint`, `npm test`, and `npm run build` locally before opening a pull request.
