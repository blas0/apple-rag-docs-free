# apple-rag-docs-free

[![CI](https://github.com/blas0/apple-rag-docs-free/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/blas0/apple-rag-docs-free/actions/workflows/ci.yml)

A self-hosted MCP server for searching Apple developer documentation and
WWDC video transcripts. Bring your own Postgres + local Ollama; own the
whole thing.

Reverse-engineered from [BingoWon/apple-rag-mcp](https://github.com/BingoWon/apple-rag-mcp).
No billing, no dashboard, no rate-limit shakedown.

## Run it

```bash
cp .env.example .env          # set DATABASE_URL; defaults assume local Ollama
docker compose up --build
```

That's it. Server at `http://localhost:8787`, migrations run on boot,
Postgres + pgvector included in the compose stack.

Prefer bare metal? `bun install && bun run migrate && bun run dev`.

## Seed the index

The repo ships no Apple content — you populate your own Postgres.

```bash
bun run collect -- --docs --videos --loop
```

- `--docs` seeds framework roots (SwiftUI, UIKit, Foundation, Swift,
  SwiftData, AVFoundation, Metal, ...).
- `--videos` fetches the WWDC video index.
- `--loop` keeps running until the queue is idle.

First run takes a while; the BFS fans out through DocC references.
Subsequent runs incrementally refresh in round-robin order.

## Use it from Claude Code

```bash
claude mcp add --transport http --scope user \
  apple-rag-docs-free http://127.0.0.1:8787/mcp
```

Then drop the skill and slash command into `~/.claude`:

```bash
cp -R claude/commands/apple-docs.md     ~/.claude/commands/
cp -R claude/skills/apple-docs          ~/.claude/skills/
```

You now get:

- `/apple-docs <query>` — explicit slash command for one-off lookups.
- Automatic retrieval during Swift / iOS / macOS / visionOS coding. The
  skill triggers when Claude sees a Swift file or an Apple framework
  reference, silently pulls the relevant docs, and weaves them into the
  answer with canonical `developer.apple.com` URLs.

## Tools

| Tool | What it does |
|---|---|
| `search(query, result_count?)` | Hybrid pgvector + tsvector search with title merging. Returns top-k plus a block of related URLs. |
| `fetch(url)` | Full normalized markdown for one canonical doc or WWDC transcript URL. |

## Environment

See `.env.example`. Only `DATABASE_URL` is strictly required; the rest
have sane defaults.

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | Postgres with pgvector. Required. |
| `EMBEDDING_BASE_URL` | `http://127.0.0.1:11434/v1` | Any OpenAI-compatible `/v1` endpoint. |
| `EMBEDDING_MODEL` | `nomic-embed-text` | 768-dim by default. |
| `EMBEDDING_DIM` | `768` | Must match the model. Change only with a fresh migration. |
| `RERANKER_ENABLED` | `false` | Off by default. Enable + set `DEEPINFRA_API_KEY` for hosted Qwen reranker. |
| `MCP_AUTH_TOKEN` | — | If set, `/mcp` requires `Authorization: Bearer <token>`. |
| `PORT` | `8787` | |
| `COLLECTOR_BATCH_SIZE` | `10` | URLs per collector pass. |

## Deploy

`docker compose up` covers the happy path. For production: stand up
Postgres with pgvector (Neon and Supabase both work), point
`DATABASE_URL` at it, and run the container behind a TLS terminator.
Set `MCP_AUTH_TOKEN` if `/mcp` is reachable from outside the host.

## Legal

- [!] The collector fetches from `developer.apple.com` at a
  polite-but-nontrivial rate. Respect `robots.txt`, add delays, and
  don't hammer them.
- [!] Apple documentation and WWDC transcripts are Apple's copyright.
  This project ships zero Apple content — you populate your own
  Postgres. Don't redistribute your dump.

## License

MIT. See [LICENSE](LICENSE).
