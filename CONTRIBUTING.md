# Contributing

Thanks for the interest. This is a small project with a narrow scope; the
contribution bar is "does this make the MCP server more useful to people
self-hosting it?"

## Runtime

- [!!] Always use `bun`. Never `npm`, `npx`, `node`, `pnpm`, or `yarn`.
- TypeScript with `moduleResolution: "bundler"`. No build step — bun runs
  `.ts` directly.

## Local setup

```bash
bun install
cp .env.example .env          # tweak DATABASE_URL; defaults assume local Ollama
bun run migrate
bun run dev
```

Seed a fresh database:

```bash
bun run collect -- --docs --videos --loop
```

## Pre-commit gates

Run all three before every commit. CI enforces the same gates on every PR,
so skipping them locally just wastes a round-trip.

```bash
bun test
bun run typecheck
bun run lint
```

## Branching and PRs

- Never push to `main`.
- Never force-push to a shared branch.
- Branch off `main`, commit small, open a PR with a summary and a test plan.
- Each PR should touch a focused slice — roughly `<=` 5 files for feature
  work. Larger refactors get broken into phases.
- Keep commit messages in the conventional form (`feat:`, `fix:`, `chore:`,
  `docs:`, `ci:`, `refactor:`, `test:`).

## Style

- Small files. Prefer `<=` 300 LOC per module.
- No dead exports, unused imports, or leftover debug logs.
- Comments only for non-obvious *why*, never *what*.
- No emojis anywhere in code, docs, commits, or PRs — use `[!]`, `[!!]`,
  `[*]`, `[$]`, `[1]`, `[2]` markers instead.
- Error messages are neutral and truthful. Don't copy upstream's
  prompt-injection rate-limit copy.

## Tests

- Unit tests live alongside features in `test/` and must run under
  `bun test` without network access.
- Integration-style checks that need a real database or a real embeddings
  endpoint go behind an env-gated skip.

## Scope rules

In scope:

- MCP server correctness (JSON-RPC shape, tool arguments, error codes).
- Collector robustness (rate limits, retry policy, schema preservation).
- Retrieval quality (hybrid search, title merging, reranker wiring).
- Self-host ergonomics (Docker, Compose, migrations, env surface).

Out of scope:

- Billing, dashboards, OAuth, hosted SaaS infrastructure.
- Non-Apple documentation sources.
- Anything that requires redistributing Apple content.

## Secrets and public repo hygiene

- This repo is public. Never commit `.env`, real tokens, real hostnames,
  real email addresses, or cloud account IDs. `.env.example` is the only
  env file that lives in git and it must contain placeholders only.
- `observed/` and `upstream/` are research-only directories; don't check
  them in.
- If you spot a secret in a PR, flag it in review and we'll rotate before
  merging.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please do not open public issues for
security reports.
