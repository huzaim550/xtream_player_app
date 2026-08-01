/**
 * Watch progress and Continue Watching.
 *
 * Entries are keyed on the server's stream ids, which are crc32 of the R2
 * object key (xtream/library.py sid_for) rather than a database sequence. That
 * makes them content-derived, so a resume point survives server restarts,
 * rescans, container rebuilds, even a from-scratch redeploy against the same
 * bucket. Only renaming the underlying file changes an id -- so a missing id
 * means "gone", never "corrupt".
 *
 * Title, poster and extension are denormalised into each entry deliberately:
 * Continue Watching then renders *and plays* with zero API calls, which is what
 * makes it work offline and instantly on a cold start.
 */

import { create } from 'zustand';
import { Keys, readJson, writeJson } from './persist';

/** Below this, a play was a mis-click; don't pollute Continue Watching. */
const MIN_TRACK_SECONDS = 15;
/** Below this, silently start over rather than offering to resume. */
const MIN_RESUME_SECONDS = 30;
/** Rewind slightly on resume -- universally expected. */
const RESUME_REWIND_SECONDS = 5;
/** Fraction watched that counts as finished. */
const FINISHED_FRACTION = 0.92;
/** ...or this close to the end, which handles long credits. */
const FINISHED_TAIL_SECONDS = 120;

const MAX_CONTINUE_ROW = 20;
const PRUNE_AFTER_MS = 180 * 24 * 60 * 60 * 1000;
/** Trailing debounce on the single coalesced disk write. */
const WRITE_DEBOUNCE_MS = 500;

export interface ProgressEntry {
  key: string;
  kind: 'movie' | 'episode';
  /** stream_id for a movie; the string episode id for an episode. */
  id: string;
  ext: string;
  title: string;
  posterUrl: string | null;
  seriesId?: number;
  seriesName?: string;
  season?: number;
  episodeNum?: number;
  positionSec: number;
  durationSec: number;
  finished: boolean;
  updatedAt: number;
}

interface ProgressFile {
  version: 1;
  entries: Record<string, ProgressEntry>;
}

export const movieKey = (id: number | string) => `movie:${id}`;
export const episodeKey = (id: string) => `ep:${id}`;

function isFinished(positionSec: number, durationSec: number): boolean {
  if (durationSec <= 0) return false;
  if (positionSec / durationSec >= FINISHED_FRACTION) return true;
  return durationSec - positionSec <= FINISHED_TAIL_SECONDS;
}

interface ProgressState {
  entries: Record<string, ProgressEntry>;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Update in memory. Cheap enough to call once a second while playing. */
  record: (
    entry: Omit<ProgressEntry, 'finished' | 'updatedAt'>,
  ) => void;
  /** Force the pending write out now -- on pause, unmount, or backgrounding. */
  flush: () => Promise<void>;
  get: (key: string) => ProgressEntry | undefined;
  resumeAt: (key: string) => number;
  remove: (key: string) => void;
  clearAll: () => Promise<void>;
  continueWatching: () => ProgressEntry[];
  lastEpisodeFor: (seriesId: number) => ProgressEntry | undefined;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

export const useProgress = create<ProgressState>((set, get) => {
  /** One setItem of the whole map, never one per entry. It is a few KB even
   *  with hundreds of entries, and coalescing avoids write amplification
   *  during playback. */
  const scheduleWrite = () => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void writeJson(Keys.progress, { version: 1, entries: get().entries });
    }, WRITE_DEBOUNCE_MS);
  };

  return {
    entries: {},
    hydrated: false,

    hydrate: async () => {
      const file = await readJson<ProgressFile>(Keys.progress);
      const entries = file?.entries ?? {};
      // Drop only long-finished entries. Never prune on "not in the catalogue":
      // a transient empty catalogue would wipe the user's entire history.
      const cutoff = Date.now() - PRUNE_AFTER_MS;
      const kept: Record<string, ProgressEntry> = {};
      for (const [k, e] of Object.entries(entries)) {
        if (e.finished && e.updatedAt < cutoff) continue;
        kept[k] = e;
      }
      set({ entries: kept, hydrated: true });
    },

    record: (entry) => {
      if (entry.positionSec < MIN_TRACK_SECONDS && !get().entries[entry.key]) return;
      const finished = isFinished(entry.positionSec, entry.durationSec);
      set((s) => ({
        entries: {
          ...s.entries,
          [entry.key]: { ...entry, finished, updatedAt: Date.now() },
        },
      }));
      scheduleWrite();
    },

    flush: async () => {
      if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      await writeJson(Keys.progress, { version: 1, entries: get().entries });
    },

    get: (key) => get().entries[key],

    /** 0 when there is nothing worth resuming. */
    resumeAt: (key) => {
      const e = get().entries[key];
      if (!e || e.finished) return 0;
      if (e.positionSec < MIN_RESUME_SECONDS) return 0;
      return Math.max(0, e.positionSec - RESUME_REWIND_SECONDS);
    },

    remove: (key) => {
      set((s) => {
        const next = { ...s.entries };
        delete next[key];
        return { entries: next };
      });
      scheduleWrite();
    },

    clearAll: async () => {
      set({ entries: {} });
      await writeJson(Keys.progress, { version: 1, entries: {} });
    },

    /** Most recent first, one card per series, unfinished only. */
    continueWatching: () => {
      const all = Object.values(get().entries)
        .filter((e) => !e.finished && e.positionSec >= MIN_RESUME_SECONDS)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const seen = new Set<number>();
      const out: ProgressEntry[] = [];
      for (const e of all) {
        if (e.kind === 'episode' && e.seriesId !== undefined) {
          if (seen.has(e.seriesId)) continue;
          seen.add(e.seriesId);
        }
        out.push(e);
        if (out.length >= MAX_CONTINUE_ROW) break;
      }
      return out;
    },

    /** Drives the "Continue S2E4" call to action on a series screen. */
    lastEpisodeFor: (seriesId) =>
      Object.values(get().entries)
        .filter((e) => e.kind === 'episode' && e.seriesId === seriesId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0],
  };
});
