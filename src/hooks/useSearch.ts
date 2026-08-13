/**
 * Client-side search over the cached catalogue.
 *
 * There is no server-side search action, and `get_vod_streams` returns the
 * entire list regardless of what you ask for -- so a network round trip could
 * not do better than this even in principle. Everything stays in memory.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useCatalogue } from '@/store/catalogue';
import type { Channel, Movie, Series } from '@/types/domain';

const DEBOUNCE_MS = 250;

/** Fold accents and punctuation so "amelie" matches "Amélie". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Higher is better; 0 means no match. */
function score(haystack: string, needle: string): number {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return 0;
  if (idx === 0) return 3;
  // A match starting at a word boundary beats one buried mid-word.
  if (haystack[idx - 1] === ' ') return 2;
  return 1;
}

/**
 * Match against the cleaned display title *and* the raw server name, so both
 * "die hard" and "x265" find `Die Hard (1988) 1080p BluRay x265` -- the release
 * junk we strip for display is still useful to search on.
 */
function rank(displayName: string, rawName: string, needle: string): number {
  return Math.max(score(fold(displayName), needle), score(fold(rawName), needle));
}

export interface SearchResults {
  movies: Movie[];
  series: Series[];
  channels: Channel[];
  empty: boolean;
}

export function useSearch(query: string): SearchResults {
  const [debounced, setDebounced] = useState(query);
  const data = useCatalogue((s) => s.data);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const deferred = useDeferredValue(debounced);

  return useMemo(() => {
    const needle = fold(deferred);
    if (!needle || !data) {
      return { movies: [], series: [], channels: [], empty: !needle };
    }

    const movies = data.movies
      .map((m) => ({ item: m, s: rank(m.displayName, m.name, needle) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.item.displayName.localeCompare(b.item.displayName))
      .map((x) => x.item);

    const series = data.series
      .map((s) => ({ item: s, s: rank(s.displayName, s.name, needle) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.item.displayName.localeCompare(b.item.displayName))
      .map((x) => x.item);

    // A channel has one name and no release junk, so both arguments to rank()
    // are the same string -- there is no cleaned/raw distinction to exploit.
    const channels = data.channels
      .map((c) => ({ item: c, s: rank(c.name, c.name, needle) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name))
      .map((x) => x.item);

    return { movies, series, channels, empty: false };
  }, [deferred, data]);
}
