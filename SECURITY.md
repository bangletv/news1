# Security Policy

## Reporting a Vulnerability or Takedown Request

- **Security vulnerabilities**: Please report SSRF bypasses, open-redirect flaws, HMAC verification issues, or dependency vulnerabilities privately to the maintainers rather than opening a public issue.
- **Publisher removal / opt-out requests**: We honour publisher takedown and opt-out requests within a target of 72 hours. See `docs/RUNBOOK.md` for immediate per-source kill-switch procedures.

## Security Guarantees

- Outbound redirects on `/api/v1/out/:id` only target stored `canonical_url` values whose hostname is present in the source registry allowlist and whose status is not `rejected`.
- Destination verification blocks private, loopback, and link-local IP addresses on initial DNS lookup and across every HTTP redirect hop.
- Internal ingestion routes authenticate requests with HMAC-SHA256 signatures over `<timestamp>.<body>`, a 5-minute validity window, and single-use nonce replay protection.
