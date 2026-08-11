/**
 * Favourites. Ids only -- display data is resolved against the catalogue.
 *
 * Unlike progress, a favourite that no longer resolves is harmless: filter it
 * out of the view and keep the id, in case the title comes back.
 */

import { create } from 'zustand';
import { Keys, readJson, remove, writeJson } from './persist';

interface FavoritesFile {
  version: 1;
  movies: number[];
  series: number[];
}

interface FavoritesState {
  movies: Set<number>;
  series: Set<number>;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  isFavorite: (kind: 'movie' | 'series', id: number) => boolean;
  toggle: (kind: 'movie' | 'series', id: number) => void;
  clearAll: () => Promise<void>;
}

export const useFavorites = create<FavoritesState>((set, get) => {
  const persist = () =>
    void writeJson(Keys.favorites, {
      version: 1,
      movies: [...get().movies],
      series: [...get().series],
    } satisfies FavoritesFile);

  return {
    movies: new Set<number>(),
    series: new Set<number>(),
    hydrated: false,

    hydrate: async () => {
      const file = await readJson<FavoritesFile>(Keys.favorites);
      set({
        movies: new Set(file?.movies ?? []),
        series: new Set(file?.series ?? []),
        hydrated: true,
      });
    },

    // Set-backed so list renderers can check membership without scanning.
    isFavorite: (kind, id) =>
      kind === 'movie' ? get().movies.has(id) : get().series.has(id),

    toggle: (kind, id) => {
      set((s) => {
        const next = new Set(kind === 'movie' ? s.movies : s.series);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return kind === 'movie' ? { movies: next } : { series: next };
      });
      persist();
    },

    /** Erase, for the "Delete all app data" control. See src/store/wipe.ts. */
    clearAll: async () => {
      set({ movies: new Set<number>(), series: new Set<number>() });
      await remove(Keys.favorites);
    },
  };
});
