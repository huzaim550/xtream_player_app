/**
 * Offline downloads: which titles, and what state each one is in.
 *
 * Modelled on `progress.ts`, and for the same reason: every entry carries its
 * own title, poster and extension. A downloaded film has to be findable and
 * playable with no catalogue, no session and no network at all -- which is the
 * entire point of having downloaded it. Storing ids alone (the way favourites
 * do) would make the Downloads list go blank in aeroplane mode.
 *
 * One transfer runs at a time. Anything else sits `queued` and starts when the
 * active one settles. That is a deliberate limit: two concurrent transfers
 * through the Cloudflare tunnel are slower than one, and each start refreshes
 * the server's 30-minute connection slot for this device.
 */

import { create } from 'zustand';
import {
  availableDiskSpace,
  deleteDownloadFile,
  downloadFileExists,
  downloadFileSize,
  downloadsAvailable,
  formatBytes,
  startDownload,
  type StartedDownload,
} from '@/api/download';
import { Keys, readJson, writeJson } from './persist';
import type { Session } from '@/types/domain';

/** Trailing debounce on the coalesced disk write, as in progress.ts. */
const WRITE_DEBOUNCE_MS = 500;

/**
 * Refuse to start below this much free space.
 *
 * We cannot know a film's size before the transfer begins -- the Content-Length
 * only arrives with the response -- so this is a floor, not a fit check. It
 * exists because filling the last of a device's storage does not fail politely:
 * it breaks other apps, and on a small Fire Stick it can break the launcher.
 */
const MIN_FREE_BYTES = 1024 ** 3;

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed';

export interface DownloadEntry {
  /** The same key progress.ts uses: movieKey(id) / episodeKey(id). */
  key: string;
  kind: 'movie' | 'episode';
  id: string;
  ext: string;
  title: string;
  posterUrl: string | null;
  seriesId?: number;
  seriesName?: string;
  season?: number;
  episodeNum?: number;
  /** file:// uri, set once the transfer completes. */
  fileUri: string | null;
  bytesWritten: number;
  /** -1 when the server sent no Content-Length. */
  bytesTotal: number;
  status: DownloadStatus;
  error?: string;
  createdAt: number;
}

interface DownloadsFile {
  version: 1;
  entries: Record<string, DownloadEntry>;
}

/** Live transfer handles. Not state -- they do not survive a reload. */
const active = new Map<string, StartedDownload>();

