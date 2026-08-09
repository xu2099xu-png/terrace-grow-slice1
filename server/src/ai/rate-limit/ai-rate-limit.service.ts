import { Injectable } from '@nestjs/common';

export interface AiRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

interface WindowBucket {
  count: number;
  resetAtMs: number;
}

@Injectable()
export class AiRateLimitService {
  private static readonly MAX_PRUNE_PER_CHECK = 100;
  private readonly buckets = new Map<string, WindowBucket>();
  private pruneCursor: IterableIterator<[string, WindowBucket]> | null = null;

  check(
    userId: string,
    limit: number,
    ttlMs: number,
    nowMs = Date.now(),
  ): AiRateLimitResult {
    if (!userId) {
      return { allowed: false, retryAfterSeconds: 1, remaining: 0 };
    }
    this.pruneExpired(nowMs);
    const bucket = this.buckets.get(userId);
    if (!bucket || nowMs >= bucket.resetAtMs) {
      this.buckets.set(userId, { count: 1, resetAtMs: nowMs + ttlMs });
      return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - 1) };
    }
    if (bucket.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000)),
        remaining: 0,
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - bucket.count),
    };
  }

  clear(): void {
    this.buckets.clear();
    this.pruneCursor = null;
  }

  private pruneExpired(nowMs: number): void {
    if (this.buckets.size === 0) {
      this.pruneCursor = null;
      return;
    }
    this.pruneCursor ??= this.buckets.entries();
    let inspected = 0;
    while (inspected < AiRateLimitService.MAX_PRUNE_PER_CHECK) {
      const next = this.pruneCursor.next();
      if (next.done) {
        this.pruneCursor = null;
        return;
      }
      const [userId, bucket] = next.value;
      if (bucket.resetAtMs <= nowMs) {
        this.buckets.delete(userId);
      }
      inspected += 1;
    }
  }
}
