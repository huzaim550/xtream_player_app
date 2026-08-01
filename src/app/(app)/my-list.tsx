/**
 * My List: everything the user has saved.
 *
 * Favourites store ids only, so a saved id that no longer resolves against the
 * catalogue is filtered out of the view but *kept* in storage, in case the
 * title comes back after a rescan. That is the opposite of watch progress,
 * where the entry carries its own display data.
 *
 * Movies and series share one grid rather than sitting in separate rows: the
 * user saved *titles*, and splitting a short list in two makes it look emptier
 * than it is. The filter above is there for when the list gets long.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { useFavorites } from '@/store/favorites';
import { useProgress, movieKey } from '@/store/progress';
import { EmptyState } from '@/ui/EmptyState';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { PosterGrid } from '@/ui/PosterGrid';
import { Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

type Filter = 'all' | 'movies' | 'series';

export default function MyListScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const favMovies = useFavorites((s) => s.movies);
  const favSeries = useFavorites((s) => s.series);
  const toggle = useFavorites((s) => s.toggle);
  const entries = useProgress((s) => s.entries);
  const [filter, setFilter] = useState<Filter>('all');

  const movies = useMemo(
    () =>
      (data?.movies ?? [])
        .filter((m) => favMovies.has(m.id))
        .map((m) => {
          const p = entries[movieKey(m.id)];
          return {
            kind: 'movie' as const,
            id: m.id,
            key: `m-${m.id}`,
            title: m.displayName,
            posterUrl: m.posterUrl,
            qualityLabel: m.qualityLabel,
            watched: p?.finished,
            progress:
              p && !p.finished && p.durationSec > 0
                ? p.positionSec / p.durationSec
                : undefined,
          };
        }),
    [data, favMovies, entries],
  );

  const series = useMemo(
    () =>
      (data?.series ?? [])
        .filter((s) => favSeries.has(s.id))
        .map((s) => ({
          kind: 'series' as const,
          id: s.id,
          key: `s-${s.id}`,
          title: s.displayName,
          posterUrl: s.posterUrl,
          qualityLabel: null,
        })),
    [data, favSeries],
  );

  const items = useMemo(() => {
    if (filter === 'movies') return movies;
    if (filter === 'series') return series;
    return [...movies, ...series];
  }, [filter, movies, series]);

  const total = movies.length + series.length;

  if (total === 0) {
    return (
      <EmptyState
        icon="bookmark-outline"
        title="Your list is empty"
        body="Open any movie or show and choose My List to keep it here."
        actionLabel="Browse movies"
        onAction={() => router.navigate('/(app)/movies')}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.head}>
        <Text style={styles.title}>My List</Text>
        <Text style={styles.count}>
          {total} {total === 1 ? 'title' : 'titles'}
        </Text>
      </View>

      {/* Only worth showing once both kinds are actually in the list. */}
      {movies.length > 0 && series.length > 0 ? (
        <FocusSection style={styles.filters}>
          <FilterChip
            label={`All (${total})`}
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          <FilterChip
            label={`Movies (${movies.length})`}
            active={filter === 'movies'}
            onPress={() => setFilter('movies')}
          />
          <FilterChip
            label={`Series (${series.length})`}
            active={filter === 'series'}
            onPress={() => setFilter('series')}
          />
        </FocusSection>
      ) : null}

      <Text style={styles.hint}>Press and hold a title to remove it.</Text>

      <PosterGrid
        items={items}
        onSelect={(i) => {
          const it = items[i];
          router.push(it.kind === 'movie' ? `/movie/${it.id}` : `/series/${it.id}`);
        }}
        onLongPress={(i) => {
          const it = items[i];
          toggle(it.kind, it.id);
        }}
      />
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Focusable onPress={onPress} showFocusRing={false} style={styles.chipOuter}>
      {({ focused }) => (
        <View
          style={[styles.chip, active && styles.chipActive, focused && styles.chipFocused]}
        >
          <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: OVERSCAN.horizontal,
    paddingTop: OVERSCAN.vertical,
  },
  title: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  count: { color: Palette.textMuted, fontSize: Type.caption },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: OVERSCAN.horizontal,
    marginTop: 14,
  },
  chipOuter: { marginRight: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: Palette.brand },
  chipFocused: { borderColor: Palette.focus },
  chipText: { color: Palette.textSecondary, fontSize: Type.caption },
  chipTextActive: { color: Palette.text, fontWeight: '700' },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    paddingHorizontal: OVERSCAN.horizontal,
    marginTop: 12,
  },
});
