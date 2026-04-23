/**
 * Tiny structured logger. Output is plain text to stderr; level-filtered.
 */

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold: number = ORDER.info;

export function setLogLevel(level: Level): void {
	threshold = ORDER[level];
}

function emit(level: Level, msg: string): void {
	if (ORDER[level] < threshold) return;
	const ts = new Date().toISOString();
	const line = `[${ts}] ${level.toUpperCase()} ${msg}`;
	if (level === "error" || level === "warn") {
		console.error(line);
	} else {
		console.log(line);
	}
}

export const logger = {
	debug: (msg: string): void => emit("debug", msg),
	info: (msg: string): void => emit("info", msg),
	warn: (msg: string): void => emit("warn", msg),
	error: (msg: string): void => emit("error", msg),
};
