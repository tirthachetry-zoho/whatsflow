interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(opts: { key: string; limit?: number; windowMs?: number }): RateLimitResult {
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();

  const bucket = buckets.get(opts.key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(opts.key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) sweep(now);
    return { success: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { success: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  return { success: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}
