// Locates, downloads and verifies the native libreclaim library used by TEE mode.
//
// The binaries aren't shipped in the npm package. They're published as GitHub
// Release assets and pinned by sha256 in ./tee-manifest. The postinstall script
// downloads the current platform's binary; if that was skipped (for example
// `npm install --ignore-scripts`), the first `useTee: true` request downloads it.
//
// Kept free of heavy imports: scripts/postinstall.js loads the built copy of
// this module (dist/tee-library.js) during `npm install`.

import { createHash, randomBytes } from 'crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { TEE_LIBRARY_MANIFEST, TeeLibraryFile } from './tee-manifest';

/** Use this library file as-is (no download, no checksum). For offline or locked-down installs. */
export const TEE_LIB_PATH_ENV = 'RECLAIM_TEE_LIB_PATH';
/** Download from this base URL instead of GitHub Releases (a mirror). The sha256 pins still apply. */
export const TEE_LIB_BASE_URL_ENV = 'RECLAIM_TEE_LIB_BASE_URL';
/** Set to 1 to skip the download during `npm install`. */
export const TEE_SKIP_DOWNLOAD_ENV = 'RECLAIM_TEE_SKIP_DOWNLOAD';

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** `${process.platform}-${process.arch}`, plus `linux-musl-*` on non-glibc Linux. */
export function getTeePlatformKey(): string {
  const { platform, arch } = process;
  if (platform === 'linux' && !isGlibc()) {
    return `linux-musl-${arch}`;
  }
  return `${platform}-${arch}`;
}

function isGlibc(): boolean {
  try {
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
    return Boolean(report?.header?.glibcVersionRuntime);
  } catch {
    return true; // can't tell: assume glibc, the common case
  }
}

function getManifestEntry(): TeeLibraryFile {
  const key = getTeePlatformKey();
  const entry = TEE_LIBRARY_MANIFEST.files[key];
  if (!entry) {
    const supported = Object.keys(TEE_LIBRARY_MANIFEST.files);
    throw new Error(
      `TEE mode isn't available on ${key}. ` +
        (supported.length
          ? `Supported platforms: ${supported.join(', ')}.`
          : 'No TEE library is published for this zk-fetch version.') +
        ` To use your own build, set ${TEE_LIB_PATH_ENV}.`
    );
  }
  return entry;
}

/** Where a verified binary may live: inside the package, then a per-user cache. */
function candidatePaths(entry: TeeLibraryFile): string[] {
  return [
    // dist/ -> <package>/lib/
    join(__dirname, '..', 'lib', entry.file),
    join(userCacheDir(), 'reclaim-zk-fetch', entry.sha256, entry.file),
  ];
}

function userCacheDir(): string {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches');
  }
  return process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

const verifiedPaths = new Set<string>();

async function isVerified(path: string, sha256: string): Promise<boolean> {
  if (verifiedPaths.has(path)) {
    return true;
  }
  if (!existsSync(path)) {
    return false;
  }
  if ((await sha256File(path)) !== sha256) {
    return false;
  }
  verifiedPaths.add(path);
  return true;
}

/**
 * Path of a verified libreclaim for this platform, downloading it if needed.
 * Honors RECLAIM_TEE_LIB_PATH (used as-is) and RECLAIM_TEE_LIB_BASE_URL (mirror).
 */
export async function ensureTeeLibrary(): Promise<string> {
  const override = process.env[TEE_LIB_PATH_ENV];
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`${TEE_LIB_PATH_ENV} points to a missing file: ${override}`);
    }
    return override;
  }

  const entry = getManifestEntry();
  const candidates = candidatePaths(entry);
  for (const path of candidates) {
    if (await isVerified(path, entry.sha256)) {
      return path;
    }
  }

  const url = `${(process.env[TEE_LIB_BASE_URL_ENV] || TEE_LIBRARY_MANIFEST.baseUrl).replace(/\/+$/, '')}/${entry.file}`;
  const errors: string[] = [];
  for (const path of candidates) {
    try {
      await downloadVerified(url, path, entry.sha256);
      verifiedPaths.add(path);
      return path;
    } catch (error) {
      errors.push(`${path}: ${(error as Error).message}`);
      // A bad download fails the same way everywhere; only retry other locations for filesystem errors.
      if ((error as NodeJS.ErrnoException).code === undefined) {
        break;
      }
    }
  }
  throw new Error(
    `Couldn't download the TEE library from ${url}.\n  ${errors.join('\n  ')}\n` +
      `To install it manually, download that file, check its sha256 is ${entry.sha256}, and set ${TEE_LIB_PATH_ENV} to its path.`
  );
}

async function downloadVerified(url: string, destination: string, expectedSha256: string): Promise<void> {
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const hash = createHash('sha256');
    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body as import('stream/web').ReadableStream), hasher, createWriteStream(temporary));
    const actual = hash.digest('hex');
    if (actual !== expectedSha256) {
      throw new Error(`checksum mismatch: expected sha256 ${expectedSha256}, got ${actual}`);
    }
    // Atomic: concurrent installs each write their own temp file, and a
    // partially written file is never visible under the final name.
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Synchronous lookup for an already-verified library (no download). */
export function getVerifiedTeeLibraryPath(): string | undefined {
  const override = process.env[TEE_LIB_PATH_ENV];
  if (override) {
    return override;
  }
  const entry = getManifestEntry();
  return candidatePaths(entry).find((path) => verifiedPaths.has(path));
}
