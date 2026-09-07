import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
  blockExpiresAt: number;
  lastAccessed: number;
}

@Injectable()
export class TokenBucketThrottlerStorageService implements ThrottlerStorage, OnApplicationShutdown {
  private readonly buckets = new Map<string, BucketState>();
  private readonly cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    cleanupIntervalMs = 60_000,
    private readonly maxIdleMs = 300_000,
  ) {
    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.pruneIdleBuckets(), cleanupIntervalMs);
      if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
        this.cleanupInterval.unref();
      }
    }
  }

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const storageKey = `${key}:${throttlerName}`;
    const refillRate = limit / ttl; // tokens per millisecond

    let bucket = this.buckets.get(storageKey);

    if (!bucket) {
      // First request initializes bucket at full capacity
      bucket = {
        tokens: limit,
        lastRefill: now,
        blockExpiresAt: 0,
        lastAccessed: now,
      };
      this.buckets.set(storageKey, bucket);
    } else {
      bucket.lastAccessed = now;

      // Lazily replenish tokens based on elapsed time
      const elapsedMs = Math.max(0, now - bucket.lastRefill);
      if (elapsedMs > 0) {
        bucket.tokens = Math.min(limit, bucket.tokens + elapsedMs * refillRate);
        bucket.lastRefill = now;
      }
    }

    // If client is actively blocked, check remaining block duration
    if (bucket.blockExpiresAt > now) {
      const timeToBlockExpire = Math.max(1, Math.ceil((bucket.blockExpiresAt - now) / 1000));
      const timeToExpire = Math.max(1, Math.ceil((limit - bucket.tokens) / (refillRate * 1000)));

      return Promise.resolve({
        totalHits: limit + 1,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire,
      });
    }

    // Try consuming 1 token
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;

      // In ThrottlerGuard: remaining = Math.max(0, limit - totalHits)
      // totalHits = limit - Math.floor(bucket.tokens) -> remaining = Math.floor(bucket.tokens)
      const totalHits = limit - Math.floor(bucket.tokens);
      const timeToExpire =
        bucket.tokens < limit
          ? Math.max(1, Math.ceil((limit - bucket.tokens) / (refillRate * 1000)))
          : 0;

      return Promise.resolve({
        totalHits,
        timeToExpire,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    }

    // Insufficient tokens (< 1)
    const msNeededForOneToken = (1 - bucket.tokens) / refillRate;
    const blockMs =
      blockDuration > 0 && blockDuration !== ttl ? blockDuration : msNeededForOneToken;
    bucket.blockExpiresAt = now + blockMs;

    const timeToBlockExpire = Math.max(1, Math.ceil(msNeededForOneToken / 1000));
    const timeToExpire = Math.max(1, Math.ceil((limit - bucket.tokens) / (refillRate * 1000)));

    return Promise.resolve({
      totalHits: limit + 1,
      timeToExpire,
      isBlocked: true,
      timeToBlockExpire,
    });
  }

  pruneIdleBuckets(): void {
    const cutoff = Date.now() - this.maxIdleMs;
    for (const [key, state] of this.buckets.entries()) {
      if (state.lastAccessed < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  getBucketCount(): number {
    return this.buckets.size;
  }

  getBucket(key: string, throttlerName: string): BucketState | undefined {
    return this.buckets.get(`${key}:${throttlerName}`);
  }

  onApplicationShutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
  }
}
