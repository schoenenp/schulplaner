import { TRPCError } from "@trpc/server";

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

type RateLimitOptions = {
  scope: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitContext = {
  headers: Headers;
  session?: {
    user?: {
      id?: string | null;
    } | null;
  } | null;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10_000;

function trimBucketStore(nowMs: number): void {
  if (rateLimitBuckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      rateLimitBuckets.delete(key);
    }
  }
}

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const candidates = [
    headers.get("x-real-ip"),
    headers.get("cf-connecting-ip"),
    headers.get("true-client-ip"),
  ];

  for (const candidate of candidates) {
    if (candidate?.trim()) {
      return candidate.trim();
    }
  }

  return "unknown-ip";
}

export function makeRateLimitKey(
  context: RateLimitContext,
  scope: string,
): string {
  const userId = context.session?.user?.id ?? "anonymous";
  const ip = getClientIp(context.headers).slice(0, 128);
  return `${scope}:${userId}:${ip}`;
}

export function takeRateLimitToken(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const nowMs = Date.now();
  trimBucketStore(nowMs);

  const existing = rateLimitBuckets.get(key);
  if (!existing || existing.resetAtMs <= nowMs) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAtMs: nowMs + windowMs,
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterMs: Math.max(existing.resetAtMs - nowMs, 0),
    };
  }

  existing.count += 1;
  rateLimitBuckets.set(key, existing);
  return { allowed: true, retryAfterMs: 0 };
}

export function enforceProcedureRateLimit(
  context: RateLimitContext,
  options: RateLimitOptions,
): void {
  const key = makeRateLimitKey(context, options.scope);
  const result = takeRateLimitToken(key, options.maxRequests, options.windowMs);
  if (result.allowed) return;

  const retrySeconds = Math.max(Math.ceil(result.retryAfterMs / 1000), 1);
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Too many requests. Retry in about ${retrySeconds}s.`,
    cause: {
      retryAfterSeconds: retrySeconds,
    },
  });
}
