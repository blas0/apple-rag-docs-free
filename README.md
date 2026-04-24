# apple-rag-docs-free

[![CI](https://github.com/blas0/apple-rag-docs-free/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/blas0/apple-rag-docs-free/actions/workflows/ci.yml)

**A free, self-hostable MCP server for Apple developer documentation and WWDC transcripts.**

Hybrid search (pgvector semantic + Postgres keyword) with AI reranking over Apple's public docs and WWDC video transcripts. No third-party hosted service required — bring your own Postgres and your own embedding provider and you own the whole thing.

## Credit

This project is a reverse-engineered, self-hosted re-implementation of [BingoWon/apple-rag-mcp](https://github.com/BingoWon/apple-rag-mcp).

I reversed engineered his MCP server, cause why not. If you want to pay him for his hosted version, go use his at [apple-rag.com](https://apple-rag.com).

What we changed:
- Runtime: Bun + Hono (upstream runs Cloudflare Workers).
- Storage: a single Postgres + pgvector for everything (upstream uses D1 alongside Postgres for users/billing).
- Auth + rate limits: minimal, honest. No prompt-injection upsell messages.
- Scope: MCP server + collector only. No billing, no web dashboard, no OAuth.

## Quick start

**Prerequisites:** Bun 1.1+, Postgres 16+ with `pgvector` extension, a DeepInfra API key (or any compatible embedding/reranker provider).

```bash
bun install
cp .env.example .env        # fill in DATABASE_URL and DEEPINFRA_API_KEY
bun run migrate             # apply schema
bun run dev                 # MCP server on :8787
```

One-off ingest of a single URL for testing:

```bash
bun run scripts/seed-one.ts https://developer.apple.com/documentation/swiftui/navigationstack
```

Batch collection (round-robin across all known URLs):

```bash
bun run collect
```

## MCP client config

```json
{
  "mcpServers": {
    "apple-rag-docs-free": {
      "url": "http://localhost:8787/mcp"
    }
  }
}
```

Or expose it publicly behind a reverse proxy and use its URL.

## Tools exposed

### `search(query, result_count?)`

- `query` — English technical search. API names, framework names, version numbers. Avoid temporal language.
- `result_count` — 1..10, default 4.

Returns merged document chunks with completeness markers:
- `[*] Complete Document` — full doc.
- `[*] Parts X, Y, Z merged (N total)` — multi-chunk title merge.
- `[*] Part X of N` — single partial chunk.

Plus a block of "Additional Related Documentation" URLs you can follow with `fetch`.

### `fetch(url)`

Returns title + normalized markdown for one canonical Apple doc / WWDC transcript URL.

## Environment

See `.env.example` for the full list.

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | yes | Postgres with pgvector; e.g. `postgres://user:pass@host:5432/db?sslmode=require` |
| `DEEPINFRA_API_KEY` | yes | For embeddings + reranker. Swap providers by editing `src/retrieval/{embedding,reranker}.ts`. |
| `PORT` | no | Default `8787`. |
| `COLLECTOR_ADMIN_TOKEN` | no | If set, required on `/admin/collector/tick`. |

## Data model

Two tables — see `migrations/001_init.sql`.

- `pages(url, title, content, raw_json, collect_count, ...)` — canonical docs + videos, URL-keyed.
- `chunks(url, title, content, embedding halfvec(2560), chunk_index, total_chunks)` — pgvector HNSW index on embedding, GIN index on tsvector of title+content.

## Retrieval pipeline

Given query `Q` and `k` results:

1. Parallel: `4k` semantic candidates (pgvector `<=>` on halfvec) + `4k` keyword candidates (Postgres `plainto_tsquery('simple', …)`).
2. Merge by id (semantic-first), group by title, concat sibling chunks in chunk-index order.
3. Rerank with Qwen3-Reranker-8B via DeepInfra (falls back to 4B, then to merge order).
4. Top `k` → visible; next (cap 10) → "Additional Related Documentation".

Embedding model is `Qwen/Qwen3-Embedding-4B` (2560 dims, L2-normalized client-side). Swap either by editing the two retrieval modules — the engine doesn't know or care.

## Collection pipeline

Cron-style batch job:

1. Pull lowest `collect_count` Apple URLs from `pages` with `SELECT ... FOR UPDATE SKIP LOCKED` (multi-worker safe).
2. For docs: GET `https://developer.apple.com/tutorials/data<path>.json` (or swift.org for `/docc`), validate `primaryContentSections`, convert to markdown.
3. For videos: GET the `/videos/play/...` HTML, regex out `<section id="transcript-content">` and its `data-start` segments.
4. Chunk each page (~2500 chars, split on header/paragraph/sentence boundaries), embed each chunk with `"{title}\n\n{content}"`, upsert.
5. Discover new URLs from page references and enqueue with `collect_count = MIN(collect_count)` to round-robin.

Run the collector on a cron every few minutes; each run processes `COLLECTOR_BATCH_SIZE` URLs.

## Deploy

Runs anywhere Bun runs. Natural targets:

- Vercel (Fluid Compute, Node.js runtime) — point `src/server.ts` at `@vercel/node` or expose it as `bun serve`.
- Fly.io / Railway / Render — `bun run build && bun ./dist/server.js`.
- Bare Docker — `FROM oven/bun:1`.

You'll also need Postgres + pgvector; Neon and Supabase both work.

## Legal / operational notes

- [!] The collector fetches from `developer.apple.com` at a polite-but-nontrivial rate. Respect `robots.txt`, add delays, and don't hammer them. If you deploy this publicly, expect Apple may block the UA we spoof; that's on you.
- [!] The docs we index are Apple's copyright. This project ships zero Apple content — you populate your own Postgres. Don't redistribute your dump.
- [!] WWDC transcripts are Apple's too. Same rule.

## License

MIT. See [LICENSE](LICENSE). Original upstream is also MIT.
