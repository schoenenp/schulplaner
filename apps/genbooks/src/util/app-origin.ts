const isProduction = process.env.NODE_ENV === "production";
const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);

type ConfiguredAppOriginOptions = {
  includeLocalhost?: boolean;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function isUnsetEnvValue(value: string | undefined) {
  const normalizedValue = value?.trim().toLowerCase();
  return (
    !normalizedValue ||
    normalizedValue === "undefined" ||
    normalizedValue === "null"
  );
}

function splitConfiguredOrigins(value: string | undefined) {
  if (isUnsetEnvValue(value)) return [];

  const originList = value ?? "";
  return originList
    .trim()
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => !isUnsetEnvValue(entry));
}

function coerceUrl(value: string) {
  const normalizedValue = trimTrailingSlash(value.trim());
  if (isUnsetEnvValue(normalizedValue)) return null;

  try {
    if (normalizedValue.includes("://")) return new URL(normalizedValue);
    return new URL(`http://${normalizedValue}`);
  } catch {
    return null;
  }
}

export function isLocalhostOrigin(value: string): boolean {
  const url = coerceUrl(value);
  return Boolean(url && localhostHosts.has(url.hostname.toLowerCase()));
}

export function normalizeAppOrigin(value: string): string | null {
  const url = coerceUrl(value);
  if (!url) return null;

  const hostname = url.hostname.toLowerCase();
  if (localhostHosts.has(hostname)) {
    url.protocol = "http:";
    return url.origin;
  }

  url.protocol = "https:";
  url.port = "";
  return url.origin;
}

export function getConfiguredAppOrigins(
  options: ConfiguredAppOriginOptions = {},
) {
  const includeLocalhost = options.includeLocalhost ?? true;
  const configuredOrigins = [
    ...splitConfiguredOrigins(process.env.APP_ALLOWED_ORIGINS),
    process.env.APP_FALLBACK_ORIGIN,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
  ];

  const normalizedOrigins = new Set<string>();
  for (const configuredOrigin of configuredOrigins) {
    if (!configuredOrigin) continue;

    const normalizedOrigin = normalizeAppOrigin(configuredOrigin);
    if (!normalizedOrigin) continue;
    if (!includeLocalhost && isLocalhostOrigin(normalizedOrigin)) continue;

    normalizedOrigins.add(normalizedOrigin);
  }

  return [...normalizedOrigins];
}

export function getConfiguredAppOrigin(
  options: ConfiguredAppOriginOptions = {},
) {
  const includeLocalhost = options.includeLocalhost ?? true;
  const [configuredOrigin] = getConfiguredAppOrigins({ includeLocalhost });
  if (configuredOrigin) return configuredOrigin;

  if (!includeLocalhost && isProduction) {
    throw new Error(
      "No non-local app origin is configured. Set APP_FALLBACK_ORIGIN, APP_ALLOWED_ORIGINS, AUTH_URL, or NEXTAUTH_URL to the canonical production origin.",
    );
  }

  return "http://127.0.0.1:3000";
}

export function getRequestAppOrigin(headers: Headers): string | null {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? headers.get("host")?.trim();
  if (!host) return null;

  const parsedHost = coerceUrl(host);
  if (!parsedHost) return null;

  const hostname = parsedHost.hostname.toLowerCase();
  if (localhostHosts.has(hostname)) {
    return `http://${parsedHost.host}`;
  }

  const forwardedProto = headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();
  const protocol = forwardedProto === "http" ? "http:" : "https:";

  return `${protocol}//${parsedHost.hostname.toLowerCase()}`;
}

export function getAllowedRequestAppOrigin(headers: Headers): string | null {
  const requestOrigin = getRequestAppOrigin(headers);
  if (!requestOrigin) return null;
  if (!isProduction) return requestOrigin;
  if (isLocalhostOrigin(requestOrigin)) return requestOrigin;

  const allowedOrigins = new Set(
    getConfiguredAppOrigins({ includeLocalhost: false }),
  );
  return allowedOrigins.has(requestOrigin) ? requestOrigin : null;
}

type AllowedOriginOptions = {
  headers?: Headers;
  extraOrigins?: Iterable<string>;
};

export function toAllowedAppOrigin(
  value: string,
  options: AllowedOriginOptions = {},
): string | null {
  const normalizedOrigin = normalizeAppOrigin(value);
  if (!normalizedOrigin) return null;

  if (!isProduction) return normalizedOrigin;

  const requestOrigin = options.headers
    ? getAllowedRequestAppOrigin(options.headers)
    : null;
  const allowLocalhost = options.headers
    ? Boolean(requestOrigin && isLocalhostOrigin(requestOrigin))
    : isLocalhostOrigin(normalizedOrigin);
  const allowedOrigins = new Set<string>(
    getConfiguredAppOrigins({ includeLocalhost: allowLocalhost }),
  );

  if (requestOrigin) {
    allowedOrigins.add(requestOrigin);
  }

  for (const extraOrigin of options.extraOrigins ?? []) {
    const normalizedExtraOrigin = normalizeAppOrigin(extraOrigin);
    if (!normalizedExtraOrigin) continue;
    if (isLocalhostOrigin(normalizedExtraOrigin) && !allowLocalhost) continue;
    allowedOrigins.add(normalizedExtraOrigin);
  }

  if (allowedOrigins.has(normalizedOrigin)) return normalizedOrigin;
  return null;
}

export function getAppOriginFromHeaders(headers: Headers) {
  const requestOrigin = getRequestAppOrigin(headers);
  const allowedRequestOrigin = getAllowedRequestAppOrigin(headers);
  if (allowedRequestOrigin) return allowedRequestOrigin;

  return getConfiguredAppOrigin({
    includeLocalhost:
      !isProduction ||
      !requestOrigin ||
      Boolean(requestOrigin && isLocalhostOrigin(requestOrigin)),
  });
}

export function buildAppUrl(origin: string, path: string) {
  return new URL(path, origin).toString();
}
