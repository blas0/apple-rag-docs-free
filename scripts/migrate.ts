/**
 * Apply every .sql file under ./migrations/ in filename order.
 * Tracks applied migrations in a _migrations table for idempotency.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { closeSql, getSql } from "../src/db/client.ts";
import { logger, setLogLevel } from "../src/logger.ts";

const MIGRATIONS_DIR = "migrations";

async function ensureTable(sql: ReturnType<typeof getSql>): Promise<void> {
	await sql`
		CREATE TABLE IF NOT EXISTS _migrations (
			name        text PRIMARY KEY,
			applied_at  timestamptz NOT NULL DEFAULT now()
		)
	`;
}

async function applied(sql: ReturnType<typeof getSql>): Promise<Set<string>> {
	const rows = await sql<{ name: string }[]>`SELECT name FROM _migrations`;
	return new Set(rows.map((r) => r.name));
}

async function main(): Promise<void> {
	const config = loadConfig();
	setLogLevel(config.logLevel);

	const sql = getSql(config.databaseUrl);
	await ensureTable(sql);
	const done = await applied(sql);

	const files = (await readdir(MIGRATIONS_DIR))
		.filter((f) => f.endsWith(".sql"))
		.sort((a, b) => a.localeCompare(b));

	let applied_count = 0;
	for (const file of files) {
		if (done.has(file)) {
			logger.debug(`skip ${file}`);
			continue;
		}
		const body = await readFile(join(MIGRATIONS_DIR, file), "utf8");
		logger.info(`applying ${file} (${body.length} bytes)`);
		await sql.unsafe(body);
		await sql`INSERT INTO _migrations (name) VALUES (${file})`;
		applied_count++;
	}

	logger.info(`migrations complete: ${applied_count} applied, ${done.size} already present`);
	await closeSql();
}

main().catch((err) => {
	logger.error(`migrate failed: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
