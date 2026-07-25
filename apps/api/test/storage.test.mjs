import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { LocalFileStorage } from '../dist/infrastructure/storage/local-file-storage.service.js';

describe('LocalFileStorage', () => {
  it('uses opaque keys, preserves bytes, calculates SHA-256, and rejects path traversal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'task-manager-storage-'));
    const source = join(directory, 'incoming.tmp');
    const bytes = Buffer.from('v0.3 attachment test');
    await writeFile(source, bytes);
    const storage = new LocalFileStorage({ get: (_key, fallback) => directory ?? fallback });

    try {
      const stored = await storage.put(source);
      assert.match(stored.storageKey, /^[a-f0-9]{64}$/);
      assert.equal(stored.checksum, createHash('sha256').update(bytes).digest('hex'));
      const chunks = [];
      for await (const chunk of storage.open(stored.storageKey)) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), bytes);
      assert.throws(() => storage.open('../outside'), /invalid storage key/i);
      await storage.delete(stored.storageKey);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
