/**
 * Offline downloads: the file transfer itself.
 *
 * This module owns the disk and the network task. Which titles are downloaded,
 * and what state each one is in, belongs to `src/store/downloads.ts` -- this
 * file only knows how to move bytes and where to put them.
 *
 * Three server facts shape everything here, and all three are the same ones
 * that govern playback:
 *
 * 1. `/movie|/series/...` 302-redirects to a presigned R2 URL and grabs a
 *    connection slot the server holds for 30 minutes (xtream/state.py
 *    CONN_WINDOW) against a max_connections of 2. So the URL is built at the
 *    moment a transfer starts and never earlier -- and never stored, because a
 *    stored one would have to be re-requested anyway.
 * 2. No `headers` on the request. OkHttp replays them onto the presigned
 *    redirect, which breaks the SigV4 signature. This is why DownloadTaskOptions
 *    below carries `onProgress` and a signal but deliberately no `headers`.
 * 3. The presigned target lives 6h (xtream/config.py DEFAULT_LINK_TTL). One
 *    transfer follows the 302 itself and is fine; a *retry* must go back to
 *    `/movie|/series/...` for a fresh redirect rather than reuse anything.
 */

import { episodeStreamUrl, movieStreamUrl } from './streamUrl';
import type { Session } from '@/types/domain';

type FileSystemModule = typeof import('expo-file-system');

/**
 * expo-file-system is loaded lazily, and that is load-bearing rather than a
 * micro-optimisation.
 *
 * Its module scope ends in `requireNativeModule('FileSystem')`, which throws
 * the moment the module is evaluated if the native side is missing from the
 * binary -- an APK built before the dependency was added, or any build where
 * autolinking did not re-run. A static import here would put that throw on the
 * startup path (this file is reachable from the downloads store, which the app
 * layout hydrates on mount), turning "downloads do not work" into "the app does
 * not start". Requiring on demand keeps the failure where it belongs.
 */
let cached: FileSystemModule | null | undefined;

function fs(): FileSystemModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-file-system') as FileSystemModule;
  } catch (err) {
    if (__DEV__) console.warn('[download] expo-file-system is unavailable', err);
    cached = null;
  }
  return cached;
}

/** False when the native module is missing; the UI says so instead of crashing. */
export function downloadsAvailable(): boolean {
  return fs() !== null;
}

/**
 * Where downloaded video lives.
 *
 * `Paths.document`, never `Paths.cache`: the cache directory is deletable by
 * the system at any moment, which would silently vaporise a 2 GB download the
 * user waited on. This directory is app-private -- no other app, no gallery and
 * no file manager can see into it, and it is removed with the app on uninstall.
 * That is what "only accessible in the app" means here: OS sandboxing, not
 * encryption. Root access would still read it, and the privacy policy says so.
 */
function downloadsDir(mod: FileSystemModule) {
  const dir = new mod.Directory(mod.Paths.document, 'downloads');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Deterministic from the entry key, so a restart can always find the file. */
function fileFor(mod: FileSystemModule, key: string, ext: string) {
  // Keys are `movie:123` / `ep:456`; ':' is legal on ext4 but not worth the risk.
  return new mod.File(downloadsDir(mod), `${key.replace(':', '_')}.${ext}`);
}

export interface StartDownloadArgs {
  session: Session;
  key: string;
  kind: 'movie' | 'episode';
  /** stream_id for a movie; the string episode id for an episode. */
  id: string;
  ext: string;
  onProgress: (bytesWritten: number, totalBytes: number) => void;
}

export interface StartedDownload {
  /** Resolves to the finished file's uri, or null if it was paused. */
  promise: Promise<string | null>;
  cancel: () => void;
}

/**
 * Begin one transfer. The caller is responsible for making sure only as many of
 * these run at once as it wants -- this function does not queue.
 */
export function startDownload({
  session,
  key,
  kind,
  id,
  ext,
  onProgress,
}: StartDownloadArgs): StartedDownload {
  const mod = fs();
  if (!mod) {
    return {
      promise: Promise.reject(
        new Error('Downloads are not supported by this build of the app.'),
      ),
      cancel: () => {},
    };
  }

  const dest = fileFor(mod, key, ext);
  // A previous failed attempt leaves a partial file that would make the task
  // throw on create; the retry is meant to start clean.
  if (dest.exists) dest.delete();

  // Built here, inside the start handler, for the connection-slot reason above.
  const url =
    kind === 'movie'
      ? movieStreamUrl(session, Number(id), ext)
      : episodeStreamUrl(session, id, ext);

  const task = mod.File.createDownloadTask(url, dest, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
  });

  return {
    promise: task.downloadAsync().then((file) => (file ? file.uri : null)),
    cancel: () => {
      task.cancel();
      // cancel() rejects the pending promise but leaves the partial file.
      try {
        if (dest.exists) dest.delete();
      } catch {
        /* the file is already gone, or was never created */
      }
    },
  };
}

/** Remove a downloaded file. Safe to call when it is already gone. */
export function deleteDownloadFile(key: string, ext: string): void {
  const mod = fs();
  if (!mod) return;
  try {
    const f = fileFor(mod, key, ext);
    if (f.exists) f.delete();
  } catch {
    /* nothing useful to do -- the record is being dropped either way */
  }
}

/** True if the file backing a 'done' record is still on disk. */
export function downloadFileExists(uri: string): boolean {
  const mod = fs();
  if (!mod) return false;
  try {
    return new mod.File(uri).exists;
  } catch {
    return false;
  }
}

/** Bytes on disk for a completed download, for the storage-used line. */
export function downloadFileSize(uri: string): number {
  const mod = fs();
  if (!mod) return 0;
  try {
    const f = new mod.File(uri);
    return f.exists ? f.size : 0;
  } catch {
    return 0;
  }
}

/** Free space, so we can refuse a download that obviously will not fit. */
export function availableDiskSpace(): number {
  const mod = fs();
  if (!mod) return Number.POSITIVE_INFINITY;
  try {
    return mod.Paths.availableDiskSpace;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Pure -- no native dependency, so Settings can show sizes regardless. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
