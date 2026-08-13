/**
 * The now/next guide, per channel.
 *
 * Fetched lazily, for the rows actually on screen, and kept in memory only.
 *
 * Not persisted, unlike the catalogue -- and that is the whole design decision
 * here. A cached poster is still correct a week later; a cached "on now" is
 * wrong within the hour, and a channel list confidently showing last night's
 * programmes is worse than one showing none. So the guide is allowed to be
 * absent, every row renders fine without it, and nothing here survives a
 * restart. That also means there is nothing for store/wipe.ts to erase.
 *
 * `get_short_epg` costs the server almost nothing -- it reads an in-memory dict
 * and, unlike a stream URL, takes no connection slot -- but it is one request
 * per channel, so the throttling below is about the *device's* request budget
 * and the tunnel's, not the server's.
 */

import { create } from 'zustand';
import { getShortEpg } from '@/api/endpoints';
import { AuthError } from '@/api/errors';
import type { Programme, Session } from '@/types/domain';

/**
 * How long a channel's guide is trusted without re-asking.
 *
 * Freshness is not only about this: `isFresh` below also refuses an entry whose
 * current programme has already finished, so a channel whose 30-minute show
 * ends two minutes after we fetched it updates then, not eight minutes later.
 */
const TTL_MS = 10 * 60 * 1000;

/** In flight at once. A category of 200 channels must not open 200 sockets. */
const MAX_CONCURRENT = 3;

/** now + next is all any row shows, so there is no reason to ask for more. */
const LISTINGS = 2;

export interface EpgEntry {
  programmes: Programme[];
  fetchedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Pure functions of the map.                                                  */
/*                                                                             */
/* Every one of these exists separately from the store methods for the reason  */
/* AGENTS.md spells out: React Compiler discards the dependency array a screen  */
/* writes and infers one from what the callback closes over, so a useMemo that  */
/* wraps a store *getter* closes over nothing reactive and freezes at mount.    */
/* A guide frozen at mount is a channel list stuck on whatever was on when the  */
/* app opened -- exactly the failure mode this feature would show worst.        */
/* -------------------------------------------------------------------------- */

/** What is on now and what is on next, at `atSec` (unix seconds). */
export function nowNext(
  entry: EpgEntry | undefined,
  atSec: number,
): { now?: Programme; next?: Programme } {
  const list = entry?.programmes ?? [];
  // Not `list[0]`: the server filters to programmes that have not finished, but
  // that filter ran when we fetched, which may have been ten minutes ago.
  const unfinished = list.filter((p) => p.stopSec > atSec);
  const current = unfinished.find((p) => p.startSec <= atSec);
  const upcoming = unfinished.find((p) => p.startSec > atSec);
  return { now: current, next: upcoming };
}

/** 0..1 through the programme, for the row's progress bar. */
export function programmeProgress(p: Programme, atSec: number): number {
  const span = p.stopSec - p.startSec;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (atSec - p.startSec) / span));
}

/**
 * Whether this is one of the server's filler programmes rather than real data.
 *
 * There is no flag for it on the wire. When a channel has no `tvg-id`, or the
 * guide has nothing for the one it has, xtream/epg.py `_placeholders` invents
 * fixed-length blocks titled after the channel itself -- so a title equal to
 * the channel name is the only signal available, and it is the one the server
 * deliberately makes reliable. Worth detecting: rendering "BBC One / on now:
 * BBC One" is noise, and a blank now/next reads honestly instead.
 */
export function isPlaceholder(p: Programme, channelName: string): boolean {
  return p.title.trim().toLowerCase() === channelName.trim().toLowerCase();
}

function isFresh(entry: EpgEntry | undefined, atMs: number): boolean {
  if (!entry) return false;
  if (atMs - entry.fetchedAt > TTL_MS) return false;
  // Nothing left that has not already ended: whatever we hold is spent.
  const atSec = Math.floor(atMs / 1000);
  return entry.programmes.some((p) => p.stopSec > atSec);
}

/* -------------------------------------------------------------------------- */

interface EpgState {
  byChannel: Record<number, EpgEntry>;
  /**
   * Fetch the guide for these channels if it is missing or stale.
   *
   * Safe to call on every render and every scroll: already-fresh and
   * already-in-flight channels are dropped before anything is requested.
   */
  ensure: (session: Session, channelIds: number[]) => void;
  clearAll: () => void;
}

/**
 * Requests currently open, and channels that answered with an error.
 *
 * Module-level rather than store state, for the same reason downloads.ts keeps
 * its transfer handles out of the store: nothing renders from either, and a set
 * that changed identity on every fetch would re-render every visible row.
 *
 * `failedAt` stops a channel the server cannot answer for from being retried on
 * every single scroll -- but it holds the *time* of the failure rather than
 * just the fact of it, and that distinction is load-bearing. A permanent mark
 * would be wrong in exactly the case most likely to happen: the first visit to
 * this screen can land while the tunnel is cold (AGENTS.md notes ~10s there,
 * against a 20s timeout), and a single timeout then would blank the guide for
 * those channels until the app was force-restarted, with nothing the user could
 * do about it. After the cooldown, scrolling past the row tries again.
 */
const inFlight = new Set<number>();
const failedAt = new Map<number, number>();

/** How long a channel that errored is left alone before it is worth re-asking. */
const RETRY_AFTER_MS = 2 * 60 * 1000;

export const useEpg = create<EpgState>((set, get) => ({
  byChannel: {},

  ensure: (session, channelIds) => {
    const now = Date.now();
    const { byChannel } = get();
    const wanted = channelIds.filter((id) => {
      if (inFlight.has(id)) return false;
      const lastFailure = failedAt.get(id);
      if (lastFailure !== undefined && now - lastFailure < RETRY_AFTER_MS) return false;
      return !isFresh(byChannel[id], now);
    });
    if (wanted.length === 0) return;

    // A hand-rolled worker pool rather than Promise.all: the point is the cap.
    // Each worker takes the next id off the shared queue until it runs dry, so
    // a 200-channel category still only ever has MAX_CONCURRENT open.
    const queue = [...wanted];
    for (const id of queue) inFlight.add(id);

    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined) return;
        try {
          const programmes = await getShortEpg(session, id, LISTINGS);
          failedAt.delete(id);
          set((s) => ({
            byChannel: { ...s.byChannel, [id]: { programmes, fetchedAt: Date.now() } },
          }));
        } catch (err) {
          // An expired or throttled account will fail for every channel at
          // once; there is no point walking the rest of the queue to find that
          // out 200 more times. Everything else is per-channel and just means
          // this row shows no guide.
          if (err instanceof AuthError) {
            for (const pending of queue.splice(0)) inFlight.delete(pending);
          } else {
            failedAt.set(id, Date.now());
          }
        } finally {
          inFlight.delete(id);
        }
      }
    };

    for (let i = 0; i < Math.min(MAX_CONCURRENT, wanted.length); i++) void worker();
  },

  clearAll: () => {
    inFlight.clear();
    failedAt.clear();
    set({ byChannel: {} });
  },
}));
