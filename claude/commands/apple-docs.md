---
description: Search Apple developer docs + WWDC transcripts via the apple-rag-docs-free MCP server.
argument-hint: <query>
---

The user has explicitly invoked Apple docs search on this query:
`$ARGUMENTS`

This slash command counts as explicit user consent to call the
`apple-rag-docs-free` MCP server. Proceed without asking for additional
permission unless the harness prompts.

## Workflow

1. Refine `$ARGUMENTS` into a technical search: canonical API / framework
   names, drop temporal words ("latest", "now"). Pass through if already
   precise.

2. Call `mcp__apple-rag-docs-free__search` with:
   - `query`: the refined phrase
   - `result_count`: `4` by default; `6`-`8` for surveys or when the first
     pass missed. Max `10`.

3. Read each result's completeness marker:
   - `[*] Complete Document` — full doc, safe to summarize.
   - `[*] Parts X, Y, Z merged (N total)` — multi-chunk merge.
   - `[*] Part X of N` — partial; call `fetch` for the full page before
     answering anything beyond a direct lookup.

4. Call `mcp__apple-rag-docs-free__fetch` with one of the URLs when you
   need the complete document (walkthroughs, code verification, WWDC
   transcripts).

5. Answer directly. Include canonical `developer.apple.com` URLs inline.
   If results look thin or off-topic, say so — the local corpus is a
   work in progress; some frameworks are still being embedded.

## Constraints

- Do not invoke this server outside this slash command without a
  follow-up user turn.
- If the MCP call fails with a connection error, tell the user to start
  the server (`bun run dev` or `docker compose up`). Do not start it
  yourself.
- Keep quoted spans under 15 words. Summarize rather than paraphrase
  long passages. Apple content is copyrighted.
- If the query is clearly non-Apple (React, Django, etc.), say so and
  suggest a better route.
