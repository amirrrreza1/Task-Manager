import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function collectEnvFiles(startDir: string): string[] {
  const files: string[] = [];
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    const file = resolve(dir, '.env');
    if (existsSync(file)) {
      files.push(file);
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return files;
}

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function applyEnvFile(file: string) {
  const parsed = parseEnvFile(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

export function resolveEnvFilePaths(): string[] {
  const paths = [...new Set([...collectEnvFiles(process.cwd()), ...collectEnvFiles(__dirname)])];
  for (const file of [...paths].reverse()) {
    applyEnvFile(file);
  }
  return paths;
}
