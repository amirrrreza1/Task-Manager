import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, copyFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

@Injectable()
export class LocalFileStorage {
  private readonly directory: string;

  constructor(config: ConfigService) {
    this.directory = resolve(config.get<string>('UPLOAD_DIRECTORY', './uploads'));
  }

  async put(sourcePath: string) {
    await mkdir(this.directory, { recursive: true });
    const storageKey = randomBytes(32).toString('hex');
    const destination = this.pathFor(storageKey);
    const checksum = await this.checksum(sourcePath);
    try {
      await rename(sourcePath, destination);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (code !== 'EXDEV') throw error;
      await copyFile(sourcePath, destination);
      await rm(sourcePath, { force: true });
    }
    return { storageKey, checksum };
  }

  open(storageKey: string) {
    return createReadStream(this.pathFor(storageKey));
  }

  async delete(storageKey: string) {
    await rm(this.pathFor(storageKey), { force: true });
  }

  private pathFor(storageKey: string) {
    if (!/^[a-f0-9]{64}$/.test(storageKey)) throw new Error('Invalid storage key.');
    const target = resolve(this.directory, storageKey);
    if (!target.startsWith(`${this.directory}${sep}`))
      throw new Error('Storage path escaped its root.');
    return target;
  }

  private checksum(path: string) {
    return new Promise<string>((resolveChecksum, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolveChecksum(hash.digest('hex')));
    });
  }
}
