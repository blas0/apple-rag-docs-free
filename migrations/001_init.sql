-- apple-rag-docs-free initial schema
-- Requires: Postgres 16+, pgvector extension.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- pages: canonical doc / video record, keyed by URL.
-- raw_json stores Apple's DocC JSON (null for videos).
-- collect_count is the round-robin scheduler key.
-- ============================================================
CREATE TABLE IF NOT EXISTS pages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    url             text UNIQUE NOT NULL,
    title           text,
    content         text,
    raw_json        jsonb,
    collect_count   integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pages_apple_collect_count
    ON pages (collect_count)
    WHERE url LIKE 'https://developer.apple.com/%';

-- ============================================================
-- chunks: vector-indexed shards of pages.content.
-- embedding dim 768 matches nomic-embed-text (local-first default).
-- To switch models: change this dimension, set EMBEDDING_DIM in .env,
-- and apply against a fresh database.
-- halfvec halves storage vs float4 with negligible quality loss.
-- ============================================================
CREATE TABLE IF NOT EXISTS chunks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    url             text NOT NULL REFERENCES pages(url) ON DELETE CASCADE,
    title           text,
    content         text NOT NULL,
    embedding       halfvec(768),
    chunk_index     integer NOT NULL,
    total_chunks    integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_url_idx
    ON chunks (url);

-- HNSW over cosine distance for semantic search.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
    ON chunks
    USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- GIN over a 'simple'-configured tsvector for keyword search.
-- 'simple' preserves technical tokens (@State, SecItemAdd, NSString).
CREATE INDEX IF NOT EXISTS chunks_tsv_simple
    ON chunks
    USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || content));
