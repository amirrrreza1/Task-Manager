import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TokenBucketThrottlerStorageService } from '../dist/infrastructure/throttler/token-bucket-throttler-storage.service.js';

describe('TokenBucketThrottlerStorageService', () => {
  it('allows initial burst requests up to the limit', async () => {
    const storage = new TokenBucketThrottlerStorageService(0);
    const limit = 5;
    const ttl = 60_000; // 60s
    const key = 'test-client-1';

    for (let i = 1; i <= limit; i++) {
      const record = await storage.increment(key, ttl, limit, ttl, 'default');
      assert.equal(record.isBlocked, false, `Request ${i} should be allowed`);
      assert.equal(record.totalHits, i, `totalHits should match consumed token count ${i}`);
      assert.equal(record.timeToBlockExpire, 0);
    }

    // Next request when bucket is empty should be blocked
    const blockedRecord = await storage.increment(key, ttl, limit, ttl, 'default');
    assert.equal(blockedRecord.isBlocked, true, 'Request exceeding capacity should be blocked');
    assert.ok(blockedRecord.totalHits > limit);
    assert.ok(blockedRecord.timeToBlockExpire >= 1, 'timeToBlockExpire should be at least 1s');
    storage.onApplicationShutdown();
  });

  it('replenishes tokens over time at the defined refill rate', async () => {
    const storage = new TokenBucketThrottlerStorageService(0);
    // Limit = 10 tokens per 100ms -> refill rate = 0.1 tokens/ms (1 token every 10ms)
    const limit = 10;
    const ttl = 100;
    const key = 'test-client-refill';

    // Consume all 10 tokens
    for (let i = 0; i < limit; i++) {
      const rec = await storage.increment(key, ttl, limit, ttl, 'default');
      assert.equal(rec.isBlocked, false);
    }

    // 11th request immediately is blocked
    const blocked = await storage.increment(key, ttl, limit, ttl, 'default');
    assert.equal(blocked.isBlocked, true);

    // Wait 35ms (should generate ~3 tokens)
    await new Promise((resolve) => setTimeout(resolve, 35));

    const replenishedRecord = await storage.increment(key, ttl, limit, ttl, 'default');
    assert.equal(replenishedRecord.isBlocked, false, 'Should allow request after tokens replenish');
    storage.onApplicationShutdown();
  });

  it('caps token replenishment at maximum bucket capacity', async () => {
    const storage = new TokenBucketThrottlerStorageService(0);
    const limit = 3;
    const ttl = 50;
    const key = 'test-client-cap';

    // Use 1 token
    const first = await storage.increment(key, ttl, limit, ttl, 'default');
    assert.equal(first.totalHits, 1);

    // Wait long enough to exceed capacity replenishment (100ms > ttl)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Next request should see a full bucket minus 1 consumed token
    const afterIdle = await storage.increment(key, ttl, limit, ttl, 'default');
    assert.equal(afterIdle.isBlocked, false);
    assert.equal(afterIdle.totalHits, 1, 'Total hits should be 1 since bucket was full at limit');
    storage.onApplicationShutdown();
  });

  it('maintains independent buckets for different keys and throttler names', async () => {
    const storage = new TokenBucketThrottlerStorageService(0);
    const limit = 2;
    const ttl = 60_000;

    // Exhaust client A on default throttler
    await storage.increment('client-A', ttl, limit, ttl, 'default');
    await storage.increment('client-A', ttl, limit, ttl, 'default');
    const blockedA = await storage.increment('client-A', ttl, limit, ttl, 'default');
    assert.equal(blockedA.isBlocked, true);

    // Client B on default throttler should still have full bucket
    const recordB = await storage.increment('client-B', ttl, limit, ttl, 'default');
    assert.equal(recordB.isBlocked, false);

    // Client A on a different named throttler should have its own separate bucket
    const recordALogin = await storage.increment('client-A', ttl, limit, ttl, 'login');
    assert.equal(recordALogin.isBlocked, false);
    storage.onApplicationShutdown();
  });

  it('prunes idle buckets after maxIdleMs', async () => {
    // maxIdleMs = 20ms
    const storage = new TokenBucketThrottlerStorageService(0, 20);
    await storage.increment('active-client', 60_000, 10, 60_000, 'default');
    await storage.increment('idle-client', 60_000, 10, 60_000, 'default');

    assert.equal(storage.getBucketCount(), 2);

    // Wait 30ms so both exceed maxIdleMs
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Access active-client to refresh lastAccessed
    await storage.increment('active-client', 60_000, 10, 60_000, 'default');

    // Run pruning
    storage.pruneIdleBuckets();

    assert.equal(storage.getBucketCount(), 1);
    assert.ok(storage.getBucket('active-client', 'default'));
    assert.equal(storage.getBucket('idle-client', 'default'), undefined);
    storage.onApplicationShutdown();
  });

  it('cleans up on shutdown', async () => {
    const storage = new TokenBucketThrottlerStorageService(1000, 5000);
    await storage.increment('client-1', 60_000, 10, 60_000, 'default');
    assert.equal(storage.getBucketCount(), 1);

    storage.onApplicationShutdown();
    assert.equal(storage.getBucketCount(), 0);
  });
});
