import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './env.js';

export const STORAGE_ROOT = path.resolve(ROOT_DIR, 'storage');
export const FONTS_DIR = path.resolve(ROOT_DIR, 'apps', 'api', 'assets', 'fonts');

const STORAGE_SUBDIRS = ['uploads', 'renders', 'transcripts', 'exports', 'brand-kits', 'temp'];

export function ensureStorageDirectories(): void {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  }
  for (const sub of STORAGE_SUBDIRS) {
    const dir = path.join(STORAGE_ROOT, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
  }
}

export function resolveSafeStoragePath(relativePath: string): string {
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(STORAGE_ROOT, cleaned);
  const rootWithSep = STORAGE_ROOT.endsWith(path.sep) ? STORAGE_ROOT : `${STORAGE_ROOT}${path.sep}`;

  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error('PATH_TRAVERSAL_BLOCKED');
  }
  return resolved;
}

export function getDirectorySizeBytes(targetDir: string): number {
  if (!fs.existsSync(targetDir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  }
  return total;
}
