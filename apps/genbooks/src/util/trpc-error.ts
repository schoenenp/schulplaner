type TrpcRateLimitErrorShape = {
  data?: {
    rateLimit?: {
      retryAfterSeconds?: number;
    } | null;
  };
};

export function getRetryAfterSeconds(error: unknown): number | null {
  const retryAfterSeconds = (error as TrpcRateLimitErrorShape)?.data?.rateLimit
    ?.retryAfterSeconds;
  if (
    typeof retryAfterSeconds !== "number" ||
    !Number.isFinite(retryAfterSeconds) ||
    retryAfterSeconds <= 0
  ) {
    return null;
  }
  return Math.ceil(retryAfterSeconds);
}

