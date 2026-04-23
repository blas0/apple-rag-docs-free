# CLAUDE.md

Project-local guidance for Claude Code working in this repo.

## Repo posture

- [!!] This is a **public** GitHub repo. Never commit secrets, tokens, API keys, DSNs, private hostnames, real email addresses, or cloud account IDs. All secrets live in `.env` (gitignored). `.env.example` is the only env file that may be committed and must contain placeholders only.
- [!!] Treat every file here as public. No internal notes, no client names, no commentary that would be embarrassing on HN.
- [!] Don't commit the `upstream/` or `observed/` directories — they contain a third-party clone and raw captures used for research.

## Runtime rules

- [!!] Always use `bun`. Never `npm`, `npx`, `node`, `pnpm`, `yarn`.
  - `bun install`, `bun run <script>`, `bun test`, `bunx <bin>`.
- [!] TypeScript with Bun's `moduleResolution: "bundler"`.
- [!] No emojis anywhere in code, commits, PRs, docs — use `[!]`, `[!!]`, `[*]`, `[$]`, `[1]`, `[2]` markers.

## What this project is

A self-hostable MCP server for searching and fetching Apple developer documentation and WWDC video transcripts. Reverse-engineered from BingoWon's `apple-rag-mcp` for the purpose of running our own index on our own infra, with our own auth and rate limits.

- Upstream (for credit + reference): `https://github.com/BingoWon/apple-rag-mcp`
- Research notes: `OBSERVED.md`, `PLAN.md` (gitignored-style research; keep under a clearly-labelled `research/` tree if committed).

## Layout

```
src/
  server.ts            # Hono app entry (bun serve)
  config.ts            # env parsing
  logger.ts            # structured logs
  db/client.ts         # postgres client (pgvector)
  retrieval/
    deepinfra.ts       # DeepInfra REST base
    embedding.ts       # Qwen3-Embedding-4B
    reranker.ts        # Qwen3-Reranker-8B -> 4B fallback
    db.ts              # semantic + keyword + page lookup queries
    engine.ts          # hybrid search + title merge + rerank
  mcp/
    constants.ts       # protocol + tool metadata
    types.ts           # JSON-RPC + tool types
    formatters.ts      # response rendering
    validators.ts      # JSON-RPC + init param validation
    tools.ts           # search / fetch tool handlers
    protocol.ts        # JSON-RPC handler
  collector/
    appleClient.ts     # fetches developer.apple.com data
    contentProcessor.ts# DocC JSON -> markdown
    chunker.ts         # target-2500-char chunker
    pg.ts              # pages/chunks writes
    pipeline.ts        # end-to-end batch execution
migrations/
  001_init.sql         # pages + chunks + indexes
scripts/
  migrate.ts           # apply migrations
  collect.ts           # one-shot collector run
  seed-one.ts          # ingest a single URL for testing
```

## Build / test commands

- Install: `bun install`
- Dev server: `bun run dev`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`
- Test: `bun test`
- Migrate: `bun run migrate`
- Collect: `bun run collect`
- Seed one URL: `bun run scripts/seed-one.ts <url>`

## Pre-commit gates

Run all three before every commit. No exceptions.

1. `bun test`
2. `bun run typecheck`
3. `bun run lint`

## Branch + PR workflow

- [!!] Never push to `main`. Everything through a PR.
- [!!] Never force-push.
- New work: branch from `main`, commit, push, open PR with summary + test plan.
- User merges the PR manually after CI passes.

## Style

- Small files. Prefer ≤300 LOC per module.
- No dead exports, no unused imports, no debug logs left behind.
- Comments only for non-obvious *why*, never *what*.
- Error messages are neutral and truthful. Do not copy upstream's rate-limit prompt-injection message.
