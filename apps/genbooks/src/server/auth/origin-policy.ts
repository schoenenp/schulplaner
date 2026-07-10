import {
  getRequestAppOrigin,
  isLocalhostOrigin,
  normalizeAppOrigin,
} from "@/util/app-origin";

type AuthOriginEnv = {
  NODE_ENV?: string;
  AUTH_URL?: string;
  NEXTAUTH_URL?: string;
  APP_ALLOWED_ORIGINS?: string;
  APP_FALLBACK_ORIGIN?: string;
};

function splitOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getConfiguredOrigins(env: AuthOriginEnv) {
  return [
    ...splitOrigins(env.APP_ALLOWED_ORIGINS),
    env.APP_FALLBACK_ORIGIN,
    env.AUTH_URL,
    env.NEXTAUTH_URL,
  ]
    .map((origin) => (origin ? normalizeAppOrigin(origin) : null))
    .filter((origin): origin is string => Boolean(origin));
}

function hasLocalhostAuthOrigin(env: AuthOriginEnv) {
  return [env.AUTH_URL, env.NEXTAUTH_URL].some(
    (origin) => origin && isLocalhostOrigin(origin),
  );
}

export function getAuthOriginPolicyError(
  headers: Headers,
  env: AuthOriginEnv = process.env,
): string | null {
  if (env.NODE_ENV !== "production") return null;

  const requestOrigin = getRequestAppOrigin(headers);
  if (!requestOrigin) {
    return "Auth request is missing a usable Host or X-Forwarded-Host header.";
  }

  if (isLocalhostOrigin(requestOrigin)) {
    return null;
  }

  if (hasLocalhostAuthOrigin(env)) {
    return "Refusing external auth request while AUTH_URL or NEXTAUTH_URL points to localhost. Configure a canonical production auth origin.";
  }

  const allowedOrigins = getConfiguredOrigins(env).filter(
    (origin) => !isLocalhostOrigin(origin),
  );
  if (allowedOrigins.length === 0) {
    return "No non-local production auth origin is configured.";
  }

  if (!allowedOrigins.includes(requestOrigin)) {
    return `Auth request origin ${requestOrigin} is not in the configured production origin allowlist.`;
  }

  return null;
}
