# Security policy

## Reporting a vulnerability

Please do not open a public GitHub issue for security problems. Email the
maintainer at **security@neurix.co** with:

- A description of the issue and the impact you see.
- Reproduction steps or a minimal proof-of-concept.
- The commit SHA or release where you observed the issue.

I'll acknowledge within 72 hours and, if the report is valid, ship a fix on a
branch and coordinate disclosure with you before merging to `main`.

## Scope

In scope:

- The MCP server (`src/`), the collector, migrations, the Docker image, and
  the Compose stack published in this repo.
- Any default configuration shipped in `.env.example`, `docker-compose.yml`,
  or the CI workflow.

Out of scope:

- Third-party services (DeepInfra, Ollama, Postgres, pgvector).
- Apple's own infrastructure. This project ships no Apple content; users
  populate their own database.
- Forks with substantial modifications — please report those to the fork
  maintainer.

## What to expect

- Fix shipped on a feature branch, reviewed, merged, and tagged.
- A CHANGELOG entry once a release cadence exists.
- Credit in the release notes unless you ask otherwise.

## Hardening notes for operators

- Always set `MCP_AUTH_TOKEN` when exposing `/mcp` to anything beyond
  localhost. The middleware is a constant-time bearer-token check; it is not
  a substitute for network isolation or a reverse proxy with WAF rules.
- Put the service behind TLS. The server speaks plain HTTP; terminate HTTPS
  at a reverse proxy (Caddy, nginx, Cloudflare, etc.).
- `COLLECTOR_ADMIN_TOKEN` should be set if `/admin/collector/tick` is
  reachable from outside the host.
- Treat the Postgres instance as sensitive — indexed content is Apple's
  copyrighted documentation. Don't share database dumps publicly.
