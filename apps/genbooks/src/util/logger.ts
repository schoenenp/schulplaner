type LogLevel = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = [
  "email",
  "phone",
  "token",
  "secret",
  "authorization",
  "cookie",
  "password",
  "access_token",
  "refresh_token",
  "signature",
  "checkout_session",
  "redirect_url",
];

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_KEYS.some((sensitive) => normalized.includes(sensitive));
}

function redactValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedactKey(k) ? "[REDACTED]" : redactValue(v);
    }
    return out;
  }

  return value;
}

function shouldLogDebug(): boolean {
  return process.env.NODE_ENV !== "production";
}

function emit(level: LogLevel, message: string, meta?: unknown) {
  if (level === "debug" && !shouldLogDebug()) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta: redactValue(meta) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug(message: string, meta?: unknown) {
    emit("debug", message, meta);
  },
  info(message: string, meta?: unknown) {
    emit("info", message, meta);
  },
  warn(message: string, meta?: unknown) {
    emit("warn", message, meta);
  },
  error(message: string, meta?: unknown) {
    emit("error", message, meta);
  },
};

