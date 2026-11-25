/** Structured one-line JSON logs, matching the pipeline's logger interface. */
type Level = "debug" | "info" | "warn" | "error";

function serialize(meta: unknown): unknown {
  if (meta instanceof Error) return { name: meta.name, message: meta.message };
  if (meta && typeof meta === "object") {
    return Object.fromEntries(
      Object.entries(meta).map(([key, value]) => [key, serialize(value)]),
    );
  }
  return meta;
}

function write(level: Level, message: string, meta?: unknown) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(meta === undefined ? {} : { meta: serialize(meta) }),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV === "development") write("debug", message, meta);
  },
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};