interface DownloadsState {
  entries: Record<string, DownloadEntry>;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Queue a title. No-op if it is already queued, running or done. */
  enqueue: (
    session: Session,
    entry: Omit<
      DownloadEntry,
      'fileUri' | 'bytesWritten' | 'bytesTotal' | 'status' | 'createdAt' | 'error'
    >,
  ) => void;
  cancel: (key: string) => void;
  retry: (session: Session, key: string) => void;
  remove: (key: string) => void;
  clearAll: () => Promise<void>;
  get: (key: string) => DownloadEntry | undefined;
  /** Newest first. */
  list: () => DownloadEntry[];
  /** Total bytes on disk across completed downloads. */
  bytesUsed: () => number;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

export const useDownloads = create<DownloadsState>((set, get) => {
  const scheduleWrite = () => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void writeJson(Keys.downloads, {
        version: 1,
        entries: get().entries,
      } satisfies DownloadsFile);
    }, WRITE_DEBOUNCE_MS);
  };

  const patch = (key: string, changes: Partial<DownloadEntry>) => {
    set((s) => {
      const existing = s.entries[key];
      if (!existing) return s;
      return { entries: { ...s.entries, [key]: { ...existing, ...changes } } };
    });
    scheduleWrite();
  };

  /**
   * Start the oldest queued entry, if nothing is running.
   *
   * Called after every state change that could free the slot, so the queue
   * drains without a timer.
   */
  const pump = (session: Session) => {
    if (active.size > 0) return;
    const next = Object.values(get().entries)
      .filter((e) => e.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;

    patch(next.key, { status: 'downloading', error: undefined });

    // Progress fires several times a second. Only the in-memory store is
    // updated that often; scheduleWrite coalesces the disk write, exactly as
    // playback progress does.
    const handle = startDownload({
      session,
      key: next.key,
      kind: next.kind,
      id: next.id,
      ext: next.ext,
      onProgress: (bytesWritten, bytesTotal) =>
        patch(next.key, { bytesWritten, bytesTotal }),
    });
    active.set(next.key, handle);

    handle.promise
      .then((uri) => {
        active.delete(next.key);
        if (uri) {
          patch(next.key, { status: 'done', fileUri: uri });
        } else {
          // Resolved null means paused, which we never request; treat it as a
          // stall rather than silently leaving the row spinning forever.
          patch(next.key, { status: 'failed', error: 'Download stopped.' });
        }
        pump(session);
      })
      .catch((err: unknown) => {
        active.delete(next.key);
        // A cancel() rejects too, but cancel() has already removed the record,
        // so patch() is a no-op there and this cannot resurrect it.
        patch(next.key, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Download failed.',
        });
        pump(session);
      });
  };

  return {
    entries: {},
    hydrated: false,

    hydrate: async () => {
      const file = await readJson<DownloadsFile>(Keys.downloads);
      const stored = file?.entries ?? {};

      // Without the native module we cannot look at the disk at all. Keep the
      // records untouched rather than reconciling against a filesystem we
      // cannot read -- that would delete every record on a build where
      // downloads merely happen to be unavailable.
      if (!downloadsAvailable()) {
        set({ entries: stored, hydrated: true });
        return;
      }

      const kept: Record<string, DownloadEntry> = {};

      for (const [k, e] of Object.entries(stored)) {
        if (e.status === 'done') {
          // The file can be gone without us knowing: "clear app storage", or a
          // restore onto a different device. A record pointing at nothing would
          // fail at play time with no explanation, so drop it here instead.
          if (e.fileUri && downloadFileExists(e.fileUri)) kept[k] = e;
          continue;
        }
        // Nothing survives the process dying mid-transfer -- the native task is
        // foreground-only and its JS handle is gone. Say so plainly and offer a
        // retry rather than showing a progress bar that will never move. An
        // entry that already failed keeps its own reason, which is more useful
        // than a generic one.
        kept[k] = {
          ...e,
          status: 'failed',
          error: e.status === 'failed' ? e.error : 'Interrupted. Tap to retry.',
          bytesWritten: 0,
        };
      }

      set({ entries: kept, hydrated: true });
      await writeJson(Keys.downloads, { version: 1, entries: kept } satisfies DownloadsFile);
    },

    enqueue: (session, entry) => {
      const existing = get().entries[entry.key];
      if (existing && existing.status !== 'failed') return;

      const unavailable = !downloadsAvailable();
      const free = availableDiskSpace();
      const tooFull = free < MIN_FREE_BYTES;
      const blocked = unavailable || tooFull;

      set((s) => ({
        entries: {
          ...s.entries,
          [entry.key]: {
            ...entry,
            fileUri: null,
            bytesWritten: 0,
            bytesTotal: -1,
            // Recorded as a failure rather than silently dropped, so the reason
            // shows up on the row the user just tapped.
            status: blocked ? 'failed' : 'queued',
            error: unavailable
              ? 'Downloads are not supported by this build of the app.'
              : tooFull
                ? `Not enough space — ${formatBytes(free)} free.`
                : undefined,
            createdAt: Date.now(),
          },
        },
      }));
      scheduleWrite();
      if (!blocked) pump(session);
    },

    cancel: (key) => {
      active.get(key)?.cancel();
      active.delete(key);
      get().remove(key);
    },

    retry: (session, key) => {
      const e = get().entries[key];
      if (!e) return;
      patch(key, { status: 'queued', bytesWritten: 0, error: undefined });
      pump(session);
    },

    remove: (key) => {
      const e = get().entries[key];
      if (e) deleteDownloadFile(e.key, e.ext);
      set((s) => {
        const next = { ...s.entries };
        delete next[key];
        return { entries: next };
      });
      scheduleWrite();
    },

    clearAll: async () => {
      for (const handle of active.values()) handle.cancel();
      active.clear();
      for (const e of Object.values(get().entries)) deleteDownloadFile(e.key, e.ext);
      set({ entries: {} });
      await writeJson(Keys.downloads, { version: 1, entries: {} } satisfies DownloadsFile);
    },

    get: (key) => get().entries[key],

    list: () => Object.values(get().entries).sort((a, b) => b.createdAt - a.createdAt),

    bytesUsed: () =>
      Object.values(get().entries).reduce(
        (sum, e) => sum + (e.fileUri ? downloadFileSize(e.fileUri) : 0),
        0,
      ),
  };
});
