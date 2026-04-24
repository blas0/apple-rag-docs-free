# syntax=docker/dockerfile:1.7
#
# Multi-stage build for apple-rag-docs-free.
#
# We skip `bun build` and run TypeScript directly on the runtime bun. That
# removes a bundling step with no material runtime cost — bun parses+runs
# TS natively — and keeps src/ debuggable inside the container.

FROM oven/bun:1.3.11-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.11-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Named non-root user. Makes log and volume ownership predictable.
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --home /app --shell /usr/sbin/nologin app

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json tsconfig.json ./
COPY --chown=app:app src        ./src
COPY --chown=app:app scripts    ./scripts
COPY --chown=app:app migrations ./migrations

USER app
EXPOSE 8787

# Apply migrations, then start the server. Compose overrides this when
# running the migration as a one-off job.
CMD ["sh", "-c", "bun run scripts/migrate.ts && bun run src/server.ts"]
