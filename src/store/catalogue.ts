/**
 * The movie and series catalogue, cached on disk.
 *
 * Refresh policy is built around the server's own caching: it keeps its R2
 * bucket scan for 300s with stale-while-revalidate (xtream/config.py SCAN_TTL),
 * so asking again sooner than that returns byte-identical data and just costs a
 * round trip. We match that TTL rather than inventing our own.
 */

import { create } from 'zustand';
import { getCatalogue } from '@/api/endpoints';
import { AuthError } from '@/api/errors';
import { Keys, readJson, writeJson } from './persist';
import type { Catalogue, Movie, Series, Session } from '@/types/domain';

/** Matches the server's SCAN_TTL: below this, a refetch cannot return new data. */
const SOFT_TTL_MS = 300_000;
/** Past this we refuse to render from cache without a refresh attempt. */
const HARD_TTL_MS = 24 * 60 * 60 * 1000;

interface CatalogueState {
  data: Catalogue | null;
  loading: boolean;
  /** Set when a refresh failed but we still have cached data to show. */
  error: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  refresh: (session: Session, opts?: { force?: boolean }) => Promise<void>;
  clear: () => Promise<void>;

  movieById: (id: number) => Movie | undefined;
  seriesById: (id: number) => Series | undefined;
  isStale: () => boolean;
}

export const useCatalogue = create<CatalogueState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  hydrated: false,

  /** Read the disk cache before any network call, so the UI is interactive
   *  immediately and browsing works with no connection at all. */
  hydrate: async () => {
    const cached = await readJson<Catalogue>(Keys.catalogue);
    const fresh = cached && Date.now() - cached.fetchedAt < HARD_TTL_MS;
    set({ data: fresh ? cached : null, hydrated: true });
  },

  isStale: () => {
    const { data } = get();
    return !data || Date.now() - data.fetchedAt > SOFT_TTL_MS;
  },

  refresh: async (session, opts = {}) => {
    const { loading, data } = get();
    if (loading) return;
    if (!opts.force && data && Date.now() - data.fetchedAt < SOFT_TTL_MS) return;

    set({ loading: true, error: null });
    try {
      const next = await getCatalogue(session);
      set({ data: next, loading: false, error: null });
      await writeJson(Keys.catalogue, next);
    } catch (err) {
      // Keep whatever we already had on screen. An empty catalogue rendered
      // over a good cache looks exactly like "your library was deleted".
      set({
        loading: false,
        error:
          err instanceof AuthError
            ? err.message
            : 'Could not refresh your library. Showing what was saved.',
      });
      if (err instanceof AuthError) throw err;
    }
  },

  clear: async () => {
    set({ data: null, error: null });
    await writeJson(Keys.catalogue, null);
  },

  movieById: (id) => get().data?.movies.find((m) => m.id === id),
  seriesById: (id) => get().data?.series.find((s) => s.id === id),
}));
