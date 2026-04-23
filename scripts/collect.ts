/**
 * Collector runner. Pulls batches from pages, fetches/chunks/embeds/writes.
 *
 * Usage:
 *   bun run collect                  # one pass of size COLLECTOR_BATCH_SIZE
 *   bun run collect -- --loop        # repeat until a batch does nothing
 *   bun run collect -- --videos      # discover video URLs once, then exit
 *   bun run collect -- --loop --videos  # discover videos, then loop
 *
 * The loop terminates when a batch returns 0 processed records (queue is
 * empty at the current minimum collect_count) and the prior pass enqueued
 * nothing. This keeps repeated CLI runs fast as the corpus gets close to full.
 */

import { discoverVideos, runBatch } from "../src/collector/pipeline.ts";
import { loadConfig } from "../src/config.ts";
import { closeSql, getSql } from "../src/db/client.ts";
import { logger, setLogLevel } from "../src/logger.ts";
import { EmbeddingService } from "../src/retrieval/embedding.ts";

async function main(): Promise<void> {
	const args = new Set(process.argv.slice(2));
	const loop = args.has("--loop");
	const seedVideos = args.has("--videos");

	const config = loadConfig();
	setLogLevel(config.logLevel);

	const sql = getSql(config.databaseUrl);
	const embedding = new EmbeddingService(
		{ baseUrl: config.embedding.baseUrl, apiKey: config.deepInfraApiKey },
		config.embedding.model,
	);

	try {
		if (seedVideos) {
			const added = await discoverVideos({ sql, embedding });
			logger.info(`[collect] video discovery added ${added} URL(s)`);
		}

		let pass = 0;
		let idleStreak = 0;
		while (true) {
			pass++;
			const summary = await runBatch({ sql, embedding }, config.collectorBatchSize);
			logger.info(
				`[collect] pass ${pass}: processed=${summary.processed} updated=${summary.updated} chunks=${summary.chunks} enqueued=${summary.enqueued} deleted=${summary.deleted} tempErr=${summary.temporaryErrors}`,
			);

			if (!loop) break;

			if (summary.processed === 0 && summary.enqueued === 0) {
				idleStreak++;
				if (idleStreak >= 2) {
					logger.info("[collect] queue drained; exiting");
					break;
				}
			} else {
				idleStreak = 0;
			}
		}
	} finally {
		await closeSql();
	}
}

main().catch((e) => {
	logger.error(`[collect] failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
