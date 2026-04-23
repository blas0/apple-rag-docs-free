/**
 * Single Postgres client backed by postgres.js.
 * Re-used across MCP request handling and the collector.
 */

import postgres from "postgres";

export type Sql = postgres.Sql;

let instance: Sql | null = null;

export function getSql(databaseUrl: string): Sql {
	if (instance) return instance;
	instance = postgres(databaseUrl, {
		max: 10,
		idle_timeout: 30,
		connect_timeout: 10,
		prepare: true,
		transform: { undefined: null },
		connection: { application_name: "apple-rag-docs-free" },
	});
	return instance;
}

export async function closeSql(): Promise<void> {
	if (!instance) return;
	try {
		await instance.end({ timeout: 5 });
	} finally {
		instance = null;
	}
}
